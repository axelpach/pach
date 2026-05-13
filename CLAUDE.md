# Pach — The Machine That Builds the Machine

## Overview

Pach is a personal operations platform that uses AI agents and tools to automate business activities (sales, ops, marketing, product) across multiple projects. It starts local-first with Claude Code as the agent runner, with architecture ready for cloud deployment.

## Project Structure

```
pach/
├── portal/                      # Web UI (Vite + React 19 + Tailwind + Zero)
├── server/                      # Backend API (Express + TypeScript)
│   ├── src/
│   │   ├── app.ts               # Express app, port 3002
│   │   ├── db.ts                # Drizzle DB connection
│   │   └── zero/
│   │       ├── push-route.ts    # POST /zero/push — mutation endpoint
│   │       └── mutators.ts      # Server-side CRM mutators
│   ├── schema.ts                # Zero schema (server copy, keep in sync with portal)
│   └── drizzle-zero.config.ts   # Schema generation config
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
├── db/                          # Drizzle schema (shared between server + portal)
│   ├── schema.ts                # Source of truth for all tables
│   └── drizzle/                 # Generated migrations
├── pach.config.ts               # Project registry + global config
└── docker-compose.yml           # Postgres 16 on port 5435
```

## Commands

```bash
# Full stack startup (run in separate terminals)
pnpm docker:up        # Start Postgres (port 5435)
pnpm dev:server       # Start Express API (port 3002)
pnpm dev:zero         # Start Zero cache server (port 4850)
pnpm dev              # Start portal (port 5174)

# Database
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:migrate       # Apply pending migrations
pnpm db:studio        # Open Drizzle Studio UI
pnpm docker:down      # Stop Postgres
```

## Database

- **Postgres 16** on `localhost:5435` (different from Ardia on 5433)
- **Connection string:** `postgres://pach:pach@localhost:5435/pach`
- **Drizzle ORM** for migrations + schema
- **Logical replication** enabled for Zero sync

### Pach Tables

| Table | Purpose |
|-------|---------|
| `companies` | Own companies/ventures (Ardia, etc.) — RFC, razón social, legal docs |
| `decks` | Deck metadata (for future portal listing from DB) |

### CRM Tables

| Table | Purpose |
|-------|---------|
| `crm_companies` | Prospect/client companies in the pipeline |
| `crm_contacts` | People at prospect/client companies |
| `crm_deals` | Pipeline deals with stages |
| `crm_notes` | Notes on deals/contacts (manual, call, email, whatsapp) |

### Deal Stages

`prospecto` → `contactado` → `propuesta` → `negociacion` → `cerrado_ganado` / `cerrado_perdido`

## Real-time Data (Rocicorp Zero)

Zero provides instant sync between Postgres and the portal UI.

### Architecture

```
Portal (React)  ←──  Zero cache (port 4850)  ←──  Postgres (port 5435)
       │                                                ↑
       └── mutations → POST /zero/push (port 3002) ────┘
```

### Zero Schema

Defined in two places (keep in sync):
- **Portal:** `portal/src/zero-schema.ts` — used by `ZeroProvider` + `useQuery`
- **Server:** `server/schema.ts` — used by `PushProcessor`

Column type mapping (Postgres → Zero):
- `uuid` → `string()`
- `text` → `string()`
- `timestamp` → `number()` (milliseconds via `Date.now()`)
- `integer` → `number()`
- `nullable` → `.optional()`
- snake_case columns → `.from('snake_case')`

### Mutators

Defined in two places (keep in sync):
- **Portal:** `portal/src/mutators/index.ts` — optimistic client-side mutations
- **Server:** `server/src/zero/mutators.ts` — authoritative server-side mutations

Pattern:
```typescript
const z = useZero<Schema, Mutators>()
// Create
z.mutate.deals.create({ id: crypto.randomUUID(), title: 'New deal', companyId: '...' })
// Update
z.mutate.deals.update({ id: '...', stage: 'propuesta' })
// Delete
z.mutate.deals.delete({ id: '...' })
```

### Querying Data

```typescript
import { useZero } from '@rocicorp/zero/react'
import { useQuery } from '@rocicorp/zero/react'
import type { Schema } from './zero-schema'
import type { Mutators } from './mutators'

const z = useZero<Schema, Mutators>()
const [deals] = useQuery(z.query.deals.where('stage', 'propuesta'))
const [companies] = useQuery(z.query.companies.orderBy('name', 'asc'))
```

### Adding a New Table

1. Add table to `db/schema.ts` (Drizzle)
2. Run `pnpm db:generate` + `pnpm db:migrate`
3. Add table to `portal/src/zero-schema.ts` (Zero DSL)
4. Add table to `server/schema.ts` (Zero DSL, same as portal)
5. Add mutators to both `portal/src/mutators/index.ts` and `server/src/zero/mutators.ts`
6. Restart Zero dev server

## Creating a New Deck

### Step 1: Gather context

1. **Read project context:** `projects/{project}/context.md` for brand, tone, ICP, and value props
2. **Read the project's actual codebase** for deeper context. Check `pach.config.ts` for the project's `local` path, then go read relevant files from that codebase. For example, for Ardia:
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
- **Projects have context + code access** — `projects/ardia/context.md` has high-level context (playbook, ICP, tone). For deeper detail, read the actual codebase via the `local` path in `pach.config.ts` (e.g. `~/Desktop/Developer/ardia/`). Always check context.md first, then dive into the codebase for specifics like copy, UI patterns, feature details, or mockup inspiration
- **Themes are reusable** — use `theme.accent`, `theme.textPrimary`, `theme.cardBg` etc. instead of hardcoding colors, so decks can be re-themed for different projects
- **Primitives are building blocks** — use them for standard layouts, drop down to `ContentSlide`/`SlideWrapper` for custom ones
- **Zero for reads, REST for operations** — Use Zero sync for data displayed in the portal (CRM, content). Keep heavy one-off operations (imports, PDF export, integrations) as plain server routes.

## Naming Conventions

- Deck folders: `{project}-{descriptive-name}` (e.g. `ardia-constructora-xyz`, `ardia-investor-pitch`)
- Slide files: `NN-name.tsx` zero-padded (e.g. `01-cover.tsx`, `02-problem.tsx`)
- Components: PascalCase exports (e.g. `CoverSlide`, `FeaturesSlide`)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Portal | Vite + React 19 + React Router 7 + Tailwind |
| Server | Express + TypeScript |
| Real-time sync | Rocicorp Zero |
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
