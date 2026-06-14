import 'dotenv/config'
import { hostname } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

type WorkerRecord = {
  id: string
  name: string
}

type AgentRunRecord = {
  id: string
  issueId: string
  branchName: string
  metadata?: Record<string, unknown>
}

const apiUrl = readEnv('PACH_API_URL', 'http://localhost:3002').replace(/\/$/, '')
const token = process.env.PACH_AGENT_TOKEN || process.env.PACH_MCP_TOKEN
const workerName = readEnv('PACH_AGENT_WORKER_NAME', hostname())
const provider = readEnv('PACH_AGENT_PROVIDER', 'local')
const providerServerId = process.env.PACH_AGENT_PROVIDER_SERVER_ID
const pollMs = readPositiveInteger(process.env.PACH_AGENT_POLL_MS, 5_000)
const once = process.argv.includes('--once')
const capabilities = readListEnv('PACH_AGENT_CAPABILITIES', ['codex.local', 'git', 'pach-mcp'])
const limits = {
  coding: readPositiveInteger(process.env.PACH_AGENT_LIMIT_CODING, 1),
  general: readPositiveInteger(process.env.PACH_AGENT_LIMIT_GENERAL, 3),
}

if (!token) {
  console.error('Missing PACH_AGENT_TOKEN or PACH_MCP_TOKEN.')
  process.exit(1)
}

let workerId = process.env.PACH_AGENT_WORKER_ID || ''

console.log(`pach-agent starting: ${workerName}`)
console.log(`api: ${apiUrl}`)
console.log(`capabilities: ${capabilities.join(', ')}`)
console.log(`limits: coding=${limits.coding}, general=${limits.general}`)

while (true) {
  try {
    const worker = await heartbeat()
    workerId = worker.id

    const run = await claimRun(worker.id)
    if (run) {
      await executeSmokeRun(worker, run)
    } else {
      console.log(`[${new Date().toISOString()}] no claimable runs`)
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] pach-agent error:`, error instanceof Error ? error.message : error)
  }

  if (once) break
  await sleep(pollMs)
}

async function heartbeat() {
  const payload = await postJson<{ worker: WorkerRecord }>('/agent-worker/heartbeat', {
    workerId: workerId || undefined,
    name: workerName,
    provider,
    providerServerId,
    hostname: hostname(),
    capabilities,
    limits,
    runtime: {
      kind: 'pach-agent',
      version: '0.1.0',
      pid: process.pid,
    },
  })

  console.log(`[${new Date().toISOString()}] heartbeat ok: ${payload.worker.name} (${payload.worker.id})`)
  return payload.worker
}

async function claimRun(nextWorkerId: string) {
  const payload = await postJson<{ run: AgentRunRecord | null }>('/agent-worker/runs/claim', {
    workerId: nextWorkerId,
    capabilities,
  })

  return payload.run
}

async function executeSmokeRun(worker: WorkerRecord, run: AgentRunRecord) {
  console.log(`[${new Date().toISOString()}] claimed run ${run.id} for issue ${run.issueId}`)

  await postJson(`/agent-worker/runs/${run.id}/progress`, {
    workerId: worker.id,
    phase: 'smoke_start',
    message: `pach-agent ${worker.name} claimed run ${run.id}`,
    metadata: {
      smoke: true,
    },
  })

  await sleep(1_000)

  await postJson(`/agent-worker/runs/${run.id}/complete`, {
    workerId: worker.id,
    status: 'completed',
    message: `pach-agent ${worker.name} completed smoke run`,
    metadata: {
      smoke: true,
    },
  })

  console.log(`[${new Date().toISOString()}] completed smoke run ${run.id}`)
}

async function postJson<T = unknown>(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `HTTP ${res.status}`
    throw new Error(`${path}: ${message}`)
  }

  return payload as T
}

function readEnv(name: string, fallback: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : fallback
}

function readListEnv(name: string, fallback: string[]) {
  const value = process.env[name]
  if (!value?.trim()) return fallback
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
