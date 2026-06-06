import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { closePopupFromOutsideClick } from './popupEvents'

export type PachSelectOption = {
  value: string
  label: string
  icon?: ReactNode
}

type CommonProps = {
  value: string
  onChange: (next: string) => void
  options: PachSelectOption[]
  openSignal?: number
  align?: 'left' | 'right'
  popupWidth?: string
  popupClassName?: string
}

type InlineProps = CommonProps & {
  variant?: 'inline'
  display: string
  triggerClassName?: string
}

type ButtonProps = CommonProps & {
  variant: 'button'
  trigger: ReactNode
  triggerClassName?: string
  triggerTitle?: string
}

type Props = InlineProps | ButtonProps

const POPUP_MAX_HEIGHT = 256
const POPUP_GAP = 4

export function PachSelect(props: Props) {
  const { value, onChange, options, openSignal, align = 'left', popupWidth, popupClassName } = props
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const lastOpenSignalRef = useRef<number | undefined>(undefined)

  function openMenu() {
    const idx = options.findIndex((o) => o.value === value)
    setHighlight(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  useEffect(() => {
    if (openSignal == null) return
    if (lastOpenSignalRef.current === openSignal) return
    lastOpenSignalRef.current = openSignal
    openMenu()
  }, [openSignal, options, value])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return

    function reposition() {
      const t = triggerRef.current
      if (!t) return
      const rect = t.getBoundingClientRect()
      const width = popupWidth ? parseFloat(popupWidth) : (props.variant === 'button' ? 200 : rect.width)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const placeAbove = spaceBelow < POPUP_MAX_HEIGHT + POPUP_GAP + 8 && spaceAbove > spaceBelow

      const top = placeAbove ? Math.max(8, rect.top - POPUP_GAP) : rect.bottom + POPUP_GAP

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
  }, [open, align, popupWidth, props.variant])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(event: MouseEvent) {
      closePopupFromOutsideClick(event, [triggerRef, popupRef], () => setOpen(false))
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlight((h) => (h + 1) % options.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlight((h) => (h - 1 + options.length) % options.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const opt = options[highlight]
        if (opt) {
          onChange(opt.value)
          setOpen(false)
        }
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, options, highlight, onChange])

  function handleTriggerClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (options.length === 0) return
    open ? setOpen(false) : openMenu()
  }

  return (
    <>
      {props.variant === 'button' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          title={props.triggerTitle}
          className={
            props.triggerClassName ??
            `flex items-center justify-center transition ${
              open ? 'text-accent' : 'text-fg-3 hover:text-accent'
            }`
          }
        >
          {props.trigger}
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          className={
            props.triggerClassName ??
            `flex w-full items-center justify-between border px-2 py-1 text-left font-mono text-xs lowercase text-fg-1 transition ${
              open
                ? 'border-[rgba(0,255,140,0.35)] bg-[rgba(0,255,136,0.06)] shadow-glow-xs'
                : 'border-transparent hover:border-[rgba(0,255,140,0.2)] hover:bg-[rgba(0,255,136,0.04)]'
            }`
          }
        >
          <span className="truncate">{props.display}</span>
          <ChevronDown
            className={`h-3 w-3 transition ${open ? 'text-accent rotate-180' : 'text-fg-4 opacity-60'}`}
          />
        </button>
      )}

      {open && createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className={`z-[1000] overflow-auto border border-[rgba(0,255,140,0.25)] bg-pit shadow-[0_0_18px_rgba(0,255,136,0.18),0_18px_44px_rgba(0,0,0,0.6)] ${popupClassName ?? ''}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isHighlighted = index === highlight
            return (
              <button
                key={option.value}
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs lowercase transition ${
                  isHighlighted
                    ? 'bg-[rgba(0,255,136,0.12)] text-accent'
                    : isSelected
                      ? 'text-accent'
                      : 'text-fg-2 hover:text-fg-1'
                }`}
              >
                {option.icon ? <span className="flex h-3.5 w-3.5 items-center justify-center">{option.icon}</span> : null}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected ? <span className="ml-2 text-accent">✓</span> : null}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
