-- Marketing content outputs and social publishing foundations.

CREATE TABLE IF NOT EXISTS "mkt_publication_consumers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "publication_id" uuid REFERENCES "mkt_publications"("id"),
  "kind" text NOT NULL DEFAULT 'blog',
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "base_url" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_publication_consumers" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "mkt_content_outputs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content_item_id" uuid NOT NULL REFERENCES "mkt_content_items"("id"),
  "consumer_id" uuid REFERENCES "mkt_publication_consumers"("id"),
  "distribution_run_id" uuid REFERENCES "mkt_distribution_runs"("id"),
  "channel" text NOT NULL DEFAULT 'blog',
  "public_url" text,
  "canonical_url" text,
  "status" text NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mkt_content_outputs" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "social_provider_apps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "provider" text NOT NULL DEFAULT 'linkedin',
  "purpose" text NOT NULL DEFAULT 'organization_publishing',
  "name" text NOT NULL,
  "client_id" text NOT NULL,
  "encrypted_client_secret" text,
  "client_secret_last4" text,
  "redirect_uri" text NOT NULL,
  "scopes_requested" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'pending_approval',
  "status_message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "social_provider_apps" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "social_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider_app_id" uuid REFERENCES "social_provider_apps"("id"),
  "connected_by_user_id" uuid REFERENCES "users"("id"),
  "provider" text NOT NULL DEFAULT 'linkedin',
  "provider_account_id" text,
  "provider_account_name" text,
  "provider_account_url" text,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "credential_kind" text NOT NULL DEFAULT 'oauth2',
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'active',
  "status_message" text,
  "last_used_at" timestamp with time zone,
  "last_refreshed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "social_connections" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "social_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "provider" text NOT NULL DEFAULT 'linkedin',
  "kind" text NOT NULL DEFAULT 'organization',
  "external_id" text NOT NULL,
  "display_name" text NOT NULL,
  "handle" text,
  "url" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "social_channels" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "social_channel_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "channel_id" uuid NOT NULL REFERENCES "social_channels"("id"),
  "connection_id" uuid NOT NULL REFERENCES "social_connections"("id"),
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "status_message" text,
  "last_checked_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "social_channel_connections" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "content_item_id" uuid REFERENCES "mkt_content_items"("id"),
  "content_output_id" uuid REFERENCES "mkt_content_outputs"("id"),
  "title" text,
  "caption" text NOT NULL DEFAULT '',
  "link_url" text,
  "thumbnail_url" text,
  "status" text NOT NULL DEFAULT 'draft',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "social_posts" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "social_post_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "social_post_id" uuid NOT NULL REFERENCES "social_posts"("id"),
  "channel_id" uuid NOT NULL REFERENCES "social_channels"("id"),
  "connection_id" uuid REFERENCES "social_connections"("id"),
  "status" text NOT NULL DEFAULT 'draft',
  "scheduled_at" timestamp with time zone,
  "scheduled_timezone" text NOT NULL DEFAULT 'America/Mexico_City',
  "published_at" timestamp with time zone,
  "provider_post_id" text,
  "provider_post_url" text,
  "error" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "social_post_targets" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "mkt_publication_consumers_organization_idx" ON "mkt_publication_consumers"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_publication_consumers_publication_idx" ON "mkt_publication_consumers"("publication_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_publication_consumers_publication_slug_idx" ON "mkt_publication_consumers"("publication_id", "slug");

CREATE INDEX IF NOT EXISTS "mkt_content_outputs_organization_idx" ON "mkt_content_outputs"("organization_id");
CREATE INDEX IF NOT EXISTS "mkt_content_outputs_content_item_idx" ON "mkt_content_outputs"("content_item_id");
CREATE INDEX IF NOT EXISTS "mkt_content_outputs_consumer_idx" ON "mkt_content_outputs"("consumer_id");
CREATE INDEX IF NOT EXISTS "mkt_content_outputs_distribution_run_idx" ON "mkt_content_outputs"("distribution_run_id");
CREATE INDEX IF NOT EXISTS "mkt_content_outputs_channel_status_idx" ON "mkt_content_outputs"("channel", "status");

CREATE INDEX IF NOT EXISTS "social_provider_apps_organization_idx" ON "social_provider_apps"("organization_id");
CREATE INDEX IF NOT EXISTS "social_provider_apps_provider_purpose_idx" ON "social_provider_apps"("provider", "purpose");
CREATE INDEX IF NOT EXISTS "social_provider_apps_status_idx" ON "social_provider_apps"("status");

CREATE INDEX IF NOT EXISTS "social_connections_organization_idx" ON "social_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "social_connections_provider_app_idx" ON "social_connections"("provider_app_id");
CREATE INDEX IF NOT EXISTS "social_connections_provider_account_idx" ON "social_connections"("provider", "provider_account_id");
CREATE INDEX IF NOT EXISTS "social_connections_status_idx" ON "social_connections"("status");

CREATE INDEX IF NOT EXISTS "social_channels_organization_idx" ON "social_channels"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "social_channels_provider_external_idx" ON "social_channels"("provider", "external_id");
CREATE INDEX IF NOT EXISTS "social_channels_organization_provider_idx" ON "social_channels"("organization_id", "provider");

CREATE UNIQUE INDEX IF NOT EXISTS "social_channel_connections_channel_connection_idx" ON "social_channel_connections"("channel_id", "connection_id");
CREATE INDEX IF NOT EXISTS "social_channel_connections_organization_idx" ON "social_channel_connections"("organization_id");
CREATE INDEX IF NOT EXISTS "social_channel_connections_channel_idx" ON "social_channel_connections"("channel_id");
CREATE INDEX IF NOT EXISTS "social_channel_connections_connection_idx" ON "social_channel_connections"("connection_id");

CREATE INDEX IF NOT EXISTS "social_posts_organization_idx" ON "social_posts"("organization_id");
CREATE INDEX IF NOT EXISTS "social_posts_content_item_idx" ON "social_posts"("content_item_id");
CREATE INDEX IF NOT EXISTS "social_posts_content_output_idx" ON "social_posts"("content_output_id");
CREATE INDEX IF NOT EXISTS "social_posts_status_idx" ON "social_posts"("status");

CREATE INDEX IF NOT EXISTS "social_post_targets_organization_idx" ON "social_post_targets"("organization_id");
CREATE INDEX IF NOT EXISTS "social_post_targets_post_idx" ON "social_post_targets"("social_post_id");
CREATE INDEX IF NOT EXISTS "social_post_targets_channel_idx" ON "social_post_targets"("channel_id");
CREATE INDEX IF NOT EXISTS "social_post_targets_connection_idx" ON "social_post_targets"("connection_id");
CREATE INDEX IF NOT EXISTS "social_post_targets_status_scheduled_idx" ON "social_post_targets"("status", "scheduled_at");
