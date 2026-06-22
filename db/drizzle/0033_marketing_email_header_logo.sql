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
    COALESCE(p.metadata, '{}'::jsonb),
    '{emailWrapper,headerLogo}',
    COALESCE(p.metadata #> '{emailWrapper,headerLogo}', defaults.header_logo),
    true
  ),
  updated_at = now()
FROM brand_orgs, defaults
WHERE p.organization_id = brand_orgs.id
  AND p.type = 'newsletter';
