-- Extend whatsapp_messages to support inbound replies + add the
-- Ardia Marketing company that owns the new WABA's templates.

ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "direction" text NOT NULL DEFAULT 'outbound';
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "inbound_profile_name" text;
ALTER TABLE "whatsapp_messages" ALTER COLUMN "template_name" DROP NOT NULL;

-- Index inbound messages by phone for fast inbox grouping
CREATE INDEX IF NOT EXISTS "whatsapp_messages_phone_idx" ON "whatsapp_messages" ("phone");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_direction_idx" ON "whatsapp_messages" ("direction");

-- Insert the Ardia Marketing company row so the new WABA's templates
-- have somewhere to live. Idempotent: only inserts if no row with
-- project='ardia-mkt' exists yet.
INSERT INTO "companies" ("name", "legal_name", "tax_id", "project", "description")
SELECT 'Ardia Marketing', 'Ardia, S.A.P.I. de C.V.', NULL, 'ardia-mkt', 'Marketing WABA (separate Mexican number for campaigns)'
WHERE NOT EXISTS (SELECT 1 FROM "companies" WHERE "project" = 'ardia-mkt');
