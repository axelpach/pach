-- Linear-style issue tracking foundation for Pach.

CREATE TABLE IF NOT EXISTS "pm_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"position" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_teams" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"team_id" uuid REFERENCES "pm_teams"("id"),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"status" text NOT NULL DEFAULT 'active',
	"target_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_projects" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"team_id" uuid NOT NULL REFERENCES "pm_teams"("id"),
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL DEFAULT 'unstarted',
	"description" text,
	"color" text,
	"position" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_statuses" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"team_id" uuid REFERENCES "pm_teams"("id"),
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_labels" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"team_id" uuid NOT NULL REFERENCES "pm_teams"("id"),
	"project_id" uuid REFERENCES "pm_projects"("id"),
	"status_id" uuid NOT NULL REFERENCES "pm_statuses"("id"),
	"assignee_id" uuid REFERENCES "users"("id"),
	"creator_id" uuid REFERENCES "users"("id"),
	"identifier" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" integer NOT NULL DEFAULT 0,
	"estimate" integer,
	"sort_order" integer NOT NULL DEFAULT 0,
	"due_date" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"blocked_reason" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_issues" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_issue_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL REFERENCES "pm_issues"("id"),
	"label_id" uuid NOT NULL REFERENCES "pm_labels"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_issue_labels" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_issue_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL REFERENCES "pm_issues"("id"),
	"actor_id" uuid REFERENCES "users"("id"),
	"actor_name" text,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_issue_activity" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"team_id" uuid REFERENCES "pm_teams"("id"),
	"owner_id" uuid REFERENCES "users"("id"),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"scope" text NOT NULL DEFAULT 'personal',
	"filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"display" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"position" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_saved_views" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "pm_teams_company_idx" ON "pm_teams"("company_id");
CREATE INDEX IF NOT EXISTS "pm_projects_company_idx" ON "pm_projects"("company_id");
CREATE INDEX IF NOT EXISTS "pm_projects_team_idx" ON "pm_projects"("team_id");
CREATE INDEX IF NOT EXISTS "pm_statuses_team_idx" ON "pm_statuses"("team_id");
CREATE INDEX IF NOT EXISTS "pm_statuses_company_idx" ON "pm_statuses"("company_id");
CREATE INDEX IF NOT EXISTS "pm_labels_company_idx" ON "pm_labels"("company_id");
CREATE INDEX IF NOT EXISTS "pm_labels_team_idx" ON "pm_labels"("team_id");
CREATE INDEX IF NOT EXISTS "pm_issues_company_idx" ON "pm_issues"("company_id");
CREATE INDEX IF NOT EXISTS "pm_issues_team_idx" ON "pm_issues"("team_id");
CREATE INDEX IF NOT EXISTS "pm_issues_status_idx" ON "pm_issues"("status_id");
CREATE INDEX IF NOT EXISTS "pm_issues_project_idx" ON "pm_issues"("project_id");
CREATE INDEX IF NOT EXISTS "pm_issues_assignee_idx" ON "pm_issues"("assignee_id");
CREATE INDEX IF NOT EXISTS "pm_issues_last_activity_idx" ON "pm_issues"("last_activity_at");
CREATE INDEX IF NOT EXISTS "pm_issue_labels_issue_idx" ON "pm_issue_labels"("issue_id");
CREATE INDEX IF NOT EXISTS "pm_issue_labels_label_idx" ON "pm_issue_labels"("label_id");
CREATE INDEX IF NOT EXISTS "pm_issue_activity_issue_idx" ON "pm_issue_activity"("issue_id");
CREATE INDEX IF NOT EXISTS "pm_issue_activity_created_idx" ON "pm_issue_activity"("created_at");
CREATE INDEX IF NOT EXISTS "pm_saved_views_company_idx" ON "pm_saved_views"("company_id");
CREATE INDEX IF NOT EXISTS "pm_saved_views_team_idx" ON "pm_saved_views"("team_id");
CREATE INDEX IF NOT EXISTS "pm_saved_views_owner_idx" ON "pm_saved_views"("owner_id");
