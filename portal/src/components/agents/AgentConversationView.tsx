import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileImage, GitPullRequest, MessageSquare, Paperclip, Send, TerminalSquare, X } from 'lucide-react'
import type { Schema } from '../../zero-schema'
import { PachSelect } from '../PachSelect'

type PendingAgentInputMedia = {
  id: string
  file: File
  name: string
  dimensions: { width: number; height: number } | null
}

type AgentRepository = Pick<
  Schema['tables']['github_repositories']['row'],
  'id' | 'projectKey' | 'fullName' | 'defaultBranch' | 'active'
>

type AgentConversationViewProps = {
  issue: Schema['tables']['pm_issues']['row']
  run: Schema['tables']['agent_runs']['row'] | null
  pullRequest: Schema['tables']['github_pull_requests']['row'] | null
  progressReports: Schema['tables']['agent_run_progress_reports']['row'][]
  legacyProgressActivity: Schema['tables']['activity_events']['row'][]
  messages: Schema['tables']['agent_messages']['row'][]
  workers: Schema['tables']['agent_workers']['row'][]
  repositories: AgentRepository[]
  selectedRepositoryId: string
  onSelectedRepositoryIdChange: (next: string) => void
  branchNameDraft: string
  branchNameIsValid: boolean
  onBranchNameDraftChange: (next: string) => void
  allowCreateRun?: boolean
  actionMessage: string | null
  onCreateRun: () => void | Promise<void>
  onSendFeedback: (feedback: string, inputMedia?: PendingAgentInputMedia[]) => void | Promise<void>
  onCreateDraftPullRequest: () => void | Promise<void>
  onCancelRun: () => void | Promise<void>
  canceling: boolean
  prBusy: boolean
  onClose: () => void
}

type AgentConversationStreamItemModel = {
  id: string
  runId?: string
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
  pullRequest,
  progressReports,
  legacyProgressActivity,
  messages,
  workers,
  repositories,
  selectedRepositoryId,
  onSelectedRepositoryIdChange,
  branchNameDraft,
  branchNameIsValid,
  onBranchNameDraftChange,
  allowCreateRun = true,
  actionMessage,
  onCreateRun,
  onSendFeedback,
  onCreateDraftPullRequest,
  onCancelRun,
  canceling,
  prBusy,
  onClose,
}: AgentConversationViewProps) {
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [feedbackInputMedia, setFeedbackInputMedia] = useState<PendingAgentInputMedia[]>([])
  const [feedbackDragActive, setFeedbackDragActive] = useState(false)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null)
  const onlineWorkers = workers.filter((worker) => worker.status !== 'offline')
  const runIsFinal = isAgentRunFinal(run)
  const canCreateRun = allowCreateRun && (!run || runIsFinal)
  const canCancelRun = Boolean(run && !['completed', 'failed', 'canceled'].includes(run.status))
  const runIsWorking = isRunWorking(run)
  const streamItems = buildAgentConversationStream({ progressReports, legacyProgressActivity, messages })

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      conversationEndRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [run?.id, run?.status, streamItems.length])

  async function submitFeedback() {
    const feedback = feedbackDraft.trim()
    if (!feedback || !run) return
    setFeedbackBusy(true)
    setFeedbackMessage(null)

    try {
      await onSendFeedback(feedback, feedbackInputMedia)
      setFeedbackDraft('')
      setFeedbackInputMedia([])
      setFeedbackMessage('follow-up queued')
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Failed to queue follow-up')
    } finally {
      setFeedbackBusy(false)
    }
  }

  async function addFeedbackInputMedia(files: FileList | File[]) {
    const selectedFiles = Array.from(files).slice(0, 8)
    if (!selectedFiles.length) return
    const items = await Promise.all(selectedFiles.map(async (file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      dimensions: await readImageDimensions(file),
    })))
    setFeedbackInputMedia((current) => [...current, ...items].slice(0, 8))
  }

  function removeFeedbackInputMedia(id: string) {
    setFeedbackInputMedia((current) => current.filter((item) => item.id !== id))
  }

  function handleFeedbackDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setFeedbackDragActive(false)
    if (event.dataTransfer.files.length) void addFeedbackInputMedia(event.dataTransfer.files)
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
              {run ? (
                <PullRequestChip
                  pullRequest={pullRequest}
                  busy={prBusy}
                  workspaceReady={Boolean(run.workspacePath)}
                  onCreateDraftPullRequest={onCreateDraftPullRequest}
                />
              ) : null}
              {allowCreateRun && (!run || runIsFinal) ? (
                <button
                  type="button"
                  onClick={() => {
                    void onCreateRun()
                  }}
                  disabled={!canCreateRun}
                  className="inline-flex h-8 items-center gap-1.5 border border-edge/20 bg-accent-fill/8 px-3 font-mono text-[10px] uppercase tracking-label text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <TerminalSquare className="h-3.5 w-3.5" />
                  {runIsFinal ? 'new run' : 'do task'}
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
              <Link
                to="/settings/repositories"
                className="block w-full border border-edge/18 bg-accent-fill/4 px-3 py-2 text-left font-mono text-xs text-fg-2 transition hover:border-accent hover:text-accent"
              >
                connect a GitHub repository in settings
              </Link>
            ) : null}

            {!run && streamItems.length === 0 ? (
              <div className="border border-edge/12 bg-accent-fill/[0.025] p-4 font-mono text-xs text-fg-4">
                {repositories.length > 1 ? (
                  <RepositorySelector
                    repositories={repositories}
                    selectedRepositoryId={selectedRepositoryId}
                    onChange={onSelectedRepositoryIdChange}
                    className="mb-3 max-w-sm"
                  />
                ) : repositories.length === 1 ? (
                  <ReadonlyRepositoryField repository={repositories[0]} className="mb-3 max-w-sm" />
                ) : null}
                {repositories.length > 0 ? (
                  <BranchNameInput
                    value={branchNameDraft}
                    valid={branchNameIsValid}
                    onChange={onBranchNameDraftChange}
                    className="mb-3 max-w-sm"
                  />
                ) : null}
                <div>// no agent conversation yet</div>
                <div className="mt-1">
                  {onlineWorkers.length} online worker{onlineWorkers.length === 1 ? '' : 's'} · {repositories.length} repo
                  {repositories.length === 1 ? '' : 's'}
                </div>
              </div>
            ) : null}

            {run ? (
              <AgentConversationRunHeader
                run={run}
                actionMessage={actionMessage}
              />
            ) : null}

            <div className="space-y-3">
              {streamItems.map((item) => (
                <AgentConversationStreamItem key={item.id} item={item} />
              ))}
              {runIsWorking ? (
                <AgentWorkingIndicator status={run?.status ?? 'queued'} />
              ) : null}
              <div ref={conversationEndRef} aria-hidden />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-edge/12 bg-pit/80 px-4 py-4 md:px-8">
          <form
            className={`mx-auto max-w-5xl border border-transparent p-1 transition ${feedbackDragActive ? 'border-accent/50 bg-accent-fill/6' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              setFeedbackDragActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setFeedbackDragActive(true)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFeedbackDragActive(false)
            }}
            onDrop={handleFeedbackDrop}
            onSubmit={(event) => {
              event.preventDefault()
              void submitFeedback()
            }}
          >
            <div className="border border-edge/18 bg-pit-3 p-2 focus-within:border-accent/70">
              {feedbackInputMedia.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5 px-2">
                  {feedbackInputMedia.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex max-w-full items-center gap-1.5 border border-edge/16 bg-pit px-1.5 py-1 font-mono text-[9px] uppercase tracking-label text-fg-3"
                    >
                      <FileImage className="h-3 w-3 shrink-0 text-accent" />
                      <span className="max-w-[180px] truncate">{item.name}</span>
                      <span className="shrink-0 text-fg-4">
                        {item.dimensions ? `${item.dimensions.width}x${item.dimensions.height}` : formatBytes(item.file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFeedbackInputMedia(item.id)}
                        className="shrink-0 text-fg-4 transition hover:text-fail"
                        title="remove attachment"
                        aria-label={`remove ${item.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <textarea
                value={feedbackDraft}
                onChange={(event) => setFeedbackDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  void submitFeedback()
                }}
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
                <div className="flex items-center gap-1.5">
                  <input
                    ref={feedbackFileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    accept="image/*,.pdf"
                    onChange={(event) => {
                      const files = event.target.files
                      if (files) void addFeedbackInputMedia(files)
                      event.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => feedbackFileInputRef.current?.click()}
                    disabled={!run || feedbackBusy}
                    className="inline-flex h-8 w-8 items-center justify-center border border-edge/24 bg-accent-fill/4 text-fg-3 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                    title="attach context"
                    aria-label="attach context"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
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
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function AgentConversationRunHeader({
  run,
  actionMessage,
}: {
  run: Schema['tables']['agent_runs']['row']
  actionMessage: string | null
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 border border-edge/12 bg-accent-fill/[0.025] p-3 font-mono text-xs md:grid-cols-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="uppercase tracking-label text-fg-4">status</span>
          <span className={run.status === 'failed' ? 'text-fail' : 'text-accent'}>{run.status}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="uppercase tracking-label text-fg-4">repo</span>
          <span className="min-w-0 truncate text-fg-2">{run.repoFullName}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="uppercase tracking-label text-fg-4">branch</span>
          <span className="min-w-0 truncate text-fg-2">{run.branchName}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="uppercase tracking-label text-fg-4">worker</span>
          <span className="min-w-0 truncate text-fg-2">{run.workerId ?? 'waiting for claim'}</span>
        </div>
      </div>
      {actionMessage ? (
        <div className="border border-edge/12 bg-pit-3 px-3 py-2 font-mono text-xs text-fg-3">{actionMessage}</div>
      ) : null}
    </div>
  )
}

function PullRequestChip({
  pullRequest,
  busy,
  workspaceReady,
  onCreateDraftPullRequest,
}: {
  pullRequest: Schema['tables']['github_pull_requests']['row'] | null
  busy: boolean
  workspaceReady: boolean
  onCreateDraftPullRequest: () => void | Promise<void>
}) {
  if (pullRequest) {
    return (
      <a
        href={pullRequest.url}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex h-8 min-w-0 items-center gap-1.5 border px-2.5 font-mono text-[10px] uppercase tracking-label transition hover:border-accent ${pullRequestToneClasses(pullRequest)}`}
        title={`PR ${formatPullRequestState(pullRequest)} #${pullRequest.number}`}
      >
        <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">#{pullRequest.number}</span>
        <span className="hidden text-[9px] sm:inline">{formatPullRequestState(pullRequest)}</span>
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        void onCreateDraftPullRequest()
      }}
      disabled={busy || !workspaceReady}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-edge/18 bg-accent-fill/6 text-accent transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
      title={workspaceReady ? 'commit branch and open a PR' : 'waiting for worker workspace'}
      aria-label="create PR"
    >
      <GitPullRequest className="h-3.5 w-3.5" />
    </button>
  )
}

function BranchNameInput({
  value,
  valid,
  onChange,
  className = '',
}: {
  value: string
  valid: boolean
  onChange: (next: string) => void
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">branch</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className={`h-8 w-full border bg-transparent px-2 font-mono text-xs outline-none transition ${
          valid ? 'border-edge/18 text-fg-2 focus:border-accent' : 'border-fail/40 text-fail focus:border-fail'
        }`}
      />
    </label>
  )
}

function RepositorySelector({
  repositories,
  selectedRepositoryId,
  onChange,
  className = '',
}: {
  repositories: AgentRepository[]
  selectedRepositoryId: string
  onChange: (next: string) => void
  className?: string
}) {
  const selectedRepository =
    repositories.find((repository) => repository.id === selectedRepositoryId) ??
    repositories[0] ??
    null

  if (!selectedRepository) return null

  return (
    <div className={className}>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">repository</div>
      <PachSelect
        value={selectedRepository.id}
        onChange={onChange}
        options={repositories.map((repository) => ({
          value: repository.id,
          label: repository.fullName,
        }))}
        display={selectedRepository.fullName}
        popupWidth="280"
      />
    </div>
  )
}

function ReadonlyRepositoryField({
  repository,
  className = '',
}: {
  repository: AgentRepository
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-label text-fg-4">repository</div>
      <div className="flex h-8 min-w-0 items-center border border-transparent bg-transparent px-2 font-mono text-xs text-fg-2">
        <span className="truncate">{repository.fullName}</span>
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
  legacyProgressActivity: Schema['tables']['activity_events']['row'][]
  messages: Schema['tables']['agent_messages']['row'][]
}): AgentConversationStreamItemModel[] {
  const preferredFinalResultByRun = new Map<string, Schema['tables']['agent_run_progress_reports']['row']>()
  const progressPhasesByRun = new Map<string, Set<string>>()

  for (const report of progressReports) {
    const phases = progressPhasesByRun.get(report.runId) ?? new Set<string>()
    phases.add(report.phase ?? report.level)
    progressPhasesByRun.set(report.runId, phases)

    if (report.phase !== 'final_result') continue
    const current = preferredFinalResultByRun.get(report.runId)
    if (!current || isBetterFinalResult(report, current)) preferredFinalResultByRun.set(report.runId, report)
  }

  const items = [
    ...messages.map((message): AgentConversationStreamItemModel => ({
      id: `message-${message.id}`,
      runId: message.runId,
      role: message.role === 'user' ? 'user' : 'agent',
      phase: message.role,
      body: message.body,
      level: 'info',
      createdAt: message.createdAt,
    })),
    ...progressReports
      .filter((report) => shouldShowProgressReport(report, preferredFinalResultByRun))
      .map((report): AgentConversationStreamItemModel => ({
        id: `progress-${report.id}`,
        runId: report.runId,
        role: 'agent',
        phase: report.phase ?? report.level,
        body: report.message,
        level: report.level,
        createdAt: report.createdAt,
        percent: report.percent,
      })),
    ...legacyProgressActivity
      .filter((entry) => shouldShowLegacyProgress(entry, progressPhasesByRun, preferredFinalResultByRun))
      .map((entry): AgentConversationStreamItemModel => ({
        id: `legacy-${entry.id}`,
        runId: readMetadataString(entry.metadata, 'runId') ?? undefined,
        role: 'agent',
        phase: readMetadataString(entry.metadata, 'phase') ?? legacyProgressPhase(entry.eventType),
        body: entry.summary,
        level: entry.eventType === 'agent_run_failed' || readMetadataString(entry.metadata, 'level') === 'error' ? 'error' : 'info',
        createdAt: entry.createdAt,
      })),
  ].sort((a, b) => a.createdAt - b.createdAt)

  return dedupeConversationItems(items)
}

function isBetterFinalResult(
  candidate: Schema['tables']['agent_run_progress_reports']['row'],
  current: Schema['tables']['agent_run_progress_reports']['row'],
) {
  const candidateIsMcp = readMetadataString(candidate.metadata, 'source') === 'pach-mcp'
  const currentIsMcp = readMetadataString(current.metadata, 'source') === 'pach-mcp'
  if (candidateIsMcp !== currentIsMcp) return candidateIsMcp
  return candidate.createdAt > current.createdAt
}

function shouldShowProgressReport(
  report: Schema['tables']['agent_run_progress_reports']['row'],
  preferredFinalResultByRun: Map<string, Schema['tables']['agent_run_progress_reports']['row']>,
) {
  if (report.phase === 'final_result') {
    return preferredFinalResultByRun.get(report.runId)?.id === report.id
  }

  if (report.phase === 'completed' && preferredFinalResultByRun.has(report.runId)) {
    return false
  }

  return true
}

function dedupeConversationItems(items: AgentConversationStreamItemModel[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = [item.runId ?? 'no-run', item.role, item.phase, normalizeMessageForDedupe(item.body)].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeMessageForDedupe(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function shouldShowLegacyProgress(
  entry: Schema['tables']['activity_events']['row'],
  progressPhasesByRun: Map<string, Set<string>>,
  preferredFinalResultByRun: Map<string, Schema['tables']['agent_run_progress_reports']['row']>,
) {
  const runId = readMetadataString(entry.metadata, 'runId')
  if (!runId) return true

  const phase = readMetadataString(entry.metadata, 'phase') ?? legacyProgressPhase(entry.eventType)
  const progressPhases = progressPhasesByRun.get(runId)
  if (!progressPhases) return true
  if (phase === 'completed' && preferredFinalResultByRun.has(runId)) return false
  return !progressPhases.has(phase)
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

function AgentWorkingIndicator({ status }: { status: string }) {
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[760px] border border-accent/20 bg-accent-fill/[0.045] px-3 py-2.5 font-mono text-xs text-fg-2 shadow-glow-xs">
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] uppercase tracking-label">
          <div className="flex items-center gap-2 text-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            working
          </div>
          <span className="text-fg-4">{status}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span>loading</span>
          <span className="flex items-center gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:240ms]" />
          </span>
        </div>
      </div>
    </div>
  )
}

function isRunWorking(run: Schema['tables']['agent_runs']['row'] | null) {
  return Boolean(run && ['queued', 'reserved', 'bootstrapping', 'running'].includes(run.status))
}

function isAgentRunFinal(run: Schema['tables']['agent_runs']['row'] | null) {
  return Boolean(run && ['completed', 'failed', 'canceled'].includes(run.status))
}

function readMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object') return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function readImageDimensions(file: File) {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)

  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

function formatPullRequestState(pullRequest: Schema['tables']['github_pull_requests']['row']) {
  if (pullRequest.state === 'merged') return 'merged'
  if (pullRequest.state === 'closed') return 'closed'
  if (pullRequest.isDraft) return 'draft'
  return 'open'
}

function pullRequestToneClasses(pullRequest: Schema['tables']['github_pull_requests']['row']) {
  const state = formatPullRequestState(pullRequest)
  if (state === 'merged') return 'border-accent/50 bg-accent-fill/12 text-accent shadow-glow-xs'
  if (state === 'closed') return 'border-fail/35 bg-fail/8 text-fail'
  if (state === 'draft') return 'border-edge/24 bg-pit-3 text-fg-3'
  return 'border-accent/35 bg-accent-fill/8 text-accent'
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} b`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kb`
  return `${(value / (1024 * 1024)).toFixed(1)} mb`
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
