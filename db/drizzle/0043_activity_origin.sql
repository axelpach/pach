DO $$
BEGIN
  CREATE TYPE "activity_origin" AS ENUM ('pach_work', 'organization_work');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "activity_events"
  ADD COLUMN IF NOT EXISTS "origin" "activity_origin" DEFAULT 'pach_work' NOT NULL;

UPDATE "activity_events"
SET "origin" = 'organization_work'
WHERE "subject_type" IN (
  'newsletter_subscriber',
  'ardia_contract',
  'ardia_payment',
  'ardia_quote',
  'ardia_invoice',
  'ardia_whatsapp_message',
  'ardia_bulk_charge_receipt_job',
  'ardia_reconciliation'
)
OR "source" IN (
  'ardia_api',
  'kapso_webhook',
  'meta_webhook',
  'facturapi',
  'stripe_webhook'
);

CREATE INDEX IF NOT EXISTS "activity_events_organization_origin_idx"
  ON "activity_events" ("organization_id", "origin");

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
    "activity_kind",
    "origin",
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
    CASE
      WHEN NEW."type" = 'completed' THEN 'progress'
      WHEN NEW."type" = 'agent_run_failed' THEN 'incident'
      WHEN NEW."metadata" ->> 'level' = 'error' THEN 'incident'
      ELSE 'operational'
    END,
    'pach_work',
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
