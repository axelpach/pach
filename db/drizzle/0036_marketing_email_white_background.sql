WITH brand_orgs AS (
  SELECT id
  FROM organizations
  WHERE project IN ('ardia', 'ardia-mkt')
)
UPDATE design_systems ds
SET
  tokens = jsonb_set(
    COALESCE(ds.tokens, '{}'::jsonb),
    '{modes,light,email,bodyBg}',
    '"#ffffff"'::jsonb,
    true
  ),
  updated_at = now()
FROM brand_orgs
WHERE ds.organization_id = brand_orgs.id
  AND ds.slug = 'ardia';
