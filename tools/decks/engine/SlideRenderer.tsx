import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, FileText } from 'lucide-react'
import { exportAsPdf, exportAsPng } from './export'
import type { Theme } from './types'

/**
 * ScaledSlide — renders the slide at full pixel dimensions but scales it down
 * visually to fit the available width. The DOM stays at full size so exports
 * capture at native resolution.
 */
import { forwardRef } from 'react'

const ScaledSlide = forwardRef<
  HTMLDivElement,
  { width: number; height: number; children: React.ReactNode }
>(function ScaledSlide({ width, height, children }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availableWidth = entry.contentRect.width
        setScale(Math.min(1, availableWidth / width))
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [width])

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="border border-edge/12 rounded-xl overflow-hidden origin-top-left bg-pit-2"
        style={{
          width: width * scale,
          height: height * scale,
        }}
      >
        <div
          ref={ref}
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
})

/**
 * SlideRenderer — renders an array of slide components with export controls.
 * This is the main component used by both the portal and individual deck pages.
 */
export function SlideRenderer({
  slides,
  title,
  description,
  width,
  height,
  theme,
  filename,
  ctaLinks,
  onBack,
}: {
  slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[]
  title: string
  description?: string
  width: number
  height: number
  theme: Theme
  filename: string
  ctaLinks?: Array<{ selector: string; url: string; page: number }>
  onBack?: () => void
}) {
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])

  const handleDownloadPdf = useCallback(async () => {
    await exportAsPdf(slideRefs.current, filename, {
      width,
      height,
      bg: theme.bg,
      links: ctaLinks,
    })
  }, [filename, width, height, theme.bg, ctaLinks])

  const handleDownloadPng = useCallback(async () => {
    await exportAsPng(slideRefs.current, filename, {
      width,
      height,
      bg: theme.bg,
    })
  }, [filename, width, height, theme.bg])

  return (
    <div className="flex-1 min-h-0 bg-pit text-fg-1 overflow-y-auto overflow-x-hidden">
      {/* Header — Pach aesthetic */}
      <div className="sticky top-0 z-20 bg-pit/90 backdrop-blur-sm border-b border-edge/15 px-4 py-3 md:px-8 md:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:text-accent hover:border-edge/40"
                title="back to decks"
                aria-label="back to decks"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-label text-fg-3">◊ decks</div>
              <h1 className="font-mono text-base md:text-lg font-bold lowercase text-fg-1 truncate">{title}</h1>
              {description && (
                <p className="hidden md:block text-xs text-fg-3 mt-0.5 truncate">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1.5 border border-edge/20 bg-pit-3 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-label text-fg-2 transition hover:text-fg-1 hover:border-edge/35"
              title="export each slide as PNG"
            >
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">png · </span>
              {slides.length} {slides.length === 1 ? 'img' : 'imgs'}
            </button>
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 border border-edge/30 bg-accent-fill/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 hover:shadow-glow-xs"
              title="download the deck as PDF"
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">download </span>pdf
            </button>
          </div>
        </div>
      </div>

      {/* Slides preview */}
      <div className="py-8 px-4 md:py-12 md:px-8 space-y-6 md:space-y-8">
        {slides.map((SlideComponent, i) => (
          <ScaledSlide
            key={i}
            width={width}
            height={height}
            ref={(el) => { slideRefs.current[i] = el }}
          >
            <SlideComponent width={width} height={height} theme={theme} />
          </ScaledSlide>
        ))}
      </div>
    </div>
  )
}
