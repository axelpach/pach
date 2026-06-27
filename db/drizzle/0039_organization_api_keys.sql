CREATE TABLE IF NOT EXISTS "organization_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "token_prefix" text NOT NULL UNIQUE,
  "token_hash" text NOT NULL UNIQUE,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "organization_api_keys_organization_idx" ON "organization_api_keys" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_api_keys_token_hash_idx" ON "organization_api_keys" ("token_hash");
CREATE INDEX IF NOT EXISTS "organization_api_keys_token_prefix_idx" ON "organization_api_keys" ("token_prefix");
CREATE INDEX IF NOT EXISTS "organization_api_keys_revoked_at_idx" ON "organization_api_keys" ("revoked_at");
