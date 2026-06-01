-- Store Playwright and agent-produced files against each issue run.

CREATE TABLE IF NOT EXISTS "agent_run_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL REFERENCES "agent_runs"("id"),
	"issue_id" uuid REFERENCES "pm_issues"("id"),
	"kind" text DEFAULT 'file' NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"storage_key" text,
	"remote_path" text,
	"mime_type" text,
	"size_bytes" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_run_artifacts" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "agent_run_artifacts_run_id_idx" ON "agent_run_artifacts" ("run_id");
CREATE INDEX IF NOT EXISTS "agent_run_artifacts_issue_id_idx" ON "agent_run_artifacts" ("issue_id");
