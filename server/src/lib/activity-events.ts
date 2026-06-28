import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { activityEvents, organizations, pmIssues } from '../../../db/schema.js'

type IssueActivityEventInput = {
  id?: string
  issueId: string
  organizationId?: string | null
  subjectLabel?: string | null
  actorType?: string
  actorId?: string | null
  actorName?: string | null
  eventType: string
  activityKind?: string | null
  origin?: string | null
  source?: string | null
  severity?: string | null
  summary: string
  details?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  occurredAt?: Date
  createdAt?: Date
}

export async function insertIssueActivityEvent(db: any, input: IssueActivityEventInput) {
  const now = input.createdAt ?? input.occurredAt ?? new Date()
  const issueContext = input.organizationId && input.subjectLabel
    ? null
    : await readIssueActivityContext(db, input.issueId)
  const organizationId =
    input.organizationId ??
    issueContext?.organizationId ??
    await fallbackActivityOrganizationId(db)

  if (!organizationId) throw new Error('No organization available for issue activity')

  const metadata = input.metadata ?? {}
  await db.insert(activityEvents).values({
    id: input.id ?? randomUUID(),
    organizationId,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    eventType: input.eventType,
    activityKind: input.activityKind ?? issueActivityKind(input.eventType, metadata),
    origin: input.origin ?? 'pach_work',
    subjectType: 'pm_issue',
    subjectId: input.issueId,
    subjectLabel: input.subjectLabel ?? issueContext?.identifier ?? undefined,
    actorType: input.actorType ?? inferActivityActorType(input.actorId, input.actorName),
    actorId: input.actorId ?? undefined,
    actorName: input.actorName ?? undefined,
    source: input.source ?? readMetadataString(metadata, 'source') ?? 'pach_app',
    severity: input.severity ?? issueActivitySeverity(input.eventType, metadata),
    summary: input.summary,
    details: input.details ?? {},
    metadata,
  } as any)
}

async function readIssueActivityContext(db: any, issueId: string) {
  const [issue] = await db
    .select({
      organizationId: pmIssues.contextCompanyId,
      identifier: pmIssues.identifier,
    })
    .from(pmIssues)
    .where(eq(pmIssues.id, issueId))
    .limit(1)
  return issue ?? null
}

async function fallbackActivityOrganizationId(db: any) {
  const [pachOrganization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.project, 'pach'))
    .orderBy(organizations.createdAt)
    .limit(1)
  if (pachOrganization) return pachOrganization.id

  const [firstOrganization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(organizations.createdAt)
    .limit(1)
  return firstOrganization?.id ?? null
}

function inferActivityActorType(actorId: string | null | undefined, actorName: string | null | undefined) {
  if (actorId) return 'user'
  if (actorName?.toLowerCase().includes('agent')) return 'agent'
  return 'system'
}

function issueActivitySeverity(eventType: string, metadata: Record<string, unknown>) {
  const level = readMetadataString(metadata, 'level')
  if (eventType === 'agent_run_failed' || level === 'error') return 'error'
  if (level === 'warn' || level === 'warning') return 'warning'
  if (level === 'debug') return 'debug'
  return 'info'
}

function issueActivityKind(eventType: string, metadata: Record<string, unknown>) {
  if (eventType === 'completed') return 'progress'
  if (eventType === 'agent_run_failed' || readMetadataString(metadata, 'level') === 'error') return 'incident'
  return 'operational'
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
