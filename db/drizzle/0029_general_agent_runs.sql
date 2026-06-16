ALTER TABLE "agent_runs" ALTER COLUMN "issue_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "subject_type" text DEFAULT 'issue' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "subject_id" uuid;
--> statement-breakpoint
UPDATE "agent_runs" SET "subject_type" = 'issue', "subject_id" = "issue_id" WHERE "subject_id" IS NULL AND "issue_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_subject_idx" ON "agent_runs" ("subject_type", "subject_id");
--> statement-breakpoint
ALTER TABLE "design_template_runs" ADD COLUMN IF NOT EXISTS "agent_run_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "design_template_runs" ADD CONSTRAINT "design_template_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_template_runs_agent_run_idx" ON "design_template_runs" ("agent_run_id");
