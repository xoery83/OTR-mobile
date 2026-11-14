-- CANDIDATE ONLY. Install while OAuth Server remains OFF, before any client exists.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $gate$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.mcp_qa_gate',true) IS DISTINCT FROM 'OTR_MCP_OAUTH_QA_20261031_V1'
 OR to_regprocedure('public.otr_mcp_qa_access_token(jsonb)') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin' AND NOT rolsuper)
 THEN RAISE EXCEPTION 'MCP_QA_EXACT_INSTALL_GATE_REQUIRED'; END IF;
END $gate$;
CREATE FUNCTION public.otr_mcp_qa_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $hook$
DECLARE claims jsonb:=event->'claims';
BEGIN
 IF jsonb_typeof(claims) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'MCP_QA_INVALID_HOOK_INPUT'; END IF;
 IF claims->>'client_id' IS NOT NULL
 THEN RAISE EXCEPTION 'MCP_QA_OAUTH_ISSUANCE_CLOSED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('claims',claims);
END $hook$;
ALTER FUNCTION public.otr_mcp_qa_access_token(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.otr_mcp_qa_access_token(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.otr_mcp_qa_access_token(jsonb) TO supabase_auth_admin;
DO $acl$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE p.oid='public.otr_mcp_qa_access_token(jsonb)'::regprocedure AND
 (a.grantee NOT IN ((SELECT oid FROM pg_roles WHERE rolname='postgres'),
                   (SELECT oid FROM pg_roles WHERE rolname='supabase_auth_admin'))
  OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
 OR NOT has_function_privilege('supabase_auth_admin','public.otr_mcp_qa_access_token(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'MCP_QA_HOOK_ACL_DRIFT'; END IF;
END $acl$;
COMMIT;
