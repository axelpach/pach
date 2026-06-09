ALTER TABLE "fin_accounts" ADD COLUMN IF NOT EXISTS "holder_user_id" uuid REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "fin_accounts_holder_user_idx" ON "fin_accounts" ("holder_user_id");
