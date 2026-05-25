-- Agent worker/runtime foundation plus first-class GitHub correlation.

CREATE TABLE IF NOT EXISTS "agent_workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'hetzner' NOT NULL,
	"provider_server_id" text,
	"hostname" text,
	"ssh_host" text NOT NULL,
	"ssh_port" integer DEFAULT 22 NOT NULL,
	"ssh_user" text DEFAULT 'pach' NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"status_message" text,
	"last_seen_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_workers" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_key" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"local_path_template" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_repositories_full_name_unique" UNIQUE("full_name")
);

ALTER TABLE "github_repositories" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL REFERENCES "pm_issues"("id"),
	"worker_id" uuid REFERENCES "agent_workers"("id"),
	"repository_id" uuid REFERENCES "github_repositories"("id"),
	"project_key" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"branch_name" text NOT NULL,
	"workspace_path" text,
	"tmux_session" text,
	"agent_kind" text DEFAULT 'codex' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"status_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_runs" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "agent_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL REFERENCES "agent_runs"("id"),
	"name" text NOT NULL,
	"role" text DEFAULT 'custom' NOT NULL,
	"tmux_window" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"last_title" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_terminals" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "github_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL REFERENCES "github_repositories"("id"),
	"agent_run_id" uuid REFERENCES "agent_runs"("id"),
	"issue_id" uuid REFERENCES "pm_issues"("id"),
	"name" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"last_commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "github_branches" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "github_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL REFERENCES "github_repositories"("id"),
	"branch_id" uuid REFERENCES "github_branches"("id"),
	"agent_run_id" uuid REFERENCES "agent_runs"("id"),
	"issue_id" uuid REFERENCES "pm_issues"("id"),
	"github_id" text,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"mergeable" boolean,
	"head_sha" text,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"checks_status" text DEFAULT 'unknown' NOT NULL,
	"checks_url" text,
	"github_created_at" timestamp with time zone,
	"github_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "github_pull_requests" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "github_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"action" text,
	"repository_full_name" text,
	"github_object_id" text,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_webhook_events_delivery_id_unique" UNIQUE("delivery_id")
);

ALTER TABLE "github_webhook_events" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "agent_runs_issue_id_idx" ON "agent_runs" ("issue_id");
CREATE INDEX IF NOT EXISTS "agent_runs_worker_id_idx" ON "agent_runs" ("worker_id");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_branch_name_idx" ON "agent_runs" ("branch_name");
CREATE INDEX IF NOT EXISTS "agent_terminals_run_id_idx" ON "agent_terminals" ("run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "github_branches_repo_name_idx" ON "github_branches" ("repository_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "github_pull_requests_repo_number_idx" ON "github_pull_requests" ("repository_id", "number");
CREATE INDEX IF NOT EXISTS "github_pull_requests_issue_id_idx" ON "github_pull_requests" ("issue_id");
CREATE INDEX IF NOT EXISTS "github_webhook_events_repo_idx" ON "github_webhook_events" ("repository_full_name");
