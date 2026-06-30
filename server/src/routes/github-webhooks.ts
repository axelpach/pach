import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import express, { Router } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import {
  agentRuns,
  githubBranches,
  githubPullRequests,
  githubRepositories,
  githubWebhookEvents,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import { syncIssueStatusForPullRequest } from '../lib/pull-request-issue-status.js'

const router = Router()
const rawJson = express.raw({ type: ['application/json', 'application/*+json'], limit: '10mb' })
const FINAL_AGENT_RUN_STATUSES = new Set(['completed', 'failed', 'canceled'])

router.post('/', rawJson, async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
  const deliveryId = readHeader(req, 'x-github-delivery')
  const eventType = readHeader(req, 'x-github-event')
  const signature = readHeader(req, 'x-hub-signature-256')
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim() || process.env.PACH_GITHUB_WEBHOOK_SECRET?.trim()

  if (!secret) {
    res.status(503).json({ ok: false, error: 'GitHub webhook secret is not configured.' })
    return
  }
  if (!deliveryId || !eventType) {
    res.status(400).json({ ok: false, error: 'Missing GitHub webhook headers.' })
    return
  }
  if (!verifyGithubSignature({ rawBody, signature, secret })) {
    res.status(401).json({ ok: false, error: 'Invalid webhook signature.' })
    return
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid JSON payload.' })
    return
  }

  try {
    const result = await recordGithubWebhookDelivery({ deliveryId, eventType, payload })
    res.json(result)
  } catch (error) {
    console.error('GitHub webhook failed', error)
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Webhook processing failed' })
  }
})

async function recordGithubWebhookDelivery({
  deliveryId,
  eventType,
  payload,
}: {
  deliveryId: string
  eventType: string
  payload: Record<string, unknown>
}) {
  const db = getDb()
  const action = readObjectString(payload.action)
  const repositoryFullName = readObjectString(readObject(payload.repository).full_name)
  const pullRequest = readObject(payload.pull_request)
  const githubObjectId = readGithubObjectId(eventType, pullRequest)
  const now = new Date()

  const [existingDelivery] = await db
    .select()
    .from(githubWebhookEvents)
    .where(eq(githubWebhookEvents.deliveryId, deliveryId))
    .limit(1)
  if (existingDelivery) return { ok: true, duplicate: true, eventType, action }

  const [delivery] = await db.insert(githubWebhookEvents).values({
    id: randomUUID(),
    deliveryId,
    eventType,
    action,
    repositoryFullName,
    githubObjectId,
    payload,
    createdAt: now,
  }).returning()

  let syncedPullRequest: typeof githubPullRequests.$inferSelect | null = null
  if (eventType === 'ping') {
    await markDeliveryProcessed(delivery.id)
    return { ok: true, eventType, action: 'ping' }
  }

  if (eventType === 'pull_request' && action) {
    syncedPullRequest = await syncPullRequestWebhook({ payload, deliveryId, now })
  }

  await markDeliveryProcessed(delivery.id)
  return {
    ok: true,
    eventType,
    action,
    pullRequest: syncedPullRequest,
  }
}

async function syncPullRequestWebhook({
  payload,
  deliveryId,
  now,
}: {
  payload: Record<string, unknown>
  deliveryId: string
  now: Date
}) {
  const db = getDb()
  const repositoryPayload = readObject(payload.repository)
  const pullRequest = readObject(payload.pull_request)
  const repositoryFullName = readRequiredString(repositoryPayload.full_name, 'repository.full_name')
  const number = readRequiredNumber(pullRequest.number, 'pull_request.number')
  const head = readObject(pullRequest.head)
  const base = readObject(pullRequest.base)
  const headBranch = readRequiredString(head.ref, 'pull_request.head.ref')

  const [repository] = await db
    .select()
    .from(githubRepositories)
    .where(eq(githubRepositories.fullName, repositoryFullName))
    .limit(1)
  if (!repository) throw new Error(`Repository is not linked in Pach: ${repositoryFullName}`)

  const [branch] = await db
    .select()
    .from(githubBranches)
    .where(and(eq(githubBranches.repositoryId, repository.id), eq(githubBranches.name, headBranch)))
    .orderBy(desc(githubBranches.createdAt))
    .limit(1)

  const [run] = branch?.agentRunId
    ? await db.select().from(agentRuns).where(eq(agentRuns.id, branch.agentRunId)).limit(1)
    : await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.repositoryId, repository.id), eq(agentRuns.branchName, headBranch)))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1)

  const state = readPullRequestState(pullRequest)
  const values = {
    repositoryId: repository.id,
    branchId: branch?.id,
    agentRunId: run?.id,
    issueId: run?.issueId ?? branch?.issueId,
    githubId: String(readRequiredNumber(pullRequest.id, 'pull_request.id')),
    number,
    url: readRequiredString(pullRequest.html_url, 'pull_request.html_url'),
    title: readRequiredString(pullRequest.title, 'pull_request.title'),
    state,
    isDraft: readOptionalBoolean(pullRequest.draft, false),
    mergeable: readOptionalBoolean(pullRequest.mergeable, undefined),
    headSha: readObjectString(head.sha),
    baseBranch: readObjectString(base.ref) ?? run?.baseBranch ?? branch?.baseBranch ?? 'main',
    checksStatus: 'unknown',
    githubCreatedAt: readOptionalDate(pullRequest.created_at),
    githubUpdatedAt: readOptionalDate(pullRequest.updated_at),
    updatedAt: now,
  }

  const [existingPullRequest] = await db
    .select()
    .from(githubPullRequests)
    .where(and(eq(githubPullRequests.repositoryId, repository.id), eq(githubPullRequests.number, number)))
    .limit(1)

  const [saved] = existingPullRequest
    ? await db.update(githubPullRequests).set(values).where(eq(githubPullRequests.id, existingPullRequest.id)).returning()
    : await db.insert(githubPullRequests).values({ ...values, createdAt: now }).returning()
  const issueStatusSync = await syncIssueStatusForPullRequest({
    issueId: saved.issueId,
    pullRequest: saved,
    source: 'github-webhook',
    now,
  })

  if (branch) {
    await db
      .update(githubBranches)
      .set({
        status: state === 'merged' ? 'merged' : state === 'closed' ? 'abandoned' : 'pr_opened',
        lastCommitSha: saved.headSha,
        updatedAt: now,
      })
      .where(eq(githubBranches.id, branch.id))
  }

  if (run) {
    await db
      .update(agentRuns)
      .set({
        status: FINAL_AGENT_RUN_STATUSES.has(run.status) ? run.status : 'pr_ready',
        statusMessage: pullRequestStatusMessage(saved),
        metadata: {
          ...(run.metadata ?? {}),
          workflowPhase: 'pr_ready',
          pullRequestWebhookDeliveryId: deliveryId,
          pullRequestNumber: saved.number,
          pullRequestUrl: saved.url,
          pullRequestState: saved.state,
          issueStatusSync,
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
  }

  return saved
}

function pullRequestStatusMessage(pullRequest: typeof githubPullRequests.$inferSelect) {
  if (pullRequest.state === 'merged') return `PR merged: #${pullRequest.number}`
  if (pullRequest.state === 'closed') return `PR closed: #${pullRequest.number}`
  if (pullRequest.isDraft) return `PR draft: #${pullRequest.number}`
  return `PR ready: #${pullRequest.number}`
}

async function markDeliveryProcessed(id: string) {
  await getDb()
    .update(githubWebhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(githubWebhookEvents.id, id))
}

function verifyGithubSignature({
  rawBody,
  signature,
  secret,
}: {
  rawBody: Buffer
  signature?: string
  secret: string
}) {
  if (!signature?.startsWith('sha256=')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function readPullRequestState(pullRequest: Record<string, unknown>) {
  if (readObjectString(pullRequest.merged_at)) return 'merged'
  return readObjectString(pullRequest.state) ?? 'open'
}

function readGithubObjectId(eventType: string, pullRequest: Record<string, unknown>) {
  if (eventType !== 'pull_request') return undefined
  const id = pullRequest.id
  return typeof id === 'number' || typeof id === 'string' ? String(id) : undefined
}

function readHeader(req: express.Request, name: string) {
  const value = req.header(name)
  return value?.trim() || undefined
}

function readObject(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readObjectString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readRequiredString(value: unknown, field: string) {
  const text = readObjectString(value)
  if (!text) throw new Error(`Missing ${field}`)
  return text
}

function readRequiredNumber(value: unknown, field: string) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) throw new Error(`Missing ${field}`)
  return parsed
}

function readOptionalBoolean(value: unknown, fallback: boolean | undefined) {
  return typeof value === 'boolean' ? value : fallback
}

function readOptionalDate(value: unknown) {
  const text = readObjectString(value)
  if (!text) return undefined
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export default router
