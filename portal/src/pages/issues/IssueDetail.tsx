import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FolderKanban,
  Maximize2,
  Plus,
  TerminalSquare,
} from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { authFetch, useAuth } from '../../lib/auth'
import { config } from '../../config'
import { PachSelect } from '../../components/PachSelect'
import { RichEditor } from '../../components/rich-editor/RichEditor'
import { AgentConversationView } from '../../components/agents/AgentConversationView'
import { StatusIcon } from './StatusIcon'
import { PriorityIcon } from './PriorityIcon'
import { closePopupFromOutsideClick } from './popupEvents'

const PRIORITY_OPTIONS = [
  { value: 0, label: 'no priority', accent: 'text-fg-3' },
  { value: 1, label: 'urgent', accent: 'text-fail' },
  { value: 2, label: 'high', accent: 'text-amber' },
  { value: 3, label: 'medium', accent: 'text-pach-info' },
  { value: 4, label: 'low', accent: 'text-accent' },
] as const

const ESTIMATE_OPTIONS = [1, 2, 4, 8, 16]

const DEFAULT_REPOSITORIES = [
  { projectKey: 'pach', owner: 'axelpach', name: 'pach', fullName: 'axelpach/pach', defaultBranch: 'main' },
  { projectKey: 'ardia', owner: 'axelpach', name: 'ardia', fullName: 'axelpach/ardia', defaultBranch: 'main' },
] as const

const DEFAULT_TERMINALS = [
  { name: 'agent', role: 'agent', tmuxWindow: 'agent', sortOrder: 0 },
  { name: 'portal', role: 'app', tmuxWindow: 'portal', sortOrder: 1 },
  { name: 'server', role: 'server', tmuxWindow: 'server', sortOrder: 2 },
  { name: 'zero', role: 'zero', tmuxWindow: 'zero', sortOrder: 3 },
  { name: 'shell', role: 'shell', tmuxWindow: 'shell', sortOrder: 4 },
] as const

export default function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>()
  const navigate = useNavigate()
  const z = useZero<Schema, Mutators>()
  const { user, token } = useAuth()
  const [bootstrappingRunId, setBootstrappingRunId] = useState<string | null>(null)
  const [agentActionMessage, setAgentActionMessage] = useState<string | null>(null)
  const [agentFullViewOpen, setAgentFullViewOpen] = useState(false)

  const [allIssues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [documents] = useQuery(z.query.documents.orderBy('updatedAt', 'desc'))
  const [companies] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [labels] = useQuery(z.query.pm_labels.orderBy('name', 'asc'))
  const [workers] = useQuery(z.query.agent_workers.orderBy('name', 'asc'))
  const [repositories] = useQuery(z.query.github_repositories.orderBy('projectKey', 'asc'))
  const [agentRuns] = useQuery(
    z.query.agent_runs.where('issueId', issueId ?? '').orderBy('createdAt', 'desc'),
  )
  const [issueLabelLinks] = useQuery(z.query.pm_issue_labels.where('issueId', issueId ?? ''))
  const [activity] = useQuery(
    z.query.pm_issue_activity.where('issueId', issueId ?? '').orderBy('createdAt', 'asc'),
  )

  const accessibleOrganizationIds = new Set(user?.organizationIds ?? [])
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : user?.canAccessUnscoped ?? false
  const scopedCompanies = companies.filter((company) => canAccessOrganization(company.id))
  const scopedLabels = labels.filter((label) => canAccessOrganization(label.companyId))
  const issue = allIssues.find((entry) => entry.id === issueId && canAccessOrganization(entry.contextCompanyId)) ?? null
  const activeRun = agentRuns[0] ?? null
  const [activeTerminals] = useQuery(
    z.query.agent_terminals.where('runId', activeRun?.id ?? '').orderBy('sortOrder', 'asc'),
  )
  const [activeBranches] = useQuery(
    z.query.github_branches.where('agentRunId', activeRun?.id ?? '').orderBy('createdAt', 'desc'),
  )
  const [activePullRequests] = useQuery(
    z.query.github_pull_requests.where('agentRunId', activeRun?.id ?? '').orderBy('updatedAt', 'desc'),
  )
  const [activeArtifacts] = useQuery(
    z.query.agent_run_artifacts.where('runId', activeRun?.id ?? '').orderBy('createdAt', 'desc'),
  )
  const [activeProgressReports] = useQuery(
    z.query.agent_run_progress_reports.where('runId', activeRun?.id ?? '').orderBy('createdAt', 'desc'),
  )
  const [agentConversations] = useQuery(
    z.query.agent_conversations.where('issueId', issueId ?? '').orderBy('updatedAt', 'desc'),
  )
  const activeConversation =
    agentConversations.find((conversation) => conversation.id === activeRun?.conversationId) ??
    agentConversations[0] ??
    null
  const [activeMessages] = useQuery(
    z.query.agent_messages.where('conversationId', activeConversation?.id ?? '').orderBy('createdAt', 'asc'),
  )
  const visibleActivity = activity.filter((entry) => !isRunScopedAgentActivity(entry))
  const legacyRunProgressActivity = activeRun
    ? activity
        .filter((entry) => readMetadataString(entry.metadata, 'runId') === activeRun.id && isRunScopedAgentActivity(entry))
        .toSorted((a, b) => b.createdAt - a.createdAt)
    : []

  useEffect(() => {
    setAgentFullViewOpen(false)
  }, [issueId])

  const team = issue ? teams.find((t) => t.id === issue.teamId) ?? null : null
  const project = issue?.projectId ? projects.find((p) => p.id === issue.projectId) ?? null : null
  const status = issue ? statuses.find((s) => s.id === issue.statusId) ?? null : null
  const authUserRow: Schema['tables']['users']['row'] | null = user
    ? { id: user.id, email: user.email, name: user.name ?? undefined, createdAt: 0, updatedAt: 0 }
    : null
  const assignableUsers =
    authUserRow && !users.some((entry) => entry.id === authUserRow.id)
      ? [...users, authUserRow]
      : users
  const assignee = issue?.assigneeId ? assignableUsers.find((u) => u.id === issue.assigneeId) ?? null : null
  const company = issue?.contextCompanyId
    ? scopedCompanies.find((c) => c.id === issue.contextCompanyId) ?? null
    : null

  const workspaceStatuses = getWorkspaceStatuses(statuses)
  const teamProjects = team ? projects.filter((p) => p.teamId === team.id) : []
  const labelMap = new Map(scopedLabels.map((l) => [l.id, l]))
  const currentLabels = issueLabelLinks
    .map((link) => ({ link, label: labelMap.get(link.labelId) }))
    .filter((entry): entry is { link: typeof entry.link; label: Schema['tables']['pm_labels']['row'] } => Boolean(entry.label))
  const currentLabelIds = new Set(currentLabels.map((entry) => entry.label.id))
  const availableLabels = labels.filter((l) => {
    if (!team) return true
    if (!l.teamId) return true
    return l.teamId === team.id
  })
  const sameTeamIssues = team
    ? allIssues.filter((entry) => entry.teamId === team.id).sort((a, b) => a.number - b.number)
    : []
  const currentIndex = issue ? sameTeamIssues.findIndex((entry) => entry.id === issue.id) : -1
  const prevIssue = currentIndex > 0 ? sameTeamIssues[currentIndex - 1] : null
  const nextIssue = currentIndex >= 0 && currentIndex < sameTeamIssues.length - 1 ? sameTeamIssues[currentIndex + 1] : null

  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [titleFocused, setTitleFocused] = useState(false)
  const [descFocused, setDescFocused] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const descSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [titleDraft])

  useEffect(() => {
    if (!issue) return
    if (titleFocused) return
    setTitleDraft(issue.title)
  }, [issue?.id, issue?.title, titleFocused])

  useEffect(() => {
    if (!issue) return
    if (descFocused) return
    setDescDraft(issue.description ?? '')
  }, [descFocused, issue?.description, issue?.id])

  useEffect(() => {
    if (!descFocused || !issue) return
    if (descDraft === (issue.description ?? '')) return

    if (descSaveTimerRef.current != null) {
      window.clearTimeout(descSaveTimerRef.current)
    }

    descSaveTimerRef.current = window.setTimeout(() => {
      void commitDescription({ log: false })
      descSaveTimerRef.current = null
    }, 700)

    return () => {
      if (descSaveTimerRef.current != null) {
        window.clearTimeout(descSaveTimerRef.current)
        descSaveTimerRef.current = null
      }
    }
  }, [descDraft, descFocused, issue?.description, issue?.id])

  async function logActivity(summary: string, type = 'updated', metadata?: Record<string, unknown>) {
    if (!issue) return
    await z.mutate.pm_issue_activity.create({
      id: crypto.randomUUID(),
      issueId: issue.id,
      actorId: user?.id,
      actorName: user?.name ?? user?.email,
      type,
      summary,
      metadata,
    })
  }

  async function patchIssue(patch: Record<string, unknown>, summary?: string) {
    if (!issue) return
    await z.mutate.pm_issues.update({ id: issue.id, ...patch })
    if (summary) await logActivity(summary)
  }

  async function toggleLabel(labelId: string) {
    if (!issue) return
    const existing = currentLabels.find((entry) => entry.label.id === labelId)
    const label = labelMap.get(labelId)
    if (existing) {
      await z.mutate.pm_issue_labels.delete({ id: existing.link.id })
      if (label) await logActivity(`removed label ${label.name}`)
    } else {
      await z.mutate.pm_issue_labels.create({
        id: crypto.randomUUID(),
        issueId: issue.id,
        labelId,
      })
      if (label) await logActivity(`added label ${label.name}`)
    }
  }

  async function seedDefaultRepositories() {
    for (const repo of DEFAULT_REPOSITORIES) {
      if (repositories.some((existing) => existing.fullName === repo.fullName)) continue
      await z.mutate.github_repositories.create({
        id: crypto.randomUUID(),
        ...repo,
      })
    }
  }

  async function createAgentRun() {
    if (!issue) return

    const projectKey = company?.project ?? 'pach'
    const repo =
      repositories.find((entry) => entry.projectKey === projectKey && entry.active) ??
      repositories.find((entry) => entry.projectKey === 'pach' && entry.active) ??
      repositories.find((entry) => entry.active)
    if (!repo) return

    const runId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const issueKey = issue.identifier.toLowerCase()
    const branchName = `agent/${repo.projectKey}-${issueKey}-${slugify(issue.title)}`

    await z.mutate.agent_conversations.create({
      id: conversationId,
      issueId: issue.id,
      title: issue.title,
      metadata: {
        source: 'issue_detail',
      },
    })

    await z.mutate.agent_runs.create({
      id: runId,
      conversationId,
      issueId: issue.id,
      repositoryId: repo.id,
      projectKey: repo.projectKey,
      repoFullName: repo.fullName,
      baseBranch: repo.defaultBranch,
      branchName,
      status: 'queued',
      statusMessage: 'queued for agent worker',
      metadata: {
        executionClass: 'general',
        handler: 'general-mcp',
        requiredCapabilities: ['codex.local', 'pach-mcp'],
        queuedVia: 'issue_detail',
        conversationId,
      },
    })

    await z.mutate.agent_messages.create({
      id: messageId,
      conversationId,
      runId,
      role: 'user',
      body: `Go solve ${issue.identifier}: ${issue.title}`,
      metadata: {
        source: 'go_solve',
      },
    })

    await logActivity('queued general MCP agent run', 'agent_run_created', {
      runId,
      conversationId,
      repository: repo.fullName,
      executionClass: 'general',
      handler: 'general-mcp',
      requiredCapabilities: ['codex.local', 'pach-mcp'],
    })
  }

  async function sendAgentFeedback(feedback: string) {
    if (!issue || !activeRun) return
    const trimmed = feedback.trim()
    if (!trimmed) return

    const projectKey = company?.project ?? activeRun.projectKey ?? 'pach'
    const repo =
      repositories.find((entry) => entry.id === activeRun.repositoryId) ??
      repositories.find((entry) => entry.projectKey === projectKey && entry.active) ??
      repositories.find((entry) => entry.projectKey === 'pach' && entry.active) ??
      repositories.find((entry) => entry.active)
    if (!repo) return

    const conversationId = activeRun.conversationId ?? activeConversation?.id ?? crypto.randomUUID()
    const conversationExists = agentConversations.some((conversation) => conversation.id === conversationId)
    const runId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const issueKey = issue.identifier.toLowerCase()
    const branchName = `agent/${repo.projectKey}-${issueKey}-feedback-${Date.now()}`
    const codexSessionId = readRunCodexSessionId(activeRun.metadata)

    if (!conversationExists) {
      await z.mutate.agent_conversations.create({
        id: conversationId,
        issueId: issue.id,
        title: issue.title,
        metadata: {
          source: 'feedback_fallback',
        },
      })
    } else {
      await z.mutate.agent_conversations.update({
        id: conversationId,
        status: 'open',
      })
    }

    await z.mutate.agent_runs.create({
      id: runId,
      conversationId,
      parentRunId: activeRun.id,
      issueId: issue.id,
      workerId: activeRun.workerId ?? undefined,
      repositoryId: repo.id,
      projectKey: repo.projectKey,
      repoFullName: repo.fullName,
      baseBranch: repo.defaultBranch,
      branchName,
      status: 'queued',
      statusMessage: activeRun.workerId ? 'queued for same agent worker' : 'queued for agent worker',
      metadata: {
        executionClass: 'general',
        handler: 'general-mcp',
        requiredCapabilities: ['codex.local', 'pach-mcp'],
        queuedVia: 'agent_feedback',
        conversationId,
        parentRunId: activeRun.id,
        feedbackMessageId: messageId,
        feedback: trimmed,
        codexSessionId,
        preferredWorkerId: activeRun.workerId,
      },
    })

    await z.mutate.agent_messages.create({
      id: messageId,
      conversationId,
      runId,
      role: 'user',
      body: trimmed,
      metadata: {
        source: 'agent_feedback',
        parentRunId: activeRun.id,
      },
    })

    await logActivity('queued agent follow-up from feedback', 'agent_run_created', {
      runId,
      conversationId,
      parentRunId: activeRun.id,
      workerId: activeRun.workerId,
      codexSessionId,
    })
  }

  async function bootstrapAgentRun() {
    if (!activeRun) return

    setBootstrappingRunId(activeRun.id)
    setAgentActionMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${activeRun.id}/bootstrap-tmux`, {
        method: 'POST',
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload.error ?? 'Failed to bootstrap tmux session')
      }

      setAgentActionMessage(`tmux ready: ${payload.sessionName}`)
      await logActivity(`bootstrapped tmux session ${payload.sessionName}`, 'agent_run_bootstrapped', {
        runId: activeRun.id,
        workerId: activeRun.workerId,
        tmuxSession: payload.sessionName,
        workspacePath: payload.workspacePath,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to bootstrap tmux session'
      setAgentActionMessage(message)
    } finally {
      setBootstrappingRunId(null)
    }
  }

  async function commitTitle() {
    if (!issue) return
    const next = titleDraft.trim()
    if (!next || next === issue.title) return
    await patchIssue({ title: next }, `renamed issue to "${next}"`)
  }

  async function commitDescription({ log = true }: { log?: boolean } = {}) {
    if (!issue) return
    const next = descDraft
    const current = issue.description ?? ''
    if (next === current) return
    await patchIssue({ description: next }, log ? (current ? 'updated description' : 'added a description') : undefined)
  }

  if (!issueId) {
    return <NotFound onBack={() => navigate('/issues')} />
  }

  if (!issue) {
    return (
      <div className="h-full min-h-0 overflow-hidden text-fg-1">
        <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-label text-fg-3">
          // loading issue…
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden text-fg-1">
      <div className="flex h-full min-h-0 flex-col">
        {/* top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-edge/15 bg-pit/60 backdrop-blur-sm px-6 py-3">
          <div className="flex min-w-0 items-center gap-3 font-mono text-xs">
            <Link
              to="/issues"
              className="inline-flex items-center gap-1.5 text-fg-3 uppercase tracking-label hover:text-accent transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              all issues
            </Link>
            <span className="text-fg-4">/</span>
            {team ? (
              <span className="text-fg-3 uppercase tracking-label truncate">{team.name.toLowerCase()}</span>
            ) : null}
            <span className="text-fg-4">/</span>
            <span className="text-accent">{issue.identifier}</span>
          </div>

          <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-fg-3">
            <button
              onClick={() => prevIssue && navigate(`/issues/${prevIssue.id}`)}
              disabled={!prevIssue}
              className="flex h-7 w-7 items-center justify-center border border-edge/15 hover:border-accent hover:text-accent transition disabled:opacity-30 disabled:hover:border-edge/15 disabled:hover:text-fg-3"
              title={prevIssue ? `prev ${prevIssue.identifier}` : 'no previous'}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => nextIssue && navigate(`/issues/${nextIssue.id}`)}
              disabled={!nextIssue}
              className="flex h-7 w-7 items-center justify-center border border-edge/15 hover:border-accent hover:text-accent transition disabled:opacity-30 disabled:hover:border-edge/15 disabled:hover:text-fg-3"
              title={nextIssue ? `next ${nextIssue.identifier}` : 'no next'}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {currentIndex >= 0 && (
              <span className="ml-2 text-fg-4">
                {currentIndex + 1} / {sameTeamIssues.length}
              </span>
            )}
          </div>
        </div>

        {/* body */}
        {agentFullViewOpen ? (
          <AgentConversationView
            issue={issue}
            run={activeRun}
            progressReports={activeProgressReports}
            legacyProgressActivity={legacyRunProgressActivity}
            messages={activeMessages}
            workers={workers}
            repositories={repositories}
            onCreateRun={createAgentRun}
            onSeedRepositories={seedDefaultRepositories}
            onSendFeedback={sendAgentFeedback}
            onClose={() => setAgentFullViewOpen(false)}
          />
        ) : (
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
          {/* main column */}
          <div
            className="flex-1 min-w-0 md:overflow-y-auto md:overflow-x-hidden px-4 py-5 md:px-10 md:py-8 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="mx-auto max-w-3xl">
              <textarea
                ref={titleRef}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onFocus={() => setTitleFocused(true)}
                onBlur={async () => {
                  await commitTitle()
                  setTitleFocused(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    ;(event.target as HTMLTextAreaElement).blur()
                  }
                }}
                rows={1}
                placeholder="issue title"
                className="block w-full resize-none overflow-hidden bg-transparent font-mono text-2xl font-bold leading-tight text-fg-1 outline-none placeholder:text-fg-4 focus:bg-accent-fill/3 px-2 py-1 -ml-2"
              />

              <RichEditor
                key={issue.id}
                owner={{ type: 'issue', id: issue.id }}
                value={descDraft}
                documents={documents}
                issues={allIssues}
                organizationId={issue.contextCompanyId}
                onChange={setDescDraft}
                onOpenDocument={(id) => navigate(`/docs/${id}`)}
                onOpenIssue={(id) => navigate(`/issues/${id}`)}
                placeholder="add description..."
                className="min-h-[12rem]"
                wrapperClassName="relative mt-2"
                onFocus={() => setDescFocused(true)}
                onBlur={async () => {
                  if (descSaveTimerRef.current != null) {
                    window.clearTimeout(descSaveTimerRef.current)
                    descSaveTimerRef.current = null
                  }
                  await commitDescription()
                  setDescFocused(false)
                }}
              />

              <div className="mt-10 border-t border-edge/12 pt-6">
                <div className="mb-5 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-label text-fg-4">
                  <span>◊ activity</span>
                  <span>{visibleActivity.length}</span>
                </div>
                <div className="space-y-3">
                  {visibleActivity.length === 0 ? (
                    <div className="font-mono text-xs text-fg-4">// no activity yet</div>
                  ) : (
                    visibleActivity.map((entry) => <ActivityEntry key={entry.id} entry={entry} />)
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* properties sidebar */}
          <aside className="w-full md:w-[300px] shrink-0 border-t md:border-t-0 md:border-l border-edge/12 bg-pit/60 backdrop-blur-sm md:overflow-auto">
            <AgentSidebarCard
              run={activeRun}
              progressReports={activeProgressReports}
              legacyProgressActivity={legacyRunProgressActivity}
              messages={activeMessages}
              workers={workers}
              repositories={repositories}
              onCreateRun={createAgentRun}
              onSeedRepositories={seedDefaultRepositories}
              onOpenFullView={() => setAgentFullViewOpen(true)}
            />

            <div className="border-b border-edge/10 px-5 py-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">◊ properties</div>

              <PropertyRow label="status" icon={<StatusIcon statusType={status?.type ?? 'backlog'} />}>
                <InlineSelect
                  value={issue.statusId}
                  onChange={async (next) => {
                    if (next === issue.statusId) return
                    const newStatus = workspaceStatuses.find((s) => s.id === next)
                    const patch: Record<string, unknown> = { statusId: next }
                    const now = Date.now()
                    if ((newStatus?.type === 'started' || newStatus?.type === 'review') && !issue.startedAt) patch.startedAt = now
                    if (newStatus?.type === 'completed') patch.completedAt = now
                    if (newStatus?.type === 'canceled') patch.canceledAt = now
                    await patchIssue(
                      patch,
                      `moved from ${status?.name ?? '—'} to ${newStatus?.name ?? '—'}`,
                    )
                  }}
                  options={workspaceStatuses.map((s) => ({ value: s.id, label: s.name.toLowerCase() }))}
                  display={status?.name?.toLowerCase() ?? 'no status'}
                />
              </PropertyRow>

              <PropertyRow
                label="priority"
                icon={<PriorityIcon priority={issue.priority} />}
              >
                <InlineSelect
                  value={String(issue.priority)}
                  onChange={async (next) => {
                    const value = Number(next)
                    if (value === issue.priority) return
                    const fromLabel = PRIORITY_OPTIONS.find((p) => p.value === issue.priority)?.label
                    const toLabel = PRIORITY_OPTIONS.find((p) => p.value === value)?.label
                    await patchIssue({ priority: value }, `priority ${fromLabel} → ${toLabel}`)
                  }}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: String(p.value), label: p.label }))}
                  display={PRIORITY_OPTIONS.find((p) => p.value === issue.priority)?.label ?? '—'}
                />
              </PropertyRow>

              <PropertyRow label="assignee" icon={<AssigneeIcon />}>
                <InlineSelect
                  value={issue.assigneeId ?? ''}
                  onChange={async (next) => {
                    if ((next || undefined) === (issue.assigneeId ?? undefined)) return
                    const target = assignableUsers.find((u) => u.id === next)
                    await patchIssue(
                      { assigneeId: next || undefined },
                      next ? `assigned to ${target?.name ?? target?.email ?? 'user'}` : 'unassigned',
                    )
                  }}
                  options={[
                    { value: '', label: 'unassigned' },
                    ...assignableUsers.map((u) => ({ value: u.id, label: (u.name ?? u.email).toLowerCase() })),
                  ]}
                  display={(assignee?.name ?? assignee?.email)?.toLowerCase() ?? 'unassigned'}
                />
              </PropertyRow>

              <PropertyRow label="estimate" icon={<EstimateIcon />}>
                <InlineSelect
                  value={String(issue.estimate ?? '')}
                  onChange={async (next) => {
                    const value = next === '' ? undefined : Number(next)
                    if (value === issue.estimate) return
                    await patchIssue({ estimate: value }, value ? `estimate set to ${value} pts` : 'cleared estimate')
                  }}
                  options={[
                    { value: '', label: 'no estimate' },
                    ...ESTIMATE_OPTIONS.map((n) => ({ value: String(n), label: `${n} pts` })),
                  ]}
                  display={issue.estimate ? `${issue.estimate} pts` : 'no estimate'}
                />
              </PropertyRow>

              <PropertyRow label="due date" icon={<CalendarIcon />}>
                <DateInput
                  value={issue.dueDate ?? undefined}
                  onChange={async (ms) => {
                    if (ms === (issue.dueDate ?? undefined)) return
                    await patchIssue({ dueDate: ms }, ms ? `due ${formatDate(ms)}` : 'cleared due date')
                  }}
                />
              </PropertyRow>
            </div>

            <div className="border-b border-edge/10 px-5 py-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">◊ context</div>

              <PropertyRow label="team" icon={<TeamIcon />}>
                <span className="font-mono text-xs lowercase text-fg-2">{team?.name?.toLowerCase() ?? '—'}</span>
              </PropertyRow>

              <PropertyRow label="project" icon={<FolderKanban className="h-3.5 w-3.5 text-fg-3" />}>
                <InlineSelect
                  value={issue.projectId ?? ''}
                  onChange={async (next) => {
                    if ((next || undefined) === (issue.projectId ?? undefined)) return
                    const target = teamProjects.find((p) => p.id === next)
                    await patchIssue(
                      { projectId: next || undefined },
                      next ? `moved to project ${target?.name ?? '—'}` : 'removed from project',
                    )
                  }}
                  options={[
                    { value: '', label: 'no project' },
                    ...teamProjects.map((p) => ({ value: p.id, label: p.name.toLowerCase() })),
                  ]}
                  display={project?.name?.toLowerCase() ?? 'no project'}
                />
              </PropertyRow>

              <PropertyRow label="organization" icon={<Building2 className="h-3.5 w-3.5 text-amber" />}>
                <InlineSelect
                  value={issue.contextCompanyId ?? ''}
                  onChange={async (next) => {
                    if ((next || undefined) === (issue.contextCompanyId ?? undefined)) return
                    const target = scopedCompanies.find((c) => c.id === next)
                    await patchIssue(
                      { contextCompanyId: next || undefined },
                      next ? `linked organization ${target?.name ?? '—'}` : 'unlinked organization',
                    )
                  }}
                  options={[
                    ...(user?.canAccessUnscoped ? [{ value: '', label: 'no organization' }] : []),
                    ...scopedCompanies.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  display={company?.name ?? 'no organization'}
                />
              </PropertyRow>
            </div>

            <div className="border-b border-edge/10 px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">◊ labels</span>
                <LabelPicker
                  available={availableLabels}
                  selectedIds={currentLabelIds}
                  onToggle={toggleLabel}
                />
              </div>
              {currentLabels.length === 0 ? (
                <div className="font-mono text-xs text-fg-4">// no labels</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {currentLabels.map(({ label }) => {
                    const color = label.color || 'var(--fg-3)'
                    return (
                      <button
                        key={label.id}
                        onClick={() => toggleLabel(label.id)}
                        className="inline-flex h-5 items-center gap-1 border bg-pit-3 px-1.5 font-mono text-[10px] tracking-label lowercase transition hover:opacity-80"
                        style={{ borderColor: `${color}55`, color }}
                        title={`remove ${label.name}`}
                      >
                        <span aria-hidden className="block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        {label.name.toLowerCase()}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">◊ meta</div>
              <MetaRow label="created" value={formatDateTime(issue.createdAt)} />
              <MetaRow label="updated" value={formatDateTime(issue.updatedAt)} />
              {issue.startedAt ? <MetaRow label="started" value={formatDateTime(issue.startedAt)} /> : null}
              {issue.completedAt ? <MetaRow label="completed" value={formatDateTime(issue.completedAt)} /> : null}
            </div>
          </aside>
        </div>
        )}
      </div>
    </div>
  )
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full min-h-0 overflow-hidden text-fg-1">
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-sm uppercase tracking-label text-fg-3">// issue not found</div>
          <button
            onClick={onBack}
            className="mt-3 inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            back to issues
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentSidebarCard({
  run,
  progressReports,
  legacyProgressActivity,
  messages,
  workers,
  repositories,
  onCreateRun,
  onSeedRepositories,
  onOpenFullView,
}: {
  run: Schema['tables']['agent_runs']['row'] | null
  progressReports: Schema['tables']['agent_run_progress_reports']['row'][]
  legacyProgressActivity: Schema['tables']['pm_issue_activity']['row'][]
  messages: Schema['tables']['agent_messages']['row'][]
  workers: Schema['tables']['agent_workers']['row'][]
  repositories: Schema['tables']['github_repositories']['row'][]
  onCreateRun: () => void | Promise<void>
  onSeedRepositories: () => void | Promise<void>
  onOpenFullView: () => void
}) {
  const onlineWorkers = workers.filter((worker) => worker.status !== 'offline')
  const canCreateRun = repositories.length > 0 && !run
  const runIsActive = Boolean(run && !['completed', 'failed', 'canceled'].includes(run.status))
  const runIsFinal = Boolean(run && ['completed', 'failed', 'canceled'].includes(run.status))
  const finalProgressReport = progressReports.find((report) => report.phase === 'final_result')
  const finalLegacyProgress = legacyProgressActivity.find((entry) => readMetadataString(entry.metadata, 'phase') === 'final_result')
  const latestProgress = finalProgressReport ?? progressReports[0] ?? finalLegacyProgress ?? legacyProgressActivity[0] ?? null
  const latestMessage =
    latestProgress && 'message' in latestProgress
      ? latestProgress.message
      : latestProgress && 'summary' in latestProgress
        ? latestProgress.summary
        : run?.statusMessage ?? null
  const handler = readMetadataString(run?.metadata, 'handler') ?? 'general-mcp'

  return (
    <div className="border-b border-edge/10 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            {runIsActive ? (
              <span className="absolute h-2 w-2 animate-ping rounded-full bg-accent opacity-50" />
            ) : null}
            <Bot className={`h-3.5 w-3.5 ${run ? 'text-accent' : 'text-fg-4'}`} />
          </span>
          agent
        </div>
        <div className="flex items-center gap-1.5">
          {run || messages.length > 0 ? (
            <button
              type="button"
              onClick={onOpenFullView}
              className="flex h-7 w-7 items-center justify-center border border-edge/18 bg-pit-3 text-fg-3 transition hover:border-accent hover:text-accent"
              title="open agent conversation"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {!run ? (
            <button
              type="button"
              onClick={() => {
                void onCreateRun()
              }}
              disabled={!canCreateRun}
              className="inline-flex h-7 items-center gap-1.5 border border-edge/20 bg-accent-fill/8 px-2 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
              title={canCreateRun ? 'queue agent run' : 'needs a repository'}
            >
              <TerminalSquare className="h-3 w-3" />
              do task
            </button>
          ) : null}
        </div>
      </div>

      {repositories.length === 0 ? (
        <button
          type="button"
          onClick={() => {
            void onSeedRepositories()
          }}
          className="mb-3 w-full border border-edge/18 bg-accent-fill/4 px-3 py-2 text-left font-mono text-xs text-fg-2 transition hover:border-accent hover:text-accent"
        >
          seed default GitHub repos
        </button>
      ) : null}

      {!run ? (
        <div className="space-y-1.5 font-mono text-xs text-fg-4">
          <div>// no active agent run</div>
          <div>
            {onlineWorkers.length} online worker{onlineWorkers.length === 1 ? '' : 's'} · {repositories.length} repo
            {repositories.length === 1 ? '' : 's'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1 font-mono text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-label text-fg-4">status</span>
              <span className={run.status === 'failed' ? 'text-fail' : 'text-accent'}>{run.status}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-label text-fg-4">handler</span>
              <span className="truncate text-fg-2">{handler}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-label text-fg-4">worker</span>
              <span className="truncate text-fg-2">{run.workerId ?? 'waiting for claim'}</span>
            </div>
          </div>

          {latestMessage ? (
            <button
              type="button"
              onClick={onOpenFullView}
              className="block w-full border border-edge/12 bg-pit-3 px-2.5 py-2 text-left font-mono text-xs leading-relaxed text-fg-3 transition hover:border-accent/60 hover:text-fg-1"
            >
              <div className="mb-1 text-[10px] uppercase tracking-label text-fg-4">
                {runIsFinal ? 'latest result' : 'latest progress'}
              </div>
              <div className="line-clamp-4 whitespace-pre-wrap">{latestMessage}</div>
            </button>
          ) : (
            <div className="border border-edge/12 bg-pit-3 px-2.5 py-2 font-mono text-xs text-fg-4">
              // waiting for progress
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function IssueDetailTab({
  active,
  label,
  meta,
  tone = 'muted',
  onClick,
}: {
  active: boolean
  label: string
  meta?: number | string
  tone?: 'muted' | 'online'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-label transition ${
        active
          ? 'bg-accent-fill/8 text-accent shadow-glow-xs ring-1 ring-edge/24'
          : 'text-fg-4 hover:bg-accent-fill/4 hover:text-fg-2'
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        {tone === 'online' ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent shadow-glow-sm" />
          </span>
        ) : (
          <span className="text-fg-4">◊</span>
        )}
        <span className="truncate">{label}</span>
      </span>
      {meta !== undefined ? <span className="shrink-0 text-fg-4">· {meta}</span> : null}
    </button>
  )
}

function AgentRunPanel({
  run,
  branch,
  pullRequest,
  terminals,
  artifacts,
  progressReports,
  legacyProgressActivity,
  messages,
  workers,
  repositories,
  authToken,
  defaultGoal,
  onSeedRepositories,
  onCreateRun,
  onSendFeedback,
  onBootstrapRun,
  bootstrapping,
  actionMessage,
}: {
  run: Schema['tables']['agent_runs']['row'] | null
  branch: Schema['tables']['github_branches']['row'] | null
  pullRequest: Schema['tables']['github_pull_requests']['row'] | null
  terminals: Schema['tables']['agent_terminals']['row'][]
  artifacts: Schema['tables']['agent_run_artifacts']['row'][]
  progressReports: Schema['tables']['agent_run_progress_reports']['row'][]
  legacyProgressActivity: Schema['tables']['pm_issue_activity']['row'][]
  messages: Schema['tables']['agent_messages']['row'][]
  workers: Schema['tables']['agent_workers']['row'][]
  repositories: Schema['tables']['github_repositories']['row'][]
  authToken: string | null
  defaultGoal: string
  onSeedRepositories: () => void | Promise<void>
  onCreateRun: () => void | Promise<void>
  onSendFeedback: (feedback: string) => void | Promise<void>
  onBootstrapRun: () => void | Promise<void>
  bootstrapping: boolean
  actionMessage: string | null
}) {
  const onlineWorkers = workers.filter((worker) => worker.status !== 'offline')
  const canCreateRun = repositories.length > 0 && !run
  const executionClass = readMetadataString(run?.metadata, 'executionClass')
  const handler = readMetadataString(run?.metadata, 'handler')
  const isGeneralRun = executionClass === 'general'
  const showLegacyAgentControls = Boolean(run && !isGeneralRun)
  const canBootstrapRun = Boolean(showLegacyAgentControls && run?.workerId && ['reserved', 'failed'].includes(run.status))
  const progressItemCount = progressReports.length + legacyProgressActivity.length
  const showStatusMessageAsProgress = Boolean(run?.statusMessage && progressItemCount === 0)
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null)
  const [terminalOutput, setTerminalOutput] = useState('')
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalBusy, setTerminalBusy] = useState(false)
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)
  const [liveTerminalOpen, setLiveTerminalOpen] = useState(false)
  const [liveTerminalStatus, setLiveTerminalStatus] = useState<'idle' | 'connecting' | 'connected' | 'closed'>('idle')
  const [agentGoal, setAgentGoal] = useState(defaultGoal)
  const [goalBusy, setGoalBusy] = useState(false)
  const [goalMessage, setGoalMessage] = useState<string | null>(null)
  const [prBusy, setPrBusy] = useState(false)
  const [repoBusy, setRepoBusy] = useState(false)
  const [repoMessage, setRepoMessage] = useState<string | null>(null)
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [showFullProgressLog, setShowFullProgressLog] = useState(false)
  const liveTerminalElementRef = useRef<HTMLDivElement | null>(null)
  const liveSocketRef = useRef<WebSocket | null>(null)
  const liveXtermRef = useRef<XTerm | null>(null)
  const liveFitAddonRef = useRef<FitAddon | null>(null)
  const selectedTerminal =
    terminals.find((terminal) => terminal.id === selectedTerminalId) ??
    terminals[0] ??
    null
  const agentTerminal = terminals.find((terminal) => terminal.role === 'agent') ?? terminals[0] ?? null
  const workflowPhase = readMetadataString(run?.metadata, 'workflowPhase')
  const runIsFinal = Boolean(run && ['completed', 'failed', 'canceled'].includes(run.status))
  const finalProgressReports = progressReports.filter((report) => report.phase === 'final_result')
  const finalLegacyProgressActivity = legacyProgressActivity.filter((entry) => readMetadataString(entry.metadata, 'phase') === 'final_result')
  const visibleProgressReports = runIsFinal && !showFullProgressLog && finalProgressReports.length > 0
    ? finalProgressReports
    : progressReports
  const visibleLegacyProgressActivity = runIsFinal && !showFullProgressLog && finalLegacyProgressActivity.length > 0
    ? finalLegacyProgressActivity
    : legacyProgressActivity
  const visibleProgressItemCount = visibleProgressReports.length + visibleLegacyProgressActivity.length

  useEffect(() => {
    const latestGoal = readMetadataString(run?.metadata, 'latestGoal')
    setAgentGoal(latestGoal ?? defaultGoal)
    setShowFullProgressLog(false)
  }, [defaultGoal, run?.id])

  useEffect(() => {
    if (terminals.length === 0) {
      setSelectedTerminalId(null)
      return
    }
    if (!selectedTerminalId || !terminals.some((terminal) => terminal.id === selectedTerminalId)) {
      setSelectedTerminalId(terminals[0].id)
    }
  }, [selectedTerminalId, terminals])

  useEffect(() => {
    if (!liveTerminalOpen) return
    if (!run || !selectedTerminal || !authToken || !liveTerminalElementRef.current) {
      setLiveTerminalStatus('closed')
      return
    }

    const rootStyles = getComputedStyle(document.documentElement)
    const cssColor = (name: string) => rootStyles.getPropertyValue(name).trim()
    const cssRgb = (name: string, alpha: number) => `rgb(${cssColor(`${name}-rgb`)} / ${alpha})`

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 5_000,
      theme: {
        background: cssColor('--bg-1'),
        foreground: cssColor('--fg-2'),
        cursor: cssColor('--accent'),
        selectionBackground: cssRgb('--accent', 0.24),
        black: cssColor('--bg-1'),
        green: cssColor('--accent'),
        brightGreen: cssColor('--accent-soft'),
      },
    })
    const fitAddon = new FitAddon()
    const socket = new WebSocket(
      buildAgentTerminalWsUrl({
        apiUrl: config.apiUrl,
        runId: run.id,
        terminalId: selectedTerminal.id,
        token: authToken,
      }),
    )

    liveXtermRef.current = term
    liveFitAddonRef.current = fitAddon
    liveSocketRef.current = socket
    setLiveTerminalStatus('connecting')

    term.loadAddon(fitAddon)
    term.open(liveTerminalElementRef.current)
    fitAddon.fit()
    term.focus()

    const dataSubscription = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data)
    })
    const fitToContainer = () => {
      try {
        fitAddon.fit()
      } catch {
        // xterm can throw while the element is being removed during navigation.
      }
    }

    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      setLiveTerminalStatus('connected')
      fitToContainer()
      term.focus()
    }
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data)
      } else {
        term.write(new Uint8Array(event.data))
      }
    }
    socket.onerror = () => {
      setLiveTerminalStatus('closed')
      term.writeln('\r\n[terminal socket error]')
    }
    socket.onclose = () => {
      setLiveTerminalStatus('closed')
    }

    window.addEventListener('resize', fitToContainer)

    return () => {
      window.removeEventListener('resize', fitToContainer)
      dataSubscription.dispose()
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
      term.dispose()
      if (liveSocketRef.current === socket) liveSocketRef.current = null
      if (liveXtermRef.current === term) liveXtermRef.current = null
      if (liveFitAddonRef.current === fitAddon) liveFitAddonRef.current = null
    }
  }, [authToken, liveTerminalOpen, run?.id, selectedTerminal?.id])

  useEffect(() => {
    setLiveTerminalOpen(false)
  }, [run?.id, selectedTerminal?.id])

  async function captureTerminal(terminal = selectedTerminal) {
    if (!run || !terminal) return
    setTerminalBusy(true)
    setTerminalMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/terminals/${terminal.id}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: 220 }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to capture tmux output')
      setTerminalOutput(payload.output ?? '')
      setTerminalMessage(`captured ${terminal.name}`)
    } catch (error) {
      setTerminalMessage(error instanceof Error ? error.message : 'Failed to capture tmux output')
    } finally {
      setTerminalBusy(false)
    }
  }

  async function sendTerminalInput() {
    if (!run || !selectedTerminal) return
    const input = terminalInput.trim()
    if (!input) return
    setTerminalBusy(true)
    setTerminalMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/terminals/${selectedTerminal.id}/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, enter: true }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to send tmux input')
      setTerminalOutput(payload.output ?? '')
      setTerminalInput('')
      setTerminalMessage(`sent to ${selectedTerminal.name}`)
    } catch (error) {
      setTerminalMessage(error instanceof Error ? error.message : 'Failed to send tmux input')
    } finally {
      setTerminalBusy(false)
    }
  }

  async function sendTerminalKey(key: string, label: string) {
    if (!run || !selectedTerminal) return
    setTerminalBusy(true)
    setTerminalMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/terminals/${selectedTerminal.id}/send-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? `Failed to send ${label}`)
      setTerminalOutput(payload.output ?? '')
      setTerminalMessage(`sent ${label} to ${selectedTerminal.name}`)
    } catch (error) {
      setTerminalMessage(error instanceof Error ? error.message : `Failed to send ${label}`)
    } finally {
      setTerminalBusy(false)
    }
  }

  async function prepareRepoWorktree() {
    if (!run) return
    setRepoBusy(true)
    setRepoMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/prepare-repo`, {
        method: 'POST',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to prepare repo worktree')
      setRepoMessage(`repo ready: ${payload.branchName}`)
      setTerminalOutput(payload.stdout ?? '')
    } catch (error) {
      setRepoMessage(error instanceof Error ? error.message : 'Failed to prepare repo worktree')
    } finally {
      setRepoBusy(false)
    }
  }

  async function planAgentWork() {
    if (!run) return
    const goal = agentGoal.trim()
    if (!goal) return
    setGoalBusy(true)
    setGoalMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/plan-work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to plan agent work')
      if (agentTerminal) setSelectedTerminalId(agentTerminal.id)
      setTerminalOutput(payload.output ?? '')
      setGoalMessage('planning started; review codex plan')
    } catch (error) {
      setGoalMessage(error instanceof Error ? error.message : 'Failed to plan agent work')
    } finally {
      setGoalBusy(false)
    }
  }

  async function approveAgentPlan() {
    if (!run) return
    setGoalBusy(true)
    setGoalMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/approve-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: agentGoal.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to approve agent plan')
      if (agentTerminal) setSelectedTerminalId(agentTerminal.id)
      setTerminalOutput(payload.output ?? '')
      setGoalMessage('approved; codex executing')
    } catch (error) {
      setGoalMessage(error instanceof Error ? error.message : 'Failed to approve agent plan')
    } finally {
      setGoalBusy(false)
    }
  }

  async function createDraftPullRequest() {
    if (!run) return
    setPrBusy(true)
    setGoalMessage(null)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/create-draft-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: agentGoal.split('\n')[0]?.replace(/^Issue:\s*/i, '').trim() || run.branchName }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to create draft PR')
      setGoalMessage(payload.pullRequest ? `draft PR ready: #${payload.pullRequest.number}` : 'draft PR created')
      setTerminalOutput(payload.stdout ?? '')
    } catch (error) {
      setGoalMessage(error instanceof Error ? error.message : 'Failed to create draft PR')
    } finally {
      setPrBusy(false)
    }
  }

  async function syncPullRequest() {
    if (!run) return
    setPrBusy(true)

    try {
      const res = await authFetch(`${config.apiUrl}/agent/runs/${run.id}/sync-pull-request`, {
        method: 'POST',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Failed to sync pull request')
      setGoalMessage(payload.pullRequest ? 'pull request synced' : 'no pull request found for branch yet')
    } catch (error) {
      setGoalMessage(error instanceof Error ? error.message : 'Failed to sync pull request')
    } finally {
      setPrBusy(false)
    }
  }

  async function submitFeedback() {
    const feedback = feedbackDraft.trim()
    if (!feedback) return
    setFeedbackBusy(true)
    setFeedbackMessage(null)

    try {
      await onSendFeedback(feedback)
      setFeedbackDraft('')
      setFeedbackMessage('follow-up queued')
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Failed to queue follow-up')
    } finally {
      setFeedbackBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
          <Bot className="h-3.5 w-3.5 text-accent" />
          agent run
        </span>
        {!run ? (
          <button
            onClick={() => {
              void onCreateRun()
            }}
            disabled={!canCreateRun}
            className="inline-flex h-7 items-center gap-1.5 border border-edge/20 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-edge/20 disabled:hover:text-fg-3"
            title={canCreateRun ? 'queue agent run' : 'needs a repository'}
          >
            <TerminalSquare className="h-3 w-3" />
            go solve
          </button>
        ) : null}
      </div>

      {repositories.length === 0 ? (
        <button
          onClick={() => {
            void onSeedRepositories()
          }}
          className="mb-3 w-full border border-edge/18 bg-accent-fill/4 px-3 py-2 text-left font-mono text-xs text-fg-2 transition hover:border-accent hover:text-accent"
        >
          seed default GitHub repos
        </button>
      ) : null}

      {!run ? (
        <div className="space-y-1.5 font-mono text-xs text-fg-4">
          <div>// no active agent run</div>
          <div>
            {onlineWorkers.length} online worker{onlineWorkers.length === 1 ? '' : 's'} · {repositories.length} repo
            {repositories.length === 1 ? '' : 's'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1 font-mono text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-label text-fg-4">status</span>
              <span className="text-accent">{run.status}</span>
            </div>
            {isGeneralRun ? (
              <div className="flex items-center justify-between gap-3">
                <span className="uppercase tracking-label text-fg-4">handler</span>
                <span className="truncate text-fg-2">{handler ?? 'general-mcp'}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-label text-fg-4">repo</span>
                  <span className="truncate text-fg-2">{run.repoFullName}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-label text-fg-4">branch</span>
                  <span className="truncate text-fg-2">{branch?.name ?? run.branchName}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-label text-fg-4">tmux</span>
                  <span className="truncate text-fg-2">{run.tmuxSession ?? 'pending'}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-label text-fg-4">worker</span>
              <span className="truncate text-fg-2">{run.workerId ?? 'waiting for claim'}</span>
            </div>
          </div>

          {canBootstrapRun ? (
            <button
              onClick={() => {
                void onBootstrapRun()
              }}
              disabled={bootstrapping}
              className="w-full border border-edge/18 bg-accent-fill/4 px-2.5 py-2 text-left font-mono text-xs uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-wait disabled:opacity-50"
            >
              {bootstrapping ? 'bootstrapping tmux...' : 'bootstrap tmux on worker'}
            </button>
          ) : null}

          {actionMessage && actionMessage !== run.statusMessage ? (
            <div className="border border-edge/12 bg-pit-3 px-2.5 py-2 font-mono text-xs text-fg-3">
              {actionMessage}
            </div>
          ) : null}

          {run.statusMessage && !showStatusMessageAsProgress ? (
            <div className="border border-edge/12 bg-pit-3 px-2.5 py-2 font-mono text-xs text-fg-3">
              {run.statusMessage}
            </div>
          ) : null}

          {isGeneralRun ? (
            <div className="border border-edge/12 bg-accent-fill/[0.025] p-3 font-mono text-xs leading-relaxed text-fg-3">
              <div className="mb-1 text-[10px] uppercase tracking-label text-fg-4">general MCP handler</div>
              <div>
                The agent worker will claim this run, read the issue through Pach MCP, write progress reports,
                and complete the run when Codex returns.
              </div>
            </div>
          ) : null}

          <div className="border border-edge/12 bg-overlay/12 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-label text-fg-4">
              <span>{runIsFinal && !showFullProgressLog ? 'final result' : 'progress reports'}</span>
              <div className="flex items-center gap-2">
                {runIsFinal && progressItemCount > visibleProgressItemCount ? (
                  <button
                    type="button"
                    onClick={() => setShowFullProgressLog((current) => !current)}
                    className="text-fg-4 transition hover:text-accent"
                  >
                    {showFullProgressLog ? 'hide log' : 'show log'}
                  </button>
                ) : null}
                <span>{visibleProgressItemCount + (showStatusMessageAsProgress ? 1 : 0)}</span>
              </div>
            </div>
            {visibleProgressReports.length > 0 || visibleLegacyProgressActivity.length > 0 || showStatusMessageAsProgress ? (
              <div className="space-y-2">
                {visibleProgressReports.map((report) => (
                  <AgentRunProgressReport key={report.id} report={report} />
                ))}
                {visibleLegacyProgressActivity.map((entry) => (
                  <LegacyAgentRunProgressReport key={entry.id} entry={entry} />
                ))}
                {showStatusMessageAsProgress && run.statusMessage ? (
                  <AgentRunStatusMessageProgressReport
                    message={run.statusMessage}
                    status={run.status}
                    createdAt={run.updatedAt}
                  />
                ) : null}
              </div>
            ) : (
              <div className="font-mono text-xs text-fg-4">// no progress reports yet</div>
            )}
          </div>

          <div className="border border-edge/12 bg-accent-fill/[0.025] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-label text-fg-4">
              <span>conversation</span>
              <span>{messages.length}</span>
            </div>
            {messages.length > 0 ? (
              <div className="mb-3 max-h-44 space-y-2 overflow-auto">
                {messages.map((message) => (
                  <AgentMessageEntry key={message.id} message={message} />
                ))}
              </div>
            ) : null}
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void submitFeedback()
              }}
            >
              <textarea
                value={feedbackDraft}
                onChange={(event) => setFeedbackDraft(event.target.value)}
                rows={3}
                disabled={!run || feedbackBusy}
                placeholder="send feedback or ask the agent to continue..."
                className="w-full resize-y border border-edge/12 bg-pit-3 px-2.5 py-2 font-mono text-xs leading-relaxed text-fg-2 outline-none placeholder:text-fg-4 focus:border-accent disabled:opacity-50"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] lowercase text-fg-4">
                  {run?.workerId ? 'will try the same worker/session first' : 'will start from run context'}
                </span>
                <button
                  type="submit"
                  disabled={!feedbackDraft.trim() || feedbackBusy || !run}
                  className="border border-edge/24 bg-accent-fill/8 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {feedbackBusy ? 'queuing...' : 'send feedback'}
                </button>
              </div>
              {feedbackMessage ? <div className="font-mono text-[10px] lowercase text-fg-4">{feedbackMessage}</div> : null}
            </form>
          </div>

          {showLegacyAgentControls ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                void prepareRepoWorktree()
              }}
              disabled={repoBusy || !run.workerId}
              className="border border-edge/18 bg-accent-fill/4 px-2.5 py-2 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-wait disabled:opacity-50"
            >
              {repoBusy ? 'preparing repo...' : 'prepare repo worktree'}
            </button>
            {repoMessage ? <span className="font-mono text-[10px] lowercase text-fg-4">{repoMessage}</span> : null}
          </div>
          ) : null}

          {showLegacyAgentControls ? (
          <div className="border border-edge/12 bg-accent-fill/[0.025] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">development goal</div>
                <div className="mt-1 font-mono text-[10px] lowercase text-fg-4">
                  phase: {workflowPhase ?? (run.workspacePath ? 'ready' : 'setup')}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <button
                  onClick={() => {
                    void planAgentWork()
                  }}
                  disabled={goalBusy || !agentGoal.trim() || !run.workerId}
                  className="border border-edge/24 bg-accent-fill/8 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                  title={run.workerId ? 'prepare worker, prepare worktree, and start codex in planning mode' : 'waiting for an agent worker to claim this run'}
                >
                  {goalBusy ? 'working...' : 'plan agent work'}
                </button>
                <button
                  onClick={() => {
                    void approveAgentPlan()
                  }}
                  disabled={goalBusy || !run.workspacePath}
                  className="border border-edge/18 bg-pit-3 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  title="send approval to codex so it can implement the plan"
                >
                  approve + execute
                </button>
                <button
                  onClick={() => {
                    void createDraftPullRequest()
                  }}
                  disabled={prBusy || !run.workspacePath}
                  className="border border-edge/18 bg-pit-3 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-40"
                  title="commit, push, and create or sync a draft GitHub PR"
                >
                  {prBusy ? 'creating...' : 'create draft pr'}
                </button>
              </div>
            </div>
            <textarea
              value={agentGoal}
              onChange={(event) => setAgentGoal(event.target.value)}
              rows={5}
              className="w-full resize-y border border-edge/12 bg-pit-3 px-2.5 py-2 font-mono text-xs leading-relaxed text-fg-2 outline-none placeholder:text-fg-4 focus:border-accent"
              placeholder="Describe what Codex should build, fix, or investigate for this issue..."
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] lowercase text-fg-4">
              <span>plan first, approve after reviewing codex output, create PR once implementation is ready</span>
              {goalMessage ? <span>{goalMessage}</span> : null}
            </div>
          </div>
          ) : null}

          {showLegacyAgentControls ? (
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">terminals</div>
            <div className="flex flex-wrap gap-1.5">
              {terminals.map((terminal) => (
                <button
                  key={terminal.id}
                  onClick={() => {
                    setSelectedTerminalId(terminal.id)
                    void captureTerminal(terminal)
                  }}
                  className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] lowercase transition ${
                    selectedTerminal?.id === terminal.id
                      ? 'border-accent bg-accent-fill/8 text-accent shadow-glow-xs'
                      : 'border-edge/14 bg-pit-3 text-fg-3 hover:border-edge/30 hover:text-fg-1'
                  }`}
                >
                  <span className="text-fg-4">▸</span>
                  {terminal.name}
                </button>
              ))}
            </div>
          </div>
          ) : null}

          {showLegacyAgentControls ? (
          <div className="border border-edge/12 bg-overlay/18">
            <div className="flex items-center justify-between gap-3 border-b border-edge/10 px-3 py-2">
              <div className="min-w-0 font-mono text-[10px] uppercase tracking-label text-fg-4">
                tmux · {selectedTerminal?.name ?? 'no terminal'}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {liveTerminalOpen ? (
                  <button
                    onClick={() => {
                      setLiveTerminalOpen(false)
                      setLiveTerminalStatus('closed')
                    }}
                    disabled={!selectedTerminal}
                    className="border border-fail/22 bg-fail/4 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-fail hover:text-fail disabled:cursor-not-allowed disabled:opacity-40"
                    title="close live websocket terminal"
                  >
                    disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setLiveTerminalOpen(true)
                    }}
                    disabled={!selectedTerminal || !authToken}
                    className="border border-edge/24 bg-accent-fill/8 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                    title="open live terminal session"
                  >
                    connect live
                  </button>
                )}
                <button
                  onClick={() => void sendTerminalKey('CTRL_C', 'ctrl+c')}
                  disabled={!selectedTerminal || terminalBusy}
                  className="border border-fail/22 bg-fail/4 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-fail hover:text-fail disabled:cursor-wait disabled:opacity-40"
                  title="interrupt current process"
                >
                  ctrl+c
                </button>
                <button
                  onClick={() => void sendTerminalKey('ENTER', 'enter')}
                  disabled={!selectedTerminal || terminalBusy}
                  className="border border-edge/18 bg-pit-3 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-40"
                  title="send enter"
                >
                  enter
                </button>
                <button
                  onClick={() => void captureTerminal()}
                  disabled={!selectedTerminal || terminalBusy}
                  className="border border-edge/18 bg-pit-3 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-40"
                >
                  {terminalBusy ? 'busy' : 'capture'}
                </button>
              </div>
            </div>

            {liveTerminalOpen ? (
              <div className="relative">
                <div
                  ref={liveTerminalElementRef}
                  className="h-[360px] overflow-hidden bg-bg-1 px-2 py-2"
                  onClick={() => liveXtermRef.current?.focus()}
                />
                <div className="pointer-events-none absolute right-3 top-2 font-mono text-[9px] uppercase tracking-label text-fg-4">
                  live · {liveTerminalStatus}
                </div>
              </div>
            ) : (
              <pre className="min-h-32 max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-3 font-mono text-[11px] leading-relaxed text-fg-2">
                {terminalOutput || '// capture a terminal to read tmux output'}
              </pre>
            )}

            <form
              className="border-t border-edge/10 p-2"
              onSubmit={(event) => {
                event.preventDefault()
                void sendTerminalInput()
              }}
            >
              <div className="flex gap-2">
                <input
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    if (terminalInput.trim()) return
                    event.preventDefault()
                    void sendTerminalKey('ENTER', 'enter')
                  }}
                  disabled={!selectedTerminal || terminalBusy}
                  placeholder={selectedTerminal ? `send command to ${selectedTerminal.name}` : 'select a terminal'}
                  className="min-w-0 flex-1 border border-edge/12 bg-pit-3 px-2 py-1.5 font-mono text-xs text-fg-2 outline-none placeholder:text-fg-4 focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!selectedTerminal || terminalBusy || !terminalInput.trim()}
                  className="shrink-0 border border-edge/18 bg-accent-fill/4 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  send
                </button>
              </div>
              {terminalMessage ? (
                <div className="mt-2 font-mono text-[10px] lowercase text-fg-4">{terminalMessage}</div>
              ) : null}
            </form>
          </div>
          ) : null}

          {showLegacyAgentControls ? (
          <div className="flex items-center gap-2">
            {pullRequest ? (
              <a
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate border border-edge/18 bg-accent-fill/4 px-2.5 py-2 font-mono text-xs text-accent hover:border-accent"
              >
                PR #{pullRequest.number} · {pullRequest.isDraft ? 'draft' : pullRequest.state}
              </a>
            ) : (
              <div className="min-w-0 flex-1 font-mono text-xs text-fg-4">// no pull request yet</div>
            )}
            <button
              onClick={() => {
                void syncPullRequest()
              }}
              disabled={prBusy}
              className="shrink-0 border border-edge/18 bg-pit-3 px-2.5 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-40"
              title="check GitHub for a PR matching this branch"
            >
              {prBusy ? 'syncing...' : 'sync pr'}
            </button>
          </div>
          ) : null}

          {showLegacyAgentControls ? (
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">artifacts</div>
            {artifacts.length > 0 ? (
              <div className="space-y-1.5">
                {artifacts.map((artifact) => {
                  const label = `${artifact.kind} · ${artifact.name}`
                  const body = (
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate">{label}</span>
                      <span className="shrink-0 text-fg-4">{artifact.mimeType ?? 'file'}</span>
                    </span>
                  )

                  return artifact.url ? (
                    <a
                      key={artifact.id}
                      href={artifact.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block border border-edge/14 bg-pit-3 px-2 py-1.5 font-mono text-[11px] text-fg-3 transition hover:border-accent hover:text-accent"
                    >
                      {body}
                    </a>
                  ) : (
                    <div
                      key={artifact.id}
                      className="border border-edge/10 bg-pit-3 px-2 py-1.5 font-mono text-[11px] text-fg-3"
                      title={artifact.remotePath ?? undefined}
                    >
                      {body}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="font-mono text-xs text-fg-4">// no screenshots or videos yet</div>
            )}
          </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function buildAgentTerminalWsUrl({
  apiUrl,
  runId,
  terminalId,
  token,
}: {
  apiUrl: string
  runId: string
  terminalId: string
  token: string
}) {
  const url = new URL('/agent/terminal/ws', apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('runId', runId)
  url.searchParams.set('terminalId', terminalId)
  url.searchParams.set('token', token)
  return url.toString()
}

function buildDefaultAgentGoal({
  issue,
  team,
  project,
  company,
}: {
  issue: Schema['tables']['pm_issues']['row'] | null
  team: Schema['tables']['pm_teams']['row'] | null
  project: Schema['tables']['pm_projects']['row'] | null
  company: Schema['tables']['organizations']['row'] | null
}) {
  if (!issue) return ''

  return [
    `Issue: ${team?.key ?? 'ISS'}-${issue.number} ${issue.title}`,
    project ? `Project: ${project.name}` : null,
    company ? `Organization/context: ${company.name}` : null,
    issue.description ? `Description:\n${issue.description}` : null,
    '',
    'Please implement this issue, run the relevant checks, and prepare the branch for a draft PR.',
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function readRunCodexSessionId(metadata: unknown) {
  const topLevel = readMetadataString(metadata, 'codexSessionId')
  if (topLevel) return topLevel
  if (!metadata || typeof metadata !== 'object') return null
  const completion = (metadata as Record<string, unknown>).completion
  return readMetadataString(completion, 'codexSessionId')
}

function isRunScopedAgentActivity(entry: Schema['tables']['pm_issue_activity']['row']) {
  if (!readMetadataString(entry.metadata, 'runId')) return false
  return ['agent_progress', 'agent_run_claimed', 'agent_run_completed', 'agent_run_failed'].includes(entry.type)
}

function legacyProgressPhase(type: string) {
  if (type === 'agent_run_claimed') return 'claimed'
  if (type === 'agent_run_completed') return 'completed'
  if (type === 'agent_run_failed') return 'failed'
  return 'progress'
}

function getWorkspaceStatuses(statuses: Schema['tables']['pm_statuses']['row'][]) {
  const uniqueStatuses = new Map<string, Schema['tables']['pm_statuses']['row']>()
  for (const status of statuses) {
    if (status.teamId) continue
    if (!uniqueStatuses.has(status.key)) uniqueStatuses.set(status.key, status)
  }

  return Array.from(uniqueStatuses.values()).sort((a, b) => {
    const rankDiff = statusRank(a.type) - statusRank(b.type)
    if (rankDiff !== 0) return rankDiff
    return a.position - b.position
  })
}

function statusRank(statusType: string) {
  if (statusType === 'backlog') return 0
  if (statusType === 'unstarted') return 1
  if (statusType === 'started') return 2
  if (statusType === 'review') return 3
  if (statusType === 'blocked') return 4
  if (statusType === 'completed') return 5
  if (statusType === 'canceled') return 6
  return 99
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)

  return slug || 'issue'
}

function PropertyRow({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex w-[88px] shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
        <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function LabelPicker({
  available,
  selectedIds,
  onToggle,
}: {
  available: Schema['tables']['pm_labels']['row'][]
  selectedIds: Set<string>
  onToggle: (labelId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      closePopupFromOutsideClick(event, [ref], () => setOpen(false))
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 border border-edge/20 bg-pit-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-fg-3 hover:text-fg-1 hover:border-edge/30 transition"
        title="add label"
      >
        <Plus className="h-3 w-3" />
        add
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[220px] border border-edge/25 bg-pit shadow-terminal-popover">
          <div className="border-b border-edge/12 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
            labels
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {available.length === 0 ? (
              <div className="px-3 py-2 font-mono text-xs text-fg-4">// no labels available</div>
            ) : (
              available.map((label) => {
                const checked = selectedIds.has(label.id)
                const color = label.color || 'var(--fg-3)'
                return (
                  <button
                    key={label.id}
                    onClick={() => onToggle(label.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-mono text-xs lowercase text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1 transition"
                  >
                    <span
                      aria-hidden
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition ${
                        checked ? 'border-accent bg-accent' : 'border-edge/20 bg-transparent'
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-pit" strokeWidth={3} />}
                    </span>
                    <span aria-hidden className="block h-2 w-2 rounded-full" style={{ background: color }} />
                    <span className="truncate">{label.name.toLowerCase()}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 font-mono text-[10px]">
      <span className="uppercase tracking-label text-fg-4">{label}</span>
      <span className="text-fg-3">{value}</span>
    </div>
  )
}

function InlineSelect({
  value,
  onChange,
  options,
  display,
}: {
  value: string
  onChange: (next: string) => void
  options: Array<{ value: string; label: string }>
  display: string
}) {
  return <PachSelect value={value} onChange={onChange} options={options} display={display} />
}

function DateInput({ value, onChange }: { value?: number; onChange: (ms: number | undefined) => void }) {
  const formatted = value ? new Date(value).toISOString().slice(0, 10) : ''
  return (
    <input
      type="date"
      value={formatted}
      onChange={(event) => {
        const v = event.target.value
        if (!v) {
          onChange(undefined)
          return
        }
        const ms = new Date(`${v}T00:00:00`).getTime()
        onChange(Number.isNaN(ms) ? undefined : ms)
      }}
      className="w-full border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-fg-1 outline-none transition hover:border-edge/20 hover:bg-accent-fill/4 focus:border-accent focus:bg-accent-fill/6"
    />
  )
}

function ActivityEntry({ entry }: { entry: Schema['tables']['pm_issue_activity']['row'] }) {
  const isComment = entry.type === 'comment'
  if (isComment) {
    return (
      <div className="border border-edge/10 bg-pit-2/50 px-4 py-3">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-label">
          <span className="text-accent">{entry.actorName?.toLowerCase() ?? 'system'}</span>
          <span className="text-fg-4">{formatDateTime(entry.createdAt)}</span>
        </div>
        <div className="whitespace-pre-wrap font-mono text-sm text-fg-1">{entry.summary}</div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 font-mono text-xs text-fg-3">
      <span className="text-fg-4">›</span>
      <span className="text-fg-2">{entry.actorName?.toLowerCase() ?? 'system'}</span>
      <span className="flex-1 truncate text-fg-3">{entry.summary}</span>
      <span className="text-fg-4 text-[10px] uppercase tracking-label">{formatRelative(entry.createdAt)}</span>
    </div>
  )
}

function AgentRunProgressReport({ report }: { report: Schema['tables']['agent_run_progress_reports']['row'] }) {
  return (
    <AgentRunProgressShell
      phase={report.phase ?? report.level}
      level={report.level}
      message={report.message}
      createdAt={report.createdAt}
      percent={report.percent}
    />
  )
}

function AgentMessageEntry({ message }: { message: Schema['tables']['agent_messages']['row'] }) {
  return (
    <div className="border border-edge/10 bg-pit-3 px-2.5 py-2 font-mono text-xs">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-label">
        <span className={message.role === 'user' ? 'text-accent' : 'text-fg-4'}>{message.role}</span>
        <span className="shrink-0 text-fg-4">{formatRelative(message.createdAt)}</span>
      </div>
      <div className="whitespace-pre-wrap leading-relaxed text-fg-2">{message.body}</div>
    </div>
  )
}

function LegacyAgentRunProgressReport({ entry }: { entry: Schema['tables']['pm_issue_activity']['row'] }) {
  const phase = readMetadataString(entry.metadata, 'phase') ?? legacyProgressPhase(entry.type)
  const level = entry.type === 'agent_run_failed' || readMetadataString(entry.metadata, 'level') === 'error' ? 'error' : 'info'

  return (
    <AgentRunProgressShell
      phase={phase}
      level={level}
      message={entry.summary}
      createdAt={entry.createdAt}
    />
  )
}

function AgentRunStatusMessageProgressReport({
  message,
  status,
  createdAt,
}: {
  message: string
  status: string
  createdAt: number
}) {
  return (
    <AgentRunProgressShell
      phase={status}
      level={status === 'failed' ? 'error' : 'info'}
      message={message}
      createdAt={createdAt}
    />
  )
}

function AgentRunProgressShell({
  phase,
  level,
  message,
  createdAt,
  percent,
}: {
  phase: string
  level: string
  message: string
  createdAt: number
  percent?: number
}) {
  const levelClass = level === 'error' ? 'text-fail' : level === 'warn' ? 'text-warn' : 'text-accent'

  return (
    <div className="border border-edge/10 bg-pit-3 px-2.5 py-2 font-mono text-xs">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-label">
        <div className="min-w-0 flex items-center gap-2">
          <span className={levelClass}>●</span>
          <span className="truncate text-fg-4">{phase}</span>
        </div>
        <span className="shrink-0 text-fg-4">{formatRelative(createdAt)}</span>
      </div>
      <div className="max-h-52 overflow-auto whitespace-pre-wrap leading-relaxed text-fg-2">{message}</div>
      {typeof percent === 'number' ? (
        <div className="mt-2 h-1 border border-edge/12 bg-pit-2">
          <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function AssigneeIcon() {
  return <span className="font-mono text-[10px] text-fg-3">@</span>
}

function EstimateIcon() {
  return <span className="font-mono text-[10px] text-fg-3">#</span>
}

function CalendarIcon() {
  return <span className="font-mono text-[10px] text-fg-3">▢</span>
}

function TeamIcon() {
  return <span className="font-mono text-[10px] text-fg-3">◇</span>
}

function formatDate(ms: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms))
}

function formatDateTime(ms: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
}

function formatRelative(ms: number) {
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return formatDate(ms)
}
