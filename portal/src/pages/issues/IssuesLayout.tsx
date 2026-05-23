import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'

export type TrackerSection =
  | { kind: 'all' }
  | { kind: 'team'; teamId: string; tab: 'issues' | 'projects' }

export type TrackerContext = {
  section: TrackerSection
  setSection: (section: TrackerSection) => void
  composerRequestId: number
  requestComposer: () => void
}

export function useTrackerContext(): TrackerContext {
  return useOutletContext<TrackerContext>()
}

type TeamModalState =
  | { mode: 'create' }
  | { mode: 'edit'; teamId: string }
  | null

export default function IssuesLayout() {
  const z = useZero<Schema, Mutators>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [issues] = useQuery(z.query.pm_issues)

  const sidebarStorageKey = user ? `pach:issues:sidebar:${user.id}` : null
  const initialSidebar = readStoredSidebar(sidebarStorageKey)

  const [section, setSectionState] = useState<TrackerSection>({ kind: 'all' })
  const [teamsSectionCollapsed, setTeamsSectionCollapsed] = useState(initialSidebar.teamsSectionCollapsed)
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(() => new Set(initialSidebar.collapsedTeams))
  const [teamModal, setTeamModal] = useState<TeamModalState>(null)
  const [teamDraftName, setTeamDraftName] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [composerRequestId, setComposerRequestId] = useState(0)

  // setSection from any child navigates back to the list view when triggered from /issues/:id
  function setSection(next: TrackerSection) {
    setSectionState(next)
    if (location.pathname !== '/issues') navigate('/issues')
  }

  function requestComposer() {
    if (location.pathname !== '/issues') navigate('/issues')
    setComposerRequestId((id) => id + 1)
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
    setTeamModal({ mode: 'edit', teamId: team.id })
  }

  function closeTeamModal() {
    setTeamModal(null)
    setTeamDraftName('')
    setSavingTeam(false)
  }

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

  // keep section valid if team disappears
  useEffect(() => {
    if (section.kind !== 'team') return
    if (teams.some((team) => team.id === section.teamId)) return
    setSectionState({ kind: 'all' })
  }, [section, teams])

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

  // persist sidebar collapse state per-user (filter state lives in Issues.tsx)
  useEffect(() => {
    if (!sidebarStorageKey) return
    try {
      localStorage.setItem(
        sidebarStorageKey,
        JSON.stringify({
          teamsSectionCollapsed,
          collapsedTeams: [...collapsedTeams],
        }),
      )
    } catch {
      // ignore quota / serialization errors
    }
  }, [sidebarStorageKey, teamsSectionCollapsed, collapsedTeams])

  const context: TrackerContext = { section, setSection, composerRequestId, requestComposer }

  return (
    <div className="flex-1 min-h-0 overflow-hidden text-fg-1">
      <div className="flex h-full min-h-0">
        <aside className="w-[200px] shrink-0 border-r border-[rgba(0,255,140,0.12)] bg-[rgba(5,6,5,0.6)] backdrop-blur-sm px-2 py-4 flex flex-col">
          <div className="px-4 pb-3 mb-2">
            <div className="font-bold text-base text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide">
              p@ch_
            </div>
            <div className="text-[9px] uppercase tracking-label text-fg-4 mt-1">
              // issues · tracker
            </div>
          </div>

          <div className="mb-4 px-2">
            <button
              onClick={requestComposer}
              className="flex w-full items-center justify-between gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
              title="create issue (c)"
            >
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-3 w-3" />
                create issue
              </span>
              <span className="text-fg-4 normal-case tracking-normal">c</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">views</div>
            <TrackerNavButton
              active={location.pathname === '/issues' && section.kind === 'all'}
              label="all issues"
              meta={`${issues.length}`}
              onClick={() => setSection({ kind: 'all' })}
            />
            <TrackerNavButton
              active={location.pathname === '/issues/labels'}
              label="labels"
              onClick={() => navigate('/issues/labels')}
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
              <button
                onClick={openCreateTeamModal}
                className="flex h-5 w-5 items-center justify-center text-fg-4 transition hover:text-accent"
                title="create team"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {!teamsSectionCollapsed && (teams.length ? (
              teams.map((team) => {
                const teamIssueCount = issues.filter((issue) => issue.teamId === team.id).length
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
                        onClick={() => setSection({
                          kind: 'team',
                          teamId: team.id,
                          tab: section.kind === 'team' && section.teamId === team.id ? section.tab : 'issues',
                        })}
                        className={`flex flex-1 items-center justify-between px-2 py-2 text-left font-mono text-xs lowercase transition ${
                          isActive
                            ? 'bg-[rgba(0,255,136,0.08)] text-accent ring-1 ring-[rgba(0,255,136,0.2)]'
                            : 'text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'
                        }`}
                      >
                        <span className="truncate">{team.name.toLowerCase()}</span>
                        <span className="ml-3 text-[10px] text-fg-4">{teamIssueCount}</span>
                      </button>
                      <button
                        onClick={() => openEditTeamModal(team)}
                        className={`flex w-7 shrink-0 items-center justify-center transition ${
                          isActive ? 'text-accent' : 'text-fg-4 hover:text-accent'
                        }`}
                        title="edit team"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="mt-1 space-y-1 pl-7">
                        <TrackerChildNavButton
                          active={isActive && section.tab === 'issues'}
                          label="issues"
                          onClick={() => setSection({ kind: 'team', teamId: team.id, tab: 'issues' })}
                        />
                        <TrackerChildNavButton
                          active={isActive && section.tab === 'projects'}
                          label="projects"
                          onClick={() => setSection({ kind: 'team', teamId: team.id, tab: 'projects' })}
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

        <main className="flex-1 min-w-0">
          <Outlet context={context} />
        </main>
      </div>

      {teamModal && (
        <TeamNameModal
          mode={teamModal.mode}
          name={teamDraftName}
          onNameChange={setTeamDraftName}
          saving={savingTeam}
          onClose={closeTeamModal}
          onSubmit={submitTeamModal}
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
          ? 'bg-[rgba(0,255,136,0.08)] text-accent ring-1 ring-[rgba(0,255,136,0.2)]'
          : 'text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'
      }`}
    >
      <span className="truncate">{label}</span>
      {meta ? <span className="ml-3 text-[10px] text-fg-4">{meta}</span> : null}
    </button>
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
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  name: string
  onNameChange: (value: string) => void
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
            {mode === 'create' ? '◊ teams · create' : '◊ teams · edit'}
          </div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">
            {mode === 'create' ? 'new team' : 'edit team name'}
          </div>
        </div>

        <div className="px-6 py-5">
          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">team name</div>
            <input
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="$ product"
              className="w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
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
            {saving ? (mode === 'create' ? 'creating…' : 'saving…') : (mode === 'create' ? 'create team' : 'save team')}
          </button>
        </div>
      </div>
    </div>
  )
}

function readStoredSidebar(storageKey: string | null): {
  teamsSectionCollapsed: boolean
  collapsedTeams: string[]
} {
  const empty = { teamsSectionCollapsed: false, collapsedTeams: [] }
  if (!storageKey || typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as {
      teamsSectionCollapsed?: unknown
      collapsedTeams?: unknown
    }
    return {
      teamsSectionCollapsed: parsed.teamsSectionCollapsed === true,
      collapsedTeams: Array.isArray(parsed.collapsedTeams)
        ? parsed.collapsedTeams.filter((v): v is string => typeof v === 'string')
        : [],
    }
  } catch {
    return empty
  }
}
