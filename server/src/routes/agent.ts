import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { WebSocket, WebSocketServer } from 'ws'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db.js'
import { verifyToken } from '../lib/auth.js'
import { insertIssueActivityEvent } from '../lib/activity-events.js'
import { readGithubTokenForRepository } from '../lib/github-credentials.js'
import { finalizeAgentRunPullRequest } from '../lib/agent-pr-finalizer.js'
import {
  agentRunProgressReports,
  agentRunArtifacts,
  agentConversations,
  agentMessages,
  agentRuns,
  agentTerminals,
  agentWorkers,
  githubBranches,
  githubPullRequests,
  pmIssues,
} from '../../../db/schema.js'

const router = Router()
const execFileAsync = promisify(execFile)
const ACTIVE_RUN_STATUSES = ['queued', 'reserved', 'bootstrapping', 'running', 'needs_human', 'pr_ready'] as const
const FINAL_RUN_STATUSES = new Set(['completed', 'failed', 'canceled'])

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

export function attachAgentTerminalWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/agent/terminal/ws' })

  wss.on('connection', (socket, req) => {
    void handleAgentTerminalSocket(socket, req)
  })
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

router.post('/runs/:id/cancel', async (req, res) => {
  const { id } = req.params

  try {
    const db = getDb()
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1)

    if (!run) {
      res.status(404).json({ ok: false, error: 'Agent run not found' })
      return
    }

    if (FINAL_RUN_STATUSES.has(run.status)) {
      res.json({ ok: true, run, alreadyFinal: true })
      return
    }

    const now = new Date()
    const reason = readOptionalString(req.body?.reason) ?? 'canceled by user'
    const nextMetadata = {
      ...(run.metadata ?? {}),
      cancelRequested: true,
      cancelRequestedAt: now.toISOString(),
      cancelRequestedBy: req.user?.sub,
      cancelReason: reason,
    }
    const cancelsImmediately = run.status === 'queued' || run.status === 'reserved' || !run.workerId
    const [updated] = await db
      .update(agentRuns)
      .set({
        status: cancelsImmediately ? 'canceled' : run.status,
        statusMessage: cancelsImmediately ? reason : 'cancel requested',
        completedAt: cancelsImmediately ? now : run.completedAt,
        metadata: nextMetadata,
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))
      .returning()

    await appendRunProgressReport(updated, {
      workerId: updated.workerId ?? undefined,
      phase: cancelsImmediately ? 'canceled' : 'cancel_requested',
      level: 'warn',
      message: cancelsImmediately ? reason : 'Cancel requested. Waiting for the agent worker to stop the run.',
      metadata: {
        reason,
        requestedBy: req.user?.sub,
      },
    })

    await appendRunActivity(updated, cancelsImmediately ? reason : 'requested agent run cancellation', 'agent_run_canceled', {
      workerId: updated.workerId,
      reason,
    })

    if (cancelsImmediately && run.workerId) {
      await db
        .update(agentWorkers)
        .set({
          status: 'idle',
          statusMessage: 'last run canceled',
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(agentWorkers.id, run.workerId))
    }

    res.json({ ok: true, run: updated, cancelRequested: !cancelsImmediately })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Run cancellation failed' })
  }
})

router.post('/runs/:id/follow-up', async (req, res) => {
  const { id } = req.params

  try {
    const feedback = readOptionalString(req.body?.feedback)
    if (!feedback) {
      res.status(400).json({ ok: false, error: 'feedback is required' })
      return
    }

    const db = getDb()
    const [parentRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1)
    if (!parentRun) {
      res.status(404).json({ ok: false, error: 'Agent run not found' })
      return
    }
    if (!parentRun.issueId) {
      res.status(400).json({ ok: false, error: 'Agent run is not linked to an issue' })
      return
    }
    if (!parentRun.repositoryId) {
      res.status(400).json({ ok: false, error: 'Agent run is not linked to a repository' })
      return
    }

    const [issue] = await db.select().from(pmIssues).where(eq(pmIssues.id, parentRun.issueId)).limit(1)
    if (!issue) {
      res.status(404).json({ ok: false, error: 'Issue not found' })
      return
    }

    const now = new Date()
    const conversationId = parentRun.conversationId ?? randomUUID()
    const messageId = randomUUID()
    const codexSessionId = readRunCodexSessionId(parentRun.metadata)

    if (!parentRun.conversationId) {
      await db.insert(agentConversations).values({
        id: conversationId,
        issueId: issue.id,
        title: issue.title,
        status: 'open',
        metadata: {
          source: 'follow_up_fallback',
        },
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await db
        .update(agentConversations)
        .set({ status: 'open', updatedAt: now })
        .where(eq(agentConversations.id, conversationId))
    }

    const runMetadata = parentRun.metadata ?? {}
    const followUpCount = readMetadataNumber(runMetadata, 'followUpCount') + 1
    const [run] = await db
      .update(agentRuns)
      .set({
        conversationId,
        status: 'queued',
        statusMessage: parentRun.workerId ? 'queued for same agent worker' : 'queued for agent worker',
        completedAt: null,
        metadata: {
          ...runMetadata,
          executionClass: 'general',
          handler: 'general-mcp',
          intent: 'engineering',
          executionMode: 'code_worktree',
          requiredCapabilities: ['codex.local', 'pach-mcp'],
          queuedVia: 'agent_feedback',
          conversationId,
          feedbackMessageId: messageId,
          feedback,
          pendingInputMediaCount: 0,
          codexSessionId,
          preferredWorkerId: parentRun.workerId,
          followUpCount,
          lastFollowUpAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, parentRun.id))
      .returning()

    const [message] = await db.insert(agentMessages).values({
      id: messageId,
      conversationId,
      runId: run.id,
      role: 'user',
      body: feedback,
      metadata: {
        source: 'agent_feedback',
        parentRunId: parentRun.id,
      },
      createdAt: now,
    }).returning()

    await db
      .update(pmIssues)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(pmIssues.id, issue.id))

    await appendRunActivity(run, 'queued agent follow-up from feedback', 'agent_run_created', {
      runId: run.id,
      conversationId,
      parentRunId: parentRun.id,
      workerId: parentRun.workerId,
      codexSessionId,
      inputMediaCount: 0,
    })

    res.status(201).json({ ok: true, run, message })
  } catch (error) {
    console.error('Agent follow-up failed', error)
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Failed to queue follow-up' })
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

router.post('/runs/:id/prepare-repo', async (req, res) => {
  const { id } = req.params

  try {
    const db = getDb()
    const { run, worker } = await readRunWorker(id)
    const terminals = await db.select().from(agentTerminals).where(eq(agentTerminals.runId, run.id))
    const repo = parseRepoFullName(run.repoFullName)
    const workspacePath = normalizeWorkspacePath(
      run.workspacePath ?? `/home/${worker.sshUser}/workspaces/issues/${run.id}/${repo.name}`,
      worker.sshUser,
    )
    const repoCachePath = `/home/${worker.sshUser}/workspaces/repos/${repo.owner}/${repo.name}`
    const sessionName = run.tmuxSession ? sanitizeTmuxName(run.tmuxSession, 'tmux session') : null
    const windows = terminals
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((terminal) => sanitizeTmuxName(terminal.tmuxWindow, 'tmux window'))
    const githubToken = await readGithubTokenForRepository(run.repositoryId)

    const startedAt = new Date()
    await db
      .update(agentRuns)
      .set({
        status: 'bootstrapping',
        statusMessage: `preparing ${run.repoFullName} worktree`,
        workspacePath,
        updatedAt: startedAt,
      })
      .where(eq(agentRuns.id, run.id))

    const result = await runSshCommand(
      {
        host: worker.sshHost,
        port: worker.sshPort,
        user: worker.sshUser,
      },
      buildPrepareRepoCommand({
        repoFullName: run.repoFullName,
        repoUrl: `https://github.com/${run.repoFullName}.git`,
        repoCachePath,
        workspacePath,
        baseBranch: run.baseBranch,
        branchName: run.branchName,
        githubToken,
        sessionName,
        windows,
      }),
      { timeout: 180_000, maxBuffer: 2_000_000 },
    )

    const finishedAt = new Date()
    const nextMetadata = {
      ...(run.metadata ?? {}),
      repoCachePath,
      repoPreparedAt: finishedAt.toISOString(),
    }

    await db
      .update(agentRuns)
      .set({
        status: 'running',
        statusMessage: `repo ready: ${run.branchName}`,
        workspacePath,
        metadata: nextMetadata,
        updatedAt: finishedAt,
      })
      .where(eq(agentRuns.id, run.id))

    await db
      .update(githubBranches)
      .set({
        status: 'created',
        updatedAt: finishedAt,
      })
      .where(eq(githubBranches.agentRunId, run.id))

    res.json({
      ok: true,
      runId: run.id,
      workerId: worker.id,
      repoCachePath,
      workspacePath,
      branchName: run.branchName,
      stdout: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
      usedGithubToken: Boolean(githubToken),
    })
  } catch (error) {
    const now = new Date()
    const message = error instanceof Error ? error.message : 'Unknown repo preparation error'

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

router.post('/runs/:id/plan-work', async (req, res) => {
  const { id } = req.params

  try {
    const goal = readAgentGoal(req.body)
    const db = getDb()
    const { run: initialRun, worker } = await readRunWorker(id)
    const terminals = await db.select().from(agentTerminals).where(eq(agentTerminals.runId, initialRun.id))
    const agentTerminal = findAgentTerminal(terminals)
    const githubToken = await readGithubTokenForRepository(initialRun.repositoryId)

    let run = initialRun
    if (!run.tmuxSession) {
      const sessionName = sanitizeTmuxName(run.tmuxSession ?? `pach-${run.id.slice(0, 8)}`, 'tmux session')
      const workspacePath = normalizeWorkspacePath(
        run.workspacePath ?? defaultRunWorkspacePath(run, worker.sshUser),
        worker.sshUser,
      )
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

      await runSshCommand(
        { host: worker.sshHost, port: worker.sshPort, user: worker.sshUser },
        buildTmuxBootstrapCommand({
          sessionName,
          workspacePath,
          windows: terminals
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((terminal) => sanitizeTmuxName(terminal.tmuxWindow, 'tmux window')),
        }),
        { timeout: 20_000, maxBuffer: 64_000 },
      )

      const [updatedRun] = await db
        .update(agentRuns)
        .set({
          status: 'running',
          statusMessage: `tmux ready: ${sessionName}`,
          tmuxSession: sessionName,
          workspacePath,
          startedAt: run.startedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id))
        .returning()
      run = updatedRun
    }

    const repo = parseRepoFullName(run.repoFullName)
    const workspacePath = normalizeWorkspacePath(
      run.workspacePath ?? `/home/${worker.sshUser}/workspaces/issues/${run.id}/${repo.name}`,
      worker.sshUser,
    )
    const repoCachePath = `/home/${worker.sshUser}/workspaces/repos/${repo.owner}/${repo.name}`
    const sessionName = sanitizeTmuxName(run.tmuxSession ?? '', 'tmux session')
    const windows = terminals
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((terminal) => sanitizeTmuxName(terminal.tmuxWindow, 'tmux window'))

    await db
      .update(agentRuns)
      .set({
        status: 'bootstrapping',
        statusMessage: `preparing ${run.repoFullName} worktree`,
        workspacePath,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id))

    await runSshCommand(
      { host: worker.sshHost, port: worker.sshPort, user: worker.sshUser },
      buildPrepareRepoCommand({
        repoFullName: run.repoFullName,
        repoUrl: `https://github.com/${run.repoFullName}.git`,
        repoCachePath,
        workspacePath,
        baseBranch: run.baseBranch,
        branchName: run.branchName,
        githubToken,
        sessionName,
        windows,
      }),
      { timeout: 180_000, maxBuffer: 2_000_000 },
    )

    const result = await runSshCommand(
      { host: worker.sshHost, port: worker.sshPort, user: worker.sshUser },
      buildStartCodexCommand({
        sessionName,
        windowName: sanitizeTmuxName(agentTerminal.tmuxWindow, 'tmux window'),
        workspacePath,
        prompt: buildCodexPlanPrompt({ run, goal }),
        captureLines: 160,
        interruptCurrent: true,
      }),
      { timeout: 15_000, maxBuffer: 768_000 },
    )

    const finishedAt = new Date()
    await db
      .update(agentRuns)
      .set({
        status: 'needs_human',
        statusMessage: 'planning started; waiting for plan approval',
        workspacePath,
        metadata: {
          ...(run.metadata ?? {}),
          repoCachePath,
          repoPreparedAt: finishedAt.toISOString(),
          latestGoal: goal,
          workflowPhase: 'planning',
          codexPlanStartedAt: finishedAt.toISOString(),
        },
        updatedAt: finishedAt,
      })
      .where(eq(agentRuns.id, run.id))

    await db.update(githubBranches).set({ status: 'created', updatedAt: finishedAt }).where(eq(githubBranches.agentRunId, run.id))
    await db.update(agentTerminals).set({ status: 'active', updatedAt: finishedAt }).where(eq(agentTerminals.id, agentTerminal.id))

    res.json({
      ok: true,
      runId: run.id,
      terminalId: agentTerminal.id,
      phase: 'planning',
      output: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown agent planning error'
    await getDb().update(agentRuns).set({ status: 'failed', statusMessage: message, updatedAt: new Date() }).where(eq(agentRuns.id, id))
    res.status(502).json({ ok: false, runId: id, error: message })
  }
})

router.post('/runs/:id/terminals/:terminalId/capture', async (req, res) => {
  const { id, terminalId } = req.params

  try {
    const { run, terminal, worker } = await readRunTerminalWorker(id, terminalId)
    const lines = readPositiveInteger((req.body as Record<string, unknown> | undefined)?.lines, 180, 20, 1000)
    const result = await runSshCommand(
      {
        host: worker.sshHost,
        port: worker.sshPort,
        user: worker.sshUser,
      },
      buildTmuxCaptureCommand({
        sessionName: sanitizeTmuxName(run.tmuxSession ?? '', 'tmux session'),
        windowName: sanitizeTmuxName(terminal.tmuxWindow, 'tmux window'),
        lines,
      }),
      { timeout: 12_000, maxBuffer: 512_000 },
    )

    res.json({
      ok: true,
      runId: run.id,
      terminalId: terminal.id,
      terminalName: terminal.name,
      tmuxWindow: terminal.tmuxWindow,
      output: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    res.status(502).json({
      ok: false,
      runId: id,
      terminalId,
      error: error instanceof Error ? error.message : 'Unknown tmux capture error',
    })
  }
})

router.post('/runs/:id/terminals/:terminalId/send-input', async (req, res) => {
  const { id, terminalId } = req.params

  try {
    const { run, terminal, worker } = await readRunTerminalWorker(id, terminalId)
    const { input, key } = readTerminalInput(req.body)
    const enter = readBoolean((req.body as Record<string, unknown> | undefined)?.enter, true)
    const result = await runSshCommand(
      {
        host: worker.sshHost,
        port: worker.sshPort,
        user: worker.sshUser,
      },
      buildTmuxSendInputCommand({
        sessionName: sanitizeTmuxName(run.tmuxSession ?? '', 'tmux session'),
        windowName: sanitizeTmuxName(terminal.tmuxWindow, 'tmux window'),
        input,
        key,
        enter,
        captureLines: 100,
      }),
      { timeout: 12_000, maxBuffer: 512_000 },
    )

    const now = new Date()
    await getDb()
      .update(agentTerminals)
      .set({
        status: 'active',
        updatedAt: now,
      })
      .where(eq(agentTerminals.id, terminal.id))

    res.json({
      ok: true,
      runId: run.id,
      terminalId: terminal.id,
      terminalName: terminal.name,
      tmuxWindow: terminal.tmuxWindow,
      output: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    res.status(502).json({
      ok: false,
      runId: id,
      terminalId,
      error: error instanceof Error ? error.message : 'Unknown tmux send input error',
    })
  }
})

router.post('/runs/:id/start-codex', async (req, res) => {
  const { id } = req.params

  try {
    const goal = readAgentGoal(req.body)
    const db = getDb()
    const { run, worker } = await readRunWorker(id)
    if (!run.workspacePath) throw new Error('Prepare the repo worktree before starting Codex')
    if (!run.tmuxSession) throw new Error('Bootstrap tmux before starting Codex')

    const [agentTerminal] = await db
      .select()
      .from(agentTerminals)
      .where(and(eq(agentTerminals.runId, run.id), eq(agentTerminals.role, 'agent')))

    if (!agentTerminal) throw new Error('Agent terminal not found for this run')

    const startedAt = new Date()
    const result = await runSshCommand(
      {
        host: worker.sshHost,
        port: worker.sshPort,
        user: worker.sshUser,
      },
      buildStartCodexCommand({
        sessionName: sanitizeTmuxName(run.tmuxSession, 'tmux session'),
        windowName: sanitizeTmuxName(agentTerminal.tmuxWindow, 'tmux window'),
        workspacePath: normalizeWorkspacePath(run.workspacePath, worker.sshUser),
        prompt: buildCodexPrompt({ run, goal }),
        captureLines: 120,
      }),
      { timeout: 15_000, maxBuffer: 768_000 },
    )

    await db
      .update(agentRuns)
      .set({
        status: 'running',
        statusMessage: 'codex started from issue goal',
        metadata: {
          ...(run.metadata ?? {}),
          latestGoal: goal,
          codexStartedAt: startedAt.toISOString(),
        },
        updatedAt: startedAt,
      })
      .where(eq(agentRuns.id, run.id))

    await db
      .update(agentTerminals)
      .set({ status: 'active', updatedAt: startedAt })
      .where(eq(agentTerminals.id, agentTerminal.id))

    res.json({
      ok: true,
      runId: run.id,
      terminalId: agentTerminal.id,
      output: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    res.status(502).json({
      ok: false,
      runId: id,
      error: error instanceof Error ? error.message : 'Unknown Codex start error',
    })
  }
})

router.post('/runs/:id/approve-plan', async (req, res) => {
  const { id } = req.params

  try {
    const db = getDb()
    const { run, worker } = await readRunWorker(id)
    if (!run.workspacePath) throw new Error('Prepare the repo worktree before approving execution')
    if (!run.tmuxSession) throw new Error('Bootstrap tmux before approving execution')

    const terminals = await db.select().from(agentTerminals).where(eq(agentTerminals.runId, run.id))
    const agentTerminal = findAgentTerminal(terminals)
    const goal = readMetadataString(run.metadata, 'latestGoal') ?? readOptionalGoal(req.body) ?? 'Implement the approved plan.'
    const now = new Date()

    const result = await runSshCommand(
      { host: worker.sshHost, port: worker.sshPort, user: worker.sshUser },
      buildTmuxSendInputCommand({
        sessionName: sanitizeTmuxName(run.tmuxSession, 'tmux session'),
        windowName: sanitizeTmuxName(agentTerminal.tmuxWindow, 'tmux window'),
        input: buildCodexApprovalInstruction({ run, goal }),
        key: null,
        enter: true,
        captureLines: 160,
      }),
      { timeout: 15_000, maxBuffer: 768_000 },
    )

    await db
      .update(agentRuns)
      .set({
        status: 'running',
        statusMessage: 'plan approved; codex executing',
        metadata: {
          ...(run.metadata ?? {}),
          latestGoal: goal,
          workflowPhase: 'executing',
          codexExecutionStartedAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(agentRuns.id, run.id))

    await db.update(agentTerminals).set({ status: 'active', updatedAt: now }).where(eq(agentTerminals.id, agentTerminal.id))

    res.json({
      ok: true,
      runId: run.id,
      terminalId: agentTerminal.id,
      phase: 'executing',
      output: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    res.status(502).json({
      ok: false,
      runId: id,
      error: error instanceof Error ? error.message : 'Unknown plan approval error',
    })
  }
})

router.post('/runs/:id/create-draft-pr', async (req, res) => {
  const { id } = req.params

  try {
    const title = readOptionalString((req.body as Record<string, unknown> | undefined)?.title)
    const result = await finalizeAgentRunPullRequest({
      runId: id,
      title,
      activitySource: 'agent-route',
    })

    res.json({
      ok: true,
      runId: result.run.id,
      pullRequest: result.pullRequest,
      stdout: result.stdout,
      stderr: result.stderr,
      keyFingerprint: result.keyFingerprint,
    })
  } catch (error) {
    res.status(502).json({
      ok: false,
      runId: id,
      error: error instanceof Error ? error.message : 'Unknown PR creation error',
    })
  }
})

router.post('/runs/:id/sync-pull-request', async (req, res) => {
  const { id } = req.params

  try {
    const db = getDb()
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id))
    if (!run) throw new Error('Agent run not found')
    const githubToken = await readGithubTokenForRepository(run.repositoryId)
    if (!githubToken) throw new Error('No GitHub token available for this repository connection')
    if (!run.repositoryId) throw new Error('Agent run has no repositoryId')

    const [branch] = await db.select().from(githubBranches).where(eq(githubBranches.agentRunId, run.id))
    const pr = await fetchGithubPullRequestForBranch({
      repoFullName: run.repoFullName,
      branchName: run.branchName,
      token: githubToken,
    })

    if (!pr) {
      res.json({ ok: true, runId: run.id, pullRequest: null })
      return
    }

    const now = new Date()
    const saved = await upsertPullRequest({
      run,
      branchId: branch?.id,
      pr,
      now,
    })

    if (branch) {
      await db
        .update(githubBranches)
        .set({ status: saved.state === 'merged' ? 'merged' : 'pr_opened', updatedAt: now })
        .where(eq(githubBranches.id, branch.id))
    }

    res.json({ ok: true, runId: run.id, pullRequest: saved })
  } catch (error) {
    res.status(502).json({
      ok: false,
      runId: id,
      error: error instanceof Error ? error.message : 'Unknown pull request sync error',
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

async function handleAgentTerminalSocket(socket: WebSocket, req: IncomingMessage) {
  let key: Awaited<ReturnType<typeof prepareSshKey>> | null = null
  let sshProcess: ReturnType<typeof spawn> | null = null

  const closeSocket = (code: number, reason: string) => {
    if (socket.readyState === WebSocket.OPEN) socket.close(code, reason.slice(0, 120))
  }

  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    const token = url.searchParams.get('token')
    const runId = url.searchParams.get('runId')
    const terminalId = url.searchParams.get('terminalId')

    if (!token) throw new Error('Missing auth token')
    verifyToken(token)
    if (!runId || !terminalId) throw new Error('Missing runId or terminalId')

    const { run, terminal, worker } = await readRunTerminalWorker(runId, terminalId)
    const sessionName = sanitizeTmuxName(run.tmuxSession ?? '', 'tmux session')
    const windowName = sanitizeTmuxName(terminal.tmuxWindow, 'tmux window')
    const target = `${sessionName}:${windowName}`

    key = await prepareSshKey()
    const connection = {
      host: worker.sshHost,
      port: worker.sshPort,
      user: worker.sshUser,
    }
    const sshArgs = buildSshArgs(connection, key?.path ?? null)
    sshArgs.push('-tt')
    sshArgs.push(`${connection.user}@${connection.host}`, `TERM=xterm-256color tmux attach-session -t ${shellQuote(target)}`)

    const child = spawn('ssh', sshArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
    if (!child.stdin || !child.stdout || !child.stderr) throw new Error('Failed to open SSH terminal streams')
    sshProcess = child

    await getDb()
      .update(agentTerminals)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(agentTerminals.id, terminal.id))

    socket.send(`connected to ${target}\r\n`)

    child.stdout.on('data', (chunk: Buffer) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(chunk)
    })
    child.on('error', (error) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(`\r\nssh error: ${error.message}\r\n`)
      closeSocket(1011, 'ssh error')
    })
    child.on('close', (code) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(`\r\nssh disconnected${code == null ? '' : ` (${code})`}\r\n`)
      closeSocket(1000, 'ssh disconnected')
    })

    socket.on('message', (data) => {
      if (!child.stdin.writable) return
      if (typeof data === 'string') {
        child.stdin.write(data)
      } else if (Buffer.isBuffer(data)) {
        child.stdin.write(data)
      } else if (Array.isArray(data)) {
        child.stdin.write(Buffer.concat(data))
      } else {
        child.stdin.write(Buffer.from(data))
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown terminal socket error'
    if (socket.readyState === WebSocket.OPEN) socket.send(`terminal connection failed: ${message}\r\n`)
    closeSocket(1008, message)
  }

  socket.on('close', () => {
    if (sshProcess && !sshProcess.killed) sshProcess.kill('SIGTERM')
    if (key?.dir) void rm(key.dir, { recursive: true, force: true })
  })
}

async function findExistingWorker(worker: WorkerConfig) {
  const db = getDb()
  const existing = await db.select().from(agentWorkers)
  return (
    existing.find((entry) => worker.providerServerId && entry.providerServerId === worker.providerServerId) ??
    existing.find((entry) => entry.name === worker.name) ??
    null
  )
}

async function readRunTerminalWorker(runId: string, terminalId: string) {
  const { run, worker } = await readRunWorker(runId)
  if (!run.tmuxSession) throw new Error('Agent run has no tmux session yet')

  const db = getDb()
  const [terminal] = await db
    .select()
    .from(agentTerminals)
    .where(and(eq(agentTerminals.id, terminalId), eq(agentTerminals.runId, run.id)))
  if (!terminal) throw new Error('Terminal not found for this agent run')

  return { run, terminal, worker }
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
    actorName: 'Pach agent',
    eventType: type,
    source: 'agent-route',
    summary,
    metadata: {
      source: 'agent-route',
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

function findAgentTerminal(terminals: (typeof agentTerminals.$inferSelect)[]) {
  const terminal = terminals.find((entry) => entry.role === 'agent') ?? terminals[0]
  if (!terminal) throw new Error('Agent terminal not found for this run')
  return terminal
}

function defaultRunWorkspacePath(run: typeof agentRuns.$inferSelect, sshUser: string) {
  const repo = parseRepoFullName(run.repoFullName)
  return `/home/${sshUser}/workspaces/issues/${run.id}/${repo.name}`
}

function parseRepoFullName(fullName: string) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(fullName)
  if (!match) throw new Error(`Invalid repo full name: ${fullName}`)
  return { owner: match[1], name: match[2] }
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

function readPositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value == null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}`)
  }
  return parsed
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function readTerminalInput(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Missing terminal input')
  const raw = body as Record<string, unknown>
  const input = raw.input
  const key = raw.key

  if (typeof key === 'string' && key.trim()) {
    const normalized = normalizeTmuxKey(key)
    return { input: null, key: normalized }
  }

  if (typeof input !== 'string') throw new Error('Terminal input must be a string')
  if (!input.trim()) throw new Error('Terminal input cannot be empty')
  if (input.length > 8_000) throw new Error('Terminal input is too long')
  return { input, key: null }
}

function readAgentGoal(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Missing agent goal')
  const raw = body as Record<string, unknown>
  const goal = raw.goal
  if (typeof goal !== 'string' || !goal.trim()) throw new Error('Agent goal cannot be empty')
  if (goal.length > 12_000) throw new Error('Agent goal is too long')
  return goal.trim()
}

function readOptionalGoal(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  const goal = raw.goal
  if (typeof goal !== 'string' || !goal.trim()) return null
  if (goal.length > 12_000) throw new Error('Agent goal is too long')
  return goal.trim()
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function readMetadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return 0
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readRunCodexSessionId(metadata: unknown) {
  const topLevel = readMetadataString(metadata, 'codexSessionId')
  if (topLevel) return topLevel
  if (!metadata || typeof metadata !== 'object') return null
  const completion = (metadata as Record<string, unknown>).completion
  return readMetadataString(completion, 'codexSessionId')
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

function buildStartCodexCommand({
  sessionName,
  windowName,
  workspacePath,
  prompt,
  captureLines,
  interruptCurrent = false,
}: {
  sessionName: string
  windowName: string
  workspacePath: string
  prompt: string
  captureLines: number
  interruptCurrent?: boolean
}) {
  const session = shellQuote(sessionName)
  const target = shellQuote(`${sessionName}:${windowName}`)
  const workspace = shellQuote(workspacePath)
  const command = [
    'export NVM_DIR="$HOME/.nvm"',
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    `cd ${workspace}`,
    `exec codex ${shellQuote(prompt)}`,
  ].join('; ')
  const commands = [
    'set -eu',
    'command -v tmux >/dev/null 2>&1 || { echo "missing tmux"; exit 42; }',
    `tmux has-session -t ${session}`,
  ]

  if (interruptCurrent) {
    commands.push(`tmux send-keys -t ${target} C-c 2>/dev/null || true`)
  }

  commands.push(`tmux respawn-pane -k -t ${target} -c ${workspace} ${shellQuote(`bash -lc ${shellQuote(command)}`)}`)
  commands.push('sleep 0.75')
  commands.push(`tmux capture-pane -p -J -S -${captureLines} -t ${target}`)

  return commands.join('\n')
}

function buildCodexPrompt({
  run,
  goal,
}: {
  run: typeof agentRuns.$inferSelect
  goal: string
}) {
  return [
    `You are working inside Pach agent run ${run.id}.`,
    `Repository: ${run.repoFullName}`,
    `Branch: ${run.branchName}`,
    `Base branch: ${run.baseBranch}`,
    '',
    'Goal:',
    goal,
    '',
    'Workflow:',
    '- Inspect the codebase before editing.',
    '- Make the requested changes on the current branch only.',
    '- Run the most relevant checks you can.',
    '- If you need human input, stop and ask clearly.',
    '- When ready, summarize the changes, tests, and whether a PR should be opened.',
  ].join('\n')
}

function buildCodexPlanPrompt({
  run,
  goal,
}: {
  run: typeof agentRuns.$inferSelect
  goal: string
}) {
  return [
    `You are planning work for Pach agent run ${run.id}.`,
    `Repository: ${run.repoFullName}`,
    `Branch: ${run.branchName}`,
    `Base branch: ${run.baseBranch}`,
    '',
    'Issue goal and context:',
    goal,
    '',
    'Planning mode instructions:',
    '- Inspect the codebase enough to understand the change.',
    '- Do not edit files yet.',
    '- Lay out a concise implementation plan.',
    '- Include the expected UX/product behavior in the plan.',
    '- Include the checks/tests you intend to run.',
    '- Call out any ambiguity or risk that needs human confirmation.',
    '- End with exactly: PACH_PLAN_READY',
  ].join('\n')
}

function buildCodexApprovalInstruction({
  run,
  goal,
}: {
  run: typeof agentRuns.$inferSelect
  goal: string
}) {
  return [
    'Approved. Please execute the plan now.',
    '',
    `Repository: ${run.repoFullName}`,
    `Branch: ${run.branchName}`,
    '',
    'Original goal:',
    goal,
    '',
    'Execution instructions:',
    '- Implement the approved plan on the current branch.',
    '- Keep changes scoped to this issue.',
    '- Run the most relevant checks available.',
    '- If blocked, stop and explain the blocker clearly.',
    '- When implementation is complete, summarize changes, checks, and any risks.',
    '- Do not merge anything.',
    '- End with exactly: PACH_READY_FOR_PR',
  ].join('\n')
}

function buildTmuxCaptureCommand({
  sessionName,
  windowName,
  lines,
}: {
  sessionName: string
  windowName: string
  lines: number
}) {
  const session = shellQuote(sessionName)
  const target = shellQuote(`${sessionName}:${windowName}`)

  return [
    'set -eu',
    'command -v tmux >/dev/null 2>&1 || { echo "missing tmux"; exit 42; }',
    `tmux has-session -t ${session}`,
    `tmux capture-pane -p -J -S -${lines} -t ${target}`,
  ].join('\n')
}

function buildTmuxSendInputCommand({
  sessionName,
  windowName,
  input,
  key,
  enter,
  captureLines,
}: {
  sessionName: string
  windowName: string
  input: string | null
  key: string | null
  enter: boolean
  captureLines: number
}) {
  const session = shellQuote(sessionName)
  const target = shellQuote(`${sessionName}:${windowName}`)
  const commands = [
    'set -eu',
    'command -v tmux >/dev/null 2>&1 || { echo "missing tmux"; exit 42; }',
    `tmux has-session -t ${session}`,
  ]

  if (key) {
    commands.push(`tmux send-keys -t ${target} ${shellQuote(key)}`)
  } else if (input) {
    commands.push(`tmux send-keys -t ${target} -l ${shellQuote(input)}`)
    if (enter) commands.push(`tmux send-keys -t ${target} C-m`)
  }

  commands.push('sleep 0.15')
  commands.push(`tmux capture-pane -p -J -S -${captureLines} -t ${target}`)

  return commands.join('\n')
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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub PR sync failed: ${response.status} ${body.slice(0, 240)}`)
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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
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

function buildPrepareRepoCommand({
  repoFullName,
  repoUrl,
  repoCachePath,
  workspacePath,
  baseBranch,
  branchName,
  githubToken,
  sessionName,
  windows,
}: {
  repoFullName: string
  repoUrl: string
  repoCachePath: string
  workspacePath: string
  baseBranch: string
  branchName: string
  githubToken: string | null
  sessionName: string | null
  windows: string[]
}) {
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
    : [
        'export GIT_TERMINAL_PROMPT=0',
      ]
  const commands = [
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
    `printf "repo_cache=%s\\n" ${repoCache}`,
    `printf "workspace=%s\\n" ${workspace}`,
    `printf "branch=%s\\n" ${branch}`,
  ]

  if (sessionName) {
    const session = shellQuote(sessionName)
    commands.push(`if tmux has-session -t ${session} 2>/dev/null; then`)
    for (const window of Array.from(new Set(windows))) {
      commands.push(`  if tmux list-windows -t ${session} -F '#W' | grep -Fxq ${shellQuote(window)}; then tmux send-keys -t ${shellQuote(`${sessionName}:${window}`)} ${shellQuote(`cd ${shellQuote(workspacePath)}`)} C-m; fi`)
    }
    commands.push('fi')
  }

  commands.push(`printf "prepared=%s\\n" ${shellQuote(repoFullName)}`)

  return commands.join('\n')
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
  const commands = [
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
  ]

  return commands.join('\n')
}

function sanitizeTmuxName(value: string, label: string) {
  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw new Error(`Invalid ${label}: use letters, numbers, dots, underscores, or hyphens`)
  }
  return trimmed
}

function normalizeTmuxKey(key: string) {
  const normalized = key.trim().toUpperCase()
  const allowed: Record<string, string> = {
    CTRL_C: 'C-c',
    'CTRL-C': 'C-c',
    'C-C': 'C-c',
    ESC: 'Escape',
    ESCAPE: 'Escape',
    ENTER: 'C-m',
  }

  const tmuxKey = allowed[normalized]
  if (!tmuxKey) throw new Error(`Unsupported terminal key: ${key}`)
  return tmuxKey
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

function parentDir(path: string) {
  const index = path.lastIndexOf('/')
  if (index <= 0) return '/'
  return path.slice(0, index)
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
