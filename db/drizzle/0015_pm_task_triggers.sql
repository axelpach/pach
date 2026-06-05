CREATE TABLE IF NOT EXISTS "pm_task_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL DEFAULT 'recurring',
	"frequency" text,
	"timezone" text NOT NULL DEFAULT 'America/Mexico_City',
	"schedule" jsonb NOT NULL DEFAULT '{"kind":"recurring","frequency":"monthly","dayOfMonth":1,"time":"09:00"}'::jsonb,
	"enabled" boolean NOT NULL DEFAULT true,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"company_id" uuid REFERENCES "companies"("id"),
	"team_id" uuid NOT NULL REFERENCES "pm_teams"("id"),
	"project_id" uuid REFERENCES "pm_projects"("id"),
	"status_id" uuid NOT NULL REFERENCES "pm_statuses"("id"),
	"assignee_id" uuid REFERENCES "users"("id"),
	"creator_id" uuid REFERENCES "users"("id"),
	"title" text NOT NULL,
	"description" text,
	"priority" integer NOT NULL DEFAULT 2,
	"estimate" integer,
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_task_triggers" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "pm_task_trigger_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL REFERENCES "pm_task_triggers"("id"),
	"issue_id" uuid REFERENCES "pm_issues"("id"),
	"period_key" text NOT NULL,
	"status" text NOT NULL DEFAULT 'created',
	"message" text,
	"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pm_task_trigger_runs" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "pm_task_triggers_next_run_at_idx" ON "pm_task_triggers"("next_run_at");
CREATE INDEX IF NOT EXISTS "pm_task_triggers_enabled_next_run_at_idx" ON "pm_task_triggers"("enabled", "next_run_at");
CREATE INDEX IF NOT EXISTS "pm_task_trigger_runs_trigger_id_idx" ON "pm_task_trigger_runs"("trigger_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pm_task_trigger_runs_trigger_period_idx" ON "pm_task_trigger_runs"("trigger_id", "period_key");
