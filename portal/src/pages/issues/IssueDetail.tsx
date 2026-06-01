import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  Plus,
  TerminalSquare,
} from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { authFetch, useAuth } from '../../lib/auth'
import { config } from '../../config'
import { PachSelect } from './PachSelect'
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

const ESTIMATE_OPTIONS = [1, 2, 3, 4, 8, 16]

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
  const { user } = useAuth()
  const [bootstrappingRunId, setBootstrappingRunId] = useState<string | null>(null)
  const [agentActionMessage, setAgentActionMessage] = useState<string | null>(null)

  const [allIssues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
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

  const issue = allIssues.find((entry) => entry.id === issueId) ?? null
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

  const team = issue ? teams.find((t) => t.id === issue.teamId) ?? null : null
  const project = issue?.projectId ? projects.find((p) => p.id === issue.projectId) ?? null : null
  const status = issue ? statuses.find((s) => s.id === issue.statusId) ?? null : null
  const assignee = issue?.assigneeId ? users.find((u) => u.id === issue.assigneeId) ?? null : null
  const company = issue?.contextCompanyId
    ? companies.find((c) => c.id === issue.contextCompanyId) ?? null
    : null

  const workspaceStatuses = getWorkspaceStatuses(statuses)
  const teamProjects = team ? projects.filter((p) => p.teamId === team.id) : []
  const labelMap = new Map(labels.map((l) => [l.id, l]))
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
  const descRef = useRef<HTMLTextAreaElement | null>(null)
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
    const worker = workers.find((entry) => entry.status === 'idle')

    if (!repo || !worker) return

    const runId = crypto.randomUUID()
    const branchId = crypto.randomUUID()
    const issueKey = issue.identifier.toLowerCase()
    const branchName = `ap/${repo.projectKey}-${issueKey}-${slugify(issue.title)}`
    const tmuxSession = `pach-${issueKey}`
    const workspacePath = `/home/${worker.sshUser}/workspaces/issues/${issueKey}/${repo.projectKey}`

    await z.mutate.agent_workers.update({
      id: worker.id,
      status: 'reserved',
      statusMessage: `reserved for ${issue.identifier}`,
    })

    await z.mutate.agent_runs.create({
      id: runId,
      issueId: issue.id,
      workerId: worker.id,
      repositoryId: repo.id,
      projectKey: repo.projectKey,
      repoFullName: repo.fullName,
      baseBranch: repo.defaultBranch,
      branchName,
      workspacePath,
      tmuxSession,
      status: 'reserved',
      statusMessage: 'worker reserved; tmux bootstrap pending',
    })

    await z.mutate.github_branches.create({
      id: branchId,
      repositoryId: repo.id,
      agentRunId: runId,
      issueId: issue.id,
      name: branchName,
      baseBranch: repo.defaultBranch,
      status: 'planned',
    })

    for (const terminal of DEFAULT_TERMINALS) {
      await z.mutate.agent_terminals.create({
        id: crypto.randomUUID(),
        runId,
        ...terminal,
      })
    }

    await logActivity(`reserved ${worker.name} for agent run on ${branchName}`, 'agent_run_created', {
      runId,
      workerId: worker.id,
      branchId,
      branchName,
      repository: repo.fullName,
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
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,255,140,0.15)] bg-[rgba(5,6,5,0.6)] backdrop-blur-sm px-6 py-3">
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
              className="flex h-7 w-7 items-center justify-center border border-[rgba(0,255,140,0.15)] hover:border-accent hover:text-accent transition disabled:opacity-30 disabled:hover:border-[rgba(0,255,140,0.15)] disabled:hover:text-fg-3"
              title={prevIssue ? `prev ${prevIssue.identifier}` : 'no previous'}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => nextIssue && navigate(`/issues/${nextIssue.id}`)}
              disabled={!nextIssue}
              className="flex h-7 w-7 items-center justify-center border border-[rgba(0,255,140,0.15)] hover:border-accent hover:text-accent transition disabled:opacity-30 disabled:hover:border-[rgba(0,255,140,0.15)] disabled:hover:text-fg-3"
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
                className="block w-full resize-none overflow-hidden bg-transparent font-mono text-2xl font-bold leading-tight text-fg-1 outline-none placeholder:text-fg-4 focus:bg-[rgba(0,255,136,0.03)] px-2 py-1 -ml-2"
              />

              {descFocused || !descDraft.trim() ? (
                <AutoGrowTextarea
                  textareaRef={descRef}
                  value={descDraft}
                  onChange={setDescDraft}
                  onFocus={() => setDescFocused(true)}
                  onBlur={async () => {
                    if (descSaveTimerRef.current != null) {
                      window.clearTimeout(descSaveTimerRef.current)
                      descSaveTimerRef.current = null
                    }
                    await commitDescription()
                    setDescFocused(false)
                  }}
                  placeholder="add description…"
                  className="mt-2 w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4 focus:bg-[rgba(0,255,136,0.03)] px-2 py-2 -ml-2"
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setDescFocused(true)
                    requestAnimationFrame(() => descRef.current?.focus())
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setDescFocused(true)
                      requestAnimationFrame(() => descRef.current?.focus())
                    }
                  }}
                  className="mt-2 cursor-text px-2 py-2 -ml-2 hover:bg-[rgba(0,255,136,0.02)] transition"
                  title="click to edit"
                >
                  <DescriptionView source={descDraft} />
                </div>
              )}

              <div className="mt-10 border-t border-[rgba(0,255,140,0.12)] pt-6">
                <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
                  <span className="text-fg-4">◊</span> activity
                  <span className="text-fg-4">· {activity.length}</span>
                </div>

                <div className="space-y-3">
                  {activity.length === 0 ? (
                    <div className="font-mono text-xs text-fg-4">// no activity yet</div>
                  ) : (
                    activity.map((entry) => <ActivityEntry key={entry.id} entry={entry} />)
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* properties sidebar */}
          <aside className="w-full md:w-[300px] shrink-0 border-t md:border-t-0 md:border-l border-[rgba(0,255,140,0.12)] bg-[rgba(5,6,5,0.6)] backdrop-blur-sm md:overflow-auto">
            <div className="border-b border-[rgba(0,255,140,0.1)] px-5 py-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">◊ properties</div>

              <PropertyRow label="status" icon={<StatusIcon statusType={status?.type ?? 'backlog'} />}>
                <InlineSelect
                  value={issue.statusId}
                  onChange={async (next) => {
                    if (next === issue.statusId) return
                    const newStatus = workspaceStatuses.find((s) => s.id === next)
                    const patch: Record<string, unknown> = { statusId: next }
                    const now = Date.now()
                    if (newStatus?.type === 'started' && !issue.startedAt) patch.startedAt = now
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
                    const target = users.find((u) => u.id === next)
                    await patchIssue(
                      { assigneeId: next || undefined },
                      next ? `assigned to ${target?.name ?? target?.email ?? 'user'}` : 'unassigned',
                    )
                  }}
                  options={[
                    { value: '', label: 'unassigned' },
                    ...users.map((u) => ({ value: u.id, label: (u.name ?? u.email).toLowerCase() })),
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

            <div className="border-b border-[rgba(0,255,140,0.1)] px-5 py-4">
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

              <PropertyRow label="company" icon={<Building2 className="h-3.5 w-3.5 text-amber" />}>
                <InlineSelect
                  value={issue.contextCompanyId ?? ''}
                  onChange={async (next) => {
                    if ((next || undefined) === (issue.contextCompanyId ?? undefined)) return
                    const target = companies.find((c) => c.id === next)
                    await patchIssue(
                      { contextCompanyId: next || undefined },
                      next ? `linked company ${target?.name ?? '—'}` : 'unlinked company',
                    )
                  }}
                  options={[
                    { value: '', label: 'no company' },
                    ...companies.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  display={company?.name ?? 'no company'}
                />
              </PropertyRow>
            </div>

            <div className="border-b border-[rgba(0,255,140,0.1)] px-5 py-4">
              <AgentRunPanel
                run={activeRun}
                branch={activeBranches[0] ?? null}
                pullRequest={activePullRequests[0] ?? null}
                terminals={activeTerminals}
                artifacts={activeArtifacts}
                workers={workers}
                repositories={repositories}
                onSeedRepositories={seedDefaultRepositories}
                onCreateRun={createAgentRun}
                onBootstrapRun={bootstrapAgentRun}
                bootstrapping={bootstrappingRunId === activeRun?.id}
                actionMessage={agentActionMessage}
              />
            </div>

            <div className="border-b border-[rgba(0,255,140,0.1)] px-5 py-4">
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
                    const color = label.color || '#5a8a72'
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
            className="mt-3 inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            back to issues
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentRunPanel({
  run,
  branch,
  pullRequest,
  terminals,
  artifacts,
  workers,
  repositories,
  onSeedRepositories,
  onCreateRun,
  onBootstrapRun,
  bootstrapping,
  actionMessage,
}: {
  run: Schema['tables']['agent_runs']['row'] | null
  branch: Schema['tables']['github_branches']['row'] | null
  pullRequest: Schema['tables']['github_pull_requests']['row'] | null
  terminals: Schema['tables']['agent_terminals']['row'][]
  artifacts: Schema['tables']['agent_run_artifacts']['row'][]
  workers: Schema['tables']['agent_workers']['row'][]
  repositories: Schema['tables']['github_repositories']['row'][]
  onSeedRepositories: () => void | Promise<void>
  onCreateRun: () => void | Promise<void>
  onBootstrapRun: () => void | Promise<void>
  bootstrapping: boolean
  actionMessage: string | null
}) {
  const idleWorkers = workers.filter((worker) => worker.status === 'idle')
  const canCreateRun = repositories.length > 0 && idleWorkers.length > 0 && !run
  const canBootstrapRun = Boolean(run && ['reserved', 'failed'].includes(run.status))

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
            className="inline-flex h-7 items-center gap-1.5 border border-[rgba(0,255,140,0.2)] bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[rgba(0,255,140,0.2)] disabled:hover:text-fg-3"
            title={canCreateRun ? 'reserve idle worker' : 'needs a repository and idle worker'}
          >
            <TerminalSquare className="h-3 w-3" />
            assign
          </button>
        ) : null}
      </div>

      {repositories.length === 0 ? (
        <button
          onClick={() => {
            void onSeedRepositories()
          }}
          className="mb-3 w-full border border-[rgba(0,255,140,0.18)] bg-[rgba(0,255,136,0.04)] px-3 py-2 text-left font-mono text-xs text-fg-2 transition hover:border-accent hover:text-accent"
        >
          seed default GitHub repos
        </button>
      ) : null}

      {!run ? (
        <div className="space-y-1.5 font-mono text-xs text-fg-4">
          <div>// no active agent run</div>
          <div>
            {idleWorkers.length} idle worker{idleWorkers.length === 1 ? '' : 's'} · {repositories.length} repo
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
          </div>

          {canBootstrapRun ? (
            <button
              onClick={() => {
                void onBootstrapRun()
              }}
              disabled={bootstrapping}
              className="w-full border border-[rgba(0,255,140,0.18)] bg-[rgba(0,255,136,0.04)] px-2.5 py-2 text-left font-mono text-xs uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-wait disabled:opacity-50"
            >
              {bootstrapping ? 'bootstrapping tmux...' : 'bootstrap tmux on worker'}
            </button>
          ) : null}

          {actionMessage ? (
            <div className="border border-[rgba(0,255,140,0.12)] bg-pit-3 px-2.5 py-2 font-mono text-xs text-fg-3">
              {actionMessage}
            </div>
          ) : null}

          {run.statusMessage ? (
            <div className="border border-[rgba(0,255,140,0.12)] bg-pit-3 px-2.5 py-2 font-mono text-xs text-fg-3">
              {run.statusMessage}
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">terminals</div>
            <div className="flex flex-wrap gap-1.5">
              {terminals.map((terminal) => (
                <span
                  key={terminal.id}
                  className="inline-flex items-center gap-1 border border-[rgba(0,255,140,0.14)] bg-pit-3 px-1.5 py-0.5 font-mono text-[10px] lowercase text-fg-3"
                >
                  <span className="text-fg-4">▸</span>
                  {terminal.name}
                </span>
              ))}
            </div>
          </div>

          {pullRequest ? (
            <a
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate border border-[rgba(0,255,140,0.18)] bg-[rgba(0,255,136,0.04)] px-2.5 py-2 font-mono text-xs text-accent hover:border-accent"
            >
              PR #{pullRequest.number} · {pullRequest.isDraft ? 'draft' : pullRequest.state}
            </a>
          ) : (
            <div className="font-mono text-xs text-fg-4">// no pull request yet</div>
          )}

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
                      className="block border border-[rgba(0,255,140,0.14)] bg-pit-3 px-2 py-1.5 font-mono text-[11px] text-fg-3 transition hover:border-accent hover:text-accent"
                    >
                      {body}
                    </a>
                  ) : (
                    <div
                      key={artifact.id}
                      className="border border-[rgba(0,255,140,0.1)] bg-pit-3 px-2 py-1.5 font-mono text-[11px] text-fg-3"
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
        </div>
      )}
    </div>
  )
}

function getWorkspaceStatuses(statuses: Schema['tables']['pm_statuses']['row'][]) {
  const uniqueStatuses = new Map<string, Schema['tables']['pm_statuses']['row']>()
  for (const status of statuses) {
    if (status.teamId) continue
    if (!uniqueStatuses.has(status.key)) uniqueStatuses.set(status.key, status)
  }

  return Array.from(uniqueStatuses.values()).sort((a, b) => a.position - b.position)
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

function DescriptionView({ source }: { source: string }) {
  return (
    <div className="font-mono text-sm leading-relaxed text-fg-2 markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 font-mono text-xl font-bold text-fg-1 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 font-mono text-lg font-bold text-fg-1 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-2 font-mono text-base font-bold text-fg-1 first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1.5 font-mono text-sm font-bold uppercase tracking-label text-fg-2 first:mt-0">{children}</h4>
          ),
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 text-fg-2">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-[rgba(0,255,140,0.4)] underline-offset-2 hover:text-accent hover:decoration-accent"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-bold text-fg-1">{children}</strong>,
          em: ({ children }) => <em className="italic text-fg-1">{children}</em>,
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 marker:text-fg-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 marker:text-fg-4">{children}</ol>,
          li: ({ children }) => <li className="text-fg-2">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[rgba(0,255,140,0.25)] pl-3 text-fg-3 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-0 border-t border-[rgba(0,255,140,0.15)]" />,
          code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => {
            if (inline) {
              return (
                <code
                  className="border border-[rgba(0,255,140,0.15)] bg-pit-3 px-1.5 py-0.5 font-mono text-[0.85em] text-accent"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code className="font-mono text-[0.85em] text-fg-1" {...props}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-auto border border-[rgba(0,255,140,0.15)] bg-pit-3 p-3 font-mono text-[0.85em] leading-relaxed text-fg-1">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-auto">
              <table className="w-full border-collapse border border-[rgba(0,255,140,0.15)] font-mono text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-pit-3">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-[rgba(0,255,140,0.15)] px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-label text-fg-3">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[rgba(0,255,140,0.1)] px-3 py-1.5 text-fg-2">{children}</td>
          ),
          input: ({ type, checked, disabled, ...props }) => {
            if (type === 'checkbox') {
              return (
                <span
                  aria-hidden
                  className={`mr-1.5 inline-flex h-3.5 w-3.5 -translate-y-[1px] items-center justify-center border align-middle ${
                    checked
                      ? 'border-accent bg-accent'
                      : 'border-[rgba(0,255,140,0.25)] bg-transparent'
                  }`}
                >
                  {checked && (
                    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-pit" fill="none">
                      <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              )
            }
            return <input type={type} checked={checked} disabled={disabled} {...props} />
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

function AutoGrowTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className,
  textareaRef,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void | Promise<void>
  placeholder: string
  className: string
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>
}) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={(el) => {
        innerRef.current = el
        if (textareaRef) textareaRef.current = el
      }}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      onBlur={() => {
        void onBlur()
      }}
      placeholder={placeholder}
      className={className}
      style={{ minHeight: '6rem' }}
    />
  )
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
        className="inline-flex items-center gap-1 border border-[rgba(0,255,140,0.2)] bg-pit-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-fg-3 hover:text-fg-1 hover:border-[rgba(0,255,140,0.3)] transition"
        title="add label"
      >
        <Plus className="h-3 w-3" />
        add
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[220px] border border-[rgba(0,255,140,0.25)] bg-pit shadow-[0_0_18px_rgba(0,255,136,0.18),0_18px_44px_rgba(0,0,0,0.6)]">
          <div className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
            labels
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {available.length === 0 ? (
              <div className="px-3 py-2 font-mono text-xs text-fg-4">// no labels available</div>
            ) : (
              available.map((label) => {
                const checked = selectedIds.has(label.id)
                const color = label.color || '#5a8a72'
                return (
                  <button
                    key={label.id}
                    onClick={() => onToggle(label.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-mono text-xs lowercase text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 transition"
                  >
                    <span
                      aria-hidden
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition ${
                        checked ? 'border-accent bg-accent' : 'border-[rgba(0,255,140,0.2)] bg-transparent'
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
      className="w-full border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-fg-1 outline-none hover:border-[rgba(0,255,140,0.2)] hover:bg-[rgba(0,255,136,0.04)] focus:border-accent focus:bg-[rgba(0,255,136,0.06)] transition [color-scheme:dark]"
    />
  )
}

function ActivityEntry({ entry }: { entry: Schema['tables']['pm_issue_activity']['row'] }) {
  const isComment = entry.type === 'comment'
  if (isComment) {
    return (
      <div className="border border-[rgba(0,255,140,0.1)] bg-[rgba(10,14,12,0.5)] px-4 py-3">
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
