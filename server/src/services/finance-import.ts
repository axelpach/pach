import { createHash } from 'node:crypto'
import { and, eq, isNull, or } from 'drizzle-orm'
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
            categoryName: { type: 'string', description: 'Short Spanish category suggestion. Omit if unknown.' },
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

  if (existingImport?.status === 'applied' || existingImport?.status === 'ready') {
    return {
      importId: existingImport.id,
      duplicateFile: true,
      summary: {
        parsed: existingImport.itemsParsed,
        created: 0,
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
      status: 'parsing',
      sourceType: input.sourceType,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSha256,
    })
    .returning()

  try {
    const parsed = await parseWithHaiku({
      sourceType: input.sourceType,
      fileName: input.fileName,
      fileType: input.fileType,
      contentBase64: input.contentBase64,
      accountCurrencyCode: account.currencyCode,
    })

    const categories = await loadCategoryMap(input.organizationId)
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

    let created = 0
    let duplicates = 0
    let needsReview = 0

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
      let categoryName = normalized.categoryName

      if (!categoryId && categoryName) {
        categoryId = await ensureCategory(input.organizationId, categoryName, suggestedType, categories)
      }

      const confident = Boolean(categoryId) && (rule || (normalized.confidence ?? 0) >= 70)
      const itemStatus = existingMovement ? 'duplicate' : confident ? 'parsed' : 'needs_review'

      const [item] = await db
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
        .returning()

      if (existingMovement) {
        duplicates += 1
        continue
      }

      const movementStatus = confident ? 'reviewed' : 'pending_review'
      if (!confident) needsReview += 1

      await db.insert(finMovements).values({
        organizationId: input.organizationId,
        accountId: input.accountId,
        categoryId,
        importId: importRow.id,
        sourceItemId: item.id,
        transactionDate: normalized.transactionDate,
        postedDate: normalized.postedDate,
        description: normalized.description,
        merchantName: normalized.merchantName,
        amountMinor: normalized.amountMinor,
        currencyCode: normalized.currencyCode,
        reportingAmountMinor: normalized.amountMinor,
        reportingCurrencyCode: normalized.currencyCode,
        type: suggestedType,
        status: movementStatus,
        reviewReason: movementStatus === 'pending_review' ? 'uncategorized' : null,
        fingerprint,
        rawData: normalized.rawData,
      })
      created += 1
    }

    await db
      .update(finImports)
      .set({
        status: 'applied',
        statementStartDate: parsed.statementStartDate ?? null,
        statementEndDate: parsed.statementEndDate ?? null,
        detectedCurrencyCode: parsed.detectedCurrencyCode ?? account.currencyCode,
        detectedInstitution: parsed.detectedInstitution ?? account.institutionName,
        detectedAccountHint: parsed.detectedAccountHint ?? null,
        itemsParsed: parsed.transactions.length,
        itemsReady: created - needsReview,
        itemsDuplicate: duplicates,
        itemsNeedingReview: needsReview,
        rawSummary: {
          model: HAIKU_MODEL,
          created,
          duplicates,
          needsReview,
        },
        updatedAt: new Date(),
        appliedAt: new Date(),
      })
      .where(eq(finImports.id, importRow.id))

    return {
      importId: importRow.id,
      duplicateFile: false,
      summary: {
        parsed: parsed.transactions.length,
        created,
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

async function parseWithHaiku(input: {
  sourceType: SourceType
  fileName: string
  fileType: string
  contentBase64: string
  accountCurrencyCode: string
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
        'You extract bank and credit card movements for a finance ledger. Use the provided tool to return structured data. Amounts must be signed: income/deposits positive, expenses/card purchases negative, transfers may be positive or negative as shown by the source account.',
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
}) {
  const prompt = `Extract all financial movements from ${input.fileName}.

Use the ${FINANCE_STATEMENT_TOOL_NAME} tool with every movement you can read.

Do not invent movements. Preserve transaction dates. If the document has both charges and payments, sign each movement from this account's perspective.`

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
  const transactionDate = normalizeSourceDate(tx.transactionDate)
  const postedDate = tx.postedDate ? normalizeSourceDate(tx.postedDate) : null
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
  return new Map(rows.map((category) => [category.name.trim().toLowerCase(), category]))
}

async function ensureCategory(
  organizationId: string,
  name: string,
  type: string,
  cache: Map<string, typeof finCategories.$inferSelect>,
) {
  const normalizedName = name.trim()
  const key = normalizedName.toLowerCase()
  const existing = cache.get(key)
  if (existing) return existing.id

  const [created] = await getDb()
    .insert(finCategories)
    .values({ organizationId, name: normalizedName, type: categoryType(type) })
    .onConflictDoNothing()
    .returning()

  if (created) {
    cache.set(key, created)
    return created.id
  }

  const [row] = await getDb()
    .select()
    .from(finCategories)
    .where(and(eq(finCategories.organizationId, organizationId), eq(finCategories.name, normalizedName)))
    .limit(1)
  if (row) {
    cache.set(key, row)
    return row.id
  }
  return null
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

function normalizeSourceDate(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/)
  if (!match) return null
  const [, date, minutes, seconds] = match
  if (!minutes) return { date, exact: date }
  return { date, exact: `${date}T${minutes}${seconds ? `:${seconds}` : ''}` }
}
