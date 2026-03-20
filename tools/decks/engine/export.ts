import { toPng, toJpeg } from 'html-to-image'
import { jsPDF } from 'jspdf'
import type { ExportOptions } from './types'

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

    const dataUrl = await toPng(el, {
      width,
      height,
      pixelRatio,
      backgroundColor: bg,
    })

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

    const dataUrl = await toJpeg(el, {
      width,
      height,
      pixelRatio,
      quality,
      backgroundColor: bg,
    })

    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height)
  }

  // Add clickable links
  for (const link of links) {
    const pageEl = elements[link.page]
    if (!pageEl) continue

    const targetEl = pageEl.querySelector(link.selector)
    if (!targetEl) continue

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
