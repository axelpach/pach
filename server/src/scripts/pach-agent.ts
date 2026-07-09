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
  issueId?: string | null
  subjectType?: string
  subjectId?: string | null
  repositoryId?: string | null
  repoFullName?: string
  baseBranch?: string
  branchName: string
  workspacePath?: string | null
  metadata?: Record<string, unknown>
  executionPrompt?: string | null
  executionPromptSource?: string | null
  runSpec?: AgentRunSpec | null
}

type AgentRunSpec = {
  version?: number
  promptSource?: string
  workerProtocol?: string
  agentProfile?: string
  executionMode?: string
  continuation?: {
    isContinuation?: boolean
    codexSessionId?: string | null
    feedbackMessageId?: string | null
  }
  finalization?: {
    commitAndPush?: boolean
    openPullRequest?: boolean
    pullRequestDraft?: boolean
  }
}

type CancelState = {
  cancelRequested: boolean
  reason?: string
}

type GithubCredentialHandoff = {
  token?: string | null
  source?: string | null
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
  const payload = await postJson<{
    run: AgentRunRecord | null
    executionPrompt?: string | null
    executionPromptSource?: string | null
    runSpec?: AgentRunSpec | null
  }>('/agent-worker/runs/claim', {
    workerId: nextWorkerId,
    capabilities,
  })

  if (payload.run && payload.executionPrompt?.trim()) {
    payload.run.executionPrompt = payload.executionPrompt
  }
  if (payload.run) {
    payload.run.executionPromptSource = payload.executionPromptSource
    payload.run.runSpec = payload.runSpec
  }

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
  console.log(`[${new Date().toISOString()}] claimed general MCP run ${run.id} for ${run.subjectType ?? 'issue'} ${run.subjectId ?? run.issueId ?? run.id}`)

  let codexCwd: string | undefined

  await reportRunProgress(worker, run, {
    phase: 'codex_start',
    message: `starting Codex general MCP handler on ${worker.name}`,
    metadata: {
      handler: 'general-mcp',
      codexCommand,
      codexFullTrust,
      executionPromptSource: run.executionPromptSource ?? 'unknown',
      runSpecVersion: run.runSpec?.version,
    },
  })

  try {
    if (readMetadataString(run.metadata, 'executionMode') === 'code_worktree') {
      await reportRunProgress(worker, run, {
        phase: 'repo_prepare',
        status: 'bootstrapping',
        message: `preparing ${run.repoFullName ?? 'repository'} worktree`,
        metadata: {
          repoFullName: run.repoFullName,
          branchName: run.branchName,
        },
      })

      const prepared = await prepareCodeWorktree(worker, run)
      codexCwd = prepared.workspacePath
      run.workspacePath = prepared.workspacePath

      await reportRunProgress(worker, run, {
        phase: 'repo_prepared',
        status: 'running',
        message: `repo ready: ${run.branchName}`,
        workspacePath: prepared.workspacePath,
        metadata: prepared,
      })
    }

    const prompt = resolveExecutionPrompt(run)
    const startedAt = Date.now()
    const { stdout, stderr } = await runCodexExec(prompt, run, worker, codexCwd)
    const durationMs = Date.now() - startedAt
    const finalMessage = summarizeCodexOutput(stdout) || `Codex completed general MCP run ${run.id}`
    const codexSessionId = readCodexSessionId(stdout, stderr) ?? readMetadataString(run.metadata, 'codexSessionId')
    let pullRequest: GithubPullRequestResponse | null = null
    let pullRequestError: string | null = null

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

    if (shouldFinalizePullRequest(run)) {
      try {
        pullRequest = await finalizeRunPullRequest(worker, run, finalMessage)
      } catch (error) {
        pullRequestError = error instanceof Error ? error.message : String(error)
        await reportRunProgress(worker, run, {
          phase: 'pull_request_failed',
          status: 'completed',
          message: `PR creation failed: ${pullRequestError}`,
          metadata: {
            pullRequestError,
          },
        }).catch((progressError) => {
          console.error(
            `[${new Date().toISOString()}] failed to report PR creation failure for run ${run.id}:`,
            progressError instanceof Error ? progressError.message : progressError,
          )
        })
      }
    }

    await postJson(`/agent-worker/runs/${run.id}/complete`, {
      workerId: worker.id,
      status: 'completed',
      message: finalMessage,
      metadata: {
        handler: 'general-mcp',
        durationMs,
        codexSessionId,
        pullRequest: pullRequest ? {
          id: pullRequest.id,
          number: pullRequest.number,
          url: pullRequest.html_url,
          title: pullRequest.title,
          state: pullRequest.state,
          draft: Boolean(pullRequest.draft),
        } : undefined,
        pullRequestError,
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
  run: AgentRunRecord,
  worker: WorkerRecord,
  cwd?: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let interrupted: string | null = null
    let cancelPollBusy = false
    let cancellationStarted = false

    const args = buildCodexExecArgs(prompt, run)
    console.log(`[${new Date().toISOString()}] starting: ${codexCommand} ${args.slice(0, -1).join(' ')} <prompt>`)

    const child = spawn(codexCommand, args, {
      cwd,
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

async function prepareCodeWorktree(worker: WorkerRecord, run: AgentRunRecord) {
  if (!run.repoFullName) throw new Error('Code worktree run is missing repoFullName')

  const repo = parseRepoFullName(run.repoFullName)
  const home = process.env.HOME || '/tmp'
  const repoRoot = process.env.PACH_AGENT_REPO_CACHE_ROOT || `${home}/workspaces/repos`
  const workspaceRoot = process.env.PACH_AGENT_WORKSPACE_ROOT || `${home}/workspaces/issues`
  const repoCachePath = `${repoRoot}/${repo.owner}/${repo.name}`
  const workspacePath = run.workspacePath || `${workspaceRoot}/${run.id}/${repo.name}`
  const baseBranch = run.baseBranch || 'main'
  const branchName = run.branchName
  const githubCredential = await readGithubCredentialForRun(worker, run)

  const result = await runShellCommand(buildPrepareCodeWorktreeCommand({
    repoFullName: run.repoFullName,
    repoCachePath,
    workspacePath,
    baseBranch,
    branchName,
    githubToken: githubCredential.token,
  }), { timeoutMs: 180_000 })

  return {
    repoCachePath,
    workspacePath,
    branchName,
    baseBranch,
    githubCredentialSource: githubCredential.source,
    githubCredentialHandoffError: githubCredential.handoffError,
    stdout: truncateText(result.stdout, 8_000),
    stderr: truncateText(result.stderr, 4_000),
  }
}

async function readGithubCredentialForRun(worker: WorkerRecord, run: AgentRunRecord): Promise<{
  token: string
  source: string
  handoffError?: string
}> {
  let handoffError: string | undefined

  try {
    const payload = await postJson<GithubCredentialHandoff>(`/agent-worker/runs/${run.id}/github-token`, {
      workerId: worker.id,
    })
    const token = typeof payload.token === 'string' ? payload.token.trim() : ''
    if (token) {
      return {
        token,
        source: payload.source?.trim() || 'server_handoff',
      }
    }
  } catch (error) {
    handoffError = error instanceof Error ? error.message : String(error)
  }

  const localToken = readLocalGithubToken()
  if (localToken) {
    return {
      token: localToken,
      source: handoffError ? 'local_env_after_handoff_error' : 'local_env',
      handoffError,
    }
  }

  if (handoffError) {
    throw new Error(`Could not fetch GitHub credentials for ${run.repoFullName ?? run.id}: ${handoffError}`)
  }

  return {
    token: '',
    source: 'none',
  }
}

async function finalizeRunPullRequest(worker: WorkerRecord, run: AgentRunRecord, finalMessage: string) {
  if (!run.repoFullName) throw new Error('Cannot create PR without repoFullName')
  if (!run.workspacePath) throw new Error('Cannot create PR without prepared workspacePath')

  const githubCredential = await readGithubCredentialForRun(worker, run)
  if (!githubCredential.token) throw new Error(`No GitHub token available for ${run.repoFullName}`)

  await reportRunProgress(worker, run, {
    phase: 'pull_request_prepare',
    status: 'running',
    message: `preparing PR for ${run.branchName}`,
    metadata: {
      repoFullName: run.repoFullName,
      branchName: run.branchName,
      githubCredentialSource: githubCredential.source,
    },
  })

  const title = titleFromBranchName(run.branchName)
  let pushResult: CommandResult | null = null

  try {
    pushResult = await runShellCommand(buildFinalizePullRequestBranchCommand({
      workspacePath: run.workspacePath,
      branchName: run.branchName,
      baseBranch: run.baseBranch || 'main',
      commitMessage: title,
      githubToken: githubCredential.token,
    }), { timeoutMs: 180_000 })
  } catch (error) {
    if (readShellExitCode(error) !== 44) throw error

    const existing = await fetchGithubPullRequestForBranch({
      repoFullName: run.repoFullName,
      branchName: run.branchName,
      token: githubCredential.token,
    })
    if (existing) {
      await registerPullRequest(worker, run, existing)
      return existing
    }

    await reportRunProgress(worker, run, {
      phase: 'pull_request_skipped',
      status: 'completed',
      message: 'No branch changes found for PR creation.',
      metadata: {
        branchName: run.branchName,
        stdout: truncateText(readErrorStdout(error), 8_000),
        stderr: truncateText(readErrorStderr(error), 4_000),
      },
    })
    return null
  }

  const existing = await fetchGithubPullRequestForBranch({
    repoFullName: run.repoFullName,
    branchName: run.branchName,
    token: githubCredential.token,
  })
  const pullRequest = existing ?? await createGithubPullRequest({
    repoFullName: run.repoFullName,
    branchName: run.branchName,
    baseBranch: run.baseBranch || 'main',
    title,
    body: buildPullRequestBody({ run, finalMessage }),
    token: githubCredential.token,
  })

  await registerPullRequest(worker, run, pullRequest)
  await reportRunProgress(worker, run, {
    phase: 'pull_request_ready',
    status: 'completed',
    message: `PR ready: #${pullRequest.number}`,
    metadata: {
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.html_url,
      stdout: truncateText(pushResult?.stdout, 8_000),
      stderr: truncateText(pushResult?.stderr, 4_000),
    },
  })

  return pullRequest
}

async function registerPullRequest(worker: WorkerRecord, run: AgentRunRecord, pullRequest: GithubPullRequestResponse) {
  await postJson(`/agent-worker/runs/${run.id}/pull-request`, {
    workerId: worker.id,
    pullRequest,
  })
}

async function fetchGithubPullRequestForBranch({
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
  url.searchParams.set('state', 'all')
  url.searchParams.set('head', `${owner}:${branchName}`)
  url.searchParams.set('per_page', '1')

  const response = await fetch(url, {
    headers: githubApiHeaders(token),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub PR lookup failed: ${response.status} ${body.slice(0, 240)}`)
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

function githubApiHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function readLocalGithubToken() {
  return process.env.PACH_AGENT_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || ''
}

function buildPrepareCodeWorktreeCommand({
  repoFullName,
  repoCachePath,
  workspacePath,
  baseBranch,
  branchName,
  githubToken,
}: {
  repoFullName: string
  repoCachePath: string
  workspacePath: string
  baseBranch: string
  branchName: string
  githubToken: string
}) {
  const repoUrl = `https://github.com/${repoFullName}.git`
  const repoCache = shellQuote(repoCachePath)
  const repoParent = shellQuote(parentDir(repoCachePath))
  const workspace = shellQuote(workspacePath)
  const workspaceParent = shellQuote(parentDir(workspacePath))
  const remote = shellQuote(repoUrl)
  const base = shellQuote(baseBranch)
  const branch = shellQuote(branchName)
  const remoteBranchRef = shellQuote(`refs/remotes/origin/${branchName}`)
  const localBranchRef = shellQuote(`refs/heads/${branchName}`)
  const remoteBranch = shellQuote(`origin/${branchName}`)
  const remoteBase = shellQuote(`origin/${baseBranch}`)
  const authSetup = githubToken
    ? [
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
      ]
    : ['export GIT_TERMINAL_PROMPT=0']

  return [
    'set -eu',
    'command -v git >/dev/null 2>&1 || { echo "missing git"; exit 42; }',
    ...authSetup,
    'cleanup() { [ -n "${ASKPASS:-}" ] && rm -f "$ASKPASS"; }',
    'trap cleanup EXIT',
    `mkdir -p ${repoParent} ${workspaceParent}`,
    `if [ ! -d ${repoCache}/.git ]; then git clone ${remote} ${repoCache}; fi`,
    `git -C ${repoCache} remote set-url origin ${remote}`,
    `git -C ${repoCache} fetch origin --prune`,
    `git -C ${repoCache} fetch origin ${base}`,
    `if git -C ${repoCache} ls-remote --exit-code --heads origin ${branch} >/dev/null 2>&1; then git -C ${repoCache} fetch origin ${branch}; fi`,
    `if [ -e ${workspace} ] && [ ! -d ${workspace}/.git ] && [ ! -f ${workspace}/.git ]; then if [ "$(find ${workspace} -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" -gt 0 ]; then echo "workspace exists and is not empty: ${workspacePath}"; exit 43; fi; rmdir ${workspace} 2>/dev/null || true; fi`,
    `if [ -d ${workspace}/.git ] || [ -f ${workspace}/.git ]; then git -C ${workspace} fetch origin --prune; git -C ${workspace} checkout ${branch}; else if git -C ${repoCache} show-ref --verify --quiet ${remoteBranchRef}; then git -C ${repoCache} branch --track ${branch} ${remoteBranch} 2>/dev/null || true; elif ! git -C ${repoCache} show-ref --verify --quiet ${localBranchRef}; then git -C ${repoCache} branch ${branch} ${remoteBase}; fi; git -C ${repoCache} worktree add ${workspace} ${branch}; fi`,
    `git -C ${workspace} status --short --branch`,
  ].join('\n')
}

function buildFinalizePullRequestBranchCommand({
  workspacePath,
  branchName,
  baseBranch,
  commitMessage,
  githubToken,
}: {
  workspacePath: string
  branchName: string
  baseBranch: string
  commitMessage: string
  githubToken: string
}) {
  const workspace = shellQuote(workspacePath)
  const branch = shellQuote(branchName)
  const base = shellQuote(baseBranch)
  const remoteBase = shellQuote(`origin/${baseBranch}`)
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
    `git -C ${workspace} fetch origin --prune`,
    `git -C ${workspace} fetch origin ${base}`,
    `git -C ${workspace} config user.name "Pach Agent"`,
    `git -C ${workspace} config user.email "agent@pach.world"`,
    `git -C ${workspace} add -A`,
    `if ! git -C ${workspace} diff --cached --quiet; then git -C ${workspace} commit -m ${message}; fi`,
    `if [ "$(git -C ${workspace} rev-list --count ${remoteBase}..HEAD)" -eq 0 ]; then echo "PACH_NO_CHANGES_FOR_PR"; exit 44; fi`,
    `git -C ${workspace} push -u origin ${branch}`,
    `printf "head_sha=%s\\n" "$(git -C ${workspace} rev-parse HEAD)"`,
    `git -C ${workspace} status --short --branch`,
  ].join('\n')
}

function titleFromBranchName(branchName: string) {
  const name = branchName.split('/').at(-1) || branchName
  return name
    .replace(/^[a-z]+-\w+-\d+-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase()) || branchName
}

function buildPullRequestBody({
  run,
  finalMessage,
}: {
  run: AgentRunRecord
  finalMessage: string
}) {
  return [
    run.issueId ? `Pach issue id: ${run.issueId}` : null,
    `Pach agent run id: ${run.id}`,
    '',
    'Agent result:',
    finalMessage,
    '',
    'Created by Pach agent workflow.',
  ].filter((line): line is string => line !== null).join('\n')
}

function runShellCommand(script: string, options: { timeoutMs: number }): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn('bash', ['-lc', script], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }, options.timeoutMs)
    timeout.unref()

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
      reject(Object.assign(error, { stdout, stderr }))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(Object.assign(new Error(`Shell command timed out after ${options.timeoutMs}ms`), { stdout, stderr, signal }))
        return
      }
      if (code && code !== 0) {
        reject(Object.assign(new Error(`Shell command exited with code ${code}`), { stdout, stderr, code, signal }))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function buildCodexExecArgs(prompt: string, run: AgentRunRecord) {
  const sessionId = readRunSpecString(run.runSpec, 'codexSessionId') ?? readMetadataString(run.metadata, 'codexSessionId')
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
    status?: string
    percent?: number
    workspacePath?: string
    metadata?: Record<string, unknown>
  },
) {
  await postJson(`/agent-worker/runs/${run.id}/progress`, {
    workerId: worker.id,
    ...progress,
  })
}

function resolveExecutionPrompt(run: AgentRunRecord) {
  const serverPrompt = run.executionPrompt?.trim()
  if (serverPrompt) return serverPrompt

  return [
    'You are Pach worker.',
    '',
    'The Pach server did not send a specialized execution prompt. Treat this as a compatibility fallback, not as policy.',
    'Use Pach MCP tools to read the run and linked subject before acting. Report progress with the agent run id.',
    `Agent run id: ${run.id}`,
    run.issueId ? `Issue id: ${run.issueId}` : null,
    run.repoFullName ? `Repository: ${run.repoFullName}` : null,
    run.branchName ? `Working branch: ${run.branchName}` : null,
    '',
    'If the task requires repository changes, work only in the current working directory and summarize what remains for server-owned finalization.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function shouldFinalizePullRequest(run: AgentRunRecord) {
  const serverChoice = readRunSpecBoolean(run.runSpec, 'openPullRequest')
  if (serverChoice !== undefined) return serverChoice

  const storedSpec = readObject(run.metadata?.serverRunSpec)
  const storedFinalization = readObject(storedSpec.finalization)
  const storedChoice = readOptionalBoolean(storedFinalization.openPullRequest)
  if (storedChoice !== undefined) return storedChoice

  return readMetadataString(run.metadata, 'executionMode') === 'code_worktree'
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

function readRunSpecString(runSpec: AgentRunSpec | null | undefined, key: 'codexSessionId') {
  if (key === 'codexSessionId') {
    const value = runSpec?.continuation?.codexSessionId
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return null
}

function readRunSpecBoolean(
  runSpec: AgentRunSpec | null | undefined,
  key: keyof NonNullable<AgentRunSpec['finalization']>,
) {
  const value = runSpec?.finalization?.[key]
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function readObject(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function parseRepoFullName(value: string) {
  const [owner, name] = value.split('/')
  if (!owner || !name) throw new Error(`Invalid GitHub repository full name: ${value}`)
  return { owner, name }
}

function parentDir(value: string) {
  const normalized = value.replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function summarizeCodexOutput(output: string) {
  const summary = output
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()

  return truncateText(summary, 4_000)
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

function readShellExitCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'number' ? code : null
}

function readErrorStdout(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const stdout = (error as { stdout?: unknown }).stdout
  return typeof stdout === 'string' ? stdout : ''
}

function readErrorStderr(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const stderr = (error as { stderr?: unknown }).stderr
  return typeof stderr === 'string' ? stderr : ''
}

function readExecCanceled(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { canceled?: unknown }).canceled === true)
}
