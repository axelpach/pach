export const PRIORITY_META: Record<
  number,
  { label: string; accent: string }
> = {
  0: { label: 'no priority', accent: 'text-fg-3' },
  1: { label: 'urgent', accent: 'text-amber' },
  2: { label: 'high', accent: 'text-fg-2' },
  3: { label: 'medium', accent: 'text-fg-2' },
  4: { label: 'low', accent: 'text-fg-2' },
}

export function PriorityIcon({
  priority,
  className = 'h-3.5 w-3.5',
}: {
  priority: number
  className?: string
}) {
  if (priority === 1) return <UrgentIcon className={className} />
  if (priority === 2) return <SignalBars active={3} className={`${className} text-fg-2`} />
  if (priority === 3) return <SignalBars active={2} className={`${className} text-fg-2`} />
  if (priority === 4) return <SignalBars active={1} className={`${className} text-fg-2`} />
  return <NoPriorityIcon className={className} />
}

function UrgentIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} text-amber`} aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="currentColor" />
      <rect x="7" y="4" width="2" height="5.5" rx="0.5" fill="var(--bg-1)" />
      <rect x="7" y="10.5" width="2" height="2" rx="0.5" fill="var(--bg-1)" />
    </svg>
  )
}

function SignalBars({ active, className }: { active: 1 | 2 | 3; className: string }) {
  const bars = [
    { x: 2, height: 4 },
    { x: 7, height: 8 },
    { x: 12, height: 12 },
  ]
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      {bars.map((bar, i) => {
        const isLit = i < active
        return (
          <rect
            key={i}
            x={bar.x}
            y={14 - bar.height}
            width="2.5"
            height={bar.height}
            rx="0.5"
            fill={isLit ? 'currentColor' : 'rgb(var(--edge-rgb) / 0.15)'}
          />
        )
      })}
    </svg>
  )
}

function NoPriorityIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} text-fg-4`} aria-hidden="true">
      {[3, 8, 13].map((x) => (
        <rect key={x} x={x - 1.25} y={7} width="2.5" height="1.5" rx="0.5" fill="currentColor" />
      ))}
    </svg>
  )
}
