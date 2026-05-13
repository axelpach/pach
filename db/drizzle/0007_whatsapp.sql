-- WhatsApp templates, campaigns, and message logs.

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"status" text NOT NULL,
	"category" text NOT NULL,
	"header_format" text,
	"header_text" text,
	"header_sample_url" text,
	"body_text" text,
	"footer_text" text,
	"components" jsonb,
	"variables" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_templates_company_name_language_unique" UNIQUE ("company_id", "name", "language")
);

ALTER TABLE "whatsapp_templates" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "whatsapp_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"template_id" uuid NOT NULL REFERENCES "whatsapp_templates"("id"),
	"name" text NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"recipient_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"variable_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"media_id" text,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "whatsapp_campaigns" REPLICA IDENTITY FULL;

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id"),
	"campaign_id" uuid REFERENCES "whatsapp_campaigns"("id"),
	"contact_id" uuid REFERENCES "crm_contacts"("id"),
	"phone" text NOT NULL,
	"template_name" text NOT NULL,
	"status" text NOT NULL DEFAULT 'queued',
	"meta_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "whatsapp_messages" REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS "whatsapp_messages_campaign_idx" ON "whatsapp_messages"("campaign_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_contact_idx" ON "whatsapp_messages"("contact_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_meta_message_idx" ON "whatsapp_messages"("meta_message_id");
