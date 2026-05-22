import { useDeferredValue, useEffect, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, Circle, FolderKanban, Pencil, Plus, Search } from 'lucide-react'
import { useQuery, useZero } from '@rocicorp/zero/react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'

const PRIORITY_GROUPS = [
  { value: 1, label: 'urgent', accent: 'text-fail' },
  { value: 2, label: 'high', accent: 'text-amber' },
  { value: 3, label: 'medium', accent: 'text-pach-info' },
  { value: 4, label: 'low', accent: 'text-accent' },
  { value: 0, label: 'unprioritized', accent: 'text-fg-3' },
] as const

const ESTIMATES = [2, 4, 8, 16]

type TrackerSection =
  | { kind: 'all' }
  | { kind: 'team'; teamId: string; tab: 'issues' | 'projects' }

type Foundation = {
  defaultTeamId: string
  defaultStatusId: string
  defaultProjectId?: string
}

type TeamModalState =
  | { mode: 'create' }
  | { mode: 'edit'; teamId: string }
  | null

export default function Issues() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()

  const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))

  const [section, setSection] = useState<TrackerSection>({ kind: 'all' })
  const [search, setSearch] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerTitle, setComposerTitle] = useState('')
  const [composerCompanyId, setComposerCompanyId] = useState('')
  const [composerTeamId, setComposerTeamId] = useState('')
  const [composerProjectId, setComposerProjectId] = useState('')
  const [composerPriority, setComposerPriority] = useState<number>(2)
  const [composerEstimate, setComposerEstimate] = useState<number>(4)
  const [creatingIssue, setCreatingIssue] = useState(false)
  const [teamModal, setTeamModal] = useState<TeamModalState>(null)
  const [teamDraftName, setTeamDraftName] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [collapsedPriorities, setCollapsedPriorities] = useState<Set<number>>(new Set())
  const [teamsSectionCollapsed, setTeamsSectionCollapsed] = useState(false)
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set())
  const deferredSearch = useDeferredValue(search)

  function togglePriority(value: number) {
    setCollapsedPriorities((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function toggleTeam(teamId: string) {
    setCollapsedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
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

  const contextCompanies = companies.filter((company) => company.id !== workspaceCompany?.id)
  const selectedTeam = section.kind === 'team' ? teams.find((team) => team.id === section.teamId) ?? null : null
  const selectedTeamIssues = selectedTeam ? issues.filter((issue) => issue.teamId === selectedTeam.id) : []
  const selectedTeamProjects = selectedTeam ? projects.filter((project) => project.teamId === selectedTeam.id) : []

  const selectedComposerTeam = teams.find((team) => team.id === composerTeamId) ?? teams[0] ?? null
  const composerProjects = selectedComposerTeam
    ? projects.filter((project) => project.teamId === selectedComposerTeam.id)
    : []
  const composerStatuses = selectedComposerTeam
    ? statuses.filter((status) => status.teamId === selectedComposerTeam.id)
    : []
  const defaultComposerStatusId =
    composerStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
    composerStatuses[0]?.id ??
    ''

  useEffect(() => {
    if (!teams.length) return
    if (composerTeamId && teams.some((team) => team.id === composerTeamId)) return
    setComposerTeamId(teams[0].id)
  }, [composerTeamId, teams])

  useEffect(() => {
    if (composerProjects.some((project) => project.id === composerProjectId)) return
    setComposerProjectId(composerProjects[0]?.id ?? '')
  }, [composerProjectId, composerProjects])

  useEffect(() => {
    if (composerCompanyId && contextCompanies.some((company) => company.id === composerCompanyId)) return
    setComposerCompanyId(contextCompanies[0]?.id ?? '')
  }, [composerCompanyId, contextCompanies])

  useEffect(() => {
    if (section.kind !== 'team') return
    if (teams.some((team) => team.id === section.teamId)) return
    setSection({ kind: 'all' })
  }, [section, teams])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (composerOpen || teamModal) return
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
  }, [composerOpen, teamModal])

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
    if (!teamModal) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeTeamModal()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [teamModal])

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const filteredIssues = issues.filter((issue) => {
    if (section.kind === 'team' && issue.teamId !== section.teamId) return false

    if (!normalizedSearch) return true

    const team = teamMap.get(issue.teamId)
    const project = issue.projectId ? projectMap.get(issue.projectId) : null
    const company = issue.contextCompanyId ? companyMap.get(issue.contextCompanyId) : null
    const assignee = issue.assigneeId ? userMap.get(issue.assigneeId) : null

    const haystack = [
      issue.identifier,
      issue.title,
      issue.description,
      team?.name,
      project?.name,
      company?.name,
      assignee?.name,
      assignee?.email,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedSearch)
  })

  const groupedIssues = PRIORITY_GROUPS.map((group) => ({
    ...group,
    issues: filteredIssues.filter((issue) => issue.priority === group.value),
  })).filter((group) => group.issues.length > 0)

  const openCount = issues.filter((issue) => {
    const status = statusMap.get(issue.statusId)
    return status?.type !== 'completed' && status?.type !== 'canceled'
  }).length

  const blockedCount = issues.filter((issue) => statusMap.get(issue.statusId)?.key === 'blocked').length

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

  async function ensureWorkspaceFoundation(): Promise<Foundation> {
    const existingTeam = teams[0]
    if (existingTeam) {
      const teamStatuses = statuses.filter((status) => status.teamId === existingTeam.id)
      if (teamStatuses.length) {
        const defaultStatusId =
          teamStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
          teamStatuses[0].id
        const defaultProjectId = projects.find((project) => project.teamId === existingTeam.id)?.id
        return {
          defaultTeamId: existingTeam.id,
          defaultStatusId,
          defaultProjectId,
        }
      }
    }

    const teamId = existingTeam?.id ?? crypto.randomUUID()
    const statusDefs = [
      { id: crypto.randomUUID(), name: 'Todo', key: 'todo', type: 'unstarted', color: '#94a3b8' },
      { id: crypto.randomUUID(), name: 'In Progress', key: 'in_progress', type: 'started', color: '#fbbf24' },
      { id: crypto.randomUUID(), name: 'Blocked', key: 'blocked', type: 'blocked', color: '#f87171' },
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
      description: 'Core workspace roadmap',
    })

    return {
      defaultTeamId: teamId,
      defaultStatusId: statusDefs[0].id,
      defaultProjectId: projectId,
    }
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
    while (existingKeys.has(`${base}${counter}`)) {
      counter += 1
    }

    return `${base}${counter}`
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

        setComposerTeamId(teamId)
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

      const teamStatuses = statuses.filter((status) => status.teamId === teamId)
      const statusId =
        teamStatuses.find((status) => status.type !== 'completed' && status.type !== 'canceled')?.id ??
        defaultComposerStatusId ??
        foundation.defaultStatusId

      const nextNumber =
        issues.filter((issue) => issue.teamId === teamId).reduce((max, issue) => Math.max(max, issue.number), 0) + 1

      const issueId = crypto.randomUUID()
      await z.mutate.pm_issues.create({
        id: issueId,
        contextCompanyId: composerCompanyId || undefined,
        teamId,
        projectId: composerProjectId || foundation.defaultProjectId,
        statusId,
        assigneeId: user.id,
        creatorId: user.id,
        identifier: `${team.key}-${nextNumber}`,
        number: nextNumber,
        title: composerTitle.trim(),
        priority: composerPriority,
        estimate: composerEstimate,
        sortOrder: nextNumber,
      })

      await logActivity(issueId, `Created issue ${team.key}-${nextNumber}`)
      setComposerTitle('')
      setComposerOpen(false)
      setSection({ kind: 'all' })
    } finally {
      setCreatingIssue(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden text-fg-1">
      <div className="flex h-full min-h-0">
        <aside className="w-[260px] shrink-0 border-r border-[rgba(0,255,140,0.12)] bg-[rgba(5,6,5,0.6)] backdrop-blur-sm px-3 py-4 flex flex-col">
          <div className="px-4 pb-3 mb-2">
            <div className="font-bold text-base text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.5)] tracking-wide">
              p@ch_
            </div>
            <div className="text-[9px] uppercase tracking-label text-fg-4 mt-1">
              // issues · tracker
            </div>
          </div>

          <div className="space-y-1">
            <SidebarSection label="views" />
            <TrackerNavButton
              active={section.kind === 'all'}
              label="all issues"
              meta={`${issues.length}`}
              onClick={() => setSection({ kind: 'all' })}
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
                const teamIssues = issues.filter((issue) => issue.teamId === team.id).length
                const isActive = section.kind === 'team' && section.teamId === team.id
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
                        onClick={() => setSection({ kind: 'team', teamId: team.id, tab: section.kind === 'team' && section.teamId === team.id ? section.tab : 'issues' })}
                        className={`flex flex-1 items-center justify-between px-2 py-2 text-left font-mono text-xs lowercase transition ${
                          isActive
                            ? 'bg-[rgba(0,255,136,0.08)] text-accent ring-1 ring-[rgba(0,255,136,0.2)]'
                            : 'text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1'
                        }`}
                      >
                        <span className="truncate">{team.name.toLowerCase()}</span>
                        <span className="ml-3 text-[10px] text-fg-4">{teamIssues}</span>
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
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[rgba(0,255,140,0.15)] px-8 py-5">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1">
                    {section.kind === 'all'
                      ? '◊ issues · all'
                      : `◊ ${selectedTeam?.name?.toLowerCase() || 'team'} · ${section.tab === 'projects' ? 'projects' : 'issues'}`}
                  </div>
                  <h1 className="font-mono text-2xl font-bold lowercase text-fg-1">
                    {section.kind === 'all'
                      ? 'all issues'
                      : section.tab === 'projects'
                        ? `${(selectedTeam?.name || 'team').toLowerCase()} projects`
                        : (selectedTeam?.name || 'team').toLowerCase()}
                  </h1>
                  <p className="text-sm text-fg-3 mt-0.5">
                    <span className="text-fg-4">›</span>{' '}
                    {section.kind === 'all'
                      ? `${issues.length} issues · ${openCount} open · ${blockedCount} blocked`
                      : section.tab === 'issues'
                        ? `${selectedTeamIssues.length} issues in ${(selectedTeam?.name || 'this team').toLowerCase()}`
                        : `${selectedTeamProjects.length} projects in ${(selectedTeam?.name || 'this team').toLowerCase()}`}
                  </p>
                </div>

                <button
                  onClick={() => setComposerOpen(true)}
                  className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  create issue
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-8 py-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="relative max-w-[560px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="$ search issues, companies, teams, projects, assignee…"
                    className="w-full bg-rim border border-[rgba(0,255,140,0.15)] pl-9 pr-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
                  />
                </div>
                <div className="font-mono text-xs uppercase tracking-label text-fg-3">
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
                />
              ) : filteredIssues.length ? (
                <div className="space-y-3">
                  {groupedIssues.map((group) => {
                    const isCollapsed = collapsedPriorities.has(group.value)
                    return (
                      <section key={group.value} className="overflow-hidden border border-[rgba(0,255,140,0.12)] bg-[rgba(10,14,12,0.6)] backdrop-blur-sm">
                        <button
                          onClick={() => togglePriority(group.value)}
                          className="flex w-full items-center gap-3 border-b border-[rgba(0,255,140,0.1)] bg-[rgba(20,26,23,0.6)] px-5 py-3 text-left transition hover:bg-[rgba(0,255,136,0.04)]"
                        >
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-fg-4 shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-fg-4 shrink-0" />}
                          <span className={`font-mono text-xs uppercase tracking-label ${group.accent}`}>
                            {group.label}
                          </span>
                          <span className="font-mono text-xs text-fg-4">· {group.issues.length}</span>
                        </button>

                        {!isCollapsed && (
                          <div>
                            {getStatusGroups(group.issues, statusMap).map((status) => {
                              const statusIssues = group.issues
                                .filter((issue) => statusMap.get(issue.statusId)?.key === status.key)
                                .sort((a, b) => b.updatedAt - a.updatedAt)
                              if (!statusIssues.length) return null

                              return (
                                <div key={status.key} className="border-b border-[rgba(0,255,140,0.08)] last:border-b-0">
                                  <div className="flex items-center gap-2 px-5 py-2.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
                                    <StatusDot statusType={status.type} />
                                    {status.name.toLowerCase()}
                                    <span className="text-fg-4">· {statusIssues.length}</span>
                                  </div>
                                  <div>
                                    {statusIssues.map((issue) => (
                                      <IssueRow
                                        key={issue.id}
                                        issue={issue}
                                        company={issue.contextCompanyId ? companyMap.get(issue.contextCompanyId) ?? null : null}
                                        workspaceCompanyId={workspaceCompany?.id ?? null}
                                        team={teamMap.get(issue.teamId) ?? null}
                                        project={issue.projectId ? projectMap.get(issue.projectId) : null}
                                        assignee={issue.assigneeId ? userMap.get(issue.assigneeId) : null}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
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
        </main>
      </div>

      {composerOpen && (
        <IssueComposerModal
          title={composerTitle}
          onTitleChange={setComposerTitle}
          companyId={composerCompanyId}
          onCompanyChange={setComposerCompanyId}
          teamId={composerTeamId}
          onTeamChange={setComposerTeamId}
          projectId={composerProjectId}
          onProjectChange={setComposerProjectId}
          priority={composerPriority}
          onPriorityChange={setComposerPriority}
          estimate={composerEstimate}
          onEstimateChange={setComposerEstimate}
          companies={contextCompanies}
          teams={teams}
          projects={composerProjects}
          creating={creatingIssue}
          onClose={() => setComposerOpen(false)}
          onCreate={createIssue}
        />
      )}

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

function SidebarSection({ label }: { label: string }) {
  return <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">{label}</div>
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

function TeamProjectsPanel({
  team,
  projects,
  issues,
}: {
  team: Schema['tables']['pm_teams']['row'] | null
  projects: Schema['tables']['pm_projects']['row'][]
  issues: Schema['tables']['pm_issues']['row'][]
}) {
  if (!team) {
    return <EmptyState title="pick a team first" body="select a team in the sidebar to inspect its issues or projects." />
  }

  if (!projects.length) {
    return <EmptyState title="no projects in this team yet" body="projects will show up here once the team starts grouping work that way." />
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const projectIssues = issues.filter((issue) => issue.projectId === project.id)
        return (
          <div key={project.id} className="border border-[rgba(0,255,140,0.15)] bg-pit-2 p-5 hover:border-[rgba(0,255,140,0.3)] transition">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
              <FolderKanban className="h-3.5 w-3.5" />
              project
            </div>
            <div className="mt-3 font-mono text-lg lowercase text-fg-1">{project.name}</div>
            <div className="mt-2 text-sm text-fg-3">{project.description || 'no description yet.'}</div>
            <div className="mt-4 flex items-center justify-between font-mono text-xs">
              <span className="border border-[rgba(0,255,140,0.2)] bg-[rgba(0,255,136,0.05)] px-2 py-0.5 uppercase tracking-label text-accent">{project.status}</span>
              <span className="text-fg-4">{projectIssues.length} issues</span>
            </div>
          </div>
        )
      })}
    </div>
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
  companyId,
  onCompanyChange,
  teamId,
  onTeamChange,
  projectId,
  onProjectChange,
  priority,
  onPriorityChange,
  estimate,
  onEstimateChange,
  companies,
  teams,
  projects,
  creating,
  onClose,
  onCreate,
}: {
  title: string
  onTitleChange: (value: string) => void
  companyId: string
  onCompanyChange: (value: string) => void
  teamId: string
  onTeamChange: (value: string) => void
  projectId: string
  onProjectChange: (value: string) => void
  priority: number
  onPriorityChange: (value: number) => void
  estimate: number
  onEstimateChange: (value: number) => void
  companies: Schema['tables']['companies']['row'][]
  teams: Schema['tables']['pm_teams']['row'][]
  projects: Schema['tables']['pm_projects']['row'][]
  creating: boolean
  onClose: () => void
  onCreate: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.7)] px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-[rgba(0,255,140,0.2)] bg-pit-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[rgba(0,255,140,0.12)] px-6 py-5">
          <div className="text-[10px] uppercase tracking-label text-fg-3">◊ issues · create</div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">start with one issue</div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">title</div>
            <input
              autoFocus
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="$ what needs to get done?"
              className="w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="company context"
              value={companyId}
              onChange={onCompanyChange}
              options={[{ value: '', label: 'no company context' }, ...companies.map((company) => ({ value: company.id, label: company.name }))]}
            />
            <SelectField
              label="team"
              value={teamId}
              onChange={onTeamChange}
              options={teams.length ? teams.map((team) => ({ value: team.id, label: team.name })) : [{ value: '', label: 'pach (created automatically)' }]}
            />
            <SelectField
              label="project"
              value={projectId}
              onChange={onProjectChange}
              options={[{ value: '', label: 'no project' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
            />
            <SelectField
              label="priority"
              value={String(priority)}
              onChange={(value) => onPriorityChange(Number(value))}
              options={PRIORITY_GROUPS.map((group) => ({ value: String(group.value), label: group.label }))}
            />
            <SelectField
              label="estimate"
              value={String(estimate)}
              onChange={(value) => onEstimateChange(Number(value))}
              options={ESTIMATES.map((points) => ({ value: String(points), label: `${points} pts` }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-6 py-4">
          <button
            onClick={onClose}
            className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
          >
            [cancel]
          </button>
          <button
            onClick={onCreate}
            disabled={!title.trim() || creating}
            className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
          >
            <Plus className="h-3.5 w-3.5" />
            {creating ? 'creating…' : 'create issue'}
          </button>
        </div>
      </div>
    </div>
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

function IssueRow({
  issue,
  company,
  workspaceCompanyId,
  team,
  project,
  assignee,
}: {
  issue: Schema['tables']['pm_issues']['row']
  company: Schema['tables']['companies']['row'] | null
  workspaceCompanyId: string | null
  team: Schema['tables']['pm_teams']['row'] | null
  project: Schema['tables']['pm_projects']['row'] | null | undefined
  assignee: Schema['tables']['users']['row'] | null | undefined
}) {
  const showCompany = company && company.id !== workspaceCompanyId

  return (
    <div className="flex items-center gap-4 px-5 py-2.5 border-t border-[rgba(0,255,140,0.06)] transition hover:bg-[rgba(0,255,136,0.04)]">
      <div className="w-[72px] shrink-0 font-mono text-xs text-accent/80">{issue.identifier}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg-1">{issue.title}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-label">
          {showCompany && (
            <span className="inline-flex items-center gap-1 border border-[rgba(255,181,71,0.25)] bg-[rgba(255,181,71,0.06)] px-2 py-0.5 text-amber">
              <Building2 className="h-3 w-3" />
              {company.name}
            </span>
          )}
          {project && (
            <span className="inline-flex items-center gap-1 border border-[rgba(0,255,140,0.15)] bg-pit-3 px-2 py-0.5 text-fg-3">
              <FolderKanban className="h-3 w-3" />
              {project.name}
            </span>
          )}
          {team && (
            <span className="border border-[rgba(0,255,140,0.15)] bg-pit-3 px-2 py-0.5 text-fg-3">
              {team.name}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 font-mono text-xs text-fg-3">{issue.estimate ? `${issue.estimate} pts` : '— pts'}</div>
      <div className="w-[140px] shrink-0 text-right font-mono text-xs text-fg-3 truncate">{assignee?.name || assignee?.email || 'unassigned'}</div>
      <div className="w-[88px] shrink-0 text-right font-mono text-[10px] uppercase tracking-label text-fg-4">{formatShortDate(issue.updatedAt)}</div>
    </div>
  )
}

function getStatusGroups(
  issues: Schema['tables']['pm_issues']['row'][],
  statusMap: Map<string, Schema['tables']['pm_statuses']['row']>,
) {
  const uniqueStatuses = new Map<string, Schema['tables']['pm_statuses']['row']>()
  for (const issue of issues) {
    const status = statusMap.get(issue.statusId)
    if (!status) continue
    if (!uniqueStatuses.has(status.key)) uniqueStatuses.set(status.key, status)
  }

  return Array.from(uniqueStatuses.values()).sort((a, b) => {
    const rankDiff = statusRank(a.type) - statusRank(b.type)
    if (rankDiff !== 0) return rankDiff
    return a.position - b.position
  })
}

function StatusDot({ statusType }: { statusType: string }) {
  if (statusType === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
  if (statusType === 'blocked') return <AlertTriangle className="h-3.5 w-3.5 text-fail" />
  if (statusType === 'started') return <AlertTriangle className="h-3.5 w-3.5 text-amber" />
  return <Circle className="h-3.5 w-3.5 text-fg-4" />
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
