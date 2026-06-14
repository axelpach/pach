CREATE TABLE "agent_run_progress_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"issue_id" uuid,
	"worker_id" uuid,
	"phase" text,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"percent" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_run_progress_reports" ADD CONSTRAINT "agent_run_progress_reports_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_progress_reports" ADD CONSTRAINT "agent_run_progress_reports_issue_id_pm_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."pm_issues"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_progress_reports" ADD CONSTRAINT "agent_run_progress_reports_worker_id_agent_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."agent_workers"("id") ON DELETE no action ON UPDATE no action;
