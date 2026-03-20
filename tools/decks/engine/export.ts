import { toPng, toJpeg } from 'html-to-image'
import { jsPDF } from 'jspdf'
import type { ExportOptions } from './types'

/**
 * Temporarily reset CSS transform on an element for capture,
 * then restore it. This is needed because slides are displayed
 * with transform: scale() for preview but must be captured at
 * full native resolution.
 */
async function captureAtFullSize<T>(
  el: HTMLElement,
  captureFn: (el: HTMLElement) => Promise<T>
): Promise<T> {
  const savedTransform = el.style.transform
  const savedTransformOrigin = el.style.transformOrigin
  el.style.transform = 'none'
  el.style.transformOrigin = ''

  try {
    return await captureFn(el)
  } finally {
    el.style.transform = savedTransform
    el.style.transformOrigin = savedTransformOrigin
  }
}

/**
 * Export slide elements as PNG files (one per slide).
 * Triggers browser downloads.
 */
export async function exportAsPng(
  elements: (HTMLElement | null)[],
  filename: string,
  options: {
    width: number
    height: number
    bg: string
    pixelRatio?: number
  }
) {
  const { width, height, bg, pixelRatio = 2 } = options

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!el) continue

    const dataUrl = await captureAtFullSize(el, (e) =>
      toPng(e, { width, height, pixelRatio, backgroundColor: bg })
    )

    const link = document.createElement('a')
    link.download = elements.length === 1
      ? `${filename}.png`
      : `${filename}-slide-${i + 1}.png`
    link.href = dataUrl
    link.click()

    // Small delay between downloads to prevent browser blocking
    if (i < elements.length - 1) {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
}

/**
 * Export slide elements as a multi-page PDF.
 * Optionally adds clickable link annotations.
 */
export async function exportAsPdf(
  elements: (HTMLElement | null)[],
  filename: string,
  options: {
    width: number
    height: number
    bg: string
    pixelRatio?: number
    quality?: number
    links?: Array<{
      /** CSS selector to find the link element */
      selector: string
      url: string
      /** 0-indexed page number */
      page: number
    }>
  }
) {
  const { width, height, bg, pixelRatio = 1.5, quality = 0.85, links = [] } = options

  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
  })

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (!el) continue

    if (i > 0) pdf.addPage([width, height], width > height ? 'landscape' : 'portrait')

    const dataUrl = await captureAtFullSize(el, (e) =>
      toJpeg(e, { width, height, pixelRatio, quality, backgroundColor: bg })
    )

    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height)
  }

  // Add clickable links — also need to temporarily un-scale for correct coordinates
  for (const link of links) {
    const pageEl = elements[link.page]
    if (!pageEl) continue

    const targetEl = pageEl.querySelector(link.selector)
    if (!targetEl) continue

    // Link coordinates are based on the native dimensions, not scaled
    // Since we pass width/height explicitly, just compute relative position
    const pageRect = pageEl.getBoundingClientRect()
    const targetRect = targetEl.getBoundingClientRect()

    const scaleX = width / pageRect.width
    const scaleY = height / pageRect.height
    const x = (targetRect.left - pageRect.left) * scaleX
    const y = (targetRect.top - pageRect.top) * scaleY
    const w = targetRect.width * scaleX
    const h = targetRect.height * scaleY

    pdf.setPage(link.page + 1) // jsPDF pages are 1-indexed
    pdf.link(x, y, w, h, { url: link.url })
  }

  pdf.save(`${filename}.pdf`)
}
