import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { ChevronDown, ChevronRight, GripVertical, Menu, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'
import { PachSelect } from '../../components/PachSelect'
import { requestGlobalIssueComposer } from './IssueComposer'

export type TrackerSection =
  | { kind: 'all' }
  | { kind: 'view'; viewId: string }
  | { kind: 'team'; teamId: string; tab: 'issues' | 'projects' }

export type TrackerContext = {
  section: TrackerSection
  setSection: (section: TrackerSection) => void
  requestComposer: () => void
}

export function useTrackerContext(): TrackerContext {
  return useOutletContext<TrackerContext>()
}

type TeamModalState =
  | { mode: 'create' }
  | { mode: 'edit'; teamId: string }
  | null

type SavedViewRow = Schema['tables']['pm_saved_views']['row']
type SavedViewDropPosition = 'before' | 'after'
type SavedViewDropTarget = {
  viewId: string
  position: SavedViewDropPosition
}

export default function IssuesLayout() {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [issues] = useQuery(z.query.pm_issues)
  const [projects] = useQuery(z.query.pm_projects)
  const [statuses] = useQuery(z.query.pm_statuses)
  const [labels] = useQuery(z.query.pm_labels)
  const [savedViews] = useQuery(z.query.pm_saved_views.orderBy('position', 'asc'))
  const [taskTriggers] = useQuery(z.query.pm_task_triggers)
  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : user?.canAccessUnscoped ?? false
  const scopedIssues = useMemo(
    () => issues.filter((issue) => canAccessOrganization(issue.contextCompanyId)),
    [issues, accessibleOrganizationIds, user?.canAccessUnscoped],
  )
  const canAccessSavedView = (view: Schema['tables']['pm_saved_views']['row']) =>
    view.ownerId === user?.id || canAccessOrganization(view.companyId)
  const scopedSavedViews = useMemo(
    () => savedViews.filter(canAccessSavedView),
    [savedViews, accessibleOrganizationIds, user?.canAccessUnscoped, user?.id],
  )
  const visibleTeams = useMemo(
    () => teams.filter((team) =>
      user?.canAccessUnscoped || scopedIssues.some((issue) => issue.teamId === team.id),
    ),
    [teams, scopedIssues, user?.canAccessUnscoped],
  )

  const sidebarStorageKey = user ? `pach:issues:sidebar:${user.id}` : null
  const initialSidebar = readStoredSidebar(sidebarStorageKey)

  const [section, setSectionState] = useState<TrackerSection>(initialSidebar.section)
  const [teamsSectionCollapsed, setTeamsSectionCollapsed] = useState(initialSidebar.teamsSectionCollapsed)
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => new Set(initialSidebar.collapsedTeams))
  const [teamModal, setTeamModal] = useState<TeamModalState>(null)
  const [teamDraftName, setTeamDraftName] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState(false)
  const [replacementTeamId, setReplacementTeamId] = useState('')
  const [teamDeleteStep, setTeamDeleteStep] = useState(false)
  const [mobileTrackerOpen, setMobileTrackerOpen] = useState(false)
  const [viewDragId, setViewDragId] = useState<string | null>(null)
  const [viewDropTarget, setViewDropTarget] = useState<SavedViewDropTarget | null>(null)
  const suppressNextViewUrlSyncRef = useRef(false)
  const replacementTeams = useMemo(
    () => teamModal?.mode === 'edit' ? teams.filter((team) => team.id !== teamModal.teamId) : [],
    [teams, teamModal],
  )
  const personalSavedViews = useMemo(
    () => scopedSavedViews
      .filter((view) => view.scope === 'personal' && view.ownerId === user?.id && view.slug !== 'all-issues')
      .sort((a, b) => {
        const positionDiff = a.position - b.position
        if (positionDiff !== 0) return positionDiff
        return a.name.localeCompare(b.name)
      }),
    [scopedSavedViews, user?.id],
  )

  // close mobile tracker on route change
  useEffect(() => {
    setMobileTrackerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileTrackerOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileTrackerOpen(false)
    }
    const previousBodyOverflow = document.body.style.overflow
    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
    }
  }, [mobileTrackerOpen])

  // setSection from any child navigates back to the list view when triggered from /issues/:id
  function setSection(next: TrackerSection) {
    suppressNextViewUrlSyncRef.current = next.kind !== 'view'
    setSectionState(next)
    const target = next.kind === 'view' ? `/issues?view=${next.viewId}` : '/issues'
    if (location.pathname !== '/issues' || location.search !== (next.kind === 'view' ? `?view=${next.viewId}` : '')) {
      navigate(target)
    }
  }

  function selectSection(next: TrackerSection) {
    setSection(next)
    setMobileTrackerOpen(false)
  }

  function navigateFromTracker(to: string) {
    navigate(to)
    setMobileTrackerOpen(false)
  }

  function requestComposer() {
    requestGlobalIssueComposer()
  }

  async function reorderSavedView(
    draggedViewId: string,
    targetViewId: string,
    position: SavedViewDropPosition,
  ) {
    if (draggedViewId === targetViewId) return

    const dragged = personalSavedViews.find((view) => view.id === draggedViewId)
    const target = personalSavedViews.find((view) => view.id === targetViewId)
    if (!dragged || !target) return

    const withoutDragged = personalSavedViews.filter((view) => view.id !== draggedViewId)
    const targetIndex = withoutDragged.findIndex((view) => view.id === targetViewId)
    if (targetIndex === -1) return

    const nextIndex = position === 'before' ? targetIndex : targetIndex + 1
    const reordered = [...withoutDragged]
    reordered.splice(nextIndex, 0, dragged)

    await Promise.all(
      reordered.map((view, index) => {
        if (view.position === index) return Promise.resolve()
        return z.mutate.pm_saved_views.update({ id: view.id, position: index })
      }),
    )
  }

  function handleSavedViewDragStart(event: DragEvent, view: SavedViewRow) {
    setViewDragId(view.id)
    setViewDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', view.id)
  }

  function handleSavedViewDragOver(event: DragEvent, view: SavedViewRow) {
    if (!viewDragId || viewDragId === view.id) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const rect = event.currentTarget.getBoundingClientRect()
    const position: SavedViewDropPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setViewDropTarget((current) => (
      current?.viewId === view.id && current.position === position
        ? current
        : { viewId: view.id, position }
    ))
  }

  function handleSavedViewDragLeave(event: DragEvent, view: SavedViewRow) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setViewDropTarget((current) => current?.viewId === view.id ? null : current)
  }

  async function handleSavedViewDrop(event: DragEvent, view: SavedViewRow) {
    event.preventDefault()
    const draggedViewId = viewDragId ?? event.dataTransfer.getData('text/plain')
    const target = viewDropTarget?.viewId === view.id
      ? viewDropTarget
      : { viewId: view.id, position: 'after' as SavedViewDropPosition }

    setViewDragId(null)
    setViewDropTarget(null)
    await reorderSavedView(draggedViewId, target.viewId, target.position)
  }

  function handleSavedViewDragEnd() {
    setViewDragId(null)
    setViewDropTarget(null)
  }

  function toggleTeam(teamId: string) {
    setCollapsedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  function openCreateTeamModal() {
    setTeamDraftName('')
    setTeamModal({ mode: 'create' })
  }

  function openEditTeamModal(team: Schema['tables']['pm_teams']['row']) {
    setTeamDraftName(team.name)
    setReplacementTeamId(teams.find((entry) => entry.id !== team.id)?.id ?? '')
    setTeamModal({ mode: 'edit', teamId: team.id })
  }

  function closeTeamModal() {
    setTeamModal(null)
    setTeamDraftName('')
    setSavingTeam(false)
    setDeletingTeam(false)
    setReplacementTeamId('')
    setTeamDeleteStep(false)
  }

  useEffect(() => {
    if (teamModal?.mode !== 'edit') return
    if (replacementTeams.some((team) => team.id === replacementTeamId)) return
    setReplacementTeamId(replacementTeams[0]?.id ?? '')
  }, [replacementTeamId, replacementTeams, teamModal])

  function deriveTeamKey(name: string, teamIdToIgnore?: string) {
    const cleanedWords = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

    let base =
      cleanedWords.length > 1
        ? cleanedWords.map((word) => word[0]).join('').slice(0, 4)
        : (cleanedWords[0] ?? 'TEAM').slice(0, 4)

    if (!base) base = 'TEAM'

    const existingKeys = new Set(
      teams
        .filter((team) => team.id !== teamIdToIgnore)
        .map((team) => team.key.toUpperCase()),
    )

    if (!existingKeys.has(base)) return base

    let counter = 2
    while (existingKeys.has(`${base}${counter}`)) counter += 1
    return `${base}${counter}`
  }

  async function submitTeamModal() {
    const trimmedName = teamDraftName.trim()
    if (!trimmedName) return

    setSavingTeam(true)
    try {
      if (teamModal?.mode === 'create') {
        const teamId = crypto.randomUUID()
        const projectId = crypto.randomUUID()
        const teamKey = deriveTeamKey(trimmedName)
        const statusDefs = [
          { id: crypto.randomUUID(), name: 'Todo', key: 'todo', type: 'unstarted', color: '#94a3b8' },
          { id: crypto.randomUUID(), name: 'In Progress', key: 'in_progress', type: 'started', color: '#fbbf24' },
          { id: crypto.randomUUID(), name: 'In Review', key: 'in_review', type: 'review', color: '#38bdf8' },
          { id: crypto.randomUUID(), name: 'Blocked', key: 'blocked', type: 'blocked', color: '#f87171' },
          { id: crypto.randomUUID(), name: 'Done', key: 'done', type: 'completed', color: '#4ade80' },
        ] as const

        await z.mutate.pm_teams.create({
          id: teamId,
          key: teamKey,
          name: trimmedName,
          position: teams.length,
        })

        for (const [index, status] of statusDefs.entries()) {
          await z.mutate.pm_statuses.create({
            id: status.id,
            teamId,
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
          description: `${trimmedName} core roadmap`,
        })

        setSection({ kind: 'team', teamId, tab: 'issues' })
      } else if (teamModal?.mode === 'edit') {
        await z.mutate.pm_teams.update({
          id: teamModal.teamId,
          name: trimmedName,
        })
      }
      closeTeamModal()
    } finally {
      setSavingTeam(false)
    }
  }

  async function deleteTeam() {
    if (teamModal?.mode !== 'edit' || deletingTeam) return

    const teamId = teamModal.teamId
    const team = teams.find((entry) => entry.id === teamId)
    const targetTeam = replacementTeams.find((entry) => entry.id === replacementTeamId)
    if (!targetTeam) return

    const affectedIssues = scopedIssues
      .filter((issue) => issue.teamId === teamId)
      .sort((a, b) => {
        const numberDiff = a.number - b.number
        if (numberDiff !== 0) return numberDiff
        const createdDiff = a.createdAt - b.createdAt
        if (createdDiff !== 0) return createdDiff
        return a.id.localeCompare(b.id)
      })
    const targetBaseNumber = issues
      .filter((issue) => issue.teamId === targetTeam.id)
      .reduce((max, issue) => Math.max(max, issue.number), 0)
    const issueReassignments = affectedIssues.map((issue, index) => {
      const number = targetBaseNumber + index + 1
      return {
        id: issue.id,
        number,
        identifier: `${targetTeam.key}-${number}`,
      }
    })
    const affectedProjectIds = projects.filter((project) => project.teamId === teamId).map((project) => project.id)
    const affectedStatusIds = statuses.filter((status) => status.teamId === teamId).map((status) => status.id)
    const affectedLabelIds = labels.filter((label) => label.teamId === teamId).map((label) => label.id)
    const affectedSavedViewIds = savedViews.filter((view) => view.teamId === teamId).map((view) => view.id)
    const affectedTaskTriggerIds = taskTriggers.filter((trigger) => trigger.teamId === teamId).map((trigger) => trigger.id)

    setDeletingTeam(true)
    try {
      await z.mutate.pm_teams.delete({
        id: teamId,
        targetTeamId: targetTeam.id,
        issueReassignments,
        projectIds: affectedProjectIds,
        statusIds: affectedStatusIds,
        labelIds: affectedLabelIds,
        savedViewIds: affectedSavedViewIds,
        taskTriggerIds: affectedTaskTriggerIds,
      })
      setCollapsedTeams((prev) => {
        const next = new Set(prev)
        next.delete(teamId)
        return next
      })
      if (section.kind === 'team' && section.teamId === teamId) setSection({ kind: 'all' })
      closeTeamModal()
    } finally {
      setDeletingTeam(false)
    }
  }

  // ensure the 7 standard workspace-scoped status rows exist. New teams may
  // seed their own copies, but the row's status dropdown reads from workspace
  // scope, so they need to be present here as well.
  const seededWorkspaceStatusesRef = useRef(false)
  useEffect(() => {
    if (seededWorkspaceStatusesRef.current) return
    const workspace = statuses.filter((s) => !s.teamId)
    const desired = [
      { key: 'backlog', name: 'Backlog', type: 'backlog', color: '#6b7280' },
      { key: 'todo', name: 'Todo', type: 'unstarted', color: '#94a3b8' },
      { key: 'in_progress', name: 'In Progress', type: 'started', color: '#fbbf24' },
      { key: 'in_review', name: 'In Review', type: 'review', color: '#38bdf8' },
      { key: 'blocked', name: 'Blocked', type: 'blocked', color: '#f87171' },
      { key: 'done', name: 'Done', type: 'completed', color: '#4ade80' },
      { key: 'canceled', name: 'Canceled', type: 'canceled', color: '#9ca3af' },
    ]
    const missing = desired.filter((def) => !workspace.some((s) => s.key === def.key))
    if (missing.length === 0) {
      seededWorkspaceStatusesRef.current = true
      return
    }
    seededWorkspaceStatusesRef.current = true
    for (const [index, def] of desired.entries()) {
      if (workspace.some((s) => s.key === def.key)) continue
      void z.mutate.pm_statuses.create({
        id: crypto.randomUUID(),
        ...def,
        position: index,
      })
    }
  }, [statuses, z])

  // keep section valid if team disappears
  useEffect(() => {
    if (section.kind !== 'team') return
    if (visibleTeams.some((team) => team.id === section.teamId)) return
    if (teams.length === 0 && scopedIssues.length === 0) return
    setSectionState({ kind: 'all' })
  }, [section, visibleTeams, teams.length, scopedIssues.length])

  // keep section valid if saved view disappears
  useEffect(() => {
    if (section.kind !== 'view') return
    if (personalSavedViews.some((view) => view.id === section.viewId)) return
    setSectionState({ kind: 'all' })
  }, [section, personalSavedViews])

  useEffect(() => {
    if (location.pathname !== '/issues') return
    const viewId = new URLSearchParams(location.search).get('view')
    if (!viewId) {
      suppressNextViewUrlSyncRef.current = false
      return
    }
    if (suppressNextViewUrlSyncRef.current) return
    if (!personalSavedViews.some((view) => view.id === viewId)) return
    setSectionState((current) => (
      current.kind === 'view' && current.viewId === viewId
        ? current
        : { kind: 'view', viewId }
    ))
  }, [location.pathname, location.search, personalSavedViews])

  useEffect(() => {
    if (!teamModal) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeTeamModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [teamModal])

  // persist sidebar navigation/collapse state per-user (filter state lives in Issues.tsx)
  useEffect(() => {
    if (!sidebarStorageKey) return
    try {
      localStorage.setItem(
        sidebarStorageKey,
        JSON.stringify({
          section,
          teamsSectionCollapsed,
          collapsedTeams: [...collapsedTeams],
        }),
      )
    } catch {
      // ignore quota / serialization errors
    }
  }, [sidebarStorageKey, section, teamsSectionCollapsed, collapsedTeams])

  const context: TrackerContext = { section, setSection, requestComposer }

  return (
    <div className="flex-1 min-h-0 overflow-hidden text-fg-1">
      <div className="flex h-full min-h-0 relative">
        <aside
          className={`${
            mobileTrackerOpen
              ? 'fixed inset-0 z-50 flex md:relative md:inset-auto md:z-auto md:w-[200px]'
              : 'hidden md:flex md:relative md:z-auto md:w-[200px]'
          } shrink-0 overflow-y-auto border-r border-edge/12 bg-pit backdrop-blur-sm px-2 py-4 flex-col md:bg-pit/60`}
        >
          <div className="px-4 pb-3 mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="font-bold text-base text-accent glow tracking-wide">
                p@ch_
              </div>
              <div className="text-[9px] uppercase tracking-label text-fg-4 mt-1">
                // issues · tracker
              </div>
            </div>
            <button
              onClick={() => setMobileTrackerOpen(false)}
              className="md:hidden flex h-7 w-7 items-center justify-center text-fg-3 transition hover:text-accent"
              aria-label="close tracker"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 px-2">
            <button
              onClick={requestComposer}
              className="flex w-full items-center justify-between gap-2 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs"
              title="create issue (shift+c)"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3 w-3" />
                create issue
              </span>
              <span className="text-fg-4 normal-case tracking-normal">shift+c</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">views</div>
            <TrackerNavButton
              active={location.pathname === '/issues' && section.kind === 'all'}
              label="all issues"
              meta={`${scopedIssues.length}`}
              onClick={() => selectSection({ kind: 'all' })}
            />
            {personalSavedViews.map((view) => (
              <SavedViewNavItem
                key={view.id}
                view={view}
                active={location.pathname === '/issues' && section.kind === 'view' && section.viewId === view.id}
                dragging={viewDragId === view.id}
                dropPosition={viewDropTarget?.viewId === view.id ? viewDropTarget.position : null}
                onClick={() => selectSection({ kind: 'view', viewId: view.id })}
                onDragStart={(event) => handleSavedViewDragStart(event, view)}
                onDragOver={(event) => handleSavedViewDragOver(event, view)}
                onDragLeave={(event) => handleSavedViewDragLeave(event, view)}
                onDrop={(event) => void handleSavedViewDrop(event, view)}
                onDragEnd={handleSavedViewDragEnd}
              />
            ))}
          </div>

          <div className="mt-6 space-y-1">
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">manage</div>
            <TrackerNavButton
              active={location.pathname === '/issues/labels'}
              label="labels"
              onClick={() => navigateFromTracker('/issues/labels')}
            />
            <TrackerNavButton
              active={location.pathname === '/issues/triggers'}
              label="triggers"
              onClick={() => navigateFromTracker('/issues/triggers')}
            />
          </div>

          <div className="mt-6 space-y-1">
            <div className="flex items-center justify-between px-3 pb-1">
              <button
                onClick={() => setTeamsSectionCollapsed((v) => !v)}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4 hover:text-fg-2 transition"
              >
                {teamsSectionCollapsed
                  ? <ChevronRight className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />}
                teams
              </button>
              {user?.canAccessUnscoped && (
                <button
                  onClick={openCreateTeamModal}
                  className="flex h-5 w-5 items-center justify-center text-fg-4 transition hover:text-accent"
                  title="create team"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!teamsSectionCollapsed && (visibleTeams.length ? (
              visibleTeams.map((team) => {
                const teamIssueCount = scopedIssues.filter((issue) => issue.teamId === team.id).length
                const isActive =
                  location.pathname === '/issues' &&
                  section.kind === 'team' &&
                  section.teamId === team.id
                const isExpanded = isActive || !collapsedTeams.has(team.id)
                return (
                  <div key={team.id}>
                    <div className="flex items-stretch">
                      <button
                        onClick={() => toggleTeam(team.id)}
                        className="flex w-7 shrink-0 items-center justify-center text-fg-4 hover:text-fg-2 transition"
                        title={isExpanded ? 'collapse' : 'expand'}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => selectSection({
                          kind: 'team',
                          teamId: team.id,
                          tab: section.kind === 'team' && section.teamId === team.id ? section.tab : 'issues',
                        })}
                        className={`flex flex-1 items-center justify-between px-2 py-2 text-left font-mono text-xs lowercase transition ${
                          isActive
                            ? 'bg-accent-fill/8 text-accent ring-1 ring-accent-fill/20'
                            : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
                        }`}
                      >
                        <span className="truncate">{team.name.toLowerCase()}</span>
                        <span className="ml-3 text-[10px] text-fg-4">{teamIssueCount}</span>
                      </button>
                      {user?.canAccessUnscoped && (
                        <button
                          onClick={() => openEditTeamModal(team)}
                          className={`flex w-7 shrink-0 items-center justify-center transition ${
                            isActive ? 'text-accent' : 'text-fg-4 hover:text-accent'
                          }`}
                          title="edit team"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {isExpanded ? (
                      <div className="mt-1 space-y-1 pl-7">
                        <TrackerChildNavButton
                          active={isActive && section.tab === 'issues'}
                          label="issues"
                          onClick={() => selectSection({ kind: 'team', teamId: team.id, tab: 'issues' })}
                        />
                        <TrackerChildNavButton
                          active={isActive && section.tab === 'projects'}
                          label="projects"
                          onClick={() => selectSection({ kind: 'team', teamId: team.id, tab: 'projects' })}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })
            ) : (
              <div className="px-3 py-2 font-mono text-xs text-fg-4">// no teams yet</div>
            ))}
          </div>

          <div className="mt-auto pt-4 flex justify-center">
            <div className="rotate-180 [writing-mode:vertical-rl] font-mono text-[9px] uppercase tracking-[0.3em] text-fg-4">
              pach · tracker
            </div>
          </div>
        </aside>

        <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {/* mobile tracker toggle */}
          <div className="md:hidden flex items-center gap-2 border-b border-edge/12 bg-pit/60 backdrop-blur-sm px-3 py-2">
            <button
              onClick={() => setMobileTrackerOpen(true)}
              className="flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-2 transition hover:text-accent hover:border-edge/40"
              aria-label="open tracker menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">
              ◊ issues · tracker
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <Outlet context={context} />
          </div>
        </main>
      </div>

      {teamModal && (
        <TeamNameModal
          mode={teamModal.mode}
          name={teamDraftName}
          onNameChange={setTeamDraftName}
          saving={savingTeam}
          deleting={deletingTeam}
          deleteStep={teamDeleteStep}
          replacementTeams={replacementTeams}
          replacementTeamId={replacementTeamId}
          teamName={teamModal.mode === 'edit' ? teams.find((team) => team.id === teamModal.teamId)?.name ?? teamDraftName : teamDraftName}
          deleteIssueCount={
            teamModal.mode === 'edit'
              ? scopedIssues.filter((issue) => issue.teamId === teamModal.teamId).length
              : 0
          }
          onReplacementTeamChange={setReplacementTeamId}
          onClose={closeTeamModal}
          onSubmit={submitTeamModal}
          onRequestDelete={teamModal.mode === 'edit' ? () => setTeamDeleteStep(true) : undefined}
          onBackFromDelete={() => setTeamDeleteStep(false)}
          onConfirmDelete={teamModal.mode === 'edit' ? deleteTeam : undefined}
        />
      )}
    </div>
  )
}

function TrackerNavButton({
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
      className={`flex w-full items-center justify-between px-3 py-2 text-left font-mono text-xs lowercase transition ${
        active
          ? 'bg-accent-fill/8 text-accent ring-1 ring-accent-fill/20'
          : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
      }`}
    >
      <span className="truncate">{label}</span>
      {meta ? <span className="ml-3 text-[10px] text-fg-4">{meta}</span> : null}
    </button>
  )
}

function SavedViewNavItem({
  view,
  active,
  dragging,
  dropPosition,
  onClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  view: SavedViewRow
  active: boolean
  dragging: boolean
  dropPosition: SavedViewDropPosition | null
  onClick: () => void
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDragLeave: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onDragEnd: () => void
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative flex items-stretch transition ${dragging ? 'opacity-45' : ''}`}
    >
      {dropPosition ? (
        <span
          className={`pointer-events-none absolute left-1 right-1 z-10 h-px bg-accent shadow-glow-xs ${
            dropPosition === 'before' ? 'top-0' : 'bottom-0'
          }`}
        />
      ) : null}
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={`flex w-6 shrink-0 cursor-grab items-center justify-center text-fg-4 opacity-0 transition hover:text-accent active:cursor-grabbing group-hover:opacity-100 ${
          dragging ? 'opacity-100 text-accent' : ''
        }`}
        title="drag to reorder"
        aria-label={`drag ${view.name.toLowerCase()} view`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center justify-between px-2 py-2 text-left font-mono text-xs lowercase transition ${
          active
            ? 'bg-accent-fill/8 text-accent ring-1 ring-accent-fill/20'
            : 'text-fg-2 hover:bg-accent-fill/4 hover:text-fg-1'
        }`}
      >
        <span className="truncate">{view.name.toLowerCase()}</span>
      </button>
    </div>
  )
}

function TrackerChildNavButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-left font-mono text-xs lowercase transition ${
        active ? 'text-accent' : 'text-fg-3 hover:text-fg-1'
      }`}
    >
      <span className="text-fg-4 mr-2">›</span>{label}
    </button>
  )
}

function TeamNameModal({
  mode,
  name,
  onNameChange,
  saving,
  deleting,
  deleteStep,
  replacementTeams,
  replacementTeamId,
  teamName,
  deleteIssueCount,
  onReplacementTeamChange,
  onClose,
  onSubmit,
  onRequestDelete,
  onBackFromDelete,
  onConfirmDelete,
}: {
  mode: 'create' | 'edit'
  name: string
  onNameChange: (value: string) => void
  saving: boolean
  deleting: boolean
  deleteStep: boolean
  replacementTeams: Schema['tables']['pm_teams']['row'][]
  replacementTeamId: string
  teamName: string
  deleteIssueCount: number
  onReplacementTeamChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  onRequestDelete?: () => void
  onBackFromDelete: () => void
  onConfirmDelete?: () => void
}) {
  const replacementTeam = replacementTeams.find((team) => team.id === replacementTeamId)
  const deleteIssueText = replacementTeam
    ? `${deleteIssueCount === 1 ? '1 issue' : `${deleteIssueCount} issues`} will move to ${replacementTeam.name.toLowerCase()}.`
    : 'create another team before deleting this one.'
  const isDeleteStep = mode === 'edit' && deleteStep

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
            {mode === 'create' ? '◊ teams · create' : isDeleteStep ? '◊ teams · delete' : '◊ teams · edit'}
          </div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">
            {mode === 'create' ? 'new team' : isDeleteStep ? `delete ${teamName.toLowerCase()}` : 'edit team name'}
          </div>
        </div>

        <div className="px-6 py-5">
          {isDeleteStep ? (
            <div className="space-y-3">
              <label className="block">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">move issues to</div>
                <PachSelect
                  value={replacementTeamId}
                  onChange={onReplacementTeamChange}
                  display={replacementTeam?.name.toLowerCase() ?? 'no other teams'}
                  options={deleting ? [] : replacementTeams.map((team) => ({ value: team.id, label: team.name.toLowerCase() }))}
                  triggerClassName={`flex w-full items-center justify-between border px-3 py-2 text-left font-mono text-sm lowercase transition ${
                    deleting || replacementTeams.length === 0
                      ? 'border-edge/10 bg-rim text-fg-4 opacity-40'
                      : 'border-edge/20 bg-rim text-fg-1 hover:border-edge/30 hover:bg-accent-fill/4 focus:border-accent focus:shadow-glow-xs'
                  }`}
                />
              </label>
              <div className="border border-fail/28 bg-fail/6 px-3 py-2 font-mono text-[11px] lowercase text-fail">
                deleting this team reassigns its issues. {deleteIssueText}
              </div>
            </div>
          ) : (
            <label className="block">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">team name</div>
              <input
                autoFocus
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="$ product"
                className="w-full bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
              />
            </label>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-edge/12 px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
            >
              [cancel]
            </button>
            {isDeleteStep ? (
              <button
                onClick={onBackFromDelete}
                disabled={deleting}
                className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1 disabled:opacity-40"
              >
                [back]
              </button>
            ) : mode === 'edit' && onRequestDelete ? (
              <button
                onClick={onRequestDelete}
                disabled={saving || deleting}
                className="inline-flex items-center gap-2 px-3 py-2 font-mono text-xs uppercase tracking-label text-fail transition hover:text-fg-1 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                delete team
              </button>
            ) : null}
          </div>
          {isDeleteStep ? (
            <button
              onClick={onConfirmDelete}
              disabled={deleting || !replacementTeamId}
              className="inline-flex items-center gap-2 border border-fail/34 bg-fail/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-fail/14 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? 'deleting…' : 'confirm delete'}
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={!name.trim() || saving || deleting}
              className="inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-accent-fill/8 disabled:hover:shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {saving ? (mode === 'create' ? 'creating…' : 'saving…') : (mode === 'create' ? 'create team' : 'save team')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function readStoredSidebar(storageKey: string | null): {
  section: TrackerSection
  teamsSectionCollapsed: boolean
  collapsedTeams: string[]
} {
  const empty = { section: { kind: 'all' } as TrackerSection, teamsSectionCollapsed: false, collapsedTeams: [] }
  if (!storageKey || typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as {
      section?: unknown
      teamsSectionCollapsed?: unknown
      collapsedTeams?: unknown
    }
    return {
      section: readStoredSection(parsed.section),
      teamsSectionCollapsed: parsed.teamsSectionCollapsed === true,
      collapsedTeams: Array.isArray(parsed.collapsedTeams)
        ? parsed.collapsedTeams.filter((v): v is string => typeof v === 'string')
        : [],
    }
  } catch {
    return empty
  }
}

function readStoredSection(value: unknown): TrackerSection {
  if (!value || typeof value !== 'object') return { kind: 'all' }

  const section = value as Record<string, unknown>
  if (section.kind === 'all') return { kind: 'all' }
  if (section.kind === 'view' && typeof section.viewId === 'string') {
    return { kind: 'view', viewId: section.viewId }
  }
  if (
    section.kind === 'team' &&
    typeof section.teamId === 'string' &&
    (section.tab === 'issues' || section.tab === 'projects')
  ) {
    return { kind: 'team', teamId: section.teamId, tab: section.tab }
  }

  return { kind: 'all' }
}
