import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText } from 'lucide-react'
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
        className="border border-white/[0.08] rounded-xl overflow-hidden origin-top-left"
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
}: {
  slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[]
  title: string
  description?: string
  width: number
  height: number
  theme: Theme
  filename: string
  ctaLinks?: Array<{ selector: string; url: string; page: number }>
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
    <div className="flex-1 min-h-0 bg-[#050505] text-white overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-sm border-b border-white/[0.08] px-8 py-4">
        <div className="flex items-center justify-between max-w-[1200px] mx-auto">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {description && (
              <p className="text-white/50 text-sm mt-1">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPng}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              PNG ({slides.length} {slides.length === 1 ? 'img' : 'imgs'})
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#F13D43] text-white rounded-lg hover:bg-[#F13D43]/90 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
          </div>
        </div>
      </div>

      {/* Slides preview */}
      <div className="py-12 px-8 space-y-8">
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
