import { Router } from 'express'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db.js'
import { agentRunArtifacts, agentRuns, agentTerminals, agentWorkers } from '../../../db/schema.js'

const router = Router()
const execFileAsync = promisify(execFile)
const ACTIVE_RUN_STATUSES = ['queued', 'reserved', 'bootstrapping', 'running', 'needs_human', 'pr_ready'] as const

type WorkerConfig = {
  name: string
  provider?: string
  providerServerId?: string
  hostname?: string
  sshHost: string
  sshPort?: number
  sshUser?: string
  status?: string
  statusMessage?: string
  metadata?: Record<string, unknown>
}

type ArtifactConfig = {
  kind?: string
  name: string
  url?: string
  storageKey?: string
  remotePath?: string
  mimeType?: string
  sizeBytes?: number
  metadata?: Record<string, unknown>
}

type WorkerConnection = {
  host: string
  port: number
  user: string
}

router.post('/workers/sync', async (req, res) => {
  try {
    const workers = readWorkerConfigs(req.body)
    if (workers.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'No worker config found. Send { worker } or { workers } in the request body.',
      })
      return
    }

    const db = getDb()
    const synced = []

    for (const worker of workers) {
      const now = new Date()
      const existing = await findExistingWorker(worker)
      const values = {
        name: worker.name,
        provider: worker.provider ?? 'hetzner',
        providerServerId: worker.providerServerId,
        hostname: worker.hostname,
        sshHost: worker.sshHost,
        sshPort: worker.sshPort ?? 22,
        sshUser: worker.sshUser ?? 'pach',
        status: worker.status ?? 'idle',
        statusMessage: worker.statusMessage,
        metadata: worker.metadata ?? {},
        updatedAt: now,
      }

      if (existing) {
        const [updated] = await db
          .update(agentWorkers)
          .set(values)
          .where(eq(agentWorkers.id, existing.id))
          .returning()
        synced.push({ action: 'updated', worker: updated })
      } else {
        const [created] = await db
          .insert(agentWorkers)
          .values({
            ...values,
            createdAt: now,
          })
          .returning()
        synced.push({ action: 'created', worker: created })
      }
    }

    res.json({ ok: true, synced })
  } catch (error) {
    console.error('Agent worker sync failed', error)
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown agent worker sync error',
    })
  }
})

router.post('/workers/:id/health-check', async (req, res) => {
  const { id } = req.params

  try {
    const db = getDb()
    const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.id, id))

    if (!worker) {
      res.status(404).json({ ok: false, error: 'Worker not found' })
      return
    }

    const result = await runWorkerHealthCheck({
      host: worker.sshHost,
      port: worker.sshPort,
      user: worker.sshUser,
    })
    const activeRuns = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.workerId, worker.id), inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES])))
    const activeRun = activeRuns[0]

    const now = new Date()
    await db
      .update(agentWorkers)
      .set({
        status: activeRun ? worker.status : 'idle',
        statusMessage: activeRun
          ? `health ok: ${result.summary}; assigned to ${activeRun.branchName}`
          : `health ok: ${result.summary}`,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(agentWorkers.id, worker.id))

    res.json({
      ok: true,
      workerId: worker.id,
      host: worker.sshHost,
      user: worker.sshUser,
      available: !activeRun,
      activeRun: activeRun
        ? {
            id: activeRun.id,
            issueId: activeRun.issueId,
            branchName: activeRun.branchName,
            status: activeRun.status,
          }
        : null,
      ...result,
    })
  } catch (error) {
    const now = new Date()
    const message = error instanceof Error ? error.message : 'Unknown worker health check error'

    await getDb()
      .update(agentWorkers)
      .set({
        status: 'offline',
        statusMessage: message,
        updatedAt: now,
      })
      .where(eq(agentWorkers.id, id))

    res.status(502).json({
      ok: false,
      workerId: id,
      error: message,
    })
  }
})

router.post('/runs/:id/bootstrap-tmux', async (req, res) => {
  const { id } = req.params

  try {
    const db = getDb()
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id))

    if (!run) {
      res.status(404).json({ ok: false, error: 'Agent run not found' })
      return
    }

    if (!run.workerId) {
      res.status(409).json({ ok: false, error: 'Agent run has no assigned worker' })
      return
    }

    const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.id, run.workerId))

    if (!worker) {
      res.status(404).json({ ok: false, error: 'Assigned worker not found' })
      return
    }

    const terminals = await db.select().from(agentTerminals).where(eq(agentTerminals.runId, run.id))
    const sessionName = sanitizeTmuxName(run.tmuxSession ?? `pach-${run.id.slice(0, 8)}`, 'tmux session')
    const workspacePath = normalizeWorkspacePath(
      run.workspacePath ?? `/home/${worker.sshUser}/workspaces/issues/${run.id}`,
      worker.sshUser,
    )
    const remoteCommand = buildTmuxBootstrapCommand({
      sessionName,
      workspacePath,
      windows: terminals
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((terminal) => sanitizeTmuxName(terminal.tmuxWindow, 'tmux window')),
    })

    const now = new Date()
    await db
      .update(agentRuns)
      .set({
        status: 'bootstrapping',
        statusMessage: 'creating tmux session on worker',
        tmuxSession: sessionName,
        workspacePath,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))

    const result = await runSshCommand({
      host: worker.sshHost,
      port: worker.sshPort,
      user: worker.sshUser,
    }, remoteCommand, { timeout: 20_000, maxBuffer: 64_000 })

    const finishedAt = new Date()
    await db
      .update(agentRuns)
      .set({
        status: 'running',
        statusMessage: `tmux ready: ${sessionName}`,
        tmuxSession: sessionName,
        workspacePath,
        startedAt: run.startedAt ?? finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(agentRuns.id, run.id))

    await db
      .update(agentWorkers)
      .set({
        status: 'running',
        statusMessage: `running ${sessionName}`,
        lastSeenAt: finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(agentWorkers.id, worker.id))

    for (const terminal of terminals) {
      await db
        .update(agentTerminals)
        .set({
          status: 'ready',
          updatedAt: finishedAt,
        })
        .where(eq(agentTerminals.id, terminal.id))
    }

    res.json({
      ok: true,
      runId: run.id,
      workerId: worker.id,
      sessionName,
      workspacePath,
      stdout: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    const now = new Date()
    const message = error instanceof Error ? error.message : 'Unknown tmux bootstrap error'

    await getDb()
      .update(agentRuns)
      .set({
        status: 'failed',
        statusMessage: message,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, id))

    res.status(502).json({
      ok: false,
      runId: id,
      error: message,
    })
  }
})

router.post('/runs/:id/artifacts', async (req, res) => {
  const { id } = req.params

  try {
    const artifacts = readArtifactConfigs(req.body)
    if (artifacts.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'No artifact config found. Send { artifact } or { artifacts } in the request body.',
      })
      return
    }

    const db = getDb()
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id))

    if (!run) {
      res.status(404).json({ ok: false, error: 'Agent run not found' })
      return
    }

    const created = await db
      .insert(agentRunArtifacts)
      .values(
        artifacts.map((artifact) => ({
          runId: run.id,
          issueId: run.issueId,
          kind: artifact.kind ?? 'file',
          name: artifact.name,
          url: artifact.url,
          storageKey: artifact.storageKey,
          remotePath: artifact.remotePath,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
          metadata: artifact.metadata ?? {},
        })),
      )
      .returning()

    res.json({ ok: true, artifacts: created })
  } catch (error) {
    console.error('Agent artifact registration failed', error)
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown agent artifact registration error',
    })
  }
})

async function findExistingWorker(worker: WorkerConfig) {
  const db = getDb()
  const existing = await db.select().from(agentWorkers)
  return (
    existing.find((entry) => worker.providerServerId && entry.providerServerId === worker.providerServerId) ??
    existing.find((entry) => entry.name === worker.name) ??
    null
  )
}

function readArtifactConfigs(body: unknown): ArtifactConfig[] {
  if (!body || typeof body !== 'object') return []
  const raw = body as Record<string, unknown>
  const candidates = Array.isArray(raw.artifacts) ? raw.artifacts : raw.artifact ? [raw.artifact] : []
  return candidates.map(parseArtifactConfig)
}

function parseArtifactConfig(value: unknown): ArtifactConfig {
  if (!value || typeof value !== 'object') throw new Error('Artifact config must be an object')
  const raw = value as Record<string, unknown>
  const sizeBytes = raw.sizeBytes == null ? undefined : Number(raw.sizeBytes)

  if (sizeBytes !== undefined && (!Number.isFinite(sizeBytes) || sizeBytes < 0)) {
    throw new Error('Artifact sizeBytes must be a positive number')
  }

  return {
    kind: readOptionalString(raw.kind),
    name: readString(raw.name, 'name', 'artifact'),
    url: readOptionalString(raw.url),
    storageKey: readOptionalString(raw.storageKey),
    remotePath: readOptionalString(raw.remotePath),
    mimeType: readOptionalString(raw.mimeType),
    sizeBytes,
    metadata: typeof raw.metadata === 'object' && raw.metadata ? (raw.metadata as Record<string, unknown>) : undefined,
  }
}

function readWorkerConfigs(body: unknown): WorkerConfig[] {
  if (!body || typeof body !== 'object') return []
  const raw = body as Record<string, unknown>
  const candidates = Array.isArray(raw.workers) ? raw.workers : raw.worker ? [raw.worker] : []
  return candidates.map(parseWorkerConfig)
}

function parseWorkerConfig(value: unknown): WorkerConfig {
  if (!value || typeof value !== 'object') throw new Error('Worker config must be an object')
  const raw = value as Record<string, unknown>

  const name = readString(raw.name, 'name')
  const sshHost = readString(raw.sshHost, 'sshHost')
  const sshPort = raw.sshPort == null ? undefined : Number(raw.sshPort)

  if (sshPort !== undefined && (!Number.isInteger(sshPort) || sshPort <= 0)) {
    throw new Error(`Invalid sshPort for worker ${name}`)
  }

  return {
    name,
    provider: readOptionalString(raw.provider),
    providerServerId: readOptionalString(raw.providerServerId),
    hostname: readOptionalString(raw.hostname),
    sshHost,
    sshPort,
    sshUser: readOptionalString(raw.sshUser),
    status: readOptionalString(raw.status),
    statusMessage: readOptionalString(raw.statusMessage),
    metadata: typeof raw.metadata === 'object' && raw.metadata ? (raw.metadata as Record<string, unknown>) : undefined,
  }
}

function readString(value: unknown, field: string, subject = 'worker') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${subject} ${field}`)
  return value.trim()
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function runWorkerHealthCheck({ host, port, user }: { host: string; port: number; user: string }) {
  const remoteCommand = [
    'printf "hostname=%s\\n" "$(hostname)"',
    'printf "user=%s\\n" "$(whoami)"',
    'printf "pwd=%s\\n" "$PWD"',
    'printf "uptime=%s\\n" "$(uptime -p 2>/dev/null || uptime)"',
  ].join(' && ')

  const { stdout, stderr, keyFingerprint } = await runSshCommand({ host, port, user }, remoteCommand, {
    timeout: 12_000,
    maxBuffer: 32_000,
  })

  const fields = parseKeyValueOutput(stdout)
  return {
    hostname: fields.hostname,
    remoteUser: fields.user,
    pwd: fields.pwd,
    uptime: fields.uptime,
    stdout,
    stderr,
    keyFingerprint,
    summary: `${fields.hostname ?? host} as ${fields.user ?? user}`,
  }
}

async function runSshCommand(
  { host, port, user }: WorkerConnection,
  remoteCommand: string,
  options: { timeout: number; maxBuffer: number },
) {
  const key = await prepareSshKey()
  const keyFingerprint = key?.path ? await readKeyFingerprint(key.path) : null

  try {
    const sshArgs = [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=8',
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-p',
      String(port),
    ]

    if (key?.path) sshArgs.push('-i', key.path)

    sshArgs.push(`${user}@${host}`, remoteCommand)

    const { stdout, stderr } = await execFileAsync('ssh', sshArgs, options)
    return { stdout, stderr, keyFingerprint }
  } catch (error) {
    if (error instanceof Error && keyFingerprint) {
      error.message = `${error.message}\nLoaded key fingerprint: ${keyFingerprint}`
    }
    throw error
  } finally {
    if (key?.dir) await rm(key.dir, { recursive: true, force: true })
  }
}

function buildTmuxBootstrapCommand({
  sessionName,
  workspacePath,
  windows,
}: {
  sessionName: string
  workspacePath: string
  windows: string[]
}) {
  const uniqueWindows = Array.from(new Set(windows.length > 0 ? windows : ['shell']))
  const firstWindow = uniqueWindows[0]
  const session = shellQuote(sessionName)
  const workspace = shellQuote(workspacePath)
  const commands = [
    'set -eu',
    'command -v tmux >/dev/null 2>&1 || { echo "missing tmux"; exit 42; }',
    `mkdir -p ${workspace}`,
    `tmux has-session -t ${session} 2>/dev/null || tmux new-session -d -s ${session} -n ${shellQuote(firstWindow)} -c ${workspace}`,
  ]

  for (const window of uniqueWindows) {
    const quotedWindow = shellQuote(window)
    const target = shellQuote(`${sessionName}:${window}`)
    commands.push(`tmux list-windows -t ${session} -F '#W' | grep -Fxq ${quotedWindow} || tmux new-window -t ${session} -n ${quotedWindow} -c ${workspace}`)
    commands.push(`tmux send-keys -t ${target} ${shellQuote(`cd ${shellQuote(workspacePath)}`)} C-m`)
  }

  commands.push(`printf "tmux_session=%s\\n" ${session}`)
  commands.push(`printf "workspace=%s\\n" ${workspace}`)
  commands.push(`printf "windows=%s\\n" ${shellQuote(uniqueWindows.join(','))}`)

  return commands.join('\n')
}

function sanitizeTmuxName(value: string, label: string) {
  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw new Error(`Invalid ${label}: use letters, numbers, dots, underscores, or hyphens`)
  }
  return trimmed
}

function normalizeWorkspacePath(path: string, sshUser: string) {
  const trimmed = path.trim()
  if (trimmed.startsWith('/workspaces/')) return `/home/${sshUser}${trimmed}`
  if (trimmed.startsWith(`/home/${sshUser}/`)) return trimmed
  throw new Error(`Invalid workspace path: ${trimmed}`)
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function parseKeyValueOutput(output: string) {
  const result: Record<string, string> = {}
  for (const line of output.split('\n')) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    result[line.slice(0, index)] = line.slice(index + 1)
  }
  return result
}

async function prepareSshKey() {
  const rawKey = readSshPrivateKey()

  if (!rawKey) return null

  const dir = await mkdtemp(join(tmpdir(), 'pach-agent-ssh-'))
  const path = join(dir, 'id')
  const key = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey
  await writeFile(path, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 })
  return { dir, path }
}

async function readKeyFingerprint(path: string) {
  try {
    const { stdout } = await execFileAsync('ssh-keygen', ['-lf', path], { timeout: 4_000, maxBuffer: 8_000 })
    return stdout.trim()
  } catch {
    return 'unavailable'
  }
}

function readSshPrivateKey() {
  if (process.env.PACH_AGENT_SSH_PRIVATE_KEY_B64) {
    return decodeSshPrivateKey(process.env.PACH_AGENT_SSH_PRIVATE_KEY_B64)
  }

  const raw = process.env.PACH_AGENT_SSH_PRIVATE_KEY
  if (!raw) return null

  const normalized = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
  if (normalized.includes('PRIVATE KEY')) return normalized

  return decodeSshPrivateKey(normalized)
}

function decodeSshPrivateKey(value: string) {
  const decoded = Buffer.from(value.replace(/\s+/g, ''), 'base64').toString('utf8')
  return decoded.replace(/\r\n/g, '\n')
}

export default router
