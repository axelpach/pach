import { CheckCircle2, Circle, XCircle } from 'lucide-react'

export function StatusIcon({
  statusType,
  className = 'h-3.5 w-3.5',
}: {
  statusType: string
  className?: string
}) {
  if (statusType === 'completed') return <CheckCircle2 className={`${className} text-accent`} />
  if (statusType === 'canceled') return <XCircle className={`${className} text-fg-4`} />
  if (statusType === 'started') return <HalfFilledCircle className={`${className} text-amber`} />
  if (statusType === 'review') return <HalfFilledCircle className={`${className} text-accent`} />
  if (statusType === 'blocked') return <HalfFilledCircle className={`${className} text-fail`} />
  return <Circle className={`${className} text-fg-4`} />
}

function HalfFilledCircle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M 8 1.5 A 6.5 6.5 0 0 1 8 14.5 Z" fill="currentColor" />
    </svg>
  )
}
