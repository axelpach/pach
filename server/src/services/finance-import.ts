import { createHash } from 'node:crypto'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { getDb } from '../db.js'
import {
  finAccounts,
  finCategories,
  finCategorizationRules,
  finImportItems,
  finImports,
  finMovements,
} from '../../../db/schema.js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const FINANCE_STATEMENT_TOOL_NAME = 'record_finance_statement'
const MAX_IMPORT_BYTES = 10 * 1024 * 1024

type SourceType = 'statement_csv' | 'statement_pdf' | 'screenshot' | 'manual_csv'

export type FinanceImportInput = {
  organizationId: string
  accountId: string
  userId: string
  batchId?: string | null
  fileName: string
  fileType: string
  sourceType: SourceType
  contentBase64: string
}

type ParsedMovement = {
  /** YYYY-MM-DD if only the date is visible; ISO-like datetime if the statement includes time. */
  transactionDate: string
  postedDate?: string | null
  description: string
  merchantName?: string | null
  amount: number
  currencyCode?: string | null
  type?: 'income' | 'expense' | 'transfer' | 'adjustment' | null
  categoryName?: string | null
  confidence?: number | null
}

type ParsedStatement = {
  statementStartDate?: string | null
  statementEndDate?: string | null
  detectedCurrencyCode?: string | null
  detectedInstitution?: string | null
  detectedAccountHint?: string | null
  transactions: ParsedMovement[]
}

type AnthropicContentBlock = {
  type?: string
  text?: string
  name?: string
  input?: unknown
}

const FINANCE_STATEMENT_TOOL = {
  name: FINANCE_STATEMENT_TOOL_NAME,
  description: 'Record the extracted bank or credit card statement movements.',
  input_schema: {
    type: 'object',
    properties: {
      statementStartDate: { type: 'string', description: 'Statement start date in YYYY-MM-DD. Omit if unknown.' },
      statementEndDate: { type: 'string', description: 'Statement end date in YYYY-MM-DD. Omit if unknown.' },
      detectedCurrencyCode: { type: 'string', description: 'Detected currency code such as MXN, USD, or EUR. Omit if unknown.' },
      detectedInstitution: { type: 'string', description: 'Detected bank or card issuer. Omit if unknown.' },
      detectedAccountHint: { type: 'string', description: 'Visible account hint or last digits. Omit if unknown.' },
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            transactionDate: { type: 'string', description: 'Transaction date/time. Use YYYY-MM-DD if only the date is visible; use an ISO 8601 datetime if hour/minute is visible.' },
            postedDate: { type: 'string', description: 'Posted date/time. Use YYYY-MM-DD if only the date is visible; use an ISO 8601 datetime if hour/minute is visible. Omit if unknown.' },
            description: { type: 'string', description: 'Useful raw movement description.' },
            merchantName: { type: 'string', description: 'Normalized merchant or counterparty. Omit if unknown.' },
            amount: { type: 'number', description: 'Signed amount from this account perspective.' },
            currencyCode: { type: 'string', description: 'Currency code. Omit if unknown.' },
            type: { type: 'string', enum: ['income', 'expense', 'transfer', 'adjustment'] },
            categoryName: { type: 'string', description: 'Existing category name only when one clearly fits. Omit if unknown or if no existing category fits.' },
            confidence: { type: 'number', description: 'Extraction/category confidence from 0 to 100. Omit if unknown.' },
          },
          required: ['transactionDate', 'description', 'amount'],
        },
      },
    },
    required: ['transactions'],
  },
}

export async function importFinanceMovements(input: FinanceImportInput) {
  const db = getDb()
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, input.accountId), eq(finAccounts.organizationId, input.organizationId)))
    .limit(1)

  if (!account) {
    return { error: 'NOT_FOUND' as const, message: 'Account not found for this organization.' }
  }

  const bytes = Buffer.from(input.contentBase64, 'base64')
  if (bytes.length === 0) {
    return { error: 'VALIDATION' as const, message: 'The uploaded file is empty.' }
  }
  if (bytes.length > MAX_IMPORT_BYTES) {
    return { error: 'VALIDATION' as const, message: 'The uploaded file is too large. Finance imports are limited to 10 MB.' }
  }

  const fileSha256 = sha256(bytes)
  const [existingImport] = await db
    .select()
    .from(finImports)
    .where(and(eq(finImports.accountId, input.accountId), eq(finImports.fileSha256, fileSha256)))
    .limit(1)

  if (existingImport && ['ready', 'partially_applied', 'applied'].includes(existingImport.status)) {
    const reviewBatchId = input.batchId && ['ready', 'partially_applied'].includes(existingImport.status)
      ? input.batchId
      : existingImport.batchId ?? existingImport.id
    if (reviewBatchId !== (existingImport.batchId ?? existingImport.id) && ['ready', 'partially_applied'].includes(existingImport.status)) {
      await db
        .update(finImports)
        .set({ batchId: reviewBatchId, updatedAt: new Date() })
        .where(eq(finImports.id, existingImport.id))
    }
    return {
      importId: existingImport.id,
      batchId: reviewBatchId,
      duplicateFile: true,
      summary: {
        parsed: existingImport.itemsParsed,
        created: 0,
        ready: existingImport.itemsReady,
        duplicates: existingImport.itemsDuplicate,
        needsReview: existingImport.itemsNeedingReview,
      },
    }
  }

  const [importRow] = await db
    .insert(finImports)
    .values({
      organizationId: input.organizationId,
      accountId: input.accountId,
      createdByUserId: input.userId,
      batchId: input.batchId ?? null,
      status: 'parsing',
      sourceType: input.sourceType,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSha256,
    })
    .returning()

  try {
    const categories = await loadCategoryMap(input.organizationId)
    const parsed = await parseWithHaiku({
      sourceType: input.sourceType,
      fileName: input.fileName,
      fileType: input.fileType,
      contentBase64: input.contentBase64,
      accountCurrencyCode: account.currencyCode,
      existingCategoryNames: existingCategoryNames(categories),
    })

    const rules = await db
      .select()
      .from(finCategorizationRules)
      .where(
        and(
          eq(finCategorizationRules.organizationId, input.organizationId),
          or(eq(finCategorizationRules.accountId, input.accountId), isNull(finCategorizationRules.accountId)),
          eq(finCategorizationRules.autoApply, true),
        ),
      )

    let duplicates = 0
    let needsReview = 0
    let ready = 0

    for (const tx of parsed.transactions) {
      const normalized = normalizeParsedMovement(tx, account.currencyCode)
      if (!normalized) continue

      const fingerprint = buildMovementFingerprint({
        accountId: input.accountId,
        transactionDate: normalized.transactionDateExact,
        amountMinor: normalized.amountMinor,
        description: normalized.description,
      })

      const [existingMovement] = await db
        .select({ id: finMovements.id })
        .from(finMovements)
        .where(and(eq(finMovements.accountId, input.accountId), eq(finMovements.fingerprint, fingerprint)))
        .limit(1)

      const rule = findMatchingRule(rules, normalized.description, normalized.merchantName, normalized.amountMinor)
      const suggestedType = rule?.type ?? normalized.type ?? inferType(normalized.amountMinor)
      let categoryId = rule?.categoryId ?? null

      if (!categoryId && normalized.categoryName) {
        categoryId = findExistingCategoryId(categories, normalized.categoryName)
      }

      const confident = Boolean(categoryId) && (rule || (normalized.confidence ?? 0) >= 70)
      const itemStatus = existingMovement ? 'duplicate' : confident ? 'parsed' : 'needs_review'

      await db
        .insert(finImportItems)
        .values({
          organizationId: input.organizationId,
          importId: importRow.id,
          accountId: input.accountId,
          status: itemStatus,
          transactionDate: normalized.transactionDate,
          postedDate: normalized.postedDate,
          description: normalized.description,
          merchantName: normalized.merchantName,
          amountMinor: normalized.amountMinor,
          currencyCode: normalized.currencyCode,
          suggestedType,
          suggestedCategoryId: categoryId,
          suggestedConfidence: rule ? rule.confidence : normalized.confidence,
          duplicateMovementId: existingMovement?.id,
          fingerprint,
          rawData: normalized.rawData,
        })

      if (existingMovement) {
        duplicates += 1
      } else if (confident) {
        ready += 1
      } else {
        needsReview += 1
      }
    }

    await db
      .update(finImports)
      .set({
        status: 'ready',
        statementStartDate: parsed.statementStartDate ?? null,
        statementEndDate: parsed.statementEndDate ?? null,
        detectedCurrencyCode: parsed.detectedCurrencyCode ?? account.currencyCode,
        detectedInstitution: parsed.detectedInstitution ?? account.institutionName,
        detectedAccountHint: parsed.detectedAccountHint ?? null,
        itemsParsed: parsed.transactions.length,
        itemsReady: ready,
        itemsDuplicate: duplicates,
        itemsNeedingReview: needsReview,
        rawSummary: {
          model: HAIKU_MODEL,
          created: 0,
          ready,
          duplicates,
          needsReview,
        },
        updatedAt: new Date(),
      })
      .where(eq(finImports.id, importRow.id))

    return {
      importId: importRow.id,
      batchId: importRow.batchId ?? importRow.id,
      duplicateFile: false,
      summary: {
        parsed: parsed.transactions.length,
        created: 0,
        ready,
        duplicates,
        needsReview,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(finImports)
      .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
      .where(eq(finImports.id, importRow.id))
    return { error: 'PARSE_FAILED' as const, message, importId: importRow.id }
  }
}

export async function applyFinanceImport(importId: string) {
  const db = getDb()
  const [importRow] = await db.select().from(finImports).where(eq(finImports.id, importId)).limit(1)
  if (!importRow) return { error: 'NOT_FOUND' as const, message: 'Import not found.' }
  if (importRow.status === 'applied') {
    return {
      import: importRow,
      summary: {
        created: 0,
        skipped: 0,
        remainingReview: 0,
        duplicates: importRow.itemsDuplicate,
      },
    }
  }

  const items = await db
    .select()
    .from(finImportItems)
    .where(and(eq(finImportItems.importId, importId), inArray(finImportItems.status, ['parsed', 'needs_review'])))

  let created = 0
  let skipped = 0

  for (const item of items) {
    const exactDate = typeof item.rawData?.transactionDateExact === 'string'
      ? item.rawData.transactionDateExact
      : formatDateForFingerprint(item.transactionDate)
    const fingerprint = buildMovementFingerprint({
      accountId: item.accountId,
      transactionDate: exactDate,
      amountMinor: item.amountMinor,
      description: item.description,
    })
    const [existingMovement] = await db
      .select({ id: finMovements.id })
      .from(finMovements)
      .where(and(eq(finMovements.accountId, item.accountId), eq(finMovements.fingerprint, fingerprint)))
      .limit(1)

    if (existingMovement) {
      await db
        .update(finImportItems)
        .set({ status: 'duplicate', duplicateMovementId: existingMovement.id, fingerprint, updatedAt: new Date() })
        .where(eq(finImportItems.id, item.id))
      skipped += 1
      continue
    }

    const movementType = item.suggestedType || inferType(item.amountMinor)
    const movementStatus = item.status === 'needs_review' ? 'pending_review' : item.suggestedCategoryId ? 'reviewed' : 'pending_review'
    await db.insert(finMovements).values({
      organizationId: item.organizationId,
      accountId: item.accountId,
      categoryId: item.suggestedCategoryId,
      importId: item.importId,
      sourceItemId: item.id,
      transactionDate: item.transactionDate,
      postedDate: item.postedDate,
      description: item.description,
      merchantName: item.merchantName,
      amountMinor: item.amountMinor,
      currencyCode: item.currencyCode,
      reportingAmountMinor: item.amountMinor,
      reportingCurrencyCode: item.currencyCode,
      type: movementType,
      status: movementStatus,
      reviewReason: movementStatus === 'pending_review' ? 'uncategorized' : null,
      fingerprint,
      rawData: item.rawData,
    })
    await db
      .update(finImportItems)
      .set({ status: 'applied', fingerprint, updatedAt: new Date() })
      .where(eq(finImportItems.id, item.id))
    if (item.status === 'parsed' && item.suggestedCategoryId) {
      await learnRuleFromImportItem(item, item.suggestedCategoryId, movementType)
    }
    created += 1
  }

  const counts = await countImportItems(importId)
  const nextStatus = counts.pending === 0 ? 'applied' : created > 0 ? 'partially_applied' : 'ready'
  const [updatedImport] = await db
    .update(finImports)
    .set({
      status: nextStatus,
      itemsReady: counts.ready,
      itemsDuplicate: counts.duplicate,
      itemsNeedingReview: counts.needsReview,
      updatedAt: new Date(),
      appliedAt: nextStatus === 'applied' ? new Date() : importRow.appliedAt,
    })
    .where(eq(finImports.id, importId))
    .returning()

  return {
    import: updatedImport,
    summary: {
      created,
      skipped,
      remainingReview: counts.needsReview,
      duplicates: counts.duplicate,
    },
  }
}

export async function applyFinanceImportBatch(batchId: string) {
  const db = getDb()
  const batchImports = await db
    .select()
    .from(finImports)
    .where(and(eq(finImports.batchId, batchId), inArray(finImports.status, ['ready', 'partially_applied', 'applied'])))

  if (batchImports.length === 0) return { error: 'NOT_FOUND' as const, message: 'Import batch not found.' }

  let created = 0
  let skipped = 0
  let remainingReview = 0
  let duplicates = 0
  const updatedImports = []

  for (const entry of batchImports) {
    const result = await applyFinanceImport(entry.id)
    if ('error' in result) return result
    updatedImports.push(result.import)
    created += result.summary.created
    skipped += result.summary.skipped
    remainingReview += result.summary.remainingReview
    duplicates += result.summary.duplicates
  }

  return {
    imports: updatedImports,
    summary: {
      created,
      skipped,
      remainingReview,
      duplicates,
    },
  }
}

async function parseWithHaiku(input: {
  sourceType: SourceType
  fileName: string
  fileType: string
  contentBase64: string
  accountCurrencyCode: string
  existingCategoryNames: string[]
}): Promise<ParsedStatement> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.')
  }

  const content = buildAnthropicContent(input)
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 8192,
      temperature: 0,
      system:
        `You extract bank and credit card movements for a finance ledger. Use the provided tool to return structured data. Amounts must be signed: income/deposits positive, expenses/card purchases negative, transfers may be positive or negative as shown by the source account. If a movement date does not show a year, use ${new Date().getFullYear()} as the year.`,
      tools: [FINANCE_STATEMENT_TOOL],
      tool_choice: { type: 'tool', name: FINANCE_STATEMENT_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    }),
  })

  const payload = await response.json() as { content?: AnthropicContentBlock[]; error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic request failed with ${response.status}`)
  }

  const toolInput = payload.content?.find((part) => part.type === 'tool_use' && part.name === FINANCE_STATEMENT_TOOL_NAME)?.input
  if (toolInput) return parseToolResponse(toolInput)

  const text = payload.content?.map((part) => part.text ?? '').join('\n') ?? ''
  return parseJsonResponse(text)
}

function buildAnthropicContent(input: {
  sourceType: SourceType
  fileName: string
  fileType: string
  contentBase64: string
  accountCurrencyCode: string
  existingCategoryNames: string[]
}) {
  const currentYear = new Date().getFullYear()
  const categoryInstructions = input.existingCategoryNames.length > 0
    ? `\n\nExisting categories you may use exactly when they fit: ${input.existingCategoryNames.join(', ')}.\nIf none of these categories clearly fit a movement, omit categoryName. Do not invent or translate new category names.`
    : '\n\nNo existing categories were provided. Omit categoryName for every movement.'
  const prompt = `Extract all financial movements from ${input.fileName}.

Use the ${FINANCE_STATEMENT_TOOL_NAME} tool with every movement you can read.

Do not invent movements. Preserve transaction dates. If a visible movement date does not include a year, return it using ${currentYear} as the year. If the document has both charges and payments, sign each movement from this account's perspective.${categoryInstructions}`

  const base = [{ type: 'text', text: prompt }]
  if (input.fileType.startsWith('image/')) {
    return [
      ...base,
      {
        type: 'image',
        source: { type: 'base64', media_type: input.fileType, data: input.contentBase64 },
      },
    ]
  }

  if (input.fileType === 'application/pdf') {
    return [
      ...base,
      {
        type: 'document',
        source: { type: 'base64', media_type: input.fileType, data: input.contentBase64 },
      },
    ]
  }

  const decoded = Buffer.from(input.contentBase64, 'base64').toString('utf-8')
  return [...base, { type: 'text', text: decoded.slice(0, 120_000) }]
}

function parseJsonResponse(text: string): ParsedStatement {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Haiku did not return JSON.')
  }
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as ParsedStatement
  if (!Array.isArray(parsed.transactions)) {
    throw new Error('Parsed response did not include transactions.')
  }
  return parsed
}

function parseToolResponse(input: unknown): ParsedStatement {
  if (!input || typeof input !== 'object') {
    throw new Error('Haiku did not return structured statement data.')
  }
  const parsed = input as ParsedStatement
  if (!Array.isArray(parsed.transactions)) {
    throw new Error('Parsed response did not include transactions.')
  }
  return parsed
}

function normalizeParsedMovement(tx: ParsedMovement, fallbackCurrency: string) {
  const currentYear = new Date().getFullYear()
  const transactionDate = normalizeSourceDate(tx.transactionDate, currentYear)
  const postedDate = tx.postedDate ? normalizeSourceDate(tx.postedDate, currentYear) : null
  if (!transactionDate || !tx.description || typeof tx.amount !== 'number') return null
  const currencyCode = (tx.currencyCode || fallbackCurrency).trim().toUpperCase()
  return {
    transactionDate: transactionDate.date,
    transactionDateExact: transactionDate.exact,
    postedDate: postedDate?.date ?? null,
    description: tx.description.trim(),
    merchantName: tx.merchantName?.trim() || null,
    amountMinor: Math.round(tx.amount * 100),
    currencyCode,
    type: tx.type || null,
    categoryName: tx.categoryName?.trim() || null,
    confidence: typeof tx.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(tx.confidence))) : null,
    rawData: {
      ...(tx as unknown as Record<string, unknown>),
      transactionDateExact: transactionDate.exact,
      postedDateExact: postedDate?.exact ?? null,
    },
  }
}

async function loadCategoryMap(organizationId: string) {
  const rows = await getDb()
    .select()
    .from(finCategories)
    .where(eq(finCategories.organizationId, organizationId))
  const categories = rows.filter((category) => !category.archived)
  const map = new Map<string, typeof finCategories.$inferSelect>()
  for (const category of categories) {
    for (const key of categoryLookupKeys(category.name)) {
      if (!map.has(key)) map.set(key, category)
    }
  }
  return map
}

function existingCategoryNames(categories: Map<string, typeof finCategories.$inferSelect>) {
  return Array.from(new Map(Array.from(categories.values()).map((category) => [category.id, category.name])).values())
}

function findExistingCategoryId(categories: Map<string, typeof finCategories.$inferSelect>, suggestedName: string) {
  for (const key of categoryLookupKeys(suggestedName)) {
    const category = categories.get(key)
    if (category) return category.id
  }
  return null
}

async function countImportItems(importId: string) {
  const rows = await getDb().select().from(finImportItems).where(eq(finImportItems.importId, importId))
  return {
    ready: rows.filter((item) => item.status === 'parsed').length,
    needsReview: rows.filter((item) => item.status === 'needs_review').length,
    duplicate: rows.filter((item) => item.status === 'duplicate').length,
    pending: rows.filter((item) => item.status === 'parsed' || item.status === 'needs_review').length,
  }
}

async function learnRuleFromImportItem(
  item: typeof finImportItems.$inferSelect,
  categoryId: string,
  type: string,
) {
  const match = buildRuleMatch({
    description: item.description,
    merchantName: item.merchantName,
  })
  if (!match) return
  const db = getDb()
  const [existingRule] = await db
    .select()
    .from(finCategorizationRules)
    .where(
      and(
        eq(finCategorizationRules.organizationId, item.organizationId),
        eq(finCategorizationRules.accountId, item.accountId),
        eq(finCategorizationRules.matchKind, match.kind),
        eq(finCategorizationRules.matchValue, match.value),
      ),
    )
    .limit(1)

  if (existingRule) {
    await db
      .update(finCategorizationRules)
      .set({ categoryId, type: categoryType(type), confidence: 95, autoApply: true, updatedAt: new Date() })
      .where(eq(finCategorizationRules.id, existingRule.id))
    return
  }

  await db.insert(finCategorizationRules).values({
    organizationId: item.organizationId,
    accountId: item.accountId,
    categoryId,
    type: categoryType(type),
    matchKind: match.kind,
    matchValue: match.value,
    confidence: 95,
    autoApply: true,
  })
}

function findMatchingRule(
  rules: Array<typeof finCategorizationRules.$inferSelect>,
  description: string,
  merchantName: string | null,
  amountMinor: number,
) {
  const haystack = `${description} ${merchantName ?? ''}`.toLowerCase()
  return rules.find((rule) => {
    const value = rule.matchValue.toLowerCase()
    if (rule.matchKind === 'exact') return haystack.trim() === value
    if (rule.matchKind === 'merchant') return (merchantName ?? '').toLowerCase().includes(value)
    if (rule.matchKind === 'amount_recurring') return rule.amountMinor === Math.abs(amountMinor)
    if (rule.matchKind === 'regex') {
      try {
        return new RegExp(rule.matchValue, 'i').test(haystack)
      } catch {
        return false
      }
    }
    return haystack.includes(value)
  })
}

function buildRuleMatch(input: { description: string; merchantName?: string | null }) {
  const merchant = input.merchantName?.trim()
  if (merchant && merchant.length >= 3) return { kind: 'merchant', value: normalizeRuleValue(merchant) }
  const description = input.description.trim()
  if (description.length < 3) return null
  return { kind: 'contains', value: normalizeRuleValue(description) }
}

function normalizeRuleValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)
}

function categoryLookupKeys(value: string) {
  const normalized = normalizeCategoryLookupName(value)
  const keys = new Set<string>([normalized])
  if (normalized.endsWith('iones') && normalized.length > 6) {
    keys.add(`${normalized.slice(0, -5)}ion`)
  }
  if (normalized.endsWith('es') && normalized.length > 5) {
    keys.add(normalized.slice(0, -2))
  }
  if (normalized.endsWith('s') && normalized.length > 4) {
    keys.add(normalized.slice(0, -1))
  }
  return Array.from(keys).filter(Boolean)
}

function normalizeCategoryLookupName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferType(amountMinor: number) {
  return amountMinor >= 0 ? 'income' : 'expense'
}

function categoryType(type: string) {
  return ['income', 'expense', 'transfer', 'adjustment'].includes(type) ? type : 'expense'
}

function buildMovementFingerprint(input: {
  accountId: string
  transactionDate: string
  amountMinor: number
  description: string
}) {
  return sha256(`${input.accountId}|${input.transactionDate}|${input.amountMinor}|${normalizeText(input.description)}`)
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function formatDateForFingerprint(value: string | Date | number) {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return new Date(value).toISOString().slice(0, 10)
}

function normalizeSourceDate(value: unknown, defaultYear = new Date().getFullYear()) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/)
  if (match) {
    const [, date, minutes, seconds] = match
    if (!minutes) return { date, exact: date }
    return { date, exact: `${date}T${minutes}${seconds ? `:${seconds}` : ''}` }
  }

  const yearlessDate = normalizeYearlessDate(trimmed, defaultYear)
  if (yearlessDate) return { date: yearlessDate, exact: yearlessDate }

  return null
}

function normalizeYearlessDate(value: string, defaultYear: number) {
  const normalized = removeDiacritics(value)
    .toLowerCase()
    .replace(/[,.\s]+/g, ' ')
    .trim()
  const monthNames = new Map([
    ['enero', 1],
    ['ene', 1],
    ['january', 1],
    ['jan', 1],
    ['febrero', 2],
    ['feb', 2],
    ['february', 2],
    ['marzo', 3],
    ['mar', 3],
    ['march', 3],
    ['abril', 4],
    ['abr', 4],
    ['april', 4],
    ['apr', 4],
    ['mayo', 5],
    ['may', 5],
    ['junio', 6],
    ['jun', 6],
    ['june', 6],
    ['julio', 7],
    ['jul', 7],
    ['july', 7],
    ['agosto', 8],
    ['ago', 8],
    ['august', 8],
    ['aug', 8],
    ['septiembre', 9],
    ['setiembre', 9],
    ['sep', 9],
    ['sept', 9],
    ['september', 9],
    ['octubre', 10],
    ['oct', 10],
    ['october', 10],
    ['noviembre', 11],
    ['nov', 11],
    ['november', 11],
    ['diciembre', 12],
    ['dic', 12],
    ['december', 12],
    ['dec', 12],
  ])

  const monthFirst = normalized.match(/^([a-z]+)\s+(\d{1,2})$/)
  if (monthFirst) {
    const month = monthNames.get(monthFirst[1])
    const day = Number(monthFirst[2])
    if (month && isValidMonthDay(month, day)) return formatYmd(defaultYear, month, day)
  }

  const dayFirst = normalized.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)$/)
  if (dayFirst) {
    const day = Number(dayFirst[1])
    const month = monthNames.get(dayFirst[2])
    if (month && isValidMonthDay(month, day)) return formatYmd(defaultYear, month, day)
  }

  return null
}

function removeDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isValidMonthDay(month: number, day: number) {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31
}

function formatYmd(year: number, month: number, day: number) {
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null
  return date
}
