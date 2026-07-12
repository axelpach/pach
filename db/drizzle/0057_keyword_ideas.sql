-- Reusable keyword ideas for promotable pages and Google Search campaign drafts.

CREATE TABLE IF NOT EXISTS "mkt_keyword_ideas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "promotable_page_id" uuid NOT NULL REFERENCES "mkt_promotable_pages"("id"),
  "agent_run_id" uuid,
  "keyword" text NOT NULL,
  "match_type" text NOT NULL DEFAULT 'phrase',
  "intent" text,
  "priority" integer NOT NULL DEFAULT 0,
  "negative" boolean NOT NULL DEFAULT false,
  "rationale" text,
  "status" text NOT NULL DEFAULT 'suggested',
  "source" text NOT NULL DEFAULT 'agent',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_keyword_ideas" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "mkt_keyword_ideas_organization_idx" ON "mkt_keyword_ideas"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_keyword_ideas_page_status_idx" ON "mkt_keyword_ideas"("promotable_page_id", "status");
CREATE INDEX IF NOT EXISTS "mkt_keyword_ideas_agent_run_idx" ON "mkt_keyword_ideas"("agent_run_id");
CREATE INDEX IF NOT EXISTS "mkt_keyword_ideas_organization_keyword_idx" ON "mkt_keyword_ideas"("organization_id", "keyword");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_keyword_ideas_page_keyword_unique_idx" ON "mkt_keyword_ideas"("promotable_page_id", "keyword", "negative");

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
        AND tablename = 'mkt_keyword_ideas'
    ) THEN
      EXECUTE format('ALTER PUBLICATION %I ADD TABLE %I.%I', publication_name, 'public', 'mkt_keyword_ideas');
    END IF;
  END LOOP;
END $$;
