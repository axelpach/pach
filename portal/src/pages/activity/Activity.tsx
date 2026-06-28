import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { Activity as ActivityIcon, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BookmarkPlus, Bot, Building2, Clock3, FileJson, ListTree, Plus, RadioTower, Save, Trash2, X } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'
import { Button } from '../../components/pach'
import type { PachSelectOption } from '../../components/PachSelect'
import { IconTooltip } from '../../components/IconTooltip'
import { DeleteViewModal } from '../../components/DeleteViewModal'
import { FilterButton, type ActiveFilters, type FilterFieldConfig } from '../issues/IssueFilters'
import { closePopupFromOutsideClick } from '../issues/popupEvents'

type ActivityEventRow = Schema['tables']['activity_events']['row']
type OrganizationRow = Schema['tables']['organizations']['row']
type TeamRow = Schema['tables']['pm_teams']['row']
type IssueRow = Schema['tables']['pm_issues']['row']
type ProjectRow = Schema['tables']['pm_projects']['row']
type StatusRow = Schema['tables']['pm_statuses']['row']
type UserRow = Schema['tables']['users']['row']
type SavedViewRow = Schema['tables']['activity_event_saved_views']['row']
type ActivityContextField = { label: string; value: string }
type ActivityContextLookups = {
  issues: Map<string, IssueRow>
  teams: Map<string, TeamRow>
  projects: Map<string, ProjectRow>
  statuses: Map<string, StatusRow>
  users: Map<string, UserRow>
}

type SortField = 'occurredAt' | 'createdAt' | 'severity' | 'origin' | 'activityKind' | 'eventType' | 'subjectType' | 'actor' | 'source'
type SortDirection = 'asc' | 'desc'
type SortConfig = { field: SortField; direction: SortDirection }

type ActivityViewState = {
  filters: ActiveFilters
  sort: SortConfig
  dateFrom: string
  dateTo: string
}

const DEFAULT_VIEW: ActivityViewState = {
  filters: {},
  sort: { field: 'occurredAt', direction: 'desc' },
  dateFrom: '',
  dateTo: '',
}

const SORT_FIELDS: Array<{ value: SortField; label: string }> = [
  { value: 'occurredAt', label: 'occurred' },
  { value: 'createdAt', label: 'created' },
  { value: 'severity', label: 'severity' },
  { value: 'origin', label: 'origin' },
  { value: 'activityKind', label: 'kind' },
  { value: 'eventType', label: 'event type' },
  { value: 'subjectType', label: 'subject type' },
  { value: 'actor', label: 'actor' },
  { value: 'source', label: 'source' },
]

const ORIGIN_OPTIONS: PachSelectOption[] = [
  { value: 'pach_work', label: 'Pach work' },
  { value: 'organization_work', label: 'organization work' },
  { value: 'organization_user_work', label: 'organization user work' },
]

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  error: 4,
  warning: 3,
  warn: 3,
  info: 2,
  debug: 1,
}

const STATUS_DEFS = [
  { name: 'Todo', key: 'todo', type: 'unstarted', color: '#94a3b8' },
  { name: 'In Progress', key: 'in_progress', type: 'started', color: '#fbbf24' },
  { name: 'In Review', key: 'in_review', type: 'review', color: '#38bdf8' },
  { name: 'Blocked', key: 'blocked', type: 'blocked', color: '#f87171' },
  { name: 'Done', key: 'done', type: 'completed', color: '#4ade80' },
] as const

export default function Activity() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { activityEventId } = useParams<{ activityEventId: string }>()
  const [searchParams] = useSearchParams()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [events] = useQuery(z.query.activity_events.orderBy('occurredAt', 'desc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('createdAt', 'desc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [savedViews] = useQuery(z.query.activity_event_saved_views.orderBy('position', 'asc'))

  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : user?.canAccessUnscoped ?? false
  const scopedOrganizations = organizations.filter((organization) => canAccessOrganization(organization.id))
  const organizationMap = new Map(scopedOrganizations.map((organization) => [organization.id, organization]))
  const scopedEvents = events.filter((event) => canAccessOrganization(event.organizationId))
  const activitySavedViews = useMemo(
    () => savedViews
      .filter((view) => view.scope === 'personal' && view.ownerId === user?.id)
      .sort((a, b) => {
        const positionDiff = a.position - b.position
        if (positionDiff !== 0) return positionDiff
        return a.name.localeCompare(b.name)
      }),
    [savedViews, user?.id],
  )
  const selectedViewId = searchParams.get('view') ?? ''
  const activeSavedView = selectedViewId
    ? activitySavedViews.find((view) => view.id === selectedViewId) ?? null
    : null
  const activeSavedViewId = activeSavedView?.id ?? ''
  const contextLookups = useMemo<ActivityContextLookups>(() => ({
    issues: new Map(issues.map((issue) => [issue.id, issue])),
    teams: new Map(teams.map((team) => [team.id, team])),
    projects: new Map(projects.map((project) => [project.id, project])),
    statuses: new Map(statuses.map((status) => [status.id, status])),
    users: new Map(users.map((entry) => [entry.id, entry])),
  }), [issues, projects, statuses, teams, users])

  const storageKey = user ? `pach:activity:view:${user.id}` : null
  const initialView = readStoredView(storageKey)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => initialView.filters)
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => initialView.sort)
  const [dateFrom, setDateFrom] = useState(initialView.dateFrom)
  const [dateTo, setDateTo] = useState(initialView.dateTo)
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [creatingIssueForId, setCreatingIssueForId] = useState<string | null>(null)
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')
  const [savingView, setSavingView] = useState(false)
  const [updatingView, setUpdatingView] = useState(false)
  const [deleteViewModalOpen, setDeleteViewModalOpen] = useState(false)
  const [deletingView, setDeletingView] = useState(false)
  const [message, setMessage] = useState('')
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const appliedSavedViewRef = useRef<string | null>(null)
  const wasViewingSavedViewRef = useRef(false)
  const skipNextLocalViewPersistRef = useRef(false)

  function applyActivityViewState(viewState: ActivityViewState) {
    setActiveFilters(viewState.filters)
    setSortConfig(viewState.sort)
    setDateFrom(viewState.dateFrom)
    setDateTo(viewState.dateTo)
  }

  function getCurrentActivityViewState(): ActivityViewState {
    return {
      filters: copyActiveFilters(activeFilters),
      sort: sortConfig,
      dateFrom,
      dateTo,
    }
  }

  const activeSavedViewIsDirty = activeSavedView
    ? !activityViewStatesEqual(getCurrentActivityViewState(), readSavedActivityView(activeSavedView))
    : false

  useEffect(() => {
    if (!activeSavedView) {
      appliedSavedViewRef.current = null
      if (wasViewingSavedViewRef.current) {
        wasViewingSavedViewRef.current = false
        skipNextLocalViewPersistRef.current = true
        applyActivityViewState(readStoredView(storageKey))
      }
      return
    }

    wasViewingSavedViewRef.current = true
    const revisionKey = `${activeSavedView.id}:${activeSavedView.updatedAt}`
    if (appliedSavedViewRef.current === revisionKey) return
    appliedSavedViewRef.current = revisionKey
    applyActivityViewState(readSavedActivityView(activeSavedView))
  }, [activeSavedView, storageKey])

  useEffect(() => {
    if (!storageKey) return
    if (activeSavedView) return
    if (skipNextLocalViewPersistRef.current) {
      skipNextLocalViewPersistRef.current = false
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ filters: activeFilters, sort: sortConfig, dateFrom, dateTo }))
    } catch {
      // Ignore storage failures.
    }
  }, [activeFilters, activeSavedView, dateFrom, dateTo, sortConfig, storageKey])

  const filterConfigs: FilterFieldConfig[] = [
    {
      field: 'organization',
      label: 'organization',
      icon: Building2,
      options: scopedOrganizations.map((organization) => ({ value: organization.id, label: organization.name })),
    },
    {
      field: 'actor',
      label: 'actor',
      icon: Bot,
      options: uniqueOptions(scopedEvents.map((event) => activityActorKey(event))),
    },
    {
      field: 'source',
      label: 'source',
      icon: RadioTower,
      options: uniqueOptions(scopedEvents.map((event) => event.source)),
    },
    {
      field: 'subjectType',
      label: 'subject type',
      icon: ListTree,
      options: uniqueOptions(scopedEvents.map((event) => event.subjectType)),
    },
    {
      field: 'activityKind',
      label: 'kind',
      icon: ActivityIcon,
      options: uniqueOptions(scopedEvents.map((event) => event.activityKind)),
    },
    {
      field: 'origin',
      label: 'origin',
      icon: RadioTower,
      options: ORIGIN_OPTIONS,
    },
    {
      field: 'eventType',
      label: 'event type',
      icon: ActivityIcon,
      options: uniqueOptions(scopedEvents.map((event) => event.eventType)),
    },
    {
      field: 'severity',
      label: 'severity',
      icon: AlertTriangle,
      options: uniqueOptions(scopedEvents.map((event) => event.severity)),
    },
  ]

  const filteredEvents = scopedEvents
    .filter((event) => matchesFilters(event, activeFilters))
    .filter((event) => matchesDateRange(event, dateFrom, dateTo))
    .sort((a, b) => compareActivityEvents(a, b, sortConfig, organizationMap))
  const filteredEventIdsKey = filteredEvents.map((event) => event.id).join('|')

  const selectedEvent = activityEventId
    ? scopedEvents.find((event) => event.id === activityEventId) ?? null
    : null

  useEffect(() => {
    const visibleIds = new Set(filteredEvents.map((event) => event.id))
    setActiveEventId((current) => {
      if (activityEventId && visibleIds.has(activityEventId)) return activityEventId
      if (current && visibleIds.has(current)) return current
      return filteredEvents[0]?.id ?? null
    })
    // filteredEventIdsKey keeps this effect tied to visible row identity/order, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityEventId, filteredEventIdsKey])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (isTextEntryTarget(event.target)) return

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!filteredEvents.length) return
        event.preventDefault()
        const currentId = activeEventId ?? activityEventId
        const currentIndex = filteredEvents.findIndex((entry) => entry.id === currentId)
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex = currentIndex === -1
          ? direction === 1 ? 0 : filteredEvents.length - 1
          : Math.min(Math.max(currentIndex + direction, 0), filteredEvents.length - 1)
        const nextEvent = filteredEvents[nextIndex]
        if (!nextEvent) return

        setActiveEventId(nextEvent.id)
        rowRefs.current.get(nextEvent.id)?.scrollIntoView({ block: 'nearest' })
        if (activityEventId) {
          navigate(activityDetailPath(nextEvent.id), { replace: true })
        }
        return
      }

      if (event.key === 'Enter') {
        const targetId = activeEventId ?? activityEventId
        if (!targetId) return
        event.preventDefault()
        navigate(activityDetailPath(targetId), { replace: Boolean(activityEventId) })
        return
      }

      if (event.key === 'Escape' && activityEventId) {
        event.preventDefault()
        navigate(activityListPath())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeEventId, activityEventId, filteredEvents, navigate])

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
    setDateFrom('')
    setDateTo('')
  }

  function activitySearch(viewId = activeSavedViewId) {
    return viewId ? `?view=${encodeURIComponent(viewId)}` : ''
  }

  function activityListPath(viewId = activeSavedViewId) {
    return `/activity${activitySearch(viewId)}`
  }

  function activityDetailPath(eventId: string, viewId = activeSavedViewId) {
    return `/activity/${eventId}${activitySearch(viewId)}`
  }

  function selectSavedView(viewId: string) {
    navigate(activityListPath(viewId))
  }

  function selectAllActivity() {
    navigate('/activity')
  }

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
      const state = getCurrentActivityViewState()
      const existingSlugs = new Set(activitySavedViews.map((view) => view.slug))
      await z.mutate.activity_event_saved_views.create({
        id,
        ownerId: user.id,
        name,
        slug: makeUniqueSlug(slugifySavedViewName(name), existingSlugs),
        scope: 'personal',
        filters: state.filters,
        display: getActivityViewDisplay(state),
        position: activitySavedViews.length,
      })
      closeSaveViewModal()
      selectSavedView(id)
    } finally {
      setSavingView(false)
    }
  }

  async function updateActiveSavedView() {
    if (!activeSavedView || !activeSavedViewIsDirty) return

    setUpdatingView(true)
    try {
      const state = getCurrentActivityViewState()
      await z.mutate.activity_event_saved_views.update({
        id: activeSavedView.id,
        filters: state.filters,
        display: getActivityViewDisplay(state),
      })
    } finally {
      setUpdatingView(false)
    }
  }

  async function deleteActiveSavedView() {
    if (!activeSavedView || deletingView) return

    setDeletingView(true)
    try {
      await z.mutate.activity_event_saved_views.delete({ id: activeSavedView.id })
      closeDeleteViewModal()
      selectAllActivity()
    } finally {
      setDeletingView(false)
    }
  }

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

  async function createIssueFromActivity(event: ActivityEventRow) {
    if (!user) return

    setCreatingIssueForId(event.id)
    try {
      const organization = organizationMap.get(event.organizationId) ?? null
      const foundation = await ensureIssueFoundation(event.organizationId, organization)
      const nextNumber =
        issues.filter((issue) => issue.teamId === foundation.team.id).reduce((max, issue) => Math.max(max, issue.number), 0) + 1
      const issueId = crypto.randomUUID()
      const identifier = `${foundation.team.key}-${nextNumber}`
      const priority = severityToPriority(event.severity)
      const sortOrder = getTopSortOrder(priority, foundation.status.id)

      await z.mutate.pm_issues.create({
        id: issueId,
        contextCompanyId: event.organizationId,
        teamId: foundation.team.id,
        projectId: foundation.projectId,
        statusId: foundation.status.id,
        assigneeId: user.id,
        creatorId: user.id,
        identifier,
        number: nextNumber,
        title: event.summary.trim().slice(0, 180),
        description: buildIssueDescription(event, organization),
        priority,
        estimate: 4,
        sortOrder,
      })

      await z.mutate.activity_events.create({
        id: crypto.randomUUID(),
        organizationId: event.organizationId,
        eventType: 'issue_created_from_activity',
        activityKind: 'operational',
        subjectType: 'pm_issue',
        subjectId: issueId,
        subjectLabel: identifier,
        actorType: 'user',
        actorId: user.id,
        actorName: user.name ?? user.email,
        source: 'pach_app',
        severity: 'info',
        summary: `Created issue ${identifier} from activity event`,
        details: { activityEventId: event.id },
        metadata: { originActivityEventId: event.id },
      })

      navigate(`/issues/${issueId}`)
    } catch (error) {
      console.error('Create issue from activity failed', error)
      flash('issue could not be created')
    } finally {
      setCreatingIssueForId(null)
    }
  }

  async function ensureIssueFoundation(organizationId: string, organization: OrganizationRow | null) {
    const existingTeam =
      teams.find((team) => team.companyId === organizationId) ??
      teams.find((team) => !team.companyId) ??
      null

    let team: TeamRow
    let projectId = existingTeam ? projects.find((project) => project.teamId === existingTeam.id)?.id : undefined

    if (existingTeam) {
      team = existingTeam
    } else {
      const teamId = crypto.randomUUID()
      const projectIdToCreate = crypto.randomUUID()
      const key = makeUniqueTeamKey(deriveTeamKey(organization), teams)
      await z.mutate.pm_teams.create({
        id: teamId,
        companyId: organizationId,
        key,
        name: `${organization?.name ?? 'Activity'} Ops`,
        description: 'Activity-created operational work',
        color: '#00ff88',
        position: teams.length,
      })

      for (const [index, status] of STATUS_DEFS.entries()) {
        await z.mutate.pm_statuses.create({
          id: crypto.randomUUID(),
          companyId: organizationId,
          teamId,
          name: status.name,
          key: status.key,
          type: status.type,
          color: status.color,
          position: index,
        })
      }

      await z.mutate.pm_projects.create({
        id: projectIdToCreate,
        companyId: organizationId,
        teamId,
        name: 'Core',
        slug: 'core',
        description: 'Activity-created operational work',
      })

      team = { id: teamId, companyId: organizationId, key, name: `${organization?.name ?? 'Activity'} Ops`, position: teams.length, createdAt: Date.now(), updatedAt: Date.now() }
      projectId = projectIdToCreate
    }

    let status =
      statuses.find((entry) => entry.teamId === team.id && entry.type !== 'completed' && entry.type !== 'canceled') ??
      statuses.find((entry) => !entry.teamId && (!entry.companyId || entry.companyId === organizationId) && entry.type !== 'completed' && entry.type !== 'canceled') ??
      null

    if (!status) {
      const statusId = crypto.randomUUID()
      await z.mutate.pm_statuses.create({
        id: statusId,
        companyId: organizationId,
        teamId: team.id,
        name: STATUS_DEFS[0].name,
        key: STATUS_DEFS[0].key,
        type: STATUS_DEFS[0].type,
        color: STATUS_DEFS[0].color,
        position: 0,
      })
      status = { id: statusId, companyId: organizationId, teamId: team.id, name: STATUS_DEFS[0].name, key: STATUS_DEFS[0].key, type: STATUS_DEFS[0].type, position: 0, createdAt: Date.now(), updatedAt: Date.now() }
    }

    return { team, status, projectId }
  }

  function getTopSortOrder(priority: number, statusId: string) {
    const bucket = issues
      .filter((issue) => issue.priority === priority && issue.statusId === statusId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const minSortOrder = bucket[0]?.sortOrder
    return minSortOrder == null ? 1000 : minSortOrder - 1024
  }

  function flash(next: string) {
    setMessage(next)
    window.setTimeout(() => setMessage(''), 2800)
  }

  return (
    <div className="relative flex h-full min-h-0 bg-pit text-fg-1">
      <ActivityViewsSidebar
        views={activitySavedViews}
        activeViewId={activeSavedViewId}
        allCount={scopedEvents.length}
        onSelectAll={selectAllActivity}
        onSelectView={selectSavedView}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-auto py-6">
          <div className="mb-4 flex flex-col gap-3 px-4 md:gap-4 md:px-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-wrap items-start gap-2">
              <FilterButton
                activeFilters={activeFilters}
                filterConfigs={filterConfigs}
                onFilterChange={setFilterField}
                onClearAll={clearAllFilters}
                chipsPlacement="below"
                afterButton={(
                  <>
                    <DateControl label="from" value={dateFrom} onChange={setDateFrom} />
                    <DateControl label="to" value={dateTo} onChange={setDateTo} />
                  </>
                )}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <div className="mr-1 font-mono text-xs uppercase tracking-label text-fg-3">
                {filteredEvents.length} visible
              </div>
              {activeSavedView ? (
                <>
                  <IconTooltip
                    label={
                      activeSavedViewIsDirty
                        ? `update view - ${activeSavedView.name.toLowerCase()}`
                        : 'view is up to date'
                    }
                  >
                    <button
                      onClick={updateActiveSavedView}
                      disabled={!activeSavedViewIsDirty || updatingView}
                      aria-label={
                        activeSavedViewIsDirty
                          ? `update view - ${activeSavedView.name.toLowerCase()}`
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
                  <IconTooltip label={`delete view - ${activeSavedView.name.toLowerCase()}`}>
                    <button
                      onClick={() => setDeleteViewModalOpen(true)}
                      disabled={deletingView}
                      aria-label={`delete view - ${activeSavedView.name.toLowerCase()}`}
                      className="flex h-6 w-6 items-center justify-center border border-fail/20 bg-fail/5 text-fail transition hover:border-fail/34 hover:bg-fail/10 disabled:opacity-40 disabled:hover:border-fail/20 disabled:hover:bg-fail/5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </IconTooltip>
                </>
              ) : (
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
              <SortMenu value={sortConfig} onChange={setSortConfig} />
            </div>
          </div>
          {message ? (
            <div className="mx-4 mb-4 border border-fail/20 bg-fail/5 px-3 py-2 font-mono text-xs text-fail md:mx-6">{message}</div>
          ) : null}

          <div className="border-y border-edge/12">
            {filteredEvents.map((event) => {
              const organization = organizationMap.get(event.organizationId)
              return (
                <ActivityRow
                  key={event.id}
                  event={event}
                  organization={organization ?? null}
                  displayContext={activityDisplayContext(event, contextLookups)}
                  selected={activityEventId === event.id}
                  active={activeEventId === event.id}
                  rowRef={(node) => {
                    if (node) rowRefs.current.set(event.id, node)
                    else rowRefs.current.delete(event.id)
                  }}
                  onFocus={() => setActiveEventId(event.id)}
                  onSelect={() => {
                    setActiveEventId(event.id)
                    navigate(activityDetailPath(event.id), { replace: Boolean(activityEventId) })
                  }}
                />
              )
            })}
          </div>

          {filteredEvents.length === 0 ? (
            <div className="mx-4 mt-6 border border-dashed border-edge/15 py-10 text-center font-mono text-sm text-fg-4 md:mx-6">
              no activity events
            </div>
          ) : null}
        </div>
      </main>

      {selectedEvent ? (
        <ActivityDetail
          event={selectedEvent}
          organization={organizationMap.get(selectedEvent.organizationId) ?? null}
          context={activityDisplayContext(selectedEvent, contextLookups)}
          creatingIssue={creatingIssueForId === selectedEvent.id}
          onClose={() => navigate(activityListPath())}
          onCreateIssue={() => void createIssueFromActivity(selectedEvent)}
        />
      ) : null}

      {saveViewModalOpen ? (
        <SaveViewModal
          name={saveViewName}
          saving={savingView}
          onNameChange={setSaveViewName}
          onClose={closeSaveViewModal}
          onSubmit={submitSavedView}
        />
      ) : null}

      {deleteViewModalOpen && activeSavedView ? (
        <DeleteViewModal
          viewName={activeSavedView.name}
          deleting={deletingView}
          onClose={closeDeleteViewModal}
          onConfirm={deleteActiveSavedView}
        />
      ) : null}
    </div>
  )
}

function ActivityViewsSidebar({
  views,
  activeViewId,
  allCount,
  onSelectAll,
  onSelectView,
}: {
  views: SavedViewRow[]
  activeViewId: string
  allCount: number
  onSelectAll: () => void
  onSelectView: (viewId: string) => void
}) {
  return (
    <aside className="hidden shrink-0 border-r border-edge/12 bg-pit-2/60 px-2 py-4 md:flex md:w-[200px] md:flex-col">
      <div className="mb-5 px-3">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
          <ActivityIcon className="h-3.5 w-3.5 text-accent" />
          activity
        </div>
        <h1 className="mt-1 font-mono text-2xl font-bold lowercase text-fg-1">activity</h1>
      </div>
      <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">views</div>
      <div className="space-y-1">
        <ActivityViewNavButton
          active={!activeViewId}
          label="all activity"
          meta={`${allCount}`}
          onClick={onSelectAll}
        />
        {views.map((view) => (
          <ActivityViewNavButton
            key={view.id}
            active={activeViewId === view.id}
            label={view.name.toLowerCase()}
            onClick={() => onSelectView(view.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function ActivityViewNavButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center justify-between gap-2 border-l px-3 py-1.5 text-left font-mono text-xs lowercase transition ${
        active
          ? 'border-accent bg-accent-fill/8 text-accent'
          : 'border-transparent text-fg-3 hover:border-edge/20 hover:bg-accent-fill/4 hover:text-fg-1'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {meta ? <span className="shrink-0 text-[10px] uppercase tracking-label text-fg-4">{meta}</span> : null}
    </button>
  )
}

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
  function handleSubmit(event: FormEvent) {
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
            views - save
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
              placeholder="$ company progress"
              className="w-full border border-edge/15 bg-rim px-3 py-2 text-sm text-fg-1 outline-none placeholder:text-fg-4 focus:border-accent focus:shadow-glow-xs"
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
            {saving ? 'saving...' : 'save view'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ActivityRow({
  event,
  organization,
  displayContext,
  selected,
  active,
  rowRef,
  onFocus,
  onSelect,
}: {
  event: ActivityEventRow
  organization: OrganizationRow | null
  displayContext: ReturnType<typeof activityDisplayContext>
  selected: boolean
  active: boolean
  rowRef: (node: HTMLButtonElement | null) => void
  onFocus: () => void
  onSelect: () => void
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      aria-current={selected ? 'true' : undefined}
      onFocus={onFocus}
      onClick={onSelect}
      className={`group relative grid w-full min-w-0 cursor-pointer grid-cols-[16px_54px_86px_minmax(0,1fr)_64px] items-center gap-2 border-t border-edge/6 px-3 py-2 text-left font-mono text-xs transition first:border-t-0 focus:outline-none focus-visible:bg-accent-fill/6 sm:grid-cols-[16px_64px_118px_minmax(0,1fr)_88px_64px] md:px-4 lg:grid-cols-[16px_72px_150px_minmax(0,1fr)_132px_94px_64px] ${
        selected
          ? 'bg-accent-fill/8 text-fg-1'
          : active
            ? 'bg-info/5 text-fg-1'
          : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
      }`}
    >
      <span className={`pointer-events-none absolute inset-y-1 left-0 w-px ${selected ? 'bg-accent' : active ? 'bg-info/70' : 'bg-transparent'}`} />
      <SeverityMark severity={event.severity} />
      <span className="min-w-0 truncate text-xs text-accent/80 tabular-nums">
        {displayContext.subjectMeta}
      </span>
      <span className={`min-w-0 truncate text-[10px] uppercase tracking-label ${activityEventToneClass(event)}`}>
        {activityEventLabel(event)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{displayContext.subjectLabel}</span>
      <span className="hidden min-w-0 truncate text-[10px] uppercase tracking-label text-fg-4 lg:block">
        {organization?.name ?? event.organizationId}
      </span>
      <span className="hidden min-w-0 truncate text-[10px] uppercase tracking-label text-fg-4 sm:block">{displayContext.actorLabel}</span>
      <span className="shrink-0 whitespace-nowrap text-right text-[10px] uppercase tracking-label text-fg-4">{formatMainRowDate(event.occurredAt)}</span>
    </button>
  )
}

function ActivityDetail({
  event,
  organization,
  context,
  creatingIssue,
  onClose,
  onCreateIssue,
}: {
  event: ActivityEventRow
  organization: OrganizationRow | null
  context: ReturnType<typeof activityDisplayContext>
  creatingIssue: boolean
  onClose: () => void
  onCreateIssue: () => void
}) {
  const contextFields = context.fields.filter((field) => field.label !== 'issue' && field.label !== 'title')
  const technicalFields = [
    { label: 'created', value: formatDateTime(event.createdAt) },
    { label: 'source', value: event.source },
    { label: 'actor type', value: event.actorType },
    { label: 'subject type', value: event.subjectType },
    { label: 'subject id', value: event.subjectId ?? '-' },
  ]
  const summary = event.summary.trim()

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-edge/18 bg-pit-2 shadow-terminal-overlay md:w-[430px] md:max-w-none">
      <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 text-[10px] uppercase tracking-label text-accent">
            detail
          </span>
          <span className={`truncate text-[10px] uppercase tracking-label ${activityEventToneClass(event)}`}>{activityEventLabel(event)}</span>
        </div>
        <button onClick={onClose} className="text-fg-4 transition hover:text-fg-1" title="close" aria-label="close detail">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="border-b border-edge/12 pb-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 font-mono">
                <SeverityMark severity={event.severity} />
                <span className="min-w-0 truncate text-xs text-accent/80 tabular-nums">{context.subjectMeta}</span>
                <span className={`min-w-0 truncate text-[10px] uppercase tracking-label ${activityEventToneClass(event)}`}>
                  {activityEventLabel(event)}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold leading-tight text-fg-1">{context.subjectLabel}</h2>
              {summary && summary !== context.subjectLabel ? (
                <p className="mt-2 text-sm leading-relaxed text-fg-3">{summary}</p>
              ) : null}
            </div>
            <Button
              kind="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={onCreateIssue}
              disabled={creatingIssue}
              className="px-2.5 py-1.5 text-[10px]"
            >
              issue
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DetailFact label="kind" value={event.activityKind} />
            <DetailFact label="origin" value={activityOriginLabel(event.origin)} />
            <DetailFact label="occurred" value={formatDateTime(event.occurredAt)} />
            <DetailFact label="actor" value={context.actorLabel} />
            <DetailFact label="organization" value={organization?.name ?? event.organizationId} />
          </div>
        </div>

        {contextFields.length > 0 ? <ContextFields fields={contextFields} /> : null}

        <TechnicalDetails fields={technicalFields} details={event.details} metadata={event.metadata} />
      </div>
    </aside>
  )
}

function ContextFields({ fields }: { fields: ActivityContextField[] }) {
  return (
    <div className="mt-5 border-b border-edge/12 pb-5">
      <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">
        <ListTree className="h-3 w-3 text-accent" />
        context
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {fields.map((field) => (
          <DetailFact key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    </div>
  )
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</div>
      <div className="mt-1 min-w-0 truncate font-mono text-xs text-fg-1">{value || '-'}</div>
    </div>
  )
}

function TechnicalDetails({
  fields,
  details,
  metadata,
}: {
  fields: ActivityContextField[]
  details: unknown
  metadata: unknown
}) {
  return (
    <details className="mt-5 group/technical">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4 transition hover:text-fg-2">
        <FileJson className="h-3 w-3 text-accent" />
        technical
        <span className="ml-auto text-fg-4 group-open/technical:hidden">show</span>
        <span className="ml-auto hidden text-fg-4 group-open/technical:inline">hide</span>
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <DetailField key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
      <JsonBlock title="details" value={details} />
      <JsonBlock title="metadata" value={metadata} />
    </details>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-edge/12 bg-rim px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</div>
      <div className="mt-1 min-w-0 break-words font-mono text-xs text-fg-1">{value || '-'}</div>
    </div>
  )
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">
        <FileJson className="h-3 w-3 text-accent" />
        {title}
      </div>
      <pre className="max-h-[260px] overflow-auto border border-edge/12 bg-void p-3 font-mono text-[11px] leading-relaxed text-fg-2">
        {formatJson(value)}
      </pre>
    </div>
  )
}

function DateControl({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 border border-edge/15 bg-pit-3 px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
      <Clock3 className="h-3 w-3 text-fg-4" />
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-xs normal-case tracking-normal text-fg-1 outline-none"
      />
    </label>
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

  const currentLabel = SORT_FIELDS.find((field) => field.value === value.field)?.label ?? 'occurred'
  const tooltipLabel = `sort - ${currentLabel} ${value.direction}`

  return (
    <div className="relative" ref={ref}>
      <IconTooltip label={tooltipLabel} disabled={open}>
        <button
          onClick={() => setOpen((next) => !next)}
          aria-label={tooltipLabel}
          className={`flex h-6 w-6 items-center justify-center border transition ${
            open
              ? 'border-edge/35 bg-accent-fill/6 text-accent shadow-glow-xs'
              : 'border-edge/25 bg-pit-3 text-accent hover:border-edge/35 hover:text-accent'
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
              return (
                <button
                  key={field.value}
                  onClick={() => {
                    onChange({
                      field: field.value,
                      direction: isActive ? oppositeSortDirection(value.direction) : defaultSortDirection(field.value),
                    })
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-xs lowercase transition ${
                    isActive
                      ? 'bg-accent-fill/8 text-accent'
                      : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
                  }`}
                >
                  <span className="truncate">{field.label}</span>
                  {isActive && (
                    value.direction === 'asc'
                      ? <ArrowUp className="h-3 w-3 shrink-0" />
                      : <ArrowDown className="h-3 w-3 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function defaultSortDirection(field: SortField): SortDirection {
  return field === 'occurredAt' || field === 'createdAt' || field === 'severity' ? 'desc' : 'asc'
}

function oppositeSortDirection(direction: SortDirection): SortDirection {
  return direction === 'asc' ? 'desc' : 'asc'
}

function SeverityMark({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase()
  const tone =
    normalized === 'critical' || normalized === 'error'
      ? { ring: 'border-fail/45 bg-fail/5', dot: 'bg-fail' }
      : normalized === 'warning' || normalized === 'warn'
        ? { ring: 'border-warn/45 bg-warn/5', dot: 'bg-warn' }
        : normalized === 'debug'
          ? { ring: 'border-fg-4/45 bg-fg-4/5', dot: 'bg-fg-4' }
          : { ring: 'border-info/45 bg-info/5', dot: 'bg-info' }
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${tone.ring}`}
      title={normalized}
      aria-label={normalized}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
    </span>
  )
}

function matchesFilters(event: ActivityEventRow, filters: ActiveFilters) {
  for (const [field, values] of Object.entries(filters)) {
    if (!values.length) continue
    switch (field) {
      case 'organization':
        if (!values.includes(event.organizationId)) return false
        break
      case 'actor':
        if (!values.includes(activityActorKey(event))) return false
        break
      case 'source':
        if (!values.includes(event.source)) return false
        break
      case 'subjectType':
        if (!values.includes(event.subjectType)) return false
        break
      case 'eventType':
        if (!values.includes(event.eventType)) return false
        break
      case 'severity':
        if (!values.includes(event.severity)) return false
        break
      case 'activityKind':
        if (!values.includes(event.activityKind)) return false
        break
      case 'origin':
        if (!values.includes(event.origin)) return false
        break
    }
  }
  return true
}

function matchesDateRange(event: ActivityEventRow, dateFrom: string, dateTo: string) {
  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00`).getTime()
    if (Number.isFinite(start) && event.occurredAt < start) return false
  }
  if (dateTo) {
    const end = new Date(`${dateTo}T23:59:59.999`).getTime()
    if (Number.isFinite(end) && event.occurredAt > end) return false
  }
  return true
}

function compareActivityEvents(
  a: ActivityEventRow,
  b: ActivityEventRow,
  sort: SortConfig,
  organizationMap: Map<string, OrganizationRow>,
) {
  let comparison = 0
  switch (sort.field) {
    case 'occurredAt':
      comparison = a.occurredAt - b.occurredAt
      break
    case 'createdAt':
      comparison = a.createdAt - b.createdAt
      break
    case 'severity':
      comparison = severityWeight(a.severity) - severityWeight(b.severity)
      break
    case 'activityKind':
      comparison = a.activityKind.localeCompare(b.activityKind)
      break
    case 'origin':
      comparison = a.origin.localeCompare(b.origin)
      break
    case 'eventType':
      comparison = a.eventType.localeCompare(b.eventType)
      break
    case 'subjectType':
      comparison = a.subjectType.localeCompare(b.subjectType)
      break
    case 'actor':
      comparison = activityActorLabel(a).localeCompare(activityActorLabel(b))
      break
    case 'source':
      comparison = a.source.localeCompare(b.source)
      break
  }
  if (comparison === 0) {
    comparison =
      (organizationMap.get(a.organizationId)?.name ?? a.organizationId)
        .localeCompare(organizationMap.get(b.organizationId)?.name ?? b.organizationId) ||
      a.summary.localeCompare(b.summary) ||
      a.id.localeCompare(b.id)
  }
  return sort.direction === 'asc' ? comparison : -comparison
}

function activityActorKey(event: ActivityEventRow) {
  return event.actorName || event.actorId || event.actorType || 'unknown'
}

function activityDisplayContext(event: ActivityEventRow, lookups: ActivityContextLookups) {
  const actorLabel = activityActorLabel(event, lookups.users)
  let subjectLabel = activitySubjectLabel(event)
  let subjectMeta = event.subjectType
  const fields: ActivityContextField[] = []

  if (event.subjectType === 'pm_issue' && event.subjectId) {
    const issue = lookups.issues.get(event.subjectId)
    if (issue) {
      const team = lookups.teams.get(issue.teamId)
      const project = issue.projectId ? lookups.projects.get(issue.projectId) : null
      const status = lookups.statuses.get(issue.statusId)
      const assignee = issue.assigneeId ? lookups.users.get(issue.assigneeId) : null
      subjectLabel = issue.title
      subjectMeta = issue.identifier
      fields.push(
        { label: 'issue', value: issue.identifier },
        { label: 'title', value: issue.title },
        { label: 'status', value: status?.name ?? issue.statusId },
        { label: 'team', value: team?.name ?? issue.teamId },
        { label: 'project', value: project?.name ?? '-' },
        { label: 'assignee', value: assignee ? userDisplayName(assignee) : '-' },
        { label: 'priority', value: issuePriorityLabel(issue.priority) },
      )
    } else {
      subjectMeta = event.subjectLabel ? `${event.subjectType} / ${event.subjectLabel}` : event.subjectType
    }
  }

  return { actorLabel, subjectLabel, subjectMeta, fields }
}

function activityActorLabel(event: ActivityEventRow, users?: Map<string, UserRow>) {
  if (event.actorName) return event.actorName
  if (event.actorId) return users?.get(event.actorId) ? userDisplayName(users.get(event.actorId)!) : event.actorId
  return event.actorType || 'unknown'
}

function activitySubjectLabel(event: ActivityEventRow) {
  return event.subjectLabel || event.subjectId || event.subjectType
}

function activityEventLabel(event: ActivityEventRow) {
  const subject = event.subjectType === 'pm_issue'
    ? 'issue'
    : event.subjectType.replace(/^pm_/, '').replace(/_/g, ' ')
  const action = event.eventType
    .replace(/^issue_/, '')
    .replace(/^pm_issue_/, '')
    .replace(/_/g, ' ')
  return capitalizeActivityLabel(`${subject} ${action}`.trim())
}

function activityEventToneClass(event: ActivityEventRow) {
  const eventType = event.eventType.toLowerCase()
  if (eventType === 'completed' || eventType === 'sent' || eventType === 'published') return 'text-accent'
  if (eventType === 'failed' || eventType === 'canceled' || eventType === 'error') return 'text-fail'
  if (eventType === 'created') return 'text-info'
  return 'text-fg-3'
}

function activityOriginLabel(origin: string) {
  return ORIGIN_OPTIONS.find((option) => option.value === origin)?.label ?? origin
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function capitalizeActivityLabel(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function userDisplayName(user: UserRow) {
  return user.name || user.email
}

function issuePriorityLabel(priority: number) {
  if (priority === 1) return 'urgent'
  if (priority === 2) return 'high'
  if (priority === 3) return 'normal'
  if (priority === 4) return 'low'
  return 'none'
}

function severityWeight(severity: string) {
  return SEVERITY_ORDER[severity.toLowerCase()] ?? 2
}

function severityToPriority(severity: string) {
  const normalized = severity.toLowerCase()
  if (normalized === 'critical' || normalized === 'error') return 1
  if (normalized === 'warning' || normalized === 'warn') return 2
  if (normalized === 'debug') return 4
  return 3
}

function uniqueOptions(values: string[]) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }))
}

function deriveTeamKey(organization: OrganizationRow | null) {
  const raw = (organization?.project ?? organization?.name ?? 'ACT')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase()
  return raw || 'ACT'
}

function makeUniqueTeamKey(base: string, teams: TeamRow[]) {
  const existing = new Set(teams.map((team) => team.key.toUpperCase()))
  if (!existing.has(base)) return base
  let counter = 2
  while (existing.has(`${base}${counter}`)) counter += 1
  return `${base}${counter}`
}

function buildIssueDescription(event: ActivityEventRow, organization: OrganizationRow | null) {
  const subject = activitySubjectLabel(event)
  return [
    `Activity event: ${event.eventType}`,
    '',
    `Organization: ${organization?.name ?? event.organizationId}`,
    `Occurred: ${formatDateTime(event.occurredAt)}`,
    `Severity: ${event.severity}`,
    `Actor: ${activityActorLabel(event)}`,
    `Source: ${event.source}`,
    `Subject: ${event.subjectType}${subject ? ` / ${subject}` : ''}`,
    '',
    'Details:',
    '```json',
    formatJson(event.details),
    '```',
    '',
    'Metadata:',
    '```json',
    formatJson(event.metadata),
    '```',
  ].join('\n')
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMainRowDate(value: number) {
  const date = new Date(value)
  const now = new Date()
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
  }).format(date)
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function readStoredView(storageKey: string | null): ActivityViewState {
  if (!storageKey || typeof window === 'undefined') return DEFAULT_VIEW
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return DEFAULT_VIEW
    return parseActivityViewState(JSON.parse(raw))
  } catch {
    return DEFAULT_VIEW
  }
}

function readSavedActivityView(view: SavedViewRow): ActivityViewState {
  return parseActivityViewState({
    filters: view.filters,
    display: view.display,
  })
}

function getActivityViewDisplay(state: ActivityViewState): Record<string, unknown> {
  return {
    sort: state.sort,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
  }
}

function activityViewStatesEqual(a: ActivityViewState, b: ActivityViewState) {
  return JSON.stringify(normalizeActivityViewState(a)) === JSON.stringify(normalizeActivityViewState(b))
}

function normalizeActivityViewState(state: ActivityViewState) {
  const filterEntries = Object.entries(state.filters)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => [field, [...values].sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b))

  return {
    filters: Object.fromEntries(filterEntries),
    sort: state.sort,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
  }
}

function parseActivityViewState(raw: unknown): ActivityViewState {
  const parsed = isRecord(raw) ? raw : {}
  const display = isRecord(parsed.display) ? parsed.display : parsed
  return {
    filters: isFilters(parsed.filters) ? parsed.filters : {},
    sort: isSortConfig(display.sort) ? display.sort : DEFAULT_VIEW.sort,
    dateFrom: typeof display.dateFrom === 'string' ? display.dateFrom : '',
    dateTo: typeof display.dateTo === 'string' ? display.dateTo : '',
  }
}

function copyActiveFilters(filters: ActiveFilters): ActiveFilters {
  const copy: ActiveFilters = {}
  for (const [field, values] of Object.entries(filters)) {
    if (values.length) copy[field] = [...values]
  }
  return copy
}

function isFilters(value: unknown): value is ActiveFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((entry) => Array.isArray(entry) && entry.every((item) => typeof item === 'string'))
}

function isSortConfig(value: unknown): value is SortConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<SortConfig>
  return SORT_FIELDS.some((field) => field.value === candidate.field) && (candidate.direction === 'asc' || candidate.direction === 'desc')
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
