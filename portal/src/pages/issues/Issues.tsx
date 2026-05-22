import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, Circle, FolderKanban, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  type SortingStrategy,
} from '@dnd-kit/sortable'

// rows stay put while dragging — we show an indicator line + DragOverlay ghost instead
const noShiftStrategy: SortingStrategy = () => null
import { PachSelect } from './PachSelect'
import { StatusIcon } from './StatusIcon'
import { PRIORITY_META, PriorityIcon } from './PriorityIcon'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from './IssueFilters'
import { useQuery, useZero } from '@rocicorp/zero/react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'
import { useTrackerContext } from './IssuesLayout'

const PRIORITY_GROUPS = [
  { value: 1, label: 'urgent', accent: 'text-amber' },
  { value: 2, label: 'high', accent: 'text-fg-2' },
  { value: 3, label: 'medium', accent: 'text-fg-2' },
  { value: 4, label: 'low', accent: 'text-fg-2' },
  { value: 0, label: 'unprioritized', accent: 'text-fg-3' },
] as const

const ESTIMATES = [2, 4, 8, 16]

const STATUS_BUCKETS = [
  { key: 'backlog', label: 'backlog', type: 'backlog' },
  { key: 'todo', label: 'todo', type: 'unstarted' },
  { key: 'in_progress', label: 'in progress', type: 'started' },
  { key: 'blocked', label: 'blocked', type: 'blocked' },
  { key: 'done', label: 'done', type: 'completed' },
  { key: 'canceled', label: 'canceled', type: 'canceled' },
] as const

type Foundation = {
  defaultTeamId: string
  defaultStatusId: string
  defaultProjectId?: string
}

export default function Issues() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const { section, setSection, composerRequestId } = useTrackerContext()

  const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))

  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerTitle, setComposerTitle] = useState('')
  const [composerDescription, setComposerDescription] = useState('')
  const [composerCompanyId, setComposerCompanyId] = useState('')
  const [composerTeamId, setComposerTeamId] = useState('')
  const [composerProjectId, setComposerProjectId] = useState('')
  const [composerStatusId, setComposerStatusId] = useState('')
  const [composerAssigneeId, setComposerAssigneeId] = useState('')
  const [composerPriority, setComposerPriority] = useState<number>(2)
  const [composerEstimate, setComposerEstimate] = useState<number>(4)
  const [composerCreateMore, setComposerCreateMore] = useState(false)
  const [creatingIssue, setCreatingIssue] = useState(false)
  const [collapsedPriorities, setCollapsedPriorities] = useState<Set<number>>(new Set())
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set())
  const [projectModal, setProjectModal] = useState<
    | { mode: 'create'; teamId: string }
    | { mode: 'edit'; projectId: string }
    | null
  >(null)
  const [projectDraftName, setProjectDraftName] = useState('')
  const [projectDraftDescription, setProjectDraftDescription] = useState('')
  const [projectDraftStatus, setProjectDraftStatus] = useState('active')
  const [savingProject, setSavingProject] = useState(false)

  function togglePriority(value: number) {
    setCollapsedPriorities((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function openCreateProject(teamId: string) {
    setProjectDraftName('')
    setProjectDraftDescription('')
    setProjectDraftStatus('active')
    setProjectModal({ mode: 'create', teamId })
  }

  function openEditProject(project: Schema['tables']['pm_projects']['row']) {
    setProjectDraftName(project.name)
    setProjectDraftDescription(project.description ?? '')
    setProjectDraftStatus(project.status || 'active')
    setProjectModal({ mode: 'edit', projectId: project.id })
  }

  function closeProjectModal() {
    setProjectModal(null)
    setProjectDraftName('')
    setProjectDraftDescription('')
    setProjectDraftStatus('active')
    setSavingProject(false)
  }

  function slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  }

  async function submitProjectModal() {
    if (!projectModal) return
    const name = projectDraftName.trim()
    if (!name) return

    setSavingProject(true)
    try {
      if (projectModal.mode === 'create') {
        await z.mutate.pm_projects.create({
          id: crypto.randomUUID(),
          teamId: projectModal.teamId,
          name,
          slug: slugify(name),
          description: projectDraftDescription.trim() || undefined,
          status: projectDraftStatus,
        })
      } else {
        await z.mutate.pm_projects.update({
          id: projectModal.projectId,
          name,
          slug: slugify(name),
          description: projectDraftDescription.trim() || undefined,
          status: projectDraftStatus,
        })
      }
      closeProjectModal()
    } finally {
      setSavingProject(false)
    }
  }

  function toggleStatusGroup(key: string) {
    setCollapsedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const workspaceCompany =
    companies.find((company) => company.project === 'pach') ??
    companies.find((company) => company.name.trim().toLowerCase() === 'pach') ??
    null

  const companyMap = new Map(companies.map((company) => [company.id, company]))
  const teamMap = new Map(teams.map((team) => [team.id, team]))
  const statusMap = new Map(statuses.map((status) => [status.id, status]))
  const projectMap = new Map(projects.map((project) => [project.id, project]))
  const userMap = new Map(users.map((entry) => [entry.id, entry]))
  const workspaceStatuses = getWorkspaceStatuses(statuses)

  const contextCompanies = companies.filter((company) => company.id !== workspaceCompany?.id)
  const selectedTeam = section.kind === 'team' ? teams.find((team) => team.id === section.teamId) ?? null : null
  const selectedTeamIssues = selectedTeam ? issues.filter((issue) => issue.teamId === selectedTeam.id) : []
  const selectedTeamProjects = selectedTeam ? projects.filter((project) => project.teamId === selectedTeam.id) : []

  const selectedComposerTeam = teams.find((team) => team.id === composerTeamId) ?? teams[0] ?? null
  const composerProjects = selectedComposerTeam
    ? projects.filter((project) => project.teamId === selectedComposerTeam.id)
    : []
  const defaultComposerStatusId =
    workspaceStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
    workspaceStatuses[0]?.id ??
    ''

  useEffect(() => {
    if (!teams.length) return
    if (composerTeamId && teams.some((team) => team.id === composerTeamId)) return
    setComposerTeamId(teams[0].id)
  }, [composerTeamId, teams])

  useEffect(() => {
    // optional project — keep blank if user hasn't picked one; only clear when invalid
    if (!composerProjectId) return
    if (composerProjects.some((project) => project.id === composerProjectId)) return
    setComposerProjectId('')
  }, [composerProjectId, composerProjects])

  useEffect(() => {
    if (!composerStatusId && defaultComposerStatusId) {
      setComposerStatusId(defaultComposerStatusId)
      return
    }
    if (composerStatusId && workspaceStatuses.some((s) => s.id === composerStatusId)) return
    setComposerStatusId(defaultComposerStatusId)
  }, [composerStatusId, workspaceStatuses, defaultComposerStatusId])

  useEffect(() => {
    // company context is optional — leave blank by default; clear if invalid
    if (!composerCompanyId) return
    if (contextCompanies.some((company) => company.id === composerCompanyId)) return
    setComposerCompanyId('')
  }, [composerCompanyId, contextCompanies])

  useEffect(() => {
    if (!composerAssigneeId && user?.id) {
      setComposerAssigneeId(user.id)
      return
    }
    if (composerAssigneeId && !users.some((u) => u.id === composerAssigneeId)) {
      setComposerAssigneeId(user?.id ?? '')
    }
  }, [composerAssigneeId, user, users])

  const lastComposerRequestRef = useRef(composerRequestId)
  useEffect(() => {
    if (composerRequestId === lastComposerRequestRef.current) return
    lastComposerRequestRef.current = composerRequestId
    setComposerOpen(true)
  }, [composerRequestId])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (composerOpen) return
      if (event.key !== 'c' || event.ctrlKey || event.metaKey || event.altKey) return

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      setComposerOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [composerOpen])

  useEffect(() => {
    if (!composerOpen) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setComposerOpen(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [composerOpen])

  useEffect(() => {
    if (!projectModal) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeProjectModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [projectModal])

  const filteredIssues = issues.filter((issue) => {
    if (section.kind === 'team' && issue.teamId !== section.teamId) return false

    // multiselect filters
    for (const [field, values] of Object.entries(activeFilters)) {
      if (!values.length) continue
      switch (field) {
        case 'status': {
          const bucket = getStatusBucket(statusMap.get(issue.statusId))?.key ?? ''
          if (!values.includes(bucket)) return false
          break
        }
        case 'priority':
          if (!values.includes(String(issue.priority))) return false
          break
        case 'team':
          if (!values.includes(issue.teamId)) return false
          break
        case 'project':
          if (!values.includes(issue.projectId ?? '__none')) return false
          break
        case 'assignee':
          if (!values.includes(issue.assigneeId ?? '__none')) return false
          break
        case 'company':
          if (!values.includes(issue.contextCompanyId ?? '__none')) return false
          break
      }
    }

    return true
  })

  const filterConfigs: FilterFieldConfig[] = [
    {
      field: 'status',
      label: 'status',
      icon: Circle,
      options: STATUS_BUCKETS.map((bucket) => ({
        value: bucket.key,
        label: bucket.label,
        icon: <StatusIcon statusType={bucket.type} />,
      })),
    },
    {
      field: 'priority',
      label: 'priority',
      icon: AlertTriangle,
      options: [1, 2, 3, 4, 0].map((p) => ({
        value: String(p),
        label: PRIORITY_META[p].label,
        icon: <PriorityIcon priority={p} />,
      })),
    },
    {
      field: 'team',
      label: 'team',
      icon: Circle,
      options: teams.map((t) => ({ value: t.id, label: t.name })),
    },
    {
      field: 'project',
      label: 'project',
      icon: FolderKanban,
      options: [
        { value: '__none', label: 'no project' },
        ...projects.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    {
      field: 'assignee',
      label: 'assignee',
      icon: Circle,
      options: [
        { value: '__none', label: 'unassigned' },
        ...users.map((u) => ({ value: u.id, label: u.name ?? u.email })),
      ],
    },
    {
      field: 'company',
      label: 'company',
      icon: Building2,
      options: [
        { value: '__none', label: 'no company' },
        ...contextCompanies.map((c) => ({ value: c.id, label: c.name })),
      ],
    },
  ]

  function setFilterField(field: string, values: string[]) {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (values.length === 0) delete next[field]
      else next[field] = values
      return next
    })
  }
  function clearAllFilters() {
    setActiveFilters({})
  }

  const groupedIssues = PRIORITY_GROUPS.map((group) => ({
    ...group,
    issues: filteredIssues.filter((issue) => issue.priority === group.value),
  })).filter((group) => group.issues.length > 0)

  const openCount = issues.filter((issue) => {
    const status = statusMap.get(issue.statusId)
    return status?.type !== 'completed' && status?.type !== 'canceled'
  }).length

  const blockedCount = issues.filter((issue) => statusMap.get(issue.statusId)?.type === 'blocked').length

  function getNextSortOrder(priority: number, statusId: string, excludeIssueId?: string) {
    const bucket = issues
      .filter((issue) => issue.priority === priority && issue.statusId === statusId && issue.id !== excludeIssueId)
      .sort(compareIssuesForBucketOrder)
    const maxSortOrder = bucket[bucket.length - 1]?.sortOrder ?? 0
    return maxSortOrder + 1024
  }

  async function logActivity(issueId: string, summary: string, type = 'created') {
    await z.mutate.pm_issue_activity.create({
      id: crypto.randomUUID(),
      issueId,
      actorId: user?.id,
      actorName: user?.name ?? user?.email,
      type,
      summary,
    })
  }

  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const activeDragIssue = activeDragId ? issues.find((entry) => entry.id === activeDragId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  const sensors = useSensors(
    // require a small drag distance before activating so plain clicks still navigate / open popups
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return
    const activeIssue = issues.find((entry) => entry.id === active.id)
    if (!activeIssue) return

    // figure out destination container (group key "<priority>:<statusBucketKey>")
    const overContainerRaw = (over.data.current?.sortable as { containerId?: string } | undefined)?.containerId
    const overContainer = overContainerRaw ?? (typeof over.id === 'string' ? over.id : null)
    if (!overContainer) return

    const [priorityStr, statusKey] = overContainer.split(':')
    const targetPriority = Number(priorityStr)
    if (Number.isNaN(targetPriority) || !statusKey) return

    // resolve target statusId — pick a status from the active issue's team that maps to this bucket
    const targetStatus =
      statuses.find(
        (s) => s.teamId === activeIssue.teamId && getStatusBucket(s)?.key === statusKey,
      ) ??
      // fallback: any status in that bucket
      statuses.find((s) => getStatusBucket(s)?.key === statusKey)
    if (!targetStatus) return

    // build the destination list including the active issue, sorted by sortOrder
    const fullList = issues
      .filter((entry) => entry.priority === targetPriority)
      .filter((entry) => getStatusBucket(statusMap.get(entry.statusId))?.key === statusKey)
      .sort(compareIssuesForBucketOrder)

    const oldIndex = fullList.findIndex((entry) => entry.id === activeIssue.id)
    const overIndex = fullList.findIndex((entry) => entry.id === over.id)

    let reordered: typeof fullList
    if (oldIndex >= 0) {
      // same container reorder — use arrayMove on the full list
      const newIndex = overIndex < 0 ? fullList.length - 1 : overIndex
      reordered = arrayMove(fullList, oldIndex, newIndex)
    } else {
      // cross-container drop — splice the active issue in
      const insertAt = overIndex < 0 ? fullList.length : overIndex
      reordered = [...fullList.slice(0, insertAt), activeIssue, ...fullList.slice(insertAt)]
    }

    const activePos = reordered.findIndex((entry) => entry.id === activeIssue.id)
    const before = reordered[activePos - 1]?.sortOrder
    const after = reordered[activePos + 1]?.sortOrder
    let newSortOrder: number
    if (before == null && after == null) newSortOrder = 1000
    else if (before == null) newSortOrder = (after as number) - 1
    else if (after == null) newSortOrder = before + 1
    else newSortOrder = (before + after) / 2

    if (
      newSortOrder === activeIssue.sortOrder &&
      activeIssue.priority === targetPriority &&
      activeIssue.statusId === targetStatus.id
    ) {
      return
    }

    const patch: Record<string, unknown> = { sortOrder: newSortOrder }
    const summaryParts: string[] = []

    if (activeIssue.priority !== targetPriority) {
      patch.priority = targetPriority
      summaryParts.push(
        `priority ${PRIORITY_META[activeIssue.priority]?.label ?? '—'} → ${PRIORITY_META[targetPriority]?.label ?? '—'}`,
      )
    }
    if (activeIssue.statusId !== targetStatus.id) {
      patch.statusId = targetStatus.id
      const now = Date.now()
      if (targetStatus.type === 'started' && !activeIssue.startedAt) patch.startedAt = now
      if (targetStatus.type === 'completed') patch.completedAt = now
      if (targetStatus.type === 'canceled') patch.canceledAt = now
      const fromStatus = statusMap.get(activeIssue.statusId)
      summaryParts.push(`moved from ${fromStatus?.name ?? '—'} to ${targetStatus.name}`)
    }

    await z.mutate.pm_issues.update({ id: activeIssue.id, ...patch })
    if (summaryParts.length) {
      await logActivity(activeIssue.id, summaryParts.join(' · '), 'updated')
    }
  }

  async function changeIssuePriority(issueId: string, nextRaw: string) {
    const issue = issues.find((entry) => entry.id === issueId)
    if (!issue) return
    const next = Number(nextRaw)
    if (next === issue.priority) return
    await z.mutate.pm_issues.update({
      id: issueId,
      priority: next,
      sortOrder: getNextSortOrder(next, issue.statusId, issue.id),
    })
    await logActivity(
      issueId,
      `priority ${PRIORITY_META[issue.priority]?.label ?? '—'} → ${PRIORITY_META[next]?.label ?? '—'}`,
      'updated',
    )
  }

  async function changeIssueEstimate(issueId: string, nextRaw: string) {
    const issue = issues.find((entry) => entry.id === issueId)
    if (!issue) return
    const next = nextRaw === '' ? undefined : Number(nextRaw)
    if (next === issue.estimate) return
    await z.mutate.pm_issues.update({ id: issueId, estimate: next })
    await logActivity(
      issueId,
      next ? `estimate set to ${next} pts` : 'cleared estimate',
      'updated',
    )
  }

  async function changeIssueProject(issueId: string, nextProjectId: string) {
    const issue = issues.find((entry) => entry.id === issueId)
    if (!issue) return
    const target = nextProjectId || undefined
    if (target === issue.projectId) return
    const project = nextProjectId ? projects.find((p) => p.id === nextProjectId) : null
    await z.mutate.pm_issues.update({ id: issueId, projectId: target })
    await logActivity(
      issueId,
      target ? `moved to project ${project?.name ?? '—'}` : 'removed from project',
      'updated',
    )
  }

  async function changeIssueTeam(issueId: string, nextTeamId: string) {
    const issue = issues.find((entry) => entry.id === issueId)
    if (!issue || issue.teamId === nextTeamId) return
    const fromTeam = teams.find((t) => t.id === issue.teamId)
    const toTeam = teams.find((t) => t.id === nextTeamId)
    if (!toTeam) return

    const nextNumber =
      issues
        .filter((entry) => entry.teamId === nextTeamId)
        .reduce((max, entry) => Math.max(max, entry.number), 0) + 1

    await z.mutate.pm_issues.update({
      id: issueId,
      teamId: nextTeamId,
      projectId: undefined,
      number: nextNumber,
      identifier: `${toTeam.key}-${nextNumber}`,
    })
    await logActivity(
      issueId,
      `moved from team ${fromTeam?.name ?? '—'} to ${toTeam.name}`,
      'updated',
    )
  }

  async function changeIssueStatus(issueId: string, nextStatusId: string) {
    const issue = issues.find((entry) => entry.id === issueId)
    if (!issue || issue.statusId === nextStatusId) return
    const current = statusMap.get(issue.statusId)
    const next = statusMap.get(nextStatusId)
    if (!next) return
    const patch: Record<string, unknown> = {
      statusId: nextStatusId,
      sortOrder: getNextSortOrder(issue.priority, nextStatusId, issue.id),
    }
    const now = Date.now()
    if (next.type === 'started' && !issue.startedAt) patch.startedAt = now
    if (next.type === 'completed') patch.completedAt = now
    if (next.type === 'canceled') patch.canceledAt = now
    await z.mutate.pm_issues.update({ id: issueId, ...patch })
    await logActivity(
      issueId,
      `moved from ${current?.name ?? '—'} to ${next.name}`,
      'updated',
    )
  }

  async function ensureWorkspaceFoundation(): Promise<Foundation> {
    const defaultStatusId =
      workspaceStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
      workspaceStatuses[0]?.id
    const existingTeam = teams[0]
    if (existingTeam && defaultStatusId) {
      const defaultProjectId = projects.find((project) => project.teamId === existingTeam.id)?.id
      return {
        defaultTeamId: existingTeam.id,
        defaultStatusId,
        defaultProjectId,
      }
    }

    const teamId = existingTeam?.id ?? crypto.randomUUID()
    const statusDefs = [
      { id: crypto.randomUUID(), name: 'Todo', key: 'todo', type: 'unstarted', color: '#94a3b8' },
      { id: crypto.randomUUID(), name: 'In Progress', key: 'in_progress', type: 'started', color: '#fbbf24' },
      { id: crypto.randomUUID(), name: 'Blocked', key: 'blocked', type: 'blocked', color: '#f87171' },
      { id: crypto.randomUUID(), name: 'Canceled', key: 'canceled', type: 'canceled', color: '#6b7280' },
      { id: crypto.randomUUID(), name: 'Done', key: 'done', type: 'completed', color: '#4ade80' },
    ]
    const projectId = crypto.randomUUID()

    if (!existingTeam) {
      await z.mutate.pm_teams.create({
        id: teamId,
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
      id: projectId,
      teamId,
      name: 'Core',
      slug: 'core',
      description: 'Core workspace roadmap',
    })

    return {
      defaultTeamId: teamId,
      defaultStatusId: statusDefs[0].id,
      defaultProjectId: projectId,
    }
  }

  async function createIssue() {
    if (!composerTitle.trim() || !user) return

    setCreatingIssue(true)
    try {
      const foundation = await ensureWorkspaceFoundation()
      const teamId = composerTeamId || foundation.defaultTeamId
      const team = teams.find((entry) => entry.id === teamId) ?? {
        id: foundation.defaultTeamId,
        key: 'PAC',
        name: 'Pach',
      }

      const statusId =
        composerStatusId ||
        workspaceStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ||
        defaultComposerStatusId ||
        foundation.defaultStatusId

      const nextNumber =
        issues.filter((issue) => issue.teamId === teamId).reduce((max, issue) => Math.max(max, issue.number), 0) + 1

      const issueId = crypto.randomUUID()
      await z.mutate.pm_issues.create({
        id: issueId,
        contextCompanyId: composerCompanyId || undefined,
        teamId,
        projectId: composerProjectId || undefined,
        statusId,
        assigneeId: composerAssigneeId || user.id,
        creatorId: user.id,
        identifier: `${team.key}-${nextNumber}`,
        number: nextNumber,
        title: composerTitle.trim(),
        description: composerDescription.trim() || undefined,
        priority: composerPriority,
        estimate: composerEstimate,
        sortOrder: getNextSortOrder(composerPriority, statusId),
      })

      await logActivity(issueId, `Created issue ${team.key}-${nextNumber}`)
      setComposerTitle('')
      setComposerDescription('')
      if (composerCreateMore) {
        // keep the modal open for quick successive creation
      } else {
        setComposerOpen(false)
        setSection({ kind: 'all' })
      }
    } finally {
      setCreatingIssue(false)
    }
  }

  return (
    <>
    <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-auto py-6">
              <div className="mb-4 flex items-center gap-4 px-6">
                {!(section.kind === 'team' && section.tab === 'projects') && (
                  <FilterButton
                    activeFilters={activeFilters}
                    filterConfigs={filterConfigs}
                    onFilterChange={setFilterField}
                    onClearAll={clearAllFilters}
                  />
                )}
                <div className="ml-auto font-mono text-xs uppercase tracking-label text-fg-3">
                  {section.kind === 'team' && section.tab === 'projects'
                    ? `${selectedTeamProjects.length} visible`
                    : `${filteredIssues.length} visible`}
                </div>
              </div>

              {section.kind === 'team' && section.tab === 'projects' ? (
                <TeamProjectsPanel
                  team={selectedTeam}
                  projects={selectedTeamProjects}
                  issues={issues}
                  onCreate={(teamId) => openCreateProject(teamId)}
                  onEdit={openEditProject}
                />
              ) : filteredIssues.length ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveDragId(null)}
                >
                <div className="space-y-3">
                  {groupedIssues.map((group) => {
                    const isCollapsed = collapsedPriorities.has(group.value)
                    return (
                      <section key={group.value} className="overflow-hidden border-y border-[rgba(0,255,140,0.12)] bg-[rgba(10,14,12,0.6)] backdrop-blur-sm">
                        <button
                          onClick={() => togglePriority(group.value)}
                          className="flex w-full items-center gap-3 border-b border-[rgba(0,255,140,0.1)] bg-[rgba(20,26,23,0.6)] px-5 py-3 text-left"
                        >
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-fg-4 shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-fg-4 shrink-0" />}
                          <span className={`font-mono text-xs uppercase tracking-label ${group.accent}`}>
                            {group.label}
                          </span>
                          <span className="font-mono text-xs text-fg-4">· {sumEstimates(group.issues)} pts</span>
                        </button>

                        {!isCollapsed && (
                          <div>
                            {getStatusBuckets(group.issues, statusMap).map((status) => {
                              const statusIssues = group.issues
                                .filter((issue) => getStatusBucket(statusMap.get(issue.statusId))?.key === status.key)
                                .sort(compareIssuesForBucketOrder)
                              if (!statusIssues.length) return null

                              const statusKey = `${group.value}:${status.key}`
                              const statusCollapsed = collapsedStatuses.has(statusKey)
                              return (
                                <div key={status.key} className="border-b border-[rgba(0,255,140,0.08)] last:border-b-0">
                                  <button
                                    onClick={() => toggleStatusGroup(statusKey)}
                                    className="flex w-full items-center gap-2 px-5 py-2.5 text-left font-mono text-[11px] uppercase tracking-label text-fg-3"
                                  >
                                    {statusCollapsed
                                      ? <ChevronRight className="h-3 w-3 text-fg-4 shrink-0" />
                                      : <ChevronDown className="h-3 w-3 text-fg-4 shrink-0" />}
                                    <StatusIcon statusType={status.type} />
                                    {status.name.toLowerCase()}
                                    <span className="text-fg-4">· {sumEstimates(statusIssues)} pts</span>
                                  </button>
                                  {!statusCollapsed && (
                                  <SortableContext
                                    id={statusKey}
                                    items={statusIssues.map((issue) => issue.id)}
                                    strategy={noShiftStrategy}
                                  >
                                  <div>
                                    {statusIssues.map((issue) => (
                                      <SortableIssueRow
                                        key={issue.id}
                                        issue={issue}
                                        company={issue.contextCompanyId ? companyMap.get(issue.contextCompanyId) ?? null : null}
                                        workspaceCompanyId={workspaceCompany?.id ?? null}
                                        team={teamMap.get(issue.teamId) ?? null}
                                        project={issue.projectId ? projectMap.get(issue.projectId) : null}
                                        assignee={issue.assigneeId ? userMap.get(issue.assigneeId) : null}
                                        status={statusMap.get(issue.statusId) ?? null}
                                        statusOptions={workspaceStatuses}
                                        teamProjects={projects.filter((p) => p.teamId === issue.teamId)}
                                        allTeams={teams}
                                        onStatusChange={changeIssueStatus}
                                        onProjectChange={changeIssueProject}
                                        onTeamChange={changeIssueTeam}
                                        onEstimateChange={changeIssueEstimate}
                                        onPriorityChange={changeIssuePriority}
                                      />
                                    ))}
                                  </div>
                                  </SortableContext>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activeDragIssue ? (
                    <div className="border border-[rgba(0,255,140,0.4)] bg-[rgba(20,26,23,0.95)] shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_22px_rgba(0,255,136,0.25)] backdrop-blur-sm">
                      <IssueRow
                        issue={activeDragIssue}
                        company={activeDragIssue.contextCompanyId ? companyMap.get(activeDragIssue.contextCompanyId) ?? null : null}
                        workspaceCompanyId={workspaceCompany?.id ?? null}
                        team={teamMap.get(activeDragIssue.teamId) ?? null}
                        project={activeDragIssue.projectId ? projectMap.get(activeDragIssue.projectId) : null}
                        assignee={activeDragIssue.assigneeId ? userMap.get(activeDragIssue.assigneeId) : null}
                        status={statusMap.get(activeDragIssue.statusId) ?? null}
                        statusOptions={workspaceStatuses}
                        teamProjects={projects.filter((p) => p.teamId === activeDragIssue.teamId)}
                        allTeams={teams}
                        onStatusChange={() => {}}
                        onProjectChange={() => {}}
                        onTeamChange={() => {}}
                        onEstimateChange={() => {}}
                        onPriorityChange={() => {}}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
                </DndContext>
              ) : (
                <EmptyState
                  title={issues.length ? 'no issues match this view yet' : 'start by creating your first issue'}
                  body={issues.length
                    ? 'try another team or search term, or create a new issue to seed the tracker.'
                    : 'you do not need to initialize a whole workspace first. create one issue and we can refine from there.'}
                  actionLabel="create issue"
                  onAction={() => setComposerOpen(true)}
                />
              )}
            </div>
    </div>

    {composerOpen && (
      <IssueComposerModal
        title={composerTitle}
        onTitleChange={setComposerTitle}
        description={composerDescription}
        onDescriptionChange={setComposerDescription}
        companyId={composerCompanyId}
        onCompanyChange={setComposerCompanyId}
        teamId={composerTeamId}
        onTeamChange={setComposerTeamId}
        projectId={composerProjectId}
        onProjectChange={setComposerProjectId}
        statusId={composerStatusId}
        onStatusChange={setComposerStatusId}
        assigneeId={composerAssigneeId}
        onAssigneeChange={setComposerAssigneeId}
        priority={composerPriority}
        onPriorityChange={setComposerPriority}
        estimate={composerEstimate}
        onEstimateChange={setComposerEstimate}
        createMore={composerCreateMore}
        onCreateMoreChange={setComposerCreateMore}
        companies={contextCompanies}
        teams={teams}
        projects={composerProjects}
        statuses={workspaceStatuses}
        users={users}
        team={selectedComposerTeam}
        creating={creatingIssue}
        onClose={() => setComposerOpen(false)}
        onCreate={createIssue}
      />
    )}

    {projectModal && (
      <ProjectModal
        mode={projectModal.mode}
        name={projectDraftName}
        description={projectDraftDescription}
        status={projectDraftStatus}
        onNameChange={setProjectDraftName}
        onDescriptionChange={setProjectDraftDescription}
        onStatusChange={setProjectDraftStatus}
        saving={savingProject}
        onClose={closeProjectModal}
        onSubmit={submitProjectModal}
      />
    )}
    </>
  )
}

const PROJECT_STATUS_TONE: Record<string, string> = {
  planned: 'text-pach-info',
  active: 'text-accent',
  paused: 'text-amber',
  completed: 'text-fg-3',
  canceled: 'text-fg-4',
}

function TeamProjectsPanel({
  team,
  projects,
  issues,
  onCreate,
  onEdit,
}: {
  team: Schema['tables']['pm_teams']['row'] | null
  projects: Schema['tables']['pm_projects']['row'][]
  issues: Schema['tables']['pm_issues']['row'][]
  onCreate: (teamId: string) => void
  onEdit: (project: Schema['tables']['pm_projects']['row']) => void
}) {
  if (!team) {
    return <EmptyState title="pick a team first" body="select a team in the sidebar to inspect its issues or projects." />
  }

  return (
    <section className="overflow-hidden border-y border-[rgba(0,255,140,0.12)] bg-[rgba(10,14,12,0.6)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.1)] bg-[rgba(20,26,23,0.6)] px-5 py-3">
        <div className="font-mono text-xs uppercase tracking-label text-fg-3">
          {team.name.toLowerCase()} · projects <span className="text-fg-4">· {projects.length}</span>
        </div>
        <button
          onClick={() => onCreate(team.id)}
          className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
        >
          <Plus className="h-3 w-3" />
          new project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="px-5 py-10 text-center font-mono text-xs text-fg-4">// no projects in this team yet</div>
      ) : (
        <div>
          <div className="flex items-center gap-4 border-b border-[rgba(0,255,140,0.08)] px-5 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <div className="min-w-0 flex-1">name</div>
            <div className="w-[110px] shrink-0">status</div>
            <div className="w-[80px] shrink-0 text-right">issues</div>
            <div className="w-[80px] shrink-0 text-right">pts</div>
            <div className="w-[88px] shrink-0 text-right">updated</div>
          </div>
          {projects.map((project) => {
            const projectIssues = issues.filter((issue) => issue.projectId === project.id)
            const points = projectIssues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0)
            const tone = PROJECT_STATUS_TONE[project.status] ?? 'text-fg-3'
            return (
              <button
                key={project.id}
                onClick={() => onEdit(project)}
                className="flex w-full items-center gap-4 border-b border-[rgba(0,255,140,0.06)] px-5 py-2.5 text-left transition hover:bg-[rgba(0,255,136,0.04)] last:border-b-0"
              >
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                <div className="min-w-0 flex-1 truncate font-mono text-sm lowercase text-fg-1">{project.name}</div>
                <div className={`w-[110px] shrink-0 font-mono text-[10px] uppercase tracking-label ${tone}`}>
                  {project.status}
                </div>
                <div className="w-[80px] shrink-0 text-right font-mono text-xs text-fg-3 tabular-nums">{projectIssues.length}</div>
                <div className="w-[80px] shrink-0 text-right font-mono text-xs text-fg-3 tabular-nums">{points} pts</div>
                <div className="w-[88px] shrink-0 text-right font-mono text-[10px] uppercase tracking-label text-fg-4">
                  {formatShortDate(project.updatedAt)}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center border border-dashed border-[rgba(0,255,140,0.15)] bg-pit-2 px-6">
      <div className="max-w-lg text-center">
        <div className="font-mono text-xl lowercase text-fg-1">{title}</div>
        <div className="mt-3 text-sm leading-6 text-fg-3">{body}</div>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="mt-5 inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function IssueComposerModal({
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
  companies,
  teams,
  projects,
  statuses,
  users,
  team,
  creating,
  onClose,
  onCreate,
}: {
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
  companies: Schema['tables']['companies']['row'][]
  teams: Schema['tables']['pm_teams']['row'][]
  projects: Schema['tables']['pm_projects']['row'][]
  statuses: Schema['tables']['pm_statuses']['row'][]
  users: Schema['tables']['users']['row'][]
  team: Schema['tables']['pm_teams']['row'] | null
  creating: boolean
  onClose: () => void
  onCreate: () => void
}) {
  const currentStatus = statuses.find((s) => s.id === statusId)
  const currentProject = projects.find((p) => p.id === projectId)
  const currentCompany = companies.find((c) => c.id === companyId)
  const currentAssignee = users.find((u) => u.id === assigneeId)

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      if (title.trim() && !creating) onCreate()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(0,0,0,0.7)] px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* breadcrumb header */}
        <div className="flex items-center justify-between border-b border-[rgba(0,255,140,0.12)] px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <PachSelect
              variant="button"
              value={teamId}
              onChange={onTeamChange}
              options={teams.map((t) => ({ value: t.id, label: t.name.toLowerCase() }))}
              trigger={
                <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.25)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
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
            className="font-mono text-xs uppercase tracking-label text-fg-4 hover:text-fg-1 transition"
            title="close"
          >
            [esc]
          </button>
        </div>

        {/* title + description */}
        <div className="px-5 pt-4">
          <input
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="issue title"
            className="w-full bg-transparent font-mono text-lg text-fg-1 outline-none placeholder:text-fg-4 px-0 py-1"
          />
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="add description…"
            rows={4}
            className="w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4 px-0 py-2"
          />
        </div>

        {/* pill row */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <PachSelect
            variant="button"
            value={statusId}
            onChange={onStatusChange}
            options={statuses.map((s) => ({
              value: s.id,
              label: s.name.toLowerCase(),
              icon: <StatusIcon statusType={s.type} />,
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
            options={[1, 2, 3, 4, 0].map((p) => ({
              value: String(p),
              label: PRIORITY_META[p].label,
              icon: <PriorityIcon priority={p} />,
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
            options={users.map((u) => ({ value: u.id, label: (u.name ?? u.email).toLowerCase() }))}
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
              ...projects.map((p) => ({
                value: p.id,
                label: p.name.toLowerCase(),
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
            options={ESTIMATES.map((n) => ({ value: String(n), label: `${n} pts` }))}
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
              { value: '', label: 'no company' },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
            trigger={
              <ComposerPill
                icon={<Building2 className="h-3 w-3" />}
                label={currentCompany?.name?.toLowerCase() ?? 'company'}
              />
            }
            triggerTitle="company context"
            triggerClassName="transition"
            popupWidth="220px"
          />
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-5 py-3">
          <button
            onClick={onClose}
            className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
          >
            [cancel]
          </button>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onCreateMoreChange(!createMore)}
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3 hover:text-fg-1 transition"
              title="keep modal open after creating"
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center border transition ${
                  createMore
                    ? 'border-accent bg-[rgba(0,255,136,0.2)]'
                    : 'border-[rgba(0,255,140,0.25)]'
                }`}
              >
                {createMore ? <span className="text-accent text-[10px] leading-none">×</span> : null}
              </span>
              create more
            </button>
            <button
              onClick={onCreate}
              disabled={!title.trim() || creating}
              className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? 'creating…' : 'create issue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComposerPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.2)] bg-pit-3 px-2.5 py-1 font-mono text-[11px] lowercase text-fg-2 hover:border-[rgba(0,255,140,0.4)] hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 transition">
      <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
      <span className="truncate max-w-[160px]">{label}</span>
    </span>
  )
}

const PROJECT_STATUS_OPTIONS = ['planned', 'active', 'paused', 'completed', 'canceled']

function ProjectModal({
  mode,
  name,
  description,
  status,
  onNameChange,
  onDescriptionChange,
  onStatusChange,
  saving,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  name: string
  description: string
  status: string
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onStatusChange: (v: string) => void
  saving: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.7)] px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[rgba(0,255,140,0.12)] px-6 py-5">
          <div className="text-[10px] uppercase tracking-label text-fg-3">
            {mode === 'create' ? '◊ projects · create' : '◊ projects · edit'}
          </div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">
            {mode === 'create' ? 'new project' : 'edit project'}
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">name</div>
            <input
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="$ core platform"
              className="w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">description</div>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="$ what is this project about?"
              rows={3}
              className="w-full resize-none bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">status</div>
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value)}
              className="w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs"
            >
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-6 py-4">
          <button
            onClick={onClose}
            className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
          >
            [cancel]
          </button>
          <button
            onClick={onSubmit}
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
          >
            <Plus className="h-3.5 w-3.5" />
            {saving ? (mode === 'create' ? 'creating…' : 'saving…') : (mode === 'create' ? 'create project' : 'save project')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

const ESTIMATE_VALUES = [1, 2, 3, 4, 8, 16]

function SortableIssueRow(props: React.ComponentProps<typeof IssueRow>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isOver,
    index,
    activeIndex,
  } = useSortable({ id: props.issue.id })

  // determine if this row should show a drop indicator and where
  let indicator: 'above' | 'below' | null = null
  if (isOver && activeIndex !== index) {
    if (activeIndex < 0) {
      // cross-container drop — show above the hovered row
      indicator = 'above'
    } else {
      indicator = activeIndex > index ? 'above' : 'below'
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="relative"
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      {indicator === 'above' && <DropIndicator position="top" />}
      <IssueRow {...props} />
      {indicator === 'below' && <DropIndicator position="bottom" />}
    </div>
  )
}

function DropIndicator({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-0 right-0 z-30 h-[1.5px] bg-[rgba(0,255,136,0.55)] shadow-[0_0_5px_rgba(0,255,136,0.3)] ${
        position === 'top' ? '-top-px' : '-bottom-px'
      }`}
    />
  )
}

function IssueRow({
  issue,
  company,
  workspaceCompanyId,
  team,
  project,
  assignee,
  status,
  statusOptions,
  teamProjects,
  allTeams,
  onStatusChange,
  onProjectChange,
  onTeamChange,
  onEstimateChange,
  onPriorityChange,
}: {
  issue: Schema['tables']['pm_issues']['row']
  company: Schema['tables']['companies']['row'] | null
  workspaceCompanyId: string | null
  team: Schema['tables']['pm_teams']['row'] | null
  project: Schema['tables']['pm_projects']['row'] | null | undefined
  assignee: Schema['tables']['users']['row'] | null | undefined
  status: Schema['tables']['pm_statuses']['row'] | null
  statusOptions: Schema['tables']['pm_statuses']['row'][]
  teamProjects: Schema['tables']['pm_projects']['row'][]
  allTeams: Schema['tables']['pm_teams']['row'][]
  onStatusChange: (issueId: string, nextStatusId: string) => void | Promise<void>
  onProjectChange: (issueId: string, nextProjectId: string) => void | Promise<void>
  onTeamChange: (issueId: string, nextTeamId: string) => void | Promise<void>
  onEstimateChange: (issueId: string, nextEstimate: string) => void | Promise<void>
  onPriorityChange: (issueId: string, nextPriority: string) => void | Promise<void>
}) {
  const navigate = useNavigate()
  const showCompany = company && company.id !== workspaceCompanyId

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/issues/${issue.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          navigate(`/issues/${issue.id}`)
        }
      }}
      className="flex items-center gap-2 px-4 py-2 border-t border-[rgba(0,255,140,0.06)] transition hover:bg-[rgba(0,255,136,0.04)] cursor-pointer focus:outline-none focus-visible:bg-[rgba(0,255,136,0.06)]"
    >
      <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
        <PachSelect
          variant="button"
          value={issue.statusId}
          onChange={(next) => onStatusChange(issue.id, next)}
          options={statusOptions.map((s) => ({
            value: s.id,
            label: s.name.toLowerCase(),
            icon: <StatusIcon statusType={s.type} />,
          }))}
          trigger={<StatusIcon statusType={status?.type ?? 'backlog'} />}
          triggerTitle={status ? `status · ${status.name.toLowerCase()}` : 'change status'}
          triggerClassName="flex h-6 w-6 items-center justify-center border border-transparent hover:border-[rgba(0,255,140,0.25)] hover:bg-[rgba(0,255,136,0.06)] transition"
          popupWidth="200px"
        />
      </div>
      <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
        <PachSelect
          variant="button"
          value={String(issue.priority)}
          onChange={(next) => onPriorityChange(issue.id, next)}
          options={[1, 2, 3, 4, 0].map((p) => ({
            value: String(p),
            label: PRIORITY_META[p].label,
            icon: <PriorityIcon priority={p} />,
          }))}
          trigger={<PriorityIcon priority={issue.priority} />}
          triggerTitle={`priority · ${PRIORITY_META[issue.priority]?.label ?? '—'}`}
          triggerClassName="flex h-6 w-6 items-center justify-center border border-transparent hover:border-[rgba(0,255,140,0.25)] hover:bg-[rgba(0,255,136,0.06)] transition"
          popupWidth="180px"
        />
      </div>
      <div className="shrink-0 font-mono text-xs text-accent/80 tabular-nums">{issue.identifier}</div>
      {showCompany && (
        <span className="hidden md:inline-flex shrink-0 h-5 items-center gap-1 border border-[rgba(0,255,140,0.15)] bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
          <Building2 className="h-3 w-3" />
          {company.name}
        </span>
      )}
      <div className="min-w-0 flex-1 truncate text-sm text-fg-1">{issue.title}</div>
      <div className="hidden md:block shrink-0" onClick={(event) => event.stopPropagation()}>
        <PachSelect
          variant="button"
          value={issue.projectId ?? ''}
          onChange={(next) => onProjectChange(issue.id, next)}
          options={[
            { value: '', label: 'no project' },
            ...teamProjects.map((p) => ({
              value: p.id,
              label: p.name.toLowerCase(),
              icon: <FolderKanban className="h-3 w-3" />,
            })),
          ]}
          trigger={
            <span className="inline-flex h-5 items-center gap-1 border border-[rgba(0,255,140,0.15)] bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
              <FolderKanban className="h-3 w-3" />
              {project?.name ?? 'no project'}
            </span>
          }
          triggerTitle="change project"
          triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
          popupWidth="220px"
        />
      </div>
      <div className="hidden md:block shrink-0" onClick={(event) => event.stopPropagation()}>
        <PachSelect
          variant="button"
          value={issue.teamId}
          onChange={(next) => onTeamChange(issue.id, next)}
          options={allTeams.map((t) => ({ value: t.id, label: t.name.toLowerCase() }))}
          trigger={
            <span className="inline-flex shrink-0 h-5 items-center border border-[rgba(0,255,140,0.15)] bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
              {team?.name ?? '—'}
            </span>
          }
          triggerTitle="change team"
          triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
          popupWidth="200px"
        />
      </div>
      <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
        <PachSelect
          variant="button"
          value={issue.estimate != null ? String(issue.estimate) : ''}
          onChange={(next) => onEstimateChange(issue.id, next)}
          options={[
            { value: '', label: 'no estimate' },
            ...ESTIMATE_VALUES.map((n) => ({ value: String(n), label: `${n} pts` })),
          ]}
          trigger={
            <span className="font-mono text-xs text-fg-3 tabular-nums px-1.5 py-0.5 border border-transparent hover:border-[rgba(0,255,140,0.2)] hover:bg-[rgba(0,255,136,0.04)] transition">
              {issue.estimate != null ? `${issue.estimate} pts` : '— pts'}
            </span>
          }
          triggerTitle="change estimate"
          triggerClassName="transition"
          popupWidth="160px"
          align="right"
        />
      </div>
      <div className="shrink-0 font-mono text-[10px] uppercase tracking-label text-fg-4">{formatShortDate(issue.updatedAt)}</div>
    </div>
  )
}

function getStatusBuckets(
  issues: Schema['tables']['pm_issues']['row'][],
  statusMap: Map<string, Schema['tables']['pm_statuses']['row']>,
) {
  const uniqueStatuses = new Map<string, { key: string; name: string; type: string; position: number }>()
  for (const issue of issues) {
    const status = statusMap.get(issue.statusId)
    if (!status) continue
    const bucket = getStatusBucket(status)
    if (!bucket) continue
    if (!uniqueStatuses.has(bucket.key)) uniqueStatuses.set(bucket.key, bucket)
  }

  return Array.from(uniqueStatuses.values()).sort((a, b) => {
    const rankDiff = statusRank(a.type) - statusRank(b.type)
    if (rankDiff !== 0) return rankDiff
    return a.position - b.position
  })
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
  const rankDiff = a.sortOrder - b.sortOrder
  if (rankDiff !== 0) return rankDiff
  const updatedDiff = b.updatedAt - a.updatedAt
  if (updatedDiff !== 0) return updatedDiff
  return a.identifier.localeCompare(b.identifier)
}

function getStatusBucket(status?: Schema['tables']['pm_statuses']['row'] | null) {
  if (!status) return null
  if (status.type === 'backlog') {
    return { key: 'backlog', name: 'backlog', type: 'backlog', position: 0 }
  }
  if (status.type === 'unstarted') {
    return { key: 'todo', name: 'todo', type: 'unstarted', position: 1 }
  }
  if (status.type === 'started') {
    return { key: 'in_progress', name: 'in progress', type: 'started', position: 2 }
  }
  if (status.type === 'blocked') {
    return { key: 'blocked', name: 'blocked', type: 'blocked', position: 3 }
  }
  if (status.type === 'completed') {
    return { key: 'done', name: 'done', type: 'completed', position: 4 }
  }
  if (status.type === 'canceled') {
    return { key: 'canceled', name: 'canceled', type: 'canceled', position: 5 }
  }
  return {
    key: status.key,
    name: status.name.toLowerCase(),
    type: status.type,
    position: status.position,
  }
}

function statusRank(statusType: string) {
  if (statusType === 'backlog') return 0
  if (statusType === 'unstarted') return 1
  if (statusType === 'started') return 2
  if (statusType === 'blocked') return 3
  if (statusType === 'completed') return 4
  if (statusType === 'canceled') return 5
  return 99
}

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function sumEstimates(items: Schema['tables']['pm_issues']['row'][]) {
  return items.reduce((total, issue) => total + (issue.estimate ?? 0), 0)
}
