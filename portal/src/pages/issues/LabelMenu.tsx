import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { Schema } from '../../zero-schema'

const POPUP_MAX_HEIGHT = 280
const POPUP_GAP = 4

type LabelRow = Schema['tables']['pm_labels']['row']

export function LabelMenu({
  available,
  selectedIds,
  onToggle,
  trigger,
  triggerClassName,
  align = 'left',
  popupWidth = '240px',
}: {
  available: LabelRow[]
  selectedIds: Set<string>
  onToggle: (labelId: string) => void
  trigger: ReactNode
  triggerClassName?: string
  align?: 'left' | 'right'
  popupWidth?: string
}) {
  const [open, setOpen] = useState(false)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    function reposition() {
      const t = triggerRef.current
      if (!t) return
      const rect = t.getBoundingClientRect()
      const width = parseFloat(popupWidth) || 240
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const placeAbove = spaceBelow < POPUP_MAX_HEIGHT + POPUP_GAP + 8 && spaceAbove > spaceBelow

      const top = placeAbove
        ? Math.max(8, rect.top - POPUP_GAP)
        : rect.bottom + POPUP_GAP

      let left = align === 'right' ? rect.right - width : rect.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))

      setPopupStyle({
        position: 'fixed',
        top,
        left,
        width,
        transform: placeAbove ? 'translateY(-100%)' : undefined,
        maxHeight: POPUP_MAX_HEIGHT,
      })
    }

    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, align, popupWidth])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        className={triggerClassName ?? 'inline-flex items-center gap-1 transition hover:opacity-80'}
      >
        {trigger}
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className="z-[1000] overflow-auto border border-[rgba(0,255,140,0.25)] bg-pit shadow-[0_0_18px_rgba(0,255,136,0.18),0_18px_44px_rgba(0,0,0,0.6)]"
        >
          <div className="border-b border-[rgba(0,255,140,0.12)] px-3 py-2 font-mono text-[10px] uppercase tracking-label text-fg-3">
            labels
          </div>
          <div className="py-1">
            {available.length === 0 ? (
              <div className="px-3 py-2 font-mono text-xs text-fg-4">// no labels available</div>
            ) : (
              available.map((label) => {
                const checked = selectedIds.has(label.id)
                const color = label.color || '#5a8a72'
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onToggle(label.id)
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-mono text-xs lowercase text-fg-2 hover:bg-[rgba(0,255,136,0.04)] hover:text-fg-1 transition"
                  >
                    <span
                      aria-hidden
                      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition ${
                        checked ? 'border-accent bg-accent' : 'border-[rgba(0,255,140,0.2)] bg-transparent'
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-pit" strokeWidth={3} />}
                    </span>
                    <span aria-hidden className="block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="truncate">{label.name.toLowerCase()}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
