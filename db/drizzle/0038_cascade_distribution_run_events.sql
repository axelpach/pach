ALTER TABLE "mkt_content_events" DROP CONSTRAINT IF EXISTS "mkt_content_events_distribution_run_id_fkey";

ALTER TABLE "mkt_content_events"
  ADD CONSTRAINT "mkt_content_events_distribution_run_id_fkey"
  FOREIGN KEY ("distribution_run_id")
  REFERENCES "mkt_distribution_runs"("id")
  ON DELETE CASCADE;
