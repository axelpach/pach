-- Add Google Search Console tables to Zero's public logical replication publications.
-- Modern Zero names these publications like _zero_public_0.

DO $$
DECLARE
  publication_name text;
  target_table_name text;
  target_table_names text[] := ARRAY[
    'google_connections',
    'search_console_properties',
    'search_console_sitemaps',
    'search_console_metric_snapshots',
    'search_console_url_inspections'
  ];
BEGIN
  FOR publication_name IN
    SELECT pubname
    FROM pg_publication
    WHERE pubname = 'zero' OR pubname LIKE '\_zero\_public\_%' ESCAPE '\'
  LOOP
    FOREACH target_table_name IN ARRAY target_table_names
    LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = target_table_name
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = publication_name
          AND schemaname = 'public'
          AND tablename = target_table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION %I ADD TABLE %I.%I', publication_name, 'public', target_table_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
