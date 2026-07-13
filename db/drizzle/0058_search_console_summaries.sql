-- Replace the combinatorial Search Console fact table with bounded rolling summaries.

CREATE TABLE IF NOT EXISTS "search_console_dimension_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "search_console_properties"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "content_output_id" uuid REFERENCES "mkt_content_outputs"("id"),
  "summary_type" text NOT NULL,
  "summary_key" text NOT NULL,
  "search_type" text NOT NULL DEFAULT 'web',
  "page" text,
  "query" text,
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "ctr" text,
  "position" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "search_console_dimension_summaries" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "search_console_dimension_summaries_organization_idx"
  ON "search_console_dimension_summaries"("organization_id");
CREATE INDEX IF NOT EXISTS "search_console_dimension_summaries_property_type_idx"
  ON "search_console_dimension_summaries"("property_id", "summary_type");
CREATE INDEX IF NOT EXISTS "search_console_dimension_summaries_page_idx"
  ON "search_console_dimension_summaries"("page");
CREATE INDEX IF NOT EXISTS "search_console_dimension_summaries_query_idx"
  ON "search_console_dimension_summaries"("query");
CREATE INDEX IF NOT EXISTS "search_console_dimension_summaries_content_item_idx"
  ON "search_console_dimension_summaries"("content_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "search_console_dimension_summaries_unique_idx"
  ON "search_console_dimension_summaries"("property_id", "summary_type", "search_type", "summary_key");

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
        AND tablename = 'search_console_dimension_summaries'
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION %I ADD TABLE %I.%I',
        publication_name,
        'public',
        'search_console_dimension_summaries'
      );
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS "search_console_metric_snapshots";
