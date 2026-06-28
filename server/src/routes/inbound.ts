import { Router } from 'express'
import { and, desc, eq, or } from 'drizzle-orm'
import { getDb } from '../db.js'
import { insertIssueActivityEvent } from '../lib/activity-events.js'
import {
  activityEvents,
  organizations,
  crmCompanies,
  crmContacts,
  crmDealContacts,
  crmDeals,
  crmNotes,
  pmIssues,
  pmProjects,
  pmStatuses,
  pmTeams,
  users,
} from '../../../db/schema.js'

type LeadPayload = {
  name?: unknown
  email?: unknown
  phone?: unknown
  company?: unknown
  city?: unknown
  role?: unknown
  interest?: unknown
  message?: unknown
  source?: unknown
  contextCompany?: unknown
  sourceCompany?: unknown
  pageUrl?: unknown
  referrer?: unknown
  metadata?: unknown
}

const router = Router()

router.post('/ardia/lead', async (req, res) => {
  if (!isAuthorizedArdiaRequest(req.headers.authorization)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  const payload = normalizeLeadPayload(req.body)
  if (!isValidLeadPayload(payload)) {
    res.status(400).json({ ok: false, error: 'name and either email or phone are required' })
    return
  }

  try {
    const db = getDb()
    const result = await db.transaction(async (tx) => {
      const now = new Date()
      const contextCompany = await findOrCreateContextCompany(tx, payload.contextCompany, now)
      const crmCompany = payload.company ? await findOrCreateCrmCompany(tx, payload, contextCompany.id, now) : null
      const contact = await findOrCreateCrmContact(tx, payload, contextCompany.id, crmCompany?.id, now)
      const deal = await createProspectDeal(tx, payload, contextCompany.id, crmCompany?.id, now)

      await tx.insert(crmDealContacts).values({
        id: crypto.randomUUID(),
        organizationId: contextCompany.id,
        dealId: deal.id,
        contactId: contact.id,
        createdAt: now,
      })

      await tx.insert(crmNotes).values({
        id: crypto.randomUUID(),
        organizationId: contextCompany.id,
        dealId: deal.id,
        contactId: contact.id,
        body: buildLeadNote(payload),
        type: 'manual',
        createdAt: now,
      })

      const issue = await createLeadIssue(tx, {
        payload,
        contextCompanyId: contextCompany.id,
        now,
      })

      return {
        contactId: contact.id,
        companyId: crmCompany?.id,
        dealId: deal.id,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
      }
    })

    res.status(201).json({ ok: true, ...result })
  } catch (error) {
    console.error('Failed to ingest Ardia lead', error)
    res.status(500).json({ ok: false, error: 'Failed to ingest lead' })
  }
})

function isAuthorizedArdiaRequest(authorization: unknown) {
  const expectedKey = process.env.ARDIA_PACH_KEY
  if (!expectedKey) return false
  if (typeof authorization !== 'string') return false
  return authorization === `Bearer ${expectedKey}`
}

function normalizeLeadPayload(body: LeadPayload) {
  return {
    name: cleanString(body.name),
    email: cleanString(body.email)?.toLowerCase(),
    phone: cleanString(body.phone),
    company: cleanString(body.company),
    city: cleanString(body.city),
    role: cleanString(body.role),
    interest: cleanString(body.interest),
    message: cleanString(body.message),
    source: cleanString(body.source) ?? 'ardia_landing',
    contextCompany: cleanString(body.contextCompany) ?? cleanString(body.sourceCompany) ?? 'ardia',
    pageUrl: cleanString(body.pageUrl),
    referrer: cleanString(body.referrer),
    metadata: isRecord(body.metadata) ? body.metadata : {},
  }
}

type NormalizedLeadPayload = ReturnType<typeof normalizeLeadPayload>
type ValidLeadPayload = NormalizedLeadPayload & { name: string }

function isValidLeadPayload(payload: NormalizedLeadPayload): payload is ValidLeadPayload {
  return Boolean(payload.name && (payload.email || payload.phone))
}

function cleanString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed.slice(0, 1000) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

async function findOrCreateContextCompany(tx: Tx, contextCompany: string, now: Date) {
  const normalizedContextCompany = contextCompany.trim().toLowerCase()
  const existingCompanies = await tx.select().from(organizations)
  const existing = existingCompanies.find((company) => {
    const project = company.project?.trim().toLowerCase()
    const name = company.name.trim().toLowerCase()
    return project === normalizedContextCompany || name === normalizedContextCompany
  })

  if (existing) return existing

  const [created] = await tx
    .insert(organizations)
    .values({
      id: crypto.randomUUID(),
      name: contextCompany,
      project: normalizedContextCompany,
      description: `${contextCompany} sales and product context`,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return created
}

async function findOrCreateCrmCompany(tx: Tx, payload: ValidLeadPayload, organizationId: string, now: Date) {
  if (!payload.company) return null

  const [existing] = await tx
    .select()
    .from(crmCompanies)
    .where(and(eq(crmCompanies.organizationId, organizationId), eq(crmCompanies.name, payload.company)))
    .limit(1)

  if (existing) {
    await tx
      .update(crmCompanies)
      .set({
        organizationId,
        phone: existing.phone ?? payload.phone,
        city: existing.city ?? payload.city,
        updatedAt: now,
      })
      .where(eq(crmCompanies.id, existing.id))
    return existing
  }

  const [created] = await tx
    .insert(crmCompanies)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      name: payload.company,
      phone: payload.phone,
      city: payload.city,
      industry: 'real_estate',
      description: 'Lead capturado desde landing de Ardia',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return created
}

async function findOrCreateCrmContact(
  tx: Tx,
  payload: ValidLeadPayload,
  organizationId: string,
  crmCompanyId: string | undefined,
  now: Date,
) {
  const identityWhere =
    payload.email && payload.phone
      ? or(eq(crmContacts.email, payload.email), eq(crmContacts.phone, payload.phone))
      : payload.email
        ? eq(crmContacts.email, payload.email)
        : payload.phone
          ? eq(crmContacts.phone, payload.phone)
          : undefined
  const where = identityWhere ? and(eq(crmContacts.organizationId, organizationId), identityWhere) : undefined

  const [existing] = where
    ? await tx.select().from(crmContacts).where(where).limit(1)
    : []

  if (existing) {
    await tx
      .update(crmContacts)
      .set({
        organizationId,
        crmCompanyId: crmCompanyId ?? existing.crmCompanyId,
        name: payload.name,
        email: payload.email ?? existing.email,
        phone: payload.phone ?? existing.phone,
        role: payload.role ?? existing.role,
        updatedAt: now,
      })
      .where(eq(crmContacts.id, existing.id))
    return existing
  }

  const [created] = await tx
    .insert(crmContacts)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...(crmCompanyId ? { crmCompanyId } : {}),
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return created
}

async function createProspectDeal(
  tx: Tx,
  payload: ValidLeadPayload,
  organizationId: string,
  crmCompanyId: string | undefined,
  now: Date,
) {
  const [deal] = await tx
    .insert(crmDeals)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...(crmCompanyId ? { crmCompanyId } : {}),
      title: payload.name,
      stage: 'prospecto',
      temperature: 'hot',
      project: 'ardia',
      description: payload.interest
        ? `Interes: ${payload.interest}`
        : 'Lead capturado desde landing de Ardia',
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return deal
}

async function createLeadIssue(
  tx: Tx,
  params: {
    payload: ValidLeadPayload
    contextCompanyId: string
    now: Date
  },
) {
  const team = await getDefaultIssueTeam(tx, params.now)
  const status = await getDefaultIssueStatus(tx, params.now)
  const axelUser = await getAxelUser(tx)
  const [project] = await tx.select().from(pmProjects).where(eq(pmProjects.slug, 'ardia')).limit(1)
  const [lastIssue] = await tx
    .select()
    .from(pmIssues)
    .where(eq(pmIssues.teamId, team.id))
    .orderBy(desc(pmIssues.number))
    .limit(1)

  const number = (lastIssue?.number ?? 0) + 1
  const identifier = `${team.key}-${number}`

  const [issue] = await tx
    .insert(pmIssues)
    .values({
      id: crypto.randomUUID(),
      contextCompanyId: params.contextCompanyId,
      teamId: team.id,
      ...(project?.id ? { projectId: project.id } : {}),
      statusId: status.id,
      ...(axelUser?.id ? { assigneeId: axelUser.id, creatorId: axelUser.id } : {}),
      identifier,
      number,
      title: `Contact (lead): ${params.payload.company ?? params.payload.name}`,
      description: buildIssueDescription(params.payload),
      priority: 1,
      estimate: 2,
      sortOrder: 0,
      lastActivityAt: params.now,
      createdAt: params.now,
      updatedAt: params.now,
    })
    .returning()

  await insertIssueActivityEvent(tx, {
    issueId: issue.id,
    organizationId: params.contextCompanyId,
    subjectLabel: identifier,
    ...(axelUser?.id ? { actorId: axelUser.id } : {}),
    actorName: axelUser?.name ?? 'Ardia landing',
    eventType: 'created',
    source: typeof params.payload.source === 'string' && params.payload.source.trim()
      ? params.payload.source.trim()
      : 'ardia_landing',
    summary: `Created issue ${identifier} from landing lead`,
    metadata: {
      source: params.payload.source,
      contextCompany: params.payload.contextCompany,
    },
    occurredAt: params.now,
    createdAt: params.now,
  })

  const leadSubject = `${params.payload.company ?? params.payload.name ?? 'Lead'}${params.payload.email ? ` · ${params.payload.email}` : ''}`
  await tx.insert(activityEvents).values({
    organizationId: params.contextCompanyId,
    occurredAt: params.now,
    createdAt: params.now,
    eventType: 'lead_received',
    activityKind: 'business_signal',
    origin: 'pach_work',
    subjectType: 'inbound_lead',
    subjectId: issue.id,
    subjectLabel: leadSubject,
    actorType: 'external_user',
    actorName: typeof params.payload.name === 'string' ? params.payload.name : undefined,
    source: typeof params.payload.source === 'string' && params.payload.source.trim()
      ? params.payload.source.trim()
      : 'ardia_landing',
    severity: 'info',
    summary: `Received inbound lead ${leadSubject}`,
    details: {
      issueId: issue.id,
      issueIdentifier: identifier,
      name: params.payload.name,
      email: params.payload.email,
      phone: params.payload.phone,
      company: params.payload.company,
      interest: params.payload.interest,
      pageUrl: params.payload.pageUrl,
    },
    metadata: {
      source: params.payload.source,
      contextCompany: params.payload.contextCompany,
      referrer: params.payload.referrer,
    },
  })

  return issue
}

async function getDefaultIssueTeam(tx: Tx, now: Date) {
  const [existing] = await tx.select().from(pmTeams).orderBy(pmTeams.position).limit(1)
  if (existing) return existing

  const [created] = await tx
    .insert(pmTeams)
    .values({
      id: crypto.randomUUID(),
      key: 'PAC',
      name: 'Pach',
      description: 'Default workspace team',
      color: '#00ff88',
      position: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return created
}

async function getDefaultIssueStatus(tx: Tx, now: Date) {
  const [existing] = await tx
    .select()
    .from(pmStatuses)
    .where(and(eq(pmStatuses.key, 'todo'), eq(pmStatuses.type, 'unstarted')))
    .limit(1)

  if (existing) return existing

  const [fallback] = await tx
    .select()
    .from(pmStatuses)
    .where(eq(pmStatuses.type, 'unstarted'))
    .orderBy(pmStatuses.position)
    .limit(1)

  if (fallback) return fallback

  const [created] = await tx
    .insert(pmStatuses)
    .values({
      id: crypto.randomUUID(),
      name: 'Todo',
      key: 'todo',
      type: 'unstarted',
      color: '#94a3b8',
      position: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  return created
}

async function getAxelUser(tx: Tx) {
  const allUsers = await tx.select().from(users)
  return (
    allUsers.find((user) => user.email.trim().toLowerCase() === 'axel@pach.local') ??
    allUsers.find((user) => user.email.trim().toLowerCase().startsWith('axel@')) ??
    allUsers.find((user) => user.name?.trim().toLowerCase() === 'axel') ??
    allUsers.find((user) => user.email.trim().toLowerCase().includes('axel')) ??
    allUsers.find((user) => user.name?.trim().toLowerCase().includes('axel')) ??
    null
  )
}

function buildLeadNote(payload: ReturnType<typeof normalizeLeadPayload>) {
  return [
    'Nuevo lead desde landing de Ardia.',
    '',
    `Nombre: ${payload.name}`,
    payload.company ? `Empresa/desarrollo: ${payload.company}` : null,
    payload.phone ? `WhatsApp: ${payload.phone}` : null,
    payload.email ? `Email: ${payload.email}` : null,
    payload.role ? `Rol: ${payload.role}` : null,
    payload.city ? `Ciudad: ${payload.city}` : null,
    payload.interest ? `Interes: ${payload.interest}` : null,
    payload.message ? `Mensaje: ${payload.message}` : null,
    payload.pageUrl ? `Pagina: ${payload.pageUrl}` : null,
    payload.referrer ? `Referrer: ${payload.referrer}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildIssueDescription(payload: ReturnType<typeof normalizeLeadPayload>) {
  return [
    'Follow up with this Ardia website lead.',
    '',
    `Name: ${payload.name}`,
    payload.company ? `Company: ${payload.company}` : null,
    payload.phone ? `WhatsApp: ${payload.phone}` : null,
    payload.email ? `Email: ${payload.email}` : null,
    payload.interest ? `Interest: ${payload.interest}` : null,
    payload.message ? `Message: ${payload.message}` : null,
    payload.pageUrl ? `Page: ${payload.pageUrl}` : null,
    payload.referrer ? `Referrer: ${payload.referrer}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export default router
