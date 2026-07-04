ALTER TABLE "agent_conversations"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "agent_runs"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "agent_messages"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "agent_run_input_media"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "agent_terminals"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "agent_run_progress_reports"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "agent_run_artifacts"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "github_branches"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "github_pull_requests"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

UPDATE "agent_conversations" c
SET "organization_id" = i."context_company_id"
FROM "pm_issues" i
WHERE c."issue_id" = i."id"
  AND c."organization_id" IS NULL
  AND i."context_company_id" IS NOT NULL;

UPDATE "agent_runs" r
SET "organization_id" = i."context_company_id"
FROM "pm_issues" i
WHERE r."issue_id" = i."id"
  AND r."organization_id" IS NULL
  AND i."context_company_id" IS NOT NULL;

UPDATE "agent_messages" m
SET "organization_id" = c."organization_id"
FROM "agent_conversations" c
WHERE m."conversation_id" = c."id"
  AND m."organization_id" IS NULL
  AND c."organization_id" IS NOT NULL;

UPDATE "agent_run_input_media" im
SET "organization_id" = r."organization_id"
FROM "agent_runs" r
WHERE im."run_id" = r."id"
  AND im."organization_id" IS NULL
  AND r."organization_id" IS NOT NULL;

UPDATE "agent_terminals" t
SET "organization_id" = r."organization_id"
FROM "agent_runs" r
WHERE t."run_id" = r."id"
  AND t."organization_id" IS NULL
  AND r."organization_id" IS NOT NULL;

UPDATE "agent_run_progress_reports" p
SET "organization_id" = r."organization_id"
FROM "agent_runs" r
WHERE p."run_id" = r."id"
  AND p."organization_id" IS NULL
  AND r."organization_id" IS NOT NULL;

UPDATE "agent_run_artifacts" a
SET "organization_id" = r."organization_id"
FROM "agent_runs" r
WHERE a."run_id" = r."id"
  AND a."organization_id" IS NULL
  AND r."organization_id" IS NOT NULL;

UPDATE "github_branches" b
SET "organization_id" = r."organization_id"
FROM "agent_runs" r
WHERE b."agent_run_id" = r."id"
  AND b."organization_id" IS NULL
  AND r."organization_id" IS NOT NULL;

UPDATE "github_pull_requests" pr
SET "organization_id" = r."organization_id"
FROM "agent_runs" r
WHERE pr."agent_run_id" = r."id"
  AND pr."organization_id" IS NULL
  AND r."organization_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "agent_conversations_organization_idx"
  ON "agent_conversations" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_runs_organization_idx"
  ON "agent_runs" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_messages_organization_idx"
  ON "agent_messages" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_run_input_media_organization_idx"
  ON "agent_run_input_media" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_terminals_organization_idx"
  ON "agent_terminals" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_run_progress_reports_organization_idx"
  ON "agent_run_progress_reports" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_run_artifacts_organization_idx"
  ON "agent_run_artifacts" ("organization_id");

CREATE INDEX IF NOT EXISTS "github_branches_organization_idx"
  ON "github_branches" ("organization_id");

CREATE INDEX IF NOT EXISTS "github_pull_requests_organization_idx"
  ON "github_pull_requests" ("organization_id");
