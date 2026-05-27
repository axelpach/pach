import { Router } from 'express'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import { getDb } from '../db.js'
import { agentWorkers } from '../../../db/schema.js'

const router = Router()
const execFileAsync = promisify(execFile)

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

    const now = new Date()
    await db
      .update(agentWorkers)
      .set({
        status: 'idle',
        statusMessage: `health ok: ${result.summary}`,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(agentWorkers.id, worker.id))

    res.json({
      ok: true,
      workerId: worker.id,
      host: worker.sshHost,
      user: worker.sshUser,
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

async function findExistingWorker(worker: WorkerConfig) {
  const db = getDb()
  const existing = await db.select().from(agentWorkers)
  return (
    existing.find((entry) => worker.providerServerId && entry.providerServerId === worker.providerServerId) ??
    existing.find((entry) => entry.name === worker.name) ??
    null
  )
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

function readString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing worker ${field}`)
  return value.trim()
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function runWorkerHealthCheck({ host, port, user }: { host: string; port: number; user: string }) {
  const key = await prepareSshKey()
  const keyFingerprint = key?.path ? await readKeyFingerprint(key.path) : null

  const remoteCommand = [
    'printf "hostname=%s\\n" "$(hostname)"',
    'printf "user=%s\\n" "$(whoami)"',
    'printf "pwd=%s\\n" "$PWD"',
    'printf "uptime=%s\\n" "$(uptime -p 2>/dev/null || uptime)"',
  ].join(' && ')

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

    sshArgs.push(
      `${user}@${host}`,
      remoteCommand,
    )

    const { stdout, stderr } = await execFileAsync('ssh', sshArgs, { timeout: 12_000, maxBuffer: 32_000 })

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
  } catch (error) {
    if (error instanceof Error && keyFingerprint) {
      error.message = `${error.message}\nLoaded key fingerprint: ${keyFingerprint}`
    }
    throw error
  } finally {
    if (key?.dir) await rm(key.dir, { recursive: true, force: true })
  }
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
