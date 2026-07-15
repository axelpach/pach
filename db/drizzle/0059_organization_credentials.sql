CREATE TABLE IF NOT EXISTS "organization_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "name" text NOT NULL,
  "provider" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'api_key',
  "env_var_name" text NOT NULL,
  "encrypted_secret" text NOT NULL,
  "secret_last4" text NOT NULL,
  "allowed_uses" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "status_message" text,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "organization_credentials_organization_idx"
  ON "organization_credentials"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "organization_credentials_organization_env_var_idx"
  ON "organization_credentials"("organization_id", "env_var_name");
CREATE INDEX IF NOT EXISTS "organization_credentials_provider_idx"
  ON "organization_credentials"("provider");
CREATE INDEX IF NOT EXISTS "organization_credentials_status_idx"
  ON "organization_credentials"("status");
