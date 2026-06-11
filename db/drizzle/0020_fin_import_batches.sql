ALTER TABLE "fin_imports" ADD COLUMN IF NOT EXISTS "batch_id" uuid;

CREATE INDEX IF NOT EXISTS "fin_imports_batch_idx" ON "fin_imports" ("batch_id");
