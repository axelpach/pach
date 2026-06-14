import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, TerminalSquare } from 'lucide-react'
import type { Schema } from '../../zero-schema'

type AgentConversationViewProps = {
  issue: Schema['tables']['pm_issues']['row']
  run: Schema['tables']['agent_runs']['row'] | null
  progressReports: Schema['tables']['agent_run_progress_reports']['row'][]
  legacyProgressActivity: Schema['tables']['pm_issue_activity']['row'][]
  messages: Schema['tables']['agent_messages']['row'][]
  workers: Schema['tables']['agent_workers']['row'][]
  repositories: Schema['tables']['github_repositories']['row'][]
  onCreateRun: () => void | Promise<void>
  onSeedRepositories: () => void | Promise<void>
  onSendFeedback: (feedback: string) => void | Promise<void>
  onCancelRun: () => void | Promise<void>
  canceling: boolean
  onClose: () => void
}

type AgentConversationStreamItemModel = {
  id: string
  role: 'user' | 'agent'
  phase: string
  body: string
  level: string
  createdAt: number
  percent?: number
}

export function AgentConversationView({
  issue,
  run,
  progressReports,
  legacyProgressActivity,
  messages,
  workers,
  repositories,
  onCreateRun,
  onSeedRepositories,
  onSendFeedback,
  onCancelRun,
  canceling,
  onClose,
}: AgentConversationViewProps) {
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const onlineWorkers = workers.filter((worker) => worker.status !== 'offline')
  const canCreateRun = repositories.length > 0 && !run
  const canCancelRun = Boolean(run && !['completed', 'failed', 'canceled'].includes(run.status))
  const streamItems = buildAgentConversationStream({ progressReports, legacyProgressActivity, messages })

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      conversationEndRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [run?.id, streamItems.length])

  async function submitFeedback() {
    const feedback = feedbackDraft.trim()
    if (!feedback || !run) return
    setFeedbackBusy(true)
    setFeedbackMessage(null)

    try {
      await onSendFeedback(feedback)
      setFeedbackDraft('')
      setFeedbackMessage('follow-up queued')
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Failed to queue follow-up')
    } finally {
      setFeedbackBusy(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 bg-pit/35">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-edge/12 px-4 py-4 md:px-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
                <MessageSquare className="h-3.5 w-3.5 text-accent" />
                agent conversation
                {run ? <span>· {run.status}</span> : null}
              </div>
              <div className="truncate font-mono text-lg font-bold text-fg-1">
                {issue.identifier} {issue.title}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!run ? (
                <button
                  type="button"
                  onClick={() => {
                    void onCreateRun()
                  }}
                  disabled={!canCreateRun}
                  className="inline-flex h-8 items-center gap-1.5 border border-edge/20 bg-accent-fill/8 px-3 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <TerminalSquare className="h-3.5 w-3.5" />
                  do task
                </button>
              ) : null}
              {canCancelRun ? (
                <button
                  type="button"
                  onClick={() => {
                    void onCancelRun()
                  }}
                  disabled={canceling}
                  className="h-8 border border-fail/25 bg-fail/5 px-3 font-mono text-[10px] uppercase tracking-label text-fail transition hover:border-fail disabled:cursor-wait disabled:opacity-50"
                >
                  {canceling ? 'canceling' : 'cancel run'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="h-8 border border-edge/18 bg-pit-3 px-3 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-accent hover:text-accent"
              >
                back to issue
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <div className="mx-auto max-w-5xl space-y-4">
            {repositories.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  void onSeedRepositories()
                }}
                className="w-full border border-edge/18 bg-accent-fill/4 px-3 py-2 text-left font-mono text-xs text-fg-2 transition hover:border-accent hover:text-accent"
              >
                seed default GitHub repos
              </button>
            ) : null}

            {!run && streamItems.length === 0 ? (
              <div className="border border-edge/12 bg-accent-fill/[0.025] p-4 font-mono text-xs text-fg-4">
                <div>// no agent conversation yet</div>
                <div className="mt-1">
                  {onlineWorkers.length} online worker{onlineWorkers.length === 1 ? '' : 's'} · {repositories.length} repo
                  {repositories.length === 1 ? '' : 's'}
                </div>
              </div>
            ) : null}

            {run ? (
              <AgentConversationRunHeader run={run} />
            ) : null}

            <div className="space-y-3">
              {streamItems.map((item) => (
                <AgentConversationStreamItem key={item.id} item={item} />
              ))}
              <div ref={conversationEndRef} aria-hidden />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-edge/12 bg-pit/80 px-4 py-4 md:px-8">
          <form
            className="mx-auto max-w-5xl"
            onSubmit={(event) => {
              event.preventDefault()
              void submitFeedback()
            }}
          >
            <div className="border border-edge/18 bg-pit-3 p-2 focus-within:border-accent/70">
              <textarea
                value={feedbackDraft}
                onChange={(event) => setFeedbackDraft(event.target.value)}
                rows={3}
                disabled={!run || feedbackBusy}
                placeholder={run ? 'send feedback or ask the agent to continue...' : 'start a run before sending feedback...'}
                className="block w-full resize-none bg-transparent px-2 py-2 font-mono text-sm leading-relaxed text-fg-2 outline-none placeholder:text-fg-4 disabled:opacity-50"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge/10 px-2 pt-2">
                <span className="font-mono text-[10px] lowercase text-fg-4">
                  {run?.workerId ? 'will try the same worker/session first' : 'agent feedback attaches to the active run'}
                  {feedbackMessage ? ` · ${feedbackMessage}` : ''}
                </span>
                <button
                  type="submit"
                  disabled={!feedbackDraft.trim() || feedbackBusy || !run}
                  className="inline-flex items-center gap-1.5 border border-edge/24 bg-accent-fill/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  {feedbackBusy ? 'queuing...' : 'send'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function AgentConversationRunHeader({ run }: { run: Schema['tables']['agent_runs']['row'] }) {
  const handler = readMetadataString(run.metadata, 'handler') ?? readMetadataString(run.metadata, 'executionClass') ?? 'agent'
  return (
    <div className="grid gap-2 border border-edge/12 bg-accent-fill/[0.025] p-3 font-mono text-xs md:grid-cols-3">
      <div className="flex items-center justify-between gap-3">
        <span className="uppercase tracking-label text-fg-4">status</span>
        <span className={run.status === 'failed' ? 'text-fail' : 'text-accent'}>{run.status}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="uppercase tracking-label text-fg-4">handler</span>
        <span className="truncate text-fg-2">{handler}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="uppercase tracking-label text-fg-4">worker</span>
        <span className="truncate text-fg-2">{run.workerId ?? 'waiting for claim'}</span>
      </div>
    </div>
  )
}

function buildAgentConversationStream({
  progressReports,
  legacyProgressActivity,
  messages,
}: {
  progressReports: Schema['tables']['agent_run_progress_reports']['row'][]
  legacyProgressActivity: Schema['tables']['pm_issue_activity']['row'][]
  messages: Schema['tables']['agent_messages']['row'][]
}): AgentConversationStreamItemModel[] {
  return [
    ...messages.map((message): AgentConversationStreamItemModel => ({
      id: `message-${message.id}`,
      role: message.role === 'user' ? 'user' : 'agent',
      phase: message.role,
      body: message.body,
      level: 'info',
      createdAt: message.createdAt,
    })),
    ...progressReports.map((report): AgentConversationStreamItemModel => ({
      id: `progress-${report.id}`,
      role: 'agent',
      phase: report.phase ?? report.level,
      body: report.message,
      level: report.level,
      createdAt: report.createdAt,
      percent: report.percent,
    })),
    ...legacyProgressActivity.map((entry): AgentConversationStreamItemModel => ({
      id: `legacy-${entry.id}`,
      role: 'agent',
      phase: readMetadataString(entry.metadata, 'phase') ?? legacyProgressPhase(entry.type),
      body: entry.summary,
      level: entry.type === 'agent_run_failed' || readMetadataString(entry.metadata, 'level') === 'error' ? 'error' : 'info',
      createdAt: entry.createdAt,
    })),
  ].sort((a, b) => a.createdAt - b.createdAt)
}

function AgentConversationStreamItem({ item }: { item: AgentConversationStreamItemModel }) {
  const isUser = item.role === 'user'
  const levelClass = item.level === 'error' ? 'text-fail' : item.level === 'warn' ? 'text-warn' : 'text-accent'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`w-full max-w-[760px] border px-3 py-2.5 font-mono text-xs ${
          isUser
            ? 'border-accent/30 bg-accent-fill/8 text-fg-1'
            : 'border-edge/12 bg-pit-3 text-fg-2'
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] uppercase tracking-label">
          <div className="min-w-0 flex items-center gap-2">
            <span className={isUser ? 'text-accent' : levelClass}>{isUser ? '›' : '●'}</span>
            <span className="truncate text-fg-4">{item.phase}</span>
          </div>
          <span className="shrink-0 text-fg-4">{formatRelative(item.createdAt)}</span>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{item.body}</div>
        {typeof item.percent === 'number' ? (
          <div className="mt-2 h-1 border border-edge/12 bg-pit-2">
            <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function legacyProgressPhase(type: string) {
  if (type === 'agent_run_claimed') return 'claimed'
  if (type === 'agent_run_completed') return 'completed'
  if (type === 'agent_run_failed') return 'failed'
  if (type === 'agent_run_canceled') return 'canceled'
  return 'progress'
}

function formatRelative(ms: number) {
  const diff = Math.max(0, Date.now() - ms)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '0s ago'
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  return `${Math.floor(diff / day)}d ago`
}
