import { useCallback, useRef } from 'react'
import { Download, FileText } from 'lucide-react'
import { exportAsPdf, exportAsPng } from './export'
import type { Theme } from './types'

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
    <div className="min-h-screen bg-[#050505] text-white">
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
      <div className="max-w-[1200px] mx-auto py-12 px-8 space-y-8">
        {slides.map((SlideComponent, i) => (
          <div
            key={i}
            className="overflow-auto border border-white/[0.08] rounded-xl w-fit"
            style={{ maxWidth: '100%' }}
          >
            <div
              ref={(el) => { slideRefs.current[i] = el }}
              style={{ width, height, flexShrink: 0 }}
            >
              <SlideComponent width={width} height={height} theme={theme} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
