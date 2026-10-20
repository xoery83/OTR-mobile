BEGIN READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL search_path = pg_catalog;
SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'migration_table_exists', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'migration_select_allowed', has_table_privilege(current_user,
    'supabase_migrations.schema_migrations', 'SELECT'),
  'migration_rls_enabled', (
    SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'supabase_migrations' AND c.relname = 'schema_migrations'
  ),
  'migration_forced_rls', (
    SELECT c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'supabase_migrations' AND c.relname = 'schema_migrations'
  ),
  'selected_core_table_exists', to_regclass('public.trip_core_read_state') IS NOT NULL,
  'selected_trip_receipt_table_exists', to_regclass('public.trip_create_receipts') IS NOT NULL,
  'role_catalog_select_allowed', has_table_privilege(current_user, 'pg_catalog.pg_roles', 'SELECT')
) AS meta01_visibility;
COMMIT;
