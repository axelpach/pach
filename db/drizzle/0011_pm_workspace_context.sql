-- Shift project management tables toward a Pach-workspace model.
-- Company becomes optional issue context rather than workspace ownership.

ALTER TABLE "pm_teams"
  ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "pm_projects"
  ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "pm_statuses"
  ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "pm_labels"
  ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "pm_saved_views"
  ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "pm_issues"
  RENAME COLUMN "company_id" TO "context_company_id";

ALTER TABLE "pm_issues"
  ALTER COLUMN "context_company_id" DROP NOT NULL;

DROP INDEX IF EXISTS "pm_issues_company_idx";
CREATE INDEX IF NOT EXISTS "pm_issues_context_company_idx" ON "pm_issues"("context_company_id");
