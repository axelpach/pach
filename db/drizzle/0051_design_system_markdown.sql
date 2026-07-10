ALTER TABLE "design_systems"
ADD COLUMN IF NOT EXISTS "markdown" text DEFAULT '' NOT NULL;
--> statement-breakpoint

UPDATE "design_systems"
SET
  "markdown" = trim($markdown$
# Ardia Design System

## Direction

Quiet Minimalist. Use whitespace, low visual noise, thin hairlines, and one restrained vermilion accent. The work should feel precise, calm, premium, and operational.

## Typography

- Use Inter Tight for primary UI and slide titles.
- Use light display weights for large titles.
- Use Instrument Serif italic only as a short accent phrase, word, or quote.
- Use Geist Mono for metadata, labels, timestamps, small identifiers, and technical details.
- Avoid heavy font weights, dense all-caps paragraphs, and full serif headlines.

## Color

- Background: near black / warm charcoal.
- Text: warm off-white and muted warm gray.
- Accent: Ardia vermilion, used sparingly.
- Structure: 1px hairlines and transparency before filled panels.
- Avoid purple or blue gradients, neon glass, heavy red backgrounds, and generic SaaS glow.

## Layout

- Prefer airy slide compositions with a strong title zone, concise body copy, and a calm data/product surface.
- Use top brand row, small metadata, hairline separators, and a footer when appropriate.
- Keep modules transparent or lightly framed.
- Use dashboards, KPIs, charts, WhatsApp/payment flows, or operational tables as quiet evidence surfaces.

## Logo And Assets

- Use the real Ardia mark or approved uploaded assets.
- Do not invent placeholder square logos.
- If an asset is needed and unavailable, say so instead of faking it.

## Deck Guidance

- Build real fixed-size slide components.
- Export one component per slide and `export const slides = [...]`.
- Respect the requested aspect ratio, dimensions, and slide count.
- Keep copy in Spanish for Ardia-facing material.
$markdown$),
  "metadata" = CASE
    WHEN "metadata" ? 'isDefault' THEN "metadata"
    ELSE COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('isDefault', true)
  END
WHERE "slug" = 'ardia'
  AND COALESCE(NULLIF(trim("markdown"), ''), '') = '';
--> statement-breakpoint

ALTER TABLE "design_template_runs"
ADD COLUMN IF NOT EXISTS "design_system_id" uuid REFERENCES "design_systems"("id");
--> statement-breakpoint

ALTER TABLE "design_template_runs"
ADD COLUMN IF NOT EXISTS "output_spec" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "design_template_runs_design_system_idx"
ON "design_template_runs" ("design_system_id");
