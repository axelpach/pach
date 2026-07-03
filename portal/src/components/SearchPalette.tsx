import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { FileText, Search } from 'lucide-react'
import type { Schema } from '../zero-schema'
import type { Mutators } from '../mutators'
import { useAuth } from '../lib/auth'
import { StatusIcon } from '../pages/issues/StatusIcon'
import { PriorityIcon, PRIORITY_META } from '../pages/issues/PriorityIcon'

const MAX_RESULTS = 30
const MAX_ISSUE_RESULTS = 20

type DocumentRow = Schema['tables']['documents']['row']
type IssueRow = Schema['tables']['pm_issues']['row']
type StatusRow = Schema['tables']['pm_statuses']['row']
type SavedViewRow = Schema['tables']['pm_saved_views']['row']
type PaletteTab = { label: string; path: string; icon: ComponentType<{ className?: string }> }
type PaletteResult =
  | { kind: 'tab'; id: string; label: string; path: string; icon: ComponentType<{ className?: string }> }
  | { kind: 'view'; id: string; view: SavedViewRow }
  | { kind: 'issue'; id: string; issue: IssueRow }
  | { kind: 'document'; id: string; document: DocumentRow }

export function SearchPalette({ tabs }: { tabs: PaletteTab[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [pointerMoved, setPointerMoved] = useState(false)
  const navigate = useNavigate()
  const z = useZero<Schema, Mutators>()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [documents] = useQuery(z.query.documents.orderBy('updatedAt', 'desc'))
  const [statuses] = useQuery(z.query.pm_statuses)
  const [savedViews] = useQuery(z.query.pm_saved_views.orderBy('position', 'asc'))

  const statusMap = useMemo(() => {
    const m = new Map<string, StatusRow>()
    for (const s of statuses) m.set(s.id, s)
    return m
  }, [statuses])

  // global Cmd/Ctrl + K
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const isOpenShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k'
      if (isOpenShortcut) {
        event.preventDefault()
        setOpen((v) => !v)
        return
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // when opening, reset state + focus the input
  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlight(0)
    setPointerMoved(false)
    requestAnimationFrame(() => inputRef.current?.focus())
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open])

  const personalSavedViews = useMemo(
    () =>
      savedViews
        .filter((view) => view.scope === 'personal' && view.ownerId === user?.id && view.slug !== 'all-issues')
        .sort((a, b) => {
          const positionDiff = a.position - b.position
          if (positionDiff !== 0) return positionDiff
          return a.name.localeCompare(b.name)
        }),
    [savedViews, user?.id],
  )

  const results = useMemo<PaletteResult[]>(() => {
    const q = query.trim().toLowerCase()
    const matches = (value: string | null | undefined) => !q || (value ?? '').toLowerCase().includes(q)
    const canAccessOrganization = (organizationId: string | null | undefined) =>
      organizationId ? (user?.organizationIds ?? []).includes(organizationId) : user?.canAccessUnscoped ?? false
    const documentResults = documents
      .filter((document) => document.status !== 'archived')
      .filter((document) => canAccessOrganization(document.organizationId))
      .filter((document) => matches(document.title))
      .sort((a, b) => {
        const aTitle = a.title.toLowerCase()
        const bTitle = b.title.toLowerCase()
        if (q && aTitle.startsWith(q) !== bTitle.startsWith(q)) return aTitle.startsWith(q) ? -1 : 1
        return b.updatedAt - a.updatedAt
      })
      .map((document) => ({ kind: 'document' as const, id: `document:${document.id}`, document }))
    const tabResults = tabs
      .filter((tab) => matches(tab.label) || matches(tab.path))
      .map((tab) => ({ kind: 'tab' as const, id: `tab:${tab.path}`, label: tab.label, path: tab.path, icon: tab.icon }))
    const viewResults = personalSavedViews
      .filter((view) => matches(view.name) || matches(view.slug))
      .map((view) => ({ kind: 'view' as const, id: `view:${view.id}`, view }))

    if (!q) {
      return [
        ...tabResults,
        ...viewResults,
        ...issues.slice(0, Math.min(MAX_ISSUE_RESULTS, Math.max(0, MAX_RESULTS - tabResults.length - viewResults.length))).map((issue) => ({
          kind: 'issue' as const,
          id: `issue:${issue.id}`,
          issue,
        })),
        ...documentResults.slice(0, Math.max(0, MAX_RESULTS - tabResults.length - viewResults.length - Math.min(MAX_ISSUE_RESULTS, issues.length))),
      ].slice(0, MAX_RESULTS)
    }

    const scored: Array<{ issue: IssueRow; score: number }> = []
    for (const issue of issues) {
      const title = issue.title.toLowerCase()
      const desc = issue.description?.toLowerCase() ?? ''
      const ident = issue.identifier.toLowerCase()
      let score = 0
      if (ident === q) score = 1000
      else if (ident.startsWith(q)) score = 800
      else if (title.startsWith(q)) score = 600
      else if (title.includes(q)) score = 400
      else if (ident.includes(q)) score = 300
      else if (desc.includes(q)) score = 150
      if (score === 0) continue
      // small recency tie-breaker
      score += Math.min(50, Math.floor(issue.updatedAt / 1_000_000_000))
      scored.push({ issue, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const remaining = Math.max(0, MAX_RESULTS - tabResults.length - viewResults.length)
    const issueCount = Math.min(MAX_ISSUE_RESULTS, remaining, scored.length)
    return [
      ...tabResults,
      ...viewResults,
      ...scored.slice(0, issueCount).map((entry) => ({
        kind: 'issue' as const,
        id: `issue:${entry.issue.id}`,
        issue: entry.issue,
      })),
      ...documentResults.slice(0, Math.max(0, remaining - issueCount)),
    ].slice(0, MAX_RESULTS)
  }, [documents, issues, personalSavedViews, query, tabs, user?.canAccessUnscoped, user?.organizationIds])

  useEffect(() => {
    setHighlight(0)
    setPointerMoved(false)
  }, [query])

  // keep highlighted item in view
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const el = list.querySelector<HTMLElement>(`[data-result-index="${highlight}"]`)
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [highlight, open])

  function commit(result: PaletteResult) {
    setOpen(false)
    if (result.kind === 'tab') navigate(result.path)
    else if (result.kind === 'view') navigate(`/issues?view=${result.view.id}`)
    else if (result.kind === 'issue') navigate(`/issues/${result.issue.id}`)
    else navigate(`/docs/${result.document.id}`)
  }

  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => (results.length === 0 ? 0 : (h + 1) % results.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => (results.length === 0 ? 0 : (h - 1 + results.length) % results.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = results[highlight]
      if (target) commit(target)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4 bg-overlay/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl border border-edge/25 bg-pit shadow-terminal-popover"
        onClick={(event) => event.stopPropagation()}
      >
        {/* search input */}
        <div className="flex items-center gap-2 border-b border-edge/12 px-4 py-3">
          <Search className="h-4 w-4 text-fg-4 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKey}
            placeholder="$ search tabs, views, issues, docs..."
            className="flex-1 bg-transparent font-mono text-sm text-fg-1 outline-none placeholder:text-fg-4"
          />
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <kbd className="border border-edge/15 bg-pit-3 px-1.5 py-0.5 text-fg-3">esc</kbd>
            to close
          </span>
        </div>

        {/* results */}
        <div ref={listRef} className="max-h-[60vh] overflow-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center font-mono text-xs text-fg-4">
              {query.trim() ? '// no matches' : '// type to search'}
            </div>
          ) : (
            <>
              <div className="px-4 pt-2 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
              {query.trim() ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'quick access'}
              </div>
              {results.map((result, index) => {
                const isHighlighted = index === highlight
                const previous = results[index - 1]
                const showSection = !previous || previous.kind !== result.kind
                return (
                  <div key={result.id}>
                    {showSection && (
                      <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
                        {result.kind === 'tab' ? 'tabs' : result.kind === 'view' ? 'views' : result.kind === 'issue' ? 'issues' : 'docs'}
                      </div>
                    )}
                    <PaletteResultButton
                      result={result}
                      statusMap={statusMap}
                      isHighlighted={isHighlighted}
                      index={index}
                      pointerMoved={pointerMoved}
                      onPointerMove={() => {
                        setPointerMoved(true)
                        setHighlight(index)
                      }}
                      onCommit={() => commit(result)}
                    />
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* footer hints */}
        <div className="flex flex-wrap items-center gap-3 border-t border-edge/12 px-4 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
          <span className="inline-flex items-center gap-1">
            <kbd className="border border-edge/15 bg-pit-3 px-1.5 py-0.5 text-fg-3">↑↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="border border-edge/15 bg-pit-3 px-1.5 py-0.5 text-fg-3">↵</kbd>
            open
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-fg-4">
            <kbd className="border border-edge/15 bg-pit-3 px-1.5 py-0.5 text-fg-3">⌘K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  )
}

function PaletteResultButton({
  result,
  statusMap,
  isHighlighted,
  index,
  pointerMoved,
  onPointerMove,
  onCommit,
}: {
  result: PaletteResult
  statusMap: Map<string, StatusRow>
  isHighlighted: boolean
  index: number
  pointerMoved: boolean
  onPointerMove: () => void
  onCommit: () => void
}) {
  const className = `flex w-full items-center gap-3 px-4 py-2 text-left transition ${
    isHighlighted
      ? 'bg-accent-fill/8'
      : pointerMoved ? 'hover:bg-accent-fill/4' : ''
  }`

  if (result.kind === 'tab') {
    const Icon = result.icon
    return (
      <button data-result-index={index} onPointerMove={onPointerMove} onClick={onCommit} className={className}>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-3">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{result.label}</span>
        <span className="hidden sm:inline-flex shrink-0 font-mono text-[10px] uppercase tracking-label text-fg-4">
          {result.path}
        </span>
      </button>
    )
  }

  if (result.kind === 'view') {
    return (
      <button data-result-index={index} onPointerMove={onPointerMove} onClick={onCommit} className={className}>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[10px] uppercase tracking-label text-accent">
          ◇
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{result.view.name}</span>
        <span className="hidden sm:inline-flex shrink-0 font-mono text-[10px] uppercase tracking-label text-fg-4">
          saved view
        </span>
      </button>
    )
  }

  if (result.kind === 'document') {
    return (
      <button data-result-index={index} onPointerMove={onPointerMove} onClick={onCommit} className={className}>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-3">
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{result.document.title}</span>
        <span className="hidden sm:inline-flex shrink-0 font-mono text-[10px] uppercase tracking-label text-fg-4">
          document
        </span>
      </button>
    )
  }

  const issue = result.issue
  const status = statusMap.get(issue.statusId)
  return (
    <button data-result-index={index} onPointerMove={onPointerMove} onClick={onCommit} className={className}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <StatusIcon statusType={status?.type ?? 'backlog'} />
      </span>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <PriorityIcon priority={issue.priority} />
      </span>
      <span className="font-mono text-xs text-accent/80 tabular-nums shrink-0">{issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg-1">{issue.title}</span>
      <span className="hidden sm:inline-flex shrink-0 font-mono text-[10px] uppercase tracking-label text-fg-4">
        {PRIORITY_META[issue.priority]?.label ?? '—'}
      </span>
    </button>
  )
}
