ALTER TABLE "mkt_distribution_runs"
  ADD COLUMN IF NOT EXISTS "scheduled_timezone" text NOT NULL DEFAULT 'America/Mexico_City';
