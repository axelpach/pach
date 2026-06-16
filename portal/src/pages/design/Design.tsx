import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useZero } from '@rocicorp/zero/react'
import {
  ArrowLeft,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  Layers3,
  Palette,
  Plus,
  Search,
  Send,
  Sparkles,
  Type,
  X,
} from 'lucide-react'
import { SlideRenderer } from '@decks/engine/SlideRenderer'
import { getTheme } from '@decks/engine/themes'
import { PachSelect, type PachSelectOption } from '../../components/PachSelect'
import { config } from '../../config'
import type { Schema } from '../../zero-schema'
import type { Mutators } from '../../mutators'
import { legacyDesignTemplates, type LegacyDesignTemplate } from './legacyTemplates'

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
  tokens: Record<string, unknown>
  assets: Record<string, unknown>
  metadata: Record<string, unknown>
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
  templateId: string
  versionNumber: number
  sourceKind: string
  files: Record<string, string>
  manifest: Record<string, unknown>
  dependencies: Record<string, string>
  compiledArtifactUrl?: string | null
  previewImageUrl?: string | null
  validationStatus: string
}

type DesignTemplateRunRow = {
  id: string
  organizationId: string
  templateId?: string | null
  agentRunId?: string | null
  templateSlug?: string | null
  prompt: string
  status: string
  statusMessage?: string | null
  createdAt: number
}

type AgentRunRow = {
  id: string
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
  legacy?: LegacyDesignTemplate
}

type DesignPalette = {
  name: string
  direction: string
  accent: string
  accentDeep: string
  accentSoft: string
  bg: string
  ink: string
  ink2: string
  muted: string
  muted2: string
  surface: string
  surface2: string
  hairline: string
  hairline2: string
  colors: Array<{ label: string; value: string }>
  typography: Array<{ label: string; value: string; sample: string; style: CSSProperties }>
  metrics: Array<{ value: string; suffix?: string; label: string }>
}

const ARDIA_SANS = "'Inter Tight', ui-sans-serif, system-ui, sans-serif"
const ARDIA_SERIF = "'Instrument Serif', 'Newsreader', Georgia, serif"
const ARDIA_MONO = "'Geist Mono', ui-monospace, Menlo, monospace"

const displayTextStyle: CSSProperties = {
  fontFamily: ARDIA_SANS,
  fontWeight: 200,
  fontSize: 'clamp(56px, 7cqw, 96px)',
  lineHeight: 0.95,
  letterSpacing: 0,
  overflowWrap: 'normal',
  wordBreak: 'normal',
}

const h1TextStyle: CSSProperties = {
  fontFamily: ARDIA_SANS,
  fontWeight: 200,
  fontSize: 'clamp(42px, 5.6cqw, 64px)',
  lineHeight: 0.98,
  letterSpacing: 0,
}

const h2TextStyle: CSSProperties = {
  fontFamily: ARDIA_SANS,
  fontWeight: 200,
  fontSize: 'clamp(34px, 4.4cqw, 48px)',
  lineHeight: 1.02,
  letterSpacing: 0,
}

const serifDisplayStyle: CSSProperties = {
  fontFamily: ARDIA_SERIF,
  fontStyle: 'italic',
  fontWeight: 400,
  fontSize: 'clamp(40px, 5.6cqw, 64px)',
  lineHeight: 1,
  letterSpacing: 0,
}

const bodyTextStyle: CSSProperties = {
  fontFamily: ARDIA_SANS,
  fontWeight: 300,
  fontSize: 16,
  lineHeight: 1.65,
  letterSpacing: 0,
}

const monoLabelStyle: CSSProperties = {
  fontFamily: ARDIA_MONO,
  fontWeight: 500,
  fontSize: 10,
  lineHeight: 1,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

const monoDataStyle: CSSProperties = {
  fontFamily: ARDIA_MONO,
  fontWeight: 400,
  fontSize: 12,
  lineHeight: 1.4,
  letterSpacing: 0,
}

// Mirrors ../ardia/apps/buyers-ardia/DESIGN_SYSTEM.md and
// ../ardia/packages/design-system/styles/tokens.css.
const FALLBACK_DESIGN_SYSTEMS: Record<string, DesignPalette> = {
  ardia: {
    name: 'Ardia',
    direction: 'Quiet Minimalist',
    accent: '#E43F3F',
    accentDeep: '#8B1E1E',
    accentSoft: '#F2A09F',
    bg: '#14110f',
    ink: '#ede6db',
    ink2: 'rgba(237, 230, 219, 0.78)',
    muted: 'rgba(237, 230, 219, 0.42)',
    muted2: 'rgba(237, 230, 219, 0.24)',
    surface: '#1a1614',
    surface2: '#1e1a17',
    hairline: 'rgba(237, 230, 219, 0.10)',
    hairline2: 'rgba(237, 230, 219, 0.06)',
    colors: [
      { label: '--accent', value: '#E43F3F' },
      { label: '--accent-deep', value: '#8B1E1E' },
      { label: '--accent-soft', value: '#F2A09F' },
      { label: '--bg', value: '#14110f' },
      { label: '--surface', value: '#1a1614' },
      { label: '--surface-2', value: '#1e1a17' },
      { label: '--fg', value: '#ede6db' },
      { label: '--fg-2', value: 'rgba(237, 230, 219, 0.78)' },
      { label: '--fg-dim', value: 'rgba(237, 230, 219, 0.42)' },
      { label: '--hairline', value: 'rgba(237, 230, 219, 0.10)' },
    ],
    typography: [
      { label: '--t-display / inter tight 200 / 96', value: 'Hero H1 only', sample: 'Cobra a tiempo.', style: displayTextStyle },
      { label: '--t-h1 / inter tight 200 / 64', value: 'Page heroes', sample: 'Administracion exacta.', style: h1TextStyle },
      { label: '--t-h2 / inter tight 200 / 48', value: 'Section titles', sample: 'Pagos, reportes, bancos.', style: h2TextStyle },
      { label: '--t-serif-display / instrument serif italic / 64', value: 'Accent line under H1', sample: 'Concilia al instante.', style: serifDisplayStyle },
      { label: '--t-body / inter tight 300 / 16', value: 'Paragraphs, max 58ch', sample: 'Administracion inmobiliaria, con menos friccion. Cobranza, conciliacion y reporting, en un mismo lugar.', style: bodyTextStyle },
      { label: '--t-mono-label / geist mono 500 / 10', value: 'Eyebrows and system labels', sample: 'MODULO / HOY / 25 ABR 2026', style: monoLabelStyle },
      { label: '--t-mono-data / geist mono 400 / 12', value: 'Numeric data in tables', sample: 'MXN 482,330.50 - 22.04.2026', style: monoDataStyle },
    ],
    metrics: [
      { value: '94', suffix: '%', label: 'Pagos a tiempo' },
      { value: '96', suffix: '%', label: 'Empates auto.' },
      { value: '<30', suffix: 's', label: 'Por movimiento' },
      { value: '4', label: 'Flujos' },
    ],
  },
}

const DEFAULT_DESIGN_SYSTEM: DesignPalette = {
  name: 'Pach',
  direction: 'Operational minimal',
  accent: '#7dd3fc',
  accentDeep: '#0f7490',
  accentSoft: '#bae6fd',
  bg: '#101112',
  ink: '#f5f7f8',
  ink2: '#c9d0d5',
  muted: '#7b8188',
  muted2: '#525861',
  surface: '#181a1d',
  surface2: '#202327',
  hairline: 'rgba(245, 247, 248, 0.14)',
  hairline2: 'rgba(245, 247, 248, 0.08)',
  colors: [
    { label: 'accent', value: '#7dd3fc' },
    { label: 'ink', value: '#f5f7f8' },
    { label: 'void', value: '#101112' },
    { label: 'surface', value: '#181a1d' },
    { label: 'muted', value: '#7b8188' },
  ],
  typography: [
    { label: 'display', value: 'Display', sample: 'Build the system.', style: displayTextStyle },
    { label: 'headline', value: 'Headline', sample: 'Work moves cleanly.', style: serifDisplayStyle },
    { label: 'body', value: 'Body', sample: 'A precise operating surface for projects, agents, and decisions.', style: bodyTextStyle },
    { label: 'mono', value: 'Mono', sample: 'RUN 028 - READY', style: monoLabelStyle },
  ],
  metrics: [
    { value: '12', label: 'Systems' },
    { value: '48', label: 'Runs' },
    { value: '7', label: 'Templates' },
    { value: '1', label: 'Operator' },
  ],
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function pickTokenColor(colors: Record<string, unknown> | undefined, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = readString(colors?.[key])
    if (value) return value
  }
  return fallback
}

function formatDate(value?: number | string) {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(value)
}

function slugifyTemplateName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildDesignSystemRunMetadata(
  organization: Organization,
  system: DesignSystemRow | undefined,
  palette: DesignPalette,
) {
  return {
    required: true,
    instruction: [
      `Use ${organization.name}'s organization design system as a hard constraint for all deck edits.`,
      'Do not introduce a competing visual direction unless the user explicitly asks to change the organization design system.',
      'When changing layout, copy, colors, typography, components, or imagery, preserve the organization design system tokens and principles.',
      organization.project === 'ardia'
        ? 'For Ardia, match the buyer landing: Inter Tight 200 titles, Instrument Serif italic only as a restrained accent, hairline product/data surfaces, one vermilion accent per slide, and the real Ardia mark.'
        : '',
    ].join(' '),
    system: system
      ? {
          id: system.id,
          name: system.name,
          slug: system.slug,
          tokens: system.tokens,
          assets: system.assets,
          metadata: system.metadata,
        }
      : {
          id: null,
          name: palette.name,
          slug: organization.project ?? 'organization-design-system',
          tokens: {
            direction: palette.direction,
            colors: {
              accent: palette.accent,
              accentDeep: palette.accentDeep,
              accentSoft: palette.accentSoft,
              bg: palette.bg,
              ink: palette.ink,
              ink2: palette.ink2,
              muted: palette.muted,
              muted2: palette.muted2,
              surface: palette.surface,
              surface2: palette.surface2,
              hairline: palette.hairline,
              hairline2: palette.hairline2,
            },
            colorRamp: palette.colors,
            typography: palette.typography.map((item) => ({
              label: item.label,
              value: item.value,
              sample: item.sample,
              style: item.style,
            })),
            metrics: palette.metrics,
          },
          assets: organization.project === 'ardia'
            ? {
                logo: {
                  preferred: 'svg',
                  usage: 'Use the Ardia building mark plus Instrument Serif italic wordmark. Do not draw a generic square logo.',
                  publicCandidates: [
                    { url: 'https://www.ardia.mx/ardia-iso-light.png', width: 190, height: 190, usage: 'light icon for dark backgrounds' },
                    { url: 'https://www.ardia.mx/ardia-iso-dark.png', width: 162, height: 162, usage: 'dark icon for light backgrounds' },
                  ],
                },
              }
            : {},
          metadata: {
            fallbackSnapshot: true,
            agentInstruction: organization.project === 'ardia'
              ? 'Match the Ardia buyer landing, not a generic executive deck. Use Inter Tight 200 for primary titles; Instrument Serif italic only for one accent word or line. Use hairline dividers and whitespace instead of boxed cards. Use the real Ardia logo asset or inline mark.'
              : undefined,
            avoid: organization.project === 'ardia'
              ? [
                  'large serif titles',
                  'all-italic headlines',
                  'fake square logos',
                  'generic dark SaaS cards',
                  'purple or blue gradients',
                  'filled red blocks',
                ]
              : undefined,
          },
        },
  }
}

function buildPalette(organization?: Organization, system?: DesignSystemRow): DesignPalette {
  const base = FALLBACK_DESIGN_SYSTEMS[organization?.project ?? ''] ?? DEFAULT_DESIGN_SYSTEM
  const tokens = system?.tokens ?? {}
  const colors = readRecord(tokens.colors)
  const typography = tokens.typography as Array<Record<string, unknown>> | undefined
  const metrics = tokens.metrics as Array<Record<string, unknown>> | undefined
  const accent = pickTokenColor(colors, ['accent', '--accent'], base.accent)
  const accentDeep = pickTokenColor(colors, ['accentDeep', 'accent-deep', '--accent-deep'], base.accentDeep)
  const accentSoft = pickTokenColor(colors, ['accentSoft', 'accent-soft', '--accent-soft'], base.accentSoft)
  const bg = pickTokenColor(colors, ['bg', '--bg'], base.bg)
  const ink = pickTokenColor(colors, ['ink', 'fg', '--fg'], base.ink)
  const ink2 = pickTokenColor(colors, ['ink2', 'fg2', 'fg-2', '--fg-2'], base.ink2)
  const muted = pickTokenColor(colors, ['muted', 'fgDim', 'fg-dim', '--fg-dim'], base.muted)
  const muted2 = pickTokenColor(colors, ['muted2', 'fgDim2', 'fg-dim-2', '--fg-dim-2'], base.muted2)
  const surface = pickTokenColor(colors, ['surface', '--surface'], base.surface)
  const surface2 = pickTokenColor(colors, ['surface2', 'surface-2', '--surface-2'], base.surface2)
  const hairline = pickTokenColor(colors, ['hairline', '--hairline'], base.hairline)
  const hairline2 = pickTokenColor(colors, ['hairline2', 'hairline-2', '--hairline-2'], base.hairline2)
  const normalizedColors = colors
    ? [
        { label: '--accent', value: accent },
        { label: '--accent-deep', value: accentDeep },
        { label: '--accent-soft', value: accentSoft },
        { label: '--bg', value: bg },
        { label: '--surface', value: surface },
        { label: '--surface-2', value: surface2 },
        { label: '--fg', value: ink },
        { label: '--fg-2', value: ink2 },
        { label: '--fg-dim', value: muted },
        { label: '--hairline', value: hairline },
      ]
    : base.colors

  return {
    ...base,
    name: system?.name ?? organization?.name ?? base.name,
    direction: readString(tokens.direction) ?? base.direction,
    accent,
    accentDeep,
    accentSoft,
    bg,
    ink,
    ink2,
    muted,
    muted2,
    surface,
    surface2,
    hairline,
    hairline2,
    colors: Array.isArray(tokens.colorRamp)
      ? tokens.colorRamp
          .map((item) => ({
            label: readString((item as Record<string, unknown>).label) ?? 'color',
            value: readString((item as Record<string, unknown>).value) ?? base.accent,
          }))
      : normalizedColors,
    typography: Array.isArray(typography)
      ? typography.map((item, index) => {
          const fallbackStyle = base.typography[index]?.style ?? bodyTextStyle
          const style = readRecord(item.style)
          return {
            label: readString(item.label) ?? 'type',
            value: readString(item.value) ?? 'Type',
            sample: readString(item.sample) ?? 'Sample text',
            style: style ? ({ ...fallbackStyle, ...style } as CSSProperties) : fallbackStyle,
          }
        })
      : base.typography,
    metrics: Array.isArray(metrics)
      ? metrics.map((item) => ({
          value: String(readString(item.value) ?? readNumber(item.value) ?? '0'),
          suffix: readString(item.suffix),
          label: readString(item.label) ?? 'Metric',
        }))
      : base.metrics,
  }
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

export default function Design() {
  const { templateSlug } = useParams<{ templateSlug: string }>()
  const navigate = useNavigate()
  const z = useZero<Schema, Mutators>()
  const [organizations] = useQuery(z.query.organizations.orderBy('name', 'asc'))
  const [designSystems] = useQuery(z.query.design_systems.orderBy('updatedAt', 'desc'))
  const [dbTemplates] = useQuery(z.query.design_templates.orderBy('updatedAt', 'desc'))
  const [templateVersions] = useQuery(z.query.design_template_versions.orderBy('createdAt', 'desc'))
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

  const typedOrganizations = organizations as Organization[]
  const typedSystems = designSystems as DesignSystemRow[]
  const typedDbTemplates = dbTemplates as DesignTemplateRow[]
  const typedVersions = templateVersions as DesignTemplateVersionRow[]
  const typedRuns = templateRuns as DesignTemplateRunRow[]
  const typedAgentRuns = agentRuns as AgentRunRow[]
  const typedProgressReports = agentRunProgressReports as AgentRunProgressReportRow[]

  const templates = useMemo(() => {
    const dbItems = buildDbTemplateItems(typedDbTemplates)
    return [
      ...dbItems,
      ...legacyDesignTemplates.map((template): TemplateListItem => ({
        id: template.id,
        slug: template.slug,
        title: template.title,
        project: template.project,
        organizationProject: template.organizationProject,
        type: template.type,
        sourceKind: template.sourceKind,
        description: template.description,
        slideCount: template.slideCount,
        dimensions: template.dimensions,
        createdAt: template.createdAt,
        legacy: template,
      })),
    ]
  }, [typedDbTemplates])

  const selectedTemplate = templates.find((template) => template.slug === templateSlug)

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
  const selectedSystem = typedSystems.find((system) => system.organizationId === selectedOrganizationId)
  const palette = useMemo(() => buildPalette(selectedOrganization, selectedSystem), [selectedOrganization, selectedSystem])

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
    .slice(0, 8)
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
    try {
      const designRunId = crypto.randomUUID()
      const agentRunId = crypto.randomUUID()
      const branchName = `design/${selectedTemplate.slug}-${agentRunId.slice(0, 8)}`
      const designSystemMetadata = buildDesignSystemRunMetadata(selectedOrganization, selectedSystem, palette)
      await z.mutate.agent_runs.create({
        id: agentRunId,
        subjectType: 'design_template_run',
        subjectId: designRunId,
        projectKey: selectedOrganization.project ?? 'pach',
        repoFullName: 'pach/design',
        baseBranch: 'main',
        branchName,
        status: 'queued',
        statusMessage: 'queued for design agent worker',
        metadata: {
          executionClass: 'general',
          handler: 'design-template-mcp',
          requiredCapabilities: ['codex.local', 'pach-mcp'],
          queuedVia: 'design_template_chat',
          designTemplateRunId: designRunId,
          designTemplateId: selectedTemplate.legacy ? undefined : selectedTemplate.id,
          designTemplateSlug: selectedTemplate.slug,
          designTemplateTitle: selectedTemplate.title,
          organizationId: selectedOrganization.id,
          organizationName: selectedOrganization.name,
          organizationProject: selectedOrganization.project,
          sourceVersionId: selectedVersion?.id,
          prompt: cleanPrompt,
          mustUseOrganizationDesignSystem: true,
          designSystem: designSystemMetadata,
        },
      })
      await z.mutate.design_template_runs.create({
        id: designRunId,
        organizationId: selectedOrganization.id,
        templateId: selectedTemplate.legacy ? undefined : selectedTemplate.id,
        agentRunId,
        templateSlug: selectedTemplate.slug,
        prompt: cleanPrompt,
        status: 'queued',
        statusMessage: 'queued for agent worker',
        sourceVersionId: selectedVersion?.id,
        metadata: {
          templateTitle: selectedTemplate.title,
          sourceKind: selectedTemplate.sourceKind,
          mustUseOrganizationDesignSystem: true,
          designSystem: designSystemMetadata,
          agentRunId,
        },
      })
      setPrompt('')
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'could not queue run')
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
      await z.mutate.design_templates.create({
        id: templateId,
        organizationId: selectedOrganization.id,
        type: 'deck',
        name,
        slug,
        status: 'draft',
        sourceKind: 'react',
        currentVersionId: versionId,
        metadata: {
          project: selectedOrganization.project,
          description: 'Draft deck template',
          slideCount: 0,
        },
      })
      await z.mutate.design_template_versions.create({
        id: versionId,
        organizationId: selectedOrganization.id,
        templateId,
        versionNumber: 1,
        sourceKind: 'react',
        files: buildDefaultTemplateFiles(name, selectedOrganization),
        manifest: {
          title: name,
          type: 'deck',
          entry: 'src/Template.tsx',
        },
        dependencies: {},
        validationStatus: 'compiled',
      })
      navigate(`/design/${slug}`)
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : 'could not create template')
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  async function handleRenameTemplate(template: TemplateListItem, nextName: string) {
    const cleanName = nextName.trim()
    if (!cleanName || template.legacy || cleanName === template.title) return

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

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-pit text-fg-1">
      <DesignSidebar
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
        onCreateTemplate={handleCreateTemplate}
        isCreatingTemplate={isCreatingTemplate}
        sidebarError={sidebarError}
        runs={runsForTemplate}
        agentRunByDesignRunId={agentRunByDesignRunId}
        progressReportsByRunId={progressReportsByRunId}
        chatError={chatError}
        onRenameTemplate={handleRenameTemplate}
        designSystemName={selectedSystem?.name ?? palette.name}
        onBack={() => navigate('/design')}
        onOpenTemplate={(slug) => navigate(`/design/${slug}`)}
      />

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
        {selectedTemplate ? (
          <TemplatePreview template={selectedTemplate} version={selectedVersion} />
        ) : (
          <DesignSystemCanvas organization={selectedOrganization} palette={palette} />
        )}
      </main>
    </div>
  )
}

function DesignSidebar({
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
  onCreateTemplate,
  isCreatingTemplate,
  sidebarError,
  runs,
  agentRunByDesignRunId,
  progressReportsByRunId,
  chatError,
  onRenameTemplate,
  designSystemName,
  onBack,
  onOpenTemplate,
}: {
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
  onCreateTemplate: () => void
  isCreatingTemplate: boolean
  sidebarError: string | null
  runs: DesignTemplateRunRow[]
  agentRunByDesignRunId: Map<string, AgentRunRow>
  progressReportsByRunId: Map<string, AgentRunProgressReportRow[]>
  chatError: string | null
  onRenameTemplate: (template: TemplateListItem, nextName: string) => Promise<void>
  designSystemName: string
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
    <aside className="flex w-[340px] shrink-0 flex-col border-r border-edge/12 bg-void/95 md:w-[372px]">
      {selectedTemplate ? (
        <TemplateChatSidebar
          template={selectedTemplate}
          prompt={prompt}
          onPromptChange={onPromptChange}
          onQueueRun={onQueueRun}
          runs={runs}
          agentRunByDesignRunId={agentRunByDesignRunId}
          progressReportsByRunId={progressReportsByRunId}
          chatError={chatError}
          onRenameTemplate={onRenameTemplate}
          designSystemName={designSystemName}
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
  runs,
  agentRunByDesignRunId,
  progressReportsByRunId,
  chatError,
  onRenameTemplate,
  designSystemName,
  onBack,
}: {
  template: TemplateListItem
  prompt: string
  onPromptChange: (value: string) => void
  onQueueRun: (event: FormEvent) => void
  runs: DesignTemplateRunRow[]
  agentRunByDesignRunId: Map<string, AgentRunRow>
  progressReportsByRunId: Map<string, AgentRunProgressReportRow[]>
  chatError: string | null
  onRenameTemplate: (template: TemplateListItem, nextName: string) => Promise<void>
  designSystemName: string
  onBack: () => void
}) {
  const [templateName, setTemplateName] = useState(template.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const canRename = !template.legacy
  const cleanTemplateName = templateName.trim()
  const hasNameChange = cleanTemplateName.length > 0 && cleanTemplateName !== template.title

  useEffect(() => {
    setTemplateName(template.title)
    setRenameError(null)
    setIsRenaming(false)
  }, [template.id, template.title])

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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          <div className="border border-edge/12 bg-pit-2 px-3 py-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-accent">
              <Bot className="h-3.5 w-3.5" />
              design agent
            </div>
            <p className="text-xs leading-5 text-fg-3">
              Ready for edits. Prompts must preserve the {designSystemName} design system.
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
        </div>
      </div>

      <form onSubmit={onQueueRun} className="border-t border-edge/12 p-4">
        {chatError && (
          <div className="mb-3 border border-fail/25 bg-fail/5 px-3 py-2 text-xs text-fail">
            {chatError}
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          className="min-h-[112px] w-full resize-none border border-edge/20 bg-pit-3 px-3 py-2.5 text-sm leading-5 text-fg-1 outline-none transition placeholder:text-fg-4 focus:border-accent/60"
          placeholder="Change tone, layout, copy, structure..."
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 border border-accent-fill/30 bg-accent-fill/10 font-mono text-[10px] uppercase tracking-label text-accent transition hover:bg-accent-fill/16 disabled:cursor-not-allowed disabled:border-edge/12 disabled:bg-pit-3 disabled:text-fg-4"
        >
          <Send className="h-3.5 w-3.5" />
          queue run
        </button>
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
        <span className="text-fg-4">{formatDate(run.createdAt)}</span>
        <span className={statusClass}>{effectiveStatus}</span>
      </div>
      <p className="text-xs leading-5 text-fg-2">{run.prompt}</p>
      {latestProgress ? (
        <div className="mt-3 border-t border-edge/10 pt-2">
          <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-label text-fg-4">
            <span>{latestProgress.phase ?? 'progress'}</span>
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

function TemplatePreview({
  template,
  version,
}: {
  template: TemplateListItem
  version?: DesignTemplateVersionRow
}) {
  if (template.legacy) {
    const theme = getTheme(template.legacy.config.theme)
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <SlideRenderer
          slides={template.legacy.slides}
          title={template.legacy.config.title}
          description={`${template.legacy.slides.length} slides / ${template.legacy.config.dimensions.width} x ${template.legacy.config.dimensions.height}px`}
          width={template.legacy.config.dimensions.width}
          height={template.legacy.config.dimensions.height}
          theme={theme}
          filename={template.slug}
          ctaLinks={template.legacy.config.ctaLinks}
        />
      </div>
    )
  }

  const previewUrl = getTemplatePreviewUrl(version)

  if (previewUrl) {
    return (
      <iframe
        title={template.title}
        src={previewUrl}
        sandbox="allow-scripts allow-downloads"
        className="h-full w-full border-0 bg-pit"
      />
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

function buildDefaultTemplateFiles(name: string, organization: Organization): Record<string, string> {
  const organizationName = organization.name
  return {
    'src/Template.tsx': `import React from 'react'

export default function Template() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#0f0d0c',
      color: '#f3f0e9',
      padding: '72px clamp(32px, 6vw, 96px)',
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
        fontFamily: 'Instrument Serif, Georgia, serif',
        fontSize: 'clamp(64px, 11vw, 156px)',
        fontWeight: 400,
        lineHeight: 0.9
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
`,
  }
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-edge/12 bg-pit-2 px-4 py-4">
      <div className="font-mono text-[9px] uppercase tracking-label text-fg-4">{label}</div>
      <div className="mt-2 font-mono text-sm text-fg-1">{value}</div>
    </div>
  )
}

function DesignSystemCanvas({
  organization,
  palette,
}: {
  organization?: Organization
  palette: DesignPalette
}) {
  return (
    <div
      className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden"
      style={{
        background: palette.bg,
        color: palette.ink,
        fontFamily: ARDIA_SANS,
        containerType: 'inline-size',
      }}
    >
      <div className="w-full min-w-0 px-5 py-10 md:px-8 md:py-12 lg:px-10">
        <div className="mb-20 grid min-w-0 gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)]">
          <div className="min-w-0">
            <div
              className="mb-7 flex items-center gap-2"
              style={{ ...monoLabelStyle, color: palette.accent }}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: palette.accent }} />
              direction d
            </div>
            <h1
              className="min-w-0"
              style={{
                ...h1TextStyle,
                color: palette.ink,
                fontSize: 'clamp(48px, 6cqw, 72px)',
              }}
            >
              Quiet{' '}
              <span style={{ fontFamily: ARDIA_SERIF, fontStyle: 'italic', fontWeight: 400, color: palette.accent }}>
                minimalist
              </span>
            </h1>
            <p className="mt-6 max-w-[58ch]" style={{ ...bodyTextStyle, color: palette.muted }}>
              Maximum restraint. Ultra-light weights, a single hairline rule, whitespace instead of containers.
              A vermilion dot where other directions use a full color block. Reads as confident, almost
              Scandinavian.
            </p>
          </div>
          <div
            className="self-end text-left md:text-right"
            style={{ ...monoLabelStyle, color: palette.muted }}
          >
            <div>{organization?.project ?? 'organization'} / design surface</div>
            <div style={{ color: palette.accent }}>one hairline / one dot</div>
          </div>
        </div>

        <section className="mb-20 grid min-w-0 gap-8 md:grid-cols-[minmax(118px,14cqw)_minmax(0,1fr)]">
          <SectionLabel icon={Type} label="type specimen" palette={palette} />
          <div className="min-w-0">
            {palette.typography.map((item) => (
              <div
                key={item.label}
                className="grid min-w-0 gap-4 border-b py-7 first:pt-0 md:grid-cols-[minmax(130px,16cqw)_minmax(0,1fr)]"
                style={{ borderColor: palette.hairline }}
              >
                <div style={{ ...monoLabelStyle, color: palette.muted }}>
                  {item.label}
                </div>
                <div className="min-w-0">
                  <div
                    className="min-w-0"
                    style={{ ...item.style, color: palette.ink }}
                  >
                    {item.sample}
                  </div>
                  <div className="mt-3" style={{ ...monoLabelStyle, color: palette.muted }}>
                    {item.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionLabel icon={Palette} label="color system" palette={palette} />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {palette.colors.map((color) => (
              <div
                key={color.label}
                className="min-w-0 border p-3"
                style={{ borderColor: palette.hairline, background: palette.surface }}
              >
                <div className="mb-12 h-14 border" style={{ background: color.value, borderColor: palette.hairline2 }} />
                <div style={{ ...monoLabelStyle, color: palette.muted }}>{color.label}</div>
                <div className="mt-1 break-words" style={{ ...monoDataStyle, color: palette.ink }}>{color.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <SectionLabel icon={CheckCircle2} label="numbers" palette={palette} />
          <div className="mt-8 grid grid-cols-2 gap-8 md:grid-cols-4">
            {palette.metrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <div style={{ fontFamily: ARDIA_SANS, fontWeight: 200, lineHeight: 0.95, fontSize: 'clamp(48px, 6cqw, 72px)', color: palette.ink }}>
                  {metric.value}
                  {metric.suffix && (
                    <span
                      className="ml-1"
                      style={{ fontFamily: ARDIA_SERIF, fontStyle: 'italic', fontSize: 22, color: palette.accent }}
                    >
                      {metric.suffix}
                    </span>
                  )}
                </div>
                <div className="mt-3" style={{ ...monoDataStyle, color: palette.muted }}>{metric.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid min-w-0 gap-10 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <SectionLabel icon={Sparkles} label="buttons and links" palette={palette} />
            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm">
              <button
                type="button"
                className="border-b pb-1"
                style={{ ...bodyTextStyle, borderColor: palette.accent, color: palette.ink }}
              >
                Solicitar demo <span style={{ color: palette.accent }}>-&gt;</span>
              </button>
              <button type="button" style={{ ...bodyTextStyle, color: palette.muted }}>Ver producto</button>
              <button
                type="button"
                style={{ fontFamily: ARDIA_SERIF, fontStyle: 'italic', fontSize: 16, color: palette.muted }}
              >
                conversar
              </button>
            </div>
            <blockquote
              className="mt-10 max-w-[32rem]"
              style={{ fontFamily: ARDIA_SERIF, fontStyle: 'italic', fontSize: 28, lineHeight: 1.22, color: palette.ink }}
            >
              "Conciliar 8 millones solia tomar tres dias. Ahora son <span style={{ color: palette.accent }}>treinta segundos</span>."
            </blockquote>
          </div>

          <div className="min-w-0">
            <SectionLabel icon={Layers3} label="product surface" palette={palette} />
            <div className="mt-8 min-w-0 border px-5 py-5 md:px-6" style={{ borderColor: palette.hairline, background: palette.surface }}>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: palette.hairline }}>
                <div style={{ fontFamily: ARDIA_SERIF, fontStyle: 'italic', fontSize: 14, color: palette.ink }}>Conciliacion</div>
                <div style={{ ...monoLabelStyle, color: palette.muted }}>22 abr / 14:08</div>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <div className="min-w-0">
                  <div style={{ ...monoLabelStyle, color: palette.muted }}>Empates hoy</div>
                  <div className="mt-3" style={{ fontFamily: ARDIA_SANS, fontWeight: 200, fontSize: 'clamp(42px, 5cqw, 54px)', lineHeight: 1, color: palette.ink }}>
                    96.07<span className="ml-1" style={{ fontFamily: ARDIA_SERIF, fontStyle: 'italic', fontSize: 18, color: palette.accent }}>%</span>
                  </div>
                  <div className="mt-3" style={{ ...monoDataStyle, color: palette.muted }}>1,247 de 1,298 / 51 en revision</div>
                </div>
                <div className="min-w-0">
                  <div style={{ ...monoLabelStyle, color: palette.muted }}>Saldo</div>
                  <div className="mt-4" style={{ fontFamily: ARDIA_SANS, fontWeight: 200, fontSize: 34, lineHeight: 1, color: palette.ink }}>8.42M</div>
                  <div className="mt-3" style={{ ...monoDataStyle, color: palette.muted }}>MXN / +142,300 vs. ayer</div>
                </div>
              </div>
              <div className="mt-8 space-y-3">
                {['BBVA 8042 - D. Ramirez - U304', 'Santander 1168 - M. Orozco - U211', 'Banorte 8913 - Casa Tlalpan SA'].map((row, index) => (
                  <div
                    key={row}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-4 border-t pt-3"
                    style={{ ...monoDataStyle, borderColor: palette.hairline2, color: index === 2 ? palette.ink : palette.muted }}
                  >
                    <span className="min-w-0 truncate">{row}</span>
                    <span style={{ color: index === 2 ? palette.accent : palette.muted }}>ok</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionLabel({
  icon: Icon,
  label,
  palette,
}: {
  icon: typeof Type
  label: string
  palette: DesignPalette
}) {
  return (
    <div className="flex items-center gap-2" style={{ ...monoLabelStyle, color: palette.muted }}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  )
}
