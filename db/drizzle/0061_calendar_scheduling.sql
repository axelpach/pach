CREATE TABLE IF NOT EXISTS "cal_calendar_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "provider" text DEFAULT 'manual' NOT NULL,
  "account_email" text,
  "status" text DEFAULT 'active' NOT NULL,
  "access_token_ref" text,
  "refresh_token_ref" text,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "cal_calendar_connections" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "cal_calendar_connections_organization_idx"
  ON "cal_calendar_connections" ("organization_id");
CREATE INDEX IF NOT EXISTS "cal_calendar_connections_user_provider_idx"
  ON "cal_calendar_connections" ("user_id", "provider");

CREATE TABLE IF NOT EXISTS "cal_external_calendars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connection_id" uuid NOT NULL REFERENCES "cal_calendar_connections"("id"),
  "provider_calendar_id" text NOT NULL,
  "name" text NOT NULL,
  "timezone" text,
  "primary" boolean DEFAULT false NOT NULL,
  "include_for_availability" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "cal_external_calendars" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "cal_external_calendars_organization_idx"
  ON "cal_external_calendars" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cal_external_calendars_connection_calendar_idx"
  ON "cal_external_calendars" ("connection_id", "provider_calendar_id");

CREATE TABLE IF NOT EXISTS "cal_event_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "duration_minutes" integer DEFAULT 30 NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "location_mode" text DEFAULT 'video' NOT NULL,
  "location_details" text,
  "meeting_provider" text DEFAULT 'manual' NOT NULL,
  "buffer_before_minutes" integer DEFAULT 0 NOT NULL,
  "buffer_after_minutes" integer DEFAULT 0 NOT NULL,
  "minimum_notice_minutes" integer DEFAULT 120 NOT NULL,
  "booking_window_days" integer DEFAULT 30 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "cal_event_types" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "cal_event_types_organization_idx"
  ON "cal_event_types" ("organization_id");
CREATE INDEX IF NOT EXISTS "cal_event_types_owner_user_idx"
  ON "cal_event_types" ("owner_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cal_event_types_slug_idx"
  ON "cal_event_types" ("slug");

CREATE TABLE IF NOT EXISTS "cal_availability_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "event_type_id" uuid NOT NULL REFERENCES "cal_event_types"("id"),
  "weekday" integer NOT NULL,
  "start_minute" integer NOT NULL,
  "end_minute" integer NOT NULL,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "cal_availability_rules" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "cal_availability_rules_organization_idx"
  ON "cal_availability_rules" ("organization_id");
CREATE INDEX IF NOT EXISTS "cal_availability_rules_event_type_idx"
  ON "cal_availability_rules" ("event_type_id");

CREATE TABLE IF NOT EXISTS "cal_availability_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "event_type_id" uuid NOT NULL REFERENCES "cal_event_types"("id"),
  "date" date NOT NULL,
  "start_minute" integer,
  "end_minute" integer,
  "is_available" boolean DEFAULT false NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "cal_availability_overrides" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "cal_availability_overrides_organization_idx"
  ON "cal_availability_overrides" ("organization_id");
CREATE INDEX IF NOT EXISTS "cal_availability_overrides_event_type_date_idx"
  ON "cal_availability_overrides" ("event_type_id", "date");

CREATE TABLE IF NOT EXISTS "cal_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "event_type_id" uuid NOT NULL REFERENCES "cal_event_types"("id"),
  "host_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "guest_name" text NOT NULL,
  "guest_email" text NOT NULL,
  "guest_notes" text,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'confirmed' NOT NULL,
  "meeting_url" text,
  "provider_event_id" text,
  "cancel_token" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "canceled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "cal_bookings" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "cal_bookings_organization_idx"
  ON "cal_bookings" ("organization_id");
CREATE INDEX IF NOT EXISTS "cal_bookings_event_type_start_idx"
  ON "cal_bookings" ("event_type_id", "start_at");
CREATE INDEX IF NOT EXISTS "cal_bookings_host_start_idx"
  ON "cal_bookings" ("host_user_id", "start_at");
CREATE UNIQUE INDEX IF NOT EXISTS "cal_bookings_cancel_token_idx"
  ON "cal_bookings" ("cancel_token");
