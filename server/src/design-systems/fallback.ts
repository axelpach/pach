type OrganizationLike = {
  id: string
  name: string
  project?: string | null
}

export type FallbackDesignSystem = {
  id: string | null
  organizationId: string
  name: string
  slug: string
  tokens: Record<string, unknown>
  assets: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

export function getFallbackDesignSystemForOrganization(organization?: OrganizationLike | null): FallbackDesignSystem | null {
  if (organization?.project !== 'ardia') return null

  return {
    id: null,
    organizationId: organization.id,
    name: 'Ardia Quiet Minimalist',
    slug: 'ardia-quiet-minimalist',
    tokens: ARDIA_TOKENS,
    assets: ARDIA_ASSETS,
    metadata: ARDIA_METADATA,
    createdAt: null,
    updatedAt: null,
  }
}

export function mergeDesignSystemWithFallback<T extends FallbackDesignSystem>(
  system: T | null,
  fallback: FallbackDesignSystem | null,
): T | FallbackDesignSystem | null {
  if (!system) return fallback
  if (!fallback) return system

  return {
    ...system,
    tokens: deepMerge(fallback.tokens, system.tokens),
    assets: deepMerge(fallback.assets, system.assets),
    metadata: deepMerge(fallback.metadata, system.metadata),
  }
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key]
    result[key] = isPlainObject(baseValue) && isPlainObject(value)
      ? deepMerge(baseValue, value)
      : value
  }

  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

const ARDIA_LOGO_SVG = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M5 28V12L13 8V28" stroke="currentColor" stroke-width="1.5" fill="none" />
  <path d="M13 28V6L23 10V28" stroke="currentColor" stroke-width="1.5" fill="none" />
  <path d="M5 28H27" stroke="currentColor" stroke-width="1.5" />
  <path d="M7 14V26M9 13V26M11 12V26" stroke="currentColor" stroke-width="0.6" opacity="0.55" />
  <rect x="14.5" y="14" width="6" height="6" transform="rotate(45 17.5 17)" fill="currentColor" />
</svg>`

const ARDIA_TOKENS = {
  source: {
    description: 'Canonical fallback derived from ../ardia/apps/buyers-ardia/DESIGN_SYSTEM.md and components/qm/*.',
    primaryLandingFiles: [
      'apps/buyers-ardia/app/page.tsx',
      'apps/buyers-ardia/components/qm/QMSections.tsx',
      'apps/buyers-ardia/components/qm/atoms.tsx',
      'apps/buyers-ardia/components/qm/QMNav.tsx',
      'apps/buyers-ardia/app/globals.css',
    ],
  },
  direction: 'Quiet Minimalist',
  principle: 'Whitespace is the container. Hierarchy comes from weight contrast, mono metadata, and restrained serif accents, not from boxes, borders, or color.',
  colors: {
    accent: '#E43F3F',
    accentDeep: '#8B1E1E',
    accentSoft: '#F2A09F',
    accentGlow: 'rgba(228, 63, 63, 0.18)',
    bg: '#14110f',
    surface: '#1a1613',
    surface2: '#1e1a17',
    fg: '#ede6db',
    fg2: 'rgba(237, 230, 219, 0.75)',
    fgDim: 'rgba(237, 230, 219, 0.42)',
    fgDim2: 'rgba(237, 230, 219, 0.25)',
    hairline: 'rgba(237, 230, 219, 0.07)',
    hairline2: 'rgba(237, 230, 219, 0.14)',
    success: '#6fbf7f',
    warn: '#d4a648',
  },
  typography: {
    families: {
      sans: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
      serif: "'Instrument Serif', 'Newsreader', Georgia, serif",
      mono: "'Geist Mono', ui-monospace, Menlo, monospace",
    },
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@200;300;400;500&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500&display=swap',
    roles: {
      display: 'Inter Tight 200, 96px, 0.95 line-height. Main hero H1 only.',
      h1: 'Inter Tight 200, 64px, 0.98 line-height. Page/deck titles.',
      h2: 'Inter Tight 200, 48px, 1.02 line-height. Section titles.',
      body: 'Inter Tight 300, 16px, 1.65 line-height, max 58ch.',
      serifAccent: 'Instrument Serif italic 400, 32-64px. Use for one accent word or one accent line only.',
      monoLabel: 'Geist Mono 500 uppercase, 10-11px, 0.18-0.2em tracking. Eyebrows and metadata only.',
      numeric: 'Inter Tight 200, 40-84px. KPI numbers.',
    },
    hardRules: [
      'Do not use font-weight 600 or heavier.',
      'Do not set primary deck titles in Instrument Serif. Main titles are Inter Tight 200.',
      'Use Instrument Serif italic only for one accent word/line, never for full headings or dense product text.',
      'Use Geist Mono only for labels, dates, identifiers, metadata, and tiny section markers.',
    ],
  },
  layout: {
    maxWidth: 1280,
    desktopGutter: 80,
    mobileGutter: 24,
    sectionPaddingDesktop: '160px 80px',
    sectionPaddingMobile: '80px 24px',
    heroPattern: 'Two-column landing hero: copy left, restrained product/dashboard surface right. On decks, use airy compositions with one dominant title block and a supporting product/data surface.',
    grid: '12-column conceptual grid; use 2-column and 3-column layouts with hairline dividers, not boxed cards.',
    rhythm: 'Large whitespace. Section boundaries may use a single 1px top hairline.',
  },
  components: {
    brand: 'Inline Ardia mark plus Instrument Serif italic wordmark. Preferred: logo SVG/icon at 30px with accent color and word "Ardia" in Instrument Serif italic 30px.',
    primaryCta: 'Underlined text link with vermilion underline and arrow. No filled primary button.',
    surfaces: 'Transparent or warm-dark surfaces. Product mock/dashboard surfaces can have a single hairline border or left border, never heavy card chrome.',
    charts: 'Vermilion 1.2px line, subtle accent area fill, mono labels. Bars use vermilion opacity ramp.',
    status: '6px dots plus text. Never use filled chips/badges.',
    forms: 'Underline-only inputs, transparent background.',
  },
  deckGuidance: {
    preferredSlideStructure: [
      'Start with mono eyebrow plus small Ardia brand lockup.',
      'Use a large Inter Tight 200 title with one optional Instrument Serif italic accent line.',
      'Keep body copy short and warm, max 58ch.',
      'Use hairline dividers and whitespace instead of bordered cards.',
      'For product/value slides, include a dashboard-like data surface inspired by QHeroSurface: mono header, two KPI blocks, subtle chart, activity rows.',
      'Use one vermilion accent per slide viewport: a dot, underline, chart stroke, or accent word.',
    ],
    avoid: [
      'Generic dark SaaS dashboards with glowing cards.',
      'Large serif titles or all-italic headlines.',
      'Purple/blue gradients, neon effects, bokeh/orbs, glass cards.',
      'Filled red blocks or large accent backgrounds.',
      'Rounded cards as the main composition.',
      'Fake square logos. Use the Ardia mark or the approved logo asset.',
    ],
  },
}

const ARDIA_ASSETS = {
  logo: {
    name: 'Ardia mark',
    kind: 'logo',
    preferred: 'svg',
    inlineSvg: ARDIA_LOGO_SVG,
    usage: 'Use currentColor; set color to #E43F3F on dark or #1a1612 on light. Pair with Instrument Serif italic wordmark "Ardia".',
    publicCandidates: [
      {
        url: 'https://www.ardia.mx/ardia-iso-light.png',
        width: 190,
        height: 190,
        usage: 'Light/cream icon for dark backgrounds.',
      },
      {
        url: 'https://www.ardia.mx/ardia-iso-dark.png',
        width: 162,
        height: 162,
        usage: 'Dark icon for light backgrounds.',
      },
      {
        url: 'https://www.ardia.mx/ardia-iso-black-bg.png',
        width: 162,
        height: 162,
        usage: 'Icon on black tile; use only when a bitmap tile is needed.',
      },
    ],
    sourcePaths: [
      'apps/buyers-ardia/public/ardia-iso-light.png',
      'apps/buyers-ardia/public/ardia-iso-dark.png',
      'apps/buyers-ardia/public/ardia-iso-sm.png',
      'apps/buyers-ardia/public/ardia-iso-black-bg.png',
    ],
  },
  imagery: {
    guidance: 'Images are rare and quiet. Prefer product/data mock surfaces, architectural details, receipts/documents, or real development imagery with restrained crops. Avoid generic stock photos.',
  },
}

const ARDIA_METADATA = {
  fallbackSnapshot: true,
  sourceLabel: 'Ardia buyer landing',
  sourceReferences: [
    '../ardia/apps/buyers-ardia/DESIGN_SYSTEM.md',
    '../ardia/apps/buyers-ardia/components/qm/QMSections.tsx',
    '../ardia/apps/buyers-ardia/components/qm/atoms.tsx',
    '../ardia/apps/buyers-ardia/components/qm/QMNav.tsx',
  ],
  agentInstruction: [
    'Match the Ardia buyer landing, not a generic executive deck.',
    'Use Inter Tight 200 for large titles and Instrument Serif italic only as a restrained accent.',
    'Use the Ardia mark from assets.logo.inlineSvg or assets.logo.publicCandidates; do not draw a generic square mark.',
    'Create hairline, data-rich product surfaces inspired by QHeroSurface when a slide needs visuals.',
  ].join(' '),
}
