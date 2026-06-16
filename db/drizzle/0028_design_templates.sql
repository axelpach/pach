CREATE TABLE IF NOT EXISTS "design_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_systems" REPLICA IDENTITY FULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_systems_organization_idx" ON "design_systems" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "design_systems_organization_slug_idx" ON "design_systems" ("organization_id", "slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "design_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"type" text DEFAULT 'deck' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_kind" text DEFAULT 'react' NOT NULL,
	"current_version_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_templates" REPLICA IDENTITY FULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_templates_organization_idx" ON "design_templates" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "design_templates_organization_slug_idx" ON "design_templates" ("organization_id", "slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "design_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"template_id" uuid NOT NULL REFERENCES "design_templates"("id"),
	"version_number" integer DEFAULT 1 NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"source_kind" text DEFAULT 'react' NOT NULL,
	"files" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dependencies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"compiled_artifact_url" text,
	"preview_image_url" text,
	"validation_status" text DEFAULT 'draft' NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_template_versions" REPLICA IDENTITY FULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_template_versions_organization_idx" ON "design_template_versions" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_template_versions_template_idx" ON "design_template_versions" ("template_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "design_template_versions_template_version_idx" ON "design_template_versions" ("template_id", "version_number");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "design_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"template_id" uuid REFERENCES "design_templates"("id"),
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"storage_key" text,
	"url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_assets" REPLICA IDENTITY FULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_assets_organization_idx" ON "design_assets" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_assets_template_idx" ON "design_assets" ("template_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "design_template_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
	"template_id" uuid REFERENCES "design_templates"("id"),
	"template_slug" text,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"status_message" text,
	"source_version_id" uuid,
	"target_version_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design_template_runs" REPLICA IDENTITY FULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_template_runs_organization_idx" ON "design_template_runs" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_template_runs_template_idx" ON "design_template_runs" ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "design_template_runs_template_slug_idx" ON "design_template_runs" ("template_slug");
