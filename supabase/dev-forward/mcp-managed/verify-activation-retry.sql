-- Append after verify.sql in the existing synthetic, rollback-only fixture.
SET SESSION AUTHORIZATION otr_mcp_operation_approval_gateway;
DO $resource$
DECLARE c jsonb:=current_setting('otr.qa.context')::jsonb;
 a uuid:=(c->>'accountId')::uuid;
 wrong jsonb:=jsonb_set(c,'{resource}','"https://synthetic.example.invalid/mcp"');
BEGIN
 BEGIN
  PERFORM public.mcp_managed_l3_trip_delete_approval('PREPARE',a,NULL,wrong,NULL,NULL);
  RAISE EXCEPTION 'FOREIGN_RESOURCE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'OPERATION_APPROVAL_CONTEXT' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.mcp_managed_risk_admission('ASSESS',a,wrong);
  RAISE EXCEPTION 'FOREIGN_RISK_RESOURCE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'RISK_ADMISSION_CLOSED' THEN RAISE; END IF;
 END;
END $resource$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION otr_trip_metadata_gateway;
DO $resource$
DECLARE c jsonb:=current_setting('otr.qa.context')::jsonb;
BEGIN
 BEGIN
  PERFORM public.mcp_managed_l3_assert_lifecycle((c->>'accountId')::uuid,(c->>'clientId')::uuid,
   'https://synthetic.example.invalid/mcp',(c#>>'{operationIds,0}')::uuid,
   c#>'{call,request}',c->'managedConsent');
  RAISE EXCEPTION 'FOREIGN_OWNING_RESOURCE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'OPERATION_APPROVAL_CLOSED' THEN RAISE; END IF;
 END;
END $resource$;
RESET SESSION AUTHORIZATION;
SELECT 'PASS the pinned resource rejects foreign resources even with forged legacy settings';

SET LOCAL ROLE postgres;
-- Keep EXECUTE briefly to exercise the function against a simulated established session.
ALTER ROLE otr_mcp_operation_approval_gateway NOLOGIN;
RESET ROLE;
SET SESSION AUTHORIZATION otr_mcp_operation_approval_gateway;
DO $closed$
DECLARE c jsonb:=current_setting('otr.qa.context')::jsonb;
BEGIN
 BEGIN
  PERFORM public.mcp_managed_l3_trip_delete_approval('PREPARE',(c->>'accountId')::uuid,NULL,c,NULL,NULL);
  RAISE EXCEPTION 'CLOSED_ROLE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'OPERATION_APPROVAL_CLOSED' THEN RAISE; END IF;
 END;
END $closed$;
RESET SESSION AUTHORIZATION;
SELECT 'PASS NOLOGIN denies an established session even with EXECUTE';
