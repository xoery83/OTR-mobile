BEGIN;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
DO $gate$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('otr.auth.approved_project_ref',true) IS DISTINCT FROM 'tuqigdxrvrerfewsxqgm'
 OR current_setting('otr.auth.mcp_qa_gate',true) IS DISTINCT FROM 'OTR_MCP_OAUTH_QA_20261031_V1'
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.otr_mcp_qa_access_token(jsonb)')
 AND md5(prosrc) IN ('5d5f05b8d4c282470072569129cad0ab','b0f7eae14599bd32cb9430a59832c837')
 AND proowner='postgres'::regrole AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
 THEN RAISE EXCEPTION 'MCP_QA_CLOSE_CAS_REQUIRED';END IF;
END $gate$;
CREATE OR REPLACE FUNCTION public.otr_mcp_qa_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $hook$
DECLARE claims jsonb:=event->'claims';
BEGIN
 IF jsonb_typeof(claims) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'MCP_QA_INVALID_HOOK_INPUT'; END IF;
 IF claims->>'client_id' IS NOT NULL
 THEN RAISE EXCEPTION 'MCP_QA_OAUTH_ISSUANCE_CLOSED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('claims',claims);
END $hook$;
COMMIT;
