WITH brand_orgs AS (
  SELECT id
  FROM organizations
  WHERE project IN ('ardia', 'ardia-mkt')
),
email_tokens AS (
  SELECT
    jsonb_build_object(
      'bodyBg', '#ffffff',
      'containerBg', '#ffffff',
      'containerBorder', 'rgba(30, 22, 16, 0.12)',
      'surface', '#ffffff',
      'text', '#1a1612',
      'textMuted', 'rgba(26, 22, 18, 0.45)',
      'textSoft', 'rgba(26, 22, 18, 0.72)',
      'hairline', 'rgba(30, 22, 16, 0.06)',
      'hairlineStrong', 'rgba(30, 22, 16, 0.12)',
      'accent', '#E43F3F',
      'buttonBg', '#E43F3F',
      'buttonText', '#ffffff',
      'codeBg', '#f5f0e8'
    ) AS light_email,
    jsonb_build_object(
      'bodyBg', '#14110f',
      'containerBg', '#14110f',
      'containerBorder', 'rgba(237, 230, 219, 0.10)',
      'surface', '#1a1614',
      'text', '#ede6db',
      'textMuted', 'rgba(237, 230, 219, 0.42)',
      'textSoft', 'rgba(237, 230, 219, 0.78)',
      'hairline', 'rgba(237, 230, 219, 0.10)',
      'hairlineStrong', 'rgba(237, 230, 219, 0.16)',
      'accent', '#E43F3F',
      'buttonBg', '#E43F3F',
      'buttonText', '#ffffff',
      'codeBg', '#0f0d0b'
    ) AS dark_email,
    jsonb_build_object(
      'sans', 'Inter Tight, ui-sans-serif, system-ui, sans-serif',
      'serif', 'Instrument Serif, Newsreader, Georgia, serif',
      'mono', 'Geist Mono, ui-monospace, Menlo, monospace'
    ) AS typography
)
UPDATE design_systems ds
SET
  tokens = jsonb_set(
    jsonb_set(
      COALESCE(ds.tokens, '{}'::jsonb),
      '{modes}',
      COALESCE(ds.tokens->'modes', '{}'::jsonb) || jsonb_build_object(
        'light',
        COALESCE(ds.tokens #> '{modes,light}', '{}'::jsonb) || jsonb_build_object('email', email_tokens.light_email),
        'dark',
        COALESCE(ds.tokens #> '{modes,dark}', '{}'::jsonb) || jsonb_build_object('email', email_tokens.dark_email)
      ),
      true
    ),
    '{typography}',
    COALESCE(ds.tokens->'typography', '{}'::jsonb) || email_tokens.typography,
    true
  ),
  assets = jsonb_set(
    COALESCE(ds.assets, '{}'::jsonb),
    '{logos}',
    COALESCE(ds.assets->'logos', '{}'::jsonb) || jsonb_build_object(
      'wordmarkTransactional', 'https://ardia.s3.us-east-1.amazonaws.com/Component+17.svg'
    ),
    true
  ),
  metadata = jsonb_set(
    COALESCE(ds.metadata, '{}'::jsonb),
    '{email}',
    COALESCE(ds.metadata->'email', '{}'::jsonb) || jsonb_build_object(
      'defaultMode', 'light',
      'availableModes', jsonb_build_array('dark', 'light'),
      'wrapperSchemaVersion', 1
    ),
    true
  ),
  updated_at = now()
FROM brand_orgs, email_tokens
WHERE ds.organization_id = brand_orgs.id
  AND ds.slug = 'ardia';

WITH brand_orgs AS (
  SELECT id
  FROM organizations
  WHERE project IN ('ardia', 'ardia-mkt')
),
defaults AS (
  SELECT jsonb_build_object(
    'enabled', true,
    'source', 'designSystem',
    'darkModeAssetKey', 'logos.wordmarkTransactional',
    'lightModeAssetKey', 'logos.wordmarkTransactional',
    'alt', 'Ardia'
  ) AS header_logo
)
UPDATE mkt_publications p
SET
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(p.metadata, '{}'::jsonb),
      '{emailThemeMode}',
      '"light"'::jsonb,
      true
    ),
    '{emailWrapper}',
    COALESCE(p.metadata->'emailWrapper', '{}'::jsonb) || jsonb_build_object(
      'header', 'Ardia',
      'headerLogo', defaults.header_logo
    ),
    true
  ),
  updated_at = now()
FROM brand_orgs, defaults
WHERE p.organization_id = brand_orgs.id
  AND p.type = 'newsletter';

WITH brand_orgs AS (
  SELECT id
  FROM organizations
  WHERE project IN ('ardia', 'ardia-mkt')
)
UPDATE mkt_distribution_runs r
SET
  metadata = jsonb_set(
    COALESCE(r.metadata, '{}'::jsonb),
    '{emailThemeMode}',
    '"light"'::jsonb,
    true
  ),
  updated_at = now()
FROM brand_orgs
WHERE r.organization_id = brand_orgs.id
  AND r.channel = 'newsletter';
