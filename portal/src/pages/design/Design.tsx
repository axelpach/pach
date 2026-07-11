import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import {
  ArrowLeft,
  Bot,
  Braces,
  Check,
  Download,
  ExternalLink,
  FileImage,
  Image as ImageIcon,
  Layers3,
  MessageSquare,
  Paperclip,
  Palette,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { config } from '../../config'
import { authFetch } from '../../lib/auth'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'

type Organization = {
  id: string
  name: string
  project?: string | null
  description?: string | null
}

type DesignSystemRow = {
  id: string
  organizationId: string
  name: string
  slug: string
  markdown: string
  tokens: Record<string, unknown>
  assets: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt?: number
  updatedAt?: number
}

type DesignTemplateRow = {
  id: string
  organizationId: string
  type: string
  name: string
  slug: string
  status: string
  sourceKind: string
  currentVersionId?: string | null
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

type DesignTemplateVersionRow = {
  id: string
  organizationId?: string
  templateId: string
  versionNumber: number
  schemaVersion?: number
  sourceKind: string
  files: Record<string, string>
  manifest: Record<string, unknown>
  dependencies: Record<string, string>
  compiledArtifactUrl?: string | null
  previewImageUrl?: string | null
  validationStatus: string
  validationErrors?: Array<Record<string, unknown>>
  createdByRunId?: string | null
  createdAt?: number
}

type DesignTemplateRunRow = {
  id: string
  organizationId: string
  templateId?: string | null
  designSystemId?: string | null
  agentRunId?: string | null
  templateSlug?: string | null
  prompt: string
  status: string
  statusMessage?: string | null
  sourceVersionId?: string | null
  targetVersionId?: string | null
  outputSpec?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdAt: number
}

type AgentRunRow = {
  id: string
  parentRunId?: string | null
  subjectType: string
  subjectId?: string | null
  workerId?: string | null
  status: string
  statusMessage?: string | null
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

type AgentRunProgressReportRow = {
  id: string
  runId: string
  phase?: string | null
  level: string
  message: string
  percent?: number | null
  metadata: Record<string, unknown>
  createdAt: number
}

type DesignAssetRow = {
  id: string
  organizationId: string
  templateId?: string | null
  kind: string
  name: string
  storageKey?: string | null
  url?: string | null
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

type PendingAgentInputMedia = {
  id: string
  file: File
  name: string
  dimensions: { width: number; height: number } | null
}

type TemplateListItem = {
  id: string
  slug: string
  title: string
  project?: string | null
  organizationId?: string | null
  organizationProject?: string | null
  type: string
  sourceKind: string
  status?: string
  description?: string
  slideCount?: number
  dimensions?: string
  createdAt?: string
  currentVersionId?: string | null
  metadata?: Record<string, unknown>
}

const DESIGN_ASPECT_RATIOS = [
  { id: 'deck-landscape', label: 'deck landscape', width: 1920, height: 1080, ratio: '16:9' },
  { id: 'deck-portrait', label: 'deck portrait', width: 1080, height: 1528, ratio: '1:1.414' },
  { id: 'mobile-story', label: 'mobile story', width: 1080, height: 1920, ratio: '9:16' },
  { id: 'square', label: 'square', width: 1080, height: 1080, ratio: '1:1' },
] as const
const CUSTOM_ASPECT_RATIO_ID = 'custom'
const NO_DESIGN_SYSTEM_ID = '__none__'

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function formatDate(value?: number | string) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(value)
}

function formatDateTime(value?: number | string) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function slugifyTemplateName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function defaultDesignSystemMarkdown(organizationName: string) {
  return `# ${organizationName} Design System

## Direction

Describe the visual direction, brand personality, and what the design should feel like.

## Typography

- Primary font:
- Secondary/accent font:
- Weights and hierarchy:

## Color

- Backgrounds:
- Text:
- Accent:
- Avoid:

## Layout

- Composition:
- Spacing:
- Components:
- Data/product surfaces:

## Assets

- Logos:
- Imagery:
- Product screenshots:

## Deck Rules

- Preferred slide structure:
- Do:
- Do not:
`
}

function buildDbTemplateItems(rows: DesignTemplateRow[]): TemplateListItem[] {
  return rows.map((template) => {
    const metadata = template.metadata ?? {}
    const slideCount = readNumber(metadata.slideCount)
    const dimensions = readString(metadata.dimensions)
    return {
      id: template.id,
      slug: template.slug,
      title: template.name,
      project: readString(metadata.project),
      organizationId: template.organizationId,
      type: template.type,
      sourceKind: template.sourceKind,
      status: template.status,
      description: readString(metadata.description),
      slideCount,
      dimensions,
      createdAt: formatDate(template.createdAt),
      currentVersionId: template.currentVersionId,
      metadata,
    }
  })
}

function buildOutputSpec(aspectRatioId: string, customWidth: number, customHeight: number, slideCount: number) {
  const preset = DESIGN_ASPECT_RATIOS.find((ratio) => ratio.id === aspectRatioId)
  const width = preset?.width ?? clampDimension(customWidth, 320, 3840)
  const height = preset?.height ?? clampDimension(customHeight, 320, 3840)
  const safeSlideCount = Math.max(1, Math.min(30, Math.floor(slideCount || 1)))

  return {
    aspectRatioId: preset?.id ?? CUSTOM_ASPECT_RATIO_ID,
    label: preset?.label ?? 'custom',
    ratio: preset?.ratio ?? `${width}:${height}`,
    width,
    height,
    slideCount: safeSlideCount,
  }
}

function clampDimension(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function mergeRowsById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const byId = new Map<string, T>()
  for (const row of secondary) byId.set(row.id, row)
  for (const row of primary) byId.set(row.id, row)
  return Array.from(byId.values())
}

export default function Design() {
  const { templateSlug } = useParams<{ templateSlug: string }>()
  const navigate = useNavigate()
  const z = useZero<Schema, Mutators>()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [designSystems] = useQuery(z.query.design_systems.orderBy('updatedAt', 'desc'))
  const [dbTemplates] = useQuery(z.query.design_templates.orderBy('updatedAt', 'desc'))
  const [templateVersions] = useQuery(z.query.design_template_versions.orderBy('createdAt', 'desc'))
  const [designAssets] = useQuery(z.query.design_assets.orderBy('createdAt', 'desc'))
  const [templateRuns] = useQuery(z.query.design_template_runs.orderBy('createdAt', 'desc'))
  const [agentRuns] = useQuery(z.query.agent_runs.orderBy('createdAt', 'desc'))
  const [agentRunProgressReports] = useQuery(z.query.agent_run_progress_reports.orderBy('createdAt', 'desc'))
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'deck'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [prompt, setPrompt] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [sidebarError, setSidebarError] = useState<string | null>(null)
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [isAssetsModalOpen, setIsAssetsModalOpen] = useState(false)
  const [pendingInputMedia, setPendingInputMedia] = useState<PendingAgentInputMedia[]>([])
  const [localCreatedTemplates, setLocalCreatedTemplates] = useState<DesignTemplateRow[]>([])
  const [localCreatedVersions, setLocalCreatedVersions] = useState<DesignTemplateVersionRow[]>([])
  const [selectedDesignSystemId, setSelectedDesignSystemId] = useState<string>('')
  const [selectedAspectRatioId, setSelectedAspectRatioId] = useState<string>('deck-landscape')
  const [customWidth, setCustomWidth] = useState(1920)
  const [customHeight, setCustomHeight] = useState(1080)
  const [slideCount, setSlideCount] = useState(5)
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview'>('preview')

  const typedOrganizations = organizations as Organization[]
  const typedSystems = designSystems as DesignSystemRow[]
  const zeroDbTemplates = dbTemplates as DesignTemplateRow[]
  const zeroVersions = templateVersions as DesignTemplateVersionRow[]
  const typedDbTemplates = useMemo(
    () => mergeRowsById(zeroDbTemplates, localCreatedTemplates),
    [zeroDbTemplates, localCreatedTemplates],
  )
  const typedVersions = useMemo(
    () => mergeRowsById(zeroVersions, localCreatedVersions),
    [zeroVersions, localCreatedVersions],
  )
  const typedAssets = designAssets as DesignAssetRow[]
  const typedRuns = templateRuns as DesignTemplateRunRow[]
  const typedAgentRuns = agentRuns as AgentRunRow[]
  const typedProgressReports = agentRunProgressReports as AgentRunProgressReportRow[]

  const templates = useMemo(() => {
    return buildDbTemplateItems(typedDbTemplates)
  }, [typedDbTemplates])

  const selectedTemplate = templates.find((template) => template.slug === templateSlug)

  useEffect(() => {
    setMobilePane(templateSlug ? 'preview' : 'chat')
  }, [templateSlug])

  useEffect(() => {
    if (!typedOrganizations.length) return
    if (selectedTemplate?.organizationId && selectedTemplate.organizationId !== selectedOrganizationId) {
      setSelectedOrganizationId(selectedTemplate.organizationId)
      return
    }
    if (selectedTemplate?.organizationProject && selectedTemplate.organizationProject !== typedOrganizations.find((org) => org.id === selectedOrganizationId)?.project) {
      const matchingOrganization = typedOrganizations.find((org) => org.project === selectedTemplate.organizationProject)
      if (matchingOrganization) {
        setSelectedOrganizationId(matchingOrganization.id)
        return
      }
    }
    if (!selectedOrganizationId) setSelectedOrganizationId(typedOrganizations[0].id)
  }, [selectedOrganizationId, selectedTemplate, typedOrganizations])

  const selectedOrganization = typedOrganizations.find((organization) => organization.id === selectedOrganizationId)
  const systemsForOrganization = useMemo(
    () => typedSystems
      .filter((system) => system.organizationId === selectedOrganizationId)
      .sort((a, b) => {
        const aDefault = readBoolean(a.metadata?.isDefault) ? 1 : 0
        const bDefault = readBoolean(b.metadata?.isDefault) ? 1 : 0
        if (aDefault !== bDefault) return bDefault - aDefault
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      }),
    [selectedOrganizationId, typedSystems],
  )
  const selectedSystem = systemsForOrganization.find((system) => system.id === selectedDesignSystemId)
  const outputSpec = useMemo(
    () => buildOutputSpec(selectedAspectRatioId, customWidth, customHeight, slideCount),
    [selectedAspectRatioId, customWidth, customHeight, slideCount],
  )

  useEffect(() => {
    if (!selectedOrganizationId) return
    if (selectedDesignSystemId && systemsForOrganization.some((system) => system.id === selectedDesignSystemId)) return
    const defaultSystem = systemsForOrganization.find((system) => readBoolean(system.metadata?.isDefault))
    setSelectedDesignSystemId(defaultSystem?.id ?? '')
  }, [selectedDesignSystemId, selectedOrganizationId, systemsForOrganization])

  const visibleTemplates = templates.filter((template) => {
    if (typeFilter !== 'all' && template.type !== typeFilter) return false
    if (!selectedOrganization) return true
    if (template.organizationId) return template.organizationId === selectedOrganization.id
    if (template.organizationProject) return template.organizationProject === selectedOrganization.project
    return true
  }).filter((template) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return [
      template.title,
      template.description,
      template.type,
      template.dimensions,
    ].some((value) => value?.toLowerCase().includes(query))
  })

  const selectedVersion = selectedTemplate?.currentVersionId
    ? typedVersions.find((version) => version.id === selectedTemplate.currentVersionId)
    : selectedTemplate?.id
      ? typedVersions.find((version) => version.templateId === selectedTemplate.id)
      : undefined

  const runsForTemplate = typedRuns
    .filter((run) => {
      if (!selectedTemplate) return false
      return run.templateSlug === selectedTemplate.slug || run.templateId === selectedTemplate.id
    })
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-8)
  const assetsForOrganization = selectedOrganization
    ? typedAssets.filter((asset) => asset.organizationId === selectedOrganization.id)
    : []
  const agentRunByDesignRunId = useMemo(() => {
    const byId = new Map<string, AgentRunRow>()
    for (const run of typedAgentRuns) {
      if (run.subjectType === 'design_template_run' && run.subjectId) byId.set(run.subjectId, run)
    }
    for (const run of runsForTemplate) {
      if (run.agentRunId) {
        const agentRun = typedAgentRuns.find((candidate) => candidate.id === run.agentRunId)
        if (agentRun) byId.set(run.id, agentRun)
      }
    }
    return byId
  }, [runsForTemplate, typedAgentRuns])
  const progressReportsByRunId = useMemo(() => {
    const byRunId = new Map<string, AgentRunProgressReportRow[]>()
    for (const report of typedProgressReports) {
      const list = byRunId.get(report.runId) ?? []
      list.push(report)
      byRunId.set(report.runId, list)
    }
    return byRunId
  }, [typedProgressReports])

  async function handleQueueRun(event: FormEvent) {
    event.preventDefault()
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt || !selectedTemplate || !selectedOrganization) return

    setChatError(null)
    const mediaToUpload = pendingInputMedia
    try {
      const latestDesignRun = [...runsForTemplate]
        .reverse()
        .find((run) => agentRunByDesignRunId.get(run.id) || run.agentRunId)
      const latestAgentRun = latestDesignRun
        ? agentRunByDesignRunId.get(latestDesignRun.id) ?? typedAgentRuns.find((run) => run.id === latestDesignRun.agentRunId)
        : undefined
      const hasPendingMedia = mediaToUpload.length > 0

      if (latestAgentRun) {
        const response = await authFetch(`${config.apiUrl}/design/runs/${encodeURIComponent(latestAgentRun.id)}/follow-up`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            feedback: cleanPrompt,
            pendingInputMediaCount: mediaToUpload.length,
            designSystemId: selectedDesignSystemId || null,
            outputSpec,
          }),
        })
        const payload = await response.json().catch(() => ({})) as {
          run?: { id?: string }
          designRun?: { id?: string }
          message?: string
          error?: string
        }
        if (!response.ok) {
          throw new Error(readString(payload.message) ?? readString(payload.error) ?? 'could not queue follow-up')
        }

        const agentRunId = readString(payload.run?.id)
        const designRunId = readString(payload.designRun?.id)
        if (hasPendingMedia && agentRunId) {
          await uploadAgentInputMedia(agentRunId, mediaToUpload)
          await z.mutate.agent_runs.update({
            id: agentRunId,
            status: 'queued',
            statusMessage: latestAgentRun.workerId ? 'queued for same design agent worker' : 'queued for design agent worker',
          })
          if (designRunId) {
            await z.mutate.design_template_runs.update({
              id: designRunId,
              status: 'queued',
              statusMessage: 'queued for agent worker',
            })
          }
        }
        setPrompt('')
        setPendingInputMedia([])
        return
      }

      const designRunId = crypto.randomUUID()
      const agentRunId = crypto.randomUUID()
      const branchName = `design/${selectedTemplate.slug}-${agentRunId.slice(0, 8)}`
      await z.mutate.agent_runs.create({
        id: agentRunId,
        subjectType: 'design_template_run',
        subjectId: designRunId,
        projectKey: selectedOrganization.project ?? 'pach',
        repoFullName: 'pach/design',
        baseBranch: 'main',
        branchName,
        status: hasPendingMedia ? 'reserved' : 'queued',
        statusMessage: hasPendingMedia ? 'uploading input media' : 'queued for design agent worker',
        metadata: {
          executionClass: 'general',
          handler: 'design-template-mcp',
          requiredCapabilities: ['codex.local', 'pach-mcp'],
          queuedVia: 'design_template_chat',
          designTemplateRunId: designRunId,
          designTemplateId: selectedTemplate.id,
          designTemplateSlug: selectedTemplate.slug,
          designTemplateTitle: selectedTemplate.title,
          organizationId: selectedOrganization.id,
          organizationName: selectedOrganization.name,
          organizationProject: selectedOrganization.project,
          sourceVersionId: selectedVersion?.id,
          prompt: cleanPrompt,
          designSystemId: selectedDesignSystemId || undefined,
          outputSpec,
          pendingInputMediaCount: mediaToUpload.length,
        },
      })
      await z.mutate.design_template_runs.create({
        id: designRunId,
        organizationId: selectedOrganization.id,
        templateId: selectedTemplate.id,
        designSystemId: selectedDesignSystemId || undefined,
        agentRunId,
        templateSlug: selectedTemplate.slug,
        prompt: cleanPrompt,
        status: hasPendingMedia ? 'reserved' : 'queued',
        statusMessage: hasPendingMedia ? 'uploading input media' : 'queued for agent worker',
        sourceVersionId: selectedVersion?.id,
        metadata: {
          templateTitle: selectedTemplate.title,
          sourceKind: selectedTemplate.sourceKind,
          designSystemId: selectedDesignSystemId || null,
          outputSpec,
          agentRunId,
        },
        outputSpec,
      })
      if (hasPendingMedia) {
        await uploadAgentInputMedia(agentRunId, mediaToUpload)
        await z.mutate.agent_runs.update({
          id: agentRunId,
          status: 'queued',
          statusMessage: 'queued for design agent worker',
        })
        await z.mutate.design_template_runs.update({
          id: designRunId,
          status: 'queued',
          statusMessage: 'queued for agent worker',
        })
      }
      setPrompt('')
      setPendingInputMedia([])
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'could not queue run')
    }
  }

  async function handleAddInputMedia(files: FileList | File[]) {
    const selectedFiles = Array.from(files).slice(0, 8)
    if (!selectedFiles.length) return

    const items = await Promise.all(selectedFiles.map(async (file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      dimensions: await readImageDimensions(file),
    })))
    setPendingInputMedia((current) => [...current, ...items].slice(0, 8))
  }

  function handleRemoveInputMedia(id: string) {
    setPendingInputMedia((current) => current.filter((item) => item.id !== id))
  }

  async function uploadAgentInputMedia(agentRunId: string, mediaItems: PendingAgentInputMedia[]) {
    for (const item of mediaItems) {
      const contentBase64 = await readFileAsBase64(item.file)
      const response = await authFetch(`${config.apiUrl}/media/agent-run-input/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          runId: agentRunId,
          name: item.name,
          fileName: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          contentBase64,
          width: item.dimensions?.width,
          height: item.dimensions?.height,
          kind: item.file.type.startsWith('image/') ? 'screenshot' : 'file',
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(readString(payload.message) ?? readString(payload.error) ?? `could not upload ${item.name}`)
      }
    }
  }

  async function handleCreateTemplate() {
    if (!selectedOrganization || isCreatingTemplate) return

    const templateId = crypto.randomUUID()
    const versionId = crypto.randomUUID()
    const timestamp = Date.now().toString(36)
    const name = 'Untitled deck template'
    const slug = `${slugifyTemplateName(name)}-${timestamp}`

    setSidebarError(null)
    setIsCreatingTemplate(true)
    try {
      const files = buildDefaultTemplateFiles(name, selectedOrganization)
      const manifest = {
        title: name,
        type: 'deck',
        entry: 'src/Template.tsx',
        styling: 'tailwind',
        googleFontsHref: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@200;300;400;500&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap',
        tailwindConfig: buildDefaultTailwindConfig(selectedOrganization),
        aspectRatioId: outputSpec.aspectRatioId,
        dimensions: { width: outputSpec.width, height: outputSpec.height },
      }
      const response = await authFetch(`${config.apiUrl}/design/templates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId,
          versionId,
          organizationId: selectedOrganization.id,
          type: 'deck',
          name,
          slug,
          status: 'draft',
          sourceKind: 'react',
          files,
          manifest,
          dependencies: {},
          metadata: {
            project: selectedOrganization.project,
            description: 'Draft deck template',
            slideCount: outputSpec.slideCount,
            dimensions: `${outputSpec.width} x ${outputSpec.height}`,
          },
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(readString(payload.message) ?? readString(payload.error) ?? 'could not create template')
      }
      const payload = await response.json() as { template: DesignTemplateRow; version: DesignTemplateVersionRow }
      setLocalCreatedTemplates((current) => mergeRowsById([payload.template], current))
      setLocalCreatedVersions((current) => mergeRowsById([payload.version], current))
      navigate(`/design/${slug}`)
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : 'could not create template')
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  async function handleRenameTemplate(template: TemplateListItem, nextName: string) {
    const cleanName = nextName.trim()
    if (!cleanName || cleanName === template.title) return

    await z.mutate.design_templates.update({
      id: template.id,
      name: cleanName,
    })

    if (selectedVersion) {
      await z.mutate.design_template_versions.update({
        id: selectedVersion.id,
        manifest: {
          ...(selectedVersion.manifest ?? {}),
          title: cleanName,
        },
      })
    }
  }

  async function handleDeleteTemplate(template: TemplateListItem) {
    const response = await authFetch(`${config.apiUrl}/design/templates/${encodeURIComponent(template.id)}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(readString(payload.message) ?? readString(payload.error) ?? 'could not delete template')
    }

    setLocalCreatedTemplates((current) => current.filter((row) => row.id !== template.id))
    setLocalCreatedVersions((current) => current.filter((row) => row.templateId !== template.id))
    navigate('/design')
  }

  async function handleCreateDesignSystem() {
    if (!selectedOrganization) return
    const id = crypto.randomUUID()
    const name = systemsForOrganization.length ? 'New design system' : `${selectedOrganization.name} design system`
    const slug = `${slugifyTemplateName(name)}-${Date.now().toString(36)}`
    const isDefault = systemsForOrganization.length === 0
    await z.mutate.design_systems.create({
      id,
      organizationId: selectedOrganization.id,
      name,
      slug,
      markdown: defaultDesignSystemMarkdown(selectedOrganization.name),
      metadata: { isDefault },
    })
    setSelectedDesignSystemId(id)
  }

  async function handleSaveDesignSystem(system: DesignSystemRow, updates: { name: string; slug: string; markdown: string; metadata: Record<string, unknown> }) {
    await z.mutate.design_systems.update({
      id: system.id,
      name: updates.name,
      slug: updates.slug,
      markdown: updates.markdown,
      metadata: updates.metadata,
    })
  }

  async function handleDeleteDesignSystem(system: DesignSystemRow) {
    await z.mutate.design_systems.delete({ id: system.id })
    if (selectedDesignSystemId === system.id) setSelectedDesignSystemId('')
  }

  async function handleSetDefaultDesignSystem(system: DesignSystemRow | null) {
    await Promise.all(systemsForOrganization.map((candidate) => z.mutate.design_systems.update({
      id: candidate.id,
      metadata: {
        ...(candidate.metadata ?? {}),
        isDefault: system ? candidate.id === system.id : false,
      },
    })))
    setSelectedDesignSystemId(system?.id ?? '')
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-pit text-fg-1 md:flex-row">
      {selectedTemplate ? (
        <div className="grid shrink-0 grid-cols-2 border-b border-edge/12 bg-void/95 p-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobilePane('chat')}
            className={`inline-flex h-9 items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-label transition ${
              mobilePane === 'chat'
                ? 'border-accent-fill/30 bg-accent-fill/10 text-accent'
                : 'border-edge/14 bg-pit-3 text-fg-3 hover:border-edge/35 hover:text-fg-1'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            chat
          </button>
          <button
            type="button"
            onClick={() => setMobilePane('preview')}
            className={`inline-flex h-9 items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-label transition ${
              mobilePane === 'preview'
                ? 'border-accent-fill/30 bg-accent-fill/10 text-accent'
                : 'border-edge/14 bg-pit-3 text-fg-3 hover:border-edge/35 hover:text-fg-1'
            }`}
          >
            <Braces className="h-3.5 w-3.5" />
            preview
          </button>
        </div>
      ) : null}
      <DesignSidebar
        isHiddenOnMobile={Boolean(selectedTemplate && mobilePane === 'preview')}
        organizations={typedOrganizations}
        selectedOrganizationId={selectedOrganizationId}
        onOrganizationChange={(id) => {
          setSelectedOrganizationId(id)
          setSidebarError(null)
          navigate('/design')
        }}
        templates={visibleTemplates}
        selectedTemplate={selectedTemplate}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        prompt={prompt}
        onPromptChange={setPrompt}
        onQueueRun={handleQueueRun}
        inputMedia={pendingInputMedia}
        onAddInputMedia={handleAddInputMedia}
        onRemoveInputMedia={handleRemoveInputMedia}
        onCreateTemplate={handleCreateTemplate}
        isCreatingTemplate={isCreatingTemplate}
        sidebarError={sidebarError}
        runs={runsForTemplate}
        agentRunByDesignRunId={agentRunByDesignRunId}
        progressReportsByRunId={progressReportsByRunId}
        chatError={chatError}
        onRenameTemplate={handleRenameTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        designSystems={systemsForOrganization}
        selectedDesignSystemId={selectedDesignSystemId}
        onDesignSystemChange={setSelectedDesignSystemId}
        aspectRatioId={selectedAspectRatioId}
        onAspectRatioChange={setSelectedAspectRatioId}
        customWidth={customWidth}
        onCustomWidthChange={setCustomWidth}
        customHeight={customHeight}
        onCustomHeightChange={setCustomHeight}
        slideCount={slideCount}
        onSlideCountChange={setSlideCount}
        designSystemName={selectedSystem?.name ?? 'no design system'}
        onOpenAssets={() => setIsAssetsModalOpen(true)}
        onBack={() => navigate('/design')}
        onOpenTemplate={(slug) => navigate(`/design/${slug}`)}
      />

      <main className={`${selectedTemplate && mobilePane === 'chat' ? 'hidden md:block' : 'block'} flex-1 min-w-0 min-h-0 overflow-hidden`}>
        {selectedTemplate ? (
          <TemplatePreview template={selectedTemplate} version={selectedVersion} />
        ) : (
          <DesignSystemEditor
            organization={selectedOrganization}
            systems={systemsForOrganization}
            selectedDesignSystemId={selectedDesignSystemId}
            onSelectedDesignSystemChange={setSelectedDesignSystemId}
            onCreateDesignSystem={handleCreateDesignSystem}
            onSaveDesignSystem={handleSaveDesignSystem}
            onDeleteDesignSystem={handleDeleteDesignSystem}
            onSetDefaultDesignSystem={handleSetDefaultDesignSystem}
          />
        )}
      </main>

      {isAssetsModalOpen && selectedOrganization && (
        <DesignAssetsModal
          organization={selectedOrganization}
          template={selectedTemplate}
          assets={assetsForOrganization}
          onClose={() => setIsAssetsModalOpen(false)}
        />
      )}
    </div>
  )
}

function DesignSidebar({
  isHiddenOnMobile,
  organizations,
  selectedOrganizationId,
  onOrganizationChange,
  templates,
  selectedTemplate,
  typeFilter,
  onTypeFilterChange,
  searchQuery,
  onSearchQueryChange,
  prompt,
  onPromptChange,
  onQueueRun,
  inputMedia,
  onAddInputMedia,
  onRemoveInputMedia,
  onCreateTemplate,
  isCreatingTemplate,
  sidebarError,
  runs,
  agentRunByDesignRunId,
  progressReportsByRunId,
  chatError,
  onRenameTemplate,
  onDeleteTemplate,
  designSystems,
  selectedDesignSystemId,
  onDesignSystemChange,
  aspectRatioId,
  onAspectRatioChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  slideCount,
  onSlideCountChange,
  designSystemName,
  onOpenAssets,
  onBack,
  onOpenTemplate,
}: {
  isHiddenOnMobile?: boolean
  organizations: Organization[]
  selectedOrganizationId: string
  onOrganizationChange: (id: string) => void
  templates: TemplateListItem[]
  selectedTemplate?: TemplateListItem
  typeFilter: 'all' | 'deck'
  onTypeFilterChange: (value: 'all' | 'deck') => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  prompt: string
  onPromptChange: (value: string) => void
  onQueueRun: (event: FormEvent) => void
  inputMedia: PendingAgentInputMedia[]
  onAddInputMedia: (files: FileList | File[]) => Promise<void>
  onRemoveInputMedia: (id: string) => void
  onCreateTemplate: () => void
  isCreatingTemplate: boolean
  sidebarError: string | null
  runs: DesignTemplateRunRow[]
  agentRunByDesignRunId: Map<string, AgentRunRow>
  progressReportsByRunId: Map<string, AgentRunProgressReportRow[]>
  chatError: string | null
  onRenameTemplate: (template: TemplateListItem, nextName: string) => Promise<void>
  onDeleteTemplate: (template: TemplateListItem) => Promise<void>
  designSystems: DesignSystemRow[]
  selectedDesignSystemId: string
  onDesignSystemChange: (id: string) => void
  aspectRatioId: string
  onAspectRatioChange: (id: string) => void
  customWidth: number
  onCustomWidthChange: (value: number) => void
  customHeight: number
  onCustomHeightChange: (value: number) => void
  slideCount: number
  onSlideCountChange: (value: number) => void
  designSystemName: string
  onOpenAssets: () => void
  onBack: () => void
  onOpenTemplate: (slug: string) => void
}) {
  const organizationOptions: PachSelectOption[] = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId)
  const typeOptions: PachSelectOption[] = [
    { value: 'all', label: 'all' },
    { value: 'deck', label: 'decks' },
  ]
  const selectedTypeLabel = typeOptions.find((option) => option.value === typeFilter)?.label ?? 'all'

  return (
    <aside className={`${isHiddenOnMobile ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-1 shrink-0 flex-col border-b border-edge/12 bg-void/95 md:w-[372px] md:flex-none md:border-b-0 md:border-r`}>
      {selectedTemplate ? (
        <TemplateChatSidebar
          template={selectedTemplate}
          prompt={prompt}
          onPromptChange={onPromptChange}
          onQueueRun={onQueueRun}
          inputMedia={inputMedia}
          onAddInputMedia={onAddInputMedia}
          onRemoveInputMedia={onRemoveInputMedia}
          runs={runs}
          agentRunByDesignRunId={agentRunByDesignRunId}
          progressReportsByRunId={progressReportsByRunId}
          chatError={chatError}
          onRenameTemplate={onRenameTemplate}
          onDeleteTemplate={onDeleteTemplate}
          designSystems={designSystems}
          selectedDesignSystemId={selectedDesignSystemId}
          onDesignSystemChange={onDesignSystemChange}
          aspectRatioId={aspectRatioId}
          onAspectRatioChange={onAspectRatioChange}
          customWidth={customWidth}
          onCustomWidthChange={onCustomWidthChange}
          customHeight={customHeight}
          onCustomHeightChange={onCustomHeightChange}
          slideCount={slideCount}
          onSlideCountChange={onSlideCountChange}
          designSystemName={designSystemName}
          onOpenAssets={onOpenAssets}
          onBack={onBack}
        />
      ) : (
        <>
          <div className="border-b border-edge/12 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-label text-fg-4">
                <Palette className="h-3.5 w-3.5 text-accent" />
                design
              </div>
              <button
                type="button"
                onClick={onCreateTemplate}
                disabled={isCreatingTemplate || !selectedOrganizationId}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-accent-fill/25 bg-accent-fill/8 px-2 font-mono text-[9px] uppercase tracking-label text-accent transition hover:bg-accent-fill/14 disabled:cursor-not-allowed disabled:border-edge/12 disabled:bg-pit-3 disabled:text-fg-4"
                title="create new template"
              >
                <Plus className="h-3.5 w-3.5" />
                {isCreatingTemplate ? 'creating' : 'new'}
              </button>
            </div>
            <PachSelect
              value={selectedOrganizationId}
              onChange={onOrganizationChange}
              options={organizationOptions}
              display={selectedOrganization?.name ?? 'organization'}
              popupWidth="260"
              triggerClassName="flex h-9 w-full items-center justify-between border border-edge/20 bg-pit-3 px-2.5 text-left font-mono text-xs text-fg-1 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
            />
            {sidebarError && (
              <div className="mt-3 border border-fail/25 bg-fail/5 px-2.5 py-2 text-[11px] leading-4 text-fail">
                {sidebarError}
              </div>
            )}
          </div>

          <div className="border-b border-edge/12 px-4 py-3">
            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
              <PachSelect
                value={typeFilter}
                onChange={(value) => onTypeFilterChange(value as 'all' | 'deck')}
                options={typeOptions}
                display={selectedTypeLabel}
                popupWidth="96"
                triggerClassName="flex h-9 min-w-0 items-center justify-between border border-edge/20 bg-pit-3 px-2 text-left font-mono text-[10px] uppercase tracking-label text-fg-2 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
                popupClassName="[&>button]:uppercase [&>button]:tracking-label"
              />
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  className="h-9 w-full border border-edge/20 bg-pit-3 pl-8 pr-2.5 font-mono text-xs text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent/60"
                  placeholder="search"
                  type="search"
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onOpenTemplate(template.slug)}
                className="group flex w-full items-start gap-3 border-b border-edge/10 px-4 py-3.5 text-left transition hover:bg-accent-fill/4"
              >
                <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-fg-4 transition group-hover:text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-semibold lowercase text-fg-1">
                    {template.title}
                  </span>
                  {template.description && (
                    <span className="mt-1 block text-xs leading-5 text-fg-3">
                      {template.description}
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-label text-fg-4">
                    <span className="border border-edge/15 px-1.5 py-0.5">{template.type}</span>
                    {template.slideCount ? <span>{template.slideCount} slides</span> : null}
                  </span>
                </span>
              </button>
            ))}
            {templates.length === 0 && (
              <div className="px-4 py-12 text-center font-mono text-xs lowercase text-fg-4">
                no templates
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )
}

function TemplateChatSidebar({
  template,
  prompt,
  onPromptChange,
  onQueueRun,
  inputMedia,
  onAddInputMedia,
  onRemoveInputMedia,
  runs,
  agentRunByDesignRunId,
  progressReportsByRunId,
  chatError,
  onRenameTemplate,
  onDeleteTemplate,
  designSystems,
  selectedDesignSystemId,
  onDesignSystemChange,
  aspectRatioId,
  onAspectRatioChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  slideCount,
  onSlideCountChange,
  designSystemName,
  onOpenAssets,
  onBack,
}: {
  template: TemplateListItem
  prompt: string
  onPromptChange: (value: string) => void
  onQueueRun: (event: FormEvent) => void
  inputMedia: PendingAgentInputMedia[]
  onAddInputMedia: (files: FileList | File[]) => Promise<void>
  onRemoveInputMedia: (id: string) => void
  runs: DesignTemplateRunRow[]
  agentRunByDesignRunId: Map<string, AgentRunRow>
  progressReportsByRunId: Map<string, AgentRunProgressReportRow[]>
  chatError: string | null
  onRenameTemplate: (template: TemplateListItem, nextName: string) => Promise<void>
  onDeleteTemplate: (template: TemplateListItem) => Promise<void>
  designSystems: DesignSystemRow[]
  selectedDesignSystemId: string
  onDesignSystemChange: (id: string) => void
  aspectRatioId: string
  onAspectRatioChange: (id: string) => void
  customWidth: number
  onCustomWidthChange: (value: number) => void
  customHeight: number
  onCustomHeightChange: (value: number) => void
  slideCount: number
  onSlideCountChange: (value: number) => void
  designSystemName: string
  onOpenAssets: () => void
  onBack: () => void
}) {
  const [templateName, setTemplateName] = useState(template.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isInputMediaDragActive, setIsInputMediaDragActive] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const chatBottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canRename = true
  const canDelete = true
  const cleanTemplateName = templateName.trim()
  const hasNameChange = cleanTemplateName.length > 0 && cleanTemplateName !== template.title
  const designSystemOptions: PachSelectOption[] = [
    { value: NO_DESIGN_SYSTEM_ID, label: 'no design system' },
    ...designSystems.map((system) => ({
      value: system.id,
      label: readBoolean(system.metadata?.isDefault) ? `${system.name} (default)` : system.name,
    })),
  ]
  const selectedDesignSystemLabel = selectedDesignSystemId
    ? designSystemOptions.find((option) => option.value === selectedDesignSystemId)?.label ?? 'design system'
    : 'no design system'
  const aspectRatioOptions: PachSelectOption[] = [
    ...DESIGN_ASPECT_RATIOS.map((ratio) => ({
      value: ratio.id,
      label: `${ratio.ratio} / ${ratio.label}`,
    })),
    { value: CUSTOM_ASPECT_RATIO_ID, label: 'custom' },
  ]
  const selectedAspectRatioLabel = aspectRatioOptions.find((option) => option.value === aspectRatioId)?.label ?? 'custom'
  const chatScrollKey = runs.map((run) => {
    const agentRun = agentRunByDesignRunId.get(run.id)
    const latestProgress = agentRun ? progressReportsByRunId.get(agentRun.id)?.[0] : undefined
    return `${run.id}:${agentRun?.status ?? run.status}:${latestProgress?.id ?? ''}:${latestProgress?.createdAt ?? ''}`
  }).join('|')

  useEffect(() => {
    setTemplateName(template.title)
    setRenameError(null)
    setIsRenaming(false)
    setIsDeleting(false)
  }, [template.id, template.title])

  useEffect(() => {
    scrollTemplateChatToBottom('auto')
  }, [template.id])

  useEffect(() => {
    scrollTemplateChatToBottom('smooth')
  }, [chatScrollKey])

  function scrollTemplateChatToBottom(behavior: ScrollBehavior) {
    window.requestAnimationFrame(() => {
      if (chatBottomRef.current) {
        chatBottomRef.current.scrollIntoView({ block: 'end', behavior })
        return
      }
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
      }
    })
  }

  async function handleRenameSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canRename || !hasNameChange || isRenaming) return

    setRenameError(null)
    setIsRenaming(true)
    try {
      await onRenameTemplate(template, cleanTemplateName)
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'could not rename template')
    } finally {
      setIsRenaming(false)
    }
  }

  async function handleDeleteClick() {
    if (!canDelete || isDeleting) return
    if (!window.confirm(`Delete "${template.title}"? This removes the template and its saved versions.`)) return

    setRenameError(null)
    setIsDeleting(true)
    try {
      await onDeleteTemplate(template)
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'could not delete template')
      setIsDeleting(false)
    }
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!prompt.trim()) return
    event.currentTarget.form?.requestSubmit()
  }

  function handleQueueSubmit(event: FormEvent) {
    onQueueRun(event)
    scrollTemplateChatToBottom('smooth')
  }

  return (
    <>
      <div className="border-b border-edge/12 px-4 py-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-edge/40 hover:text-accent"
          title="return to templates"
          aria-label="return to templates"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenAssets}
          className="mb-4 ml-2 inline-flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-edge/40 hover:text-accent"
          title="open assets"
          aria-label="open assets"
        >
          <ImageIcon className="h-4 w-4" />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className="mb-4 ml-2 inline-flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-fail/40 hover:text-fail disabled:cursor-not-allowed disabled:opacity-50"
            title="delete template"
            aria-label="delete template"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-accent-fill/25 bg-accent-fill/8 text-accent">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            {canRename ? (
              <form onSubmit={handleRenameSubmit} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  className="h-8 min-w-0 border border-edge/20 bg-pit-3 px-2.5 font-mono text-sm font-semibold lowercase text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent/60"
                  aria-label="template name"
                />
                <button
                  type="submit"
                  disabled={!hasNameChange || isRenaming}
                  className="inline-flex h-8 w-8 items-center justify-center border border-accent-fill/25 bg-accent-fill/8 text-accent transition hover:bg-accent-fill/14 disabled:cursor-not-allowed disabled:border-edge/12 disabled:bg-pit-3 disabled:text-fg-4"
                  title="save name"
                  aria-label="save name"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!hasNameChange || isRenaming}
                  onClick={() => {
                    setTemplateName(template.title)
                    setRenameError(null)
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-edge/40 hover:text-fg-1 disabled:cursor-not-allowed disabled:border-edge/12 disabled:text-fg-4"
                  title="reset name"
                  aria-label="reset name"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <div className="font-mono text-sm font-semibold lowercase text-fg-1">{template.title}</div>
            )}
            <div className="mt-1 font-mono text-[9px] uppercase tracking-label text-fg-4">
              {template.type}
            </div>
            {renameError && (
              <div className="mt-2 border border-fail/25 bg-fail/5 px-2 py-1.5 text-[11px] leading-4 text-fail">
                {renameError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          <div className="border border-edge/12 bg-pit-2 px-3 py-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-accent">
              <Bot className="h-3.5 w-3.5" />
              design agent
            </div>
            <p className="text-xs leading-5 text-fg-3">
              {designSystemName === 'no design system'
                ? 'Ready for edits. No design-system context is selected.'
                : `Ready for edits. Prompts will use ${designSystemName}.`}
            </p>
          </div>
          {runs.map((run) => (
            <TemplateRunCard
              key={run.id}
              run={run}
              agentRun={agentRunByDesignRunId.get(run.id)}
              progressReports={agentRunByDesignRunId.get(run.id) ? progressReportsByRunId.get(agentRunByDesignRunId.get(run.id)!.id) ?? [] : []}
            />
          ))}
          <div ref={chatBottomRef} aria-hidden="true" />
        </div>
      </div>

      <form
        onSubmit={handleQueueSubmit}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsInputMediaDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsInputMediaDragActive(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInputMediaDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsInputMediaDragActive(false)
          if (event.dataTransfer.files.length) void onAddInputMedia(event.dataTransfer.files)
        }}
        className={`border-t border-edge/12 p-4 transition ${isInputMediaDragActive ? 'bg-accent-fill/6 shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45)]' : ''}`}
      >
        {chatError && (
          <div className="mb-3 border border-fail/25 bg-fail/5 px-3 py-2 text-xs text-fail">
            {chatError}
          </div>
        )}
        {inputMedia.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {inputMedia.map((item) => (
              <span
                key={item.id}
                className="inline-flex max-w-full items-center gap-2 border border-edge/16 bg-pit-3 px-2 py-1 font-mono text-[9px] uppercase tracking-label text-fg-3"
              >
                <FileImage className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="max-w-[190px] truncate">{item.name}</span>
                <span className="shrink-0 text-fg-4">
                  {item.dimensions ? `${item.dimensions.width}x${item.dimensions.height}` : formatBytes(item.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveInputMedia(item.id)}
                  className="shrink-0 text-fg-4 transition hover:text-fail"
                  title="remove attachment"
                  aria-label={`remove ${item.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="mb-3 grid gap-2">
          <PachSelect
            value={selectedDesignSystemId || NO_DESIGN_SYSTEM_ID}
            onChange={(value) => onDesignSystemChange(value === NO_DESIGN_SYSTEM_ID ? '' : value)}
            options={designSystemOptions}
            display={selectedDesignSystemLabel}
            popupWidth="300"
            triggerClassName="flex h-9 w-full items-center justify-between border border-edge/20 bg-pit-3 px-2.5 text-left font-mono text-[10px] uppercase tracking-label text-fg-2 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_74px] gap-2">
            <PachSelect
              value={aspectRatioId}
              onChange={onAspectRatioChange}
              options={aspectRatioOptions}
              display={selectedAspectRatioLabel}
              popupWidth="260"
              triggerClassName="flex h-9 min-w-0 items-center justify-between border border-edge/20 bg-pit-3 px-2.5 text-left font-mono text-[10px] uppercase tracking-label text-fg-2 outline-none transition hover:border-edge/32 hover:bg-accent-fill/4 focus-visible:border-accent focus-visible:shadow-glow-xs"
            />
            <input
              value={slideCount}
              onChange={(event) => onSlideCountChange(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
              className="h-9 w-full border border-edge/20 bg-pit-3 px-2 text-center font-mono text-[10px] uppercase tracking-label text-fg-2 outline-none transition focus:border-accent/60"
              type="number"
              min={1}
              max={30}
              aria-label="slide count"
              title="slide count"
            />
          </div>
          {aspectRatioId === CUSTOM_ASPECT_RATIO_ID && (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={customWidth}
                onChange={(event) => onCustomWidthChange(clampDimension(Number(event.target.value), 320, 3840))}
                className="h-9 border border-edge/20 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-2 outline-none transition focus:border-accent/60"
                type="number"
                min={320}
                max={3840}
                aria-label="custom width"
                title="custom width"
              />
              <input
                value={customHeight}
                onChange={(event) => onCustomHeightChange(clampDimension(Number(event.target.value), 320, 3840))}
                className="h-9 border border-edge/20 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-2 outline-none transition focus:border-accent/60"
                type="number"
                min={320}
                max={3840}
                aria-label="custom height"
                title="custom height"
              />
            </div>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          className="min-h-[112px] w-full resize-none border border-edge/20 bg-pit-3 px-3 py-2.5 text-sm leading-5 text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent/60"
          placeholder="Change tone, layout, copy, structure..."
        />
        <div className="mt-3 grid grid-cols-[40px_minmax(0,1fr)] gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            accept="image/*,.pdf"
            onChange={(event) => {
              const files = event.target.files
              if (files) void onAddInputMedia(files)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-edge/40 hover:text-accent"
            title="attach context"
            aria-label="attach context"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="inline-flex h-9 w-full items-center justify-center gap-2 border border-accent-fill/30 bg-accent-fill/10 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 disabled:cursor-not-allowed disabled:border-edge/12 disabled:bg-pit-3 disabled:text-fg-4"
          >
            <Send className="h-3.5 w-3.5" />
            queue run
          </button>
        </div>
      </form>
    </>
  )
}

function TemplateRunCard({
  run,
  agentRun,
  progressReports,
}: {
  run: DesignTemplateRunRow
  agentRun?: AgentRunRow
  progressReports: AgentRunProgressReportRow[]
}) {
  const effectiveStatus = agentRun?.status ?? run.status
  const latestProgress = progressReports[0]
  const isActive = effectiveStatus === 'reserved' || effectiveStatus === 'queued' || effectiveStatus === 'running'
  const statusClass = effectiveStatus === 'failed'
    ? 'text-fail'
    : effectiveStatus === 'completed'
      ? 'text-ok'
      : effectiveStatus === 'canceled'
        ? 'text-warn'
        : 'text-accent'

  return (
    <div className="border border-edge/12 bg-pit-2 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-label">
        <span className="text-fg-4">{formatDateTime(run.createdAt)}</span>
        <span className={`inline-flex items-center gap-1.5 ${statusClass}`}>
          {isActive ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_10px_rgba(0,255,120,0.8)]" /> : null}
          {effectiveStatus}
        </span>
      </div>
      <p className="text-xs leading-5 text-fg-2">{run.prompt}</p>
      {latestProgress ? (
        <div className="mt-3 border-t border-edge/10 pt-2">
          <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-label text-fg-4">
            {isActive ? (
              <AnimatedRunPhase phase={latestProgress.phase ?? 'designing'} />
            ) : (
              <span>{formatRunPhase(latestProgress.phase ?? 'progress')}</span>
            )}
            {typeof latestProgress.percent === 'number' ? <span>{latestProgress.percent}%</span> : null}
          </div>
          <p className="text-[11px] leading-4 text-fg-3">{latestProgress.message}</p>
        </div>
      ) : (
        (agentRun?.statusMessage || run.statusMessage) && (
          <p className="mt-2 text-[11px] leading-4 text-fg-4">{agentRun?.statusMessage ?? run.statusMessage}</p>
        )
      )}
    </div>
  )
}

function AnimatedRunPhase({ phase }: { phase: string }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setTick((current) => (current + 1) % 4), 420)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <span className="inline-flex items-center gap-1.5 text-accent">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_10px_rgba(0,255,120,0.8)]" />
      <span>{formatRunPhase(phase)}{'.'.repeat(tick)}</span>
    </span>
  )
}

function formatRunPhase(phase: string) {
  return phase
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function DesignSystemEditor({
  organization,
  systems,
  selectedDesignSystemId,
  onSelectedDesignSystemChange,
  onCreateDesignSystem,
  onSaveDesignSystem,
  onDeleteDesignSystem,
  onSetDefaultDesignSystem,
}: {
  organization?: Organization
  systems: DesignSystemRow[]
  selectedDesignSystemId: string
  onSelectedDesignSystemChange: (id: string) => void
  onCreateDesignSystem: () => Promise<void>
  onSaveDesignSystem: (system: DesignSystemRow, updates: { name: string; slug: string; markdown: string; metadata: Record<string, unknown> }) => Promise<void>
  onDeleteDesignSystem: (system: DesignSystemRow) => Promise<void>
  onSetDefaultDesignSystem: (system: DesignSystemRow | null) => Promise<void>
}) {
  const selectedSystem = systems.find((system) => system.id === selectedDesignSystemId) ?? null
  const [draftName, setDraftName] = useState(selectedSystem?.name ?? '')
  const [draftSlug, setDraftSlug] = useState(selectedSystem?.slug ?? '')
  const [draftMarkdown, setDraftMarkdown] = useState(selectedSystem?.markdown ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const hasChanges = Boolean(selectedSystem && (
    draftName !== selectedSystem.name ||
    draftSlug !== selectedSystem.slug ||
    draftMarkdown !== selectedSystem.markdown
  ))

  useEffect(() => {
    setDraftName(selectedSystem?.name ?? '')
    setDraftSlug(selectedSystem?.slug ?? '')
    setDraftMarkdown(selectedSystem?.markdown ?? '')
    setSaveError(null)
    setIsSaving(false)
  }, [selectedSystem?.id])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!selectedSystem || isSaving) return
    const cleanName = draftName.trim()
    const cleanSlug = slugifyTemplateName(draftSlug || cleanName)
    if (!cleanName || !cleanSlug) {
      setSaveError('name and slug are required')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await onSaveDesignSystem(selectedSystem, {
        name: cleanName,
        slug: cleanSlug,
        markdown: draftMarkdown,
        metadata: selectedSystem.metadata ?? {},
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'could not save design system')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedSystem || isSaving) return
    if (!window.confirm(`Delete "${selectedSystem.name}"? Design runs can still keep their saved run metadata, but this design system will no longer be selectable.`)) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await onDeleteDesignSystem(selectedSystem)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'could not delete design system')
      setIsSaving(false)
    }
  }

  async function handleSetDefault() {
    if (!selectedSystem || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSetDefaultDesignSystem(readBoolean(selectedSystem.metadata?.isDefault) ? null : selectedSystem)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'could not update default')
    } finally {
      setIsSaving(false)
    }
  }

  if (!organization) {
    return (
      <div className="flex h-full items-center justify-center bg-pit px-6 text-center font-mono text-sm lowercase text-fg-4">
        select an organization
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 bg-pit text-fg-1 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-r border-edge/12 bg-void/40">
        <div className="border-b border-edge/12 px-5 py-4">
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-accent">
            <Palette className="h-3.5 w-3.5" />
            design systems
          </div>
          <h1 className="font-mono text-lg font-semibold lowercase text-fg-1">{organization.name}</h1>
          <button
            type="button"
            onClick={() => void onCreateDesignSystem()}
            className="mt-4 inline-flex h-8 items-center gap-1.5 border border-accent-fill/25 bg-accent-fill/8 px-3 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/14"
          >
            <Plus className="h-3.5 w-3.5" />
            new system
          </button>
        </div>
        <div>
          {systems.map((system) => (
            <button
              key={system.id}
              type="button"
              onClick={() => onSelectedDesignSystemChange(system.id)}
              className={`block w-full border-b border-edge/10 px-5 py-4 text-left transition ${system.id === selectedDesignSystemId ? 'bg-accent-fill/8' : 'hover:bg-accent-fill/4'}`}
            >
              <span className="block truncate font-mono text-sm font-semibold lowercase text-fg-1">{system.name}</span>
              <span className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-label text-fg-4">
                <span>{system.slug}</span>
                {readBoolean(system.metadata?.isDefault) ? <span className="text-accent">default</span> : null}
              </span>
            </button>
          ))}
          {systems.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Palette className="mx-auto mb-4 h-8 w-8 text-fg-4" />
              <p className="font-mono text-sm lowercase text-fg-2">no design systems</p>
              <p className="mt-2 text-xs leading-5 text-fg-4">
                Create one to give design runs explicit brand context. Leaving this empty means runs get no design-system prompt.
              </p>
            </div>
          )}
        </div>
      </aside>
      <main className="min-h-0 overflow-y-auto px-5 py-5 md:px-8 md:py-7">
        {selectedSystem ? (
          <form onSubmit={handleSave} className="mx-auto flex min-h-full max-w-5xl flex-col">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-label text-fg-4">markdown source</div>
                <h2 className="font-mono text-2xl font-semibold lowercase text-fg-1">{selectedSystem.name}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSetDefault()}
                  disabled={isSaving}
                  className="inline-flex h-9 items-center border border-edge/20 bg-pit-3 px-3 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-edge/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {readBoolean(selectedSystem.metadata?.isDefault) ? 'unset default' : 'make default'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isSaving}
                  className="inline-flex h-9 w-9 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-fail/40 hover:text-fail disabled:cursor-not-allowed disabled:opacity-50"
                  title="delete design system"
                  aria-label="delete design system"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  disabled={!hasChanges || isSaving}
                  className="inline-flex h-9 items-center gap-2 border border-accent-fill/30 bg-accent-fill/10 px-4 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 disabled:cursor-not-allowed disabled:border-edge/12 disabled:bg-pit-3 disabled:text-fg-4"
                >
                  <Check className="h-3.5 w-3.5" />
                  {isSaving ? 'saving' : 'save'}
                </button>
              </div>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-label text-fg-4">name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="h-10 w-full border border-edge/20 bg-pit-3 px-3 font-mono text-sm text-fg-1 outline-none transition focus:border-accent/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-label text-fg-4">slug</span>
                <input
                  value={draftSlug}
                  onChange={(event) => setDraftSlug(event.target.value)}
                  className="h-10 w-full border border-edge/20 bg-pit-3 px-3 font-mono text-sm text-fg-1 outline-none transition focus:border-accent/60"
                />
              </label>
            </div>
            <textarea
              value={draftMarkdown}
              onChange={(event) => setDraftMarkdown(event.target.value)}
              className="min-h-[520px] flex-1 resize-none border border-edge/20 bg-void px-4 py-4 font-mono text-sm leading-6 text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent/60"
              spellCheck={false}
              placeholder="# Design system"
            />
            {saveError ? <div className="mt-4 border border-fail/25 bg-fail/5 px-3 py-2 text-xs text-fail">{saveError}</div> : null}
          </form>
        ) : (
          <div className="flex h-full min-h-[520px] flex-col items-center justify-center text-center">
            <Palette className="mb-4 h-9 w-9 text-fg-4" />
            <p className="font-mono text-sm lowercase text-fg-2">select or create a design system</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-fg-4">
              Design runs only receive design-system context when one is explicitly selected.
            </p>
            <button
              type="button"
              onClick={() => void onCreateDesignSystem()}
              className="mt-5 inline-flex h-9 items-center gap-2 border border-accent-fill/25 bg-accent-fill/8 px-4 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/14"
            >
              <Plus className="h-3.5 w-3.5" />
              new system
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function DesignAssetsModal({
  organization,
  template,
  assets,
  onClose,
}: {
  organization: Organization
  template?: TemplateListItem
  assets: DesignAssetRow[]
  onClose: () => void
}) {
  const [step, setStep] = useState<'library' | 'upload'>('library')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [assetName, setAssetName] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const sortedAssets = [...assets].sort((a, b) => b.createdAt - a.createdAt)

  function handleSelectFile(file: File | undefined) {
    if (!file) return
    setSelectedFile(file)
    if (!assetName.trim()) setAssetName(file.name.replace(/\.[^.]+$/, ''))
    setUploadError(null)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    handleSelectFile(event.dataTransfer.files[0])
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault()
    if (!selectedFile || isUploading) return

    setIsUploading(true)
    setUploadError(null)
    try {
      const dimensions = await readImageDimensions(selectedFile)
      const contentBase64 = await readFileAsBase64(selectedFile)
      await authFetch(`${config.apiUrl}/media/design-assets/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          templateId: template?.id,
          name: assetName.trim() || selectedFile.name,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          contentBase64,
          width: dimensions?.width,
          height: dimensions?.height,
          kind: selectedFile.type.startsWith('image/') ? 'image' : 'file',
        }),
      })
      setSelectedFile(null)
      setAssetName('')
      setStep('library')
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'could not upload asset')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col border border-edge/20 bg-pit shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-edge/12 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-accent">
              <ImageIcon className="h-3.5 w-3.5" />
              assets
            </div>
            <h2 className="font-mono text-lg font-semibold lowercase text-fg-1">{organization.name}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-4">
              Approved images and files the design agent can reference by URL, size, and usage metadata.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {step === 'upload' ? (
              <button
                type="button"
                onClick={() => setStep('library')}
                className="inline-flex h-8 items-center border border-edge/20 bg-pit-3 px-3 font-mono text-[10px] uppercase tracking-label text-fg-3 transition hover:border-edge/40 hover:text-fg-1"
              >
                library
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="inline-flex h-8 items-center gap-1.5 border border-accent-fill/25 bg-accent-fill/8 px-3 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/14"
              >
                <Plus className="h-3.5 w-3.5" />
                new asset
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center border border-edge/20 bg-pit-3 text-fg-3 transition hover:border-edge/40 hover:text-fg-1"
              title="close assets"
              aria-label="close assets"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {step === 'library' ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {sortedAssets.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sortedAssets.map((asset) => (
                  <DesignAssetCard key={asset.id} asset={asset} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center border border-dashed border-edge/20 bg-pit-2 px-6 text-center">
                <FileImage className="mb-4 h-8 w-8 text-fg-4" />
                <p className="font-mono text-sm lowercase text-fg-2">no assets yet</p>
                <p className="mt-2 max-w-sm text-xs leading-5 text-fg-4">
                  Add logos, screenshots, diagrams, photos, or document imagery for design templates to reuse.
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleUpload} className="min-h-0 flex-1 overflow-y-auto p-5">
            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="flex min-h-[300px] cursor-pointer flex-col items-center justify-center border border-dashed border-edge/24 bg-pit-2 px-6 py-12 text-center transition hover:border-accent/50 hover:bg-accent-fill/4"
            >
              <UploadCloud className="mb-4 h-9 w-9 text-accent" />
              <div className="font-mono text-sm lowercase text-fg-1">
                {selectedFile ? selectedFile.name : 'drop an asset or click to browse'}
              </div>
              <div className="mt-2 text-xs leading-5 text-fg-4">
                PNG, JPG, SVG, WebP, PDF, or reference files. Images up to 10 MB.
              </div>
              <input
                type="file"
                className="sr-only"
                onChange={(event) => handleSelectFile(event.target.files?.[0])}
              />
            </label>

            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-label text-fg-4">optional name</span>
                <input
                  value={assetName}
                  onChange={(event) => setAssetName(event.target.value)}
                  className="h-10 w-full border border-edge/20 bg-pit-3 px-3 font-mono text-sm text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent/60"
                  placeholder="brand mark, dashboard screenshot..."
                />
              </label>
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="self-end inline-flex h-10 items-center justify-center gap-2 border border-accent-fill/30 bg-accent-fill/10 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 disabled:cursor-not-allowed disabled:border-edge/12 disabled:bg-pit-3 disabled:text-fg-4"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                {isUploading ? 'uploading' : 'upload'}
              </button>
            </div>

            {uploadError && (
              <div className="mt-4 border border-fail/25 bg-fail/5 px-3 py-2 text-xs text-fail">
                {uploadError}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

function DesignAssetCard({ asset }: { asset: DesignAssetRow }) {
  const width = readNumber(asset.metadata?.width)
  const height = readNumber(asset.metadata?.height)
  const sizeBytes = readNumber(asset.metadata?.sizeBytes)
  const mimeType = readString(asset.metadata?.mimeType)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const displayUrl = asset.storageKey
    ? `${config.apiUrl}/media/design-assets/${encodeURIComponent(asset.id)}/file`
    : asset.url ?? null

  async function handleDelete() {
    if (isDeleting) return
    if (!window.confirm(`Delete "${asset.name}"? This removes it from Pach and storage. Templates using this asset URL will need to be updated.`)) return

    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await authFetch(`${config.apiUrl}/media/design-assets/${encodeURIComponent(asset.id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(payload?.message ?? 'could not delete asset')
      }
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'could not delete asset')
      setIsDeleting(false)
    }
  }

  return (
    <div className="border border-edge/12 bg-pit-2">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-edge/10 bg-void">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center border border-edge/20 bg-pit/90 text-fg-4 transition hover:border-fail/50 hover:text-fail disabled:cursor-not-allowed disabled:opacity-50"
          title="delete asset"
          aria-label={`delete ${asset.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {displayUrl && asset.kind !== 'file' ? (
          <img src={displayUrl} alt={asset.name} className="h-full w-full object-contain" />
        ) : (
          <FileImage className="h-10 w-10 text-fg-4" />
        )}
      </div>
      <div className="p-3">
        <div className="truncate font-mono text-sm font-semibold lowercase text-fg-1">{asset.name}</div>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-label text-fg-4">
          <span>{asset.kind}</span>
          {width && height ? <span>{width} x {height}</span> : null}
          {sizeBytes ? <span>{formatBytes(sizeBytes)}</span> : null}
        </div>
        {mimeType ? <div className="mt-2 truncate font-mono text-[9px] text-fg-4">{mimeType}</div> : null}
        {deleteError ? <div className="mt-2 text-[10px] leading-4 text-fail">{deleteError}</div> : null}
        {displayUrl ? (
          <a
            href={displayUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 border-b border-accent/70 pb-1 font-mono text-[10px] uppercase tracking-label text-accent"
          >
            open <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(file: File) {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)

  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} b`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kb`
  return `${(value / (1024 * 1024)).toFixed(1)} mb`
}

function TemplatePreview({
  template,
  version,
}: {
  template: TemplateListItem
  version?: DesignTemplateVersionRow
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const previewUrl = getTemplatePreviewUrl(version)

  if (previewUrl) {
    const previewDimensions = getTemplatePreviewDimensions(version)
    const sendExportCommand = (format: 'png' | 'pdf') => {
      const target = iframeRef.current?.contentWindow
      if (!target) return
      target.postMessage({
        type: 'pach-design-export',
        format,
        filename: template.slug,
      }, '*')
    }

    return (
      <div className="h-full min-h-0 overflow-y-auto bg-pit text-fg-1">
        <div className="sticky top-0 z-20 border-b border-edge/15 bg-pit/90 px-3 py-3 backdrop-blur-sm md:px-8 md:py-4">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-label text-fg-3">design preview</div>
              <h1 className="truncate font-mono text-base font-bold lowercase text-fg-1 md:text-lg">{template.title}</h1>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-label text-fg-4">
                {previewDimensions.label} / {previewDimensions.width} x {previewDimensions.height}px
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                onClick={() => sendExportCommand('png')}
                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 border border-edge/20 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-2 transition hover:border-edge/35 hover:text-fg-1 sm:px-3"
                title="export each slide as PNG"
              >
                <FileImage className="h-3.5 w-3.5" />
                png
              </button>
              <button
                type="button"
                onClick={() => sendExportCommand('pdf')}
                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 border border-accent-fill/30 bg-accent-fill/8 px-2 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 sm:px-3"
                title="download as PDF"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">download </span>pdf
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 border border-edge/20 bg-pit-3 px-2 font-mono text-[10px] uppercase tracking-label text-fg-2 transition hover:border-edge/35 hover:text-fg-1 sm:px-3"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                open
              </a>
            </div>
          </div>
        </div>
        <div className="min-h-0">
          <iframe
            ref={iframeRef}
            title={template.title}
            src={previewUrl}
            sandbox="allow-scripts allow-downloads"
            className="h-[calc(100dvh-188px)] min-h-[360px] w-full border-0 bg-pit md:h-[calc(100vh-118px)] md:min-h-[560px]"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="max-w-4xl">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-fg-4">
            <Braces className="h-3.5 w-3.5 text-accent" />
            template preview
          </div>
          <h1 className="font-mono text-2xl font-semibold lowercase text-fg-1">{template.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-3">
            {template.description ?? 'Preview will render when a compiled artifact is available.'}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <PreviewStat label="status" value={version?.validationStatus ?? template.status ?? 'draft'} />
          <PreviewStat label="files" value={String(Object.keys(version?.files ?? {}).length)} />
        </div>
      </div>
    </div>
  )
}

function getTemplatePreviewUrl(version?: DesignTemplateVersionRow) {
  if (!version) return null
  if (version.compiledArtifactUrl) return version.compiledArtifactUrl
  return Object.keys(version.files ?? {}).length > 0
    ? `${config.apiUrl}/design-preview/versions/${encodeURIComponent(version.id)}`
    : null
}

function getTemplatePreviewDimensions(version?: DesignTemplateVersionRow) {
  const dimensions = readRecord(version?.manifest?.dimensions)
  const width = readNumber(dimensions?.width) ?? readNumber(version?.manifest?.width)
  const height = readNumber(dimensions?.height) ?? readNumber(version?.manifest?.height)
  if (width && height) return { width, height, label: 'custom' }

  const aspectRatioId = readString(version?.manifest?.aspectRatioId)
  const match = DESIGN_ASPECT_RATIOS.find((entry) => entry.id === aspectRatioId)
  return match ?? DESIGN_ASPECT_RATIOS[0]
}

function buildDefaultTailwindConfig(organization: Organization) {
  if (organization.project === 'ardia') {
    return {
      theme: {
        extend: {
          colors: {
            pit: '#0f0d0c',
            ink: '#f3f0e9',
            muted: '#8f8880',
            hairline: 'rgba(243, 240, 233, 0.12)',
            vermilion: '#ff5a52',
          },
          fontFamily: {
            sans: ['Inter Tight', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            serif: ['Instrument Serif', 'Georgia', 'serif'],
            mono: ['Geist Mono', 'ui-monospace', 'Menlo', 'monospace'],
          },
          letterSpacing: {
            label: '0.28em',
          },
        },
      },
    }
  }

  return {
    theme: {
      extend: {
        colors: {
          pit: '#0f0d0c',
          ink: '#f3f0e9',
          accent: '#61ff8f',
        },
      },
    },
  }
}

function buildDefaultTemplateFiles(name: string, organization: Organization): Record<string, string> {
  const organizationName = organization.name
  if (organization.project === 'ardia') {
    return {
      'src/Template.tsx': buildArdiaDefaultTemplateSource(name),
    }
  }

  return {
    'src/Template.tsx': `import React from 'react'

type SlideProps = {
  width: number
  height: number
}

export function CoverSlide({ width, height }: SlideProps) {
  return (
    <main style={{
      width,
      height,
      overflow: 'hidden',
      background: '#0f0d0c',
      color: '#f3f0e9',
      padding: 96,
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    }}>
      <p style={{
        margin: 0,
        color: '#ff5a52',
        fontSize: 12,
        letterSpacing: '0.28em',
        textTransform: 'uppercase'
      }}>
        {${JSON.stringify(organizationName)}} / design template
      </p>
      <h1 style={{
        maxWidth: 900,
        margin: '72px 0 24px',
        fontFamily: 'Inter Tight, ui-sans-serif, system-ui, sans-serif',
        fontSize: 'clamp(56px, 10vw, 132px)',
        fontWeight: 200,
        letterSpacing: 0,
        lineHeight: 0.94
      }}>
        {${JSON.stringify(name)}}
      </h1>
      <p style={{
        maxWidth: 680,
        margin: 0,
        color: '#8f8880',
        fontSize: 22,
        lineHeight: 1.55
      }}>
        Draft deck template. Ask the design agent to shape this with the organization's design system.
      </p>
    </main>
  )
}

export const slides = [CoverSlide]

export default function Template() {
  return <CoverSlide width={1920} height={1080} />
}
`,
  }
}

function buildArdiaDefaultTemplateSource(name: string) {
  return `import React from 'react'

type SlideProps = {
  width: number
  height: number
  pageIndex?: number
  pageCount?: number
}

const QM = {
  bg: '#14110f',
  fg: '#ede6db',
  fg2: 'rgba(237, 230, 219, 0.78)',
  fgDim: 'rgba(237, 230, 219, 0.42)',
  fgFaint: 'rgba(237, 230, 219, 0.22)',
  accent: '#E43F3F',
  hair: 'rgba(237, 230, 219, 0.10)',
  hair2: 'rgba(237, 230, 219, 0.06)',
}

const sans = "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
const serif = "'Instrument Serif', Georgia, serif"
const mono = "'Geist Mono', ui-monospace, Menlo, monospace"

function ArdiaMark({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ color: QM.accent }}>
        <path d="M5 28V12L13 8V28" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 28V6L23 10V28" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 28H27" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 14V26M9 13V26M11 12V26" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
        <rect x="14.5" y="14" width="6" height="6" transform="rotate(45 17.5 17)" fill="currentColor" />
      </svg>
      <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: size, letterSpacing: '-0.01em', color: QM.fg, lineHeight: 1 }}>
        Ardia
      </span>
    </div>
  )
}

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: QM.fgDim }}>
      {children}
    </span>
  )
}

function DotLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 6, height: 6, background: QM.accent, display: 'inline-block' }} />
      <MonoLabel>{children}</MonoLabel>
    </div>
  )
}

function SlideShell({ width, height, children, pageIndex = 0, pageCount = 1 }: SlideProps & { children: React.ReactNode }) {
  return (
    <main style={{
      width,
      height,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      background: QM.bg,
      color: QM.fg,
      fontFamily: sans,
    }}>
      <div style={{
        position: 'absolute',
        top: -220,
        right: -220,
        width: 760,
        height: 760,
        background: 'radial-gradient(circle, rgba(228, 63, 63, 0.10) 0%, rgba(228, 63, 63, 0) 60%)',
        pointerEvents: 'none',
      }} />
      <header style={{ padding: '56px 72px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        <ArdiaMark />
        <MonoLabel>{String(pageIndex + 1).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}</MonoLabel>
      </header>
      <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
        {children}
      </div>
      <footer style={{ borderTop: '1px solid ' + QM.hair, padding: '20px 72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        <MonoLabel>ardia.mx</MonoLabel>
        <MonoLabel>Quiet Minimalist</MonoLabel>
      </footer>
    </main>
  )
}

function HairlineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid ' + QM.hair, padding: '24px 0', display: 'grid', gridTemplateColumns: '180px 1fr', gap: 40, alignItems: 'baseline' }}>
      <MonoLabel>{label}</MonoLabel>
      <div style={{ fontSize: 24, fontWeight: 300, lineHeight: 1.35, color: QM.fg2, letterSpacing: '-0.015em' }}>{children}</div>
    </div>
  )
}

function Metric({ value, unit, label, detail, first }: { value: string; unit?: string; label: string; detail: string; first?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '0 34px', borderLeft: first ? 'none' : '1px solid ' + QM.hair2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 74, fontWeight: 200, lineHeight: 0.95, letterSpacing: '-0.05em' }}>{value}</span>
        {unit ? <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 31, color: QM.accent }}>{unit}</span> : null}
      </div>
      <div style={{ marginTop: 14, fontSize: 16, fontWeight: 400, letterSpacing: '-0.01em' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 14, fontWeight: 300, lineHeight: 1.5, color: QM.fgDim }}>{detail}</div>
    </div>
  )
}

function ProductSurface() {
  const rows = [
    ['09:12', 'Recordatorio enviado', 'WhatsApp'],
    ['09:18', 'Pago reportado', 'Inbox'],
    ['09:27', 'Conciliacion lista', 'Auto'],
    ['09:31', 'Recibo emitido', 'Cerrado'],
  ]

  return (
    <div style={{ borderLeft: '1px solid ' + QM.hair, paddingLeft: 44, minHeight: 430 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid ' + QM.hair, paddingBottom: 24 }}>
        <MonoLabel>Dashboard · abr 2026</MonoLabel>
        <MonoLabel>22.04 · 14:08</MonoLabel>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, padding: '38px 0' }}>
        <div>
          <MonoLabel>Ingresos</MonoLabel>
          <div style={{ marginTop: 18, fontSize: 78, fontWeight: 200, lineHeight: 0.95, letterSpacing: '-0.055em' }}>111.4<span style={{ color: QM.fgFaint }}>M</span></div>
          <p style={{ margin: '12px 0 0', color: QM.fgDim, fontSize: 15, lineHeight: 1.4 }}>47 contratos activos</p>
        </div>
        <div>
          <MonoLabel>Pagos a tiempo</MonoLabel>
          <div style={{ marginTop: 18, fontSize: 78, fontWeight: 200, lineHeight: 0.95, letterSpacing: '-0.055em' }}>70<span style={{ fontFamily: serif, fontStyle: 'italic', color: QM.accent, fontSize: 30 }}>%</span></div>
          <p style={{ margin: '12px 0 0', color: QM.fgDim, fontSize: 15, lineHeight: 1.4 }}>+12 pts vs. mar</p>
        </div>
      </div>
      <div style={{ height: 118, borderTop: '1px solid ' + QM.hair2, borderBottom: '1px solid ' + QM.hair2, position: 'relative', overflow: 'hidden' }}>
        <svg viewBox="0 0 560 118" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <path d="M0 86 C80 76 110 54 170 64 C220 72 238 42 302 46 C360 48 392 30 450 28 C500 26 526 18 560 18 L560 118 L0 118 Z" fill="rgba(228,63,63,0.13)" />
          <path d="M0 86 C80 76 110 54 170 64 C220 72 238 42 302 46 C360 48 392 30 450 28 C500 26 526 18 560 18" stroke={QM.accent} strokeWidth="2" fill="none" />
        </svg>
      </div>
      <div style={{ marginTop: 30 }}>
        <MonoLabel>Actividades pendientes</MonoLabel>
        {rows.map(([time, event, status]) => (
          <div key={time} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 92px', gap: 18, padding: '13px 0', borderBottom: '1px solid ' + QM.hair2, fontSize: 14, color: QM.fg2 }}>
            <span style={{ fontFamily: mono, color: QM.fgDim }}>{time}</span>
            <span>{event}</span>
            <span style={{ fontFamily: serif, fontStyle: 'italic', color: status === 'Auto' ? QM.accent : QM.fgDim }}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CoverSlide(props: SlideProps) {
  return (
    <SlideShell {...props}>
      <section style={{ padding: '90px 72px 0', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 72, alignItems: 'center' }}>
        <div>
          <div style={{ marginBottom: 30 }}><DotLabel>Deck ejecutivo</DotLabel></div>
          <h1 style={{ margin: 0, fontSize: 92, fontWeight: 200, lineHeight: 0.98, letterSpacing: '-0.055em', maxWidth: 860 }}>
            {${JSON.stringify(name)}} <span style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: QM.accent, letterSpacing: '-0.025em' }}>sin friccion</span>.
          </h1>
          <p style={{ marginTop: 32, maxWidth: 680, color: QM.fg2, fontSize: 21, fontWeight: 300, lineHeight: 1.55, letterSpacing: '-0.01em' }}>
            Un deck base inspirado en la landing de compradores, Ardia One-Pager y onboarding Universo aBanza. Mantiene la estructura Quiet Minimalist: aire, jerarquia ligera y superficies de datos con hairlines.
          </p>
        </div>
        <ProductSurface />
      </section>
    </SlideShell>
  )
}

export function StructureSlide(props: SlideProps) {
  return (
    <SlideShell {...props}>
      <section style={{ padding: '82px 72px 0' }}>
        <div style={{ marginBottom: 30 }}><DotLabel>Sistema visual</DotLabel></div>
        <h2 style={{ margin: 0, maxWidth: 860, fontSize: 68, fontWeight: 200, lineHeight: 1.0, letterSpacing: '-0.05em' }}>
          Usa la menor estructura posible, <span style={{ fontFamily: serif, fontStyle: 'italic', color: QM.accent, fontWeight: 400 }}>pero suficiente.</span>
        </h2>
        <div style={{ marginTop: 64 }}>
          <HairlineRow label="01 / titulo">Inter Tight 200 para titulares grandes. El serif se reserva para una sola frase o palabra de acento.</HairlineRow>
          <HairlineRow label="02 / datos">Las superficies de producto son transparentes, con bordes hairline, labels mono y numeros grandes.</HairlineRow>
          <HairlineRow label="03 / color">Un solo acento vermilion por vista: punto, subrayado, linea de grafica o palabra italic.</HairlineRow>
          <div style={{ borderTop: '1px solid ' + QM.hair }} />
        </div>
      </section>
    </SlideShell>
  )
}

export const slides = [CoverSlide, StructureSlide]

export default function Template() {
  return <CoverSlide width={1920} height={1080} pageIndex={0} pageCount={2} />
}
`
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-edge/12 bg-pit-2 px-4 py-4">
      <div className="font-mono text-[9px] uppercase tracking-label text-fg-4">{label}</div>
      <div className="mt-2 font-mono text-sm text-fg-1">{value}</div>
    </div>
  )
}
