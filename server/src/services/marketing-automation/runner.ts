import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import {
  mktDistributionRuns,
  mktPublications,
  pmIssueActivity,
  pmIssues,
  pmStatuses,
  pmTeams,
  users,
} from '../../../../db/schema.js'
import { getDb } from '../../db.js'
import { sendNewsletterRun } from '../../routes/marketing.js'

type MarketingAutomationSummary = {
  scheduled: {
    checked: number
    sent: number
    skipped: number
    failed: number
  }
  cadence: {
    checked: number
    created: number
    skipped: number
    failed: number
  }
}

type MarketingCadenceConfig = {
  enabled: boolean
  lookaheadDays: number
  cooldownDays: number
  teamId?: string
  statusId?: string
  assigneeId?: string
  creatorId?: string
  projectId?: string
}

type PublicationRow = typeof mktPublications.$inferSelect

const DEFAULT_BROADCAST_LIMIT = 20
const DEFAULT_CADENCE_LIMIT = 50
const DEFAULT_LOOKAHEAD_DAYS = 14
const DEFAULT_COOLDOWN_DAYS = 7
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function runDueMarketingAutomation(params: { now?: Date; limit?: number } = {}): Promise<MarketingAutomationSummary> {
  const now = params.now ?? new Date()
  const [scheduled, cadence] = await Promise.all([
    runDueNewsletterBroadcasts({ now, limit: params.limit }),
    runMarketingCadenceChecks({ now, limit: params.limit }),
  ])
  return { scheduled, cadence }
}

export async function runDueNewsletterBroadcasts(params: { now?: Date; limit?: number } = {}) {
  const db = getDb()
  const now = params.now ?? new Date()
  const dueRuns = await db
    .select()
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.channel, 'newsletter'),
      eq(mktDistributionRuns.status, 'scheduled'),
      lte(mktDistributionRuns.scheduledAt, now),
    ))
    .orderBy(asc(mktDistributionRuns.scheduledAt))
    .limit(params.limit ?? DEFAULT_BROADCAST_LIMIT)

  const summary = {
    checked: dueRuns.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  }

  for (const run of dueRuns) {
    try {
      const [claimed] = await db
        .update(mktDistributionRuns)
        .set({ status: 'sending', startedAt: now, error: null, updatedAt: now })
        .where(and(eq(mktDistributionRuns.id, run.id), eq(mktDistributionRuns.status, 'scheduled')))
        .returning({ id: mktDistributionRuns.id })

      if (!claimed) {
        summary.skipped += 1
        continue
      }

      await sendNewsletterRun(run.id, false)
      summary.sent += 1
    } catch (error) {
      summary.failed += 1
      console.error(`[marketing-automation] Failed to send scheduled run ${run.id}:`, error)
      await db
        .update(mktDistributionRuns)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(mktDistributionRuns.id, run.id))
    }
  }

  return summary
}

export async function runMarketingCadenceChecks(params: { now?: Date; limit?: number } = {}) {
  const db = getDb()
  const now = params.now ?? new Date()
  const publications = await db
    .select()
    .from(mktPublications)
    .where(and(eq(mktPublications.type, 'newsletter'), eq(mktPublications.status, 'active')))
    .orderBy(asc(mktPublications.name))
    .limit(params.limit ?? DEFAULT_CADENCE_LIMIT)

  const summary = {
    checked: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  }

  for (const publication of publications) {
    const cadence = readCadenceConfig(publication.metadata)
    if (!cadence.enabled) continue

    summary.checked += 1
    try {
      const result = await createCadenceIssueIfNeeded(publication, cadence, now)
      summary[result] += 1
    } catch (error) {
      summary.failed += 1
      console.error(`[marketing-automation] Failed cadence check for publication ${publication.id}:`, error)
    }
  }

  return summary
}

async function createCadenceIssueIfNeeded(publication: PublicationRow, cadence: MarketingCadenceConfig, now: Date): Promise<'created' | 'skipped' | 'failed'> {
  const db = getDb()
  const horizon = new Date(now.getTime() + cadence.lookaheadDays * ONE_DAY_MS)
  const title = `Plan next ${publication.name} newsletter`

  const [upcomingRun] = await db
    .select({ id: mktDistributionRuns.id })
    .from(mktDistributionRuns)
    .where(and(
      eq(mktDistributionRuns.organizationId, publication.organizationId),
      eq(mktDistributionRuns.publicationId, publication.id),
      eq(mktDistributionRuns.channel, 'newsletter'),
      inArray(mktDistributionRuns.status, ['scheduled', 'sending']),
      gte(mktDistributionRuns.scheduledAt, now),
      lte(mktDistributionRuns.scheduledAt, horizon),
    ))
    .limit(1)

  if (upcomingRun) return 'skipped'

  const lastIssueCreatedAt = parseDate(readRecord(publication.metadata).marketingCadenceLastIssueAt)
  if (lastIssueCreatedAt && now.getTime() - lastIssueCreatedAt.getTime() < cadence.cooldownDays * ONE_DAY_MS) {
    return 'skipped'
  }

  const [existingOpenIssue] = await db
    .select({ id: pmIssues.id })
    .from(pmIssues)
    .where(and(
      eq(pmIssues.contextCompanyId, publication.organizationId),
      eq(pmIssues.title, title),
      isNull(pmIssues.completedAt),
      isNull(pmIssues.canceledAt),
    ))
    .limit(1)

  if (existingOpenIssue) return 'skipped'

  return await db.transaction(async (tx) => {
    const [existingOpenIssueInTx] = await tx
      .select({ id: pmIssues.id })
      .from(pmIssues)
      .where(and(
        eq(pmIssues.contextCompanyId, publication.organizationId),
        eq(pmIssues.title, title),
        isNull(pmIssues.completedAt),
        isNull(pmIssues.canceledAt),
      ))
      .limit(1)

    if (existingOpenIssueInTx) return 'skipped'

    const team = cadence.teamId
      ? (await tx.select().from(pmTeams).where(eq(pmTeams.id, cadence.teamId)).limit(1))[0]
      : await findDefaultIssueTeam(tx, publication.organizationId, now)

    if (!team) return 'failed'

    const status = cadence.statusId
      ? (await tx.select().from(pmStatuses).where(eq(pmStatuses.id, cadence.statusId)).limit(1))[0]
      : await findDefaultIssueStatus(tx, now)

    if (!status) return 'failed'

    const creator = cadence.creatorId
      ? (await tx.select().from(users).where(eq(users.id, cadence.creatorId)).limit(1))[0] ?? null
      : await findAxelUser(tx)

    const [lastIssue] = await tx
      .select({ number: pmIssues.number })
      .from(pmIssues)
      .where(eq(pmIssues.teamId, team.id))
      .orderBy(desc(pmIssues.number))
      .limit(1)

    const [firstInBucket] = await tx
      .select({ sortOrder: pmIssues.sortOrder })
      .from(pmIssues)
      .where(and(eq(pmIssues.priority, 1), eq(pmIssues.statusId, status.id)))
      .orderBy(asc(pmIssues.sortOrder))
      .limit(1)

    const issueId = randomUUID()
    const number = (lastIssue?.number ?? 0) + 1
    const identifier = `${team.key}-${number}`
    const sortOrder = firstInBucket?.sortOrder == null ? 1000 : firstInBucket.sortOrder - 1024
    const description = [
      'Created by Marketing Agent.',
      '',
      `No scheduled broadcast was found for ${publication.name} in the next ${cadence.lookaheadDays} days.`,
      '',
      'Suggested next steps:',
      '- Pick or create the article document.',
      '- Convert it to marketing content if needed.',
      '- Create a newsletter broadcast and schedule it.',
      '',
      `Publication slug: ${publication.slug}`,
      `Checked through: ${horizon.toISOString()}`,
    ].join('\n')

    await tx.insert(pmIssues).values({
      id: issueId,
      contextCompanyId: publication.organizationId,
      teamId: team.id,
      projectId: cadence.projectId,
      statusId: status.id,
      assigneeId: cadence.assigneeId ?? creator?.id ?? null,
      creatorId: creator?.id ?? null,
      identifier,
      number,
      title,
      description,
      priority: 1,
      sortOrder,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(pmIssueActivity).values({
      id: randomUUID(),
      issueId,
      actorId: creator?.id ?? null,
      actorName: creator?.name ?? 'Pach marketing automation',
      type: 'created',
      summary: `Created issue ${identifier} from publication cadence check`,
      metadata: {
        source: 'marketing_publication_cadence',
        publicationId: publication.id,
        publicationSlug: publication.slug,
        lookaheadDays: cadence.lookaheadDays,
        horizon: horizon.toISOString(),
      },
      createdAt: now,
    })

    await tx
      .update(mktPublications)
      .set({
        metadata: {
          ...readRecord(publication.metadata),
          marketingCadence: cadencePayload(cadence),
          marketingCadenceLastIssueAt: now.toISOString(),
          marketingCadenceLastIssueId: issueId,
          marketingCadenceLastIssueIdentifier: identifier,
        },
        updatedAt: now,
      })
      .where(eq(mktPublications.id, publication.id))

    return 'created'
  })
}

async function findDefaultIssueTeam(tx: any, organizationId: string, now: Date) {
  const [organizationTeam] = await tx
    .select()
    .from(pmTeams)
    .where(eq(pmTeams.companyId, organizationId))
    .orderBy(asc(pmTeams.position))
    .limit(1)
  if (organizationTeam) return organizationTeam

  const [existing] = await tx.select().from(pmTeams).orderBy(asc(pmTeams.position)).limit(1)
  if (existing) return existing

  const [created] = await tx
    .insert(pmTeams)
    .values({
      id: randomUUID(),
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

async function findDefaultIssueStatus(tx: any, now: Date) {
  const [todo] = await tx
    .select()
    .from(pmStatuses)
    .where(and(eq(pmStatuses.key, 'todo'), eq(pmStatuses.type, 'unstarted')))
    .limit(1)
  if (todo) return todo

  const [unstarted] = await tx
    .select()
    .from(pmStatuses)
    .where(eq(pmStatuses.type, 'unstarted'))
    .orderBy(asc(pmStatuses.position))
    .limit(1)
  if (unstarted) return unstarted

  const [created] = await tx
    .insert(pmStatuses)
    .values({
      id: randomUUID(),
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

async function findAxelUser(tx: any) {
  const allUsers = await tx.select().from(users)
  return (
    allUsers.find((user: typeof users.$inferSelect) => user.email.trim().toLowerCase() === 'axel@pach.local') ??
    allUsers.find((user: typeof users.$inferSelect) => user.email.trim().toLowerCase().startsWith('axel@')) ??
    allUsers.find((user: typeof users.$inferSelect) => user.name?.trim().toLowerCase() === 'axel') ??
    allUsers.find((user: typeof users.$inferSelect) => user.email.trim().toLowerCase().includes('axel')) ??
    allUsers.find((user: typeof users.$inferSelect) => user.name?.trim().toLowerCase().includes('axel')) ??
    null
  )
}

function readCadenceConfig(metadata: Record<string, unknown>): MarketingCadenceConfig {
  const raw = readRecord(metadata.marketingCadence)
  return {
    enabled: raw.enabled === true,
    lookaheadDays: clampPositiveInteger(raw.lookaheadDays, DEFAULT_LOOKAHEAD_DAYS),
    cooldownDays: clampPositiveInteger(raw.cooldownDays, DEFAULT_COOLDOWN_DAYS),
    teamId: readOptionalString(raw.teamId),
    statusId: readOptionalString(raw.statusId),
    assigneeId: readOptionalString(raw.assigneeId),
    creatorId: readOptionalString(raw.creatorId),
    projectId: readOptionalString(raw.projectId),
  }
}

function cadencePayload(cadence: MarketingCadenceConfig) {
  return {
    enabled: cadence.enabled,
    lookaheadDays: cadence.lookaheadDays,
    cooldownDays: cadence.cooldownDays,
    teamId: cadence.teamId,
    statusId: cadence.statusId,
    assigneeId: cadence.assigneeId,
    creatorId: cadence.creatorId,
    projectId: cadence.projectId,
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function clampPositiveInteger(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.trunc(number)
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function startMarketingAutomationRunner() {
  const disabled = process.env.MARKETING_AUTOMATION_RUNNER_DISABLED === 'true'
  if (disabled) return null

  const scheduleIntervalMs = safeInterval(process.env.MARKETING_SCHEDULE_RUNNER_INTERVAL_MS, 5 * 60 * 1000)
  const cadenceIntervalMs = safeInterval(process.env.MARKETING_CADENCE_RUNNER_INTERVAL_MS, 60 * 60 * 1000)
  let lastCadenceRunAt = 0

  const runScheduled = (label: string) => {
    void runDueNewsletterBroadcasts().then((summary) => {
      if (summary.checked > 0) console.log(`[marketing-automation] ${label} scheduled`, summary)
    })
  }

  const runCadence = (label: string) => {
    lastCadenceRunAt = Date.now()
    void runMarketingCadenceChecks().then((summary) => {
      if (summary.checked > 0) console.log(`[marketing-automation] ${label} cadence`, summary)
    })
  }

  runScheduled('startup')
  runCadence('startup')

  const timer = setInterval(() => {
    runScheduled('interval')
    if (Date.now() - lastCadenceRunAt >= cadenceIntervalMs) runCadence('interval')
  }, scheduleIntervalMs)

  return timer
}

function safeInterval(raw: string | undefined, fallback: number) {
  const interval = Number(raw ?? fallback)
  return Number.isFinite(interval) && interval > 0 ? interval : fallback
}
