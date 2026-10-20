CREATE ROLE supabase_privileged_role NOLOGIN;
-- Session-independent fixture identity, never installed on Hosted.
COMMENT ON DATABASE postgres IS 'OTR_DISPOSABLE_DEV:tuqigdxrvrerfewsxqgm';
CREATE ROLE postgres LOGIN CREATEROLE;
GRANT supabase_privileged_role TO postgres;
GRANT pg_signal_backend TO postgres;
-- Fixture-only authorized administrative observation; no such Hosted grant is made.
GRANT SELECT ON pg_authid TO postgres;
CREATE ROLE otr_trip_publication_catalog_reader NOLOGIN NOINHERIT CONNECTION LIMIT 1;
GRANT otr_trip_publication_catalog_reader TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
CREATE ROLE app_observer LOGIN;
CREATE ROLE monitor_observer LOGIN;
GRANT pg_monitor TO monitor_observer;
CREATE EXTENSION pg_stat_statements;
CREATE EXTENSION pgaudit;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- Accepted shared PUBLIC CONNECT/TEMP stays intact; no ACL tightening to pass tests.
GRANT CONNECT ON DATABASE postgres TO postgres,app_observer,monitor_observer,otr_trip_publication_catalog_reader;
CREATE FUNCTION public.trip_source_read_import_catalogs(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
REVOKE ALL ON FUNCTION public.trip_source_read_import_catalogs(uuid,uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO otr_trip_publication_catalog_reader;
GRANT EXECUTE ON FUNCTION public.trip_source_read_import_catalogs(uuid,uuid) TO otr_trip_publication_catalog_reader;
ALTER ROLE otr_trip_publication_catalog_reader SET search_path='pg_catalog';
ALTER ROLE otr_trip_publication_catalog_reader SET default_transaction_read_only=on;
ALTER ROLE otr_trip_publication_catalog_reader SET statement_timeout='5s';
ALTER ROLE otr_trip_publication_catalog_reader SET lock_timeout='1s';
ALTER ROLE otr_trip_publication_catalog_reader SET idle_in_transaction_session_timeout='5s';
