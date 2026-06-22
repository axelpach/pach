WITH brand_orgs AS (
  SELECT id
  FROM organizations
  WHERE project IN ('ardia', 'ardia-mkt')
)
INSERT INTO design_systems (organization_id, name, slug, tokens, assets, metadata)
SELECT
  id,
  'Ardia Quiet Minimalist',
  'ardia',
  $tokens$
  {
    "source": "ardia-quiet-minimalist",
    "defaultMode": "dark",
    "colors": {
      "accent": "#E43F3F",
      "accentDeep": "#8B1E1E",
      "accentSoft": "#F2A09F",
      "accentGlow": "rgba(228, 63, 63, 0.18)",
      "bg": "#14110f",
      "surface": "#1a1614",
      "surface2": "#1e1a17",
      "fg": "#ede6db",
      "fg2": "rgba(237, 230, 219, 0.78)",
      "fgDim": "rgba(237, 230, 219, 0.42)",
      "fgDim2": "rgba(237, 230, 219, 0.24)",
      "hairline": "rgba(237, 230, 219, 0.10)",
      "hairline2": "rgba(237, 230, 219, 0.06)",
      "success": "#6fbf7f",
      "successDeep": "#3a8c4f",
      "warn": "#d4a648",
      "orange": "#c47a3f",
      "blue": "#5587b5"
    },
    "modes": {
      "dark": {
        "colors": {
          "bg": "#14110f",
          "surface": "#1a1614",
          "surface2": "#1e1a17",
          "fg": "#ede6db",
          "fg2": "rgba(237, 230, 219, 0.78)",
          "fgDim": "rgba(237, 230, 219, 0.42)",
          "fgDim2": "rgba(237, 230, 219, 0.24)",
          "hairline": "rgba(237, 230, 219, 0.10)",
          "hairline2": "rgba(237, 230, 219, 0.06)"
        },
        "email": {
          "bodyBg": "#14110f",
          "containerBg": "#14110f",
          "containerBorder": "rgba(237, 230, 219, 0.10)",
          "surface": "#1a1614",
          "text": "#ede6db",
          "textMuted": "rgba(237, 230, 219, 0.42)",
          "textSoft": "rgba(237, 230, 219, 0.78)",
          "hairline": "rgba(237, 230, 219, 0.10)",
          "hairlineStrong": "rgba(237, 230, 219, 0.16)",
          "accent": "#E43F3F",
          "buttonBg": "#E43F3F",
          "buttonText": "#ffffff",
          "codeBg": "#0f0d0b"
        }
      },
      "light": {
        "colors": {
          "bg": "#ffffff",
          "surface": "#fafafa",
          "surface2": "#f4f4f4",
          "fg": "#1a1612",
          "fg2": "rgba(26, 22, 18, 0.72)",
          "fgDim": "rgba(26, 22, 18, 0.45)",
          "fgDim2": "rgba(26, 22, 18, 0.28)",
          "hairline": "rgba(30, 22, 16, 0.06)",
          "hairline2": "rgba(30, 22, 16, 0.12)"
        },
        "email": {
          "bodyBg": "#ffffff",
          "containerBg": "#ffffff",
          "containerBorder": "rgba(30, 22, 16, 0.12)",
          "surface": "#ffffff",
          "text": "#1a1612",
          "textMuted": "rgba(26, 22, 18, 0.45)",
          "textSoft": "rgba(26, 22, 18, 0.72)",
          "hairline": "rgba(30, 22, 16, 0.06)",
          "hairlineStrong": "rgba(30, 22, 16, 0.12)",
          "accent": "#E43F3F",
          "buttonBg": "#E43F3F",
          "buttonText": "#ffffff",
          "codeBg": "#f5f0e8"
        }
      }
    },
    "typography": {
      "sans": "Inter Tight, ui-sans-serif, system-ui, sans-serif",
      "serif": "Instrument Serif, Newsreader, Georgia, serif",
      "mono": "Geist Mono, ui-monospace, Menlo, monospace",
      "displayWeight": 200,
      "bodyWeight": 300,
      "labelLetterSpacing": "0.18em"
    },
    "spacing": {
      "base": 4,
      "pageGutterDesktop": 40,
      "pageGutterMobile": 20,
      "contentMaxWidth": 1280
    }
  }
  $tokens$::jsonb,
  $assets$
  {
    "logos": {
      "markLight": "https://www.ardia.mx/ardia-iso-light.png",
      "markDark": "https://www.ardia.mx/ardia-iso-dark.png",
      "wordmarkTransactional": "https://ardia.s3.us-east-1.amazonaws.com/Component+17.svg"
    },
    "brandUrl": "https://www.ardia.mx"
  }
  $assets$::jsonb,
  $metadata$
  {
    "sourceFiles": [
      "../ardia/packages/design-system/styles/tokens.css",
      "../ardia/apps/buyers-ardia/DESIGN_SYSTEM.md"
    ],
    "direction": "Quiet Minimalist",
    "email": {
      "defaultMode": "light",
      "availableModes": ["dark", "light"],
      "wrapperSchemaVersion": 1
    }
  }
  $metadata$::jsonb
FROM brand_orgs
ON CONFLICT (organization_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  tokens = EXCLUDED.tokens,
  assets = EXCLUDED.assets,
  metadata = EXCLUDED.metadata,
  updated_at = now();

WITH brand_orgs AS (
  SELECT id
  FROM organizations
  WHERE project IN ('ardia', 'ardia-mkt')
),
defaults AS (
  SELECT
    jsonb_build_object(
      'header', 'Ardia',
      'headerLogo', jsonb_build_object(
        'enabled', true,
        'source', 'designSystem',
        'darkModeAssetKey', 'logos.wordmarkTransactional',
        'lightModeAssetKey', 'logos.wordmarkTransactional',
        'alt', 'Ardia'
      ),
      'beforeContent', '',
      'footer', 'Ardia · Infraestructura de cobranza, conciliación y seguimiento para desarrolladoras inmobiliarias en México.',
      'cta', jsonb_build_object(
        'label', 'Conversar',
        'url', 'https://www.ardia.mx/#contacto'
      )
    ) AS wrapper
)
UPDATE mkt_publications p
SET
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(p.metadata, '{}'::jsonb),
      '{emailThemeMode}',
      COALESCE(p.metadata->'emailThemeMode', '"light"'::jsonb),
      true
    ),
    '{emailWrapper}',
    COALESCE(
      p.metadata->'emailWrapper',
      CASE
        WHEN p.metadata ? 'emailBlocks' THEN jsonb_build_object(
          'header', COALESCE(p.metadata #>> '{emailBlocks,header}', 'Ardia'),
          'headerLogo', jsonb_build_object(
            'enabled', true,
            'source', 'designSystem',
            'darkModeAssetKey', 'logos.wordmarkTransactional',
            'lightModeAssetKey', 'logos.wordmarkTransactional',
            'alt', 'Ardia'
          ),
          'beforeContent', '',
          'footer', COALESCE(p.metadata #>> '{emailBlocks,footer}', 'Ardia · Infraestructura de cobranza, conciliación y seguimiento para desarrolladoras inmobiliarias en México.'),
          'cta', jsonb_build_object(
            'label', COALESCE(p.metadata #>> '{emailBlocks,cta,label}', 'Conversar'),
            'url', COALESCE(p.metadata #>> '{emailBlocks,cta,url}', 'https://www.ardia.mx/#contacto')
          )
        )
        ELSE defaults.wrapper
      END
    ),
    true
  ),
  updated_at = now()
FROM brand_orgs, defaults
WHERE p.organization_id = brand_orgs.id
  AND p.type = 'newsletter';
