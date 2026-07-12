-- Daily date-only Google Search Console totals for charts and headline metrics.

CREATE TABLE IF NOT EXISTS "search_console_daily_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "search_console_properties"("id"),
  "data_date" date NOT NULL,
  "search_type" text NOT NULL DEFAULT 'web',
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "ctr" text,
  "position" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "search_console_daily_snapshots" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "search_console_daily_snapshots_organization_idx" ON "search_console_daily_snapshots"("organization_id");
CREATE INDEX IF NOT EXISTS "search_console_daily_snapshots_property_date_idx" ON "search_console_daily_snapshots"("property_id", "data_date");
CREATE UNIQUE INDEX IF NOT EXISTS "search_console_daily_snapshots_unique_idx" ON "search_console_daily_snapshots"(
  "property_id",
  "data_date",
  "search_type"
);

DO $$
DECLARE
  publication_name text;
BEGIN
  FOR publication_name IN
    SELECT pubname
    FROM pg_publication
    WHERE pubname = 'zero' OR pubname LIKE '\_zero\_public\_%' ESCAPE '\'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = publication_name
        AND schemaname = 'public'
        AND tablename = 'search_console_daily_snapshots'
    ) THEN
      EXECUTE format('ALTER PUBLICATION %I ADD TABLE %I.%I', publication_name, 'public', 'search_console_daily_snapshots');
    END IF;
  END LOOP;
END $$;
