-- Repair migration for DBs that applied 0047 before provider apps were added.

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

ALTER TABLE "social_connections"
  ADD COLUMN IF NOT EXISTS "provider_app_id" uuid REFERENCES "social_provider_apps"("id");

CREATE INDEX IF NOT EXISTS "social_provider_apps_organization_idx" ON "social_provider_apps"("organization_id");
CREATE INDEX IF NOT EXISTS "social_provider_apps_provider_purpose_idx" ON "social_provider_apps"("provider", "purpose");
CREATE INDEX IF NOT EXISTS "social_provider_apps_status_idx" ON "social_provider_apps"("status");
CREATE INDEX IF NOT EXISTS "social_connections_provider_app_idx" ON "social_connections"("provider_app_id");
