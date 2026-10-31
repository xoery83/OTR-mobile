-- Candidate only: no Owner approval or unique Writer activation is implied.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $pre$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'PARENT_INSTALL_PRINCIPAL_MISMATCH'; END IF;
 IF to_regprocedure('public.trip_create_parent_result(uuid,uuid)') IS NOT NULL THEN
  RAISE EXCEPTION 'PARENT_INSTALL_NOT_NEW';
 END IF;
 IF md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'f850804dd98ebd5f33633498000e9e8a'
 OR md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '2fc18c1345ab1ae7231a33893745fb52' THEN
  RAISE EXCEPTION 'PARENT_OWNING_PREIMAGE_DRIFT';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
   WHERE p.oid IN ('public.trip_create_result(uuid,uuid)'::regprocedure,'public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)
   AND (r.rolname <> 'postgres' OR NOT p.prosecdef)) THEN
  RAISE EXCEPTION 'PARENT_OWNING_PRINCIPAL_DRIFT';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_create_gateway'
   AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit
   AND rolcanlogin AND NOT rolreplication AND NOT rolbypassrls) THEN
  RAISE EXCEPTION 'PARENT_GATEWAY_PREIMAGE_DRIFT';
 END IF;
 IF NOT has_function_privilege('otr_trip_create_gateway','public.trip_create_result(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('otr_trip_create_gateway','public.trip_create_finite_scope_allowed(uuid,uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'PARENT_OWNING_EXECUTE_DRIFT';
 END IF;
 IF has_table_privilege('otr_trip_create_gateway','public.trip_create_receipts','SELECT') THEN
  RAISE EXCEPTION 'PARENT_GATEWAY_TABLE_AUTHORITY_UNEXPECTED';
 END IF;
END $pre$;
-- Candidate only. Installing this new EXECUTE requires the exact Owner DEV Gate.
-- The owning result routine retains its current authorization and finite-scope checks.
CREATE FUNCTION public.trip_create_parent_result(p_actor uuid,p_trip uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE operations uuid[];
BEGIN
 IF session_user<>'otr_trip_create_gateway' OR p_actor IS NULL OR p_trip IS NULL THEN
  RAISE EXCEPTION 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
 SELECT ARRAY(
  SELECT operation_id FROM public.trip_create_receipts
  WHERE actor_account_id=p_actor AND trip_id=p_trip
    AND request_payload->'formatVersion'='2'::jsonb
  ORDER BY operation_id LIMIT 2
 ) INTO operations;
 IF cardinality(operations)=0 THEN RETURN NULL; END IF;
 IF cardinality(operations)<>1 THEN
  RAISE EXCEPTION 'TRIP_CREATE_PARENT_AMBIGUOUS' USING ERRCODE='55000';
 END IF;
 RETURN public.trip_create_result(operations[1],p_actor);
END $$;
ALTER FUNCTION public.trip_create_parent_result(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trip_create_parent_result(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trip_create_parent_result(uuid,uuid)
 TO otr_trip_create_gateway;

DO $post$
DECLARE f oid := 'public.trip_create_parent_result(uuid,uuid)'::regprocedure;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=f AND (a.grantee NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('postgres','otr_trip_create_gateway'))
     OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='otr_trip_create_gateway') AND a.is_grantable))) THEN
  RAISE EXCEPTION 'PARENT_FUNCTION_ACL_UNEXPECTED';
 END IF;
 IF NOT has_function_privilege('otr_trip_create_gateway',f,'EXECUTE')
 OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
 OR has_function_privilege('service_role',f,'EXECUTE')
 OR has_table_privilege('otr_trip_create_gateway','public.trip_create_receipts','SELECT') THEN
  RAISE EXCEPTION 'PARENT_FUNCTION_AUTHORITY_MISMATCH';
 END IF;
 IF md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'f850804dd98ebd5f33633498000e9e8a'
 OR md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '2fc18c1345ab1ae7231a33893745fb52' THEN
  RAISE EXCEPTION 'PARENT_OWNING_POSTIMAGE_CHANGED';
 END IF;
END $post$;
COMMIT;
