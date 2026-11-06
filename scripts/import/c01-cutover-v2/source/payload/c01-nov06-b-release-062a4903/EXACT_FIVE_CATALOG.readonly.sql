BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1s';
WITH requested AS (SELECT unnest(ARRAY[
  'public.trip_source_finite_native_original_context(uuid,text)',
  'public.trip_source_begin_finite_universal_inputs(uuid,uuid,text)',
  'public.trip_source_finite_native_run_row(text,text,jsonb)',
  'public.trip_source_find_finite_universal_binding(uuid,uuid,uuid,uuid,uuid,text,jsonb)',
  'public.trip_source_acquire_source(uuid,text)'
]) AS identity)
SELECT jsonb_build_object(
 'sessionUser',session_user,'currentUser',current_user,
 'readOnly',current_setting('transaction_read_only')='on',
 'backendPid',pg_backend_pid(),'database',current_database(),
 'systemIdentifier',(pg_control_system()).system_identifier::text,
 'catalog',jsonb_agg(jsonb_build_object(
 'identity',requested.identity,'oid',p.oid,'owner',pg_get_userbyid(p.proowner),
 'acl',p.proacl,'security_definer',p.prosecdef,'volatility',p.provolatile,
 'strict',p.proisstrict,'parallel',p.proparallel,'config',p.proconfig,
 'language',l.lanname,'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
 'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
) ORDER BY requested.identity)) AS result
FROM requested LEFT JOIN pg_proc p ON p.oid=to_regprocedure(requested.identity)
LEFT JOIN pg_language l ON l.oid=p.prolang;
ROLLBACK;
