BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,6);
DO $guard$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL) THEN RAISE EXCEPTION 'P6_REQUIRES_CLOSED_POLICY';END IF;
IF md5(pg_get_functiondef('public.trip_core_guard_historical_source_association()'::regprocedure)) IS DISTINCT FROM '93801f3fadf5dba7a6214561642fe436' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_guard_historical_source_association()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_guard_historical_source_association()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P6_FUNCTION_DRIFT';END IF;
IF md5(pg_get_functiondef('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '1079d0aab7b396055ea96c98bf0fe96d' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_gateway=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P6_FUNCTION_DRIFT';END IF;
IF md5(pg_get_functiondef('public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '1276642cf7fcd0ae5be4be2934e79ee1' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P6_FUNCTION_DRIFT';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.trip_core_guard_historical_source_association()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin
 if tg_op<>'INSERT' then raise exception 'CORE_V2_PUBLICATION_IMMUTABLE' using errcode='42501';end if;
 if new.account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 if not exists(select 1 from public.trip_sources src join public.trip_source_revisions rev on rev.source_id=src.id and rev.material_revision=new.source_revision join public.trip_source_runs r on r.id=new.run_id where src.id=new.source_id and src.trip_id=new.trip_id and src.acquired_by=new.account_id and src.lifecycle='ACTIVE' and src.retention_state='RETAINED' and rev.retention_state='RETAINED' and r.trip_id=new.trip_id and r.actor_account_id=new.account_id and new.source_id=any(r.scope_source_ids) and (r.state='READY' or (r.state='PENDING' and r.extractor_key='otr-universal-interpretation-v1' and exists(
 select 1 from public.trip_source_core_v2_slots ps join public.trip_source_core_v2_candidates pc on pc.candidate_id=ps.candidate_id
 where ps.output_slot_id=new.output_slot_id and ps.account_id=new.account_id and ps.trip_id=new.trip_id and ps.source_id=new.source_id
 and ((((ps.output_purpose->>'purposeKind'='P1_ITEM' and pc.candidate_json->>'schemaId' IN ('otr.core.universal-p1-source/1','otr.core.universal-p1-source/2')) OR (ps.output_purpose->>'purposeKind'='P3_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p3-source/1') OR (ps.output_purpose->>'purposeKind'='P4_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p4-source/1') OR (ps.output_purpose->>'purposeKind'='P5_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p5-source/1') OR (ps.output_purpose->>'purposeKind'='P6_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p6-source/1'))
 and pc.run_id=r.id and pc.candidate_json->>'taskId'=r.interpretation_task_id::text and pc.candidate_json->>'batchId'=r.capture_batch_id::text
 and pc.candidate_json->>'resultSha256' ~ '^[a-f0-9]{64}$') OR (ps.command='CREATE_SPARSE_FLIGHT' and ps.output_purpose->>'purposeKind'='FLIGHT_OCCURRENCE'
 and pc.run_id=r.id and exists(select 1 from public.trip_source_core_v2_publications pp where pp.publication_id=(pc.candidate_json->>'publicationId')::uuid
 and pp.account_id=new.account_id and pp.trip_id=new.trip_id and pp.source_id=new.source_id and pp.run_id=r.id
 and pp.request_sha256='42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40' and pp.request_json->'universalP2'='{"batchId":"a9be165b-5a90-4244-add7-d4977c9e7ba5","proposedPlanSha256":"30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f","resultSha256":"7300e350f5e93ec77b833a4f7d65c44b88fdee4208c7ed001d47375d7244bf94","runId":"8af82103-55f2-84ea-8e6f-445a15321cf6","sourceReview":{"decision":"NEW","departureDate":"2026-11-02","flightNumberLiteral":"NZ501","originalReviewed":true,"sourceRevision":1,"tripReviewed":true,"version":"otr.universal.p2-source-review/1"},"taskId":"7338329a-46eb-8050-9bec-96376f08b296","token":"i1","version":"otr.universal.p2-source-proposal/1"}'::jsonb
 and r.capture_batch_id='a9be165b-5a90-4244-add7-d4977c9e7ba5'::uuid and r.interpretation_task_id='7338329a-46eb-8050-9bec-96376f08b296'::uuid)))))) and r.retention_state='RETAINED') then raise exception 'INPUT_STALE' using errcode='23514';end if;
 if not exists(select 1 from public.trip_source_core_v2_slots slot join public.trip_source_core_v2_candidates candidate on candidate.candidate_id=slot.candidate_id join public.trip_core_command_receipts receipt on receipt.id=new.domain_receipt_id where slot.output_slot_id=new.output_slot_id and slot.account_id=new.account_id and slot.trip_id=new.trip_id and slot.source_id=new.source_id and slot.candidate_id=new.candidate_id and candidate.source_revision=new.source_revision and candidate.run_id=new.run_id and candidate.candidate_json->'fieldEvidence'=new.field_evidence and slot.target_kind=new.target_kind and slot.target_id=new.target_id and slot.identity_sha256=new.identity_sha256 and receipt.actor_account_id=new.account_id and receipt.trip_id=new.trip_id and receipt.operation_id=slot.operation_id and receipt.intent_sha256=slot.intent_sha256 and receipt.receipt_sha256=new.receipt_sha256 and receipt.outcome in ('APPLIED','NO_CHANGE') and receipt.body->>'command'=slot.command and exists(select 1 from jsonb_array_elements(receipt.body->'targetVector') v where v->>'kind'=new.target_kind and v->>'id'=new.target_id::text and (v->>'committedRevision')::bigint=new.target_revision)) then raise exception 'RECEIPT_TARGET_MISMATCH' using errcode='23514';end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.trip_sustained_import_p1_capabilities(actor uuid, trip uuid)
 RETURNS TABLE(runtime_enabled boolean, enabled_commands text[], enabled_families text[], enabled_admission_modes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
 AND actor IS NOT DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 AND trip IS NOT DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 AND public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE')
 AND EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy p WHERE p.actor_account_id=actor AND p.enabled AND p.revoked_at IS NULL AND p.universal_p1_import_enabled
  AND p.universal_p1_review_scope-'expiresAt'='{"batchId":"a9be165b-5a90-4244-add7-d4977c9e7ba5","candidateId":"a85c1ab1-8dc4-8ff2-b0b7-4887a394b465","family":"P2","flightNumberLiteral":"NZ501","localDate":"2026-11-02","operationId":"50bfe576-c16d-8645-8cde-a355da5f13f9","planId":"990d9af8-2a69-86ec-a827-2e1a337a9b09","proposedPlanSha256":"30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f","publicationId":"2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f","publicationSha256":"42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40","resultSha256":"7300e350f5e93ec77b833a4f7d65c44b88fdee4208c7ed001d47375d7244bf94","runId":"8af82103-55f2-84ea-8e6f-445a15321cf6","slotId":"0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4","sourceId":"66f7d254-9cf7-4915-82a2-fd526d633864","targetId":"ec73e4fd-c580-8063-96a8-ef7accda3748","taskId":"7338329a-46eb-8050-9bec-96376f08b296","token":"i1","tripId":"825f79b2-4a9d-4535-a62e-43000ca50c4a"}'::jsonb AND (p.universal_p1_review_scope->>'expiresAt')::timestamptz>clock_timestamp())
 AND (SELECT md5(pg_get_functiondef('public.trip_core_resolve_airport(text,text,text,date)'::regprocedure)))='666ff90bad5c706a6007691a3328df75'
 AND (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY airport_code),'[]'::jsonb) FROM public.trip_core_airport_identities r WHERE registry_version='otr-dev-universal-p2-airports/20261027/1')='[{"airport_code":"AKL","enabled":true,"identity_id":"IATA_AIRPORT:AKL","issuer":"IATA","namespace":"IATA_AIRPORT","registry_sha256":"19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9","registry_version":"otr-dev-universal-p2-airports/20261027/1","valid_from":"2026-11-02","valid_until":"2026-11-02"},{"airport_code":"CHC","enabled":true,"identity_id":"IATA_AIRPORT:CHC","issuer":"IATA","namespace":"IATA_AIRPORT","registry_sha256":"19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9","registry_version":"otr-dev-universal-p2-airports/20261027/1","valid_from":"2026-11-02","valid_until":"2026-11-02"}]'::jsonb
 THEN RETURN QUERY SELECT true,ARRAY['CREATE_SPARSE_FLIGHT']::text[],ARRAY['P2']::text[],ARRAY['REVIEWED_SOURCE']::text[];RETURN;END IF;
 IF actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 OR NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE')
 OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy p WHERE p.actor_account_id=actor AND p.enabled AND p.revoked_at IS NULL AND p.universal_p1_import_enabled AND (coalesce(p.universal_p1_review_scope->>'family','P1') IN ('P1','P3') OR (p.universal_p1_review_scope->>'family' IN ('P4','P5','P6') AND actor='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND trip='825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid)) AND p.universal_p1_review_scope->>'tripId'=trip::text AND (p.universal_p1_review_scope->>'expiresAt')::timestamptz>clock_timestamp())
 THEN RETURN QUERY SELECT false,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[];RETURN;END IF;
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM']::text[],ARRAY[(SELECT coalesce(p.universal_p1_review_scope->>'family','P1') FROM public.trip_sustained_dev_policy p WHERE p.actor_account_id=actor)]::text[],ARRAY['REVIEWED_SOURCE']::text[];
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_sustained_import_p1_guard(tab text, op text, n jsonb, o jsonb, actor uuid, trip uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r jsonb:=coalesce(n,o);slot public.trip_source_core_v2_slots;candidate public.trip_source_core_v2_candidates;
 target uuid:=nullif(current_setting('otr.core.target_item',true),'')::uuid;
 operation uuid:=nullif(current_setting('otr.core.operation',true),'')::uuid;
 review_scope jsonb; family text:=nullif(current_setting('otr.core.family',true),'');
 intent uuid:=nullif(current_setting('otr.core.source_intent',true),'')::uuid;v_source uuid;
p2_receipt public.trip_core_command_receipts;p2_pub public.trip_source_core_v2_publications;p2_q jsonb;p2_plan jsonb;p2_command jsonb;p2_live boolean;p2_accepted boolean;
BEGIN
 IF family='P2' THEN
  -- Only the retained Universal P2 Sparse proposal; legacy Flight uses its original gate.
  IF session_user<>'otr_trip_core_v2_gateway' OR current_setting('role',true)<>'otr_trip_core_v2_writer'
   OR actor IS DISTINCT FROM 'f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid OR trip IS DISTINCT FROM '825f79b2-4a9d-4535-a62e-43000ca50c4a'::uuid
   OR actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
   OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
   OR current_setting('otr.core.admission',true) IS DISTINCT FROM 'REVIEWED_SOURCE'
   OR current_setting('otr.core.command',true) IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT'
   OR target IS DISTINCT FROM 'ec73e4fd-c580-8063-96a8-ef7accda3748'::uuid OR operation IS DISTINCT FROM '50bfe576-c16d-8645-8cde-a355da5f13f9'::uuid
   OR intent IS DISTINCT FROM '0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4'::uuid OR r->>'trip_id' IS DISTINCT FROM trip::text
   OR op NOT IN ('INSERT','UPDATE')
   OR tab NOT IN ('trip_source_core_v2_publications','trip_source_core_v2_candidates','trip_source_core_v2_intents','trip_source_core_v2_slots','trip_source_core_v2_associations','itinerary_events','trip_flight_intents','trip_core_command_receipts')
  THEN RAISE EXCEPTION 'P2_SOURCE_SCOPE_CLOSED' USING ERRCODE='42501';END IF;
  SELECT * INTO p2_pub FROM public.trip_source_core_v2_publications WHERE publication_id='2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f'::uuid AND account_id=actor AND trip_id=trip;
  p2_q:=CASE WHEN tab='trip_source_core_v2_publications' THEN r->'request_json' ELSE p2_pub.request_json END;
  IF p2_q IS NULL OR public.trip_source_hash('otr-trip-core-source-publication-v2',p2_q) IS DISTINCT FROM '42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40'
   OR p2_q->'universalP2' IS DISTINCT FROM '{"batchId":"a9be165b-5a90-4244-add7-d4977c9e7ba5","proposedPlanSha256":"30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f","resultSha256":"7300e350f5e93ec77b833a4f7d65c44b88fdee4208c7ed001d47375d7244bf94","runId":"8af82103-55f2-84ea-8e6f-445a15321cf6","sourceReview":{"decision":"NEW","departureDate":"2026-11-02","flightNumberLiteral":"NZ501","originalReviewed":true,"sourceRevision":1,"tripReviewed":true,"version":"otr.universal.p2-source-review/1"},"taskId":"7338329a-46eb-8050-9bec-96376f08b296","token":"i1","version":"otr.universal.p2-source-proposal/1"}'::jsonb
   OR p2_q->>'sourceId' IS DISTINCT FROM '66f7d254-9cf7-4915-82a2-fd526d633864' OR p2_q->>'runId' IS DISTINCT FROM '8af82103-55f2-84ea-8e6f-445a15321cf6'
   OR p2_q->>'publicationId' IS DISTINCT FROM '2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f' OR p2_q->>'sourceRevision' IS DISTINCT FROM '1'
   OR NOT EXISTS(SELECT 1 FROM public.trip_sources s JOIN public.trip_source_revisions v ON v.source_id=s.id AND v.material_revision=1
    JOIN public.trip_source_runs rr ON rr.id='8af82103-55f2-84ea-8e6f-445a15321cf6'::uuid
    WHERE s.id='66f7d254-9cf7-4915-82a2-fd526d633864'::uuid AND s.trip_id=trip AND s.acquired_by=actor AND s.lifecycle='ACTIVE' AND s.retention_state='RETAINED' AND v.retention_state='RETAINED'
    AND rr.actor_account_id=actor AND rr.trip_id=trip AND rr.extractor_key='otr-universal-interpretation-v1' AND rr.state IN ('PENDING','READY')
    AND rr.capture_batch_id='a9be165b-5a90-4244-add7-d4977c9e7ba5'::uuid AND rr.interpretation_task_id='7338329a-46eb-8050-9bec-96376f08b296'::uuid AND rr.scope_source_ids=ARRAY[s.id]
    AND rr.input_sha256=p2_q->>'inputCatalogSha256' AND rr.superseded_by IS NULL AND rr.retention_state='RETAINED')
  THEN RAISE EXCEPTION 'P2_SOURCE_BINDING_INVALID' USING ERRCODE='23514';END IF;
  SELECT * INTO slot FROM public.trip_source_core_v2_slots s WHERE s.output_slot_id=intent AND s.account_id=actor AND s.trip_id=trip
   AND s.candidate_id='a85c1ab1-8dc4-8ff2-b0b7-4887a394b465'::uuid AND s.source_id='66f7d254-9cf7-4915-82a2-fd526d633864'::uuid AND s.plan_id='990d9af8-2a69-86ec-a827-2e1a337a9b09'::uuid
   AND s.operation_id=operation AND s.target_kind='ITEM' AND s.target_id=target AND s.command='CREATE_SPARSE_FLIGHT'
   AND s.output_purpose->>'purposeKind'='FLIGHT_OCCURRENCE';
  p2_accepted:=slot.output_slot_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr
   WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.operation_id=operation AND rr.intent_sha256=slot.intent_sha256
   AND rr.outcome IN ('APPLIED','NO_CHANGE') AND rr.body->>'command'='CREATE_SPARSE_FLIGHT'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.body->'targetVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=target::text AND (v->>'committedRevision')::bigint>0));
  SELECT * INTO p2_receipt FROM public.trip_core_command_receipts rr WHERE rr.actor_account_id=actor AND rr.trip_id=trip
   AND rr.operation_id=operation AND rr.intent_sha256=slot.intent_sha256 AND rr.outcome IN ('APPLIED','NO_CHANGE')
   AND rr.body->>'command'='CREATE_SPARSE_FLIGHT';
  SELECT p.universal_p1_review_scope INTO review_scope FROM public.trip_sustained_dev_policy p
   WHERE p.actor_account_id=actor AND p.enabled AND p.revoked_at IS NULL AND p.universal_p1_import_enabled;
  p2_live:=coalesce(review_scope-'expiresAt'='{"batchId":"a9be165b-5a90-4244-add7-d4977c9e7ba5","candidateId":"a85c1ab1-8dc4-8ff2-b0b7-4887a394b465","family":"P2","flightNumberLiteral":"NZ501","localDate":"2026-11-02","operationId":"50bfe576-c16d-8645-8cde-a355da5f13f9","planId":"990d9af8-2a69-86ec-a827-2e1a337a9b09","proposedPlanSha256":"30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f","publicationId":"2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f","publicationSha256":"42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40","resultSha256":"7300e350f5e93ec77b833a4f7d65c44b88fdee4208c7ed001d47375d7244bf94","runId":"8af82103-55f2-84ea-8e6f-445a15321cf6","slotId":"0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4","sourceId":"66f7d254-9cf7-4915-82a2-fd526d633864","targetId":"ec73e4fd-c580-8063-96a8-ef7accda3748","taskId":"7338329a-46eb-8050-9bec-96376f08b296","token":"i1","tripId":"825f79b2-4a9d-4535-a62e-43000ca50c4a"}'::jsonb AND (review_scope->>'expiresAt')::timestamptz>clock_timestamp()
   AND EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled),false);
  -- After acceptance only the same immutable Source journal can finish; Core writes remain closed.
  IF NOT p2_live AND NOT (p2_accepted AND ((op IN ('INSERT','UPDATE') AND tab IN ('trip_source_core_v2_intents','trip_source_core_v2_slots')) OR (op='INSERT' AND tab='trip_source_core_v2_associations')))
  THEN RAISE EXCEPTION 'P2_SOURCE_CAPABILITY_CLOSED' USING ERRCODE='42501';END IF;
  IF tab LIKE 'trip_source_core_v2_%' THEN
   IF r->>'account_id' IS DISTINCT FROM actor::text OR r->>'source_id' IS DISTINCT FROM '66f7d254-9cf7-4915-82a2-fd526d633864'
   THEN RAISE EXCEPTION 'P2_SOURCE_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;
   IF tab='trip_source_core_v2_publications' THEN
    IF op<>'INSERT' OR r->>'publication_id' IS DISTINCT FROM '2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f' OR r->>'request_sha256' IS DISTINCT FROM '42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40'
     OR r->'response_json'->>'requestSha256' IS DISTINCT FROM '42bcceccf523049b73d8120d18e9374dbb889ec5cd0a4c60202b3b231854eb40'
    THEN RAISE EXCEPTION 'P2_SOURCE_PUBLICATION_INVALID' USING ERRCODE='23514';END IF;
   ELSIF tab='trip_source_core_v2_candidates' THEN
    IF op<>'INSERT' OR r->>'candidate_id' IS DISTINCT FROM 'a85c1ab1-8dc4-8ff2-b0b7-4887a394b465' OR r->>'run_id' IS DISTINCT FROM '8af82103-55f2-84ea-8e6f-445a15321cf6' OR r->>'source_revision' IS DISTINCT FROM '1'
     OR r->'candidate_json'->>'publicationId' IS DISTINCT FROM '2d3ef30c-a3ee-81ba-8a8f-f6d2ecb4b57f' OR r->'candidate_json'->'candidate' IS DISTINCT FROM p2_q->'candidates'->0
     OR r->>'candidate_sha256' IS DISTINCT FROM public.trip_source_hash('otr-trip-core-source-candidate-v2',r->'candidate_json')
     OR r->'candidate_json'->>'status' IS DISTINCT FROM 'QUALIFIED' OR r->'candidate_json'->'errorCode' IS DISTINCT FROM 'null'::jsonb
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p2_pub.response_json->'candidates') c WHERE c->>'candidateId'=r->>'candidate_id' AND c->>'candidateSha256'=r->>'candidate_sha256' AND c->>'status'='QUALIFIED')
    THEN RAISE EXCEPTION 'P2_SOURCE_CANDIDATE_INVALID' USING ERRCODE='23514';END IF;
   ELSIF tab='trip_source_core_v2_intents' THEN
    IF r->>'plan_id' IS DISTINCT FROM '990d9af8-2a69-86ec-a827-2e1a337a9b09' OR r->>'request_sha256' IS DISTINCT FROM '30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f'
     OR public.trip_source_hash('otr-trip-core-source-plan-v2',r->'request_json') IS DISTINCT FROM '30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f'
     OR r->'prepared_json'->'request' IS DISTINCT FROM r->'request_json'
     OR r->'prepared_json'->>'proposalSha256' IS DISTINCT FROM '30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f'
     OR jsonb_array_length(r->'prepared_json'->'slots') IS DISTINCT FROM 1
     OR (op='UPDATE' AND (r-ARRAY['prepared_json']) IS DISTINCT FROM (o-ARRAY['prepared_json']))
     OR (op='UPDATE' AND ((r->'prepared_json'->'slots'->0)-ARRAY['state','receipt','domainReceiptId','errorCode']) IS DISTINCT FROM ((o->'prepared_json'->'slots'->0)-ARRAY['state','receipt','domainReceiptId','errorCode']))
     OR (p2_accepted AND ((r->'prepared_json'->'slots'->0->>'domainReceiptId') IS DISTINCT FROM p2_receipt.id::text
       OR r->'prepared_json'->'slots'->0->'receipt' IS DISTINCT FROM p2_receipt.body
       OR r->'prepared_json'->'slots'->0->>'state' NOT IN ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','COMPLETE')))
     OR (r->'prepared_json'->'slots'->0->>'state'='COMPLETE' AND NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a
       WHERE a.output_slot_id=intent AND a.account_id=actor AND a.trip_id=trip AND a.domain_receipt_id=p2_receipt.id))
    THEN RAISE EXCEPTION 'P2_SOURCE_PLAN_MISMATCH' USING ERRCODE='23514';END IF;
   ELSIF tab='trip_source_core_v2_slots' THEN
    SELECT i.request_json INTO p2_plan FROM public.trip_source_core_v2_intents i WHERE i.plan_id='990d9af8-2a69-86ec-a827-2e1a337a9b09'::uuid AND i.account_id=actor AND i.trip_id=trip AND i.request_sha256='30ef32a53a14e3b80cb46b67a2ef8e451d134c55e6fd2950f5419d3511ce8d7f';
    p2_command:=(r->>'canonical_intent_text')::jsonb;
    IF p2_plan IS NULL OR r->>'output_slot_id' IS DISTINCT FROM intent::text OR r->>'operation_id' IS DISTINCT FROM operation::text
     OR r->>'candidate_id' IS DISTINCT FROM 'a85c1ab1-8dc4-8ff2-b0b7-4887a394b465' OR r->>'plan_id' IS DISTINCT FROM '990d9af8-2a69-86ec-a827-2e1a337a9b09'
     OR r->>'target_kind' IS DISTINCT FROM 'ITEM' OR r->>'target_id' IS DISTINCT FROM target::text OR r->>'command' IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT'
     OR r->'output_purpose'->>'purposeKind' IS DISTINCT FROM 'FLIGHT_OCCURRENCE'
     OR p2_command->>'command' IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT' OR p2_command->'target' IS DISTINCT FROM p2_plan->'slots'->0->'target'
     OR p2_command->'payload' IS DISTINCT FROM p2_plan->'slots'->0->'payload' OR p2_command->>'operationId' IS DISTINCT FROM operation::text
     OR p2_command->'admission' IS DISTINCT FROM jsonb_build_object('mode','REVIEWED_SOURCE','sourceIntentId',intent,'policyVersion',NULL)
     OR r->>'intent_sha256' IS DISTINCT FROM public.trip_source_hash('otr-trip-core-intent-v2',p2_command)
     OR (op='UPDATE' AND r-ARRAY['state','domain_receipt_id','source_lineage_id'] IS DISTINCT FROM o-ARRAY['state','domain_receipt_id','source_lineage_id'])
     OR (op='UPDATE' AND r->'source_lineage_id' IS DISTINCT FROM o->'source_lineage_id' AND
       (o->>'source_lineage_id' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a
        WHERE a.id=coalesce((r->>'source_lineage_id')::uuid,CASE WHEN op='INSERT' THEN slot.source_lineage_id END) AND a.output_slot_id=intent AND a.account_id=actor AND a.trip_id=trip
        AND a.target_id=target AND a.domain_receipt_id=p2_receipt.id)))
     OR (r->>'domain_receipt_id' IS NOT NULL AND r->>'domain_receipt_id' IS DISTINCT FROM p2_receipt.id::text)
     OR (op='UPDATE' AND o->>'domain_receipt_id' IS NOT NULL AND r->'domain_receipt_id' IS DISTINCT FROM o->'domain_receipt_id')
     OR (r->>'state' IN ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','COMPLETE') AND
       (NOT p2_accepted OR r->>'domain_receipt_id' IS DISTINCT FROM p2_receipt.id::text))
     OR (r->>'state'='COMPLETE' AND NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_associations a
       WHERE a.output_slot_id=intent AND a.account_id=actor AND a.trip_id=trip AND a.domain_receipt_id=p2_receipt.id AND a.id=coalesce((r->>'source_lineage_id')::uuid,CASE WHEN op='INSERT' THEN slot.source_lineage_id END)))
    THEN RAISE EXCEPTION 'P2_SOURCE_SLOT_MISMATCH' USING ERRCODE='23514';END IF;
   ELSE
    IF op<>'INSERT' OR NOT p2_accepted THEN RAISE EXCEPTION 'P2_SOURCE_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
   END IF;
  ELSE
   IF NOT p2_live OR p2_accepted OR slot.state IS DISTINCT FROM 'READY' OR op<>'INSERT' THEN RAISE EXCEPTION 'P2_SOURCE_CREATE_CLOSED' USING ERRCODE='42501';END IF;
   IF tab='itinerary_events' THEN
    IF r->>'id' IS DISTINCT FROM target::text OR r->>'experience_family' IS DISTINCT FROM 'P2' OR r->>'business_contract_version' IS DISTINCT FROM '2'
     OR r->>'owner_account_id' IS DISTINCT FROM actor::text OR r->>'participation_mode' IS DISTINCT FROM 'SELF' OR r->>'visibility' IS DISTINCT FROM 'PRIVATE'
     OR r->>'title' IS DISTINCT FROM 'NZ501' OR r->>'description' IS NOT NULL OR r->>'start_local_date' IS DISTINCT FROM '2026-11-02'
     OR r->>'start_local_time' IS NOT NULL OR r->>'start_zone_id' IS NOT NULL OR r->>'end_local_date' IS NOT NULL OR r->>'end_local_time' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL
    THEN RAISE EXCEPTION 'P2_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
   ELSIF tab='trip_flight_intents' THEN
    IF r->>'event_id' IS DISTINCT FROM target::text OR r->>'flight_number_literal' IS DISTINCT FROM 'NZ501' OR r->>'qualification' IS DISTINCT FROM 'SPARSE'
    THEN RAISE EXCEPTION 'P2_SOURCE_FLIGHT_MISMATCH' USING ERRCODE='23514';END IF;
   ELSIF r->>'actor_account_id' IS DISTINCT FROM actor::text OR r->>'operation_id' IS DISTINCT FROM operation::text OR r->>'intent_sha256' IS DISTINCT FROM slot.intent_sha256
    OR r->'body'->>'command' IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT'
   THEN RAISE EXCEPTION 'P2_SOURCE_RECEIPT_MISMATCH' USING ERRCODE='23514';END IF;
  END IF;
  RETURN;
 END IF;
 IF session_user<>'otr_trip_core_v2_gateway' OR current_setting('role',true)<>'otr_trip_core_v2_writer'
 OR actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled)
 OR current_setting('otr.core.admission',true) IS DISTINCT FROM 'REVIEWED_SOURCE'
 OR coalesce(family,'') NOT IN ('P1','P3','P4','P5','P6') OR current_setting('otr.core.command',true) IS DISTINCT FROM 'CREATE_ITEM'
 OR target IS NULL OR operation IS NULL OR intent IS NULL OR op NOT IN ('INSERT','UPDATE') OR r->>'trip_id' IS DISTINCT FROM trip::text
 OR tab NOT IN ('itinerary_events','itinerary_transport_endpoints','itinerary_transport_services','trip_activity_details','trip_stay_details','trip_rental_details','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts',
 'trip_source_core_v2_candidates','trip_source_core_v2_intents','trip_source_core_v2_slots','trip_source_core_v2_associations')
 THEN RAISE EXCEPTION 'P1_SOURCE_CAPABILITY_CLOSED' USING ERRCODE='42501';END IF;
 SELECT p.universal_p1_review_scope INTO review_scope FROM public.trip_sustained_dev_policy p WHERE p.actor_account_id=actor AND p.universal_p1_import_enabled;
 IF coalesce(review_scope->>'family','P1') IS DISTINCT FROM family OR review_scope->>'tripId' IS DISTINCT FROM trip::text OR review_scope->>'targetId' IS DISTINCT FROM target::text
 OR review_scope->>'operationId' IS DISTINCT FROM operation::text OR review_scope->>'slotId' IS DISTINCT FROM intent::text
 OR NOT coalesce((review_scope->>'expiresAt')::timestamptz>clock_timestamp(),false)
 THEN RAISE EXCEPTION 'P1_SOURCE_REVIEW_SCOPE_CLOSED' USING ERRCODE='42501';END IF;
 IF tab LIKE 'trip_source_core_v2_%' THEN
  IF r->>'account_id' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION 'P1_SOURCE_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;
  v_source:=(r->>'source_id')::uuid;
  IF review_scope->>'sourceId' IS DISTINCT FROM v_source::text OR review_scope->>'candidateId' IS DISTINCT FROM r->>'candidate_id' AND tab<>'trip_source_core_v2_intents' THEN RAISE EXCEPTION 'P1_SOURCE_REVIEW_SCOPE_CLOSED' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.trip_sources s WHERE s.id=v_source AND s.trip_id=trip AND s.acquired_by=actor AND s.lifecycle='ACTIVE' AND s.retention_state='RETAINED')
  THEN RAISE EXCEPTION 'P1_SOURCE_NOT_VISIBLE' USING ERRCODE='42501';END IF;
  IF tab='trip_source_core_v2_candidates' THEN
   IF op<>'INSERT' OR coalesce(r->'candidate_json'->>'schemaId','') NOT IN (CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' WHEN family='P4' THEN 'otr.core.universal-p4-source/1' WHEN family='P5' THEN 'otr.core.universal-p5-source/1' WHEN family='P6' THEN 'otr.core.universal-p6-source/1' ELSE 'otr.core.universal-p1-source/1' END,CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' WHEN family='P4' THEN 'otr.core.universal-p4-source/1' WHEN family='P5' THEN 'otr.core.universal-p5-source/1' WHEN family='P6' THEN 'otr.core.universal-p6-source/1' ELSE 'otr.core.universal-p1-source/2' END)
   OR r->'candidate_json'->>'batchId' IS DISTINCT FROM review_scope->>'batchId'
   OR r->'candidate_json'->>'taskId' IS DISTINCT FROM review_scope->>'taskId'
   OR r->'candidate_json'->>'token' IS DISTINCT FROM review_scope->>'token'
   OR r->'candidate_json'->>'resultSha256' IS DISTINCT FROM review_scope->>'resultSha256'
   OR r->'candidate_json'->>'accountId' IS DISTINCT FROM actor::text OR r->'candidate_json'->>'tripId' IS DISTINCT FROM trip::text
   OR r->'candidate_json'->>'candidateId' IS DISTINCT FROM r->>'candidate_id' OR r->'candidate_json'->>'sourceId' IS DISTINCT FROM v_source::text
   OR r->'candidate_json'->>'sourceRevision' IS DISTINCT FROM r->>'source_revision' OR r->'candidate_json'->>'runId' IS DISTINCT FROM r->>'run_id'
   OR r->'candidate_json'->>'inputCatalogSha256' IS DISTINCT FROM r->>'input_catalog_sha256'
   OR jsonb_array_length(r->'candidate_json'->'lifecycleRelationships') IS DISTINCT FROM 1
   OR r->'candidate_json'->'lifecycleRelationships'->0->>'kind' IS DISTINCT FROM 'NEW'
   OR r->'candidate_json'->'lifecycleRelationships'->0->'candidateIds' IS DISTINCT FROM jsonb_build_array(r->>'candidate_id')
   OR r->'candidate_json'->'plan'->>'mode' IS DISTINCT FROM 'REVIEWED_SOURCE'
   OR jsonb_array_length(r->'candidate_json'->'plan'->'slots') IS DISTINCT FROM 1
   OR r->'candidate_json'->'plan'->'slots'->0->>'command' IS DISTINCT FROM 'CREATE_ITEM'
   OR r->'candidate_json'->'plan'->'slots'->0->>'operationId' IS DISTINCT FROM operation::text
   OR r->'candidate_json'->'plan'->'slots'->0->>'slotId' IS DISTINCT FROM intent::text
   OR r->'candidate_json'->'plan'->'slots'->0->'target'->>'id' IS DISTINCT FROM target::text
   OR r->'candidate_json'->'plan'->'slots'->0->'payload'->>'family' IS DISTINCT FROM family
   OR r->'candidate_json'->'plan'->'slots'->0->'payload'->'acl'->>'visibility' IS DISTINCT FROM 'PRIVATE'
   OR r->'candidate_json'->'plan'->'slots'->0->'payload'->'participation'->>'mode' IS DISTINCT FROM 'SELF'
   OR r->>'candidate_sha256' IS DISTINCT FROM public.trip_source_hash('otr-trip-core-source-candidate-v2',r->'candidate_json')
   OR NOT EXISTS(SELECT 1 FROM public.trip_source_runs run WHERE run.id=(r->>'run_id')::uuid AND run.actor_account_id=actor AND run.trip_id=trip
    AND v_source=ANY(run.scope_source_ids) AND run.input_sha256=r->>'input_catalog_sha256' AND run.state IN ('PENDING','READY') AND run.retention_state='RETAINED' AND run.superseded_by IS NULL
    AND run.extractor_key='otr-universal-interpretation-v1' AND run.capture_batch_id=(r->'candidate_json'->>'batchId')::uuid AND run.interpretation_task_id=(r->'candidate_json'->>'taskId')::uuid)
   OR jsonb_typeof(r->'candidate_json'->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'candidate_json'->'evidence') NOT BETWEEN 2 AND 16
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='ROOT.title')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='START.local_date')
   THEN RAISE EXCEPTION 'P1_SOURCE_CANDIDATE_INVALID' USING ERRCODE='23514';END IF;
   IF (family IN ('P3','P4','P5','P6') OR r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2') AND (
    r->'candidate_json'->>'reviewedBy' IS DISTINCT FROM actor::text
    OR r->'candidate_json'->'sourceReview'->>'version' IS DISTINCT FROM CASE WHEN family='P3' THEN 'otr.universal.p3-source-review/1' WHEN family='P4' THEN 'otr.universal.p4-source-review/1' WHEN family='P5' THEN 'otr.universal.p5-source-review/1' WHEN family='P6' THEN 'otr.universal.p6-source-review/1' ELSE 'otr.universal.p1-source-review/1' END
    OR r->'candidate_json'->'sourceReview'->>'decision' IS DISTINCT FROM 'NEW'
    OR r->'candidate_json'->'sourceReview'->>'sourceRevision' IS DISTINCT FROM r->>'source_revision'
    OR r->'candidate_json'->'sourceReview'->'originalReviewed' IS DISTINCT FROM 'true'::jsonb
    OR r->'candidate_json'->'sourceReview'->'tripReviewed' IS DISTINCT FROM 'true'::jsonb
    OR r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'core'->>'title'
    OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM CASE WHEN family='P5' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints'->'origin'->'time'->>'local_date' ELSE r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'start'->>'local_date' END
   ) THEN RAISE EXCEPTION 'P1_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
   IF family='P3' AND (jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM 3
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='END.local_date')
    OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'end'->>'local_date'
    OR r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
    OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
    OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM review_scope->>'endLocalDate'
    OR (r->'candidate_json'->'sourceReview'->>'endLocalDate')::date <= (r->'candidate_json'->'sourceReview'->>'localDate')::date)
    THEN RAISE EXCEPTION 'P3_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
    IF family='P4' AND (
     r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
     OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
     OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM review_scope->>'endLocalDate'
     OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'end'->>'local_date'
     OR jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM CASE WHEN r->'candidate_json'->'sourceReview'->>'endLocalDate' IS NULL THEN 2 ELSE 3 END
     OR (r->'candidate_json'->'sourceReview'->>'endLocalDate' IS NOT NULL AND
       (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='END.local_date')
        OR (r->'candidate_json'->'sourceReview'->>'endLocalDate')::date < (r->'candidate_json'->'sourceReview'->>'localDate')::date))
    ) THEN RAISE EXCEPTION 'P4_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
   IF family='P6' AND (
     r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
     OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
     OR jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM 2
     OR jsonb_strip_nulls(r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'start') IS DISTINCT FROM jsonb_build_object('local_date',review_scope->>'localDate','quality','UNKNOWN','basis','DERIVED_CIVIL','civil_resolution','PENDING')
     OR (r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule')-'start' IS DISTINCT FROM '{}'::jsonb
     OR (r->'candidate_json'->'plan'->'slots'->0->'payload')-ARRAY['family','core','schedule','participation','acl'] IS DISTINCT FROM '{}'::jsonb
     OR (r->'candidate_json'->'plan'->'slots'->0->'payload'->'core')-'title' IS DISTINCT FROM '{}'::jsonb
   ) THEN RAISE EXCEPTION 'P6_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
   IF family='P5' AND (
     r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
     OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
     OR jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM 5
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='SERVICE.main.transport_subtype' AND e->>'raw'='TRAIN')
     OR r->'candidate_json'->'plan'->'slots'->0->'payload'->'service' IS DISTINCT FROM jsonb_build_object('service_key','main','transport_subtype','TRAIN','attribution','UNSPECIFIED','operator_namespace','NAME','operator_issuer','NAME','operator_value',review_scope->>'operatorLiteral','operator_literal',review_scope->>'operatorLiteral','service_number',review_scope->>'serviceNumber','service_literal',review_scope->>'title','codeshare_operating_key',null)
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='SERVICE.main.operator_literal' AND e->>'raw'=review_scope->>'operatorLiteral')
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='SERVICE.main.service_number' AND e->>'raw'=review_scope->>'serviceNumber')
     OR jsonb_strip_nulls(r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints'->'origin'->'time') IS DISTINCT FROM jsonb_build_object('local_date',review_scope->>'localDate','quality','UNKNOWN','basis','DERIVED_CIVIL','civil_resolution','PENDING')
     OR jsonb_strip_nulls(r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints'->'destination'->'time') IS DISTINCT FROM jsonb_build_object('quality','UNKNOWN','basis','DERIVED_CIVIL','civil_resolution','PENDING')
     OR jsonb_strip_nulls(r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints'->'origin'->'place') IS DISTINCT FROM '{}'::jsonb
     OR jsonb_strip_nulls(r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints'->'destination'->'place') IS DISTINCT FROM '{}'::jsonb
     OR ((r->'candidate_json'->'plan'->'slots'->0->'payload')-ARRAY['family','core','endpoints','service','participation','acl']) IS DISTINCT FROM '{}'::jsonb
     OR jsonb_typeof(r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints')) IS DISTINCT FROM 2::bigint
   ) THEN RAISE EXCEPTION 'P5_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE (e->>'fieldKey' NOT IN ('ROOT.title','START.local_date') AND NOT (family IN ('P3','P4') AND e->>'fieldKey'='END.local_date') AND NOT (family='P5' AND e->>'fieldKey' IN ('SERVICE.main.transport_subtype','SERVICE.main.operator_literal','SERVICE.main.service_number')))
    OR e->>'candidateId' IS DISTINCT FROM r->>'candidate_id'
    OR (e->>'raw' IS DISTINCT FROM CASE e->>'fieldKey' WHEN 'ROOT.title' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'core'->>'title' WHEN 'START.local_date' THEN CASE WHEN family='P5' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'endpoints'->'origin'->'time'->>'local_date' ELSE r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'start'->>'local_date' END WHEN 'SERVICE.main.transport_subtype' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'service'->>'transport_subtype' WHEN 'SERVICE.main.operator_literal' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'service'->>'operator_literal' WHEN 'SERVICE.main.service_number' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'service'->>'service_number' WHEN 'END.local_date' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'end'->>'local_date' END
     AND NOT coalesce(((r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2' OR family IN ('P4','P5','P6'))
       AND (e->>'fieldKey'='START.local_date' OR (family='P4' AND e->>'fieldKey'='END.local_date')) AND e->'normalization'->>'rule'='ENGLISH_MONTH_CIVIL_DATE'
      AND e->'normalization'->>'value'=CASE WHEN e->>'fieldKey'='END.local_date' THEN r->'candidate_json'->'sourceReview'->>'endLocalDate' ELSE r->'candidate_json'->'sourceReview'->>'localDate' END
      AND e->>'raw'=to_char((e->'normalization'->>'value')::date,'Mon FMDD, YYYY')
      AND e->'normalization'->>'value'=to_char((e->'normalization'->>'value')::date,'YYYY-MM-DD')),false))
    OR NOT EXISTS(SELECT 1 FROM public.trip_source_inputs i JOIN public.trip_source_representations rep ON rep.id=i.representation_id AND rep.source_id=i.source_id
     WHERE i.id=(e->'locator'->>'input_id')::uuid AND i.run_id=(r->>'run_id')::uuid AND i.source_id=v_source
     AND public.trip_import_input_valid(i,actor,trip,true) AND rep.role='ORIGINAL' AND rep.material_kind='TEXT' AND rep.retention_state='RETAINED'
     AND e->'locator'->>'kind'='TEXT_SPAN' AND (e->'locator'->>'start')::integer>=0 AND (e->'locator'->>'end')::integer>(e->'locator'->>'start')::integer
     AND (e->'locator'->>'end')::integer<=octet_length(rep.text_content)
     AND convert_from(substring(convert_to(rep.text_content,'UTF8') FROM (e->'locator'->>'start')::integer+1 FOR (e->'locator'->>'end')::integer-(e->'locator'->>'start')::integer),'UTF8')=e->>'raw'))
   THEN RAISE EXCEPTION 'P1_SOURCE_EVIDENCE_INVALID' USING ERRCODE='23514';END IF;RETURN;
  END IF;
  SELECT * INTO candidate FROM public.trip_source_core_v2_candidates c WHERE c.account_id=actor AND c.trip_id=trip AND c.source_id=v_source
   AND c.candidate_id=(CASE WHEN tab='trip_source_core_v2_intents' THEN r->'request_json'->'candidateIds'->>0 ELSE r->>'candidate_id' END)::uuid;
  IF candidate.candidate_id IS NULL OR coalesce(candidate.candidate_json->>'schemaId','') NOT IN (CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' WHEN family='P4' THEN 'otr.core.universal-p4-source/1' WHEN family='P5' THEN 'otr.core.universal-p5-source/1' WHEN family='P6' THEN 'otr.core.universal-p6-source/1' ELSE 'otr.core.universal-p1-source/1' END,CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' WHEN family='P4' THEN 'otr.core.universal-p4-source/1' WHEN family='P5' THEN 'otr.core.universal-p5-source/1' WHEN family='P6' THEN 'otr.core.universal-p6-source/1' ELSE 'otr.core.universal-p1-source/2' END) THEN RAISE EXCEPTION 'P1_SOURCE_CANDIDATE_REQUIRED' USING ERRCODE='23514';END IF;
  IF tab='trip_source_core_v2_intents' THEN
   IF r->'request_json' IS DISTINCT FROM candidate.candidate_json->'plan' OR r->>'request_sha256' IS DISTINCT FROM public.trip_source_hash('otr-trip-core-source-plan-v2',r->'request_json') THEN RAISE EXCEPTION 'P1_SOURCE_PLAN_MISMATCH' USING ERRCODE='23514';END IF;
  ELSIF tab='trip_source_core_v2_slots' THEN
   IF r->>'command' IS DISTINCT FROM 'CREATE_ITEM' OR r->>'target_kind' IS DISTINCT FROM 'ITEM' OR r->>'target_id' IS DISTINCT FROM target::text
   OR r->>'operation_id' IS DISTINCT FROM operation::text OR r->>'output_slot_id' IS DISTINCT FROM intent::text
   OR r->'output_purpose'->>'purposeKind' IS DISTINCT FROM family||'_ITEM' OR r->'output_purpose'->>'candidateSha256' IS DISTINCT FROM candidate.candidate_sha256
   OR r->>'purpose_sha256' IS DISTINCT FROM public.trip_source_hash('otr-core-'||lower(family)||'-output-purpose-v2',(r->'output_purpose')-'purposeSha256')
   OR r->'output_purpose'->>'purposeSha256' IS DISTINCT FROM r->>'purpose_sha256'
   OR r->'output_purpose'->>'payloadSha256' IS DISTINCT FROM public.trip_source_hash('otr-core-'||lower(family)||'-source-payload-v2',(r->>'canonical_intent_text')::jsonb->'payload')
   OR (r->>'canonical_intent_text')::jsonb->'admission'->>'mode' IS DISTINCT FROM 'REVIEWED_SOURCE'
   OR (r->>'canonical_intent_text')::jsonb->'admission'->>'sourceIntentId' IS DISTINCT FROM intent::text
   OR (r->>'canonical_intent_text')::jsonb->>'operationId' IS DISTINCT FROM operation::text
   OR r->>'intent_sha256' IS DISTINCT FROM public.trip_source_hash('otr-trip-core-intent-v2',(r->>'canonical_intent_text')::jsonb)
   OR (r->>'canonical_intent_text')::jsonb->'payload' IS DISTINCT FROM candidate.candidate_json->'plan'->'slots'->0->'payload'
   THEN RAISE EXCEPTION 'P1_SOURCE_SLOT_MISMATCH' USING ERRCODE='23514';END IF;
  ELSIF op<>'INSERT' THEN RAISE EXCEPTION 'P1_SOURCE_ASSOCIATION_IMMUTABLE' USING ERRCODE='23514';END IF;
 ELSE
  SELECT * INTO slot FROM public.trip_source_core_v2_slots s WHERE s.account_id=actor AND s.trip_id=trip AND s.output_slot_id=intent
   AND s.operation_id=operation AND s.target_kind='ITEM' AND s.target_id=target AND s.command='CREATE_ITEM' AND s.output_purpose->>'purposeKind'=family||'_ITEM' AND s.state='READY';
  IF slot.output_slot_id IS NULL THEN RAISE EXCEPTION 'P1_SOURCE_INTENT_REQUIRED' USING ERRCODE='23514';END IF;
  IF op<>'INSERT' THEN RAISE EXCEPTION 'P1_SOURCE_CREATE_ONLY' USING ERRCODE='42501';END IF;
  IF tab='itinerary_events' THEN
   SELECT * INTO candidate FROM public.trip_source_core_v2_candidates c WHERE c.candidate_id=slot.candidate_id;
   IF r->>'id' IS DISTINCT FROM target::text OR r->>'experience_family' IS DISTINCT FROM family OR r->>'business_contract_version' IS DISTINCT FROM '2'
    OR r->>'owner_account_id' IS DISTINCT FROM actor::text OR r->>'participation_mode' IS DISTINCT FROM 'SELF' OR r->>'visibility' IS DISTINCT FROM 'PRIVATE'
    OR r->>'title' IS DISTINCT FROM candidate.candidate_json->'plan'->'slots'->0->'payload'->'core'->>'title'
    OR r->>'start_local_date' IS DISTINCT FROM candidate.candidate_json->'plan'->'slots'->0->'payload'->'schedule'->'start'->>'local_date'
   THEN RAISE EXCEPTION 'P1_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
   IF family='P3' AND (r->>'end_local_date' IS DISTINCT FROM candidate.candidate_json->'sourceReview'->>'endLocalDate'
    OR r->>'start_local_time' IS NOT NULL OR r->>'end_local_time' IS NOT NULL OR r->>'start_zone_id' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL)
    THEN RAISE EXCEPTION 'P3_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
     IF family='P4' AND (r->>'end_local_date' IS DISTINCT FROM candidate.candidate_json->'sourceReview'->>'endLocalDate'
     OR r->>'start_local_time' IS NOT NULL OR r->>'end_local_time' IS NOT NULL OR r->>'start_zone_id' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL)
     THEN RAISE EXCEPTION 'P4_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
   IF family='P6' AND (r->>'temporal_shape' IS DISTINCT FROM 'CALENDAR'
     OR r->>'start_local_date' IS DISTINCT FROM review_scope->>'localDate'
     OR r->>'start_local_time' IS NOT NULL OR r->>'start_zone_id' IS NOT NULL OR r->>'start_source_instant' IS NOT NULL
     OR r->>'end_local_date' IS NOT NULL OR r->>'end_local_time' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL OR r->>'end_source_instant' IS NOT NULL
     OR r->>'description' IS NOT NULL OR r->>'activity_category' IS NOT NULL OR r->>'reservation_id' IS NOT NULL)
     THEN RAISE EXCEPTION 'P6_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
   IF family='P5' AND (r->>'temporal_shape' IS DISTINCT FROM 'TRANSPORT'
      OR r->>'start_local_date' IS NOT NULL OR r->>'end_local_date' IS NOT NULL
      OR r->>'start_local_time' IS NOT NULL OR r->>'end_local_time' IS NOT NULL
      OR r->>'start_zone_id' IS NOT NULL OR r->>'end_zone_id' IS NOT NULL)
     THEN RAISE EXCEPTION 'P5_SOURCE_ITEM_MISMATCH' USING ERRCODE='23514';END IF;
   ELSIF tab IN ('itinerary_transport_endpoints','itinerary_transport_services') THEN
     IF family<>'P5' OR r->>'event_id' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'SOURCE_FAMILY_TABLE_MISMATCH' USING ERRCODE='42501';END IF;
     SELECT * INTO candidate FROM public.trip_source_core_v2_candidates c WHERE c.candidate_id=slot.candidate_id;
     IF tab='itinerary_transport_services' THEN
       IF r->'provenance_refs' IS DISTINCT FROM '{}'::jsonb OR jsonb_strip_nulls(r-ARRAY['event_id','trip_id','provenance_refs']) IS DISTINCT FROM jsonb_strip_nulls(candidate.candidate_json->'plan'->'slots'->0->'payload'->'service')
       THEN RAISE EXCEPTION 'P5_SOURCE_SERVICE_MISMATCH' USING ERRCODE='23514';END IF;
     ELSE
       IF coalesce(r->>'role','') NOT IN ('ORIGIN','DESTINATION') OR
         jsonb_strip_nulls(r-ARRAY['event_id','trip_id','role']) IS DISTINCT FROM
         jsonb_strip_nulls((candidate.candidate_json->'plan'->'slots'->0->'payload'->'endpoints'->lower(r->>'role')->'time') ||
          (candidate.candidate_json->'plan'->'slots'->0->'payload'->'endpoints'->lower(r->>'role')->'place'))
       THEN RAISE EXCEPTION 'P5_SOURCE_ENDPOINT_MISMATCH' USING ERRCODE='23514';END IF;
     END IF;
ELSIF (tab='trip_activity_details' AND family NOT IN ('P1','P6')) OR (tab='trip_stay_details' AND family<>'P3') OR (tab='trip_rental_details' AND family<>'P4') THEN RAISE EXCEPTION 'SOURCE_FAMILY_TABLE_MISMATCH' USING ERRCODE='42501';
     ELSIF tab='trip_rental_details' AND (r->>'supplier' IS NOT NULL OR r->>'reserved_category' IS NOT NULL OR r->>'or_similar' IS NOT NULL OR r->>'actual_vehicle_model' IS NOT NULL OR r->>'verified_plate' IS NOT NULL)
     THEN RAISE EXCEPTION 'P4_UNSELECTED_DETAILS' USING ERRCODE='23514';
ELSIF tab='trip_activity_details' AND family='P6' AND (r->>'session_label' IS NOT NULL OR r->>'admission_note' IS NOT NULL) THEN RAISE EXCEPTION 'P6_UNSELECTED_DETAILS' USING ERRCODE='23514';
ELSIF tab IN ('trip_activity_details','trip_stay_details','trip_rental_details') AND r->>'event_id' IS DISTINCT FROM target::text
   OR tab IN ('trip_item_participants','trip_item_visibility_people')
   OR tab='trip_core_command_receipts' AND (r->>'actor_account_id' IS DISTINCT FROM actor::text OR r->>'operation_id' IS DISTINCT FROM operation::text)
   THEN RAISE EXCEPTION 'P1_SOURCE_TARGET_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
END $function$
;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.trip_core_guard_historical_source_association()'::regprocedure)) IS DISTINCT FROM '020142f091e49cb30ced7b6c392ffe17' THEN RAISE EXCEPTION 'P6_POSTIMAGE_DRIFT';END IF;END $guard$;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '04641fb76fb01aa658c8260c8a77e4c9' THEN RAISE EXCEPTION 'P6_POSTIMAGE_DRIFT';END IF;END $guard$;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '89e6e249f6b450ecb23a78bcd1a79c3c' THEN RAISE EXCEPTION 'P6_POSTIMAGE_DRIFT';END IF;END $guard$;
COMMIT;
