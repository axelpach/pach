import { eq, and } from 'drizzle-orm'
import { getDb } from '../../db.js'
import { companies, whatsappTemplates } from '../../../../db/schema.js'
import { getWhatsApp } from './client.js'

interface RemoteComponent {
  type: string
  format?: string
  text?: string
  example?: {
    header_handle?: string[]
    header_url?: string[]
  }
  buttons?: Array<Record<string, unknown>>
}

interface RemoteTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: RemoteComponent[]
}

function extractVariables(bodyText: string | undefined): string[] {
  if (!bodyText) return []
  const matches = bodyText.match(/\{\{\d+\}\}/g) || []
  return Array.from(new Set(matches))
}

function pickComponent(components: RemoteComponent[] | undefined, type: string): RemoteComponent | undefined {
  return components?.find(c => c.type?.toUpperCase() === type)
}

export interface SyncResult {
  total: number
  created: number
  updated: number
  unchanged: number
  companyId: string
}

export async function syncTemplates(projectId: string): Promise<SyncResult> {
  const db = getDb()

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.project, projectId))
    .limit(1)
  if (!company) throw new Error(`No company found with project=${projectId}`)

  const { client, wabaId } = getWhatsApp(projectId)

  const remote: RemoteTemplate[] = []
  let after: string | undefined
  while (true) {
    const response = (await client.templates.list({
      businessAccountId: wabaId,
      limit: 100,
      ...(after ? { after } : {}),
    })) as { data: RemoteTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }
    remote.push(...response.data)
    const nextCursor = response.paging?.cursors?.after
    if (!nextCursor || !response.paging?.next) break
    after = nextCursor
  }

  let created = 0
  let updated = 0
  let unchanged = 0
  const now = new Date()

  for (const t of remote) {
    const header = pickComponent(t.components, 'HEADER')
    const body = pickComponent(t.components, 'BODY')
    const footer = pickComponent(t.components, 'FOOTER')
    const headerSampleUrl = header?.example?.header_url?.[0] ?? header?.example?.header_handle?.[0]

    const row = {
      companyId: company.id,
      metaId: t.id,
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      headerFormat: header?.format ?? null,
      headerText: header?.text ?? null,
      headerSampleUrl: headerSampleUrl ?? null,
      bodyText: body?.text ?? null,
      footerText: footer?.text ?? null,
      components: (t.components ?? []) as unknown[],
      variables: extractVariables(body?.text),
      lastSyncedAt: now,
      updatedAt: now,
    }

    const [existing] = await db
      .select({ id: whatsappTemplates.id, metaId: whatsappTemplates.metaId, status: whatsappTemplates.status, bodyText: whatsappTemplates.bodyText })
      .from(whatsappTemplates)
      .where(and(
        eq(whatsappTemplates.companyId, company.id),
        eq(whatsappTemplates.name, t.name),
        eq(whatsappTemplates.language, t.language),
      ))
      .limit(1)

    if (!existing) {
      await db.insert(whatsappTemplates).values(row)
      created++
    } else {
      const changed = existing.metaId !== row.metaId || existing.status !== row.status || existing.bodyText !== row.bodyText
      await db.update(whatsappTemplates).set(row).where(eq(whatsappTemplates.id, existing.id))
      if (changed) updated++
      else unchanged++
    }
  }

  return { total: remote.length, created, updated, unchanged, companyId: company.id }
}
