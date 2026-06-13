CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id"),
  "parent_id" uuid,
  "owner_id" uuid REFERENCES "users"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "format" text DEFAULT 'markdown' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "icon" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "documents_organization_status_idx" ON "documents" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "documents_parent_idx" ON "documents" ("parent_id");
CREATE INDEX IF NOT EXISTS "documents_owner_idx" ON "documents" ("owner_id");
CREATE UNIQUE INDEX IF NOT EXISTS "documents_organization_slug_idx" ON "documents" ("organization_id", "slug");

ALTER TABLE "documents" REPLICA IDENTITY FULL;
