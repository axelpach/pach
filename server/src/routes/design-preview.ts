import { posix as pathPosix } from 'node:path'
import { Router } from 'express'
import ts from 'typescript'
import { eq } from 'drizzle-orm'
import { designTemplateVersions } from '../../../db/schema.js'
import { getDb } from '../db.js'

const router = Router()
const MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.css', '.json']
const INDEX_CANDIDATES = MODULE_EXTENSIONS.map((extension) => `index${extension}`)
const DEFAULT_IMPORTS: Record<string, string> = {
  react: 'https://esm.sh/react@19.2.4',
  'react-dom/client': 'https://esm.sh/react-dom@19.2.4/client',
  'react/jsx-runtime': 'https://esm.sh/react@19.2.4/jsx-runtime',
  'lucide-react': 'https://esm.sh/lucide-react@0.462.0',
}
const ENTRY_CANDIDATES = [
  'src/Template.tsx',
  'src/template.tsx',
  'src/App.tsx',
  'src/main.tsx',
  'index.tsx',
  'template.html',
  'index.html',
]

router.get('/versions/:versionId', async (req, res, next) => {
  try {
    const version = await readVersion(req.params.versionId)
    const files = readFiles(version.files)
    const manifest = readManifest(version.manifest)
    const dependencies = readDependencies(version.dependencies)
    const entryPath = findEntryPath(files, manifest)

    if (!entryPath) {
      res.status(422).type('html').send(renderPreviewError('No preview entry found', [
        'Add a manifest.entry value or create src/Template.tsx, src/App.tsx, index.tsx, template.html, or index.html.',
      ]))
      return
    }

    const source = files[entryPath] ?? ''
    if (isHtmlEntry(entryPath, version.sourceKind)) {
      res.type('html').send(source)
      return
    }

    res.type('html').send(renderReactPreviewShell(req.params.versionId, entryPath, manifest, dependencies))
  } catch (error) {
    next(error)
  }
})

router.get('/versions/:versionId/modules/*', async (req, res, next) => {
  try {
    const version = await readVersion(req.params.versionId)
    const files = readFiles(version.files)
    const wildcardParams = req.params as Record<string, string | string[] | undefined>
    const rawModulePath = wildcardParams[0] ?? wildcardParams['0'] ?? ''
    const modulePath = normalizeModulePath(Array.isArray(rawModulePath) ? rawModulePath.join('/') : rawModulePath)
    const resolvedPath = resolveModulePath(files, '', modulePath) ?? modulePath
    const source = files[resolvedPath]

    if (source == null) {
      res.status(404).type('text/plain').send(`Template module not found: ${modulePath}`)
      return
    }

    if (resolvedPath.endsWith('.css')) {
      res.type('application/javascript').send(renderCssModule(source))
      return
    }

    if (resolvedPath.endsWith('.json')) {
      res.type('application/javascript').send(`export default ${source}`)
      return
    }

    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        isolatedModules: true,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: 'react',
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })

    res
      .type('application/javascript')
      .send(rewriteRelativeImports(transpiled.outputText, resolvedPath, files, req.params.versionId))
  } catch (error) {
    next(error)
  }
})

async function readVersion(versionId: string) {
  const [version] = await getDb()
    .select()
    .from(designTemplateVersions)
    .where(eq(designTemplateVersions.id, versionId))
    .limit(1)

  if (!version) {
    const error = new Error('Design template version not found')
    ;(error as { status?: number }).status = 404
    throw error
  }

  return version
}

function readFiles(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([filePath, source]) => [normalizeModulePath(filePath), source]),
  )
}

function readManifest(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readDependencies(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => (
      isSafePackageName(entry[0]) && typeof entry[1] === 'string'
    )),
  )
}

function findEntryPath(files: Record<string, string>, manifest: Record<string, unknown>) {
  const manifestEntry = typeof manifest.entry === 'string' ? normalizeModulePath(manifest.entry) : null
  if (manifestEntry) {
    const resolvedManifestEntry = resolveModulePath(files, '', manifestEntry)
    if (resolvedManifestEntry) return resolvedManifestEntry
  }

  return ENTRY_CANDIDATES.find((candidate) => files[candidate] != null) ?? null
}

function isHtmlEntry(entryPath: string, sourceKind: string) {
  return sourceKind === 'html' || entryPath.endsWith('.html')
}

function normalizeModulePath(filePath: string) {
  const decoded = decodeURIComponent(filePath)
  const normalized = pathPosix.normalize(decoded.replace(/\\/g, '/')).replace(/^(\.\.\/)+/, '')
  return normalized === '.' ? '' : normalized.replace(/^\/+/, '')
}

function resolveModulePath(files: Record<string, string>, importerPath: string, requestedPath: string) {
  const baseDir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/') + 1) : ''
  const rawPath = requestedPath.startsWith('.')
    ? normalizeModulePath(pathPosix.join(baseDir, requestedPath))
    : normalizeModulePath(requestedPath)

  const candidates = [
    rawPath,
    ...MODULE_EXTENSIONS.map((extension) => `${rawPath}${extension}`),
    ...INDEX_CANDIDATES.map((indexCandidate) => `${rawPath}/${indexCandidate}`),
  ]

  return candidates.find((candidate) => files[candidate] != null) ?? null
}

function rewriteRelativeImports(code: string, importerPath: string, files: Record<string, string>, versionId: string) {
  return code
    .replace(/(\bfrom\s*['"])(\.[^'"]+)(['"])/g, (_match, prefix: string, specifier: string, suffix: string) => {
      const resolvedPath = resolveModulePath(files, importerPath, specifier)
      return resolvedPath ? `${prefix}${moduleUrl(versionId, resolvedPath)}${suffix}` : `${prefix}${specifier}${suffix}`
    })
    .replace(/(\bimport\s*['"])(\.[^'"]+)(['"])/g, (_match, prefix: string, specifier: string, suffix: string) => {
      const resolvedPath = resolveModulePath(files, importerPath, specifier)
      return resolvedPath ? `${prefix}${moduleUrl(versionId, resolvedPath)}${suffix}` : `${prefix}${specifier}${suffix}`
    })
}

function moduleUrl(versionId: string, modulePath: string) {
  return `/design-preview/versions/${encodeURIComponent(versionId)}/modules/${encodePath(modulePath)}`
}

function encodePath(filePath: string) {
  return filePath.split('/').map(encodeURIComponent).join('/')
}

function renderReactPreviewShell(
  versionId: string,
  entryPath: string,
  manifest: Record<string, unknown>,
  dependencies: Record<string, string>,
) {
  const title = typeof manifest.title === 'string' ? manifest.title : 'Design template preview'
  const importMap = buildImportMap(dependencies)
  const dimensions = readPreviewDimensions(manifest)
  const tailwindRuntime = renderTailwindRuntime(manifest)
  const fontLinks = renderFontLinks(manifest)
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body, #root { width: 100%; min-height: 100%; margin: 0; }
      body { background: #050706; color: #f3f0e9; overflow: auto; }
      * { box-sizing: border-box; }
      .design-preview-stack {
        width: 100%;
        min-height: 100vh;
        padding: 48px clamp(18px, 4vw, 72px);
      }
      .design-slide-shell {
        width: min(100%, ${dimensions.width}px);
        margin: 0 auto 48px;
      }
      .design-slide-viewport {
        position: relative;
        width: 100%;
        aspect-ratio: ${dimensions.width} / ${dimensions.height};
        overflow: hidden;
        border: 1px solid rgba(97, 255, 143, 0.18);
        background: #0f0d0c;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
      }
      .design-slide-canvas {
        position: absolute;
        left: 0;
        top: 0;
        width: ${dimensions.width}px;
        height: ${dimensions.height}px;
        transform-origin: top left;
      }
      .design-slide-meta {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 10px;
        color: rgba(199, 213, 201, 0.48);
        font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }
    </style>
    ${fontLinks}
    ${tailwindRuntime}
    <script type="importmap">${JSON.stringify({ imports: importMap }, null, 6)}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { toJpeg, toPng } from 'https://esm.sh/html-to-image@1.11.13'
      import { jsPDF } from 'https://esm.sh/jspdf@4.2.0'
      import * as TemplateModule from '${moduleUrl(versionId, entryPath)}'

      const rootElement = document.getElementById('root')
      const Component = TemplateModule.default || TemplateModule.Template || TemplateModule.App
      const exportedSlides = Array.isArray(TemplateModule.slides) ? TemplateModule.slides : []
      const slideComponents = exportedSlides.length > 0 ? exportedSlides : (Component ? [Component] : [])
      const slideWidth = ${dimensions.width}
      const slideHeight = ${dimensions.height}

      function SlideFrame({ Slide, index, total }) {
        const viewportRef = React.useRef(null)
        const [scale, setScale] = React.useState(1)

        React.useLayoutEffect(() => {
          const viewport = viewportRef.current
          if (!viewport) return

          const updateScale = () => setScale(viewport.clientWidth / slideWidth)
          updateScale()

          if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateScale)
            return () => window.removeEventListener('resize', updateScale)
          }

          const observer = new ResizeObserver(updateScale)
          observer.observe(viewport)
          return () => observer.disconnect()
        }, [])

        return React.createElement('section', { className: 'design-slide-shell' },
          React.createElement('div', { className: 'design-slide-viewport', ref: viewportRef },
            React.createElement('div', {
              className: 'design-slide-canvas',
              style: { transform: 'scale(' + scale + ')' },
            }, React.createElement(Slide, { width: slideWidth, height: slideHeight, pageIndex: index, pageCount: total }))
          ),
          React.createElement('div', { className: 'design-slide-meta' },
            React.createElement('span', null, 'slide ' + String(index + 1).padStart(2, '0')),
            React.createElement('span', null, slideWidth + ' x ' + slideHeight + 'px')
          )
        )
      }

      function DeckPreview() {
        return React.createElement('div', { className: 'design-preview-stack' },
          slideComponents.map((Slide, index) => React.createElement(SlideFrame, {
            key: index,
            Slide,
            index,
            total: slideComponents.length,
          }))
        )
      }

      async function captureSlideAtFullSize(slideCanvas, capture) {
        const savedTransform = slideCanvas.style.transform
        const savedTransformOrigin = slideCanvas.style.transformOrigin
        slideCanvas.style.transform = 'none'
        slideCanvas.style.transformOrigin = ''

        try {
          return await capture(slideCanvas)
        } finally {
          slideCanvas.style.transform = savedTransform
          slideCanvas.style.transformOrigin = savedTransformOrigin
        }
      }

      function downloadDataUrl(dataUrl, filename) {
        const link = document.createElement('a')
        link.download = filename
        link.href = dataUrl
        link.click()
      }

      async function waitForRenderAssets() {
        if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined)
        const images = Array.from(document.images)
        await Promise.all(images.map((image) => {
          if (image.complete) return Promise.resolve()
          return new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', resolve, { once: true })
          })
        }))
      }

      async function exportPng(filename) {
        await waitForRenderAssets()
        const slides = Array.from(document.querySelectorAll('.design-slide-canvas'))
        for (let index = 0; index < slides.length; index += 1) {
          const dataUrl = await captureSlideAtFullSize(slides[index], (element) =>
            toPng(element, {
              width: slideWidth,
              height: slideHeight,
              pixelRatio: 2,
              backgroundColor: '#0f0d0c',
            })
          )
          downloadDataUrl(dataUrl, slides.length === 1 ? filename + '.png' : filename + '-slide-' + (index + 1) + '.png')
          if (index < slides.length - 1) await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }

      async function exportPdf(filename) {
        await waitForRenderAssets()
        const slides = Array.from(document.querySelectorAll('.design-slide-canvas'))
        const orientation = slideWidth > slideHeight ? 'landscape' : 'portrait'
        const pdf = new jsPDF({ orientation, unit: 'px', format: [slideWidth, slideHeight] })

        for (let index = 0; index < slides.length; index += 1) {
          if (index > 0) pdf.addPage([slideWidth, slideHeight], orientation)
          const dataUrl = await captureSlideAtFullSize(slides[index], (element) =>
            toJpeg(element, {
              width: slideWidth,
              height: slideHeight,
              pixelRatio: 1.5,
              quality: 0.85,
              backgroundColor: '#0f0d0c',
            })
          )
          pdf.addImage(dataUrl, 'JPEG', 0, 0, slideWidth, slideHeight)
        }

        pdf.save(filename + '.pdf')
      }

      window.addEventListener('message', (event) => {
        if (event.data?.type !== 'pach-design-export') return
        const filename = String(event.data.filename || ${JSON.stringify(slugifyExportTitle(title))})
        if (event.data.format === 'png') void exportPng(filename)
        if (event.data.format === 'pdf') void exportPdf(filename)
      })

      if (slideComponents.length > 0) {
        createRoot(rootElement).render(React.createElement(DeckPreview))
      } else if (typeof TemplateModule.render === 'function') {
        TemplateModule.render(rootElement)
      } else {
        rootElement.innerHTML = ${JSON.stringify(renderPreviewError('No renderable export found', [
          `Export a default React component from ${entryPath}, or export Template, App, or render(rootElement).`,
        ]))}
      }
    </script>
  </body>
</html>`
}

function readPreviewDimensions(manifest: Record<string, unknown>) {
  const dimensions = manifest.dimensions && typeof manifest.dimensions === 'object' && !Array.isArray(manifest.dimensions)
    ? manifest.dimensions as Record<string, unknown>
    : {}
  const width = readPositiveNumber(dimensions.width) ?? readPositiveNumber(manifest.width) ?? 1920
  const height = readPositiveNumber(dimensions.height) ?? readPositiveNumber(manifest.height) ?? 1080
  return { width, height }
}

function readPositiveNumber(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function renderTailwindRuntime(manifest: Record<string, unknown>) {
  if (manifest.styling !== 'tailwind' && !manifest.tailwindConfig) return ''

  const tailwindConfig = manifest.tailwindConfig && typeof manifest.tailwindConfig === 'object' && !Array.isArray(manifest.tailwindConfig)
    ? manifest.tailwindConfig
    : {}

  return [
    `<script>window.tailwind = window.tailwind || {}; window.tailwind.config = ${safeJsonForScript(tailwindConfig)};</script>`,
    '<script src="https://cdn.tailwindcss.com"></script>',
  ].join('\n    ')
}

function renderFontLinks(manifest: Record<string, unknown>) {
  const href = typeof manifest.googleFontsHref === 'string' ? manifest.googleFontsHref.trim() : ''
  if (!href) return ''
  if (!/^https:\/\/fonts\.googleapis\.com\/css2\?/i.test(href)) return ''

  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${escapeHtml(href)}">`,
  ].join('\n    ')
}

function safeJsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function slugifyExportTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'design-template'
}

function buildImportMap(dependencies: Record<string, string>) {
  const imports = { ...DEFAULT_IMPORTS }

  for (const [packageName, version] of Object.entries(dependencies)) {
    if (DEFAULT_IMPORTS[packageName]) continue

    const packageUrl = esmPackageUrl(packageName, version)
    imports[packageName] = packageUrl
    imports[`${packageName}/`] = `${packageUrl}/`
  }

  return imports
}

function esmPackageUrl(packageName: string, version: string) {
  const cleanVersion = version.replace(/^[~^]/, '').trim()
  return cleanVersion && cleanVersion !== '*'
    ? `https://esm.sh/${packageName}@${encodeURIComponent(cleanVersion)}`
    : `https://esm.sh/${packageName}`
}

function isSafePackageName(packageName: string) {
  return /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(packageName)
}

function renderCssModule(source: string) {
  return `const css = ${JSON.stringify(source)};
const style = document.createElement('style');
style.textContent = css;
document.head.append(style);
export default css;`
}

function renderPreviewError(title: string, messages: string[]) {
  return `<div style="min-height:100vh;background:#0f0d0c;color:#f3f0e9;padding:32px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
  <p style="margin:0 0 8px;color:#ff5a52;text-transform:uppercase;letter-spacing:.24em;font-size:11px">Preview unavailable</p>
  <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
  ${messages.map((message) => `<p style="margin:0 0 8px;color:#9b9288;line-height:1.6">${escapeHtml(message)}</p>`).join('')}
</div>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default router
