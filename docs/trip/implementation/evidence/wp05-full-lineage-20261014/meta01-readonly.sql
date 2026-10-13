BEGIN READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL search_path = pg_catalog;
SELECT jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'migrations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261011000100', '20261013000500')
  ), '[]'::jsonb),
  'columns', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'column', a.attname,
      'type', format_type(a.atttypid, a.atttypmod)) ORDER BY c.relname, a.attnum)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relname IN ('trip_core_read_state', 'trip_create_receipts')
      AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
  ), '[]'::jsonb),
  'functions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid)) ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('trip_create_command', 'trip_create_result')
  ), '[]'::jsonb),
  'roles', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', rolname, 'can_login', rolcanlogin,
      'inherit', rolinherit, 'super', rolsuper, 'bypass_rls', rolbypassrls) ORDER BY rolname)
    FROM pg_roles WHERE rolname IN ('otr_trip_create_gateway', 'otr_trip_core_v2_gateway',
      'otr_trip_core_v2_writer')
  ), '[]'::jsonb),
  'selected_role_memberships', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('granted_role', granted.rolname,
      'member_role', member.rolname, 'admin', am.admin_option,
      'inherit', am.inherit_option, 'set', am.set_option)
      ORDER BY granted.rolname, member.rolname)
    FROM pg_auth_members am JOIN pg_roles granted ON granted.oid = am.roleid
      JOIN pg_roles member ON member.oid = am.member
    WHERE granted.rolname IN ('otr_trip_create_gateway', 'otr_trip_core_v2_gateway',
      'otr_trip_core_v2_writer') AND member.rolname IN ('otr_trip_create_gateway',
      'otr_trip_core_v2_gateway', 'otr_trip_core_v2_writer')
  ), '[]'::jsonb),
  'external_membership_edge_counts', COALESCE((
    SELECT jsonb_object_agg(r.rolname, (
      SELECT count(*) FROM pg_auth_members am
      WHERE am.roleid = r.oid OR am.member = r.oid
    ))
    FROM pg_roles r WHERE r.rolname IN ('otr_trip_create_gateway',
      'otr_trip_core_v2_gateway', 'otr_trip_core_v2_writer')
  ), '{}'::jsonb)
) AS meta01;
COMMIT;
