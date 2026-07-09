-- Autonomous newsletter editorial planning.

CREATE TABLE IF NOT EXISTS "mkt_editorial_ideas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "publication_id" uuid NOT NULL REFERENCES "mkt_publications"("id"),
  "document_id" uuid REFERENCES "documents"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "agent_run_id" uuid,
  "title" text NOT NULL,
  "angle" text,
  "source_notes" text,
  "dedupe_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'available',
  "priority" integer NOT NULL DEFAULT 0,
  "reserved_at" timestamp with time zone,
  "used_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_editorial_ideas" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "mkt_publication_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "publication_id" uuid NOT NULL REFERENCES "mkt_publications"("id"),
  "idea_id" uuid REFERENCES "mkt_editorial_ideas"("id"),
  "document_id" uuid REFERENCES "documents"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "distribution_run_id" uuid REFERENCES "mkt_distribution_runs"("id"),
  "agent_run_id" uuid,
  "slot_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'planned',
  "scheduled_at" timestamp with time zone NOT NULL,
  "scheduled_timezone" text NOT NULL DEFAULT 'America/Mexico_City',
  "locked_at" timestamp with time zone,
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_publication_slots" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "mkt_editorial_ideas_organization_idx" ON "mkt_editorial_ideas"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_editorial_ideas_publication_status_idx" ON "mkt_editorial_ideas"("publication_id", "status");
CREATE INDEX IF NOT EXISTS "mkt_editorial_ideas_document_idx" ON "mkt_editorial_ideas"("document_id");
CREATE INDEX IF NOT EXISTS "mkt_editorial_ideas_content_item_idx" ON "mkt_editorial_ideas"("content_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_editorial_ideas_publication_dedupe_idx" ON "mkt_editorial_ideas"("publication_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "mkt_publication_slots_organization_idx" ON "mkt_publication_slots"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_publication_slots_publication_scheduled_idx" ON "mkt_publication_slots"("publication_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "mkt_publication_slots_publication_status_idx" ON "mkt_publication_slots"("publication_id", "status");
CREATE INDEX IF NOT EXISTS "mkt_publication_slots_idea_idx" ON "mkt_publication_slots"("idea_id");
CREATE INDEX IF NOT EXISTS "mkt_publication_slots_document_idx" ON "mkt_publication_slots"("document_id");
CREATE INDEX IF NOT EXISTS "mkt_publication_slots_content_item_idx" ON "mkt_publication_slots"("content_item_id");
CREATE INDEX IF NOT EXISTS "mkt_publication_slots_distribution_run_idx" ON "mkt_publication_slots"("distribution_run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_publication_slots_publication_slot_key_idx" ON "mkt_publication_slots"("publication_id", "slot_key");
