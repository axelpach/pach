-- Rename CRM tables for clarity (rename first, then reuse 'companies' name for own ventures)
ALTER TABLE "companies" RENAME TO "crm_companies";
ALTER TABLE "deals" RENAME TO "crm_deals";
ALTER TABLE "contacts" RENAME TO "crm_contacts";

-- Create companies table for own companies/ventures (Ardia, etc.)
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tax_id" text,
	"tax_regime" text,
	"project" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable replication for Zero sync
ALTER TABLE "companies" REPLICA IDENTITY FULL;
