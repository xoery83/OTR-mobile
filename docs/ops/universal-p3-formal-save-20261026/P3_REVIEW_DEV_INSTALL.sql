BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714024,3);
DO $check$ BEGIN
IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND (universal_p1_import_enabled OR universal_p1_review_scope IS NOT NULL)) THEN RAISE EXCEPTION 'P3_REQUIRES_CLOSED_SCOPE';END IF;
IF md5(pg_get_functiondef('public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)'::regprocedure)) <> 'b3b4977f6b85d6ca5f83fa6a72fb65ef' THEN RAISE EXCEPTION 'P3_FUNCTION_DRIFT';END IF;
IF md5(pg_get_functiondef('public.trip_sustained_import_p1_capabilities(uuid,uuid)'::regprocedure)) <> '1b9df5d4ea45df5a60b280e38ac16653' THEN RAISE EXCEPTION 'P3_FUNCTION_DRIFT';END IF;
IF md5(pg_get_functiondef('public.trip_core_guard_historical_source_association()'::regprocedure)) <> '3cb65438530089deea2ae5ffc7135d7c' THEN RAISE EXCEPTION 'P3_FUNCTION_DRIFT';END IF;
END $check$;
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
COMMIT;
