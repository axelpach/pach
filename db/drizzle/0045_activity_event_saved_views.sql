CREATE TABLE IF NOT EXISTS "activity_event_saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES "organizations"("id"),
  "owner_id" uuid REFERENCES "users"("id"),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "icon" text,
  "color" text,
  "scope" text DEFAULT 'personal' NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "display" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "activity_event_saved_views_organization_idx"
  ON "activity_event_saved_views" ("organization_id");

CREATE INDEX IF NOT EXISTS "activity_event_saved_views_owner_idx"
  ON "activity_event_saved_views" ("owner_id");

CREATE INDEX IF NOT EXISTS "activity_event_saved_views_owner_position_idx"
  ON "activity_event_saved_views" ("owner_id", "position");
