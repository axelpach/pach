import { useEffect, useMemo, useState } from 'react'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { Building2, CalendarClock, FolderKanban, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { authFetch, useAuth } from '../../lib/auth'
import { config } from '../../config'
import { PachSelect } from '../../components/PachSelect'
import { PRIORITY_META, PriorityIcon } from './PriorityIcon'
import { StatusIcon } from './StatusIcon'

type TriggerRow = Schema['tables']['pm_task_triggers']['row']
type TeamRow = Schema['tables']['pm_teams']['row']
type StatusRow = Schema['tables']['pm_statuses']['row']
type ProjectRow = Schema['tables']['pm_projects']['row']
type CompanyRow = Schema['tables']['organizations']['row']
type UserRow = Schema['tables']['users']['row']
type RunRow = Schema['tables']['pm_task_trigger_runs']['row']

type Draft = {
  name: string
  title: string
  description: string
  kind: 'recurring' | 'once'
  frequency: 'weekly' | 'monthly' | 'quarterly'
  date: string
  dayOfWeek: number
  dayOfMonth: number
  time: string
  timezone: string
  enabled: boolean
  teamId: string
  statusId: string
  projectId: string
  companyId: string
  assigneeId: string
  priority: number
  estimate: string
}

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; triggerId: string }
  | null

type Schedule = {
  kind: 'recurring' | 'once'
  frequency?: 'weekly' | 'monthly' | 'quarterly'
  timezone: string
  date?: string
  dayOfWeek?: number
  dayOfMonth?: number
  time: string
}

const DEFAULT_TIMEZONE = 'America/Mexico_City'
const DEFAULT_TIME = '09:00'
const TIMEZONES = [
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'Europe/Madrid', label: 'Madrid' },
] as const
const WEEKDAYS = [
  { value: 0, label: 'sunday' },
  { value: 1, label: 'monday' },
  { value: 2, label: 'tuesday' },
  { value: 3, label: 'wednesday' },
  { value: 4, label: 'thursday' },
  { value: 5, label: 'friday' },
  { value: 6, label: 'saturday' },
] as const

const ESTIMATES = [1, 2, 4, 8, 16]
const TRIGGER_STATUS_KEYS = ['todo', 'backlog', 'blocked', 'in_review', 'in_progress', 'done'] as const

export default function TaskTriggers() {
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const [triggers] = useQuery(z.query.pm_task_triggers.orderBy('nextRunAt', 'asc'))
  const [runs] = useQuery(z.query.pm_task_trigger_runs.orderBy('createdAt', 'desc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [companies] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('name', 'asc'))
  const accessibleOrganizationIds = useMemo(() => new Set(user?.organizationIds ?? []), [user?.organizationIds])
  const canAccessUnscoped = user?.canAccessUnscoped ?? false
  const canAccessOrganization = (organizationId: string | null | undefined) =>
    organizationId ? accessibleOrganizationIds.has(organizationId) : canAccessUnscoped
  const scopedCompanies = companies.filter((company) => canAccessOrganization(company.id))
  const scopedTriggers = triggers.filter((trigger) => canAccessOrganization(trigger.companyId))

  const [modal, setModal] = useState<ModalState>(null)
  const [draft, setDraft] = useState<Draft>(() => makeDefaultDraft({ teams, statuses, projects }))
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [runMessage, setRunMessage] = useState<string | null>(null)

  const runsByTrigger = useMemo(() => {
    const visibleTriggerIds = new Set(scopedTriggers.map((trigger) => trigger.id))
    const grouped = new Map<string, RunRow[]>()
    for (const run of runs) {
      if (!visibleTriggerIds.has(run.triggerId)) continue
      const entries = grouped.get(run.triggerId) ?? []
      if (entries.length < 3) entries.push(run)
      grouped.set(run.triggerId, entries)
    }
    return grouped
  }, [runs, scopedTriggers])

  const sortedTriggers = [...scopedTriggers].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.nextRunAt - b.nextRunAt
  })

  const activeCount = scopedTriggers.filter((trigger) => trigger.enabled).length

  function openCreate() {
    setDraft({
      ...makeDefaultDraft({ teams, statuses, projects }),
      companyId: !canAccessUnscoped && scopedCompanies.length === 1 ? scopedCompanies[0].id : '',
    })
    setModal({ mode: 'create' })
  }

  function openEdit(trigger: TriggerRow) {
    setDraft(makeDraftFromTrigger(trigger))
    setModal({ mode: 'edit', triggerId: trigger.id })
  }

  function closeModal() {
    setModal(null)
    setSaving(false)
  }

  async function submit() {
    if (!modal || !draft.name.trim() || !draft.title.trim() || !draft.teamId || !draft.statusId) return
    if (!draft.companyId && !canAccessUnscoped) return
    if (draft.companyId && !canAccessOrganization(draft.companyId)) return

    const schedule = scheduleFromDraft(draft)
    const nextRunAt = computeNextRunAt(schedule).getTime()
    const estimate = draft.estimate.trim() ? Number(draft.estimate) : undefined

    setSaving(true)
    try {
      if (modal.mode === 'create') {
        await z.mutate.pm_task_triggers.create({
          id: crypto.randomUUID(),
          name: draft.name.trim(),
          kind: draft.kind,
          frequency: draft.kind === 'recurring' ? draft.frequency : undefined,
          timezone: draft.timezone,
          schedule,
          enabled: draft.enabled,
          nextRunAt,
          companyId: draft.companyId || undefined,
          teamId: draft.teamId,
          projectId: draft.projectId || undefined,
          statusId: draft.statusId,
          assigneeId: draft.assigneeId || undefined,
          creatorId: user?.id,
          title: draft.title.trim(),
          description: draft.description.trim() || undefined,
          priority: draft.priority,
          estimate,
        })
      } else {
        const original = scopedTriggers.find((trigger) => trigger.id === modal.triggerId)
        const scheduleChanged = original ? hasScheduleChanged(original, schedule) : true
        const shouldRecompute = !original || scheduleChanged || (draft.enabled && !original.enabled)
        await z.mutate.pm_task_triggers.update({
          id: modal.triggerId,
          name: draft.name.trim(),
          kind: draft.kind,
          frequency: draft.kind === 'recurring' ? draft.frequency : null,
          timezone: draft.timezone,
          schedule,
          enabled: draft.enabled,
          nextRunAt: shouldRecompute ? nextRunAt : original.nextRunAt,
          companyId: draft.companyId || null,
          teamId: draft.teamId,
          projectId: draft.projectId || null,
          statusId: draft.statusId,
          assigneeId: draft.assigneeId || null,
          creatorId: user?.id ?? original?.creatorId ?? null,
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          priority: draft.priority,
          estimate: estimate ?? null,
        })
      }
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  async function remove(trigger: TriggerRow) {
    if (!confirm(`delete trigger "${trigger.name}"?`)) return
    await z.mutate.pm_task_triggers.delete({ id: trigger.id })
    closeModal()
  }

  async function toggleEnabled(trigger: TriggerRow) {
    const schedule = scheduleFromTrigger(trigger)
    await z.mutate.pm_task_triggers.update({
      id: trigger.id,
      enabled: !trigger.enabled,
      nextRunAt: !trigger.enabled ? computeNextRunAt(schedule).getTime() : trigger.nextRunAt,
    })
  }

  async function runDueNow() {
    setRunning(true)
    setRunMessage(null)
    try {
      const response = await authFetch(`${config.apiUrl}/task-triggers/run-due`, { method: 'POST' })
      if (!response.ok) throw new Error('run failed')
      const summary = await response.json()
      setRunMessage(`checked ${summary.checked}, created ${summary.created}, skipped ${summary.skipped}, failed ${summary.failed}`)
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : 'run failed')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (!modal) return
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeModal()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [modal])

  return (
    <div className="flex h-full min-h-0 flex-col text-fg-1">
      <div className="border-b border-edge/12 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-label text-fg-3">// triggers</div>
            <h1 className="font-mono text-xl lowercase text-fg-1">task triggers</h1>
            <p className="mt-0.5 text-xs text-fg-3">
              <span className="text-fg-4">&gt;</span> scheduled issues created by the hourly server runner
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAccessUnscoped && (
              <button
                onClick={runDueNow}
                disabled={running}
                className="inline-flex items-center gap-1.5 border border-edge/20 bg-pit-3 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-fg-2 transition hover:border-edge/35 hover:text-accent disabled:opacity-40"
                title="run due triggers now"
              >
                <RefreshCw className={`h-3 w-3 ${running ? 'animate-spin' : ''}`} />
                run due
              </button>
            )}
            <button
              onClick={openCreate}
              disabled={teams.length === 0 || (!canAccessUnscoped && scopedCompanies.length === 0)}
              className="inline-flex items-center gap-1.5 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              new trigger
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-label">
          <span className="border border-edge/15 bg-pit-3 px-2.5 py-1 text-fg-3">
            active <span className="text-accent">· {activeCount}</span>
          </span>
          <span className="border border-edge/15 bg-pit-3 px-2.5 py-1 text-fg-3">
            total <span className="text-fg-2">· {scopedTriggers.length}</span>
          </span>
          {runMessage && <span className="text-fg-4">{runMessage}</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {sortedTriggers.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-md">
              <div className="font-mono text-base lowercase text-fg-2">no triggers yet</div>
              <div className="mt-2 text-sm text-fg-3">
                Create a weekly, monthly, quarterly, or one-off trigger to have Pach open issues for you.
              </div>
              <button
                onClick={openCreate}
                disabled={teams.length === 0 || (!canAccessUnscoped && scopedCompanies.length === 0)}
                className="mt-5 inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                new trigger
              </button>
            </div>
          </div>
        ) : (
          <div className="border-y border-edge/12 bg-pit-2/60 backdrop-blur-sm">
            <div className="grid grid-cols-[28px_minmax(220px,1fr)_180px_170px_140px_82px] items-center gap-4 border-b border-edge/8 px-6 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
              <div />
              <div>trigger</div>
              <div>schedule</div>
              <div>next run</div>
              <div>template</div>
              <div className="text-right">runs</div>
            </div>
            {sortedTriggers.map((trigger) => {
              const triggerRuns = runsByTrigger.get(trigger.id) ?? []
              return (
                <div
                  key={trigger.id}
                  className="grid grid-cols-[28px_minmax(220px,1fr)_180px_170px_140px_82px] items-center gap-4 border-b border-edge/6 px-6 py-2.5 transition hover:bg-accent-fill/4 last:border-b-0"
                >
                  <button
                    onClick={() => toggleEnabled(trigger)}
                    className="flex h-7 w-7 items-center justify-center"
                    title={trigger.enabled ? 'disable trigger' : 'enable trigger'}
                  >
                    <ToggleSwitch enabled={trigger.enabled} />
                  </button>
                  <button onClick={() => openEdit(trigger)} className="min-w-0 text-left">
                    <div className="truncate font-mono text-sm lowercase text-fg-1">{trigger.name}</div>
                    <div className="mt-0.5 truncate text-xs text-fg-3">{trigger.title}</div>
                  </button>
                  <button onClick={() => openEdit(trigger)} className="text-left font-mono text-[10px] uppercase tracking-label text-fg-3">
                    <span className="text-fg-2">{scheduleLabel(trigger)}</span>
                  </button>
                  <button onClick={() => openEdit(trigger)} className="text-left font-mono text-xs text-fg-3">
                    {formatDateTime(trigger.nextRunAt, trigger.timezone)}
                  </button>
                  <button onClick={() => openEdit(trigger)} className="min-w-0 text-left font-mono text-[10px] uppercase tracking-label text-fg-3">
                    <span className="text-fg-2">{teamName(trigger.teamId, teams)}</span>
                    <span className="text-fg-4"> · {statusName(trigger.statusId, statuses)}</span>
                  </button>
                  <div className="text-right font-mono text-xs tabular-nums text-fg-3">
                    {triggerRuns.length ? (
                      <span className={triggerRuns[0]?.status === 'failed' ? 'text-fail' : 'text-accent'}>
                        {triggerRuns[0]?.status}
                      </span>
                    ) : (
                      <span className="text-fg-4">none</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <TriggerModal
          mode={modal.mode}
          draft={draft}
          setDraft={setDraft}
          teams={teams}
          statuses={statuses}
          projects={projects}
          companies={scopedCompanies}
          allowNoOrganization={canAccessUnscoped}
          users={users}
          saving={saving}
          onClose={closeModal}
          onSubmit={submit}
          onDelete={
            modal.mode === 'edit'
              ? () => {
                  const trigger = scopedTriggers.find((entry) => entry.id === modal.triggerId)
                  if (trigger) remove(trigger)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function TriggerModal({
  mode,
  draft,
  setDraft,
  teams,
  statuses,
  projects,
  companies,
  allowNoOrganization,
  users,
  saving,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: 'create' | 'edit'
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
  teams: TeamRow[]
  statuses: StatusRow[]
  projects: ProjectRow[]
  companies: CompanyRow[]
  allowNoOrganization: boolean
  users: UserRow[]
  saving: boolean
  onClose: () => void
  onSubmit: () => void
  onDelete?: () => void
}) {
  const statusOptions = getTriggerStatusOptions(statuses)
  const projectOptions = projects.filter((project) => !project.teamId || project.teamId === draft.teamId)
  const currentTeam = teams.find((team) => team.id === draft.teamId) ?? teams[0] ?? null
  const currentStatus = statusOptions.find((status) => status.id === draft.statusId)
  const currentProject = projectOptions.find((project) => project.id === draft.projectId)
  const currentCompany = companies.find((company) => company.id === draft.companyId)
  const currentAssignee = users.find((entry) => entry.id === draft.assigneeId)

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function changeTeam(teamId: string) {
    const nextProject = projects.find((project) => project.teamId === teamId)?.id ?? ''
    patch({ teamId, projectId: nextProject })
  }

  useEffect(() => {
    if (statusOptions.some((status) => status.id === draft.statusId)) return
    const fallbackStatusId = pickStatus(statusOptions)
    if (fallbackStatusId) patch({ statusId: fallbackStatusId })
  }, [draft.statusId, statusOptions])

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      if (draft.name.trim() && draft.title.trim() && (allowNoOrganization || draft.companyId) && !saving) onSubmit()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 px-4 pt-[7vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-auto border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between border-b border-edge/12 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <PachSelect
              variant="button"
              value={draft.teamId}
              onChange={changeTeam}
              options={teams.map((team) => ({ value: team.id, label: team.name.toLowerCase() }))}
              trigger={
                <span className="inline-flex items-center gap-1.5 border border-edge/25 bg-accent-fill/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-accent">
                  {currentTeam?.key ?? 'team'}
                </span>
              }
              triggerTitle="change team"
              triggerClassName="inline-flex p-0 border-0 bg-transparent transition hover:opacity-80"
              popupWidth="200px"
            />
            <span className="text-fg-4">›</span>
            <span className="text-fg-2 lowercase">{mode === 'create' ? 'new trigger' : 'edit trigger'}</span>
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
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="trigger name"
            className="w-full bg-transparent px-0 py-1 font-mono text-lg text-fg-1 outline-none placeholder:text-fg-4"
          />
          <input
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="issue title"
            className="w-full bg-transparent px-0 py-1 font-mono text-base text-fg-1 outline-none placeholder:text-fg-4"
          />
          <textarea
            value={draft.description}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="add issue description..."
            rows={3}
            className="w-full resize-none bg-transparent px-0 py-2 font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <PachSelect
            variant="button"
            value={draft.statusId}
            onChange={(value) => patch({ statusId: value })}
            options={statusOptions.map((status) => ({
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
            value={String(draft.priority)}
            onChange={(value) => patch({ priority: Number(value) })}
            options={[1, 2, 3, 4, 0].map((priority) => ({
              value: String(priority),
              label: PRIORITY_META[priority].label,
              icon: <PriorityIcon priority={priority} />,
            }))}
            trigger={
              <ComposerPill
                icon={<PriorityIcon priority={draft.priority} />}
                label={PRIORITY_META[draft.priority]?.label ?? 'priority'}
              />
            }
            triggerTitle="priority"
            triggerClassName="transition"
            popupWidth="180px"
          />

          <PachSelect
            variant="button"
            value={draft.assigneeId}
            onChange={(value) => patch({ assigneeId: value })}
            options={[
              { value: '', label: 'unassigned' },
              ...users.map((entry) => ({ value: entry.id, label: (entry.name ?? entry.email).toLowerCase() })),
            ]}
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
            value={draft.projectId}
            onChange={(value) => patch({ projectId: value })}
            options={[
              { value: '', label: 'no project' },
              ...projectOptions.map((project) => ({
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
            value={draft.estimate}
            onChange={(value) => patch({ estimate: value })}
            options={[
              { value: '', label: 'no estimate' },
              ...ESTIMATES.map((estimate) => ({ value: String(estimate), label: `${estimate} pts` })),
            ]}
            trigger={
              <ComposerPill
                icon={<span className="font-mono text-[10px] text-fg-3">#</span>}
                label={draft.estimate ? `${draft.estimate} pts` : 'estimate'}
              />
            }
            triggerTitle="estimate"
            triggerClassName="transition"
            popupWidth="160px"
          />

          <PachSelect
            variant="button"
            value={draft.companyId}
            onChange={(value) => patch({ companyId: value })}
            options={[
              ...(allowNoOrganization ? [{ value: '', label: 'no organization' }] : []),
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

        <div className="border-t border-edge/8 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-label text-fg-3">schedule</div>
            <button
              type="button"
              onClick={() => patch({ enabled: !draft.enabled })}
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:text-fg-1"
            >
              <ToggleSwitch enabled={draft.enabled} />
              {draft.enabled ? 'enabled' : 'disabled'}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-label text-fg-4">type</div>
              <div className="grid grid-cols-2 gap-2">
                <SegmentButton active={draft.kind === 'recurring'} label="recurring" onClick={() => patch({ kind: 'recurring' })} />
                <SegmentButton active={draft.kind === 'once'} label="one-off" onClick={() => patch({ kind: 'once' })} />
              </div>
            </div>

            {draft.kind === 'once' ? (
              <>
                <Field label="date">
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => patch({ date: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="time">
                  <input
                    type="time"
                    value={draft.time}
                    onChange={(event) => patch({ time: event.target.value })}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="frequency">
                  <select
                    value={draft.frequency}
                    onChange={(event) => patch({ frequency: event.target.value as Draft['frequency'] })}
                    className={inputClass}
                  >
                    <option value="weekly">weekly</option>
                    <option value="monthly">monthly</option>
                    <option value="quarterly">quarterly</option>
                  </select>
                </Field>
                {draft.frequency === 'weekly' ? (
                  <Field label="weekday">
                    <select
                      value={draft.dayOfWeek}
                      onChange={(event) => patch({ dayOfWeek: Number(event.target.value) })}
                      className={inputClass}
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="day">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.dayOfMonth}
                      onChange={(event) => patch({ dayOfMonth: Number(event.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                )}
              </>
            )}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr]">
            {draft.kind === 'recurring' && (
              <Field label="time">
                <input
                  type="time"
                  value={draft.time}
                  onChange={(event) => patch({ time: event.target.value })}
                  className={inputClass}
                />
              </Field>
            )}
            <Field label="timezone">
              <select
                value={draft.timezone}
                onChange={(event) => patch({ timezone: event.target.value || DEFAULT_TIMEZONE })}
                className={inputClass}
              >
                {TIMEZONES.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-3 border border-edge/12 bg-rim px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
            next <span className="text-accent">· {formatDateTime(computeNextRunAt(scheduleFromDraft(draft)).getTime(), draft.timezone)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-edge/12 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1"
            >
              [cancel]
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fail"
              >
                <Trash2 className="h-3.5 w-3.5" />
                [delete]
              </button>
            )}
          </div>
          <button
            onClick={onSubmit}
            disabled={!draft.name.trim() || !draft.title.trim() || !draft.teamId || !draft.statusId || (!allowNoOrganization && !draft.companyId) || saving}
            className="inline-flex items-center gap-2 border border-edge/30 bg-accent-fill/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-accent-fill/8 disabled:hover:shadow-none"
          >
            {mode === 'create' ? <CalendarClock className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'saving...' : mode === 'create' ? 'create trigger' : 'save trigger'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass = 'w-full bg-rim border border-edge/15 px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">{label}</div>
      {children}
    </label>
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

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-3.5 w-7 items-center border transition ${
        enabled
          ? 'border-edge/45 bg-accent-fill/14 shadow-glow-xs'
          : 'border-edge/18 bg-pit-3'
      }`}
    >
      <span
        className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 transition ${
          enabled
            ? 'left-[15px] bg-accent shadow-glow-xs'
            : 'left-1 bg-fg-4'
        }`}
      />
    </span>
  )
}

function SegmentButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-2 font-mono text-xs lowercase transition ${
        active
          ? 'border-edge/40 bg-accent-fill/6 text-accent shadow-glow-xs'
          : 'border-edge/15 bg-pit-3 text-fg-3 hover:border-edge/25 hover:text-fg-1'
      }`}
    >
      {label}
    </button>
  )
}

function makeDefaultDraft({
  teams,
  statuses,
  projects,
}: {
  teams: TeamRow[]
  statuses: StatusRow[]
  projects: ProjectRow[]
}): Draft {
  const teamId = teams[0]?.id ?? ''
  return {
    name: '',
    title: '',
    description: '',
    kind: 'recurring',
    frequency: 'monthly',
    date: todayInputValue(),
    dayOfWeek: 1,
    dayOfMonth: 1,
    time: DEFAULT_TIME,
    timezone: DEFAULT_TIMEZONE,
    enabled: true,
    teamId,
    statusId: pickStatus(getTriggerStatusOptions(statuses)),
    projectId: projects.find((project) => project.teamId === teamId)?.id ?? '',
    companyId: '',
    assigneeId: '',
    priority: 2,
    estimate: '',
  }
}

function makeDraftFromTrigger(trigger: TriggerRow): Draft {
  const schedule = scheduleFromTrigger(trigger)
  return {
    name: trigger.name,
    title: trigger.title,
    description: trigger.description ?? '',
    kind: schedule.kind,
    frequency: schedule.frequency ?? 'monthly',
    date: schedule.date ?? todayInputValue(),
    dayOfWeek: schedule.dayOfWeek ?? 1,
    dayOfMonth: schedule.dayOfMonth ?? 1,
    time: schedule.time || DEFAULT_TIME,
    timezone: trigger.timezone || schedule.timezone || DEFAULT_TIMEZONE,
    enabled: trigger.enabled,
    teamId: trigger.teamId,
    statusId: trigger.statusId,
    projectId: trigger.projectId ?? '',
    companyId: trigger.companyId ?? '',
    assigneeId: trigger.assigneeId ?? '',
    priority: trigger.priority,
    estimate: trigger.estimate == null ? '' : String(trigger.estimate),
  }
}

function scheduleFromTrigger(trigger: TriggerRow): Schedule {
  const raw = trigger.schedule ?? {}
  return {
    kind: trigger.kind === 'once' ? 'once' : 'recurring',
    frequency: trigger.frequency === 'weekly' || trigger.frequency === 'quarterly' ? trigger.frequency : 'monthly',
    timezone: trigger.timezone || String(raw.timezone || DEFAULT_TIMEZONE),
    date: typeof raw.date === 'string' ? raw.date : undefined,
    dayOfWeek: typeof raw.dayOfWeek === 'number' ? raw.dayOfWeek : undefined,
    dayOfMonth: typeof raw.dayOfMonth === 'number' ? raw.dayOfMonth : undefined,
    time: typeof raw.time === 'string' ? raw.time : DEFAULT_TIME,
  }
}

function scheduleFromDraft(draft: Draft): Schedule {
  if (draft.kind === 'once') {
    return {
      kind: 'once',
      timezone: draft.timezone,
      date: draft.date,
      time: draft.time || DEFAULT_TIME,
    }
  }

  return {
    kind: 'recurring',
    frequency: draft.frequency,
    timezone: draft.timezone,
    dayOfWeek: draft.frequency === 'weekly' ? draft.dayOfWeek : undefined,
    dayOfMonth: draft.frequency !== 'weekly' ? clamp(draft.dayOfMonth, 1, 31) : undefined,
    time: draft.time || DEFAULT_TIME,
  }
}

function hasScheduleChanged(trigger: TriggerRow, schedule: Schedule) {
  return JSON.stringify(scheduleFromTrigger(trigger)) !== JSON.stringify(schedule)
}

function getTriggerStatusOptions(statuses: StatusRow[]) {
  const byKey = new Map<string, StatusRow>()

  for (const key of TRIGGER_STATUS_KEYS) {
    const workspaceStatus = statuses.find((status) => !status.teamId && status.key === key)
    const fallbackStatus = statuses.find((status) => status.key === key)
    const status = workspaceStatus ?? fallbackStatus
    if (status) byKey.set(key, status)
  }

  return TRIGGER_STATUS_KEYS
    .map((key) => byKey.get(key))
    .filter((status): status is StatusRow => Boolean(status))
}

function pickStatus(statuses: StatusRow[]) {
  return (
    statuses.find((status) => status.key === 'todo')?.id ??
    statuses[0]?.id ??
    ''
  )
}

function scheduleLabel(trigger: TriggerRow) {
  const schedule = scheduleFromTrigger(trigger)
  if (schedule.kind === 'once') return 'one-off'
  if (schedule.frequency === 'weekly') {
    const day = WEEKDAYS.find((entry) => entry.value === schedule.dayOfWeek)?.label ?? 'weekly'
    return `weekly · ${day}`
  }
  if (schedule.frequency === 'quarterly') return `quarterly · day ${schedule.dayOfMonth ?? 1}`
  return `monthly · day ${schedule.dayOfMonth ?? 1}`
}

function teamName(teamId: string, teams: TeamRow[]) {
  return teams.find((team) => team.id === teamId)?.name ?? 'team'
}

function statusName(statusId: string, statuses: StatusRow[]) {
  return statuses.find((status) => status.id === statusId)?.name ?? 'status'
}

function todayInputValue() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function formatDateTime(value: number, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function computeNextRunAt(schedule: Schedule, from = new Date()) {
  const [hour, minute] = parseTime(schedule.time)

  if (schedule.kind === 'once') {
    const date = parseDateParts(schedule.date, getZonedParts(from, schedule.timezone))
    return zonedTimeToUtc(date.year, date.month - 1, date.day, hour, minute, schedule.timezone)
  }

  if (schedule.frequency === 'weekly') {
    return nextWeeklyRun(schedule.dayOfWeek ?? 1, hour, minute, from, schedule.timezone)
  }

  if (schedule.frequency === 'quarterly') {
    return nextMonthlyRun(schedule.dayOfMonth ?? 1, hour, minute, from, 3, schedule.timezone)
  }

  return nextMonthlyRun(schedule.dayOfMonth ?? 1, hour, minute, from, 1, schedule.timezone)
}

function parseTime(value: string | undefined): [number, number] {
  const [hourRaw, minuteRaw] = (value || DEFAULT_TIME).split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  return [
    Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
    Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  ]
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseDateParts(value: string | undefined, fallback: ZonedParts) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return { year, month, day }
  }
  return { year: fallback.year, month: fallback.month, day: fallback.day }
}

function nextWeeklyRun(dayOfWeek: number, hour: number, minute: number, from: Date, timezone: string) {
  const normalizedDay = clamp(dayOfWeek, 0, 6)
  const parts = getZonedParts(from, timezone)
  const currentWeekday = getWeekday(parts.year, parts.month - 1, parts.day)
  const daysUntil = (normalizedDay - currentWeekday + 7) % 7
  let wallDate = addDays(parts.year, parts.month - 1, parts.day, daysUntil)
  let candidate = zonedTimeToUtc(wallDate.year, wallDate.month, wallDate.day, hour, minute, timezone)
  if (candidate <= from) {
    wallDate = addDays(wallDate.year, wallDate.month, wallDate.day, 7)
    candidate = zonedTimeToUtc(wallDate.year, wallDate.month, wallDate.day, hour, minute, timezone)
  }
  return candidate
}

function nextMonthlyRun(dayOfMonth: number, hour: number, minute: number, from: Date, intervalMonths: number, timezone: string) {
  const normalizedDay = clamp(dayOfMonth, 1, 31)
  const parts = getZonedParts(from, timezone)
  let year = parts.year
  let month = parts.month - 1

  while (true) {
    const candidate = makeMonthlyCandidate(year, month, normalizedDay, hour, minute, timezone)
    if (candidate > from) return candidate
    month += intervalMonths
    while (month > 11) {
      year += 1
      month -= 12
    }
  }
}

function makeMonthlyCandidate(year: number, month: number, dayOfMonth: number, hour: number, minute: number, timezone: string) {
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return zonedTimeToUtc(year, month, Math.min(dayOfMonth, maxDay), hour, minute, timezone)
}

function getZonedParts(value: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value)

  const lookup = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
    minute: Number(lookup.get('minute')),
    second: Number(lookup.get('second')),
  }
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  let utc = new Date(Date.UTC(year, month, day, hour, minute, 0, 0))

  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(utc, timezone)
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0)
    const desired = Date.UTC(year, month, day, hour, minute, 0, 0)
    utc = new Date(utc.getTime() - (actual - desired))
  }

  return utc
}

function getWeekday(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).getUTCDay()
}

function addDays(year: number, month: number, day: number, amount: number) {
  const date = new Date(Date.UTC(year, month, day))
  date.setUTCDate(date.getUTCDate() + amount)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
