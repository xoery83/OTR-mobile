BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,4);
DO $guard$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND enabled AND revoked_at IS NULL AND NOT universal_p1_import_enabled AND universal_p1_review_scope IS NULL) THEN RAISE EXCEPTION 'P2_REQUIRES_CLOSED_POLICY';END IF;
IF (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY airport_code),'[]'::jsonb) FROM public.trip_core_airport_identities r WHERE registry_version='otr-dev-universal-p2-airports/20261027/1') IS DISTINCT FROM '[{"airport_code":"AKL","enabled":false,"identity_id":"IATA_AIRPORT:AKL","issuer":"IATA","namespace":"IATA_AIRPORT","registry_sha256":"19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9","registry_version":"otr-dev-universal-p2-airports/20261027/1","valid_from":"2026-11-02","valid_until":"2026-11-02"},{"airport_code":"CHC","enabled":false,"identity_id":"IATA_AIRPORT:CHC","issuer":"IATA","namespace":"IATA_AIRPORT","registry_sha256":"19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9","registry_version":"otr-dev-universal-p2-airports/20261027/1","valid_from":"2026-11-02","valid_until":"2026-11-02"}]'::jsonb THEN RAISE EXCEPTION 'P2_REQUIRES_EXACT_DORMANT_AIRPORTS';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_core_guard_historical_source_association()'::regprocedure))) IS DISTINCT FROM 'fbeeb65353a1c6f921f5b8e5d5fb5e20' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_guard_historical_source_association()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_guard_historical_source_association()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_core_publication_guard()'::regprocedure))) IS DISTINCT FROM 'bbd9cc3b2a59ff3e1740bbef4747a35b' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_publication_guard()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_publication_guard()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure))) IS DISTINCT FROM 'a5097debd28ed0af06280ad45e433270' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_gateway=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure))) IS DISTINCT FROM '03e0ae6a090e941ed0b8803209027981' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure))) IS DISTINCT FROM 'd07436a7f65eaa048ca9771bdc20bd9b' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr WHERE rr.actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543'::uuid AND rr.operation_id='50bfe576-c16d-8645-8cde-a355da5f13f9'::uuid AND rr.outcome IN ('APPLIED','NO_CHANGE')) AND NOT EXISTS(SELECT 1 FROM public.trip_source_core_v2_slots ss JOIN public.trip_source_core_v2_associations a ON a.output_slot_id=ss.output_slot_id AND a.domain_receipt_id=ss.domain_receipt_id WHERE ss.output_slot_id='0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4'::uuid AND ss.state='COMPLETE') THEN RAISE EXCEPTION 'P2_ACCEPTED_SOURCE_RECOVERY_REQUIRED';END IF;
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
 and ((ps.output_purpose->>'purposeKind'='P1_ITEM' and pc.candidate_json->>'schemaId' IN ('otr.core.universal-p1-source/1','otr.core.universal-p1-source/2')) OR (ps.output_purpose->>'purposeKind'='P3_ITEM' and pc.candidate_json->>'schemaId'='otr.core.universal-p3-source/1'))
 and pc.run_id=r.id and pc.candidate_json->>'taskId'=r.interpretation_task_id::text and pc.candidate_json->>'batchId'=r.capture_batch_id::text
 and pc.candidate_json->>'resultSha256' ~ '^[a-f0-9]{64}$'))) and r.retention_state='RETAINED') then raise exception 'INPUT_STALE' using errcode='23514';end if;
 if not exists(select 1 from public.trip_source_core_v2_slots slot join public.trip_source_core_v2_candidates candidate on candidate.candidate_id=slot.candidate_id join public.trip_core_command_receipts receipt on receipt.id=new.domain_receipt_id where slot.output_slot_id=new.output_slot_id and slot.account_id=new.account_id and slot.trip_id=new.trip_id and slot.source_id=new.source_id and slot.candidate_id=new.candidate_id and candidate.source_revision=new.source_revision and candidate.run_id=new.run_id and candidate.candidate_json->'fieldEvidence'=new.field_evidence and slot.target_kind=new.target_kind and slot.target_id=new.target_id and slot.identity_sha256=new.identity_sha256 and receipt.actor_account_id=new.account_id and receipt.trip_id=new.trip_id and receipt.operation_id=slot.operation_id and receipt.intent_sha256=slot.intent_sha256 and receipt.receipt_sha256=new.receipt_sha256 and receipt.outcome in ('APPLIED','NO_CHANGE') and receipt.body->>'command'=slot.command and exists(select 1 from jsonb_array_elements(receipt.body->'targetVector') v where v->>'kind'=new.target_kind and v->>'id'=new.target_id::text and (v->>'committedRevision')::bigint=new.target_revision)) then raise exception 'RECEIPT_TARGET_MISMATCH' using errcode='23514';end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.trip_core_publication_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin
 if tg_op<>'INSERT' then raise exception 'CORE_V2_PUBLICATION_IMMUTABLE' using errcode='42501';end if;
 if new.account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 if not exists(select 1 from public.trip_sources src join public.trip_source_runs r on r.id=new.run_id where src.id=new.source_id and src.trip_id=new.trip_id and src.acquired_by=new.account_id and src.current_material_revision=new.source_revision and src.lifecycle='ACTIVE' and src.retention_state='RETAINED' and r.trip_id=new.trip_id and r.actor_account_id=new.account_id and new.source_id=any(r.scope_source_ids) and r.state='READY' and r.superseded_by is null and r.retention_state='RETAINED') then raise exception 'INPUT_STALE' using errcode='23514';end if;
 if tg_table_name='trip_source_core_v2_publications' then
  if not exists(select 1 from public.trip_source_runs where id=new.run_id and input_sha256=new.input_catalog_sha256) then raise exception 'INPUT_STALE' using errcode='23514';end if;
 else
  if not exists(select 1 from public.trip_source_core_v2_slots slot join public.trip_core_command_receipts receipt on receipt.id=new.domain_receipt_id where slot.output_slot_id=new.output_slot_id and slot.account_id=new.account_id and slot.trip_id=new.trip_id and slot.source_id=new.source_id and slot.candidate_id=new.candidate_id and slot.target_kind=new.target_kind and slot.target_id=new.target_id and slot.identity_sha256=new.identity_sha256 and receipt.actor_account_id=new.account_id and receipt.trip_id=new.trip_id and receipt.operation_id=slot.operation_id and receipt.intent_sha256=slot.intent_sha256 and receipt.receipt_sha256=new.receipt_sha256 and receipt.outcome in ('APPLIED','NO_CHANGE') and receipt.body->>'command'=slot.command and exists(select 1 from jsonb_array_elements(receipt.body->'targetVector') v where v->>'kind'=new.target_kind and v->>'id'=new.target_id::text and (v->>'committedRevision')::bigint=new.target_revision)) then raise exception 'RECEIPT_TARGET_MISMATCH' using errcode='23514';end if;
 end if;
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
 IF actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 OR NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE')
 OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy p WHERE p.actor_account_id=actor AND p.enabled AND p.revoked_at IS NULL AND p.universal_p1_import_enabled AND coalesce(p.universal_p1_review_scope->>'family','P1') IN ('P1','P3') AND p.universal_p1_review_scope->>'tripId'=trip::text AND (p.universal_p1_review_scope->>'expiresAt')::timestamptz>clock_timestamp())
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
BEGIN
 IF session_user<>'otr_trip_core_v2_gateway' OR current_setting('role',true)<>'otr_trip_core_v2_writer'
 OR actor IS DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
 OR trip IS DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
 OR NOT EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled)
 OR current_setting('otr.core.admission',true) IS DISTINCT FROM 'REVIEWED_SOURCE'
 OR coalesce(family,'') NOT IN ('P1','P3') OR current_setting('otr.core.command',true) IS DISTINCT FROM 'CREATE_ITEM'
 OR target IS NULL OR operation IS NULL OR intent IS NULL OR op NOT IN ('INSERT','UPDATE') OR r->>'trip_id' IS DISTINCT FROM trip::text
 OR tab NOT IN ('itinerary_events','trip_activity_details','trip_stay_details','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts',
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
   IF op<>'INSERT' OR coalesce(r->'candidate_json'->>'schemaId','') NOT IN (CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' ELSE 'otr.core.universal-p1-source/1' END,CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' ELSE 'otr.core.universal-p1-source/2' END)
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
   IF (family='P3' OR r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2') AND (
    r->'candidate_json'->>'reviewedBy' IS DISTINCT FROM actor::text
    OR r->'candidate_json'->'sourceReview'->>'version' IS DISTINCT FROM CASE WHEN family='P3' THEN 'otr.universal.p3-source-review/1' ELSE 'otr.universal.p1-source-review/1' END
    OR r->'candidate_json'->'sourceReview'->>'decision' IS DISTINCT FROM 'NEW'
    OR r->'candidate_json'->'sourceReview'->>'sourceRevision' IS DISTINCT FROM r->>'source_revision'
    OR r->'candidate_json'->'sourceReview'->'originalReviewed' IS DISTINCT FROM 'true'::jsonb
    OR r->'candidate_json'->'sourceReview'->'tripReviewed' IS DISTINCT FROM 'true'::jsonb
    OR r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'core'->>'title'
    OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'start'->>'local_date'
   ) THEN RAISE EXCEPTION 'P1_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
   IF family='P3' AND (jsonb_array_length(r->'candidate_json'->'evidence') IS DISTINCT FROM 3
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE e->>'fieldKey'='END.local_date')
    OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'end'->>'local_date'
    OR r->'candidate_json'->'sourceReview'->>'title' IS DISTINCT FROM review_scope->>'title'
    OR r->'candidate_json'->'sourceReview'->>'localDate' IS DISTINCT FROM review_scope->>'localDate'
    OR r->'candidate_json'->'sourceReview'->>'endLocalDate' IS DISTINCT FROM review_scope->>'endLocalDate'
    OR (r->'candidate_json'->'sourceReview'->>'endLocalDate')::date <= (r->'candidate_json'->'sourceReview'->>'localDate')::date)
    THEN RAISE EXCEPTION 'P3_SOURCE_REVIEW_INVALID' USING ERRCODE='23514';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'candidate_json'->'evidence') e WHERE (e->>'fieldKey' NOT IN ('ROOT.title','START.local_date') AND NOT (family='P3' AND e->>'fieldKey'='END.local_date'))
    OR e->>'candidateId' IS DISTINCT FROM r->>'candidate_id'
    OR (e->>'raw' IS DISTINCT FROM CASE e->>'fieldKey' WHEN 'ROOT.title' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'core'->>'title' WHEN 'START.local_date' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'start'->>'local_date' WHEN 'END.local_date' THEN r->'candidate_json'->'plan'->'slots'->0->'payload'->'schedule'->'end'->>'local_date' END
     AND NOT coalesce((r->'candidate_json'->>'schemaId'='otr.core.universal-p1-source/2'
      AND e->>'fieldKey'='START.local_date' AND e->'normalization'->>'rule'='ENGLISH_MONTH_CIVIL_DATE'
      AND e->'normalization'->>'value'=r->'candidate_json'->'sourceReview'->>'localDate'
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
  IF candidate.candidate_id IS NULL OR coalesce(candidate.candidate_json->>'schemaId','') NOT IN (CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' ELSE 'otr.core.universal-p1-source/1' END,CASE WHEN family='P3' THEN 'otr.core.universal-p3-source/1' ELSE 'otr.core.universal-p1-source/2' END) THEN RAISE EXCEPTION 'P1_SOURCE_CANDIDATE_REQUIRED' USING ERRCODE='23514';END IF;
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
  ELSIF (tab='trip_activity_details' AND family<>'P1') OR (tab='trip_stay_details' AND family<>'P3') THEN RAISE EXCEPTION 'SOURCE_FAMILY_TABLE_MISMATCH' USING ERRCODE='42501';
  ELSIF tab IN ('trip_activity_details','trip_stay_details') AND r->>'event_id' IS DISTINCT FROM target::text
   OR tab IN ('trip_item_participants','trip_item_visibility_people')
   OR tab='trip_core_command_receipts' AND (r->>'actor_account_id' IS DISTINCT FROM actor::text OR r->>'operation_id' IS DISTINCT FROM operation::text)
   THEN RAISE EXCEPTION 'P1_SOURCE_TARGET_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_core_finite_read_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid;trip uuid;operation uuid;
begin
 trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
  if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' or tg_op not in ('INSERT','UPDATE') or not public.trip_core_finite_scope_allowed(actor,trip)
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION')))
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$
;
DO $guard$ BEGIN
IF (SELECT md5(pg_get_functiondef('public.trip_core_guard_historical_source_association()'::regprocedure))) IS DISTINCT FROM '172f102496928a1e9e4b95ff39b3ca92' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_guard_historical_source_association()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_guard_historical_source_association()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_core_publication_guard()'::regprocedure))) IS DISTINCT FROM 'd06a99c5695e736bc68886efb2c6d9ca' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_publication_guard()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_publication_guard()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure))) IS DISTINCT FROM '83af86dcd7df97d3360b1c29207a780e' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_gateway=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure))) IS DISTINCT FROM '6c836f8e5cd04b73805c1fc1dd880e1d' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
IF (SELECT md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure))) IS DISTINCT FROM 'fa773459d8159bb512f0177399373ba1' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure) IS DISTINCT FROM 'postgres' OR (SELECT proacl::text FROM pg_proc WHERE oid='public.trip_core_finite_read_state_guard()'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' THEN RAISE EXCEPTION 'P2_FUNCTION_DRIFT';END IF;
END $guard$;
COMMIT;
