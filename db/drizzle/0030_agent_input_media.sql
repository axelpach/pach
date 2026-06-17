CREATE TABLE IF NOT EXISTS "agent_run_input_media_objects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id"),
  "kind" text DEFAULT 'file' NOT NULL,
  "name" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
  "size_bytes" integer,
  "width" integer,
  "height" integer,
  "storage_key" text NOT NULL,
  "url" text,
  "source" text DEFAULT 'upload' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_run_input_media_objects" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "agent_run_input_media_objects_organization_idx"
  ON "agent_run_input_media_objects" ("organization_id");

CREATE INDEX IF NOT EXISTS "agent_run_input_media_objects_storage_key_idx"
  ON "agent_run_input_media_objects" ("storage_key");

CREATE TABLE IF NOT EXISTS "agent_run_input_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "agent_runs"("id"),
  "media_object_id" uuid NOT NULL REFERENCES "agent_run_input_media_objects"("id"),
  "message_id" uuid REFERENCES "agent_messages"("id"),
  "issue_id" uuid REFERENCES "pm_issues"("id"),
  "subject_type" text,
  "subject_id" uuid,
  "role" text DEFAULT 'input' NOT NULL,
  "caption" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_run_input_media" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "agent_run_input_media_run_idx"
  ON "agent_run_input_media" ("run_id");

CREATE INDEX IF NOT EXISTS "agent_run_input_media_media_object_idx"
  ON "agent_run_input_media" ("media_object_id");

CREATE INDEX IF NOT EXISTS "agent_run_input_media_issue_idx"
  ON "agent_run_input_media" ("issue_id");

CREATE INDEX IF NOT EXISTS "agent_run_input_media_subject_idx"
  ON "agent_run_input_media" ("subject_type", "subject_id");
