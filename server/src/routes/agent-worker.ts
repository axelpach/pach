import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { Request } from 'express'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { agentRunProgressReports, agentRuns, agentWorkers, mcpTokens, pmIssues } from '../../../db/schema.js'
import { getDb } from '../db.js'
import { buildGeneralMcpPrompt } from '../lib/agent-run-prompt.js'
import { insertIssueActivityEvent } from '../lib/activity-events.js'
import { hashMcpToken, hasMcpCapability, type McpAuthContext, type McpCapability } from '../lib/mcp-token.js'

const router = Router()
const ACTIVE_RUN_STATUSES = ['reserved', 'bootstrapping', 'running', 'needs_human'] as const
const CLAIMABLE_RUN_STATUSES = ['queued'] as const
const FINAL_RUN_STATUSES = new Set(['completed', 'failed', 'canceled'])

type AgentWorkerRequest = Request & {
  agentWorkerAuth?: McpAuthContext
}

type ExecutionClass = 'coding' | 'general'

router.use(async (req: AgentWorkerRequest, res, next) => {
  const token = readBearerToken(req)
  if (!token) {
    res.status(401).json({ ok: false, error: 'Missing bearer token' })
    return
  }

  const auth = await readMcpTokenAuth(token)
  if (!auth) {
    res.status(401).json({ ok: false, error: 'Invalid or expired worker token' })
    return
  }

  req.agentWorkerAuth = auth
  next()
})

router.post('/heartbeat', async (req: AgentWorkerRequest, res) => {
  try {
    requireCapability(req, 'agent.worker.heartbeat')

    const body = ensureObject(req.body ?? {})
    const name = readOptionalString(body.name) ?? readOptionalString(body.workerName)
    const workerId = readOptionalString(body.workerId)
    const providerServerId = readOptionalString(body.providerServerId)

    if (!name && !workerId && !providerServerId) {
      res.status(400).json({ ok: false, error: 'Send workerId, providerServerId, or name.' })
      return
    }

    const db = getDb()
    const existing = await findExistingWorker({ workerId, providerServerId, name })
    const now = new Date()
    const metadata = mergeWorkerMetadata(existing?.metadata, {
      capabilities: readStringArray(body.capabilities),
      limits: readWorkerLimits(body.limits),
      runtime: isObject(body.runtime) ? body.runtime : undefined,
      lastHeartbeat: {
        at: now.toISOString(),
        tokenId: req.agentWorkerAuth?.tokenId,
      },
    })
    const activeRunCount = existing
      ? (await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.workerId, existing.id), inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES])))).length
      : 0

    const values = {
      name: name ?? existing?.name ?? 'unnamed-agent-worker',
      provider: readOptionalString(body.provider) ?? existing?.provider ?? 'manual',
      providerServerId: providerServerId ?? existing?.providerServerId,
      hostname: readOptionalString(body.hostname) ?? existing?.hostname,
      sshHost: readOptionalString(body.sshHost) ?? existing?.sshHost ?? readOptionalString(body.hostname) ?? 'pull-worker',
      sshPort: readPositiveInteger(body.sshPort, existing?.sshPort ?? 22, 1, 65535),
      sshUser: readOptionalString(body.sshUser) ?? existing?.sshUser ?? 'pach',
      status: activeRunCount > 0 ? 'running' : readOptionalString(body.status) ?? 'idle',
      statusMessage: readOptionalString(body.statusMessage) ?? (activeRunCount > 0 ? `${activeRunCount} active run(s)` : 'heartbeat ok'),
      lastSeenAt: now,
      metadata,
      updatedAt: now,
    }

    const [worker] = existing
      ? await db.update(agentWorkers).set(values).where(eq(agentWorkers.id, existing.id)).returning()
      : await db.insert(agentWorkers).values({ ...values, createdAt: now }).returning()

    res.json({ ok: true, worker, activeRunCount })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Heartbeat failed' })
  }
})

router.post('/runs/claim', async (req: AgentWorkerRequest, res) => {
  try {
    requireCapability(req, 'agent.run.claim')

    const body = ensureObject(req.body ?? {})
    const workerId = readRequiredString(body.workerId, 'workerId')
    const db = getDb()
    const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.id, workerId)).limit(1)
    if (!worker) {
      res.status(404).json({ ok: false, error: 'Worker not found' })
      return
    }

    const workerMetadata = readObject(worker.metadata)
    const workerCapabilities = readStringArray(body.capabilities).length > 0
      ? readStringArray(body.capabilities)
      : readStringArray(workerMetadata.capabilities)
    const limits = readWorkerLimits(workerMetadata.limits)
    const activeRuns = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.workerId, worker.id), inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES])))

    const candidates = await db
      .select()
      .from(agentRuns)
      .where(and(
        inArray(agentRuns.status, [...CLAIMABLE_RUN_STATUSES]),
        or(isNull(agentRuns.workerId), eq(agentRuns.workerId, worker.id)),
      ))
      .orderBy(desc(agentRuns.createdAt))
      .limit(20)

    for (const candidate of candidates) {
      const executionClass = readExecutionClass(candidate.metadata)
      const requiredCapabilities = readRequiredCapabilities(candidate.metadata)

      if (!hasAllCapabilities(workerCapabilities, requiredCapabilities)) continue
      if (!hasCapacity(activeRuns, executionClass, limits)) continue

      const now = new Date()
      const [claimed] = await db
        .update(agentRuns)
        .set({
          workerId: worker.id,
          status: 'running',
          statusMessage: `claimed by ${worker.name}`,
          startedAt: candidate.startedAt ?? now,
          metadata: {
            ...(candidate.metadata ?? {}),
            executionClass,
            requiredCapabilities,
            claimedAt: now.toISOString(),
            claimedBy: worker.id,
          },
          updatedAt: now,
        })
        .where(and(eq(agentRuns.id, candidate.id), inArray(agentRuns.status, [...CLAIMABLE_RUN_STATUSES])))
        .returning()

      if (!claimed) continue

      await db
        .update(agentWorkers)
        .set({
          status: 'running',
          statusMessage: `running ${claimed.branchName}`,
          updatedAt: now,
          lastSeenAt: now,
        })
        .where(eq(agentWorkers.id, worker.id))

      await appendRunActivity(claimed, `Agent worker ${worker.name} claimed run`, 'agent_run_claimed', {
        workerId: worker.id,
        executionClass,
        requiredCapabilities,
      })
      await appendRunProgressReport(claimed, {
        workerId: worker.id,
        phase: 'claimed',
        message: `Agent worker ${worker.name} claimed run`,
        metadata: {
          executionClass,
          requiredCapabilities,
        },
      })

      res.json({
        ok: true,
        run: claimed,
        worker,
        executionPrompt: buildGeneralMcpPrompt(claimed),
        executionPromptSource: 'server',
      })
      return
    }

    await db
      .update(agentWorkers)
      .set({
        status: activeRuns.length > 0 ? 'running' : 'idle',
        statusMessage: activeRuns.length > 0 ? `${activeRuns.length} active run(s)` : 'no claimable runs',
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentWorkers.id, worker.id))

    res.json({ ok: true, run: null, workerId: worker.id })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Claim failed' })
  }
})

router.post('/runs/:id/progress', async (req: AgentWorkerRequest, res) => {
  try {
    requireCapability(req, 'agent.run.progress')

    const body = ensureObject(req.body ?? {})
    const workerId = readRequiredString(body.workerId, 'workerId')
    const message = readOptionalString(body.message) ?? 'agent worker progress'
    const status = readOptionalString(body.status)
    const phase = readOptionalString(body.phase)
    const percent = readOptionalPercent(body.percent)
    const metadata = isObject(body.metadata) ? body.metadata : {}
    const { run } = await readOwnedRun(readRouteParam(req.params.id, 'id'), workerId)
    const now = new Date()
    const nextMetadata = {
      ...(run.metadata ?? {}),
      lastProgress: {
        phase,
        message,
        at: now.toISOString(),
        ...metadata,
      },
    }

    const [updated] = await getDb()
      .update(agentRuns)
      .set({
        status: status ?? run.status,
        statusMessage: message,
        metadata: nextMetadata,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
      .returning()

    await appendRunProgressReport(updated, {
      workerId,
      phase,
      message,
      percent,
      metadata,
    })

    res.json({ ok: true, run: updated })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Progress update failed' })
  }
})

router.post('/runs/:id/cancel-state', async (req: AgentWorkerRequest, res) => {
  try {
    requireCapability(req, 'agent.run.progress')

    const body = ensureObject(req.body ?? {})
    const workerId = readRequiredString(body.workerId, 'workerId')
    const { run } = await readOwnedRun(readRouteParam(req.params.id, 'id'), workerId)
    const metadata = readObject(run.metadata)

    res.json({
      ok: true,
      cancelRequested: metadata.cancelRequested === true || run.status === 'canceled',
      reason: readOptionalString(metadata.cancelReason),
      runStatus: run.status,
      statusMessage: run.statusMessage,
    })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Cancel state check failed' })
  }
})

router.post('/runs/:id/complete', async (req: AgentWorkerRequest, res) => {
  try {
    requireCapability(req, 'agent.run.complete')

    const body = ensureObject(req.body ?? {})
    const workerId = readRequiredString(body.workerId, 'workerId')
    const finalStatus = readOptionalString(body.status) ?? 'completed'
    if (!FINAL_RUN_STATUSES.has(finalStatus)) {
      res.status(400).json({ ok: false, error: 'Final status must be completed, failed, or canceled.' })
      return
    }

    const message = readOptionalString(body.message) ?? `run ${finalStatus}`
    const metadata = isObject(body.metadata) ? body.metadata : {}
    const { run, worker } = await readOwnedRun(readRouteParam(req.params.id, 'id'), workerId)
    const now = new Date()
    const [updated] = await getDb()
      .update(agentRuns)
      .set({
        status: finalStatus,
        statusMessage: message,
        completedAt: now,
        metadata: {
          ...(run.metadata ?? {}),
          completedBy: worker.id,
          completedAt: now.toISOString(),
          completion: metadata,
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
      .returning()

    await appendRunActivity(updated, message, finalStatus === 'completed' ? 'agent_run_completed' : finalStatus === 'canceled' ? 'agent_run_canceled' : 'agent_run_failed', {
      workerId,
      finalStatus,
      ...metadata,
    })
    await appendRunProgressReport(updated, {
      workerId,
      phase: finalStatus,
      level: finalStatus === 'completed' ? 'info' : finalStatus === 'canceled' ? 'warn' : 'error',
      message,
      metadata: {
        finalStatus,
        ...metadata,
      },
    })

    const activeRuns = await getDb()
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.workerId, worker.id), inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES])))

    await getDb()
      .update(agentWorkers)
      .set({
        status: activeRuns.length > 0 ? 'running' : 'idle',
        statusMessage: activeRuns.length > 0 ? `${activeRuns.length} active run(s)` : `last run ${finalStatus}`,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(agentWorkers.id, worker.id))

    res.json({ ok: true, run: updated })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Run completion failed' })
  }
})

async function readOwnedRun(runId: string, workerId: string) {
  const db = getDb()
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
  if (!run) throw new Error('Agent run not found')
  if (run.workerId !== workerId) throw new Error('Agent run is not assigned to this worker')

  const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.id, workerId)).limit(1)
  if (!worker) throw new Error('Worker not found')
  return { run, worker }
}

async function appendRunActivity(
  run: typeof agentRuns.$inferSelect,
  summary: string,
  type: string,
  metadata: Record<string, unknown>,
) {
  if (!run.issueId) return

  const now = new Date()
  await insertIssueActivityEvent(getDb(), {
    issueId: run.issueId,
    actorType: 'agent',
    actorName: 'Pach agent worker',
    eventType: type,
    source: 'agent-worker',
    summary,
    metadata: {
      source: 'agent-worker',
      runId: run.id,
      ...metadata,
    },
    occurredAt: now,
    createdAt: now,
  })

  await getDb()
    .update(pmIssues)
    .set({ lastActivityAt: now, updatedAt: now })
    .where(eq(pmIssues.id, run.issueId))
}

async function appendRunProgressReport(
  run: typeof agentRuns.$inferSelect,
  report: {
    workerId?: string
    phase?: string
    level?: string
    message: string
    percent?: number
    metadata?: Record<string, unknown>
  },
) {
  await getDb().insert(agentRunProgressReports).values({
    id: randomUUID(),
    runId: run.id,
    issueId: run.issueId ?? undefined,
    workerId: report.workerId,
    phase: report.phase,
    level: report.level ?? 'info',
    message: report.message,
    percent: report.percent,
    metadata: report.metadata ?? {},
    createdAt: new Date(),
  })
}

async function findExistingWorker({
  workerId,
  providerServerId,
  name,
}: {
  workerId?: string
  providerServerId?: string
  name?: string
}) {
  const db = getDb()
  if (workerId) {
    const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.id, workerId)).limit(1)
    if (worker) return worker
  }
  if (providerServerId) {
    const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.providerServerId, providerServerId)).limit(1)
    if (worker) return worker
  }
  if (name) {
    const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.name, name)).limit(1)
    if (worker) return worker
  }
  return null
}

async function readMcpTokenAuth(token: string): Promise<McpAuthContext | null> {
  const [stored] = await getDb()
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, hashMcpToken(token)))
    .limit(1)

  if (!stored) return null
  if (stored.revokedAt) return null
  if (stored.expiresAt && stored.expiresAt.getTime() <= Date.now()) return null

  await getDb()
    .update(mcpTokens)
    .set({
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mcpTokens.id, stored.id))

  return {
    kind: 'token',
    subjectId: stored.id,
    actorUserId: stored.ownerUserId ?? undefined,
    actorName: `MCP token: ${stored.name}`,
    tokenId: stored.id,
    allOrganizations: stored.allOrganizations,
    canAccessUnscoped: stored.canAccessUnscoped,
    organizationIds: readStringArray(stored.organizationIds),
    capabilities: readStringArray(stored.capabilities),
  }
}

function requireCapability(req: AgentWorkerRequest, capability: McpCapability) {
  const auth = req.agentWorkerAuth
  if (!auth) throw new Error('Missing worker auth')
  if (!hasMcpCapability(auth, capability)) throw new Error(`Worker token is missing capability: ${capability}`)
}

function readBearerToken(req: Request) {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

function readExecutionClass(metadata: unknown): ExecutionClass {
  const raw = readObject(metadata).executionClass
  return raw === 'general' ? 'general' : 'coding'
}

function readRequiredCapabilities(metadata: unknown) {
  return readStringArray(readObject(metadata).requiredCapabilities)
}

function readWorkerLimits(value: unknown) {
  const limits = readObject(value)
  return {
    coding: readPositiveInteger(limits.coding, 1, 1, 20),
    general: readPositiveInteger(limits.general, 3, 1, 50),
  }
}

function mergeWorkerMetadata(existing: unknown, patch: Record<string, unknown>) {
  const current = readObject(existing)
  return Object.fromEntries(
    Object.entries({
      ...current,
      ...patch,
    }).filter(([, value]) => value !== undefined),
  )
}

function hasAllCapabilities(workerCapabilities: string[], requiredCapabilities: string[]) {
  if (requiredCapabilities.length === 0) return true
  if (workerCapabilities.includes('*')) return true
  return requiredCapabilities.every((capability) => workerCapabilities.includes(capability))
}

function hasCapacity(
  activeRuns: (typeof agentRuns.$inferSelect)[],
  executionClass: ExecutionClass,
  limits: { coding: number; general: number },
) {
  const activeInClass = activeRuns.filter((run) => readExecutionClass(run.metadata) === executionClass).length
  return activeInClass < limits[executionClass]
}

function readObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new Error('Expected object body')
  return value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}`)
  return value.trim()
}

function readRouteParam(value: string | string[] | undefined, field: string) {
  const candidate = Array.isArray(value) ? value[0] : value
  return readRequiredString(candidate, field)
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readPositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value == null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback
  return parsed
}

function readOptionalPercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100, Math.floor(value)))
}

export default router
