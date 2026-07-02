import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, lte } from 'drizzle-orm'
import {
  pmIssues,
  pmTaskTriggerRuns,
  pmTaskTriggers,
  pmTeams,
  type TaskTriggerSchedule,
} from '../../../../db/schema.js'
import { getDb } from '../../db.js'
import { insertIssueActivityEvent } from '../../lib/activity-events.js'
import { computeNextRunAt, getPeriodKey } from './schedule.js'

export type TaskTriggerRunSummary = {
  checked: number
  created: number
  skipped: number
  failed: number
}

const DEFAULT_RUN_LIMIT = 50

export async function runDueTaskTriggers(params: { now?: Date; limit?: number } = {}): Promise<TaskTriggerRunSummary> {
  const db = getDb()
  const now = params.now ?? new Date()
  const dueTriggers = await db
    .select()
    .from(pmTaskTriggers)
    .where(and(eq(pmTaskTriggers.enabled, true), lte(pmTaskTriggers.nextRunAt, now)))
    .orderBy(asc(pmTaskTriggers.nextRunAt))
    .limit(params.limit ?? DEFAULT_RUN_LIMIT)

  const summary: TaskTriggerRunSummary = {
    checked: dueTriggers.length,
    created: 0,
    skipped: 0,
    failed: 0,
  }

  for (const trigger of dueTriggers) {
    try {
      const result = await createIssueForTrigger(trigger, now)
      summary[result] += 1
    } catch (error) {
      summary.failed += 1
      console.error(`[task-triggers] Failed to run trigger ${trigger.id}:`, error)
    }
  }

  return summary
}

type TriggerRow = typeof pmTaskTriggers.$inferSelect

async function createIssueForTrigger(trigger: TriggerRow, now: Date): Promise<'created' | 'skipped' | 'failed'> {
  const db = getDb()
  const schedule = normalizeSchedule(trigger.schedule, trigger.kind, trigger.frequency, trigger.timezone)
  const dueAt = trigger.nextRunAt
  const periodKey = getPeriodKey(schedule, dueAt)
  const nextRunAt = computeNextRunAt(schedule, dueAt)
  const shouldDisable = trigger.kind === 'once'

  try {
    return await db.transaction(async (tx) => {
      const [existingRun] = await tx
        .select({ id: pmTaskTriggerRuns.id })
        .from(pmTaskTriggerRuns)
        .where(and(eq(pmTaskTriggerRuns.triggerId, trigger.id), eq(pmTaskTriggerRuns.periodKey, periodKey)))
        .limit(1)

      if (existingRun) {
        await tx
          .update(pmTaskTriggers)
          .set({
            nextRunAt,
            enabled: shouldDisable ? false : trigger.enabled,
            updatedAt: now,
          })
          .where(eq(pmTaskTriggers.id, trigger.id))
        return 'skipped'
      }

      const [team] = await tx
        .select({ id: pmTeams.id, key: pmTeams.key })
        .from(pmTeams)
        .where(eq(pmTeams.id, trigger.teamId))
        .limit(1)

      if (!team) {
        await tx.insert(pmTaskTriggerRuns).values({
          id: randomUUID(),
          triggerId: trigger.id,
          periodKey,
          status: 'failed',
          message: 'Trigger team was not found',
          metadata: {},
          createdAt: now,
        })
        return 'failed'
      }

      const [lastIssue] = await tx
        .select({ number: pmIssues.number })
        .from(pmIssues)
        .where(eq(pmIssues.teamId, trigger.teamId))
        .orderBy(desc(pmIssues.number))
        .limit(1)

      const [firstInBucket] = await tx
        .select({ sortOrder: pmIssues.sortOrder })
        .from(pmIssues)
        .where(and(eq(pmIssues.priority, trigger.priority), eq(pmIssues.statusId, trigger.statusId)))
        .orderBy(asc(pmIssues.sortOrder))
        .limit(1)

      const number = (lastIssue?.number ?? 0) + 1
      const identifier = `${team.key}-${number}`
      const issueId = randomUUID()
      const sortOrder = firstInBucket?.sortOrder == null ? 1000 : firstInBucket.sortOrder - 1024

      await tx.insert(pmIssues).values({
        id: issueId,
        contextCompanyId: trigger.companyId,
        teamId: trigger.teamId,
        projectId: trigger.projectId,
        statusId: trigger.statusId,
        assigneeId: trigger.assigneeId,
        creatorId: trigger.creatorId,
        identifier,
        number,
        title: trigger.title,
        description: trigger.description,
        priority: trigger.priority,
        estimate: trigger.estimate,
        sortOrder,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      })

      await insertIssueActivityEvent(tx, {
        issueId,
        organizationId: trigger.companyId,
        subjectLabel: identifier,
        actorId: trigger.creatorId,
        eventType: 'created',
        source: 'task_trigger_runner',
        summary: `Created issue ${identifier} from trigger ${trigger.name}`,
        metadata: {
          source: 'task_trigger_runner',
          taskTriggerId: trigger.id,
          taskTriggerRunPeriod: periodKey,
          dueAt: dueAt.toISOString(),
        },
        occurredAt: now,
        createdAt: now,
      })

      await tx.insert(pmTaskTriggerRuns).values({
        id: randomUUID(),
        triggerId: trigger.id,
        issueId,
        periodKey,
        status: 'created',
        message: `Created issue ${identifier}`,
        metadata: { dueAt: dueAt.toISOString() },
        createdAt: now,
      })

      await tx
        .update(pmTaskTriggers)
        .set({
          lastRunAt: now,
          nextRunAt,
          enabled: shouldDisable ? false : trigger.enabled,
          updatedAt: now,
        })
        .where(eq(pmTaskTriggers.id, trigger.id))

      return 'created'
    })
  } catch (error) {
    await recordFailedRun(trigger.id, periodKey, error, now)
    return 'failed'
  }
}

async function recordFailedRun(triggerId: string, periodKey: string, error: unknown, now: Date) {
  const db = getDb()
  try {
    await db.insert(pmTaskTriggerRuns).values({
      id: randomUUID(),
      triggerId,
      periodKey,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      metadata: {},
      createdAt: now,
    })
  } catch {
    // A concurrent runner may have already written this period.
  }
}

function normalizeSchedule(raw: unknown, kind: string, frequency: string | null, timezone = 'America/Mexico_City'): TaskTriggerSchedule {
  const schedule: TaskTriggerSchedule = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as TaskTriggerSchedule)
    : {}

  return {
    ...schedule,
    kind: kind === 'once' ? 'once' : 'recurring',
    frequency: frequency ?? schedule.frequency,
    timezone,
  } as TaskTriggerSchedule
}

export function startTaskTriggerRunner() {
  const disabled = process.env.TASK_TRIGGER_RUNNER_DISABLED === 'true'
  if (disabled) return null

  const intervalMs = Number(process.env.TASK_TRIGGER_RUNNER_INTERVAL_MS ?? 60 * 60 * 1000)
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60 * 60 * 1000

  void runDueTaskTriggers()
    .then((summary) => {
      if (summary.checked > 0) console.log('[task-triggers] startup run', summary)
    })
    .catch((error) => {
      console.error('[task-triggers] startup run failed:', error)
    })

  const timer = setInterval(() => {
    void runDueTaskTriggers()
      .then((summary) => {
        if (summary.checked > 0) console.log('[task-triggers] interval run', summary)
      })
      .catch((error) => {
        console.error('[task-triggers] interval run failed:', error)
      })
  }, safeIntervalMs)

  return timer
}
