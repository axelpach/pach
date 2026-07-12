-- Google Search Console connection, property, sitemap, and organic search metrics.

CREATE TABLE IF NOT EXISTS "google_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connected_by_user_id" uuid REFERENCES "users"("id"),
  "provider_account_id" text,
  "provider_account_email" text,
  "provider_account_name" text,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "credential_kind" text NOT NULL DEFAULT 'oauth2',
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'active',
  "status_message" text,
  "last_used_at" timestamp with time zone,
  "last_refreshed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "google_connections" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "search_console_properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connection_id" uuid REFERENCES "google_connections"("id"),
  "site_url" text NOT NULL,
  "display_name" text NOT NULL,
  "permission_level" text,
  "selected" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "last_synced_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "search_console_properties" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "search_console_sitemaps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "search_console_properties"("id"),
  "site_url" text NOT NULL,
  "sitemap_url" text NOT NULL,
  "status" text NOT NULL DEFAULT 'submitted',
  "last_submitted_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "search_console_sitemaps" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "search_console_metric_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "search_console_properties"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "content_output_id" uuid REFERENCES "mkt_content_outputs"("id"),
  "data_date" date NOT NULL,
  "search_type" text NOT NULL DEFAULT 'web',
  "page" text,
  "query" text,
  "country" text,
  "device" text,
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "ctr" text,
  "position" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "search_console_metric_snapshots" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "search_console_url_inspections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "search_console_properties"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "content_output_id" uuid REFERENCES "mkt_content_outputs"("id"),
  "inspection_url" text NOT NULL,
  "verdict" text,
  "coverage_state" text,
  "indexing_state" text,
  "robots_txt_state" text,
  "last_crawl_time" timestamp with time zone,
  "inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "raw_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "search_console_url_inspections" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "google_connections_organization_idx" ON "google_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "google_connections_provider_account_idx" ON "google_connections"("provider_account_email");
CREATE INDEX IF NOT EXISTS "google_connections_status_idx" ON "google_connections"("status");

CREATE INDEX IF NOT EXISTS "search_console_properties_organization_idx" ON "search_console_properties"("organization_id");
CREATE INDEX IF NOT EXISTS "search_console_properties_connection_idx" ON "search_console_properties"("connection_id");
CREATE UNIQUE INDEX IF NOT EXISTS "search_console_properties_organization_site_idx" ON "search_console_properties"("organization_id", "site_url");
CREATE INDEX IF NOT EXISTS "search_console_properties_selected_idx" ON "search_console_properties"("organization_id", "selected");

CREATE INDEX IF NOT EXISTS "search_console_sitemaps_organization_idx" ON "search_console_sitemaps"("organization_id");
CREATE INDEX IF NOT EXISTS "search_console_sitemaps_property_idx" ON "search_console_sitemaps"("property_id");
CREATE UNIQUE INDEX IF NOT EXISTS "search_console_sitemaps_property_sitemap_idx" ON "search_console_sitemaps"("property_id", "sitemap_url");

CREATE INDEX IF NOT EXISTS "search_console_metric_snapshots_organization_idx" ON "search_console_metric_snapshots"("organization_id");
CREATE INDEX IF NOT EXISTS "search_console_metric_snapshots_property_date_idx" ON "search_console_metric_snapshots"("property_id", "data_date");
CREATE INDEX IF NOT EXISTS "search_console_metric_snapshots_page_idx" ON "search_console_metric_snapshots"("page");
CREATE INDEX IF NOT EXISTS "search_console_metric_snapshots_query_idx" ON "search_console_metric_snapshots"("query");
CREATE INDEX IF NOT EXISTS "search_console_metric_snapshots_content_item_idx" ON "search_console_metric_snapshots"("content_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "search_console_metric_snapshots_unique_idx" ON "search_console_metric_snapshots"(
  "property_id",
  "data_date",
  "search_type",
  "page",
  "query",
  "country",
  "device"
);

CREATE INDEX IF NOT EXISTS "search_console_url_inspections_organization_idx" ON "search_console_url_inspections"("organization_id");
CREATE INDEX IF NOT EXISTS "search_console_url_inspections_property_idx" ON "search_console_url_inspections"("property_id");
CREATE INDEX IF NOT EXISTS "search_console_url_inspections_url_idx" ON "search_console_url_inspections"("inspection_url");
CREATE UNIQUE INDEX IF NOT EXISTS "search_console_url_inspections_property_url_idx" ON "search_console_url_inspections"("property_id", "inspection_url");
