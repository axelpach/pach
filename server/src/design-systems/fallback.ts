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
    canonicalDeckFiles: [
      'tools/decks/library/ardia-one-pager/slides/01-cover.tsx',
      'tools/decks/library/ardia-one-pager/slides/02-features.tsx',
      'tools/decks/library/ardia-one-pager/slides/03-results.tsx',
      'tools/decks/library/ardia-universo-abanza-onboarding/slides/01-onboarding.tsx',
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
      serifAccent: 'Instrument Serif italic 400, 32-64px. Use for one emotionally important inline title phrase, accent word, or short accent line only.',
      monoLabel: 'Geist Mono 500 uppercase, 10-11px, 0.18-0.2em tracking. Eyebrows and metadata only.',
      numeric: 'Inter Tight 200, 40-84px. KPI numbers.',
    },
    hardRules: [
      'Do not use font-weight 600 or heavier.',
      'Do not set primary deck titles in Instrument Serif. Main titles are Inter Tight 200.',
      'Use Instrument Serif italic only for one inline title phrase, accent word, or short accent line; never for a full heading or dense product text.',
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
    atmosphere: 'Allowed and canonical on decks: one subtle off-canvas vermilion radial glow per slide, about 700-900px, opacity 0.08-0.13, fading to transparent by 60%. This is the Ardia one-pager atmosphere; it is not a generic neon gradient.',
    status: '6px dots plus text. Never use filled chips/badges.',
    forms: 'Underline-only inputs, transparent background.',
  },
  deckGuidance: {
    referenceStyle: 'Use the Pach legacy "ardia one-pager" as the default composition skeleton for Ardia decks. Use the buyer landing and Universo aBanza patterns as modules inside that skeleton, not as replacements for the overall page grammar.',
    compositionSkeleton: [
      'Default every Ardia deck slide to the one-pager composition grammar: top brand row, right-side metadata, dot/mono eyebrow, large Inter Tight 200 title, one inline Instrument Serif italic vermilion phrase, short body, hairline section rows, transparent framed modules, footer hairline, and subtle off-canvas vermilion glow.',
      'For portrait 1080x1528 one-pager slides, use the legacy measurements as the base: side padding 64px, top brand row y=56px, hero starts around y=200px, eyebrow margin-bottom 28px, title 64px Inter Tight 200 with line-height 1.0 and letter-spacing -0.045em, body 19px with line-height 1.55 and max-width 780px, hairline rows start around y=575px, framed module starts around y=865px, footer at bottom with 20px vertical padding. For other dimensions, scale these numbers by min(width/1080, height/1528).',
      'Charts, KPIs, tables, WhatsApp mocks, product surfaces, and buyer-landing data panels are allowed, but they must inherit the one-pager margins, title scale, text hierarchy, hairline rhythm, transparent frames, and footer structure.',
      'Do not let a content module change the slide into a separate dashboard/report composition. The module can vary; the one-pager skeleton stays.',
    ],
    preferredSlideStructure: [
      'Start with mono eyebrow plus small Ardia brand lockup.',
      'Use a large Inter Tight 200 title with one emotionally important inline phrase in Instrument Serif italic vermilion, like the legacy one-pager title treatments.',
      'Keep body copy short and warm, max 58ch.',
      'Use hairline dividers and whitespace instead of bordered cards.',
      'For product/value slides, insert a dashboard-like data surface inspired by QHeroSurface into the one-pager skeleton: mono header, two KPI blocks, subtle chart, activity rows, transparent frame or hairline boundary.',
      'Use vermilion as a recurring low-area signal: 6px dot, inline serif phrase, KPI unit, chart stroke/faint fill, CTA underline, status text, and optional off-canvas radial glow.',
    ],
    canonicalPatterns: [
      {
        name: 'Ardia one-pager cover',
        useFor: 'Problem, promise, WhatsApp/payment flow, and sales one-pager slides.',
        structure: 'Portrait 1080x1528 rhythm or scaled equivalent: top brand row, right metadata, off-canvas vermilion radial glow, dot eyebrow, oversized Inter Tight 200 headline with inline Instrument Serif italic vermilion phrase, short body, hairline pain rows, transparent WhatsApp/product frame, footer hairline.',
      },
      {
        name: 'Ardia one-pager features/results',
        useFor: 'Feature, product, KPI, implementation, and CTA slides.',
        structure: 'Top brand row, section eyebrow, 52-72px Inter Tight title split across lines with a red serif italic phrase, hairline-only product surface, stats separated by vertical hairlines, feature/checklist rows separated by thin rules, footer hairline.',
      },
      {
        name: 'Universo aBanza onboarding',
        useFor: 'Checklists, onboarding guides, data collection, co-branded project instructions.',
        structure: 'Co-brand top row, dot eyebrow, calm title, compact body, three numbered hairline sections, mono field names in two columns, final note and footer.',
      },
      {
        name: 'Buyer landing surface',
        useFor: 'Dashboard or operational proof visuals.',
        structure: 'Use as a module inside the one-pager skeleton: mono dashboard metadata, large KPI numbers, one vermilion chart stroke, faint hairline row dividers, transparent or hairline frame, no boxy card stack.',
      },
    ],
    starterKit: {
      requiredExports: 'For deck templates export one component per slide and export const slides = [CoverSlide, ...].',
      preferredComponents: ['SlideShell', 'ArdiaMark', 'MonoLabel', 'DotLabel', 'HairlineRow', 'Metric', 'ProductSurface'],
      sizing: 'Default to 1920x1080 unless the user asks for portrait/mobile. Every slide component must accept { width, height, pageIndex, pageCount } and render exactly one fixed-size slide.',
      styling: 'Inline styles are acceptable and preferred for fidelity. Tailwind is supported, but do not depend on Pach app CSS variables. Include manifest.googleFontsHref for Inter Tight, Instrument Serif, and Geist Mono.',
    },
    avoid: [
      'Generic dark SaaS dashboards with glowing cards.',
      'Large serif titles or all-italic headlines.',
      'Purple/blue gradients, neon effects, bokeh/orbs, glass cards.',
      'Opaque red panels, filled red blocks, or heavy red backgrounds. Subtle Ardia vermilion radial glow is allowed.',
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
  sourceLabel: 'Ardia buyer landing + Pach legacy Ardia decks',
  sourceReferences: [
    '../ardia/apps/buyers-ardia/DESIGN_SYSTEM.md',
    '../ardia/apps/buyers-ardia/components/qm/QMSections.tsx',
    '../ardia/apps/buyers-ardia/components/qm/atoms.tsx',
    '../ardia/apps/buyers-ardia/components/qm/QMNav.tsx',
    'tools/decks/library/ardia-one-pager/slides/01-cover.tsx',
    'tools/decks/library/ardia-one-pager/slides/02-features.tsx',
    'tools/decks/library/ardia-one-pager/slides/03-results.tsx',
    'tools/decks/library/ardia-universo-abanza-onboarding/slides/01-onboarding.tsx',
  ],
  requiredDesignContract: {
    priority: 'hard_constraint',
    canonicalReferences: [
      'Ardia buyer landing quiet-minimalist sections',
      'Pach legacy ardia-one-pager deck',
      'Pach legacy Universo aBanza onboarding deck',
    ],
    nonNegotiables: [
      'Use the Ardia quiet-minimalist system for every Ardia template edit unless the user explicitly asks to change the organization design system.',
      'Use Inter Tight 200 for large display titles, Geist Mono for small technical labels, and Instrument Serif italic vermilion for one emotionally important inline title phrase, accent word, or short accent line.',
      'Use the real Ardia mark from assets.logo.inlineSvg, assets.logo.publicCandidates, or uploaded organization assets; never draw a fake square logo.',
      'Use the legacy Ardia one-pager composition skeleton for the whole slide: top brand row, right metadata, dot/mono eyebrow, Inter Tight 200 title scale, inline red serif phrase, short body, hairline rows, transparent framed modules, footer hairline, and subtle off-canvas red glow.',
      'Use exact legacy one-pager proportions: on 1080x1528, side padding 64px, top brand row y=56px, hero y about 200px, title 64px/1.0 Inter Tight 200, body 19px/1.55 max 780px, hairline rows y about 575px, module y about 865px, footer pinned to bottom; scale proportionally for other aspect ratios. Do not invent larger title scales or wider margins.',
      'Charts, KPIs, tables, WhatsApp mocks, and product/data surfaces are allowed, but they must be inserted into the one-pager skeleton and inherit its margins, type scale, hairline rhythm, transparent frames, and footer structure.',
      'Keep backgrounds near black, structure with whitespace and one-pixel hairlines, and use vermilion as a recurring low-area signal: dots, inline serif phrases, KPI units, chart strokes/faint fills, CTA underlines, status text, and optional off-canvas radial glow.',
      'Use the legacy Ardia one-pager atmospheric glow when useful: one subtle vermilion radial gradient per slide, placed off-canvas, opacity 0.08-0.13, fading to transparent. Do not replace it with neon, bokeh, blue/purple gradients, or opaque red panels.',
      'When a slide needs visuals, create quiet product/data surfaces like the buyer landing QHeroSurface or the legacy Ardia one-pager data panels.',
      'For decks, build real fixed-size slide components and export a slides array so Pach renders separated slide frames.',
    ],
    forbiddenDrift: [
      'generic executive deck layouts',
      'generic SaaS cards',
      'blue or purple gradients',
      'neon glows, bokeh, glass panels, or glowing card stacks',
      'large serif headlines as the primary title style',
      'all-italic headlines',
      'fake square logos',
      'opaque red panels or heavy red backgrounds',
      'one long scrolling document pretending to be slides',
    ],
    editChecklist: [
      'Compare the result against tokens.deckGuidance.referenceStyle, canonicalPatterns, starterKit, and avoid before saving a version.',
      'If the user asks for new content, satisfy the content request inside the Ardia visual language instead of inventing a new style.',
      'If the user asks for a visual style that conflicts with Ardia, report the conflict and keep the organization design system unless explicitly told to replace it.',
    ],
  },
  agentInstruction: [
    'MANDATORY ARDIA DESIGN CONTRACT: use the Pach legacy Ardia one-pager as the composition skeleton for every Ardia template edit.',
    'Treat metadata.requiredDesignContract as a QA checklist before saving; this is a hard constraint, not optional inspiration.',
    'Do not drift into a generic executive deck, generic SaaS cards, blue/purple gradients, neon/glass/bokeh panels, large serif primary titles, opaque red panels, or fake square logos.',
    'Use Inter Tight 200 for large titles, Geist Mono for small labels, and Instrument Serif italic vermilion for one emotionally important inline title phrase, accent word, or short accent line.',
    'Use the Ardia one-pager composition skeleton for the whole slide. Charts, KPIs, product surfaces, and other content modules are allowed, but they must inherit the one-pager margins, title scale, text hierarchy, hairline rhythm, transparent frames, footer, and subtle glow.',
    'Use exact legacy one-pager proportions: on 1080x1528, side padding 64px, top brand row y=56px, hero y about 200px, title 64px/1.0 Inter Tight 200, body 19px/1.55 max 780px, hairline rows y about 575px, module y about 865px, footer pinned to bottom; scale proportionally for other aspect ratios.',
    'Use the Ardia one-pager red atmosphere: one subtle off-canvas vermilion radial glow per slide when useful, opacity 0.08-0.13, fading to transparent; this is allowed and canonical.',
    'Use the real Ardia mark from assets.logo.inlineSvg, assets.logo.publicCandidates, or uploaded organization assets.',
    'Create quiet hairline, data-rich product surfaces inspired by QHeroSurface and the legacy Ardia one-pager when a slide needs visuals.',
    'For decks, keep each slide as a real fixed-size React component and export a slides array; do not create one long scrolling document pretending to be multiple slides.',
    'Prefer the starter kit names and patterns in tokens.deckGuidance.starterKit/canonicalPatterns when creating or editing Ardia templates.',
    'If the user asks for broad design changes, reinterpret the request inside Ardia quiet-minimalist language unless they explicitly ask to replace the organization design system.',
  ].join(' '),
}
