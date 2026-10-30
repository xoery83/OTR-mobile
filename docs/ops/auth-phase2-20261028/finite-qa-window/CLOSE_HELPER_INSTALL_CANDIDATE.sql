-- CANDIDATE ONLY: Owner approval required for one private function and one EXECUTE.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
DO $gate$ BEGIN
 IF current_database()<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.close_helper_gate',true) IS DISTINCT FROM 'e7e9351e66cd732d94d988cae1785e87905c64c25040d80e5609e9afcc410875'
 OR to_regprocedure('otr_auth_guest_composite.close_qa_policy(boolean)') IS NOT NULL
 OR (SELECT count(*) FROM pg_proc WHERE pronamespace=to_regnamespace('otr_auth_guest_composite'))<>24
 OR NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND NOT enabled AND policy_version='otr.auth.fileless-p1.unpriced/1')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway' AND NOT rolsuper AND NOT rolcreaterole AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=66410 AND md5(pg_get_functiondef(oid))='6c7ef0d85cfd8893796ccc53e31f51f0')
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_EXACT_DEV_GATE_REQUIRED';END IF;
END $gate$;
-- Negative authority only; no user data, positive grant or activation path.
CREATE FUNCTION otr_auth_guest_composite.close_qa_policy(closing boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE active boolean; version text; row_xmin text; changed integer;
BEGIN
 IF closing IS NULL OR session_user NOT IN ('postgres','otr_trip_core_v2_gateway')
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_PRINCIPAL_REQUIRED' USING ERRCODE='42501';END IF;
 IF closing THEN
  SELECT enabled,policy_version,xmin::text INTO active,version,row_xmin
  FROM otr_auth_guest_composite.policy WHERE singleton FOR UPDATE;
 ELSE
  SELECT enabled,policy_version INTO active,version
  FROM otr_auth_guest_composite.policy WHERE singleton;
 END IF;
 IF NOT FOUND OR version<>'otr.auth.fileless-p1.unpriced/1'
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_POLICY_VERSION_REQUIRED' USING ERRCODE='55000';END IF;
 IF closing AND active THEN
  UPDATE otr_auth_guest_composite.policy SET enabled=false
  WHERE singleton AND enabled AND policy_version='otr.auth.fileless-p1.unpriced/1' AND xmin::text=row_xmin;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_CAS_FAILED' USING ERRCODE='40001';END IF;
  RETURN true;
 END IF;
 RETURN NOT active;
END $function$;
ALTER FUNCTION otr_auth_guest_composite.close_qa_policy(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION otr_auth_guest_composite.close_qa_policy(boolean) FROM PUBLIC,anon,authenticated,service_role,otr_trip_core_v2_writer;
GRANT EXECUTE ON FUNCTION otr_auth_guest_composite.close_qa_policy(boolean) TO otr_trip_core_v2_gateway;
DO $closed$ BEGIN
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace=to_regnamespace('otr_auth_guest_composite'))<>25
 OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='otr_auth_guest_composite.close_qa_policy(boolean)'::regprocedure AND (a.grantee NOT IN ((SELECT oid FROM pg_roles WHERE rolname='postgres'),(SELECT oid FROM pg_roles WHERE rolname='otr_trip_core_v2_gateway')) OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
 OR NOT has_function_privilege('otr_trip_core_v2_gateway','otr_auth_guest_composite.close_qa_policy(boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'AUTH_QA_CLOSE_PERMISSION_FOOTPRINT';END IF;
 IF NOT EXISTS(SELECT 1 FROM otr_auth_guest_composite.policy WHERE singleton AND NOT enabled AND policy_version='otr.auth.fileless-p1.unpriced/1')
 THEN RAISE EXCEPTION 'AUTH_QA_INSTALL_MUST_REMAIN_CLOSED';END IF;
END $closed$;
COMMIT;
