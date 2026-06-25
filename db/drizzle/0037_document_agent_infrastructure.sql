ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "editorial_profile" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "mkt_publications" ADD COLUMN IF NOT EXISTS "editorial_profile" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "public_id" text;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "current_snapshot_id" uuid;

WITH numbered AS (
  SELECT
    d."id",
    COALESCE(
      NULLIF(
        UPPER(SUBSTRING(REGEXP_REPLACE(COALESCE(o."project", o."name", 'doc'), '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 3)),
        ''
      ),
      'DOC'
    ) AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY d."organization_id"
      ORDER BY d."created_at", d."id"
    ) AS rn
  FROM "documents" d
  LEFT JOIN "organizations" o ON o."id" = d."organization_id"
  WHERE d."public_id" IS NULL
)
UPDATE "documents" d
SET "public_id" = numbered.prefix || '-DOC-' || numbered.rn::text
FROM numbered
WHERE d."id" = numbered."id";

CREATE UNIQUE INDEX IF NOT EXISTS "documents_organization_public_id_idx" ON "documents" ("organization_id", "public_id");

CREATE TABLE IF NOT EXISTS "document_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "version_number" integer NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "format" text NOT NULL DEFAULT 'markdown',
  "status" text NOT NULL DEFAULT 'version',
  "created_by_type" text NOT NULL DEFAULT 'user',
  "created_by_id" uuid REFERENCES "users"("id"),
  "agent_run_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_snapshots_document_version_idx" ON "document_snapshots" ("document_id", "version_number");
CREATE INDEX IF NOT EXISTS "document_snapshots_document_status_idx" ON "document_snapshots" ("document_id", "status");
CREATE INDEX IF NOT EXISTS "document_snapshots_organization_idx" ON "document_snapshots" ("organization_id");
CREATE INDEX IF NOT EXISTS "document_snapshots_agent_run_idx" ON "document_snapshots" ("agent_run_id");

WITH seeded AS (
  INSERT INTO "document_snapshots" (
    "document_id",
    "organization_id",
    "version_number",
    "title",
    "slug",
    "body",
    "format",
    "status",
    "created_by_type",
    "metadata",
    "created_at"
  )
  SELECT
    d."id",
    d."organization_id",
    1,
    d."title",
    d."slug",
    d."body",
    d."format",
    'version',
    'migration',
    jsonb_build_object('source', '0037_document_agent_infrastructure'),
    d."updated_at"
  FROM "documents" d
  WHERE NOT EXISTS (
    SELECT 1
    FROM "document_snapshots" existing
    WHERE existing."document_id" = d."id"
  )
  RETURNING "id", "document_id"
)
UPDATE "documents" d
SET "current_snapshot_id" = seeded."id"
FROM seeded
WHERE d."id" = seeded."document_id"
  AND d."current_snapshot_id" IS NULL;

WITH latest AS (
  SELECT DISTINCT ON ("document_id")
    "id",
    "document_id"
  FROM "document_snapshots"
  ORDER BY "document_id", "version_number" DESC, "created_at" DESC
)
UPDATE "documents" d
SET "current_snapshot_id" = latest."id"
FROM latest
WHERE d."id" = latest."document_id"
  AND (
    d."current_snapshot_id" IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "document_snapshots" existing
      WHERE existing."id" = d."current_snapshot_id"
    )
  );

ALTER TABLE "document_snapshots" REPLICA IDENTITY FULL;
