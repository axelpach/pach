// Pach · cypherpunk-terminal primitives
// Ported from the Pach Design System (ui_kits/console).

import { useMemo, useEffect, useRef, type ReactNode, type CSSProperties, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/* ---------------- Scanlines ---------------- */
export function Scanlines({ opacity = 1 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: 'repeating-linear-gradient(0deg, rgba(0,255,136,0.025) 0 1px, transparent 1px 3px)',
        mixBlendMode: 'screen',
        opacity,
        zIndex: 1,
      }}
    />
  )
}

/* ---------------- Glyph rain ---------------- */
export function GlyphRain({ density = 22, opacity = 0.12 }: { density?: number; opacity?: number }) {
  const lanes = useMemo(() => {
    const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ01010110$@#=><pach'
    return Array.from({ length: density }, (_, i) => {
      const dur = 9 + Math.random() * 14
      const delay = -Math.random() * dur
      const text = Array.from({ length: 26 }, () => glyphs[Math.floor(Math.random() * glyphs.length)]).join('\n')
      return { dur, delay, text, left: (i / density) * 100, op: opacity + Math.random() * 0.12 }
    })
  }, [density, opacity])
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        zIndex: 0,
        maskImage: 'radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 30%, black 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 30%, black 100%)',
      }}
    >
      {lanes.map((l, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: `${l.left}%`,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            lineHeight: 1.15,
            color: '#00ff88',
            opacity: l.op,
            whiteSpace: 'pre',
            animation: `pach-rain ${l.dur}s linear ${l.delay}s infinite`,
          }}
        >
          {l.text}
        </div>
      ))}
      <style>{`@keyframes pach-rain { from { transform: translateY(-100%); } to { transform: translateY(100%); } }`}</style>
    </div>
  )
}

/* ---------------- Section header ---------------- */
export function SectionHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5 text-[10px] uppercase tracking-label text-fg-3">
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  )
}

/* ---------------- Panel ---------------- */
export function Panel({
  title,
  right,
  children,
  className,
  style,
  padded = true,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
  padded?: boolean
}) {
  return (
    <div
      className={`relative border border-[rgba(0,255,140,0.15)] ${padded ? 'px-4 pt-3.5 pb-4' : ''} ${className || ''}`}
      style={{ background: 'rgba(5,6,5,0.6)', ...style }}
    >
      {title && <SectionHeader right={right}>◊ {title}</SectionHeader>}
      {children}
    </div>
  )
}

/* ---------------- Button ---------------- */
type ButtonKind = 'default' | 'primary' | 'danger' | 'ghost'
export function Button({
  children,
  kind = 'default',
  icon,
  kbd,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; icon?: ReactNode; kbd?: string }) {
  const palette: Record<ButtonKind, string> = {
    default:
      'border border-[rgba(0,255,140,0.35)] text-fg-1 hover:border-accent hover:text-accent hover:bg-[rgba(0,255,136,0.04)]',
    primary:
      'border border-accent text-accent [text-shadow:0_0_6px_rgba(0,255,136,0.25)] hover:bg-[rgba(0,255,136,0.10)] hover:shadow-glow-xs hover:[text-shadow:0_0_10px_rgba(0,255,136,0.6)]',
    danger:
      'border border-[rgba(255,77,109,0.45)] text-fail hover:bg-[rgba(255,77,109,0.08)]',
    ghost:
      'border border-transparent text-fg-3 hover:text-accent hover:border-[rgba(0,255,140,0.15)]',
  }
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-2 px-3.5 py-2 font-mono text-xs font-medium uppercase tracking-[0.12em] whitespace-nowrap select-none transition-colors duration-100 active:scale-[0.98] ${palette[kind]} ${className || ''}`}
    >
      {icon && <span className={kind === 'primary' ? 'text-accent' : 'text-fg-3'}>{icon}</span>}
      <span>{children}</span>
      {kbd && (
        <span className="ml-1.5 px-1 border border-[rgba(0,255,140,0.15)] text-[9px] tracking-wider text-fg-3">
          {kbd}
        </span>
      )}
    </button>
  )
}

/* ---------------- Status pill ---------------- */
type StatusKind = 'ok' | 'warn' | 'fail' | 'info' | 'idle'
export function StatusPill({
  kind = 'ok',
  children,
  pulse = false,
}: {
  kind?: StatusKind
  children: ReactNode
  pulse?: boolean
}) {
  const map: Record<StatusKind, { c: string; b: string }> = {
    ok: { c: '#00ff88', b: 'rgba(0,255,136,0.45)' },
    warn: { c: '#ffb547', b: 'rgba(255,181,71,0.45)' },
    fail: { c: '#ff4d6d', b: 'rgba(255,77,109,0.5)' },
    info: { c: '#5ad6ff', b: 'rgba(90,214,255,0.4)' },
    idle: { c: '#5a8a72', b: 'rgba(0,255,140,0.15)' },
  }
  const p = map[kind]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-label whitespace-nowrap"
      style={{ border: `1px solid ${p.b}`, color: p.c }}
    >
      <span
        className="block h-[5px] w-[5px] rounded-full"
        style={{
          background: p.c,
          boxShadow: kind === 'idle' ? 'none' : `0 0 5px ${p.c}`,
          animation: pulse ? 'pach-pulse 1.6s ease-in-out infinite' : 'none',
        }}
      />
      {children}
    </span>
  )
}

/* ---------------- Metric tile ---------------- */
export function Metric({
  label,
  value,
  delta,
  deltaKind = 'ok',
}: {
  label: string
  value: ReactNode
  delta?: string
  deltaKind?: 'ok' | 'fail'
}) {
  return (
    <div className="min-w-[120px] flex-1 border border-[rgba(0,255,140,0.15)] px-3.5 py-3">
      <div className="text-[10px] uppercase tracking-label text-fg-3">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold text-fg-1 [text-shadow:0_0_6px_rgba(0,255,136,0.15)]">{value}</div>
      {delta && (
        <div className={`mt-0.5 text-[11px] ${deltaKind === 'ok' ? 'text-ok' : 'text-fail'}`}>{delta}</div>
      )}
    </div>
  )
}

/* ---------------- Inputs ---------------- */
export function TermInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4 transition-colors ${className || ''}`}
    />
  )
}

export function TermTextarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={`w-full bg-rim border border-[rgba(0,255,140,0.15)] px-3 py-2 text-sm text-fg-1 outline-none focus:border-accent focus:shadow-glow-xs placeholder:text-fg-4 transition-colors resize-none ${className || ''}`}
    />
  )
}

/* ---------------- Live clock (UTC) ---------------- */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span>{now.toISOString().slice(0, 19).replace('T', ' / ')}Z</span>
}

// Local import shim so we don't need useState above the file scope
import { useState } from 'react'

/* ---------------- ASCII framed panel ---------------- */
export function FramedPanel({
  title,
  width = 54,
  children,
  className,
}: {
  title: string
  width?: number
  children: ReactNode
  className?: string
}) {
  const padded = Math.max(0, width - title.length - 4)
  return (
    <div className={`font-mono ${className || ''}`}>
      <div className="text-[11px] tracking-label text-fg-4">
        ┌── <span className="text-accent">{title}</span> {'─'.repeat(padded)}┐
      </div>
      <div className="px-3.5 py-2.5 border-l border-r border-[rgba(0,255,140,0.15)]">{children}</div>
      <div className="text-[11px] tracking-label text-fg-4">└{'─'.repeat(width)}┘</div>
    </div>
  )
}

/* ---------------- Inline helper: an empty/info state row ---------------- */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="text-fg-3 text-sm py-10 text-center">
      <span className="text-fg-4">// </span>
      {children}
    </div>
  )
}

/* ---------------- Live ref hooks helper used by other components ---------------- */
export function useScrollToBottom<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}
