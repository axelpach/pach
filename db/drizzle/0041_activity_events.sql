CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event_type" text NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" text,
  "subject_label" text,
  "actor_type" text DEFAULT 'system' NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "source" text DEFAULT 'pach_app' NOT NULL,
  "severity" text DEFAULT 'info' NOT NULL,
  "summary" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "activity_events_organization_occurred_at_idx"
  ON "activity_events" ("organization_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "activity_events_organization_event_type_idx"
  ON "activity_events" ("organization_id", "event_type");
CREATE INDEX IF NOT EXISTS "activity_events_organization_subject_type_idx"
  ON "activity_events" ("organization_id", "subject_type");
CREATE INDEX IF NOT EXISTS "activity_events_organization_actor_name_idx"
  ON "activity_events" ("organization_id", "actor_name");
CREATE INDEX IF NOT EXISTS "activity_events_organization_source_idx"
  ON "activity_events" ("organization_id", "source");
CREATE INDEX IF NOT EXISTS "activity_events_organization_severity_idx"
  ON "activity_events" ("organization_id", "severity");

INSERT INTO "activity_events" (
  "id",
  "organization_id",
  "occurred_at",
  "created_at",
  "event_type",
  "subject_type",
  "subject_id",
  "subject_label",
  "actor_type",
  "actor_id",
  "actor_name",
  "source",
  "severity",
  "summary",
  "details",
  "metadata"
)
SELECT
  pia."id",
  coalesce(
    issue."context_company_id",
    (SELECT "id" FROM "organizations" WHERE "project" = 'pach' ORDER BY "created_at" ASC LIMIT 1),
    (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
  ) AS "organization_id",
  pia."created_at" AS "occurred_at",
  pia."created_at",
  pia."type" AS "event_type",
  'pm_issue' AS "subject_type",
  pia."issue_id"::text AS "subject_id",
  issue."identifier" AS "subject_label",
  CASE
    WHEN pia."actor_id" IS NOT NULL THEN 'user'
    WHEN pia."actor_name" ILIKE '%agent%' THEN 'agent'
    ELSE 'system'
  END AS "actor_type",
  pia."actor_id"::text AS "actor_id",
  pia."actor_name",
  coalesce(pia."metadata" ->> 'source', 'pm_issue_activity') AS "source",
  CASE
    WHEN pia."type" = 'agent_run_failed' THEN 'error'
    WHEN pia."metadata" ->> 'level' = 'error' THEN 'error'
    WHEN pia."metadata" ->> 'level' = 'warn' THEN 'warning'
    WHEN pia."metadata" ->> 'level' = 'warning' THEN 'warning'
    WHEN pia."metadata" ->> 'level' = 'debug' THEN 'debug'
    ELSE 'info'
  END AS "severity",
  pia."summary",
  '{}'::jsonb AS "details",
  coalesce(pia."metadata", '{}'::jsonb) || jsonb_build_object('legacyIssueActivityId', pia."id")
FROM "pm_issue_activity" pia
JOIN "pm_issues" issue ON issue."id" = pia."issue_id"
WHERE coalesce(
  issue."context_company_id",
  (SELECT "id" FROM "organizations" WHERE "project" = 'pach' ORDER BY "created_at" ASC LIMIT 1),
  (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
) IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

CREATE OR REPLACE FUNCTION mirror_pm_issue_activity_to_activity_events()
RETURNS trigger AS $$
DECLARE
  target_organization_id uuid;
  target_issue_identifier text;
BEGIN
  SELECT
    coalesce(
      issue."context_company_id",
      (SELECT "id" FROM "organizations" WHERE "project" = 'pach' ORDER BY "created_at" ASC LIMIT 1),
      (SELECT "id" FROM "organizations" ORDER BY "created_at" ASC LIMIT 1)
    ),
    issue."identifier"
  INTO target_organization_id, target_issue_identifier
  FROM "pm_issues" issue
  WHERE issue."id" = NEW."issue_id";

  IF target_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO "activity_events" (
    "id",
    "organization_id",
    "occurred_at",
    "created_at",
    "event_type",
    "subject_type",
    "subject_id",
    "subject_label",
    "actor_type",
    "actor_id",
    "actor_name",
    "source",
    "severity",
    "summary",
    "details",
    "metadata"
  )
  VALUES (
    NEW."id",
    target_organization_id,
    NEW."created_at",
    NEW."created_at",
    NEW."type",
    'pm_issue',
    NEW."issue_id"::text,
    target_issue_identifier,
    CASE
      WHEN NEW."actor_id" IS NOT NULL THEN 'user'
      WHEN NEW."actor_name" ILIKE '%agent%' THEN 'agent'
      ELSE 'system'
    END,
    NEW."actor_id"::text,
    NEW."actor_name",
    coalesce(NEW."metadata" ->> 'source', 'pm_issue_activity'),
    CASE
      WHEN NEW."type" = 'agent_run_failed' THEN 'error'
      WHEN NEW."metadata" ->> 'level' = 'error' THEN 'error'
      WHEN NEW."metadata" ->> 'level' = 'warn' THEN 'warning'
      WHEN NEW."metadata" ->> 'level' = 'warning' THEN 'warning'
      WHEN NEW."metadata" ->> 'level' = 'debug' THEN 'debug'
      ELSE 'info'
    END,
    NEW."summary",
    '{}'::jsonb,
    coalesce(NEW."metadata", '{}'::jsonb) || jsonb_build_object('legacyIssueActivityId', NEW."id")
  )
  ON CONFLICT ("id") DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "pm_issue_activity_mirror_activity_events" ON "pm_issue_activity";
CREATE TRIGGER "pm_issue_activity_mirror_activity_events"
AFTER INSERT ON "pm_issue_activity"
FOR EACH ROW
EXECUTE FUNCTION mirror_pm_issue_activity_to_activity_events();
