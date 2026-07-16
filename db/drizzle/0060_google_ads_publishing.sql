ALTER TABLE "mkt_ad_promotions" ADD COLUMN "campaign_budget_external_id" text;
ALTER TABLE "mkt_ad_promotions" ADD COLUMN "ad_group_external_id" text;
ALTER TABLE "mkt_ad_promotions" ADD COLUMN "publish_operation_key" text;
ALTER TABLE "mkt_ad_promotions" ADD COLUMN "publish_error" text;
ALTER TABLE "mkt_ad_promotions" ADD COLUMN "provider_response" jsonb;
ALTER TABLE "mkt_ad_promotions" ADD COLUMN "published_at" timestamp with time zone;

CREATE TABLE "google_ads_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"manager_customer_id" text,
	"descriptive_name" text NOT NULL,
	"currency_code" text NOT NULL,
	"time_zone" text NOT NULL,
	"is_manager" boolean DEFAULT false NOT NULL,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_message" text,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "google_ads_accounts" ADD CONSTRAINT "google_ads_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "google_ads_accounts" ADD CONSTRAINT "google_ads_accounts_connection_id_google_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_connections"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "google_ads_accounts_organization_idx" ON "google_ads_accounts" USING btree ("organization_id");
CREATE INDEX "google_ads_accounts_connection_idx" ON "google_ads_accounts" USING btree ("connection_id");
CREATE UNIQUE INDEX "google_ads_accounts_organization_customer_idx" ON "google_ads_accounts" USING btree ("organization_id", "customer_id");
CREATE INDEX "google_ads_accounts_selected_idx" ON "google_ads_accounts" USING btree ("organization_id", "selected");
CREATE UNIQUE INDEX "google_ads_accounts_one_selected_per_organization_idx" ON "google_ads_accounts" USING btree ("organization_id") WHERE "selected" = true;
CREATE INDEX "google_ads_accounts_status_idx" ON "google_ads_accounts" USING btree ("status");
