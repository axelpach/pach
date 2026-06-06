import type { RefObject } from 'react'

export function closePopupFromOutsideClick(
  event: MouseEvent,
  refs: Array<RefObject<HTMLElement | null>>,
  close: () => void,
) {
  const target = event.target as Node
  if (refs.some((ref) => ref.current?.contains(target))) return

  close()

  const swallowClick = (clickEvent: MouseEvent) => {
    clickEvent.preventDefault()
    clickEvent.stopPropagation()
    clickEvent.stopImmediatePropagation()
  }

  window.addEventListener('click', swallowClick, { capture: true, once: true })
}
