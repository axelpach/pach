import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FolderKanban,
} from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { useAuth } from '../../lib/auth'
import { PachSelect } from './PachSelect'
import { StatusIcon } from './StatusIcon'
import { PriorityIcon } from './PriorityIcon'

const PRIORITY_OPTIONS = [
  { value: 0, label: 'no priority', accent: 'text-fg-3' },
  { value: 1, label: 'urgent', accent: 'text-fail' },
  { value: 2, label: 'high', accent: 'text-amber' },
  { value: 3, label: 'medium', accent: 'text-pach-info' },
  { value: 4, label: 'low', accent: 'text-accent' },
] as const

const ESTIMATE_OPTIONS = [1, 2, 3, 4, 8, 16]

export default function IssueDetail() {
  const { issueId } = useParams<{ issueId: string }>()
  const navigate = useNavigate()
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()

  const [allIssues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
  const [users] = useQuery(z.query.users.orderBy('email', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [projects] = useQuery(z.query.pm_projects.orderBy('name', 'asc'))
  const [statuses] = useQuery(z.query.pm_statuses.orderBy('position', 'asc'))
  const [activity] = useQuery(
    z.query.pm_issue_activity.where('issueId', issueId ?? '').orderBy('createdAt', 'asc'),
  )

  const issue = allIssues.find((entry) => entry.id === issueId) ?? null

  const team = issue ? teams.find((t) => t.id === issue.teamId) ?? null : null
  const project = issue?.projectId ? projects.find((p) => p.id === issue.projectId) ?? null : null
  const status = issue ? statuses.find((s) => s.id === issue.statusId) ?? null : null
  const assignee = issue?.assigneeId ? users.find((u) => u.id === issue.assigneeId) ?? null : null
  const company = issue?.contextCompanyId
    ? companies.find((c) => c.id === issue.contextCompanyId) ?? null
    : null

  const teamStatuses = team ? statuses.filter((s) => s.teamId === team.id) : []
  const teamProjects = team ? projects.filter((p) => p.teamId === team.id) : []
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

  async function commitTitle() {
    if (!issue) return
    const next = titleDraft.trim()
    if (!next || next === issue.title) return
    await patchIssue({ title: next }, `renamed issue to "${next}"`)
  }

  async function commitDescription() {
    if (!issue) return
    const next = descDraft
    const current = issue.description ?? ''
    if (next === current) return
    await patchIssue({ description: next }, current ? 'updated description' : 'added a description')
  }

  if (!issueId) {
    return <NotFound onBack={() => navigate('/issues')} />
  }

  if (!issue) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden text-fg-1">
        <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-label text-fg-3">
          // loading issue…
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden text-fg-1">
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
        <div className="flex-1 min-h-0 overflow-hidden flex">
          {/* main column */}
          <div className="flex-1 min-w-0 overflow-auto px-10 py-8">
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

              <AutoGrowTextarea
                value={descDraft}
                onChange={setDescDraft}
                onFocus={() => setDescFocused(true)}
                onBlur={async () => {
                  await commitDescription()
                  setDescFocused(false)
                }}
                placeholder="add description…"
                className="mt-2 w-full resize-none bg-transparent font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4 focus:bg-[rgba(0,255,136,0.03)] px-2 py-2 -ml-2"
              />

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
          <aside className="w-[300px] shrink-0 border-l border-[rgba(0,255,140,0.12)] bg-[rgba(5,6,5,0.6)] backdrop-blur-sm overflow-auto">
            <div className="border-b border-[rgba(0,255,140,0.1)] px-5 py-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-label text-fg-4">◊ properties</div>

              <PropertyRow label="status" icon={<StatusIcon statusType={status?.type ?? 'backlog'} />}>
                <InlineSelect
                  value={issue.statusId}
                  onChange={async (next) => {
                    if (next === issue.statusId) return
                    const newStatus = teamStatuses.find((s) => s.id === next)
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
                  options={teamStatuses.map((s) => ({ value: s.id, label: s.name.toLowerCase() }))}
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
    <div className="flex-1 min-h-0 overflow-hidden text-fg-1">
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

function AutoGrowTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void | Promise<void>
  placeholder: string
  className: string
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
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
