-- Join table for many-to-many deal <-> contact relationship
CREATE TABLE IF NOT EXISTS "crm_deal_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL REFERENCES "crm_deals"("id"),
	"contact_id" uuid NOT NULL REFERENCES "crm_contacts"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "crm_deal_contacts" REPLICA IDENTITY FULL;

-- Drop the old single contact_id FK from deals
ALTER TABLE "crm_deals" DROP COLUMN IF EXISTS "contact_id";
