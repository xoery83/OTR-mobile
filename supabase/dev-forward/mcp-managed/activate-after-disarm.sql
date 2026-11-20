-- Retry on the closed installation from MCP-MANAGED-STANDING-20261120-01.
-- The operator provisions the private SCRAM verifier in this same transaction.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';

DO $activation$
DECLARE
 candidate record;
 definition text;
 approval_role constant text := 'otr_mcp_operation_approval_gateway';
 role_setting constant text := 'current_setting(''otr.mcp_beta.risk_enabled'',true) IS DISTINCT FROM ''on''';
 resource_setting constant text := 'current_setting(''otr.mcp_beta.resource'',true)';
 closed_check constant text := 'NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=''otr_mcp_operation_approval_gateway'' AND rolcanlogin)';
 pinned_resource constant text := '''https://api-dev.xoery.art/mcp''';
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_roles
   WHERE rolname=approval_role
     AND NOT (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit)
 ) THEN
  RAISE EXCEPTION 'MCP_ACTIVATION_REQUIRES_CLOSED_PRIVATE_ROLE';
 END IF;

 FOR candidate IN SELECT * FROM (VALUES
   ('public.mcp_managed_l3_assert_lifecycle(uuid,uuid,text,uuid,jsonb,jsonb)'::regprocedure,'608b0522a0c9fba8cb91bf4da9b9af8d','otr_trip_metadata_gateway',1),
   ('public.mcp_managed_l3_trip_delete_approval(text,uuid,uuid,jsonb,boolean,uuid)'::regprocedure,'9ca60e66ba55fe961c1580fb9f612a18',approval_role,2),
   ('public.mcp_managed_risk_admission(text,uuid,jsonb)'::regprocedure,'e457aa33ed35f60f4a1309819e88047b',approval_role,1),
   ('public.mcp_managed_risk_plan_fence(uuid,jsonb)'::regprocedure,'f6946083185e52d43f0fae85d9d0beaa',approval_role,1)
 ) AS required(signature, fingerprint, runtime_role, resource_checks)
 LOOP
  SELECT pg_get_functiondef(p.oid) INTO STRICT definition
  FROM pg_catalog.pg_proc p
  WHERE p.oid=candidate.signature AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres';

  IF md5(definition) IS DISTINCT FROM candidate.fingerprint
     OR cardinality(string_to_array(definition,role_setting)) <> 2
     OR cardinality(string_to_array(definition,resource_setting)) <> candidate.resource_checks+1
     OR has_function_privilege(candidate.runtime_role,candidate.signature,'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r(role_name)
       WHERE has_function_privilege(r.role_name,candidate.signature,'EXECUTE')
     )
  THEN
   RAISE EXCEPTION 'MCP_ACTIVATION_PREIMAGE_CHANGED: %',candidate.signature;
  END IF;

  EXECUTE replace(replace(definition,role_setting,closed_check),resource_setting,pinned_resource);
 END LOOP;
END $activation$;

GRANT EXECUTE ON FUNCTION public.mcp_managed_l3_trip_delete_approval(text,uuid,uuid,jsonb,boolean,uuid),
 public.mcp_managed_risk_admission(text,uuid,jsonb),public.mcp_managed_risk_plan_fence(uuid,jsonb)
 TO otr_mcp_operation_approval_gateway;
GRANT EXECUTE ON FUNCTION public.mcp_managed_l3_assert_lifecycle(uuid,uuid,text,uuid,jsonb,jsonb)
 TO otr_trip_metadata_gateway;
ALTER ROLE otr_mcp_operation_approval_gateway LOGIN CONNECTION LIMIT 1;
COMMIT;
