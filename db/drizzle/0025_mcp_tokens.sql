-- Scoped MCP access tokens for Codex and Pach runners.

CREATE TABLE IF NOT EXISTS "mcp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"owner_user_id" uuid REFERENCES "users"("id"),
	"all_organizations" boolean DEFAULT false NOT NULL,
	"can_access_unscoped" boolean DEFAULT false NOT NULL,
	"organization_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_tokens_token_prefix_unique" UNIQUE("token_prefix"),
	CONSTRAINT "mcp_tokens_token_hash_unique" UNIQUE("token_hash")
);

CREATE INDEX IF NOT EXISTS "mcp_tokens_token_hash_idx" ON "mcp_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "mcp_tokens_owner_user_id_idx" ON "mcp_tokens" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "mcp_tokens_revoked_at_idx" ON "mcp_tokens" ("revoked_at");
CREATE INDEX IF NOT EXISTS "mcp_tokens_expires_at_idx" ON "mcp_tokens" ("expires_at");
