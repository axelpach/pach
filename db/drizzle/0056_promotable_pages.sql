-- First-class page inventory for paid distribution and future keyword enrichment.

CREATE TABLE IF NOT EXISTS "mkt_promotable_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "content_output_id" uuid REFERENCES "mkt_content_outputs"("id"),
  "source" text NOT NULL DEFAULT 'manual',
  "title" text NOT NULL DEFAULT '',
  "url" text NOT NULL,
  "canonical_url" text,
  "source_url" text,
  "status" text NOT NULL DEFAULT 'imported',
  "sitemap_url" text,
  "sitemap_lastmod" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_promotable_pages" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "mkt_promotable_pages_organization_idx" ON "mkt_promotable_pages"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_promotable_pages_content_item_idx" ON "mkt_promotable_pages"("content_item_id");
CREATE INDEX IF NOT EXISTS "mkt_promotable_pages_content_output_idx" ON "mkt_promotable_pages"("content_output_id");
CREATE INDEX IF NOT EXISTS "mkt_promotable_pages_source_status_idx" ON "mkt_promotable_pages"("source", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_promotable_pages_organization_url_idx" ON "mkt_promotable_pages"("organization_id", "url");

ALTER TABLE "mkt_ad_promotions" ADD COLUMN IF NOT EXISTS "promotable_page_id" uuid REFERENCES "mkt_promotable_pages"("id");
ALTER TABLE "mkt_ad_promotions" ALTER COLUMN "content_item_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_promotable_page_idx" ON "mkt_ad_promotions"("promotable_page_id");

INSERT INTO "mkt_promotable_pages" (
  "organization_id",
  "content_item_id",
  "content_output_id",
  "source",
  "title",
  "url",
  "canonical_url",
  "source_url",
  "status",
  "metadata",
  "created_at",
  "updated_at"
)
SELECT
  output."organization_id",
  output."content_item_id",
  output."id",
  'content_output',
  COALESCE(NULLIF(item."title", ''), output."public_url"),
  COALESCE(NULLIF(output."canonical_url", ''), output."public_url"),
  output."canonical_url",
  output."public_url",
  CASE WHEN output."status" = 'published' THEN 'ready' ELSE 'imported' END,
  jsonb_build_object('contentOutputStatus', output."status") || output."metadata",
  output."created_at",
  output."updated_at"
FROM "mkt_content_outputs" output
JOIN "mkt_content_items" item ON item."id" = output."content_item_id"
WHERE output."public_url" IS NOT NULL
  AND output."status" IN ('published', 'scheduled')
ON CONFLICT ("organization_id", "url") DO NOTHING;

UPDATE "mkt_ad_promotions" promotion
SET "promotable_page_id" = page."id"
FROM "mkt_promotable_pages" page
WHERE promotion."promotable_page_id" IS NULL
  AND promotion."organization_id" = page."organization_id"
  AND (
    promotion."content_output_id" = page."content_output_id"
    OR (
      promotion."content_output_id" IS NULL
      AND promotion."content_item_id" IS NOT NULL
      AND promotion."content_item_id" = page."content_item_id"
    )
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
        AND tablename = 'mkt_promotable_pages'
    ) THEN
      EXECUTE format('ALTER PUBLICATION %I ADD TABLE %I.%I', publication_name, 'public', 'mkt_promotable_pages');
    END IF;
  END LOOP;
END $$;
