-- Paid marketing promotion drafts and LinkedIn Ads metric snapshots.

CREATE TABLE IF NOT EXISTS "mkt_ad_promotions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content_item_id" uuid NOT NULL REFERENCES "mkt_content_items"("id"),
  "content_output_id" uuid REFERENCES "mkt_content_outputs"("id"),
  "social_post_id" uuid REFERENCES "social_posts"("id"),
  "social_post_target_id" uuid REFERENCES "social_post_targets"("id"),
  "provider" text NOT NULL DEFAULT 'linkedin',
  "ad_account_external_id" text,
  "campaign_group_external_id" text,
  "campaign_external_id" text,
  "creative_external_id" text,
  "landing_url" text,
  "objective" text NOT NULL DEFAULT 'website_visits',
  "status" text NOT NULL DEFAULT 'draft',
  "budget_minor" integer,
  "currency_code" text NOT NULL DEFAULT 'MXN',
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "targeting" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "creative" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_ad_promotions" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "mkt_ad_metric_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "promotion_id" uuid REFERENCES "mkt_ad_promotions"("id"),
  "provider" text NOT NULL DEFAULT 'linkedin',
  "entity_kind" text NOT NULL DEFAULT 'promotion',
  "entity_external_id" text,
  "ad_account_external_id" text,
  "campaign_group_external_id" text,
  "campaign_external_id" text,
  "creative_external_id" text,
  "granularity" text NOT NULL DEFAULT 'daily',
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "impressions" integer NOT NULL DEFAULT 0,
  "clicks" integer NOT NULL DEFAULT 0,
  "reactions" integer NOT NULL DEFAULT 0,
  "comments" integer NOT NULL DEFAULT 0,
  "shares" integer NOT NULL DEFAULT 0,
  "follows" integer NOT NULL DEFAULT 0,
  "leads" integer NOT NULL DEFAULT 0,
  "conversions" integer NOT NULL DEFAULT 0,
  "spend_minor" integer NOT NULL DEFAULT 0,
  "currency_code" text NOT NULL DEFAULT 'MXN',
  "raw_metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_ad_metric_snapshots" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_organization_idx" ON "mkt_ad_promotions"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_content_item_idx" ON "mkt_ad_promotions"("content_item_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_content_output_idx" ON "mkt_ad_promotions"("content_output_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_social_post_idx" ON "mkt_ad_promotions"("social_post_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_provider_account_idx" ON "mkt_ad_promotions"("provider", "ad_account_external_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_promotions_status_idx" ON "mkt_ad_promotions"("status");

CREATE INDEX IF NOT EXISTS "mkt_ad_metric_snapshots_organization_idx" ON "mkt_ad_metric_snapshots"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_metric_snapshots_promotion_idx" ON "mkt_ad_metric_snapshots"("promotion_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_metric_snapshots_entity_idx" ON "mkt_ad_metric_snapshots"("provider", "entity_kind", "entity_external_id");
CREATE INDEX IF NOT EXISTS "mkt_ad_metric_snapshots_period_idx" ON "mkt_ad_metric_snapshots"("period_start", "period_end");
