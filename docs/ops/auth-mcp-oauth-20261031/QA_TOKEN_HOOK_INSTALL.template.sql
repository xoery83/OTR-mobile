-- CANDIDATE ONLY. Two documented parameters are frozen by the approved executor:
-- CLIENT_UUID = the single newly registered public client's independently read-back ID.
-- DEADLINE_UTC = execution time + at most 30 minutes; never an unbounded policy.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $gate$
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.mcp_qa_gate',true) IS DISTINCT FROM 'OTR_MCP_OAUTH_QA_20261031_V1'
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.otr_mcp_qa_access_token(jsonb)')
   AND md5(prosrc)='__CLOSED_BODY_MD5__' AND proowner='postgres'::regrole
   AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin' AND NOT rolsuper)
 OR '__DEADLINE_UTC__'::timestamptz<=clock_timestamp()+interval '2 minutes'
 OR '__DEADLINE_UTC__'::timestamptz>clock_timestamp()+interval '30 minutes'
 THEN RAISE EXCEPTION 'MCP_QA_EXACT_INSTALL_GATE_REQUIRED'; END IF;
END $gate$;
CREATE OR REPLACE FUNCTION public.otr_mcp_qa_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $hook$
DECLARE
 claims jsonb:=event->'claims';
 client text:=claims->>'client_id';
 deadline constant timestamptz:='__DEADLINE_UTC__';
 now_epoch bigint:=floor(extract(epoch FROM clock_timestamp()));
 ttl bigint;
BEGIN
 IF jsonb_typeof(claims) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'MCP_QA_INVALID_HOOK_INPUT'; END IF;
 -- Native OTP/Google sessions keep every original claim unchanged.
 IF client IS NULL THEN RETURN jsonb_build_object('claims',claims); END IF;
 IF client IS DISTINCT FROM '__CLIENT_UUID__'
 OR event->>'user_id' IS DISTINCT FROM '1f3d7935-1bdc-4952-8d7f-0f72077368c1'
 OR claims->>'sub' IS DISTINCT FROM '1f3d7935-1bdc-4952-8d7f-0f72077368c1'
 OR claims->>'is_anonymous' IS DISTINCT FROM 'false'
 OR claims->>'role' IS DISTINCT FROM 'authenticated'
 OR coalesce(claims->>'aud','') NOT IN ('authenticated','https://api-dev.xoery.art/mcp')
 OR clock_timestamp()>=deadline
 OR claims->>'session_id' IS NULL
 OR NOT ((claims->>'session_id')::uuid IS NOT NULL)
 OR (claims->>'session_id')::uuid='00000000-0000-0000-0000-000000000000'::uuid
 OR claims->>'exp' IS NULL OR claims->>'exp' !~ '^[0-9]{1,15}$'
 THEN RAISE EXCEPTION 'MCP_QA_OAUTH_ISSUANCE_CLOSED' USING ERRCODE='42501'; END IF;
 ttl:=least((claims->>'exp')::bigint,now_epoch+60,floor(extract(epoch FROM deadline))::bigint);
 IF ttl IS NULL OR ttl<=now_epoch
 THEN RAISE EXCEPTION 'MCP_QA_TOKEN_EXPIRED'; END IF;
 RETURN jsonb_build_object('claims',claims||jsonb_build_object(
   'aud','https://api-dev.xoery.art/mcp',
   'otr_scopes',jsonb_build_array('otr.trips.read'),'exp',ttl));
END $hook$;
ALTER FUNCTION public.otr_mcp_qa_access_token(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.otr_mcp_qa_access_token(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.otr_mcp_qa_access_token(jsonb) TO supabase_auth_admin;
DO $acl$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE p.oid='public.otr_mcp_qa_access_token(jsonb)'::regprocedure AND
 (a.grantee NOT IN ((SELECT oid FROM pg_roles WHERE rolname='postgres'),
                   (SELECT oid FROM pg_roles WHERE rolname='supabase_auth_admin'))
  OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
 OR NOT has_function_privilege('supabase_auth_admin','public.otr_mcp_qa_access_token(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'MCP_QA_HOOK_ACL_DRIFT'; END IF;
END $acl$;
COMMIT;
