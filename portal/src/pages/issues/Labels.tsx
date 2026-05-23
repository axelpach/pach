import { useEffect, useState } from 'react'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { Check, Plus, Tag } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'

type LabelRow = Schema['tables']['pm_labels']['row']

type LabelScope =
  | { kind: 'global' }
  | { kind: 'company'; companyId: string }
  | { kind: 'team'; teamId: string }

const PALETTE = [
  '#00ff88', // phosphor
  '#22cc77',
  '#5ad6ff',
  '#ffb547',
  '#ff4d6d',
  '#a78bfa',
  '#f472b6',
  '#9bd9b3',
  '#5a8a72',
] as const

const DEFAULT_COLOR = PALETTE[0]

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; labelId: string }
  | null

export default function Labels() {
  const z = useZero<Schema, Mutators>()
  const [labels] = useQuery(z.query.pm_labels.orderBy('name', 'asc'))
  const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
  const [teams] = useQuery(z.query.pm_teams.orderBy('position', 'asc'))
  const [issueLabelLinks] = useQuery(z.query.pm_issue_labels)

  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'company' | 'team'>('all')
  const [modal, setModal] = useState<ModalState>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftColor, setDraftColor] = useState<string>(DEFAULT_COLOR)
  const [draftScope, setDraftScope] = useState<LabelScope>({ kind: 'global' })
  const [saving, setSaving] = useState(false)

  const usageCount = new Map<string, number>()
  for (const link of issueLabelLinks) {
    usageCount.set(link.labelId, (usageCount.get(link.labelId) ?? 0) + 1)
  }

  function scopeOf(label: LabelRow): LabelScope {
    if (label.teamId) return { kind: 'team', teamId: label.teamId }
    if (label.companyId) return { kind: 'company', companyId: label.companyId }
    return { kind: 'global' }
  }

  function scopeLabel(scope: LabelScope) {
    if (scope.kind === 'global') return { tag: 'global', value: '—', accent: 'text-accent' }
    if (scope.kind === 'company') {
      const c = companies.find((entry) => entry.id === scope.companyId)
      return { tag: 'company', value: c?.name ?? '—', accent: 'text-amber' }
    }
    const t = teams.find((entry) => entry.id === scope.teamId)
    return { tag: 'team', value: t?.name ?? '—', accent: 'text-pach-info' }
  }

  const filtered = labels.filter((label) => {
    if (scopeFilter === 'all') return true
    return scopeOf(label).kind === scopeFilter
  })

  function openCreate() {
    setDraftName('')
    setDraftDescription('')
    setDraftColor(DEFAULT_COLOR)
    setDraftScope({ kind: 'global' })
    setModal({ mode: 'create' })
  }

  function openEdit(label: LabelRow) {
    setDraftName(label.name)
    setDraftDescription(label.description ?? '')
    setDraftColor(label.color || DEFAULT_COLOR)
    setDraftScope(scopeOf(label))
    setModal({ mode: 'edit', labelId: label.id })
  }

  function closeModal() {
    setModal(null)
    setSaving(false)
  }

  async function submit() {
    if (!modal) return
    const name = draftName.trim()
    if (!name) return

    setSaving(true)
    try {
      const scopeFields = (() => {
        if (draftScope.kind === 'global') return { companyId: null, teamId: null }
        if (draftScope.kind === 'company') return { companyId: draftScope.companyId, teamId: null }
        return { companyId: null, teamId: draftScope.teamId }
      })()

      if (modal.mode === 'create') {
        await z.mutate.pm_labels.create({
          id: crypto.randomUUID(),
          name,
          description: draftDescription.trim() || undefined,
          color: draftColor,
          companyId: scopeFields.companyId ?? undefined,
          teamId: scopeFields.teamId ?? undefined,
        })
      } else {
        await z.mutate.pm_labels.update({
          id: modal.labelId,
          name,
          description: draftDescription.trim() || undefined,
          color: draftColor,
          companyId: scopeFields.companyId,
          teamId: scopeFields.teamId,
        })
      }
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  async function remove(label: LabelRow) {
    if (!confirm(`delete label "${label.name}"?`)) return
    // delete all join rows for this label first, then the label itself
    const links = issueLabelLinks.filter((entry) => entry.labelId === label.id)
    for (const link of links) {
      await z.mutate.pm_issue_labels.delete({ id: link.id })
    }
    await z.mutate.pm_labels.delete({ id: label.id })
    closeModal()
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
      <div className="border-b border-[rgba(0,255,140,0.12)] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-label text-fg-3 mb-1">◊ labels</div>
            <h1 className="font-mono text-xl lowercase text-fg-1">labels</h1>
            <p className="text-xs text-fg-3 mt-0.5">
              <span className="text-fg-4">›</span> define labels global, by company or by team
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
          >
            <Plus className="h-3 w-3" />
            new label
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['all', 'global', 'company', 'team'] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setScopeFilter(scope)}
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-label transition ${
                scopeFilter === scope
                  ? 'border-[rgba(0,255,140,0.35)] bg-[rgba(0,255,136,0.06)] text-accent shadow-glow-xs'
                  : 'border-[rgba(0,255,140,0.15)] bg-pit-3 text-fg-3 hover:text-fg-1 hover:border-[rgba(0,255,140,0.25)]'
              }`}
            >
              {scope}
              <span className="text-fg-4">
                · {scope === 'all' ? labels.length : labels.filter((l) => scopeOf(l).kind === scope).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-md">
              <div className="font-mono text-base lowercase text-fg-2">
                {labels.length === 0 ? 'no labels yet' : 'no labels match this filter'}
              </div>
              <div className="mt-2 text-sm text-fg-3">
                {labels.length === 0
                  ? 'create one to start tagging issues across teams or companies.'
                  : 'try another scope or create a new label.'}
              </div>
              <button
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs"
              >
                <Plus className="h-3 w-3" />
                new label
              </button>
            </div>
          </div>
        ) : (
          <div className="border-y border-[rgba(0,255,140,0.12)] bg-[rgba(10,14,12,0.6)] backdrop-blur-sm">
            <div className="flex items-center gap-4 border-b border-[rgba(0,255,140,0.08)] px-6 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
              <div className="w-[18px] shrink-0" />
              <div className="min-w-0 flex-1">name</div>
              <div className="hidden md:block w-[260px] shrink-0">description</div>
              <div className="w-[140px] shrink-0">scope</div>
              <div className="w-[70px] shrink-0 text-right">issues</div>
            </div>
            {filtered.map((label) => {
              const color = label.color || DEFAULT_COLOR
              const scope = scopeOf(label)
              const s = scopeLabel(scope)
              const count = usageCount.get(label.id) ?? 0
              return (
                <button
                  key={label.id}
                  onClick={() => openEdit(label)}
                  className="flex w-full items-center gap-4 border-b border-[rgba(0,255,140,0.06)] px-6 py-2.5 text-left transition hover:bg-[rgba(0,255,136,0.04)] last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="block h-3 w-3 shrink-0 rounded-full"
                    style={{ background: color, boxShadow: `0 0 6px ${color}55` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm lowercase text-fg-1 truncate">{label.name}</div>
                  </div>
                  <div className="hidden md:block w-[260px] shrink-0 truncate text-xs text-fg-3">
                    {label.description || <span className="text-fg-4">// no description</span>}
                  </div>
                  <div className="w-[140px] shrink-0 font-mono text-[10px] uppercase tracking-label">
                    <span className={s.accent}>{s.tag}</span>
                    {s.value !== '—' && <span className="text-fg-4"> · {s.value}</span>}
                  </div>
                  <div className="w-[70px] shrink-0 text-right font-mono text-xs text-fg-3 tabular-nums">{count}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <LabelModal
          mode={modal.mode}
          name={draftName}
          onNameChange={setDraftName}
          description={draftDescription}
          onDescriptionChange={setDraftDescription}
          color={draftColor}
          onColorChange={setDraftColor}
          scope={draftScope}
          onScopeChange={setDraftScope}
          companies={companies}
          teams={teams}
          saving={saving}
          onClose={closeModal}
          onSubmit={submit}
          onDelete={
            modal.mode === 'edit'
              ? () => {
                  const label = labels.find((l) => l.id === modal.labelId)
                  if (label) remove(label)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function LabelModal({
  mode,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  color,
  onColorChange,
  scope,
  onScopeChange,
  companies,
  teams,
  saving,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: 'create' | 'edit'
  name: string
  onNameChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
  color: string
  onColorChange: (v: string) => void
  scope: LabelScope
  onScopeChange: (v: LabelScope) => void
  companies: Schema['tables']['companies']['row'][]
  teams: Schema['tables']['pm_teams']['row'][]
  saving: boolean
  onClose: () => void
  onSubmit: () => void
  onDelete?: () => void
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
            {mode === 'create' ? '◊ labels · create' : '◊ labels · edit'}
          </div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">
            {mode === 'create' ? 'new label' : 'edit label'}
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">name</div>
            <input
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="$ bug, feature, urgent…"
              className="w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <label className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">description</div>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="$ optional context for this label"
              rows={2}
              className="w-full resize-none bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4"
            />
          </label>

          <div className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">color</div>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((swatch) => {
                const isActive = swatch === color
                return (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => onColorChange(swatch)}
                    className={`flex h-6 w-6 items-center justify-center border transition ${
                      isActive
                        ? 'border-[rgba(0,255,140,0.5)] shadow-glow-xs'
                        : 'border-[rgba(0,255,140,0.15)] hover:border-[rgba(0,255,140,0.3)]'
                    }`}
                    title={swatch}
                  >
                    <span
                      aria-hidden
                      className="block h-3 w-3 rounded-full"
                      style={{ background: swatch, boxShadow: `0 0 6px ${swatch}55` }}
                    />
                    {isActive && <Check className="absolute h-3 w-3 text-pit" strokeWidth={3} style={{ display: 'none' }} />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="block">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-3">scope</div>
            <div className="space-y-2">
              <ScopeRadio
                checked={scope.kind === 'global'}
                onClick={() => onScopeChange({ kind: 'global' })}
                label="global"
                description="available to every team and company"
              />
              <ScopeRadio
                checked={scope.kind === 'company'}
                onClick={() =>
                  onScopeChange({
                    kind: 'company',
                    companyId: scope.kind === 'company' ? scope.companyId : companies[0]?.id ?? '',
                  })
                }
                label="by company"
                description="only usable on issues with this company context"
              />
              {scope.kind === 'company' && (
                <select
                  value={scope.companyId}
                  onChange={(event) => onScopeChange({ kind: 'company', companyId: event.target.value })}
                  className="ml-6 w-[calc(100%-1.5rem)] bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-1.5 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs"
                >
                  {companies.length === 0 && <option value="">no companies</option>}
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <ScopeRadio
                checked={scope.kind === 'team'}
                onClick={() =>
                  onScopeChange({
                    kind: 'team',
                    teamId: scope.kind === 'team' ? scope.teamId : teams[0]?.id ?? '',
                  })
                }
                label="by team"
                description="only usable on issues in this team"
              />
              {scope.kind === 'team' && (
                <select
                  value={scope.teamId}
                  onChange={(event) => onScopeChange({ kind: 'team', teamId: event.target.value })}
                  className="ml-6 w-[calc(100%-1.5rem)] bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-1.5 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs"
                >
                  {teams.length === 0 && <option value="">no teams</option>}
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[rgba(0,255,140,0.12)] px-6 py-4">
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
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-label text-fg-4 transition hover:text-fail"
              >
                [delete]
              </button>
            )}
          </div>
          <button
            onClick={onSubmit}
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-2 border border-[rgba(0,255,140,0.3)] bg-[rgba(0,255,136,0.08)] px-4 py-2 font-mono text-xs uppercase tracking-label text-accent transition hover:bg-[rgba(0,255,136,0.16)] hover:shadow-glow-xs disabled:opacity-40 disabled:hover:bg-[rgba(0,255,136,0.08)] disabled:hover:shadow-none"
          >
            <Tag className="h-3.5 w-3.5" />
            {saving ? (mode === 'create' ? 'creating…' : 'saving…') : (mode === 'create' ? 'create label' : 'save label')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScopeRadio({
  checked,
  onClick,
  label,
  description,
}: {
  checked: boolean
  onClick: () => void
  label: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 border px-3 py-2 text-left transition ${
        checked
          ? 'border-[rgba(0,255,140,0.4)] bg-[rgba(0,255,136,0.05)]'
          : 'border-[rgba(0,255,140,0.12)] hover:border-[rgba(0,255,140,0.25)] hover:bg-[rgba(0,255,136,0.03)]'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition ${
          checked ? 'border-accent' : 'border-[rgba(0,255,140,0.25)]'
        }`}
      >
        {checked && <span className="block h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-xs lowercase text-fg-1">{label}</span>
        <span className="block mt-0.5 text-[11px] text-fg-3">{description}</span>
      </span>
    </button>
  )
}
