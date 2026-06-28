import type { ReactNode } from 'react'

export function IconTooltip({
  label,
  children,
  align = 'right',
  disabled = false,
}: {
  label: string
  children: ReactNode
  align?: 'left' | 'right'
  disabled?: boolean
}) {
  if (disabled) return <span className="relative inline-flex">{children}</span>

  return (
    <span className="group/icon-tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-[calc(100%+6px)] z-50 whitespace-nowrap border border-edge/20 bg-pit px-2 py-1 font-mono text-[10px] uppercase tracking-label text-fg-2 opacity-0 shadow-terminal-popover transition group-hover/icon-tooltip:opacity-100 group-focus-within/icon-tooltip:opacity-100 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {label}
      </span>
    </span>
  )
}
