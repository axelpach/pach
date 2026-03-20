# Pachi — The Machine That Builds the Machine

## Overview

Pachi is a personal operations platform that uses AI agents and tools to automate business activities (sales, ops, marketing, product) across multiple projects. It starts local-first with Claude Code as the agent runner, with architecture ready for cloud deployment.

## Project Structure

```
pachi/
├── portal/                      # Web UI (Vite + React 19 + Tailwind)
├── tools/
│   └── decks/
│       ├── assets/              # Shared assets (logos, icons) used across decks
│       ├── engine/              # Shared deck rendering + export
│       │   ├── primitives/      # Reusable slide components
│       │   ├── themes/          # Color themes (dark, light, neutral)
│       │   ├── export.ts        # PNG + PDF export (html-to-image + jsPDF)
│       │   ├── SlideRenderer.tsx # Preview + download UI wrapper
│       │   └── types.ts         # DeckConfig, Theme, SlideProps
│       └── library/             # Generated decks (one folder per deck)
├── projects/                    # Project contexts (NOT source code)
│   └── ardia/
│       └── context.md           # Value prop, ICP, pain points, brand, tone
├── db/                          # Postgres via Drizzle ORM
├── pachi.config.ts              # Project registry + global config
└── docker-compose.yml           # Postgres 16 on port 5433
```

## Commands

```bash
pnpm dev              # Start portal on localhost:5174
pnpm docker:up        # Start Postgres
pnpm docker:down      # Stop Postgres
pnpm db:generate      # Generate Drizzle migration
pnpm db:migrate       # Apply migrations
```

## Creating a New Deck

### Step 1: Gather context

1. **Read project context:** `projects/{project}/context.md` for brand, tone, ICP, and value props
2. **Read the project's actual codebase** for deeper context. Check `pachi.config.ts` for the project's `local` path, then go read relevant files from that codebase. For example, for Ardia:
   - Marketing content & copy: `~/Desktop/Developer/ardia/apps/buyers-ardia/app/marketing/` (existing decks, messaging, mockups)
   - Buyer portal UI: `~/Desktop/Developer/ardia/apps/buyers-ardia/app/portal/` (to understand product features for slides)
   - Developer portal components: `~/Desktop/Developer/ardia/apps/developers-ardia/src/components/` (for product screenshots/mockup inspiration)
   - CLAUDE.md: `~/Desktop/Developer/ardia/CLAUDE.md` (full product documentation, domain language, feature details)
3. **Read deck engine:** `tools/decks/engine/primitives/index.tsx` for available slide components
4. **Reference existing decks:** e.g. `tools/decks/library/ardia-one-pager/` for structure and patterns

### Step 2: Create deck folder

```
tools/decks/library/{project}-{deck-name}/
├── deck.ts              # Config: title, project, theme, dimensions, slides array, ctaLinks
├── assets/              # Deck-specific assets (client logos, custom images)
│   └── client-logo.png
└── slides/
    ├── 01-cover.tsx
    ├── 02-problem.tsx
    ├── 03-solution.tsx
    └── ...
```

### Step 3: Write slides

Each slide is a React component that receives `{ width, height, theme }` props:

```tsx
import { SlideWrapper, BackgroundGlow, SlideFooter } from '../../../engine/primitives'
import type { Theme } from '../../../engine/types'

export function MySlideName({ width, height, theme }: { width: number; height: number; theme: Theme }) {
  return (
    <SlideWrapper width={width} height={height} theme={theme}>
      <BackgroundGlow theme={theme} />
      {/* Slide content */}
      <SlideFooter theme={theme} pageNum={1} totalPages={3} label="ardia.mx" />
    </SlideWrapper>
  )
}
```

**Available primitives:** `TitleSlide`, `BulletsSlide`, `MetricsSlide`, `CTASlide`, `ContentSlide`, `SlideWrapper`, `BackgroundGlow`, `SlideFooter`

**Available themes:** `dark` (default, dark bg + red accent), `light`, `neutral` (indigo accent)

**Standard dimensions:** 1080 x 1528 (A4 portrait), 1080 x 1920 (mobile vertical), 1920 x 1080 (landscape)

For custom slides with mockups or complex layouts, use `ContentSlide` or `SlideWrapper` directly and build freeform content inside.

### Images & Assets

**Shared assets** (reused across decks) go in `tools/decks/assets/`:
- `ardia-iso.png` — Ardia isotype logo (white, for dark backgrounds)
- `ardia-iso-black-bg.png` — Ardia isotype on black background

**Deck-specific assets** (client logos, custom images) go in the deck's own `assets/` folder.

Import images as ES modules — Vite handles bundling and `html-to-image` captures them correctly in exports:

```tsx
// Shared asset
import ardiaLogo from '../../../assets/ardia-iso.png'
// Deck-specific asset
import clientLogo from '../assets/client-logo.png'

<img src={ardiaLogo} alt="Ardia" width={36} height={36} />
```

### Step 4: Create deck.ts

```tsx
import type { Theme } from '../../engine/types'
import { CoverSlide } from './slides/01-cover'
// ... import other slides

export const config = {
  title: 'Deck Title',
  project: 'ardia',
  description: 'Short description',
  theme: 'dark',
  dimensions: { width: 1080, height: 1528 },
  ctaLinks: [
    { selector: '[data-cta="true"]', url: 'https://calendly.com/axel-ardia/15-min-ardia-demo', page: 2 },
  ],
}

export const slides: React.ComponentType<{ width: number; height: number; theme: Theme }>[] = [
  CoverSlide,
  // ... other slides
]
```

### Step 5: Register in portal

1. **DeckViewer.tsx** (`portal/src/pages/DeckViewer.tsx`): Add import and registry entry
2. **Decks.tsx** (`portal/src/pages/Decks.tsx`): Add entry to the `decks` array

## Key Patterns

- **Decks are code** — React components stored in `tools/decks/library/`, rendered in the browser, exported as PDF/PNG via `html-to-image` + `jsPDF`
- **Projects have context + code access** — `projects/ardia/context.md` has high-level context (playbook, ICP, tone). For deeper detail, read the actual codebase via the `local` path in `pachi.config.ts` (e.g. `~/Desktop/Developer/ardia/`). Always check context.md first, then dive into the codebase for specifics like copy, UI patterns, feature details, or mockup inspiration
- **Themes are reusable** — use `theme.accent`, `theme.textPrimary`, `theme.cardBg` etc. instead of hardcoding colors, so decks can be re-themed for different projects
- **Primitives are building blocks** — use them for standard layouts, drop down to `ContentSlide`/`SlideWrapper` for custom ones

## Naming Conventions

- Deck folders: `{project}-{descriptive-name}` (e.g. `ardia-constructora-xyz`, `ardia-investor-pitch`)
- Slide files: `NN-name.tsx` zero-padded (e.g. `01-cover.tsx`, `02-problem.tsx`)
- Components: PascalCase exports (e.g. `CoverSlide`, `FeaturesSlide`)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Portal | Vite + React 19 + React Router 7 + Tailwind |
| DB | PostgreSQL 16 + Drizzle ORM |
| Deck export | html-to-image + jsPDF |
| Icons | Lucide React |
| Package manager | pnpm |

## Spanish Domain Language (Ardia)

When creating Ardia decks, use Spanish for all user-facing content:
- Cobranza = Collections
- Desarrollo inmobiliario = Real estate development
- Unidades = Units
- Esquemas de pago = Payment schemes
- Compradores = Buyers
- Apartado = Reservation deposit
- Anticipo = Down payment
