import { useEffect } from 'react'
import { Trash2 } from 'lucide-react'

export function DeleteViewModal({
  viewName,
  deleting,
  onClose,
  onConfirm,
}: {
  viewName: string
  deleting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-edge/20 bg-pit-2 shadow-terminal-overlay"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-edge/12 px-6 py-5">
          <div className="text-[10px] uppercase tracking-label text-fg-3">
            views - delete
          </div>
          <div className="mt-1.5 font-mono text-xl lowercase text-fg-1">
            delete {viewName.toLowerCase()}
          </div>
        </div>

        <div className="px-6 py-5 font-mono text-sm leading-relaxed text-fg-2">
          This only deletes the saved view. The underlying records stay untouched.
        </div>

        <div className="flex items-center justify-between border-t border-edge/12 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-3 py-2 font-mono text-xs uppercase tracking-label text-fg-3 transition hover:text-fg-1 disabled:opacity-40"
          >
            [cancel]
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 border border-fail/34 bg-fail/8 px-4 py-2 font-mono text-xs uppercase tracking-label text-fail transition hover:bg-fail/14 disabled:opacity-40 disabled:hover:bg-fail/8"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? 'deleting...' : 'delete view'}
          </button>
        </div>
      </div>
    </div>
  )
}
