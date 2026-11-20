-- Execute after the forward SQL in the existing synthetic fixture's open transaction.
DO $compatibility$
BEGIN
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_create_parent_result(uuid,uuid)'))) IS DISTINCT FROM '9065ee93c4628582ddf277a9072f0dd9' THEN
  RAISE EXCEPTION 'GUEST_OR_PARENT_RECEIPT_CONTRACT_CHANGED';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_metadata_snapshot(uuid,uuid,uuid)'))) IS DISTINCT FROM '10416fb3c367b19dd14153f86b924aab' THEN
  RAISE EXCEPTION 'GUEST_OR_PARENT_RECEIPT_CONTRACT_CHANGED';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_metadata_update_result(uuid,uuid)'))) IS DISTINCT FROM '382a1ef1768e73fb95f0ecaaf50b4abf' THEN
  RAISE EXCEPTION 'GUEST_OR_PARENT_RECEIPT_CONTRACT_CHANGED';
 END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'))) IS DISTINCT FROM 'f593afc154e60ffbe885d887af48820a' THEN
  RAISE EXCEPTION 'GUEST_OR_PARENT_RECEIPT_CONTRACT_CHANGED';
 END IF;
END $compatibility$;
SELECT 'PASS existing Guest scope, Metadata recovery and Parent function bytes';
DO $verify$
DECLARE r text; proc text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH proc IN ARRAY ARRAY[
   'public.mcp_managed_risk_admission(text,uuid,jsonb)',
   'public.mcp_managed_risk_plan_fence(uuid,jsonb)',
   'public.mcp_managed_l3_trip_delete_approval(text,uuid,uuid,jsonb,boolean,uuid)',
   'public.mcp_managed_l3_assert_lifecycle(uuid,uuid,text,uuid,jsonb,jsonb)',
   'public.mcp_assert_managed_consent(uuid,uuid,jsonb)'] LOOP
   IF has_function_privilege(r,proc,'EXECUTE') THEN RAISE EXCEPTION 'MCP API EXECUTE LEAK: %, %',r,proc; END IF;
  END LOOP;
  IF has_table_privilege(r,'public.mcp_operation_approval_decisions','SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege(r,'public.mcp_risk_plan_fences','SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'MCP API TABLE LEAK: %',r;
  END IF;
 END LOOP;
 IF (SELECT rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolinherit
     FROM pg_roles WHERE rolname='otr_mcp_operation_approval_gateway')
  OR has_table_privilege('otr_mcp_operation_approval_gateway','public.otr_mcp_managed_consents','SELECT')
  OR has_table_privilege('otr_mcp_operation_approval_gateway','public.trips','SELECT,UPDATE')
  OR has_function_privilege('otr_mcp_operation_approval_gateway','public.trip_lifecycle_command(uuid,uuid,uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'MCP APPROVAL ROLE TOO BROAD';
 END IF;
END $verify$;
SELECT 'PASS private role and Data API privileges';

-- Test persisted fully known and unknown P5 identities without invoking a fake Core authority.
SAVEPOINT p5_constraints;
ALTER TABLE public.itinerary_transport_services DISABLE TRIGGER USER;
DO $p5$
DECLARE chosen tid;
BEGIN
 SELECT ctid INTO STRICT chosen FROM public.itinerary_transport_services
  WHERE trip_id IS NOT NULL AND transport_subtype='TRAIN' AND identity_state IS NULL LIMIT 1;
 UPDATE public.itinerary_transport_services SET
  operator_namespace=NULL,operator_issuer=NULL,operator_value=NULL,operator_literal=NULL,
  service_number=NULL,service_literal=NULL,
  identity_state='{"version":1,"fields":{"operator_namespace":"UNKNOWN","operator_issuer":"UNKNOWN","operator_value":"UNKNOWN","operator_literal":"UNKNOWN","service_number":"NOT_APPLICABLE","service_literal":"UNKNOWN"}}'
  WHERE ctid=chosen RETURNING ctid INTO chosen;
 BEGIN
  UPDATE public.itinerary_transport_services SET operator_namespace='FABRICATED' WHERE ctid=chosen;
  RAISE EXCEPTION 'FORGED P5 IDENTITY ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $p5$;
ROLLBACK TO p5_constraints;
SELECT 'PASS P5 known compatibility, unknown and fabricated negative';

-- Reuse a synthetic owner and Trip already present in the fixture.
SELECT set_config('otr.qa.trip',t.id::text,true),
 set_config('otr.qa.actor',t.created_by::text,true),
 set_config('otr.qa.revision',t.metadata_revision::text,true)
FROM public.trips t WHERE t.lifecycle_state='ACTIVE'
 AND EXISTS(SELECT 1 FROM public.journey_members m WHERE m.trip_id=t.id AND m.user_id=t.created_by AND m.status='linked' AND m.role='owner')
ORDER BY t.id LIMIT 1
\gset seed_
SELECT set_config('otr.qa.client',gen_random_uuid()::text,true) AS client,
 set_config('otr.qa.session',gen_random_uuid()::text,true) AS session,
 set_config('otr.qa.evidence',gen_random_uuid()::text,true) AS evidence,
 set_config('otr.qa.normal',gen_random_uuid()::text,true) AS normal,
 set_config('otr.qa.note',repeat('a',64),true) AS policy
\gset seed_
INSERT INTO public.otr_mcp_managed_consents
 (id,session_key,secret_hash,oauth_session,native_snapshot,policy,state,challenge_expires_at,consent_expires_at,decided_at)
VALUES
 (gen_random_uuid(),current_setting('otr.qa.actor')||':'||current_setting('otr.qa.session'),repeat('b',64),'{}','{}','{}','SESSION_OPEN',
  clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',NULL),
 (current_setting('otr.qa.evidence')::uuid,NULL,repeat('c',64),
  jsonb_build_object('accountId',current_setting('otr.qa.actor'),'sessionId',current_setting('otr.qa.session'),'clientId',current_setting('otr.qa.client')),
  '{}',jsonb_build_object('policyHash',current_setting('otr.qa.note')),'APPROVED',
  clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp());
SELECT set_config('otr.mcp_beta.resource','https://synthetic.example.invalid/mcp',true) AS resource,
 set_config('otr.mcp_beta.risk_enabled','on',true) AS enabled,
 set_config('otr.qa.op',gen_random_uuid()::text,true) AS operation,
 set_config('otr.qa.risk_op',gen_random_uuid()::text,true) AS risk_operation
\gset seed_
SELECT set_config('otr.qa.context', jsonb_build_object(
 'accountId',current_setting('otr.qa.actor'),'clientId',current_setting('otr.qa.client'),
 'resource',current_setting('otr.mcp_beta.resource'),'digest',repeat('e',64),
 'managedConsent',jsonb_build_object('evidenceId',current_setting('otr.qa.evidence'),'sessionId',current_setting('otr.qa.session'),'policyHash',current_setting('otr.qa.note')),
 'operationIds',jsonb_build_array(current_setting('otr.qa.op')),
 'call',jsonb_build_object('capabilityId','otr.trip.delete','toolName','delete_trip',
  'pathParams',jsonb_build_object('tripId',current_setting('otr.qa.trip')),
  'request',jsonb_build_object('action','DELETE','tripId',current_setting('otr.qa.trip'),
    'operationId',current_setting('otr.qa.op'),'graphHash',repeat('d',64),
    'expectedMetadataRevision',current_setting('otr.qa.revision')::bigint)))::text,true) AS context
\gset seed_
RESET ROLE;
SET SESSION AUTHORIZATION otr_mcp_operation_approval_gateway;
DO $risk$
DECLARE actor uuid:=current_setting('otr.qa.actor')::uuid;
 c jsonb:=current_setting('otr.qa.context')::jsonb; r jsonb; k uuid;
BEGIN
 r:=public.mcp_managed_l3_trip_delete_approval('PREPARE',actor,NULL,c,NULL,NULL);
 IF r->>'state' IS DISTINCT FROM 'PENDING' THEN RAISE EXCEPTION 'PREVIEW_EXPECTED'; END IF;
 k:=(r->>'id')::uuid;
 PERFORM set_config('otr.qa.approval',k::text,true);
 BEGIN
  PERFORM public.mcp_managed_l3_trip_delete_approval('DECIDE',actor,k,NULL,true,NULL);
  RAISE EXCEPTION 'MISSING_NORMAL_SESSION_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 r:=public.mcp_managed_l3_trip_delete_approval('DECIDE',actor,k,NULL,true,current_setting('otr.qa.normal')::uuid);
 IF r->>'state' IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'APPROVED_EXPECTED'; END IF;
 BEGIN
  PERFORM public.mcp_managed_l3_trip_delete_approval('PREPARE',actor,NULL,
    jsonb_set(c,'{call,request,operationId}',to_jsonb(gen_random_uuid())),NULL,NULL);
  RAISE EXCEPTION 'CHANGED_OPERATION_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 c:=c||jsonb_build_object('operationIds',jsonb_build_array(current_setting('otr.qa.risk_op')),
  'call',jsonb_build_object('capabilityId','otr.p5.hide',
   'pathParams',jsonb_build_object('tripId',current_setting('otr.qa.trip')),
   'request',jsonb_build_object('tripId',current_setting('otr.qa.trip'),'operationId',current_setting('otr.qa.risk_op'),
    'command','HIDE_OBJECT','target',jsonb_build_object('kind','ITEM','id',gen_random_uuid()))));
 r:=public.mcp_managed_risk_admission('RESERVE',actor,c);
 IF r->>'risk' IS DISTINCT FROM 'L2_SENSITIVE_WRITE' OR r->'reserved' IS DISTINCT FROM 'true'::jsonb THEN
  RAISE EXCEPTION 'RISK_RESERVATION_EXPECTED';
 END IF;
END $risk$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION otr_trip_metadata_gateway;
DO $admission$
DECLARE c jsonb:=current_setting('otr.qa.context')::jsonb;
 a uuid:=(c->>'accountId')::uuid; cl uuid:=(c->>'clientId')::uuid; op uuid:=(c#>>'{operationIds,0}')::uuid;
BEGIN
 IF public.mcp_managed_l3_assert_lifecycle(a,cl,c->>'resource',op,c#>'{call,request}',c->'managedConsent') IS NOT TRUE THEN
  RAISE EXCEPTION 'MATCHING_MANAGED_APPROVAL_REQUIRED';
 END IF;
 BEGIN
  PERFORM public.mcp_managed_l3_assert_lifecycle(a,cl,c->>'resource',op,c#>'{call,request}',
    jsonb_set(c->'managedConsent','{sessionId}',to_jsonb(gen_random_uuid())));
  RAISE EXCEPTION 'WRONG_SESSION_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $admission$;
RESET SESSION AUTHORIZATION;
UPDATE public.otr_mcp_managed_consents SET state='REVOKED',revoked_at=clock_timestamp(),decided_at=clock_timestamp()
 WHERE session_key=current_setting('otr.qa.actor')||':'||current_setting('otr.qa.session');
SET SESSION AUTHORIZATION otr_trip_metadata_gateway;
DO $revoked$
DECLARE c jsonb:=current_setting('otr.qa.context')::jsonb;
BEGIN
 BEGIN
  PERFORM public.mcp_managed_l3_assert_lifecycle((c->>'accountId')::uuid,(c->>'clientId')::uuid,
   c->>'resource',(c#>>'{operationIds,0}')::uuid,c#>'{call,request}',c->'managedConsent');
  RAISE EXCEPTION 'REVOKED_CONSENT_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $revoked$;
RESET SESSION AUTHORIZATION;
SELECT 'PASS risk reserve, first-party decision, owning binding, operation/session negatives, local revocation';

-- Pick a fixture Trip for which the existing metadata role and ACL can return a graph.
SELECT set_config('otr.qa.lifecycle_candidates',coalesce(jsonb_agg(jsonb_build_array(t.created_by,t.id)),'[]')::text,true) AS candidates
FROM public.trips t WHERE t.lifecycle_state='ACTIVE'
 AND EXISTS(SELECT 1 FROM public.journey_members m WHERE m.trip_id=t.id AND m.user_id=t.created_by AND m.status='linked' AND m.role='owner')
\gset seed_
SET SESSION AUTHORIZATION otr_trip_metadata_gateway;
DO $lifecycle$
DECLARE candidate jsonb; base jsonb; bounds jsonb; receipt jsonb; a uuid; t uuid;
 op uuid:=gen_random_uuid();
BEGIN
 FOR candidate IN SELECT value FROM jsonb_array_elements(current_setting('otr.qa.lifecycle_candidates')::jsonb) LOOP
  a:=(candidate->>0)::uuid;t:=(candidate->>1)::uuid;
  BEGIN
   base:=public.trip_lifecycle_base(a,t);
   EXIT;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 IF base->>'state' IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'QUALIFIED_LIFECYCLE_FIXTURE_REQUIRED'; END IF;
 bounds:=jsonb_build_object('action','ARCHIVE','tripId',t,'operationId',op,
  'graphHash',base->>'graphHash','expectedMetadataRevision',(base->>'metadataRevision')::bigint,'reason','Rollback-only migration test');
 receipt:=public.trip_lifecycle_command(a,t,op,bounds);
 IF receipt->>'state' IS DISTINCT FROM 'ARCHIVED'
 OR (receipt->>'resultMetadataRevision')::bigint IS DISTINCT FROM (base->>'metadataRevision')::bigint+1
 OR public.trip_lifecycle_result(a,t,op) IS DISTINCT FROM receipt THEN
  RAISE EXCEPTION 'LIFECYCLE_OR_ORIGINAL_RECEIPT_MISMATCH';
 END IF;
 BEGIN
  PERFORM public.trip_lifecycle_base(gen_random_uuid(),t);
  RAISE EXCEPTION 'UNAUTHORIZED_LIFECYCLE_READ_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $lifecycle$;
RESET SESSION AUTHORIZATION;
SELECT 'PASS lifecycle owning archive, revision, original receipt and unauthorized negative';
