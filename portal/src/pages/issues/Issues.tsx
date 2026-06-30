import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BookmarkPlus, Bot, Building2, CheckCircle2, Check, ChevronDown, ChevronRight, Circle, FolderKanban, GripVertical, Plus, Save, Settings2, Trash2 } from 'lucide-react'
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
import { PachSelect } from '../../components/PachSelect'
import { StatusIcon } from './StatusIcon'
import { PRIORITY_META, PriorityIcon } from './PriorityIcon'
import { LabelMenu } from './LabelMenu'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from './IssueFilters'
import { closePopupFromOutsideClick } from './popupEvents'
import { useQuery, useZero } from '@rocicorp/zero/react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'
import { useTrackerContext } from './IssuesLayout'
import { IconTooltip } from '../../components/IconTooltip'
import { DeleteViewModal } from '../../components/DeleteViewModal'

const PRIORITY_GROUPS = [
  { value: 1, label: 'urgent', accent: 'text-amber' },
  { value: 2, label: 'high', accent: 'text-fg-2' },
  { value: 3, label: 'medium', accent: 'text-fg-2' },
  { value: 4, label: 'low', accent: 'text-fg-2' },
  { value: 0, label: 'unprioritized', accent: 'text-fg-3' },
] as const

const ESTIMATES = [1, 2, 4, 8, 16]
const ACTIVE_AGENT_RUN_STATUSES = new Set<string>(['queued', 'reserved', 'bootstrapping', 'running', 'needs_human', 'pr_ready'])

function isActiveAgentRun(run: Schema['tables']['agent_runs']['row']) {
  return Boolean(run.issueId && ACTIVE_AGENT_RUN_STATUSES.has(run.status))
}

const STATUS_BUCKETS = [
  { key: 'backlog', label: 'backlog', type: 'backlog' },
  { key: 'todo', label: 'todo', type: 'unstarted' },
  { key: 'blocked', label: 'blocked', type: 'blocked' },
  { key: 'in_review', label: 'in review', type: 'review' },
  { key: 'in_progress', label: 'in progress', type: 'started' },
  { key: 'done', label: 'done', type: 'completed' },
  { key: 'canceled', label: 'canceled', type: 'canceled' },
] as const

type SortField =
  | 'manual'
  | 'priority'
  | 'status'
  | 'identifier'
  | 'title'
  | 'estimate'
  | 'updated'
  | 'created'
  | 'due'
type SortDirection = 'asc' | 'desc'
export type SortConfig = { field: SortField; direction: SortDirection }

const SORT_FIELDS: Array<{ value: SortField; label: string }> = [
  { value: 'manual', label: 'manual order' },
  { value: 'priority', label: 'priority' },
  { value: 'status', label: 'status' },
  { value: 'identifier', label: 'identifier' },
  { value: 'title', label: 'title' },
  { value: 'estimate', label: 'estimate' },
  { value: 'updated', label: 'updated' },
  { value: 'created', label: 'created' },
  { value: 'due', label: 'due date' },
]

export type RowField =
  | 'status'
  | 'priority'
  | 'identifier'
  | 'company'
  | 'project'
  | 'team'
  | 'labels'
  | 'assignee'
  | 'estimate'
  | 'updated'

const ROW_FIELDS: Array<{ value: RowField; label: string }> = [
  { value: 'status', label: 'status' },
  { value: 'priority', label: 'priority' },
  { value: 'identifier', label: 'identifier' },
  { value: 'company', label: 'organization' },
  { value: 'project', label: 'project' },
  { value: 'team', label: 'team' },
  { value: 'labels', label: 'labels' },
  { value: 'assignee', label: 'assignee' },
  { value: 'estimate', label: 'estimate' },
  { value: 'updated', label: 'updated' },
]

const DEFAULT_SORT: SortConfig = { field: 'manual', direction: 'asc' }
const SORT_ORDER_BASE = 1000
const SORT_ORDER_STEP = 1024
const DEFAULT_VISIBLE_FIELDS: RowField[] = [
  'status',
  'priority',
  'identifier',
  'company',
  'project',
  'team',
  'labels',
  'assignee',
  'estimate',
  'updated',
]

type Foundation = {
  defaultTeamId: string
  defaultStatusId: string
  defaultProjectId?: string
}

type RowShortcutRequest = {
  issueId: string
  control: 'status' | 'labels'
  nonce: number
}

type IssueViewState = {
  filters: ActiveFilters
  collapsedPriorities: number[]
  collapsedStatuses: string[]
  sort: SortConfig
  visibleFields: RowField[]
}

export default function Issues() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const { section, setSection, composerRequestId } = useTrackerContext()

  const [companies] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [labels] = useQuery(z.query.pm_labels.orderBy('name', 'asc'))
  const [issueLabels] = useQuery(z.query.pm_issue_labels)
  const [agentRuns] = useQuery(z.query.agent_runs.orderBy('createdAt', 'desc'))
  const [savedViews] = useQuery(z.query.pm_saved_views.orderBy('position', 'asc'))
  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const canAccessUnscoped = user?.canAccessUnscoped ?? false
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : canAccessUnscoped
  const scopedCompanies = companies.filter((company) => canAccessOrganization(company.id))
  const scopedIssues = issues.filter((issue) => canAccessOrganization(issue.contextCompanyId))
  const scopedLabels = labels.filter((label) => canAccessOrganization(label.companyId))
  const scopedSavedViews = savedViews.filter((view) => view.ownerId === user?.id || canAccessOrganization(view.companyId))

  const storageKey = user ? `pach:issues:view:${user.id}` : null
  const scrollStorageKey = user ? `pach:issues:scroll:${user.id}` : null
  const initialStoredView = readStoredView(storageKey)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollRestoredRef = useRef(false)
  const scrollSaveTimerRef = useRef<number | null>(null)

  const [sortConfig, setSortConfig] = useState<SortConfig>(() => initialStoredView.sort)
  const [visibleFields, setVisibleFields] = useState<Set<RowField>>(
    () => new Set(initialStoredView.visibleFields),
  )
  const isManualSort = sortConfig.field === 'manual'

  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => initialStoredView.filters)
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
  const [collapsedPriorities, setCollapsedPriorities] = useState<Set<number>>(() => new Set(initialStoredView.collapsedPriorities))
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(() => new Set(initialStoredView.collapsedStatuses))
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null)
  const [rowShortcutRequest, setRowShortcutRequest] = useState<RowShortcutRequest | null>(null)
  const [projectModal, setProjectModal] = useState<
    | { mode: 'create'; teamId: string }
    | { mode: 'edit'; projectId: string }
    | null
  >(null)
  const [projectDraftName, setProjectDraftName] = useState('')
  const [projectDraftDescription, setProjectDraftDescription] = useState('')
  const [projectDraftStatus, setProjectDraftStatus] = useState('active')
  const [savingProject, setSavingProject] = useState(false)
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')
  const [savingView, setSavingView] = useState(false)
  const [updatingView, setUpdatingView] = useState(false)
  const [deleteViewModalOpen, setDeleteViewModalOpen] = useState(false)
  const [deletingView, setDeletingView] = useState(false)

  const activeSavedView =
    section.kind === 'view'
      ? scopedSavedViews.find((view) => view.id === section.viewId && view.ownerId === user?.id) ?? null
      : null

  function applyIssueViewState(viewState: IssueViewState) {
    setActiveFilters(viewState.filters)
    setCollapsedPriorities(new Set(viewState.collapsedPriorities))
    setCollapsedStatuses(new Set(viewState.collapsedStatuses))
    setSortConfig(viewState.sort)
    setVisibleFields(new Set(viewState.visibleFields))
  }

  function getCurrentIssueViewState(): IssueViewState {
    return {
      filters: copyActiveFilters(activeFilters),
      collapsedPriorities: [...collapsedPriorities],
      collapsedStatuses: [...collapsedStatuses],
      sort: sortConfig,
      visibleFields: [...visibleFields],
    }
  }

  const activeSavedViewIsDirty = activeSavedView
    ? !issueViewStatesEqual(getCurrentIssueViewState(), readSavedIssueView(activeSavedView))
    : false

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

  const companyMap = new Map(scopedCompanies.map((company) => [company.id, company]))
  const teamMap = new Map(teams.map((team) => [team.id, team]))
  const statusMap = new Map(statuses.map((status) => [status.id, status]))
  const projectMap = new Map(projects.map((project) => [project.id, project]))
  const authUserRow: Schema['tables']['users']['row'] | null = user
    ? { id: user.id, email: user.email, name: user.name ?? undefined, createdAt: 0, updatedAt: 0 }
    : null
  const assignableUsers =
    authUserRow && !users.some((entry) => entry.id === authUserRow.id)
      ? [...users, authUserRow]
      : users
  const userMap = new Map(assignableUsers.map((entry) => [entry.id, entry]))
  const labelMap = new Map(scopedLabels.map((entry) => [entry.id, entry]))
  const activeAgentRunIssueIds = new Set(
    agentRuns
      .filter(isActiveAgentRun)
      .map((run) => run.issueId),
  )
  const labelsByIssue = new Map<string, Schema['tables']['pm_labels']['row'][]>()
  for (const link of issueLabels) {
    const label = labelMap.get(link.labelId)
    if (!label) continue
    const list = labelsByIssue.get(link.issueId) ?? []
    list.push(label)
    labelsByIssue.set(link.issueId, list)
  }
  const workspaceStatuses = getWorkspaceStatuses(statuses)

  const contextCompanies = scopedCompanies
  const selectedTeam = section.kind === 'team' ? teams.find((team) => team.id === section.teamId) ?? null : null
  const selectedTeamIssues = selectedTeam ? scopedIssues.filter((issue) => issue.teamId === selectedTeam.id) : []
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
    if (!composerCompanyId && !canAccessUnscoped && contextCompanies.length === 1) {
      setComposerCompanyId(contextCompanies[0].id)
      return
    }
    // organization context is optional only for users who can access unscoped content.
    if (!composerCompanyId) return
    if (contextCompanies.some((company) => company.id === composerCompanyId)) return
    setComposerCompanyId('')
  }, [canAccessUnscoped, composerCompanyId, contextCompanies])

  useEffect(() => {
    if (!composerAssigneeId && user?.id) {
      setComposerAssigneeId(user.id)
      return
    }
    if (composerAssigneeId && !assignableUsers.some((u) => u.id === composerAssigneeId)) {
      setComposerAssigneeId(user?.id ?? '')
    }
  }, [assignableUsers, composerAssigneeId, user])

  function openSaveViewModal() {
    if (!user) return
    setSaveViewName('')
    setSaveViewModalOpen(true)
  }

  function closeSaveViewModal() {
    setSaveViewModalOpen(false)
    setSaveViewName('')
    setSavingView(false)
  }

  function closeDeleteViewModal() {
    setDeleteViewModalOpen(false)
    setDeletingView(false)
  }

  async function submitSavedView() {
    if (!user) return
    const name = saveViewName.trim()
    if (!name) return

    setSavingView(true)
    try {
      const id = crypto.randomUUID()
      const state = getCurrentIssueViewState()
      const existingSlugs = new Set(
        scopedSavedViews
          .filter((view) => view.ownerId === user.id && view.scope === 'personal')
          .map((view) => view.slug),
      )
      await z.mutate.pm_saved_views.create({
        id,
        ownerId: user.id,
        name,
        slug: makeUniqueSlug(slugifySavedViewName(name), existingSlugs),
        scope: 'personal',
        filters: state.filters,
        display: getIssueViewDisplay(state),
        position: scopedSavedViews.filter((view) => view.ownerId === user.id && view.scope === 'personal').length,
      })
      closeSaveViewModal()
      setSection({ kind: 'view', viewId: id })
    } finally {
      setSavingView(false)
    }
  }

  async function updateActiveSavedView() {
    if (!activeSavedView || !activeSavedViewIsDirty) return

    setUpdatingView(true)
    try {
      const state = getCurrentIssueViewState()
      await z.mutate.pm_saved_views.update({
        id: activeSavedView.id,
        filters: state.filters,
        display: getIssueViewDisplay(state),
      })
    } finally {
      setUpdatingView(false)
    }
  }

  async function deleteActiveSavedView() {
    if (!activeSavedView || deletingView) return

    setDeletingView(true)
    try {
      await z.mutate.pm_saved_views.delete({ id: activeSavedView.id })
      closeDeleteViewModal()
      setSection({ kind: 'all' })
    } finally {
      setDeletingView(false)
    }
  }

  const appliedSavedViewRef = useRef<string | null>(null)
  const wasViewingSavedViewRef = useRef(section.kind === 'view')
  const skipNextLocalViewPersistRef = useRef(false)
  useEffect(() => {
    if (section.kind !== 'view') {
      appliedSavedViewRef.current = null
      if (wasViewingSavedViewRef.current) {
        wasViewingSavedViewRef.current = false
        skipNextLocalViewPersistRef.current = true
        applyIssueViewState(readStoredView(storageKey))
      }
      return
    }

    wasViewingSavedViewRef.current = true
    if (!activeSavedView) return

    const revisionKey = `${activeSavedView.id}:${activeSavedView.updatedAt}`
    if (appliedSavedViewRef.current === revisionKey) return
    appliedSavedViewRef.current = revisionKey
    applyIssueViewState(readSavedIssueView(activeSavedView))
  }, [section, activeSavedView, storageKey])

  // save to localStorage on change — initial state is already hydrated via the
  // useState lazy initializers above (see `readStoredView`), so no separate
  // hydrate effect is needed and there's no risk of clobbering with defaults.
  useEffect(() => {
    if (!storageKey) return
    if (section.kind === 'view') return
    if (skipNextLocalViewPersistRef.current) {
      skipNextLocalViewPersistRef.current = false
      return
    }
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          filters: activeFilters,
          collapsedPriorities: [...collapsedPriorities],
          collapsedStatuses: [...collapsedStatuses],
          sort: sortConfig,
          visibleFields: [...visibleFields],
        }),
      )
    } catch {
      // ignore quota / serialization errors
    }
  }, [storageKey, section.kind, activeFilters, collapsedPriorities, collapsedStatuses, sortConfig, visibleFields])

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
    function handleKeyDown(event: KeyboardEvent) {
      if (!hoveredIssueId) return
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return

      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      const key = event.key.toLowerCase()
      if (key !== 's' && key !== 'l') return

      event.preventDefault()
      setRowShortcutRequest({
        issueId: hoveredIssueId,
        control: key === 's' ? 'status' : 'labels',
        nonce: Date.now(),
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredIssueId])

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

  useEffect(() => {
    if (!saveViewModalOpen) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeSaveViewModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [saveViewModalOpen])

  const filteredIssues = scopedIssues.filter((issue) => {
    const sectionTeamId =
      section.kind === 'team'
        ? section.teamId
        : section.kind === 'view'
          ? activeSavedView?.teamId
          : undefined
    if (sectionTeamId && issue.teamId !== sectionTeamId) return false

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
        case 'agent':
          if (values.includes('assigned') && !activeAgentRunIssueIds.has(issue.id)) return false
          if (values.includes('unassigned') && activeAgentRunIssueIds.has(issue.id)) return false
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
        ...assignableUsers.map((u) => ({ value: u.id, label: u.name ?? u.email })),
      ],
    },
    {
      field: 'company',
      label: 'organization',
      icon: Building2,
      options: [
        ...(canAccessUnscoped ? [{ value: '__none', label: 'no organization' }] : []),
        ...contextCompanies.map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    {
      field: 'agent',
      label: 'agent run',
      icon: Bot,
      options: [
        {
          value: 'assigned',
          label: 'active agent run',
          icon: <AgentRunDot />,
        },
        {
          value: 'unassigned',
          label: 'no active agent run',
          icon: <span className="h-2 w-2 rounded-full border border-edge/25" />,
        },
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

  const openCount = scopedIssues.filter((issue) => {
    const status = statusMap.get(issue.statusId)
    return status?.type !== 'completed' && status?.type !== 'canceled'
  }).length

  const blockedCount = scopedIssues.filter((issue) => statusMap.get(issue.statusId)?.type === 'blocked').length

  // restore scroll once the list has rendered (issues query loaded)
  useEffect(() => {
    if (scrollRestoredRef.current) return
    if (!scrollStorageKey) return
    if (scopedIssues.length === 0) return
    const el = scrollContainerRef.current
    if (!el) return

    let target = 0
    try {
      const raw = localStorage.getItem(scrollStorageKey)
      const parsed = raw ? Number(raw) : 0
      if (Number.isFinite(parsed) && parsed > 0) target = parsed
    } catch {
      // ignore
    }

    scrollRestoredRef.current = true
    if (target > 0) {
      // wait one frame so the rows are laid out and scrollHeight is final
      requestAnimationFrame(() => {
        el.scrollTop = target
      })
    }
  }, [scrollStorageKey, scopedIssues.length, groupedIssues.length])

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!scrollStorageKey || !scrollRestoredRef.current) return
    const top = event.currentTarget.scrollTop
    if (scrollSaveTimerRef.current != null) window.clearTimeout(scrollSaveTimerRef.current)
    scrollSaveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(scrollStorageKey, String(Math.round(top)))
      } catch {
        // ignore quota errors
      }
    }, 150)
  }

  function getNextSortOrder(priority: number, statusId: string, excludeIssueId?: string) {
    const bucket = scopedIssues
      .filter((issue) => issue.priority === priority && issue.statusId === statusId && issue.id !== excludeIssueId)
      .sort(compareIssuesForBucketOrder)
    const maxSortOrder = bucket[bucket.length - 1]?.sortOrder ?? 0
    return maxSortOrder + SORT_ORDER_STEP
  }

  function getTopSortOrder(priority: number, statusId: string, excludeIssueId?: string) {
    const bucket = scopedIssues
      .filter((issue) => issue.priority === priority && issue.statusId === statusId && issue.id !== excludeIssueId)
      .sort(compareIssuesForBucketOrder)
    const minSortOrder = bucket[0]?.sortOrder
    return minSortOrder == null ? SORT_ORDER_BASE : minSortOrder - SORT_ORDER_STEP
  }

  async function logActivity(issueId: string, summary: string, type = 'created') {
    const issue = scopedIssues.find((entry) => entry.id === issueId)
    const organizationId =
      issue?.contextCompanyId ??
      companies.find((entry) => entry.project === 'pach')?.id ??
      scopedCompanies[0]?.id
    if (!issue || !organizationId) return

    await z.mutate.activity_events.create({
      id: crypto.randomUUID(),
      organizationId,
      eventType: type,
      activityKind: issueActivityKind(type),
      subjectType: 'pm_issue',
      subjectId: issue.id,
      subjectLabel: issue.identifier,
      actorType: user ? 'user' : 'system',
      actorId: user?.id,
      actorName: user?.name ?? user?.email,
      source: 'pach_app',
      severity: 'info',
      summary,
      details: {},
      metadata: {},
    })
  }

  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const activeDragIssue = activeDragId ? scopedIssues.find((entry) => entry.id === activeDragId) ?? null : null

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
    const activeIssue = scopedIssues.find((entry) => entry.id === active.id)
    if (!activeIssue) return

    // figure out destination bucket. In some builds dnd-kit reports the row
    // under the cursor without sortable container metadata, so infer from that
    // row instead of requiring containerId to be present.
    const overContainerRaw = (over.data.current?.sortable as { containerId?: string } | undefined)?.containerId
    const overContainer = overContainerRaw ?? (typeof over.id === 'string' && over.id.includes(':') ? over.id : null)
    const overIssue = scopedIssues.find((entry) => entry.id === over.id)

    let targetPriority: number
    let statusKey: string | undefined
    if (overContainer) {
      const [priorityStr, parsedStatusKey] = overContainer.split(':')
      targetPriority = Number(priorityStr)
      statusKey = parsedStatusKey
    } else if (overIssue) {
      targetPriority = overIssue.priority
      statusKey = getStatusBucket(statusMap.get(overIssue.statusId))?.key
    } else {
      return
    }
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
    const fullList = scopedIssues
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

    const orderChanged =
      oldIndex < 0 ||
      fullList.length !== reordered.length ||
      fullList.some((entry, index) => entry.id !== reordered[index]?.id)
    const targetChanged = activeIssue.priority !== targetPriority || activeIssue.statusId !== targetStatus.id
    if (!orderChanged && !targetChanged) return

    const sortOrderUpdates = getSortOrderUpdatesForReorderedBucket(reordered, activeIssue.id)
    const activeSortOrder = sortOrderUpdates.find((entry) => entry.id === activeIssue.id)?.sortOrder ?? activeIssue.sortOrder
    const patch: {
      id: string
      sortOrder: number
      priority?: number
      statusId?: string
      startedAt?: number
      completedAt?: number
      canceledAt?: number
    } = { id: activeIssue.id, sortOrder: activeSortOrder }
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
      if ((targetStatus.type === 'started' || targetStatus.type === 'review') && !activeIssue.startedAt) patch.startedAt = now
      if (targetStatus.type === 'completed') patch.completedAt = now
      if (targetStatus.type === 'canceled') patch.canceledAt = now
      const fromStatus = statusMap.get(activeIssue.statusId)
      summaryParts.push(`moved from ${fromStatus?.name ?? '—'} to ${targetStatus.name}`)
    }

    const passiveSortOrderUpdates = sortOrderUpdates
      .filter((entry) => entry.id !== activeIssue.id)
      .filter((entry) => scopedIssues.find((issue) => issue.id === entry.id)?.sortOrder !== entry.sortOrder)

    await z.mutate.pm_issues.reorder({
      activeIssueId: activeIssue.id,
      updates: [
        patch,
        ...passiveSortOrderUpdates,
      ],
    })
    if (summaryParts.length) {
      await logActivity(activeIssue.id, summaryParts.join(' · '), issueEventTypeForStatus(targetStatus.type))
    }
  }

  async function toggleIssueLabel(issueId: string, labelId: string) {
    const existing = issueLabels.find(
      (link) => link.issueId === issueId && link.labelId === labelId,
    )
    const label = labelMap.get(labelId)
    if (existing) {
      await z.mutate.pm_issue_labels.delete({ id: existing.id })
      if (label) await logActivity(issueId, `removed label ${label.name}`, 'updated')
    } else {
      await z.mutate.pm_issue_labels.create({
        id: crypto.randomUUID(),
        issueId,
        labelId,
      })
      if (label) await logActivity(issueId, `added label ${label.name}`, 'updated')
    }
  }

  async function changeIssuePriority(issueId: string, nextRaw: string) {
    const issue = scopedIssues.find((entry) => entry.id === issueId)
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
    const issue = scopedIssues.find((entry) => entry.id === issueId)
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

  async function changeIssueAssignee(issueId: string, nextAssigneeId: string) {
    const issue = scopedIssues.find((entry) => entry.id === issueId)
    if (!issue) return
    const target = nextAssigneeId || undefined
    if (target === issue.assigneeId) return
    const assignee = nextAssigneeId ? assignableUsers.find((u) => u.id === nextAssigneeId) : null
    await z.mutate.pm_issues.update({ id: issueId, assigneeId: target })
    await logActivity(
      issueId,
      target ? `assigned to ${assignee?.name ?? assignee?.email ?? '—'}` : 'cleared assignee',
      'updated',
    )
  }

  async function changeIssueProject(issueId: string, nextProjectId: string) {
    const issue = scopedIssues.find((entry) => entry.id === issueId)
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
    const issue = scopedIssues.find((entry) => entry.id === issueId)
    if (!issue || issue.teamId === nextTeamId) return
    const fromTeam = teams.find((t) => t.id === issue.teamId)
    const toTeam = teams.find((t) => t.id === nextTeamId)
    if (!toTeam) return

    const nextNumber =
      scopedIssues
        .filter((entry) => entry.teamId === nextTeamId && canAccessOrganization(entry.contextCompanyId))
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
    const issue = scopedIssues.find((entry) => entry.id === issueId)
    if (!issue || issue.statusId === nextStatusId) return
    const current = statusMap.get(issue.statusId)
    const next = statusMap.get(nextStatusId)
    if (!next) return
    const patch: Record<string, unknown> = {
      statusId: nextStatusId,
      sortOrder: getNextSortOrder(issue.priority, nextStatusId, issue.id),
    }
    const now = Date.now()
    if ((next.type === 'started' || next.type === 'review') && !issue.startedAt) patch.startedAt = now
    if (next.type === 'completed') patch.completedAt = now
    if (next.type === 'canceled') patch.canceledAt = now
    await z.mutate.pm_issues.update({ id: issueId, ...patch })
    await logActivity(
      issueId,
      `moved from ${current?.name ?? '—'} to ${next.name}`,
      issueEventTypeForStatus(next.type),
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
      { id: crypto.randomUUID(), name: 'In Review', key: 'in_review', type: 'review', color: '#38bdf8' },
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
    if (!composerCompanyId && !canAccessUnscoped) return

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
        scopedIssues.filter((issue) => issue.teamId === teamId).reduce((max, issue) => Math.max(max, issue.number), 0) + 1

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
        sortOrder: getTopSortOrder(composerPriority, statusId),
      })

      await logActivity(issueId, `Created issue ${team.key}-${nextNumber}`)
      setComposerTitle('')
      setComposerDescription('')
      if (composerCreateMore) {
        // keep the modal open for quick successive creation
      } else {
        setComposerOpen(false)
      }
    } finally {
      setCreatingIssue(false)
    }
  }

  return (
    <>
    <div className="flex h-full min-h-0 flex-col">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-auto py-6">
              <div className="mb-4 flex flex-wrap items-start gap-3 px-4 md:gap-4 md:px-6">
                {!(section.kind === 'team' && section.tab === 'projects') && (
                  <FilterButton
                    activeFilters={activeFilters}
                    filterConfigs={filterConfigs}
                    onFilterChange={setFilterField}
                    onClearAll={clearAllFilters}
                    chipsPlacement="below"
                  />
                )}
                <div className="ml-auto flex items-center gap-2">
                  <div className="font-mono text-xs uppercase tracking-label text-fg-3">
                    {section.kind === 'team' && section.tab === 'projects'
                      ? `${selectedTeamProjects.length} visible`
                      : `${filteredIssues.length} visible`}
                  </div>
                  {!(section.kind === 'team' && section.tab === 'projects') && (
                    <>
                      {section.kind === 'all' && (
                        <IconTooltip label={user ? 'save as view' : 'sign in to save view'}>
                          <button
                            onClick={openSaveViewModal}
                            disabled={!user}
                            aria-label={user ? 'save as view' : 'sign in to save view'}
                            className="flex h-6 w-6 items-center justify-center border border-edge/15 bg-pit-3 text-fg-3 transition hover:border-edge/25 hover:text-fg-1 disabled:opacity-40 disabled:hover:border-edge/15 disabled:hover:text-fg-3"
                          >
                            <BookmarkPlus className="h-3 w-3" />
                          </button>
                        </IconTooltip>
                      )}
                      {section.kind === 'view' && activeSavedView && (
                        <>
                          <IconTooltip
                            label={
                              activeSavedViewIsDirty
                                ? `update view · ${activeSavedView.name.toLowerCase()}`
                                : 'view is up to date'
                            }
                          >
                            <button
                              onClick={updateActiveSavedView}
                              disabled={!activeSavedViewIsDirty || updatingView}
                              aria-label={
                                activeSavedViewIsDirty
                                  ? `update view · ${activeSavedView.name.toLowerCase()}`
                                  : 'view is up to date'
                              }
                              className={`flex h-6 w-6 items-center justify-center border transition ${
                                activeSavedViewIsDirty
                                  ? 'border-edge/30 bg-accent-fill/8 text-accent hover:bg-accent-fill/16 hover:shadow-glow-xs'
                                  : 'border-edge/12 bg-pit-3 text-fg-4 opacity-60'
                              } disabled:cursor-not-allowed`}
                            >
                              <Save className="h-3 w-3" />
                            </button>
                          </IconTooltip>
                          <IconTooltip label={`delete view · ${activeSavedView.name.toLowerCase()}`}>
                            <button
                              onClick={() => setDeleteViewModalOpen(true)}
                              disabled={deletingView}
                              aria-label={`delete view · ${activeSavedView.name.toLowerCase()}`}
                              className="flex h-6 w-6 items-center justify-center border border-fail/20 bg-fail/5 text-fail transition hover:border-fail/34 hover:bg-fail/10 disabled:opacity-40 disabled:hover:border-fail/20 disabled:hover:bg-fail/5"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </IconTooltip>
                        </>
                      )}
                      <SortMenu value={sortConfig} onChange={setSortConfig} />
                      <DisplayMenu value={visibleFields} onChange={setVisibleFields} />
                    </>
                  )}
                </div>
              </div>

              {section.kind === 'team' && section.tab === 'projects' ? (
                <TeamProjectsPanel
                  team={selectedTeam}
                  projects={selectedTeamProjects}
                  issues={scopedIssues}
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
                      <section key={group.value} className="overflow-hidden border-y border-edge/12 bg-pit-2/60 backdrop-blur-sm">
                        <button
                          onClick={() => togglePriority(group.value)}
                          className="flex w-full items-center gap-3 border-b border-edge/10 bg-pit-3/60 px-5 py-3 text-left"
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
                                .filter((issue) => getIssueStatusBucket(issue, statusMap).key === status.key)
                                .sort(makeIssueComparator(sortConfig, statusMap))
                              if (!statusIssues.length) return null

                              const statusKey = `${group.value}:${status.key}`
                              const statusCollapsed = collapsedStatuses.has(statusKey)
                              return (
                                <div key={status.key} className="border-b border-edge/8 last:border-b-0">
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
                                    disabled={!isManualSort}
                                  >
                                  <div>
                                    {statusIssues.map((issue) => (
                                      <SortableIssueRow
                                        key={issue.id}
                                        issue={issue}
                                        company={issue.contextCompanyId ? companyMap.get(issue.contextCompanyId) ?? null : null}
                                        team={teamMap.get(issue.teamId) ?? null}
                                        project={issue.projectId ? projectMap.get(issue.projectId) : null}
                                        assignee={issue.assigneeId ? userMap.get(issue.assigneeId) : null}
                                        users={assignableUsers}
                                        status={statusMap.get(issue.statusId) ?? null}
                                        statusOptions={workspaceStatuses}
                                        teamProjects={projects.filter((p) => p.teamId === issue.teamId)}
                                        allTeams={teams}
                                        issueLabels={labelsByIssue.get(issue.id) ?? []}
                                        availableLabels={scopedLabels.filter((l) =>
                                          (!l.teamId || l.teamId === issue.teamId) &&
                                          (!l.companyId || l.companyId === issue.contextCompanyId),
                                        )}
                                        hasActiveAgentRun={activeAgentRunIssueIds.has(issue.id)}
                                        visibleFields={visibleFields}
                                        shortcutRequest={rowShortcutRequest}
                                        draggable={isManualSort}
                                        onHoverChange={(hovered) => {
                                          setHoveredIssueId((current) => {
                                            if (hovered) return issue.id
                                            return current === issue.id ? null : current
                                          })
                                        }}
                                        onStatusChange={changeIssueStatus}
                                        onProjectChange={changeIssueProject}
                                        onTeamChange={changeIssueTeam}
                                        onEstimateChange={changeIssueEstimate}
                                        onAssigneeChange={changeIssueAssignee}
                                        onPriorityChange={changeIssuePriority}
                                        onToggleLabel={toggleIssueLabel}
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
                    <div className="border border-edge/40 bg-pit-3/95 shadow-terminal-popover backdrop-blur-sm">
                      <IssueRow
                        issue={activeDragIssue}
                        company={activeDragIssue.contextCompanyId ? companyMap.get(activeDragIssue.contextCompanyId) ?? null : null}
                        team={teamMap.get(activeDragIssue.teamId) ?? null}
                        project={activeDragIssue.projectId ? projectMap.get(activeDragIssue.projectId) : null}
                        assignee={activeDragIssue.assigneeId ? userMap.get(activeDragIssue.assigneeId) : null}
                        users={assignableUsers}
                        status={statusMap.get(activeDragIssue.statusId) ?? null}
                        statusOptions={workspaceStatuses}
                        teamProjects={projects.filter((p) => p.teamId === activeDragIssue.teamId)}
                        allTeams={teams}
                        issueLabels={labelsByIssue.get(activeDragIssue.id) ?? []}
                        availableLabels={[]}
                        hasActiveAgentRun={activeAgentRunIssueIds.has(activeDragIssue.id)}
                        visibleFields={visibleFields}
                        shortcutRequest={null}
                        draggable={isManualSort}
                        onHoverChange={() => {}}
                        onStatusChange={() => {}}
                        onProjectChange={() => {}}
                        onTeamChange={() => {}}
                        onEstimateChange={() => {}}
                        onAssigneeChange={() => {}}
                        onPriorityChange={() => {}}
                        onToggleLabel={() => {}}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
                </DndContext>
              ) : (
                <EmptyState
                  title={scopedIssues.length ? 'no issues match this view yet' : 'start by creating your first issue'}
                  body={scopedIssues.length
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
        users={assignableUsers}
        team={selectedComposerTeam}
        creating={creatingIssue}
        organizationRequired={!canAccessUnscoped}
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

    {saveViewModalOpen && (
      <SaveViewModal
        name={saveViewName}
        saving={savingView}
        onNameChange={setSaveViewName}
        onClose={closeSaveViewModal}
        onSubmit={submitSavedView}
      />
    )}

    {deleteViewModalOpen && activeSavedView && (
      <DeleteViewModal
        viewName={activeSavedView.name}
        deleting={deletingView}
        onClose={closeDeleteViewModal}
        onConfirm={deleteActiveSavedView}
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
    <section className="overflow-hidden border-y border-edge/12 bg-pit-2/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-edge/10 bg-pit-3/60 px-5 py-3">
        <div className="font-mono text-xs uppercase tracking-label text-fg-3">
          {team.name.toLowerCase()} · projects <span className="text-fg-4">· {projects.length}</span>
        </div>
        <button
          onClick={() => onCreate(team.id)}
          className="inline-flex items-center gap-1.5 border border-edge/30 bg-accent-fill/8 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs"
        >
          <Plus className="h-3 w-3" />
          new project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="px-5 py-10 text-center font-mono text-xs text-fg-4">// no projects in this team yet</div>
      ) : (
        <div>
          <div className="flex items-center gap-4 border-b border-edge/8 px-5 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
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
                className="flex w-full items-center gap-4 border-b border-edge/6 px-5 py-2.5 text-left transition hover:bg-accent-fill/4 last:border-b-0"
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
    <div className="flex min-h-[320px] items-center justify-center border border-dashed border-edge/15 bg-pit-2 px-6">
      <div className="max-w-lg text-center">
        <div className="font-mono text-xl lowercase text-fg-1">{title}</div>
        <div className="mt-3 text-sm leading-6 text-fg-3">{body}</div>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="mt-5 inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs"
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
  organizationRequired,
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
  companies: Schema['tables']['organizations']['row'][]
  teams: Schema['tables']['pm_teams']['row'][]
  projects: Schema['tables']['pm_projects']['row'][]
  statuses: Schema['tables']['pm_statuses']['row'][]
  users: Schema['tables']['users']['row'][]
  team: Schema['tables']['pm_teams']['row'] | null
  creating: boolean
  organizationRequired: boolean
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
      if (title.trim() && (!organizationRequired || companyId) && !creating) onCreate()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* breadcrumb header */}
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <PachSelect
              variant="button"
              value={teamId}
              onChange={onTeamChange}
              options={teams.map((t) => ({ value: t.id, label: t.name.toLowerCase() }))}
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
              { value: '', label: 'no organization' },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
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

        {/* footer */}
        <div className="flex items-center justify-between border-t border-edge/12 px-5 py-3">
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
                    ? 'border-accent bg-accent-fill/20'
                    : 'border-edge/25'
                }`}
              >
                {createMore ? <span className="text-accent text-[10px] leading-none">×</span> : null}
              </span>
              create more
            </button>
            <button
              onClick={onCreate}
              disabled={!title.trim() || (organizationRequired && !companyId) || creating}
              className="inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-accent-fill/8 disabled:hover:shadow-none"
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
    <span className="inline-flex items-center gap-1.5 border border-edge/20 bg-pit-3 px-2.5 py-1 font-mono text-[11px] lowercase text-fg-2 hover:border-edge/40 hover:bg-accent-fill/4 hover:text-fg-1 transition">
      <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
      <span className="truncate max-w-[160px]">{label}</span>
    </span>
  )
}

const PROJECT_STATUS_OPTIONS = ['planned', 'active', 'paused', 'completed', 'canceled']

function SaveViewModal({
  name,
  saving,
  onNameChange,
  onClose,
  onSubmit,
}: {
  name: string
  saving: boolean
  onNameChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || saving) return
    onSubmit()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        className="w-full max-w-lg border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="border-b border-edge/12 px-6 py-5">
          <div className="text-[10px] uppercase tracking-label text-fg-3">
            ◊ views · save
          </div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">
            save as view
          </div>
        </div>

        <div className="px-6 py-5">
          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">view name</div>
            <input
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="$ my open work"
              className="w-full bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-edge/12 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
          >
            [cancel]
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-accent-fill/8 disabled:hover:shadow-none"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            {saving ? 'saving…' : 'save view'}
          </button>
        </div>
      </form>
    </div>
  )
}

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-edge/12 px-6 py-5">
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
              className="w-full bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">description</div>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="$ what is this project about?"
              rows={3}
              className="w-full resize-none bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">status</div>
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value)}
              className="w-full bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs"
            >
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-edge/12 px-6 py-4">
          <button
            onClick={onClose}
            className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
          >
            [cancel]
          </button>
          <button
            onClick={onSubmit}
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-accent-fill/8 disabled:hover:shadow-none"
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
        className="w-full bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs"
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

const ESTIMATE_VALUES = [1, 2, 4, 8, 16]

function SortableIssueRow(props: React.ComponentProps<typeof IssueRow>) {
  const draggable = props.draggable !== false
  const didDragRef = useRef(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    isOver,
    index,
    activeIndex,
  } = useSortable({ id: props.issue.id, disabled: !draggable })

  useEffect(() => {
    if (isDragging) didDragRef.current = true
  }, [isDragging])

  // determine if this row should show a drop indicator and where
  let indicator: 'above' | 'below' | null = null
  if (draggable && isOver && activeIndex !== index) {
    if (activeIndex < 0) {
      indicator = 'above'
    } else {
      indicator = activeIndex > index ? 'above' : 'below'
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className="relative"
      style={{ opacity: isDragging ? 0.35 : 1 }}
      onClickCapture={(event) => {
        if (!didDragRef.current) return
        didDragRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {indicator === 'above' && <DropIndicator position="top" />}
      <IssueRow
        {...props}
        dragHandleProps={draggable ? {} : undefined}
      />
      {indicator === 'below' && <DropIndicator position="bottom" />}
    </div>
  )
}

function DropIndicator({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-0 right-0 z-30 h-[1.5px] bg-accent-fill/55 shadow-glow-xs ${
        position === 'top' ? '-top-px' : '-bottom-px'
      }`}
    />
  )
}

function AgentRunDot() {
  return (
    <>
      <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-accent opacity-40" />
      <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(0,255,136,0.95)]" />
    </>
  )
}

function IssueRow({
  issue,
  company,
  team,
  project,
  assignee,
  users,
  status,
  statusOptions,
  teamProjects,
  allTeams,
  issueLabels,
  availableLabels,
  hasActiveAgentRun,
  visibleFields,
  shortcutRequest,
  onStatusChange,
  onProjectChange,
  onTeamChange,
  onEstimateChange,
  onAssigneeChange,
  onPriorityChange,
  onToggleLabel,
  onHoverChange,
  dragHandleProps,
}: {
  issue: Schema['tables']['pm_issues']['row']
  company: Schema['tables']['organizations']['row'] | null
  team: Schema['tables']['pm_teams']['row'] | null
  project: Schema['tables']['pm_projects']['row'] | null | undefined
  assignee: Schema['tables']['users']['row'] | null | undefined
  users: Schema['tables']['users']['row'][]
  status: Schema['tables']['pm_statuses']['row'] | null
  statusOptions: Schema['tables']['pm_statuses']['row'][]
  teamProjects: Schema['tables']['pm_projects']['row'][]
  allTeams: Schema['tables']['pm_teams']['row'][]
  issueLabels: Schema['tables']['pm_labels']['row'][]
  availableLabels: Schema['tables']['pm_labels']['row'][]
  hasActiveAgentRun: boolean
  visibleFields: Set<RowField>
  shortcutRequest?: RowShortcutRequest | null
  draggable?: boolean
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  onStatusChange: (issueId: string, nextStatusId: string) => void | Promise<void>
  onProjectChange: (issueId: string, nextProjectId: string) => void | Promise<void>
  onTeamChange: (issueId: string, nextTeamId: string) => void | Promise<void>
  onEstimateChange: (issueId: string, nextEstimate: string) => void | Promise<void>
  onAssigneeChange: (issueId: string, nextAssigneeId: string) => void | Promise<void>
  onPriorityChange: (issueId: string, nextPriority: string) => void | Promise<void>
  onToggleLabel: (issueId: string, labelId: string) => void | Promise<void>
  onHoverChange?: (hovered: boolean) => void
}) {
  const navigate = useNavigate()
  const showCompany = Boolean(company)
  const shows = (field: RowField) => visibleFields.has(field)
  const currentShortcut = shortcutRequest?.issueId === issue.id ? shortcutRequest : null
  const statusOpenSignal =
    currentShortcut?.control === 'status'
      ? currentShortcut.nonce
      : undefined
  const labelsOpenSignal =
    currentShortcut?.control === 'labels'
      ? currentShortcut.nonce
      : undefined
  const hasIssueLabels = issueLabels.length > 0

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onClick={() => navigate(`/issues/${issue.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          navigate(`/issues/${issue.id}`)
        }
      }}
      className="group flex items-center gap-2 px-3 md:px-4 py-2 border-t border-edge/6 transition hover:bg-accent-fill/4 cursor-pointer focus:outline-none focus-visible:bg-accent-fill/6"
    >
      {dragHandleProps ? (
        <button
          type="button"
          {...dragHandleProps}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            dragHandleProps.onKeyDown?.(event)
          }}
          className="flex h-6 w-5 shrink-0 items-center justify-center text-fg-4 transition hover:text-accent"
          title="drag issue"
          aria-label="drag issue"
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      ) : null}
      {shows('status') && (
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
            triggerClassName="flex h-6 w-6 items-center justify-center border border-transparent hover:border-edge/25 hover:bg-accent-fill/6 transition"
            popupWidth="200px"
            openSignal={statusOpenSignal}
          />
        </div>
      )}
      {shows('priority') && (
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
            triggerClassName="flex h-6 w-6 items-center justify-center border border-transparent hover:border-edge/25 hover:bg-accent-fill/6 transition"
            popupWidth="180px"
          />
        </div>
      )}
      {shows('identifier') && (
        <div className="shrink-0 font-mono text-xs text-accent/80 tabular-nums">{issue.identifier}</div>
      )}
      {hasActiveAgentRun ? (
        <div
          className="relative flex h-5 w-5 shrink-0 items-center justify-center"
          title="active VPS agent run"
          aria-label="active VPS agent run"
        >
          <AgentRunDot />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-sm text-fg-1">{issue.title}</div>
      {shows('company') && showCompany && (
        <span className="hidden md:inline-flex shrink-0 h-5 items-center gap-1 border border-edge/15 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
          <Building2 className="h-3 w-3" />
          {company.name}
        </span>
      )}
      {shows('project') && issue.projectId && (
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
              <span className="inline-flex h-5 items-center gap-1 border border-edge/15 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
                <FolderKanban className="h-3 w-3" />
                {project?.name ?? 'no project'}
              </span>
            }
            triggerTitle="change project"
            triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
            popupWidth="220px"
          />
        </div>
      )}
      {shows('team') && (
        <div className="hidden md:block shrink-0" onClick={(event) => event.stopPropagation()}>
          <PachSelect
            variant="button"
            value={issue.teamId}
            onChange={(next) => onTeamChange(issue.id, next)}
            options={allTeams.map((t) => ({ value: t.id, label: t.name.toLowerCase() }))}
            trigger={
              <span className="inline-flex shrink-0 h-5 items-center border border-edge/15 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
                {team?.name ?? '—'}
              </span>
            }
            triggerTitle="change team"
            triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
            popupWidth="200px"
          />
        </div>
      )}
      {((shows('labels') && hasIssueLabels) || labelsOpenSignal != null) && (
        <div
          className={`hidden md:block shrink-0 ${shows('labels') && hasIssueLabels ? '' : 'w-0 overflow-visible'}`}
          onClick={(event) => event.stopPropagation()}
        >
          <LabelMenu
            available={availableLabels}
            selectedIds={new Set(issueLabels.map((l) => l.id))}
            onToggle={(labelId) => onToggleLabel(issue.id, labelId)}
            trigger={
              hasIssueLabels ? (
                <span className="inline-flex items-center gap-1">
                  {issueLabels.slice(0, 3).map((label) => (
                    <LabelChip key={label.id} label={label} />
                  ))}
                  {issueLabels.length > 3 && (
                    <span className="font-mono text-[10px] text-fg-4">+{issueLabels.length - 3}</span>
                  )}
                </span>
              ) : (
                <span aria-hidden className="block h-0 w-0 overflow-hidden" />
              )
            }
            triggerClassName={
              hasIssueLabels
                ? 'inline-flex items-center gap-1 p-0 border-0 bg-transparent transition hover:opacity-80'
                : 'block h-0 w-0 overflow-hidden border-0 bg-transparent p-0 opacity-0'
            }
            triggerTitle="edit labels"
            triggerAriaLabel={`edit labels for ${issue.identifier}`}
            popupWidth="240px"
            openSignal={labelsOpenSignal}
          />
        </div>
      )}
      {shows('assignee') && assignee && (
        <div className="hidden sm:block shrink-0" onClick={(event) => event.stopPropagation()}>
          <PachSelect
            variant="button"
            value={issue.assigneeId ?? ''}
            onChange={(next) => onAssigneeChange(issue.id, next)}
            options={[
              { value: '', label: 'unassigned' },
              ...users.map((u) => ({ value: u.id, label: (u.name ?? u.email).toLowerCase() })),
            ]}
            trigger={
              <span className="inline-flex h-5 min-w-6 items-center justify-center border border-edge/15 bg-pit-3 px-1.5 font-mono text-[10px] uppercase tracking-label text-fg-3">
                {getUserInitials(assignee)}
              </span>
            }
            triggerTitle={`assignee · ${assignee.name ?? assignee.email}`}
            triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
            popupWidth="220px"
            align="right"
          />
        </div>
      )}
      {shows('estimate') && (
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
              <span className="font-mono text-xs text-fg-3 tabular-nums px-1.5 py-0.5 border border-transparent hover:border-edge/20 hover:bg-accent-fill/4 transition">
                {issue.estimate != null ? `${issue.estimate} pts` : '— pts'}
              </span>
            }
            triggerTitle="change estimate"
            triggerClassName="transition"
            popupWidth="160px"
            align="right"
          />
        </div>
      )}
      {shows('updated') && (
        <div className="hidden sm:block shrink-0 font-mono text-[10px] uppercase tracking-label text-fg-4">{formatShortDate(issue.updatedAt)}</div>
      )}
    </div>
  )
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortConfig
  onChange: (next: SortConfig) => void
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

  const currentLabel = SORT_FIELDS.find((f) => f.value === value.field)?.label ?? 'manual order'
  const isManual = value.field === 'manual'
  const tooltipLabel = `sort - ${currentLabel}${isManual ? '' : ` ${value.direction}`}`

  return (
    <div className="relative" ref={ref}>
      <IconTooltip label={tooltipLabel} disabled={open}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={tooltipLabel}
          className={`flex h-6 w-6 items-center justify-center border transition ${
            open
              ? 'border-edge/35 bg-accent-fill/6 text-accent shadow-glow-xs'
              : !isManual
                ? 'border-edge/25 bg-pit-3 text-accent'
                : 'border-edge/15 bg-pit-3 text-fg-3 hover:text-fg-1 hover:border-edge/25'
          }`}
        >
          <ArrowUpDown className="h-3 w-3" />
        </button>
      </IconTooltip>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[240px] border border-edge/25 bg-pit shadow-terminal-popover">
          <div className="border-b border-edge/12 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
            sort by
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {SORT_FIELDS.map((field) => {
              const isActive = field.value === value.field
              const isManualField = field.value === 'manual'
              return (
                <button
                  key={field.value}
                  onClick={() => {
                    if (isManualField) {
                      onChange({ field: 'manual', direction: 'asc' })
                    } else {
                      // toggle direction if same field, otherwise default to asc
                      onChange({
                        field: field.value,
                        direction: isActive && value.direction === 'asc' ? 'desc' : 'asc',
                      })
                    }
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-xs lowercase transition ${
                    isActive
                      ? 'bg-accent-fill/8 text-accent'
                      : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
                  }`}
                >
                  <span className="truncate">{field.label}</span>
                  {isActive && !isManualField && (
                    value.direction === 'asc'
                      ? <ArrowUp className="h-3 w-3 shrink-0" />
                      : <ArrowDown className="h-3 w-3 shrink-0" />
                  )}
                  {isActive && isManualField && <Check className="h-3 w-3 shrink-0" />}
                </button>
              )
            })}
          </div>
          {!isManual && (
            <div className="border-t border-edge/12 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
              // dragging disabled while sorted
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DisplayMenu({
  value,
  onChange,
}: {
  value: Set<RowField>
  onChange: (next: Set<RowField>) => void
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

  function toggle(field: RowField) {
    const next = new Set(value)
    if (next.has(field)) next.delete(field)
    else next.add(field)
    onChange(next)
  }

  return (
    <div className="relative" ref={ref}>
      <IconTooltip label="display" disabled={open}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="display"
          className={`flex h-6 w-6 items-center justify-center border transition ${
            open
              ? 'border-edge/35 bg-accent-fill/6 text-accent shadow-glow-xs'
              : 'border-edge/15 bg-pit-3 text-fg-3 hover:text-fg-1 hover:border-edge/25'
          }`}
        >
          <Settings2 className="h-3 w-3" />
        </button>
      </IconTooltip>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[220px] border border-edge/25 bg-pit shadow-terminal-popover">
          <div className="border-b border-edge/12 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
            show on row
          </div>
          <div className="max-h-72 overflow-auto py-1">
            <div className="flex items-center gap-2.5 px-3 py-1.5 font-mono text-xs lowercase text-fg-4">
              <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-edge/15 bg-pit-3">
                <Check className="h-2.5 w-2.5 text-fg-4" strokeWidth={3} />
              </span>
              <span className="truncate">title (always)</span>
            </div>
            {ROW_FIELDS.map((field) => {
              const isChecked = value.has(field.value)
              return (
                <button
                  key={field.value}
                  onClick={() => toggle(field.value)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-mono text-xs lowercase text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1 transition"
                >
                  <span
                    aria-hidden
                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition ${
                      isChecked ? 'border-accent bg-accent' : 'border-edge/20 bg-transparent'
                    }`}
                  >
                    {isChecked && <Check className="h-2.5 w-2.5 text-pit" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{field.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function LabelChip({ label }: { label: Schema['tables']['pm_labels']['row'] }) {
  const color = label.color || 'var(--fg-3)'
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 border border-edge/15 bg-pit-3 px-1.5 font-mono text-[10px] tracking-label lowercase text-fg-3"
      title={label.name}
    >
      <span aria-hidden className="block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label.name.toLowerCase()}
    </span>
  )
}

function getStatusBuckets(
  issues: Schema['tables']['pm_issues']['row'][],
  statusMap: Map<string, Schema['tables']['pm_statuses']['row']>,
) {
  const uniqueStatuses = new Map<string, { key: string; name: string; type: string; position: number }>()
  for (const issue of issues) {
    const bucket = getIssueStatusBucket(issue, statusMap)
    if (!uniqueStatuses.has(bucket.key)) uniqueStatuses.set(bucket.key, bucket)
  }

  return Array.from(uniqueStatuses.values()).sort((a, b) => {
    const rankDiff = issueSectionStatusRank(a.type) - issueSectionStatusRank(b.type)
    if (rankDiff !== 0) return rankDiff
    return a.position - b.position
  })
}

function getIssueStatusBucket(
  issue: Schema['tables']['pm_issues']['row'],
  statusMap: Map<string, Schema['tables']['pm_statuses']['row']>,
) {
  const status = statusMap.get(issue.statusId)
  return getStatusBucket(status) ?? {
    key: `missing:${issue.statusId}`,
    name: 'unknown status',
    type: 'todo',
    position: 999,
  }
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

function readStoredView(storageKey: string | null): IssueViewState {
  const empty = {
    filters: {} as ActiveFilters,
    collapsedPriorities: [] as number[],
    collapsedStatuses: [] as string[],
    sort: DEFAULT_SORT,
    visibleFields: DEFAULT_VISIBLE_FIELDS,
  }
  if (!storageKey || typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return empty
    return parseIssueViewState(JSON.parse(raw))
  } catch {
    return empty
  }
}

function readSavedIssueView(view: Schema['tables']['pm_saved_views']['row']): IssueViewState {
  return parseIssueViewState({
    filters: view.filters,
    display: view.display,
  })
}

function getIssueViewDisplay(state: IssueViewState): Record<string, unknown> {
  return {
    sort: state.sort,
    visibleFields: state.visibleFields,
    collapsedPriorities: state.collapsedPriorities,
    collapsedStatuses: state.collapsedStatuses,
  }
}

function issueViewStatesEqual(a: IssueViewState, b: IssueViewState) {
  return JSON.stringify(normalizeIssueViewState(a)) === JSON.stringify(normalizeIssueViewState(b))
}

function normalizeIssueViewState(state: IssueViewState) {
  const filterEntries = Object.entries(state.filters)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => [field, [...values].sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b))

  const visibleFieldSet = new Set(state.visibleFields)
  const visibleFields = ROW_FIELDS
    .map((field) => field.value)
    .filter((field) => visibleFieldSet.has(field))

  return {
    filters: Object.fromEntries(filterEntries),
    collapsedPriorities: [...state.collapsedPriorities].sort((a, b) => a - b),
    collapsedStatuses: [...state.collapsedStatuses].sort(),
    sort: state.sort,
    visibleFields,
  }
}

function parseIssueViewState(raw: unknown): IssueViewState {
  const parsed = isRecord(raw) ? raw : {}
  const display = isRecord(parsed.display) ? parsed.display : parsed
  const filters = isRecord(parsed.filters) ? parseActiveFilters(parsed.filters) : {}

  const collapsedPriorities = Array.isArray(display.collapsedPriorities)
    ? display.collapsedPriorities.filter((v): v is number => typeof v === 'number')
    : []
  const collapsedStatuses = Array.isArray(display.collapsedStatuses)
    ? display.collapsedStatuses.filter((v): v is string => typeof v === 'string')
    : []

  const sortRaw = isRecord(display.sort) ? display.sort : {}
  const validSortFields = SORT_FIELDS.map((f) => f.value)
  const sortField =
    typeof sortRaw.field === 'string' && (validSortFields as string[]).includes(sortRaw.field)
      ? (sortRaw.field as SortField)
      : DEFAULT_SORT.field
  const sortDirection: SortDirection = sortRaw.direction === 'desc' ? 'desc' : 'asc'

  const validRowFields = ROW_FIELDS.map((f) => f.value) as string[]
  const visibleFields = Array.isArray(display.visibleFields)
    ? (display.visibleFields.filter(
        (v): v is RowField => typeof v === 'string' && validRowFields.includes(v),
      ) as RowField[])
    : DEFAULT_VISIBLE_FIELDS

  return {
    filters,
    collapsedPriorities,
    collapsedStatuses,
    sort: { field: sortField, direction: sortDirection },
    visibleFields,
  }
}

function parseActiveFilters(raw: Record<string, unknown>): ActiveFilters {
  const filters: ActiveFilters = {}
  for (const [field, values] of Object.entries(raw)) {
    if (!Array.isArray(values)) continue
    const stringValues = values.filter((v): v is string => typeof v === 'string')
    if (stringValues.length) filters[field] = stringValues
  }
  return filters
}

function copyActiveFilters(filters: ActiveFilters): ActiveFilters {
  const copy: ActiveFilters = {}
  for (const [field, values] of Object.entries(filters)) {
    if (values.length) copy[field] = [...values]
  }
  return copy
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slugifySavedViewName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'view'
}

function makeUniqueSlug(base: string, existingSlugs: Set<string>) {
  if (!existingSlugs.has(base)) return base
  let counter = 2
  while (existingSlugs.has(`${base}-${counter}`)) counter += 1
  return `${base}-${counter}`
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

function getSortOrderUpdatesForReorderedBucket(
  reordered: Schema['tables']['pm_issues']['row'][],
  activeIssueId: string,
) {
  const activePos = reordered.findIndex((entry) => entry.id === activeIssueId)
  if (activePos < 0) return []

  const before = reordered[activePos - 1]?.sortOrder
  const after = reordered[activePos + 1]?.sortOrder
  const sparseSortOrder = getSparseSortOrder(before, after)
  if (sparseSortOrder != null) {
    return [{ id: activeIssueId, sortOrder: sparseSortOrder }]
  }

  return reordered.map((issue, index) => ({
    id: issue.id,
    sortOrder: SORT_ORDER_BASE + index * SORT_ORDER_STEP,
  }))
}

function getSparseSortOrder(before: number | undefined, after: number | undefined) {
  if (before == null && after == null) return SORT_ORDER_BASE
  if (before == null && after != null) return after - SORT_ORDER_STEP
  if (before != null && after == null) return before + SORT_ORDER_STEP
  if (before == null || after == null) return null

  const candidate = Math.floor((before + after) / 2)
  return candidate > before && candidate < after ? candidate : null
}

function makeIssueComparator(
  config: SortConfig,
  statusMap: Map<string, Schema['tables']['pm_statuses']['row']>,
) {
  if (config.field === 'manual') return compareIssuesForBucketOrder

  const dir = config.direction === 'desc' ? -1 : 1
  return (a: Schema['tables']['pm_issues']['row'], b: Schema['tables']['pm_issues']['row']) => {
    let cmp = 0
    switch (config.field) {
      case 'priority': {
        // urgent (1) → high (2) → medium (3) → low (4) → no priority (0)
        const rank = (p: number) => (p === 0 ? 99 : p)
        cmp = rank(a.priority) - rank(b.priority)
        break
      }
      case 'status': {
        const ra = getStatusBucket(statusMap.get(a.statusId))?.position ?? 99
        const rb = getStatusBucket(statusMap.get(b.statusId))?.position ?? 99
        cmp = ra - rb
        break
      }
      case 'identifier':
        cmp = a.identifier.localeCompare(b.identifier, undefined, { numeric: true })
        break
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'estimate': {
        const ea = a.estimate ?? Number.POSITIVE_INFINITY
        const eb = b.estimate ?? Number.POSITIVE_INFINITY
        cmp = ea - eb
        break
      }
      case 'updated':
        cmp = a.updatedAt - b.updatedAt
        break
      case 'created':
        cmp = a.createdAt - b.createdAt
        break
      case 'due': {
        const da = a.dueDate ?? Number.POSITIVE_INFINITY
        const db = b.dueDate ?? Number.POSITIVE_INFINITY
        cmp = da - db
        break
      }
    }
    if (cmp !== 0) return cmp * dir
    // tie-breakers: stable order via sortOrder then identifier
    const rankDiff = a.sortOrder - b.sortOrder
    if (rankDiff !== 0) return rankDiff
    return a.identifier.localeCompare(b.identifier)
  }
}

function getStatusBucket(status?: Schema['tables']['pm_statuses']['row'] | null) {
  if (!status) return null
  if (status.key === 'in_review' || status.type === 'review') {
    return { key: 'in_review', name: 'in review', type: 'review', position: 3 }
  }
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
    return { key: 'blocked', name: 'blocked', type: 'blocked', position: 4 }
  }
  if (status.type === 'completed') {
    return { key: 'done', name: 'done', type: 'completed', position: 5 }
  }
  if (status.type === 'canceled') {
    return { key: 'canceled', name: 'canceled', type: 'canceled', position: 6 }
  }
  return {
    key: status.key,
    name: status.name.toLowerCase(),
    type: status.type,
    position: status.position,
  }
}

function issueEventTypeForStatus(statusType?: string) {
  if (statusType === 'completed') return 'completed'
  if (statusType === 'canceled') return 'canceled'
  return 'updated'
}

function issueActivityKind(type: string) {
  if (type === 'completed') return 'progress'
  if (type === 'agent_run_failed') return 'incident'
  return 'operational'
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

function issueSectionStatusRank(statusType: string) {
  if (statusType === 'blocked') return 0
  if (statusType === 'review') return 1
  if (statusType === 'started') return 2
  if (statusType === 'unstarted') return 3
  if (statusType === 'backlog') return 4
  if (statusType === 'completed') return 5
  if (statusType === 'canceled') return 6
  return 99
}

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function getUserInitials(user: Schema['tables']['users']['row']) {
  const source = (user.name?.trim() || user.email.split('@')[0] || '').trim()
  if (!source) return '??'
  const parts = source
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function sumEstimates(items: Schema['tables']['pm_issues']['row'][]) {
  return items.reduce((total, issue) => total + (issue.estimate ?? 0), 0)
}
