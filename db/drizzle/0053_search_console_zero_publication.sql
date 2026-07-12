-- Publish Google Search Console tables to Zero's logical replication publication.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'zero') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'zero' AND schemaname = 'public' AND tablename = 'google_connections'
    ) THEN
      ALTER PUBLICATION "zero" ADD TABLE "google_connections";
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'zero' AND schemaname = 'public' AND tablename = 'search_console_properties'
    ) THEN
      ALTER PUBLICATION "zero" ADD TABLE "search_console_properties";
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'zero' AND schemaname = 'public' AND tablename = 'search_console_sitemaps'
    ) THEN
      ALTER PUBLICATION "zero" ADD TABLE "search_console_sitemaps";
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'zero' AND schemaname = 'public' AND tablename = 'search_console_metric_snapshots'
    ) THEN
      ALTER PUBLICATION "zero" ADD TABLE "search_console_metric_snapshots";
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'zero' AND schemaname = 'public' AND tablename = 'search_console_url_inspections'
    ) THEN
      ALTER PUBLICATION "zero" ADD TABLE "search_console_url_inspections";
    END IF;
  END IF;
END $$;
