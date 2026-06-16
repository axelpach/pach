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
    const modulePath = normalizeModulePath(String(req.params[0] ?? ''))
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
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body, #root { width: 100%; min-height: 100%; margin: 0; }
      body { background: #0f0d0c; color: #f3f0e9; overflow: auto; }
      * { box-sizing: border-box; }
    </style>
    <script type="importmap">${JSON.stringify({ imports: importMap }, null, 6)}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import * as TemplateModule from '${moduleUrl(versionId, entryPath)}'

      const rootElement = document.getElementById('root')
      const Component = TemplateModule.default || TemplateModule.Template || TemplateModule.App

      if (Component) {
        createRoot(rootElement).render(React.createElement(Component, {
          width: window.innerWidth,
          height: window.innerHeight
        }))
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
