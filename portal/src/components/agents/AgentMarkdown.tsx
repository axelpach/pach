import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type AgentMarkdownProps = {
  children: string
  className?: string
}

export function AgentMarkdown({ children, className = '' }: AgentMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={`agent-markdown text-sm leading-relaxed ${className}`}
      components={{
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            {children}
          </a>
        ),
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4">{children}</ul>,
        ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l border-edge/30 pl-3 text-fg-3">{children}</blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded-none border border-edge/12 bg-pit px-1 py-0.5 font-mono text-[0.92em] text-fg-1">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto border border-edge/12 bg-pit p-2 font-mono text-xs leading-relaxed text-fg-2">
            {children}
          </pre>
        ),
        h1: ({ children }) => <h1 className="mb-1 mt-2 font-mono text-base font-semibold text-fg-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-1 mt-2 font-mono text-sm font-semibold text-fg-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-2 font-mono text-sm font-semibold text-fg-2 first:mt-0">{children}</h3>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse border border-edge/12 text-left text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-edge/12 bg-pit px-2 py-1 font-semibold text-fg-2">{children}</th>,
        td: ({ children }) => <td className="border border-edge/12 px-2 py-1 text-fg-3">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
