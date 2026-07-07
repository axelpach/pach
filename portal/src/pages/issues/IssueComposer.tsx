import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { useNavigate } from 'react-router-dom'
import { Bot, Building2, FolderKanban, Plus } from 'lucide-react'
import { PachSelect } from '../../components/PachSelect'
import { RichEditor } from '../../components/rich-editor/RichEditor'
import { authFetch, useAuth } from '../../lib/auth'
import type { Mutators } from '../../mutators'
import type { Schema } from '../../zero-schema'
import { config } from '../../config'
import {
  AgentModeChoiceModal,
  type AgentMode,
  type AgentModeChoice,
  type AgentRepositoryPreview,
} from './AgentModeChoiceModal'
import { PRIORITY_META, PriorityIcon } from './PriorityIcon'
import { StatusIcon } from './StatusIcon'

export const OPEN_ISSUE_COMPOSER_EVENT = 'pach:open-issue-composer'

const ESTIMATES = [1, 2, 4, 8, 16]
const SORT_ORDER_BASE = 1000
const SORT_ORDER_STEP = 1024

type Foundation = {
  defaultTeamId: string
  defaultStatusId: string
  defaultProjectId?: string
}

type QueueAgentRunPayload = {
  code?: string
  error?: string
  route?: { mode?: string; reason?: string; confidence?: number }
  engineeringRepository?: AgentRepositoryPreview | null
}

export function requestGlobalIssueComposer() {
  window.dispatchEvent(new Event(OPEN_ISSUE_COMPOSER_EVENT))
}

export function GlobalIssueComposer() {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  const [companies] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [documents] = useQuery(z.query.documents.orderBy('updatedAt', 'desc'))

  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const canAccessUnscoped = user?.canAccessUnscoped ?? false
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : canAccessUnscoped
  const scopedCompanies = companies.filter((company) => canAccessOrganization(company.id))
  const scopedIssues = issues.filter((issue) => canAccessOrganization(issue.contextCompanyId))
  const authUserRow: Schema['tables']['users']['row'] | null = user
    ? { id: user.id, email: user.email, name: user.name ?? undefined, createdAt: 0, updatedAt: 0 }
    : null
  const assignableUsers =
    authUserRow && !users.some((entry) => entry.id === authUserRow.id)
      ? [...users, authUserRow]
      : users
  const workspaceStatuses = getWorkspaceStatuses(statuses)

  const [issueId, setIssueId] = useState(() => crypto.randomUUID())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [statusId, setStatusId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState<number>(2)
  const [estimate, setEstimate] = useState<number>(4)
  const [createMore, setCreateMore] = useState(false)
  const [doTask, setDoTask] = useState(false)
  const [creating, setCreating] = useState(false)
  const [agentRunMessage, setAgentRunMessage] = useState<string | null>(null)
  const [composerToast, setComposerToast] = useState<string | null>(null)
  const [agentModeChoice, setAgentModeChoice] = useState<AgentModeChoice | null>(null)
  const [agentModeBusy, setAgentModeBusy] = useState<AgentMode | null>(null)
  const composerToastTimerRef = useRef<number | null>(null)

  const selectedTeam = teams.find((team) => team.id === teamId) ?? teams[0] ?? null
  const teamProjects = selectedTeam ? projects.filter((project) => project.teamId === selectedTeam.id) : []
  const defaultStatusId =
    workspaceStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
    workspaceStatuses[0]?.id ??
    ''

  useEffect(() => {
    function handleOpenComposer() {
      setOpen(true)
    }

    window.addEventListener(OPEN_ISSUE_COMPOSER_EVENT, handleOpenComposer)
    return () => window.removeEventListener(OPEN_ISSUE_COMPOSER_EVENT, handleOpenComposer)
  }, [])

  useEffect(() => {
    if (!teams.length) return
    if (teamId && teams.some((team) => team.id === teamId)) return
    setTeamId(teams[0].id)
  }, [teamId, teams])

  useEffect(() => {
    if (!projectId) return
    if (teamProjects.some((project) => project.id === projectId)) return
    setProjectId('')
  }, [projectId, teamProjects])

  useEffect(() => {
    if (!statusId && defaultStatusId) {
      setStatusId(defaultStatusId)
      return
    }
    if (statusId && workspaceStatuses.some((status) => status.id === statusId)) return
    setStatusId(defaultStatusId)
  }, [statusId, workspaceStatuses, defaultStatusId])

  useEffect(() => {
    if (!companyId && !canAccessUnscoped && scopedCompanies.length === 1) {
      setCompanyId(scopedCompanies[0].id)
      return
    }
    if (!companyId) return
    if (scopedCompanies.some((company) => company.id === companyId)) return
    setCompanyId('')
  }, [canAccessUnscoped, companyId, scopedCompanies])

  useEffect(() => {
    if (!assigneeId && user?.id) {
      setAssigneeId(user.id)
      return
    }
    if (assigneeId && !assignableUsers.some((entry) => entry.id === assigneeId)) {
      setAssigneeId('')
    }
  }, [assigneeId, assignableUsers, user?.id])

  useEffect(() => {
    if (!open) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open])

  useEffect(() => {
    return () => {
      if (composerToastTimerRef.current != null) window.clearTimeout(composerToastTimerRef.current)
    }
  }, [])

  function showComposerToast(message: string) {
    setComposerToast(message)
    if (composerToastTimerRef.current != null) window.clearTimeout(composerToastTimerRef.current)
    composerToastTimerRef.current = window.setTimeout(() => {
      setComposerToast(null)
      composerToastTimerRef.current = null
    }, 3600)
  }

  function getTopSortOrder(nextPriority: number, nextStatusId: string) {
    const bucket = scopedIssues
      .filter((issue) => issue.priority === nextPriority && issue.statusId === nextStatusId)
      .sort(compareIssuesForBucketOrder)
    const minSortOrder = bucket[0]?.sortOrder
    return minSortOrder == null ? SORT_ORDER_BASE : minSortOrder - SORT_ORDER_STEP
  }

  async function ensureWorkspaceFoundation(): Promise<Foundation> {
    const existingDefaultStatusId =
      workspaceStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
      workspaceStatuses[0]?.id
    const existingTeam = teams[0]
    if (existingTeam && existingDefaultStatusId) {
      return {
        defaultTeamId: existingTeam.id,
        defaultStatusId: existingDefaultStatusId,
        defaultProjectId: projects.find((project) => project.teamId === existingTeam.id)?.id,
      }
    }

    const nextTeamId = existingTeam?.id ?? crypto.randomUUID()
    const statusDefs = [
      { id: crypto.randomUUID(), name: 'Todo', key: 'todo', type: 'unstarted', color: '#94a3b8' },
      { id: crypto.randomUUID(), name: 'In Progress', key: 'in_progress', type: 'started', color: '#fbbf24' },
      { id: crypto.randomUUID(), name: 'In Review', key: 'in_review', type: 'review', color: '#38bdf8' },
      { id: crypto.randomUUID(), name: 'Blocked', key: 'blocked', type: 'blocked', color: '#f87171' },
      { id: crypto.randomUUID(), name: 'Canceled', key: 'canceled', type: 'canceled', color: '#6b7280' },
      { id: crypto.randomUUID(), name: 'Done', key: 'done', type: 'completed', color: '#4ade80' },
    ]
    const nextProjectId = crypto.randomUUID()

    if (!existingTeam) {
      await z.mutate.pm_teams.create({
        id: nextTeamId,
        key: 'PAC',
        name: 'Pach',
        description: 'Default workspace team',
        color: '#00ff88',
      })
    }

    for (const [index, status] of statusDefs.entries()) {
      await z.mutate.pm_statuses.create({
        id: status.id,
        name: status.name,
        key: status.key,
        type: status.type,
        color: status.color,
        position: index,
      })
    }

    await z.mutate.pm_projects.create({
      id: nextProjectId,
      teamId: nextTeamId,
      name: 'Core',
      slug: 'core',
      description: 'Core workspace roadmap',
    })

    return {
      defaultTeamId: nextTeamId,
      defaultStatusId: statusDefs[0].id,
      defaultProjectId: nextProjectId,
    }
  }

  async function logActivity(issueId: string, identifier: string, organizationId: string | undefined) {
    const activityOrganizationId =
      organizationId ??
      companies.find((entry) => entry.project === 'pach')?.id ??
      scopedCompanies[0]?.id
    if (!activityOrganizationId) return

    await z.mutate.activity_events.create({
      id: crypto.randomUUID(),
      organizationId: activityOrganizationId,
      eventType: 'created',
      activityKind: 'operational',
      subjectType: 'pm_issue',
      subjectId: issueId,
      subjectLabel: identifier,
      actorType: user ? 'user' : 'system',
      actorId: user?.id,
      actorName: user?.name ?? user?.email,
      source: 'pach_app',
      severity: 'info',
      summary: `Created issue ${identifier}`,
      details: {},
      metadata: {},
    })
  }

  function resetIssueDraft() {
    setIssueId(crypto.randomUUID())
    setTitle('')
    setDescription('')
    setAgentRunMessage(null)
  }

  function finishCreatedIssue() {
    resetIssueDraft()
    if (!createMore) setOpen(false)
  }

  async function queueAgentRunForIssue(nextIssueId: string, identifier: string, nextTitle: string, modeOverride?: AgentMode) {
    const response = await authFetch(`${config.apiUrl}/agent/issues/${nextIssueId}/runs/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'issue_do_task',
        modeOverride,
      }),
    })
    const payload = await response.json().catch(() => ({})) as QueueAgentRunPayload
    if (response.status === 409 && payload.code === 'ROUTE_NEEDS_CLARIFICATION') {
      setAgentModeChoice({
        issueId: nextIssueId,
        issueLabel: identifier,
        issueTitle: nextTitle,
        reason: payload.route?.reason ?? payload.error ?? 'Pach could not confidently choose an agent mode.',
        confidence: payload.route?.confidence,
        engineeringRepository: payload.engineeringRepository ?? null,
      })
      setAgentRunMessage('choose agent mode to start the run')
      return false
    }
    if (!response.ok) throw new Error(payload.error ?? 'Failed to queue agent run')
    const mode = payload.route?.mode?.replace('_', ' ') ?? 'agent'
    setAgentRunMessage(`queued ${mode} run`)
    showComposerToast(`queued ${mode} run`)
    setAgentModeChoice(null)
    return true
  }

  async function createIssue() {
    if (!title.trim() || !user) return
    if (!companyId && !canAccessUnscoped) return

    setCreating(true)
    setAgentRunMessage(null)
    let createdIssue = false
    try {
      const foundation = await ensureWorkspaceFoundation()
      const nextTeamId = teamId || foundation.defaultTeamId
      const team = teams.find((entry) => entry.id === nextTeamId) ?? {
        id: foundation.defaultTeamId,
        key: 'PAC',
        name: 'Pach',
      }
      const nextStatusId =
        statusId ||
        workspaceStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ||
        defaultStatusId ||
        foundation.defaultStatusId
      const nextProjectId = projectId || undefined
      const nextNumber =
        scopedIssues.filter((issue) => issue.teamId === nextTeamId).reduce((max, issue) => Math.max(max, issue.number), 0) + 1
      const identifier = `${team.key}-${nextNumber}`
      const nextTitle = title.trim()

      await z.mutate.pm_issues.create({
        id: issueId,
        contextCompanyId: companyId || undefined,
        teamId: nextTeamId,
        projectId: nextProjectId,
        statusId: nextStatusId,
        assigneeId: assigneeId || user.id,
        creatorId: user.id,
        identifier,
        number: nextNumber,
        title: nextTitle,
        description: description.trim() || undefined,
        priority,
        estimate,
        sortOrder: getTopSortOrder(priority, nextStatusId),
      })

      await logActivity(issueId, identifier, companyId || undefined)
      createdIssue = true
      if (doTask) {
        setAgentRunMessage('starting agent run...')
        const queued = await queueAgentRunForIssue(issueId, identifier, nextTitle)
        if (!queued) return
      }
      finishCreatedIssue()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create issue'
      setAgentRunMessage(message)
      showComposerToast(message)
      if (createdIssue) finishCreatedIssue()
    } finally {
      setCreating(false)
    }
  }

  function chooseAgentMode(mode: AgentMode) {
    const choice = agentModeChoice
    if (!choice || agentModeBusy) return
    setAgentModeBusy(mode)
    setAgentRunMessage(`starting ${mode.replace('_', ' ')} run...`)
    void queueAgentRunForIssue(choice.issueId, choice.issueLabel, choice.issueTitle, mode)
      .then((queued) => {
        if (queued) finishCreatedIssue()
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to queue agent run'
        setAgentRunMessage(message)
        showComposerToast(message)
      })
      .finally(() => setAgentModeBusy(null))
  }

  return (
    <>
      {open ? (
        <IssueComposerModal
          issueId={issueId}
          title={title}
          onTitleChange={setTitle}
          description={description}
          onDescriptionChange={setDescription}
          companyId={companyId}
          onCompanyChange={setCompanyId}
          teamId={teamId}
          onTeamChange={setTeamId}
          projectId={projectId}
          onProjectChange={setProjectId}
          statusId={statusId}
          onStatusChange={setStatusId}
          assigneeId={assigneeId}
          onAssigneeChange={setAssigneeId}
          priority={priority}
          onPriorityChange={setPriority}
          estimate={estimate}
          onEstimateChange={setEstimate}
          createMore={createMore}
          onCreateMoreChange={setCreateMore}
          doTask={doTask}
          onDoTaskChange={setDoTask}
          companies={scopedCompanies}
          teams={teams}
          projects={teamProjects}
          statuses={workspaceStatuses}
          users={assignableUsers}
          documents={documents}
          issues={scopedIssues}
          team={selectedTeam}
          creating={creating}
          agentRunMessage={agentRunMessage}
          organizationRequired={!canAccessUnscoped}
          onOpenDocument={(id) => navigate(`/docs/${id}`)}
          onOpenIssue={(id) => navigate(`/issues/${id}`)}
          onClose={() => setOpen(false)}
          onCreate={createIssue}
        />
      ) : null}
      {agentModeChoice ? (
        <AgentModeChoiceModal
          choice={agentModeChoice}
          busyMode={agentModeBusy}
          onChoose={chooseAgentMode}
          onCancel={() => {
            setAgentModeChoice(null)
            setAgentModeBusy(null)
            finishCreatedIssue()
          }}
        />
      ) : null}
      {composerToast ? (
        <div className="fixed bottom-4 right-4 z-[980] border border-edge/20 bg-pit-2 px-3 py-2 font-mono text-xs text-fg-2 shadow-terminal-overlay">
          {composerToast}
        </div>
      ) : null}
    </>
  )
}

function IssueComposerModal({
  issueId,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  companyId,
  onCompanyChange,
  teamId,
  onTeamChange,
  projectId,
  onProjectChange,
  statusId,
  onStatusChange,
  assigneeId,
  onAssigneeChange,
  priority,
  onPriorityChange,
  estimate,
  onEstimateChange,
  createMore,
  onCreateMoreChange,
  doTask,
  onDoTaskChange,
  companies,
  teams,
  projects,
  statuses,
  users,
  documents,
  issues,
  team,
  creating,
  agentRunMessage,
  organizationRequired,
  onOpenDocument,
  onOpenIssue,
  onClose,
  onCreate,
}: {
  issueId: string
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  companyId: string
  onCompanyChange: (value: string) => void
  teamId: string
  onTeamChange: (value: string) => void
  projectId: string
  onProjectChange: (value: string) => void
  statusId: string
  onStatusChange: (value: string) => void
  assigneeId: string
  onAssigneeChange: (value: string) => void
  priority: number
  onPriorityChange: (value: number) => void
  estimate: number
  onEstimateChange: (value: number) => void
  createMore: boolean
  onCreateMoreChange: (value: boolean) => void
  doTask: boolean
  onDoTaskChange: (value: boolean) => void
  companies: Schema['tables']['organizations']['row'][]
  teams: Schema['tables']['pm_teams']['row'][]
  projects: Schema['tables']['pm_projects']['row'][]
  statuses: Schema['tables']['pm_statuses']['row'][]
  users: Schema['tables']['users']['row'][]
  documents: Schema['tables']['documents']['row'][]
  issues: Schema['tables']['pm_issues']['row'][]
  team: Schema['tables']['pm_teams']['row'] | null
  creating: boolean
  agentRunMessage: string | null
  organizationRequired: boolean
  onOpenDocument: (id: string) => void
  onOpenIssue: (id: string) => void
  onClose: () => void
  onCreate: () => void
}) {
  const currentStatus = statuses.find((status) => status.id === statusId)
  const currentProject = projects.find((project) => project.id === projectId)
  const currentCompany = companies.find((company) => company.id === companyId)
  const currentAssignee = users.find((entry) => entry.id === assigneeId)

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      if (title.trim() && (!organizationRequired || companyId) && !creating) onCreate()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100vh-5rem)] w-full max-w-2xl overflow-y-auto border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <PachSelect
              variant="button"
              value={teamId}
              onChange={onTeamChange}
              options={teams.map((entry) => ({ value: entry.id, label: entry.name.toLowerCase() }))}
              trigger={
                <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  {team?.key ?? 'team'}
                </span>
              }
              triggerTitle="change team"
              triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
              popupWidth="200px"
            />
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">new issue</span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fg-1"
            title="close"
          >
            [esc]
          </button>
        </div>

        <div className="px-5 pt-4">
          <input
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="issue title"
            className="w-full bg-transparent px-0 py-1 font-mono text-lg text-fg-1 outline-none placeholder:text-fg-4"
          />
          <RichEditor
            key={issueId}
            owner={{ type: 'issue', id: issueId }}
            value={description}
            documents={documents}
            issues={issues}
            organizationId={companyId || null}
            onChange={onDescriptionChange}
            onOpenDocument={onOpenDocument}
            onOpenIssue={onOpenIssue}
            placeholder="add description..."
            className="min-h-[12rem] text-sm"
            wrapperClassName="relative mt-2"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <PachSelect
            variant="button"
            value={statusId}
            onChange={onStatusChange}
            options={statuses.map((status) => ({
              value: status.id,
              label: status.name.toLowerCase(),
              icon: <StatusIcon statusType={status.type} />,
            }))}
            trigger={
              <ComposerPill
                icon={<StatusIcon statusType={currentStatus?.type ?? 'backlog'} />}
                label={currentStatus?.name?.toLowerCase() ?? 'status'}
              />
            }
            triggerTitle="status"
            triggerClassName="transition"
            popupWidth="200px"
          />

          <PachSelect
            variant="button"
            value={String(priority)}
            onChange={(next) => onPriorityChange(Number(next))}
            options={[1, 2, 3, 4, 0].map((nextPriority) => ({
              value: String(nextPriority),
              label: PRIORITY_META[nextPriority].label,
              icon: <PriorityIcon priority={nextPriority} />,
            }))}
            trigger={
              <ComposerPill
                icon={<PriorityIcon priority={priority} />}
                label={PRIORITY_META[priority]?.label ?? 'priority'}
              />
            }
            triggerTitle="priority"
            triggerClassName="transition"
            popupWidth="180px"
          />

          <PachSelect
            variant="button"
            value={assigneeId}
            onChange={onAssigneeChange}
            options={users.map((entry) => ({ value: entry.id, label: (entry.name ?? entry.email).toLowerCase() }))}
            trigger={
              <ComposerPill
                icon={<span className="font-mono text-[10px] text-fg-3">@</span>}
                label={(currentAssignee?.name ?? currentAssignee?.email)?.toLowerCase() ?? 'assignee'}
              />
            }
            triggerTitle="assignee"
            triggerClassName="transition"
            popupWidth="220px"
          />

          <PachSelect
            variant="button"
            value={projectId}
            onChange={onProjectChange}
            options={[
              { value: '', label: 'no project' },
              ...projects.map((project) => ({
                value: project.id,
                label: project.name.toLowerCase(),
                icon: <FolderKanban className="h-3 w-3" />,
              })),
            ]}
            trigger={
              <ComposerPill
                icon={<FolderKanban className="h-3 w-3" />}
                label={currentProject?.name?.toLowerCase() ?? 'project'}
              />
            }
            triggerTitle="project"
            triggerClassName="transition"
            popupWidth="220px"
          />

          <PachSelect
            variant="button"
            value={String(estimate)}
            onChange={(next) => onEstimateChange(Number(next))}
            options={ESTIMATES.map((nextEstimate) => ({ value: String(nextEstimate), label: `${nextEstimate} pts` }))}
            trigger={
              <ComposerPill
                icon={<span className="font-mono text-[10px] text-fg-3">#</span>}
                label={`${estimate} pts`}
              />
            }
            triggerTitle="estimate"
            triggerClassName="transition"
            popupWidth="160px"
          />

          <PachSelect
            variant="button"
            value={companyId}
            onChange={onCompanyChange}
            options={[
              { value: '', label: 'no organization' },
              ...companies.map((company) => ({ value: company.id, label: company.name })),
            ]}
            trigger={
              <ComposerPill
                icon={<Building2 className="h-3 w-3" />}
                label={currentCompany?.name?.toLowerCase() ?? 'organization'}
              />
            }
            triggerTitle="organization context"
            triggerClassName="transition"
            popupWidth="220px"
          />
        </div>

        <div className="flex items-center justify-between border-t border-edge/12 px-5 py-3">
          <button
            onClick={onClose}
            className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
          >
            [cancel]
          </button>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {agentRunMessage ? (
                <span className="max-w-[220px] truncate font-mono text-[10px] uppercase tracking-label text-fg-3">
                  {agentRunMessage}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onDoTaskChange(!doTask)}
                disabled={creating}
                className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:text-fg-1 disabled:cursor-wait disabled:opacity-50"
                title="start an agent run after creating"
              >
                <CheckboxBox checked={doTask} />
                <Bot className="h-3.5 w-3.5 text-accent" />
                do task
              </button>
              <button
                type="button"
                onClick={() => onCreateMoreChange(!createMore)}
                disabled={creating}
                className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:text-fg-1 disabled:cursor-wait disabled:opacity-50"
                title="keep modal open after creating"
              >
                <CheckboxBox checked={createMore} />
                create more
              </button>
            </div>
            <button
              onClick={onCreate}
              disabled={!title.trim() || (organizationRequired && !companyId) || creating}
              className="inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-accent-fill/8 disabled:hover:shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? (doTask ? 'creating + starting...' : 'creating...') : 'create issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckboxBox({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-3.5 w-3.5 items-center justify-center border transition ${
      checked ? 'border-accent bg-accent-fill/20' : 'border-edge/25'
    }`}
    >
      {checked ? <span className="text-[10px] leading-none text-accent">x</span> : null}
    </span>
  )
}

function ComposerPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-edge/20 bg-pit-3 px-2.5 py-1 font-mono text-[11px] lowercase text-fg-2 transition hover:border-edge/40 hover:bg-accent-fill/4 hover:text-fg-1">
      <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
      <span className="max-w-[160px] truncate">{label}</span>
    </span>
  )
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

function compareIssuesForBucketOrder(
  a: Schema['tables']['pm_issues']['row'],
  b: Schema['tables']['pm_issues']['row'],
) {
  const sortDiff = a.sortOrder - b.sortOrder
  if (sortDiff !== 0) return sortDiff
  return b.createdAt - a.createdAt
}

function statusRank(statusType: string) {
  if (statusType === 'backlog') return 0
  if (statusType === 'unstarted') return 1
  if (statusType === 'blocked') return 2
  if (statusType === 'started') return 3
  if (statusType === 'review') return 4
  if (statusType === 'completed') return 5
  if (statusType === 'canceled') return 6
  return 99
}
