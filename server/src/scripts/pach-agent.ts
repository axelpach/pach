import 'dotenv/config'
import { spawn } from 'node:child_process'
import { hostname } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

type WorkerRecord = {
  id: string
  name: string
}

type CommandResult = {
  stdout: string
  stderr: string
}

type AgentRunRecord = {
  id: string
  issueId: string
  branchName: string
  metadata?: Record<string, unknown>
}

const apiUrl = readEnv('PACH_API_URL', 'http://localhost:3002').replace(/\/$/, '')
const agentToken = process.env.PACH_AGENT_TOKEN || process.env.PACH_MCP_TOKEN
const workerName = readEnv('PACH_AGENT_WORKER_NAME', hostname())
const provider = readEnv('PACH_AGENT_PROVIDER', 'local')
const providerServerId = process.env.PACH_AGENT_PROVIDER_SERVER_ID
const pollMs = readPositiveInteger(process.env.PACH_AGENT_POLL_MS, 5_000)
const once = process.argv.includes('--once')
const smokeOnly = process.argv.includes('--smoke') || process.env.PACH_AGENT_SMOKE_ONLY === 'true'
const capabilities = readListEnv('PACH_AGENT_CAPABILITIES', ['codex.local', 'git', 'pach-mcp'])
const limits = {
  coding: readPositiveInteger(process.env.PACH_AGENT_LIMIT_CODING, 1),
  general: readPositiveInteger(process.env.PACH_AGENT_LIMIT_GENERAL, 3),
}
const codexCommand = readEnv('PACH_AGENT_CODEX_COMMAND', 'codex')
const codexTimeoutMs = readPositiveInteger(process.env.PACH_AGENT_CODEX_TIMEOUT_MS, 10 * 60 * 1_000)

if (!agentToken) {
  console.error('Missing PACH_AGENT_TOKEN or PACH_MCP_TOKEN.')
  process.exit(1)
}

let workerId = process.env.PACH_AGENT_WORKER_ID || ''

console.log(`pach-agent starting: ${workerName}`)
console.log(`api: ${apiUrl}`)
console.log(`capabilities: ${capabilities.join(', ')}`)
console.log(`limits: coding=${limits.coding}, general=${limits.general}`)
console.log(`mode: ${smokeOnly ? 'smoke' : 'general handler'}`)

while (true) {
  try {
    const worker = await heartbeat()
    workerId = worker.id

    const run = await claimRun(worker.id)
    if (run) {
      await executeRun(worker, run)
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

async function executeRun(worker: WorkerRecord, run: AgentRunRecord) {
  const executionClass = readMetadataString(run.metadata, 'executionClass') ?? 'coding'
  if (smokeOnly || executionClass !== 'general') {
    await executeSmokeRun(worker, run)
    return
  }

  await executeGeneralMcpRun(worker, run)
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

async function executeGeneralMcpRun(worker: WorkerRecord, run: AgentRunRecord) {
  console.log(`[${new Date().toISOString()}] claimed general MCP run ${run.id} for issue ${run.issueId}`)

  await reportRunProgress(worker, run, {
    phase: 'codex_start',
    message: `starting Codex general MCP handler on ${worker.name}`,
    metadata: {
      handler: 'general-mcp',
      codexCommand,
    },
  })

  try {
    const prompt = buildGeneralMcpPrompt(run)
    const startedAt = Date.now()
    const { stdout, stderr } = await runCodexExec(prompt)
    const durationMs = Date.now() - startedAt
    const finalMessage = summarizeCodexOutput(stdout) || `Codex completed general MCP run ${run.id}`

    await reportRunProgress(worker, run, {
      phase: 'codex_complete',
      message: finalMessage,
      metadata: {
        durationMs,
        stdout: truncateText(stdout, 20_000),
        stderr: truncateText(stderr, 10_000),
      },
    })

    await postJson(`/agent-worker/runs/${run.id}/complete`, {
      workerId: worker.id,
      status: 'completed',
      message: finalMessage,
      metadata: {
        handler: 'general-mcp',
        durationMs,
        stdout: truncateText(stdout, 20_000),
        stderr: truncateText(stderr, 10_000),
      },
    })

    console.log(`[${new Date().toISOString()}] completed general MCP run ${run.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Codex general MCP run failed'
    const output = readExecErrorOutput(error)

    await reportRunProgress(worker, run, {
      phase: 'codex_failed',
      message,
      metadata: output,
    }).catch((progressError) => {
      console.error(
        `[${new Date().toISOString()}] failed to report Codex error:`,
        progressError instanceof Error ? progressError.message : progressError,
      )
    })

    await postJson(`/agent-worker/runs/${run.id}/complete`, {
      workerId: worker.id,
      status: 'failed',
      message,
      metadata: {
        handler: 'general-mcp',
        ...output,
      },
    })

    console.error(`[${new Date().toISOString()}] failed general MCP run ${run.id}: ${message}`)
  }
}

async function runCodexExec(prompt: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let interrupted: string | null = null

    console.log(`[${new Date().toISOString()}] starting: ${codexCommand} exec <prompt>`)

    const child = spawn(codexCommand, ['exec', prompt], {
      env: {
        ...process.env,
        PACH_MCP_TOKEN: agentToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }, codexTimeoutMs)
    timeout.unref()

    const handleSignal = (signal: NodeJS.Signals) => {
      interrupted = signal
      child.kill('SIGTERM')
    }

    process.once('SIGINT', handleSignal)
    process.once('SIGTERM', handleSignal)

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      process.off('SIGINT', handleSignal)
      process.off('SIGTERM', handleSignal)
      reject(Object.assign(error, { stdout, stderr }))
    })

    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      process.off('SIGINT', handleSignal)
      process.off('SIGTERM', handleSignal)

      if (interrupted) {
        reject(Object.assign(new Error(`Codex interrupted by ${interrupted}`), { stdout, stderr, signal: interrupted }))
        return
      }

      if (timedOut) {
        reject(Object.assign(new Error(`Codex timed out after ${codexTimeoutMs}ms`), { stdout, stderr, signal }))
        return
      }

      if (code && code !== 0) {
        reject(Object.assign(new Error(`Codex exited with code ${code}`), { stdout, stderr, code, signal }))
        return
      }

      resolve({ stdout, stderr })
    })
  })
}

async function reportRunProgress(
  worker: WorkerRecord,
  run: AgentRunRecord,
  progress: {
    phase: string
    message: string
    metadata?: Record<string, unknown>
  },
) {
  await postJson(`/agent-worker/runs/${run.id}/progress`, {
    workerId: worker.id,
    ...progress,
  })
}

function buildGeneralMcpPrompt(run: AgentRunRecord) {
  return [
    'You are Pach general MCP issue worker.',
    '',
    'Use Pach MCP tools for Pach state. Do not edit local files, use git, open pull requests, send external messages, publish content, or perform irreversible external actions in this general handler.',
    `Issue id: ${run.issueId}`,
    `Agent run id: ${run.id}`,
    '',
    'Workflow:',
    '1. Read the issue with pach.issue.get using the issue id above.',
    '2. Report progress with pach.progress.report and include the agent run id.',
    '3. Do the requested analysis or light Pach-state work that can be done through MCP.',
    '4. Put the final result in pach.progress.report with phase "final_result".',
    '5. If you update issue fields, use pach.issue.update and explain the change in activitySummary.',
    '',
    'Keep the final result concise and useful inside the Pach run progress stream.',
  ].join('\n')
}

async function postJson<T = unknown>(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${agentToken}`,
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

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function summarizeCodexOutput(output: string) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return truncateText(lines.at(-1) ?? '', 320)
}

function truncateText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function readExecErrorOutput(error: unknown) {
  if (!error || typeof error !== 'object') return {}
  const details = error as { stdout?: unknown; stderr?: unknown; code?: unknown; signal?: unknown }
  return {
    stdout: truncateText(details.stdout, 20_000),
    stderr: truncateText(details.stderr, 10_000),
    code: details.code,
    signal: details.signal,
  }
}
