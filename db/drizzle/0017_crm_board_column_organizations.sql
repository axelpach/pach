ALTER TABLE "crm_board_columns" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

UPDATE "crm_board_columns"
SET "organization_id" = "crm_boards"."organization_id"
FROM "crm_boards"
WHERE "crm_board_columns"."board_id" = "crm_boards"."id"
  AND "crm_board_columns"."organization_id" IS NULL;

CREATE INDEX IF NOT EXISTS "crm_board_columns_organization_idx" ON "crm_board_columns" ("organization_id");
