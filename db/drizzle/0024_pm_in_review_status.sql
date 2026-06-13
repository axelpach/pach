WITH desired_status AS (
  SELECT
    'in_review'::text AS key,
    'In Review'::text AS name,
    'review'::text AS type,
    '#38bdf8'::text AS color,
    3::integer AS position
)
INSERT INTO "pm_statuses" (
  "id",
  "company_id",
  "team_id",
  "name",
  "key",
  "type",
  "description",
  "color",
  "position",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  NULL,
  NULL,
  desired_status.name,
  desired_status.key,
  desired_status.type,
  'Workspace status',
  desired_status.color,
  desired_status.position,
  now(),
  now()
FROM desired_status
WHERE NOT EXISTS (
  SELECT 1
  FROM "pm_statuses"
  WHERE "pm_statuses"."team_id" IS NULL
    AND "pm_statuses"."key" = desired_status.key
);

WITH desired_status AS (
  SELECT
    'in_review'::text AS key,
    'In Review'::text AS name,
    'review'::text AS type,
    '#38bdf8'::text AS color,
    3::integer AS position
)
UPDATE "pm_statuses"
SET
  "company_id" = NULL,
  "team_id" = NULL,
  "name" = desired_status.name,
  "type" = desired_status.type,
  "color" = desired_status.color,
  "position" = desired_status.position,
  "updated_at" = now()
FROM desired_status
WHERE "pm_statuses"."team_id" IS NULL
  AND "pm_statuses"."key" = desired_status.key;
