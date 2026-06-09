CREATE TABLE IF NOT EXISTS "fin_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "institution_name" text,
  "type" text DEFAULT 'bank_account' NOT NULL,
  "currency_code" text DEFAULT 'MXN' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_balance_minor" bigint,
  "last_balance_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fin_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "parent_id" uuid,
  "name" text NOT NULL,
  "type" text DEFAULT 'expense' NOT NULL,
  "color" text,
  "icon" text,
  "position" integer DEFAULT 0 NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fin_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "account_id" uuid NOT NULL REFERENCES "fin_accounts"("id"),
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "status" text DEFAULT 'parsing' NOT NULL,
  "source_type" text DEFAULT 'statement_csv' NOT NULL,
  "file_name" text NOT NULL,
  "file_type" text NOT NULL,
  "file_sha256" text NOT NULL,
  "statement_start_date" date,
  "statement_end_date" date,
  "detected_currency_code" text,
  "detected_institution" text,
  "detected_account_hint" text,
  "items_parsed" integer DEFAULT 0 NOT NULL,
  "items_ready" integer DEFAULT 0 NOT NULL,
  "items_duplicate" integer DEFAULT 0 NOT NULL,
  "items_needing_review" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "raw_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applied_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "fin_import_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_id" uuid NOT NULL REFERENCES "fin_imports"("id"),
  "account_id" uuid NOT NULL REFERENCES "fin_accounts"("id"),
  "status" text DEFAULT 'parsed' NOT NULL,
  "transaction_date" date NOT NULL,
  "posted_date" date,
  "description" text NOT NULL,
  "merchant_name" text,
  "amount_minor" bigint NOT NULL,
  "currency_code" text NOT NULL,
  "suggested_type" text,
  "suggested_category_id" uuid REFERENCES "fin_categories"("id"),
  "suggested_confidence" integer,
  "duplicate_movement_id" uuid,
  "fingerprint" text NOT NULL,
  "raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fin_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "status" text DEFAULT 'suggested' NOT NULL,
  "from_account_id" uuid REFERENCES "fin_accounts"("id"),
  "to_account_id" uuid REFERENCES "fin_accounts"("id"),
  "amount_minor" bigint,
  "currency_code" text,
  "matched_confidence" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fin_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "account_id" uuid NOT NULL REFERENCES "fin_accounts"("id"),
  "category_id" uuid REFERENCES "fin_categories"("id"),
  "transfer_id" uuid REFERENCES "fin_transfers"("id"),
  "import_id" uuid REFERENCES "fin_imports"("id"),
  "source_item_id" uuid REFERENCES "fin_import_items"("id"),
  "transaction_date" date NOT NULL,
  "posted_date" date,
  "description" text NOT NULL,
  "merchant_name" text,
  "counterparty" text,
  "amount_minor" bigint NOT NULL,
  "currency_code" text NOT NULL,
  "reporting_amount_minor" bigint,
  "reporting_currency_code" text,
  "fx_rate" text,
  "fx_rate_source" text,
  "type" text DEFAULT 'expense' NOT NULL,
  "status" text DEFAULT 'pending_review' NOT NULL,
  "review_reason" text,
  "external_id" text,
  "fingerprint" text NOT NULL,
  "raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fin_categorization_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "account_id" uuid REFERENCES "fin_accounts"("id"),
  "category_id" uuid REFERENCES "fin_categories"("id"),
  "type" text DEFAULT 'expense' NOT NULL,
  "match_kind" text DEFAULT 'contains' NOT NULL,
  "match_value" text NOT NULL,
  "amount_minor" bigint,
  "currency_code" text,
  "confidence" integer DEFAULT 90 NOT NULL,
  "auto_apply" boolean DEFAULT true NOT NULL,
  "created_from_movement_id" uuid REFERENCES "fin_movements"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fin_balance_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "account_id" uuid NOT NULL REFERENCES "fin_accounts"("id"),
  "as_of_date" date NOT NULL,
  "balance_minor" bigint NOT NULL,
  "currency_code" text NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "import_id" uuid REFERENCES "fin_imports"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "fin_accounts_organization_idx" ON "fin_accounts" ("organization_id");
CREATE INDEX IF NOT EXISTS "fin_accounts_organization_status_idx" ON "fin_accounts" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "fin_categories_organization_idx" ON "fin_categories" ("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fin_categories_organization_name_idx" ON "fin_categories" ("organization_id", "name");
CREATE INDEX IF NOT EXISTS "fin_imports_organization_idx" ON "fin_imports" ("organization_id");
CREATE INDEX IF NOT EXISTS "fin_imports_account_idx" ON "fin_imports" ("account_id");
CREATE INDEX IF NOT EXISTS "fin_imports_file_sha_idx" ON "fin_imports" ("file_sha256");
CREATE INDEX IF NOT EXISTS "fin_import_items_import_idx" ON "fin_import_items" ("import_id");
CREATE INDEX IF NOT EXISTS "fin_import_items_account_fingerprint_idx" ON "fin_import_items" ("account_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "fin_transfers_organization_idx" ON "fin_transfers" ("organization_id");
CREATE INDEX IF NOT EXISTS "fin_movements_organization_date_idx" ON "fin_movements" ("organization_id", "transaction_date");
CREATE INDEX IF NOT EXISTS "fin_movements_account_date_idx" ON "fin_movements" ("account_id", "transaction_date");
CREATE UNIQUE INDEX IF NOT EXISTS "fin_movements_account_fingerprint_idx" ON "fin_movements" ("account_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "fin_movements_status_idx" ON "fin_movements" ("status");
CREATE INDEX IF NOT EXISTS "fin_categorization_rules_organization_idx" ON "fin_categorization_rules" ("organization_id");
CREATE INDEX IF NOT EXISTS "fin_categorization_rules_match_idx" ON "fin_categorization_rules" ("organization_id", "match_kind", "match_value");
CREATE UNIQUE INDEX IF NOT EXISTS "fin_balance_snapshots_account_date_idx" ON "fin_balance_snapshots" ("account_id", "as_of_date", "source");
CREATE INDEX IF NOT EXISTS "fin_balance_snapshots_organization_idx" ON "fin_balance_snapshots" ("organization_id");
