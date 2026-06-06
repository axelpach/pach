-- Rename Pach-owned company contexts into organizations.
ALTER TABLE "companies" RENAME TO "organizations";

ALTER TABLE "users"
  ADD COLUMN "can_access_unscoped" boolean NOT NULL DEFAULT false;

-- Existing users are current operators; keep their access to unscoped content.
UPDATE "users" SET "can_access_unscoped" = true;

CREATE TABLE "organization_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text NOT NULL DEFAULT 'owner',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "organization_memberships_user_organization_idx"
  ON "organization_memberships" ("user_id", "organization_id");
CREATE INDEX "organization_memberships_organization_idx"
  ON "organization_memberships" ("organization_id");
CREATE INDEX "organization_memberships_user_idx"
  ON "organization_memberships" ("user_id");

ALTER TABLE "organization_memberships" REPLICA IDENTITY FULL;

INSERT INTO "organization_memberships" ("organization_id", "user_id", "role")
SELECT "organizations"."id", "users"."id", 'owner'
FROM "organizations"
CROSS JOIN "users"
ON CONFLICT DO NOTHING;

INSERT INTO "organizations" ("name", "project", "description")
SELECT 'Ardia', 'ardia', 'Ardia operating organization'
WHERE NOT EXISTS (
  SELECT 1 FROM "organizations"
  WHERE lower("name") = 'ardia' OR lower(coalesce("project", '')) = 'ardia'
);

INSERT INTO "organization_memberships" ("organization_id", "user_id", "role")
SELECT "organizations"."id", "users"."id", 'owner'
FROM "organizations"
CROSS JOIN "users"
WHERE lower("organizations"."name") = 'ardia' OR lower(coalesce("organizations"."project", '')) = 'ardia'
ON CONFLICT DO NOTHING;

ALTER TABLE "decks"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

UPDATE "decks"
SET "organization_id" = "organizations"."id"
FROM "organizations"
WHERE "decks"."project" = "organizations"."project";

ALTER TABLE "crm_companies"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "crm_contacts"
  RENAME COLUMN "company_id" TO "crm_company_id";

ALTER TABLE "crm_contacts"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "crm_deals"
  RENAME COLUMN "company_id" TO "crm_company_id";

ALTER TABLE "crm_deals"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "crm_deal_contacts"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "crm_notes"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

ALTER TABLE "crm_boards"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id");

WITH ardia AS (
  SELECT "id"
  FROM "organizations"
  WHERE lower(coalesce("project", '')) = 'ardia' OR lower("name") = 'ardia'
  ORDER BY CASE WHEN lower(coalesce("project", '')) = 'ardia' THEN 0 ELSE 1 END
  LIMIT 1
)
UPDATE "crm_companies"
SET "organization_id" = (SELECT "id" FROM ardia)
WHERE "organization_id" IS NULL;

WITH ardia AS (
  SELECT "id"
  FROM "organizations"
  WHERE lower(coalesce("project", '')) = 'ardia' OR lower("name") = 'ardia'
  ORDER BY CASE WHEN lower(coalesce("project", '')) = 'ardia' THEN 0 ELSE 1 END
  LIMIT 1
)
UPDATE "crm_contacts"
SET "organization_id" = (SELECT "id" FROM ardia)
WHERE "organization_id" IS NULL;

WITH ardia AS (
  SELECT "id"
  FROM "organizations"
  WHERE lower(coalesce("project", '')) = 'ardia' OR lower("name") = 'ardia'
  ORDER BY CASE WHEN lower(coalesce("project", '')) = 'ardia' THEN 0 ELSE 1 END
  LIMIT 1
)
UPDATE "crm_deals"
SET "organization_id" = (SELECT "id" FROM ardia)
WHERE "organization_id" IS NULL;

UPDATE "crm_notes"
SET "organization_id" = coalesce(
  (SELECT "organization_id" FROM "crm_deals" WHERE "crm_deals"."id" = "crm_notes"."deal_id"),
  (SELECT "organization_id" FROM "crm_contacts" WHERE "crm_contacts"."id" = "crm_notes"."contact_id")
)
WHERE "organization_id" IS NULL;

WITH ardia AS (
  SELECT "id"
  FROM "organizations"
  WHERE lower(coalesce("project", '')) = 'ardia' OR lower("name") = 'ardia'
  ORDER BY CASE WHEN lower(coalesce("project", '')) = 'ardia' THEN 0 ELSE 1 END
  LIMIT 1
)
UPDATE "crm_notes"
SET "organization_id" = (SELECT "id" FROM ardia)
WHERE "organization_id" IS NULL;

UPDATE "crm_deal_contacts"
SET "organization_id" = coalesce(
  (SELECT "organization_id" FROM "crm_deals" WHERE "crm_deals"."id" = "crm_deal_contacts"."deal_id"),
  (SELECT "organization_id" FROM "crm_contacts" WHERE "crm_contacts"."id" = "crm_deal_contacts"."contact_id")
)
WHERE "organization_id" IS NULL;

WITH ardia AS (
  SELECT "id"
  FROM "organizations"
  WHERE lower(coalesce("project", '')) = 'ardia' OR lower("name") = 'ardia'
  ORDER BY CASE WHEN lower(coalesce("project", '')) = 'ardia' THEN 0 ELSE 1 END
  LIMIT 1
)
UPDATE "crm_deal_contacts"
SET "organization_id" = (SELECT "id" FROM ardia)
WHERE "organization_id" IS NULL;

WITH ardia AS (
  SELECT "id"
  FROM "organizations"
  WHERE lower(coalesce("project", '')) = 'ardia' OR lower("name") = 'ardia'
  ORDER BY CASE WHEN lower(coalesce("project", '')) = 'ardia' THEN 0 ELSE 1 END
  LIMIT 1
)
UPDATE "crm_boards"
SET "organization_id" = (SELECT "id" FROM ardia)
WHERE "organization_id" IS NULL;

CREATE INDEX "decks_organization_idx" ON "decks" ("organization_id");
CREATE INDEX "crm_companies_organization_idx" ON "crm_companies" ("organization_id");
CREATE INDEX "crm_contacts_organization_idx" ON "crm_contacts" ("organization_id");
CREATE INDEX "crm_contacts_crm_company_idx" ON "crm_contacts" ("crm_company_id");
CREATE INDEX "crm_deals_organization_idx" ON "crm_deals" ("organization_id");
CREATE INDEX "crm_deals_crm_company_idx" ON "crm_deals" ("crm_company_id");
CREATE INDEX "crm_deal_contacts_organization_idx" ON "crm_deal_contacts" ("organization_id");
CREATE INDEX "crm_notes_organization_idx" ON "crm_notes" ("organization_id");
CREATE INDEX "crm_boards_organization_idx" ON "crm_boards" ("organization_id");
