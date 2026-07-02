import { Bot, FileText, GitBranch, Settings2, X } from 'lucide-react'
import type { ReactNode } from 'react'

export type AgentMode = 'engineering' | 'editorial' | 'general_mcp'

export type AgentRepositoryPreview = {
  id: string
  projectKey: string
  fullName: string
  defaultBranch: string
}

export type AgentModeChoice = {
  issueId: string
  issueLabel: string
  issueTitle: string
  reason: string
  confidence?: number
  engineeringRepository: AgentRepositoryPreview | null
}

type AgentModeChoiceModalProps = {
  choice: AgentModeChoice
  busyMode: AgentMode | null
  onChoose: (mode: AgentMode) => void
  onCancel: () => void
}

const MODE_COPY: Record<AgentMode, { label: string; description: string }> = {
  engineering: {
    label: 'Engineering',
    description: 'Code, UI/backend changes, migrations, tests, and pull requests.',
  },
  editorial: {
    label: 'Editorial',
    description: 'Documents, copy, newsletters, blog posts, articles, and edits.',
  },
  general_mcp: {
    label: 'General MCP',
    description: 'Pach-state work, planning, updates, and light operational tasks.',
  },
}

export function AgentModeChoiceModal({ choice, busyMode, onChoose, onCancel }: AgentModeChoiceModalProps) {
  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-overlay/72 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl border border-edge/20 bg-pit-2 shadow-terminal-overlay">
        <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-5 py-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-label text-accent">choose agent mode</div>
            <h2 className="mt-1 truncate font-mono text-lg font-bold lowercase text-fg-1">
              {choice.issueLabel} · {choice.issueTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-edge/18 bg-pit-3 text-fg-3 transition hover:border-accent hover:text-accent"
            aria-label="Close agent mode chooser"
            title="close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="border border-edge/12 bg-pit-3 px-3 py-2 font-mono text-xs leading-relaxed text-fg-3">
            Pach could not confidently choose how to handle this issue.
            <span className="mt-1 block text-fg-2">{choice.reason}</span>
            {typeof choice.confidence === 'number' ? (
              <span className="mt-1 block text-[10px] uppercase tracking-label text-fg-4">
                confidence {(choice.confidence * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ModeCard
              mode="engineering"
              icon={<GitBranch className="h-4 w-4" />}
              disabled={!choice.engineeringRepository}
              busy={busyMode === 'engineering'}
              detail={choice.engineeringRepository
                ? `repo ${choice.engineeringRepository.fullName} · ${choice.engineeringRepository.defaultBranch}`
                : 'no active repository linked'}
              onChoose={onChoose}
            />
            <ModeCard
              mode="editorial"
              icon={<FileText className="h-4 w-4" />}
              busy={busyMode === 'editorial'}
              detail="uses Docs and issue context"
              onChoose={onChoose}
            />
            <ModeCard
              mode="general_mcp"
              icon={<Settings2 className="h-4 w-4" />}
              busy={busyMode === 'general_mcp'}
              detail="no repository required"
              onChoose={onChoose}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-edge/12 px-5 py-3">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <Bot className="h-3.5 w-3.5 text-accent" />
            manual route override
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={Boolean(busyMode)}
            className="border border-edge/20 bg-pit-3 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-edge/35 hover:text-fg-1 disabled:cursor-wait disabled:opacity-50"
          >
            cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeCard({
  mode,
  icon,
  detail,
  disabled,
  busy,
  onChoose,
}: {
  mode: AgentMode
  icon: ReactNode
  detail: string
  disabled?: boolean
  busy?: boolean
  onChoose: (mode: AgentMode) => void
}) {
  const copy = MODE_COPY[mode]
  return (
    <button
      type="button"
      onClick={() => onChoose(mode)}
      disabled={disabled || busy}
      className="min-h-[168px] border border-edge/16 bg-pit px-3 py-3 text-left transition hover:border-accent hover:bg-accent-fill/5 disabled:cursor-not-allowed disabled:border-edge/10 disabled:bg-pit-3/70 disabled:opacity-55"
    >
      <span className="flex h-8 w-8 items-center justify-center border border-edge/18 bg-pit-3 text-accent">
        {icon}
      </span>
      <span className="mt-3 block font-mono text-sm font-bold lowercase text-fg-1">{copy.label}</span>
      <span className="mt-2 block text-xs leading-relaxed text-fg-3">{copy.description}</span>
      <span className={`mt-3 block font-mono text-[10px] uppercase tracking-label ${disabled ? 'text-fail' : 'text-fg-4'}`}>
        {busy ? 'starting...' : detail}
      </span>
    </button>
  )
}
