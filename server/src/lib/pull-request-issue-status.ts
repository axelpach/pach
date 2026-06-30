import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { pmIssues, pmStatuses } from '../../../db/schema.js'
import { getDb } from '../db.js'
import { insertIssueActivityEvent } from './activity-events.js'

type PullRequestStatusInput = {
  issueId?: string | null
  pullRequest: {
    number: number
    url: string
    state: string
    isDraft?: boolean | null
  }
  source: string
  now?: Date
}

type IssueTargetType = 'review' | 'completed'

const CANONICAL_STATUS_BY_TYPE: Record<IssueTargetType, {
  key: string
  name: string
  color: string
  position: number
}> = {
  review: { key: 'in_review', name: 'In Review', color: '#38bdf8', position: 3 },
  completed: { key: 'done', name: 'Done', color: '#4ade80', position: 5 },
}

export async function syncIssueStatusForPullRequest({
  issueId,
  pullRequest,
  source,
  now = new Date(),
}: PullRequestStatusInput) {
  if (!issueId) return null

  const targetType = pullRequest.state === 'merged'
    ? 'completed'
    : pullRequest.state === 'open'
      ? 'review'
      : null
  if (!targetType) return null

  const db = getDb()
  const [issue] = await db.select().from(pmIssues).where(eq(pmIssues.id, issueId)).limit(1)
  if (!issue) return null

  const [currentStatus] = await db.select().from(pmStatuses).where(eq(pmStatuses.id, issue.statusId)).limit(1)
  if (targetType === 'review' && (issue.completedAt || currentStatus?.type === 'completed' || currentStatus?.type === 'canceled')) {
    return { updated: false, reason: 'terminal_issue', targetType }
  }
  if (currentStatus?.type === targetType) {
    return { updated: false, reason: 'already_in_target_status', targetType, statusId: issue.statusId }
  }

  const targetStatus = await findOrCreateIssueStatus(targetType, issue.teamId, now)
  const updates = {
    statusId: targetStatus.id,
    startedAt: issue.startedAt ?? now,
    completedAt: targetType === 'completed' ? now : issue.completedAt,
    canceledAt: targetType === 'completed' ? null : issue.canceledAt,
    lastActivityAt: now,
    updatedAt: now,
  }

  await db.update(pmIssues).set(updates).where(eq(pmIssues.id, issue.id))

  await insertIssueActivityEvent(db, {
    issueId: issue.id,
    eventType: targetType === 'completed' ? 'completed' : 'status_changed',
    actorName: 'Engineering Agent',
    source,
    summary: targetType === 'completed'
      ? `Marked done from merged PR #${pullRequest.number}`
      : `Moved to review from PR #${pullRequest.number}`,
    metadata: {
      source,
      fromStatusId: issue.statusId,
      toStatusId: targetStatus.id,
      targetType,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
      pullRequestState: pullRequest.state,
      pullRequestDraft: Boolean(pullRequest.isDraft),
    },
    occurredAt: now,
    createdAt: now,
  })

  return {
    updated: true,
    targetType,
    statusId: targetStatus.id,
  }
}

async function findOrCreateIssueStatus(type: IssueTargetType, teamId: string, now: Date) {
  const db = getDb()
  const statuses = await db
    .select()
    .from(pmStatuses)
    .where(eq(pmStatuses.type, type))
    .orderBy(pmStatuses.position)

  const teamStatus = statuses.find((status) => status.teamId === teamId)
  if (teamStatus) return teamStatus

  const workspaceStatus = statuses.find((status) => !status.teamId)
  if (workspaceStatus) return workspaceStatus

  const canonical = CANONICAL_STATUS_BY_TYPE[type]
  const [created] = await db
    .insert(pmStatuses)
    .values({
      id: randomUUID(),
      name: canonical.name,
      key: canonical.key,
      type,
      color: canonical.color,
      position: canonical.position,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return created
}
