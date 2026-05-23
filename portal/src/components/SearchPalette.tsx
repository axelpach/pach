import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import { Search } from 'lucide-react'
import type { Schema } from '../zero-schema'
import type { Mutators } from '../mutators'
import { StatusIcon } from '../pages/issues/StatusIcon'
import { PriorityIcon, PRIORITY_META } from '../pages/issues/PriorityIcon'

const MAX_RESULTS = 30

type IssueRow = Schema['tables']['pm_issues']['row']
type StatusRow = Schema['tables']['pm_statuses']['row']

export function SearchPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const navigate = useNavigate()
  const z = useZero<Schema, Mutators>()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [issues] = useQuery(z.query.pm_issues.orderBy('updatedAt', 'desc'))
  const [statuses] = useQuery(z.query.pm_statuses)

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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // no query: show most recently updated issues as quick access
      return issues.slice(0, MAX_RESULTS)
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
    return scored.slice(0, MAX_RESULTS).map((entry) => entry.issue)
  }, [issues, query])

  useEffect(() => {
    setHighlight(0)
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

  function commit(issue: IssueRow) {
    setOpen(false)
    navigate(`/issues/${issue.id}`)
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
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-[rgba(0,0,0,0.7)] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl border border-[rgba(0,255,140,0.25)] bg-pit shadow-[0_0_24px_rgba(0,255,136,0.18),0_30px_80px_rgba(0,0,0,0.6)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* search input */}
        <div className="flex items-center gap-2 border-b border-[rgba(0,255,140,0.12)] px-4 py-3">
          <Search className="h-4 w-4 text-fg-4 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKey}
            placeholder="$ search issues by title, identifier, description…"
            className="flex-1 bg-transparent font-mono text-sm text-fg-1 outline-none placeholder:text-fg-4"
          />
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <kbd className="border border-[rgba(0,255,140,0.15)] bg-pit-3 px-1.5 py-0.5 text-fg-3">esc</kbd>
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
                {query.trim() ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'recent'}
              </div>
              {results.map((issue, index) => {
                const status = statusMap.get(issue.statusId)
                const isHighlighted = index === highlight
                return (
                  <button
                    key={issue.id}
                    data-result-index={index}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => commit(issue)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${
                      isHighlighted
                        ? 'bg-[rgba(0,255,136,0.08)]'
                        : 'hover:bg-[rgba(0,255,136,0.04)]'
                    }`}
                  >
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
              })}
            </>
          )}
        </div>

        {/* footer hints */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[rgba(0,255,140,0.12)] px-4 py-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
          <span className="inline-flex items-center gap-1">
            <kbd className="border border-[rgba(0,255,140,0.15)] bg-pit-3 px-1.5 py-0.5 text-fg-3">↑↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="border border-[rgba(0,255,140,0.15)] bg-pit-3 px-1.5 py-0.5 text-fg-3">↵</kbd>
            open
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-fg-4">
            <kbd className="border border-[rgba(0,255,140,0.15)] bg-pit-3 px-1.5 py-0.5 text-fg-3">⌘K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  )
}
