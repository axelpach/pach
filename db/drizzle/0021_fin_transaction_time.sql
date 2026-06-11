ALTER TABLE "fin_import_items" ADD COLUMN IF NOT EXISTS "transaction_time" text NOT NULL DEFAULT '00:00:00';
ALTER TABLE "fin_movements" ADD COLUMN IF NOT EXISTS "transaction_time" text NOT NULL DEFAULT '00:00:00';
