import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { and, eq } from 'drizzle-orm'
import {
  agentRunProgressReports,
  agentRuns,
  agentWorkers,
  githubBranches,
  githubPullRequests,
  pmIssues,
} from '../../../db/schema.js'
import { getDb } from '../db.js'
import { readGithubTokenForRepository } from './github-credentials.js'
import { syncIssueStatusForPullRequest } from './pull-request-issue-status.js'

const execFileAsync = promisify(execFile)

type WorkerConnection = {
  host: string
  port: number
  user: string
}

type GithubPullRequestResponse = {
  id: number
  number: number
  html_url: string
  title: string
  state: string
  draft?: boolean
  mergeable?: boolean | null
  merged_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  head?: {
    sha?: string
  }
  base?: {
    ref?: string
  }
}

export async function finalizeAgentRunPullRequest({
  runId,
  title,
  activitySource = 'agent-pr-finalizer',
}: {
  runId: string
  title?: string
  activitySource?: string
}) {
  const db = getDb()
  const { run, worker } = await readRunWorker(runId)
  const githubToken = await readGithubTokenForRepository(run.repositoryId)
  if (!githubToken) throw new Error('No GitHub token available for this repository connection')
  if (!run.repositoryId) throw new Error('Agent run has no repositoryId')
  if (!run.workspacePath) throw new Error('Agent run has no prepared workspacePath')

  const [issue] = run.issueId
    ? await db.select().from(pmIssues).where(eq(pmIssues.id, run.issueId))
    : []
  const [branch] = await db.select().from(githubBranches).where(eq(githubBranches.agentRunId, run.id))
  const prTitle = title?.trim() || issue?.title || run.branchName
  const now = new Date()

  await appendRunProgressReport(run, {
    workerId: run.workerId ?? undefined,
    phase: 'pull_request_prepare',
    message: 'Preparing branch for pull request.',
    metadata: {
      source: activitySource,
      branchName: run.branchName,
      repoFullName: run.repoFullName,
    },
  })

  const pushResult = await runSshCommand(
    { host: worker.sshHost, port: worker.sshPort, user: worker.sshUser },
    buildFinalizeBranchCommand({
      workspacePath: normalizeWorkspacePath(run.workspacePath, worker.sshUser),
      branchName: run.branchName,
      commitMessage: prTitle,
      githubToken,
    }),
    { timeout: 180_000, maxBuffer: 2_000_000 },
  )

  const existingPr = await fetchOpenGithubPullRequestForBranch({
    repoFullName: run.repoFullName,
    branchName: run.branchName,
    token: githubToken,
  })
  const pr = existingPr ?? await createGithubPullRequest({
    repoFullName: run.repoFullName,
    branchName: run.branchName,
    baseBranch: run.baseBranch,
    title: prTitle,
    body: buildPullRequestBody({ run, issue }),
    token: githubToken,
  })

  const saved = await upsertPullRequest({
    run,
    branchId: branch?.id,
    pr,
    now,
  })
  const issueStatusSync = await syncIssueStatusForPullRequest({
    issueId: saved.issueId,
    pullRequest: saved,
    source: activitySource,
    now,
  })

  if (branch) {
    await db
      .update(githubBranches)
      .set({ status: saved.state === 'merged' ? 'merged' : 'pr_opened', updatedAt: now })
      .where(eq(githubBranches.id, branch.id))
  }

  await db
    .update(agentRuns)
    .set({
      status: 'pr_ready',
      statusMessage: pullRequestStatusMessage(saved),
      metadata: {
        ...(run.metadata ?? {}),
        workflowPhase: 'pr_ready',
        pullRequestCreatedAt: now.toISOString(),
        pullRequestNumber: saved.number,
        pullRequestUrl: saved.url,
        pullRequestState: saved.state,
        issueStatusSync,
      },
      updatedAt: now,
    })
    .where(eq(agentRuns.id, run.id))

  await appendRunProgressReport(run, {
    workerId: run.workerId ?? undefined,
    phase: 'pull_request_ready',
    message: pullRequestStatusMessage(saved),
    percent: 100,
    metadata: {
      source: activitySource,
      pullRequestId: saved.id,
      pullRequestNumber: saved.number,
      pullRequestUrl: saved.url,
      issueStatusSync,
      stdout: pushResult.stdout,
      stderr: pushResult.stderr,
    },
  })

  return {
    run,
    pullRequest: saved,
    stdout: pushResult.stdout,
    stderr: pushResult.stderr,
    keyFingerprint: pushResult.keyFingerprint,
  }
}

async function readRunWorker(runId: string) {
  const db = getDb()
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId))
  if (!run) throw new Error('Agent run not found')
  if (!run.workerId) throw new Error('Agent run has no assigned worker')

  const [worker] = await db.select().from(agentWorkers).where(eq(agentWorkers.id, run.workerId))
  if (!worker) throw new Error('Assigned worker not found')

  return { run, worker }
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
    issueId: run.issueId,
    workerId: report.workerId,
    phase: report.phase,
    level: report.level ?? 'info',
    message: report.message,
    percent: report.percent,
    metadata: report.metadata ?? {},
    createdAt: new Date(),
  })
}

async function runSshCommand(
  { host, port, user }: WorkerConnection,
  remoteCommand: string,
  options: { timeout: number; maxBuffer: number },
) {
  const key = await prepareSshKey()
  const keyFingerprint = key?.path ? await readKeyFingerprint(key.path) : null

  try {
    const sshArgs = buildSshArgs({ host, port, user }, key?.path ?? null)
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

function buildSshArgs({ port }: WorkerConnection, keyPath: string | null) {
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

  if (keyPath) sshArgs.push('-i', keyPath)
  return sshArgs
}

function buildFinalizeBranchCommand({
  workspacePath,
  branchName,
  commitMessage,
  githubToken,
}: {
  workspacePath: string
  branchName: string
  commitMessage: string
  githubToken: string
}) {
  const workspace = shellQuote(workspacePath)
  const branch = shellQuote(branchName)
  const message = shellQuote(commitMessage)
  return [
    'set -eu',
    'command -v git >/dev/null 2>&1 || { echo "missing git"; exit 42; }',
    `PACH_GITHUB_TOKEN=${shellQuote(githubToken)}`,
    'export PACH_GITHUB_TOKEN',
    'ASKPASS="$(mktemp)"',
    'cat > "$ASKPASS" <<\'PACH_ASKPASS\'',
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "x-access-token" ;;',
    '  *) printf "%s\\n" "$PACH_GITHUB_TOKEN" ;;',
    'esac',
    'PACH_ASKPASS',
    'chmod 700 "$ASKPASS"',
    'export GIT_ASKPASS="$ASKPASS"',
    'export GIT_TERMINAL_PROMPT=0',
    'cleanup() { rm -f "$ASKPASS"; }',
    'trap cleanup EXIT',
    `git -C ${workspace} checkout ${branch}`,
    `git -C ${workspace} config user.name "Pach Agent"`,
    `git -C ${workspace} config user.email "agent@pach.world"`,
    `git -C ${workspace} add -A`,
    `if ! git -C ${workspace} diff --cached --quiet; then git -C ${workspace} commit -m ${message}; fi`,
    `git -C ${workspace} push -u origin ${branch}`,
    `git -C ${workspace} status --short --branch`,
  ].join('\n')
}

async function fetchOpenGithubPullRequestForBranch({
  repoFullName,
  branchName,
  token,
}: {
  repoFullName: string
  branchName: string
  token: string
}) {
  const { owner } = parseRepoFullName(repoFullName)
  const url = new URL(`https://api.github.com/repos/${repoFullName}/pulls`)
  url.searchParams.set('state', 'open')
  url.searchParams.set('head', `${owner}:${branchName}`)
  url.searchParams.set('per_page', '1')

  const response = await fetch(url, {
    headers: githubApiHeaders(token),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub open PR lookup failed: ${response.status} ${body.slice(0, 240)}`)
  }

  const prs = (await response.json()) as GithubPullRequestResponse[]
  return prs[0] ?? null
}

async function createGithubPullRequest({
  repoFullName,
  branchName,
  baseBranch,
  title,
  body,
  token,
}: {
  repoFullName: string
  branchName: string
  baseBranch: string
  title: string
  body: string
  token: string
}) {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
    method: 'POST',
    headers: githubApiHeaders(token),
    body: JSON.stringify({
      title,
      body,
      head: branchName,
      base: baseBranch,
      draft: false,
    }),
  })
  if (!response.ok) {
    const responseBody = await response.text()
    throw new Error(`GitHub PR creation failed: ${response.status} ${responseBody.slice(0, 240)}`)
  }

  return (await response.json()) as GithubPullRequestResponse
}

async function upsertPullRequest({
  run,
  branchId,
  pr,
  now,
}: {
  run: typeof agentRuns.$inferSelect
  branchId?: string
  pr: GithubPullRequestResponse
  now: Date
}) {
  if (!run.repositoryId) throw new Error('Agent run has no repositoryId')

  const db = getDb()
  const values = {
    repositoryId: run.repositoryId,
    branchId,
    agentRunId: run.id,
    issueId: run.issueId,
    githubId: String(pr.id),
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    state: pr.merged_at ? 'merged' : pr.state,
    isDraft: Boolean(pr.draft),
    mergeable: pr.mergeable,
    headSha: pr.head?.sha,
    baseBranch: pr.base?.ref ?? run.baseBranch,
    checksStatus: 'unknown',
    githubCreatedAt: pr.created_at ? new Date(pr.created_at) : undefined,
    githubUpdatedAt: pr.updated_at ? new Date(pr.updated_at) : undefined,
    updatedAt: now,
  }

  const [existing] = await db
    .select()
    .from(githubPullRequests)
    .where(and(eq(githubPullRequests.repositoryId, run.repositoryId), eq(githubPullRequests.number, pr.number)))

  const [saved] = existing
    ? await db.update(githubPullRequests).set(values).where(eq(githubPullRequests.id, existing.id)).returning()
    : await db.insert(githubPullRequests).values({ ...values, createdAt: now }).returning()

  return saved
}

function buildPullRequestBody({
  run,
  issue,
}: {
  run: typeof agentRuns.$inferSelect
  issue?: typeof pmIssues.$inferSelect
}) {
  const goal = readMetadataString(run.metadata, 'latestGoal')
  return [
    issue ? `Pach issue: ${issue.identifier}` : null,
    '',
    goal ? `Goal:\n${goal}` : null,
    '',
    'Created by Pach agent workflow.',
    '',
    'Review checklist:',
    '- [ ] Review implementation',
    '- [ ] Confirm relevant checks',
    '- [ ] Mark ready for review when validated',
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

function pullRequestStatusMessage(pullRequest: typeof githubPullRequests.$inferSelect) {
  if (pullRequest.state === 'merged') return `PR merged: #${pullRequest.number}`
  if (pullRequest.state === 'closed') return `PR closed: #${pullRequest.number}`
  if (pullRequest.isDraft) return `PR draft: #${pullRequest.number}`
  return `PR ready: #${pullRequest.number}`
}

function githubApiHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
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

function normalizeWorkspacePath(path: string, sshUser: string) {
  const normalized = path.trim()
  const allowedPrefixes = [`/home/${sshUser}/workspaces/`, `/tmp/`]
  if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(`Unsafe workspace path: ${path}`)
  }
  return normalized
}

function parseRepoFullName(fullName: string) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(fullName)
  if (!match) throw new Error(`Invalid repo full name: ${fullName}`)
  return { owner: match[1], name: match[2] }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}
