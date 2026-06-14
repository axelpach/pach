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

type CancelState = {
  cancelRequested: boolean
  reason?: string
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
const codexFullTrust = readBooleanEnv('PACH_AGENT_CODEX_FULL_TRUST', true)

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
console.log(`codex trust: ${codexFullTrust ? 'full' : 'configured'}`)

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
      codexFullTrust,
    },
  })

  try {
    const prompt = buildGeneralMcpPrompt(run)
    const startedAt = Date.now()
    const { stdout, stderr } = await runCodexExec(prompt, run.metadata, worker, run)
    const durationMs = Date.now() - startedAt
    const finalMessage = summarizeCodexOutput(stdout) || `Codex completed general MCP run ${run.id}`
    const codexSessionId = readCodexSessionId(stdout, stderr) ?? readMetadataString(run.metadata, 'codexSessionId')

    await reportRunProgress(worker, run, {
      phase: 'final_result',
      message: finalMessage,
      percent: 100,
      metadata: {
        durationMs,
        codexSessionId,
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
        codexSessionId,
        stdout: truncateText(stdout, 20_000),
        stderr: truncateText(stderr, 10_000),
      },
    })

    console.log(`[${new Date().toISOString()}] completed general MCP run ${run.id}`)
  } catch (error) {
    const canceled = readExecCanceled(error)
    const message = canceled
      ? 'Codex run canceled by user request'
      : error instanceof Error ? error.message : 'Codex general MCP run failed'
    const output = readExecErrorOutput(error)

    await reportRunProgress(worker, run, {
      phase: canceled ? 'canceled' : 'codex_failed',
      message,
      percent: canceled ? 100 : undefined,
      metadata: output,
    }).catch((progressError) => {
      console.error(
        `[${new Date().toISOString()}] failed to report Codex ${canceled ? 'cancellation' : 'error'}:`,
        progressError instanceof Error ? progressError.message : progressError,
      )
    })

    await postJson(`/agent-worker/runs/${run.id}/complete`, {
      workerId: worker.id,
      status: canceled ? 'canceled' : 'failed',
      message,
      metadata: {
        handler: 'general-mcp',
        canceled,
        ...output,
      },
    })

    console.error(`[${new Date().toISOString()}] ${canceled ? 'canceled' : 'failed'} general MCP run ${run.id}: ${message}`)
  }
}

async function runCodexExec(
  prompt: string,
  metadata: Record<string, unknown> | undefined,
  worker: WorkerRecord,
  run: AgentRunRecord,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let interrupted: string | null = null
    let cancelPollBusy = false
    let cancellationStarted = false

    const args = buildCodexExecArgs(prompt, metadata)
    console.log(`[${new Date().toISOString()}] starting: ${codexCommand} ${args.slice(0, -1).join(' ')} <prompt>`)

    const child = spawn(codexCommand, args, {
      env: {
        ...process.env,
        PACH_MCP_TOKEN: agentToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const requestChildStop = (reason: string) => {
      if (cancellationStarted) return
      cancellationStarted = true
      interrupted = reason
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }

    const timeout = setTimeout(() => {
      timedOut = true
      requestChildStop('timeout')
    }, codexTimeoutMs)
    timeout.unref()

    const cancelPoll = setInterval(() => {
      if (cancelPollBusy || cancellationStarted) return
      cancelPollBusy = true
      checkCancelState(worker, run)
        .then((state) => {
          if (!state.cancelRequested) return
          console.log(`[${new Date().toISOString()}] cancel requested for run ${run.id}: ${state.reason ?? 'no reason'}`)
          requestChildStop('cancel_requested')
        })
        .catch((error) => {
          console.error(
            `[${new Date().toISOString()}] failed to check cancel state for ${run.id}:`,
            error instanceof Error ? error.message : error,
          )
        })
        .finally(() => {
          cancelPollBusy = false
        })
    }, 2_000)
    cancelPoll.unref()

    const handleSignal = (signal: NodeJS.Signals) => {
      requestChildStop(signal)
    }

    process.once('SIGINT', handleSignal)
    process.once('SIGTERM', handleSignal)

    const cleanup = () => {
      clearTimeout(timeout)
      clearInterval(cancelPoll)
      process.off('SIGINT', handleSignal)
      process.off('SIGTERM', handleSignal)
    }

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
      cleanup()
      reject(Object.assign(error, { stdout, stderr }))
    })

    child.on('close', (code, signal) => {
      cleanup()

      if (timedOut) {
        reject(Object.assign(new Error(`Codex timed out after ${codexTimeoutMs}ms`), { stdout, stderr, signal }))
        return
      }

      if (interrupted) {
        reject(Object.assign(new Error(`Codex interrupted by ${interrupted}`), {
          stdout,
          stderr,
          signal: interrupted,
          canceled: interrupted === 'cancel_requested',
        }))
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

async function checkCancelState(worker: WorkerRecord, run: AgentRunRecord) {
  return postJson<CancelState>(`/agent-worker/runs/${run.id}/cancel-state`, {
    workerId: worker.id,
  })
}

function buildCodexExecArgs(prompt: string, metadata?: Record<string, unknown>) {
  const sessionId = readMetadataString(metadata, 'codexSessionId')
  const args = sessionId ? ['exec', 'resume'] : ['exec']
  if (codexFullTrust) args.push('--dangerously-bypass-approvals-and-sandbox')
  if (sessionId) args.push(sessionId)
  args.push(prompt)
  return args
}

async function reportRunProgress(
  worker: WorkerRecord,
  run: AgentRunRecord,
  progress: {
    phase: string
    message: string
    percent?: number
    metadata?: Record<string, unknown>
  },
) {
  await postJson(`/agent-worker/runs/${run.id}/progress`, {
    workerId: worker.id,
    ...progress,
  })
}

function buildGeneralMcpPrompt(run: AgentRunRecord) {
  const feedback = readMetadataString(run.metadata, 'feedback')
  const parentRunId = readMetadataString(run.metadata, 'parentRunId')
  return [
    'You are Pach general MCP issue worker.',
    '',
    'Use Pach MCP tools for Pach state. You may call Pach MCP tools directly and repeatedly as needed.',
    'For this worker, Codex is running with full local trust. Still act conservatively: do not send external messages, publish content, push code, open pull requests, or perform irreversible external actions unless the issue explicitly asks for it.',
    `Issue id: ${run.issueId}`,
    `Agent run id: ${run.id}`,
    parentRunId ? `Parent run id: ${parentRunId}` : null,
    feedback ? `User feedback: ${feedback}` : null,
    '',
    'Workflow:',
    feedback
      ? '1. Continue from the previous session if available, and use the user feedback above as the latest instruction.'
      : '1. Read the issue with pach.issue.get using the issue id above.',
    '2. Report progress with pach.progress.report and include the agent run id.',
    '3. Do the requested analysis or light Pach-state work that can be done through MCP.',
    '4. Put the final result in pach.progress.report with phase "final_result".',
    '5. If you update issue fields, use pach.issue.update and explain the change in activitySummary.',
    '',
    'Keep the final result concise and useful inside the Pach run progress stream.',
  ].filter((line): line is string => Boolean(line)).join('\n')
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

function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name]
  if (!value) return fallback
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false
  return fallback
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

function readCodexSessionId(stdout: string, stderr: string) {
  const match = `${stdout}\n${stderr}`.match(/session id:\s*([0-9a-f-]{20,})/i)
  return match?.[1] ?? null
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

function readExecCanceled(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { canceled?: unknown }).canceled === true)
}
