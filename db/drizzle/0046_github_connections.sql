CREATE TABLE IF NOT EXISTS "github_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "provider" text DEFAULT 'github' NOT NULL,
  "provider_account_login" text,
  "owner_user_id" uuid REFERENCES "users"("id"),
  "credential_kind" text DEFAULT 'fine_grained_pat' NOT NULL,
  "credential_label" text,
  "credential_last4" text,
  "encrypted_credential" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "status_message" text,
  "last_synced_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "github_connections_provider_account_idx"
  ON "github_connections" ("provider", "provider_account_login");

CREATE INDEX IF NOT EXISTS "github_connections_owner_user_idx"
  ON "github_connections" ("owner_user_id");

CREATE INDEX IF NOT EXISTS "github_connections_status_idx"
  ON "github_connections" ("status");

ALTER TABLE "github_repositories"
  ADD COLUMN IF NOT EXISTS "connection_id" uuid REFERENCES "github_connections"("id"),
  ADD COLUMN IF NOT EXISTS "github_id" text,
  ADD COLUMN IF NOT EXISTS "node_id" text,
  ADD COLUMN IF NOT EXISTS "html_url" text,
  ADD COLUMN IF NOT EXISTS "private" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS "github_repositories_connection_idx"
  ON "github_repositories" ("connection_id");

CREATE INDEX IF NOT EXISTS "github_repositories_github_id_idx"
  ON "github_repositories" ("github_id");

CREATE INDEX IF NOT EXISTS "github_repositories_active_idx"
  ON "github_repositories" ("active");

CREATE TABLE IF NOT EXISTS "organization_repositories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "repository_id" uuid NOT NULL REFERENCES "github_repositories"("id"),
  "role" text DEFAULT 'primary' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_repositories_organization_repository_idx"
  ON "organization_repositories" ("organization_id", "repository_id");

CREATE INDEX IF NOT EXISTS "organization_repositories_organization_idx"
  ON "organization_repositories" ("organization_id");

CREATE INDEX IF NOT EXISTS "organization_repositories_repository_idx"
  ON "organization_repositories" ("repository_id");
