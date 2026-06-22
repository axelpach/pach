CREATE TABLE IF NOT EXISTS "mkt_sender_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider" text NOT NULL DEFAULT 'resend',
  "name" text NOT NULL,
  "from_name" text NOT NULL,
  "from_email" text NOT NULL,
  "reply_to_name" text,
  "reply_to_email" text,
  "sending_domain" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "default_sender_profile_id" uuid REFERENCES "mkt_sender_profiles"("id"),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "type" text NOT NULL DEFAULT 'newsletter',
  "audience_description" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_ctas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "key" text NOT NULL,
  "label" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "source_document_id" uuid REFERENCES "documents"("id"),
  "primary_cta_id" uuid REFERENCES "mkt_ctas"("id"),
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text,
  "content_kind" text NOT NULL DEFAULT 'article',
  "supported_channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft',
  "body" text NOT NULL DEFAULT '',
  "format" text NOT NULL DEFAULT 'markdown',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_audience_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "crm_contact_id" uuid REFERENCES "crm_contacts"("id"),
  "name" text,
  "email" text,
  "phone" text,
  "whatsapp_phone" text,
  "company" text,
  "role" text,
  "source" text,
  "status" text NOT NULL DEFAULT 'active',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_audience_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "audience_member_id" uuid NOT NULL REFERENCES "mkt_audience_members"("id"),
  "publication_id" uuid REFERENCES "mkt_publications"("id"),
  "channel" text NOT NULL DEFAULT 'newsletter',
  "status" text NOT NULL DEFAULT 'subscribed',
  "consent_source" text,
  "consented_at" timestamp with time zone,
  "unsubscribed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "kind" text NOT NULL DEFAULT 'manual',
  "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_segment_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "segment_id" uuid NOT NULL REFERENCES "mkt_segments"("id"),
  "audience_member_id" uuid NOT NULL REFERENCES "mkt_audience_members"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_distribution_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "publication_id" uuid REFERENCES "mkt_publications"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "segment_id" uuid REFERENCES "mkt_segments"("id"),
  "sender_profile_id" uuid REFERENCES "mkt_sender_profiles"("id"),
  "design_template_id" uuid REFERENCES "design_templates"("id"),
  "design_template_version_id" uuid REFERENCES "design_template_versions"("id"),
  "channel" text NOT NULL,
  "distribution_type" text NOT NULL DEFAULT 'broadcast',
  "name" text NOT NULL,
  "subject" text,
  "preheader" text,
  "status" text NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "provider" text,
  "provider_campaign_id" text,
  "recipient_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mkt_content_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "distribution_run_id" uuid REFERENCES "mkt_distribution_runs"("id"),
  "audience_member_id" uuid REFERENCES "mkt_audience_members"("id"),
  "cta_id" uuid REFERENCES "mkt_ctas"("id"),
  "event_type" text NOT NULL,
  "channel" text,
  "source" text,
  "url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mkt_sender_profiles_organization_idx" ON "mkt_sender_profiles" ("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_publications_organization_idx" ON "mkt_publications" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_publications_organization_slug_idx" ON "mkt_publications" ("organization_id", "slug");
CREATE INDEX IF NOT EXISTS "mkt_ctas_organization_idx" ON "mkt_ctas" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_ctas_organization_key_idx" ON "mkt_ctas" ("organization_id", "key");
CREATE INDEX IF NOT EXISTS "mkt_content_items_organization_idx" ON "mkt_content_items" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_content_items_organization_slug_idx" ON "mkt_content_items" ("organization_id", "slug");
CREATE INDEX IF NOT EXISTS "mkt_content_items_source_document_idx" ON "mkt_content_items" ("source_document_id");
CREATE INDEX IF NOT EXISTS "mkt_audience_members_organization_idx" ON "mkt_audience_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_audience_members_email_idx" ON "mkt_audience_members" ("email");
CREATE INDEX IF NOT EXISTS "mkt_audience_members_crm_contact_idx" ON "mkt_audience_members" ("crm_contact_id");
CREATE INDEX IF NOT EXISTS "mkt_audience_subscriptions_organization_idx" ON "mkt_audience_subscriptions" ("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_audience_subscriptions_member_idx" ON "mkt_audience_subscriptions" ("audience_member_id");
CREATE INDEX IF NOT EXISTS "mkt_audience_subscriptions_publication_idx" ON "mkt_audience_subscriptions" ("publication_id");
CREATE INDEX IF NOT EXISTS "mkt_segments_organization_idx" ON "mkt_segments" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_segments_organization_slug_idx" ON "mkt_segments" ("organization_id", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_segment_members_segment_member_idx" ON "mkt_segment_members" ("segment_id", "audience_member_id");
CREATE INDEX IF NOT EXISTS "mkt_segment_members_organization_idx" ON "mkt_segment_members" ("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_distribution_runs_organization_idx" ON "mkt_distribution_runs" ("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_distribution_runs_publication_idx" ON "mkt_distribution_runs" ("publication_id");
CREATE INDEX IF NOT EXISTS "mkt_distribution_runs_content_item_idx" ON "mkt_distribution_runs" ("content_item_id");
CREATE INDEX IF NOT EXISTS "mkt_distribution_runs_channel_status_idx" ON "mkt_distribution_runs" ("channel", "status");
CREATE INDEX IF NOT EXISTS "mkt_content_events_organization_idx" ON "mkt_content_events" ("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_content_events_content_item_idx" ON "mkt_content_events" ("content_item_id");
CREATE INDEX IF NOT EXISTS "mkt_content_events_distribution_run_idx" ON "mkt_content_events" ("distribution_run_id");
CREATE INDEX IF NOT EXISTS "mkt_content_events_type_idx" ON "mkt_content_events" ("event_type");
