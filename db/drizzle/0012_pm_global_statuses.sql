ALTER TABLE "pm_statuses" ALTER COLUMN "team_id" DROP NOT NULL;

WITH desired_statuses AS (
  SELECT * FROM (
    VALUES
      ('todo', 'Todo', 'unstarted', '#94a3b8', 0),
      ('in_progress', 'In Progress', 'started', '#fbbf24', 1),
      ('blocked', 'Blocked', 'blocked', '#f87171', 2),
      ('canceled', 'Canceled', 'canceled', '#6b7280', 3),
      ('done', 'Done', 'completed', '#4ade80', 4)
  ) AS t(key, name, type, color, position)
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
  desired_statuses.name,
  desired_statuses.key,
  desired_statuses.type,
  'Workspace status',
  desired_statuses.color,
  desired_statuses.position,
  now(),
  now()
FROM desired_statuses
WHERE NOT EXISTS (
  SELECT 1
  FROM "pm_statuses"
  WHERE "pm_statuses"."team_id" IS NULL
    AND "pm_statuses"."key" = desired_statuses.key
);

WITH desired_statuses AS (
  SELECT * FROM (
    VALUES
      ('todo', 'Todo', 'unstarted', '#94a3b8', 0),
      ('in_progress', 'In Progress', 'started', '#fbbf24', 1),
      ('blocked', 'Blocked', 'blocked', '#f87171', 2),
      ('canceled', 'Canceled', 'canceled', '#6b7280', 3),
      ('done', 'Done', 'completed', '#4ade80', 4)
  ) AS t(key, name, type, color, position)
)
UPDATE "pm_statuses"
SET
  "company_id" = NULL,
  "team_id" = NULL,
  "name" = desired_statuses.name,
  "type" = desired_statuses.type,
  "color" = desired_statuses.color,
  "position" = desired_statuses.position,
  "updated_at" = now()
FROM desired_statuses
WHERE "pm_statuses"."team_id" IS NULL
  AND "pm_statuses"."key" = desired_statuses.key;

WITH canonical_statuses AS (
  SELECT DISTINCT ON ("key")
    "id",
    "key"
  FROM "pm_statuses"
  WHERE "team_id" IS NULL
    AND "key" IN ('todo', 'in_progress', 'blocked', 'canceled', 'done')
  ORDER BY "key", "position" ASC, "created_at" ASC
),
status_mapping AS (
  SELECT
    source."id" AS source_id,
    CASE
      WHEN source."type" = 'blocked' OR lower(source."name") LIKE '%block%' THEN 'blocked'
      WHEN source."type" = 'completed' THEN 'done'
      WHEN source."type" = 'canceled' OR lower(source."name") LIKE '%cancel%' OR lower(source."name") LIKE '%duplicate%' THEN 'canceled'
      WHEN source."type" = 'started' THEN 'in_progress'
      ELSE 'todo'
    END AS target_key
  FROM "pm_statuses" source
)
UPDATE "pm_issues"
SET "status_id" = canonical_statuses."id"
FROM status_mapping
JOIN canonical_statuses
  ON canonical_statuses."key" = status_mapping.target_key
WHERE "pm_issues"."status_id" = status_mapping.source_id
  AND "pm_issues"."status_id" <> canonical_statuses."id";

WITH canonical_statuses AS (
  SELECT DISTINCT ON ("key")
    "id",
    "key"
  FROM "pm_statuses"
  WHERE "team_id" IS NULL
    AND "key" IN ('todo', 'in_progress', 'blocked', 'canceled', 'done')
  ORDER BY "key", "position" ASC, "created_at" ASC
)
DELETE FROM "pm_statuses" duplicate_status
USING canonical_statuses
WHERE duplicate_status."team_id" IS NULL
  AND duplicate_status."key" = canonical_statuses."key"
  AND duplicate_status."id" <> canonical_statuses."id";

DELETE FROM "pm_statuses"
WHERE "id" NOT IN (
  SELECT "id"
  FROM "pm_statuses"
  WHERE "team_id" IS NULL
    AND "key" IN ('todo', 'in_progress', 'blocked', 'canceled', 'done')
)
AND NOT EXISTS (
  SELECT 1
  FROM "pm_issues"
  WHERE "pm_issues"."status_id" = "pm_statuses"."id"
);
