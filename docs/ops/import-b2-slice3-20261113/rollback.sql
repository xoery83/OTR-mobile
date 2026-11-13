-- Owner-approved finite IMPORT compatibility; no roles, grants, RLS or data changes.
begin; set local search_path=pg_catalog; set local lock_timeout='5s'; set local statement_timeout='45s';
DO $check0$ BEGIN IF (SELECT md5(pg_get_functiondef('public.assert_trip_core_v2_aggregate(uuid)'::regprocedure))) IS DISTINCT FROM '9fe9da1b0017053e9cf2fef3b8e1bd0b' THEN RAISE EXCEPTION 'IMPORT_CORE_PREIMAGE_assert_trip_core_v2_aggregate';END IF; END $check0$;
CREATE OR REPLACE FUNCTION public.assert_trip_core_v2_aggregate(item uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$ declare root public.itinerary_events;endpoint_count integer;service_count integer;begin
 select * into root from public.itinerary_events where id=item;
 if not found then return;end if;
 if root.business_contract_version is null then perform public.assert_trip_event_aggregate(item);return;end if;
 if not public.trip_core_event_row_valid(to_jsonb(root)) then raise exception 'CORE_V2_INVALID_AGGREGATE' using errcode='23514';end if;
 select count(*) into endpoint_count from public.itinerary_transport_endpoints where event_id=item;
 select count(*) into service_count from public.itinerary_transport_services where event_id=item;
 if root.temporal_shape='TRANSPORT' then
  if endpoint_count<>2 or not exists(select 1 from public.itinerary_transport_endpoints where event_id=item and role='ORIGIN' and local_date is not null) then raise exception 'CORE_V2_INVALID_ENDPOINTS' using errcode='23514';end if;
  if root.experience_family='P2' AND (session_user='otr_trip_core_v2_gateway'
   AND coalesce(current_setting('otr.core.command',true),'') IN ('SET_AUTHORED_FLIGHT_DETAILS','SET_ITEM_PARTICIPATION','RECONCILE_ITEM_DOCUMENTS')
   AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2'
   AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL'
   AND current_setting('otr.core.target_item',true) IS NOT DISTINCT FROM item::text
   AND root.owner_account_id IS NOT DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
   AND public.trip_sustained_dev_scope_allowed(root.owner_account_id,root.trip_id,null,'CORE_P2_DETAILS')) IS TRUE then
   if service_count<>0 OR NOT EXISTS(SELECT 1 FROM public.trip_flight_intents WHERE event_id=item AND trip_id=root.trip_id AND qualification='SPARSE')
    OR EXISTS(SELECT 1 FROM public.itinerary_transport_endpoints ep WHERE ep.event_id=item AND (ep.instant IS NOT NULL OR ep.source_instant IS NOT NULL OR ep.source_instant_precision IS NOT NULL OR ep.interpretation_key IS NOT NULL OR ep.interpretation_input_sha256 IS NOT NULL OR ep.provenance_refs IS NOT NULL OR ep.civil_resolution IS DISTINCT FROM 'PENDING' OR ep.basis IS DISTINCT FROM 'DERIVED_CIVIL' OR ep.resolution_offset_seconds IS NOT NULL OR ep.supplied_offset_seconds IS NOT NULL))
   then raise exception 'CORE_V2_INVALID_AUTHORED_FLIGHT' using errcode='23514';end if;
  else
  if root.experience_family='P2' and (service_count not between 1 and 4 or exists(select 1 from public.itinerary_transport_services where event_id=item and transport_subtype<>'FLIGHT') or not exists(select 1 from public.trip_flight_intents where event_id=item and qualification='QUALIFIED')) then raise exception 'CORE_V2_INVALID_FLIGHT' using errcode='23514';end if;
  end if;
  if root.experience_family='P5' and (service_count<>1 or exists(select 1 from public.itinerary_transport_services where event_id=item and transport_subtype='FLIGHT')) then raise exception 'CORE_V2_INVALID_SEGMENT' using errcode='23514';end if;
 elsif endpoint_count<>0 or service_count<>0 then raise exception 'CORE_V2_DUPLICATE_SCHEDULE' using errcode='23514';end if;
 if root.experience_family='P2' and root.temporal_shape='CALENDAR' and not exists(select 1 from public.trip_flight_intents where event_id=item and qualification='SPARSE') then raise exception 'CORE_V2_INVALID_SPARSE_FLIGHT' using errcode='23514';end if;
 if root.participation_mode='SELECTED_MEMBERS' and not exists(select 1 from public.trip_item_participants where item_id=item and active) or root.participation_mode<>'SELECTED_MEMBERS' and exists(select 1 from public.trip_item_participants where item_id=item and active) then raise exception 'CORE_V2_INVALID_PARTICIPATION' using errcode='23514';end if;
 if root.visibility='SELECTED_PERSONS' and not exists(select 1 from public.trip_item_visibility_people where item_id=item) or root.visibility<>'SELECTED_PERSONS' and exists(select 1 from public.trip_item_visibility_people where item_id=item) then raise exception 'CORE_V2_INVALID_VISIBILITY' using errcode='23514';end if;
end $function$;
DO $check1$ BEGIN IF (SELECT md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure))) IS DISTINCT FROM 'b1b580acb9cfe4a2c1f5e54da45ca854' THEN RAISE EXCEPTION 'IMPORT_CORE_PREIMAGE_trip_core_finite_read_state_guard';END IF; END $check1$;
CREATE OR REPLACE FUNCTION public.trip_core_finite_read_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare actor uuid;trip uuid;operation uuid;
begin
 trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;
 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN
 IF TG_OP='UPDATE'
 AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
 AND NEW.epoch IS NOT DISTINCT FROM OLD.epoch AND NEW.revision=OLD.revision+1
 AND NEW.access_revision=OLD.access_revision+1
 AND public.trip_member_claim_read_state_allowed(trip) THEN RETURN NEW;END IF;
 END IF;

 IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN
  IF TG_OP='INSERT' AND otr_auth_guest_composite.read_state_allowed(trip,'CREATE')
  AND NEW.revision=1 AND NEW.access_revision=1 THEN RETURN NEW;END IF;
  IF TG_OP='UPDATE' AND otr_auth_guest_composite.read_state_allowed(trip,'PERSON')
  AND NEW.epoch IS NOT DISTINCT FROM OLD.epoch AND NEW.revision=OLD.revision+1
  AND NEW.access_revision=OLD.access_revision+1 THEN RETURN NEW;END IF;
 END IF;

 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
  if current_setting('otr.core.command',true) in ('CREATE_DOCUMENT_METADATA','RECONCILE_ITEM_DOCUMENTS') then
   if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway'
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or tg_op not in ('INSERT','UPDATE')
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or not coalesce(public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE'),false)
    or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
    or tg_op='UPDATE' and (new.epoch is distinct from old.epoch
      or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1)
   then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
   return new;
  end if;
  if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' or tg_op not in ('INSERT','UPDATE') or not public.trip_core_finite_scope_allowed(actor,trip)
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and ((current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_STAY_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P3' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_RENTAL_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P4' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P6') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_ACTIVITY_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P6' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P5') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_TRANSPORT_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P5' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'CREATE_SPARSE_FLIGHT' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2_DETAILS') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_AUTHORED_FLIGHT_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL')) OR (current_setting('otr.core.command',true)='CREATE_SPARSE_FLIGHT' AND current_setting('otr.core.family',true)='P2' AND current_setting('otr.core.admission',true)='REVIEWED_SOURCE' AND EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled AND c.enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT']::text[] AND c.enabled_families=ARRAY['P2']::text[]) AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr JOIN public.trip_source_core_v2_slots ss ON ss.operation_id=rr.operation_id AND ss.intent_sha256=rr.intent_sha256 AND ss.account_id=rr.actor_account_id AND ss.trip_id=rr.trip_id WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.operation_id=nullif(current_setting('otr.core.operation',true),'')::uuid AND ss.output_slot_id=nullif(current_setting('otr.core.source_intent',true),'')::uuid AND ss.target_id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND ss.command='CREATE_SPARSE_FLIGHT' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND rr.body->>'command'='CREATE_SPARSE_FLIGHT')))))
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$;
DO $check2$ BEGIN IF (SELECT md5(pg_get_functiondef('public.trip_core_guard_write()'::regprocedure))) IS DISTINCT FROM '6e1171d4ad2872c44a7e294ead7ab5d7' THEN RAISE EXCEPTION 'IMPORT_CORE_PREIMAGE_trip_core_guard_write';END IF; END $check2$;
CREATE OR REPLACE FUNCTION public.trip_core_guard_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ declare old_json jsonb;new_json jsonb;actor uuid;trip uuid; begin
 IF NOT otr_auth_guest_composite.mutation_allowed() THEN RAISE EXCEPTION 'AUTH_ADOPTION_MUTATION_ALREADY_FINALIZED' USING ERRCODE='42501';END IF;
 if tg_op='TRUNCATE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='DELETE' then old_json:=to_jsonb(old);else new_json:=to_jsonb(new);end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;
 if tg_op='INSERT' and tg_table_name in ('trip_source_core_v2_publications','trip_source_core_v2_candidates','trip_source_core_v2_intents') and public.trip_core_source_review_row_allowed(tg_table_name,tg_op,new_json) then return new;end if;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
  if current_setting('otr.core.command',true) in ('CREATE_DOCUMENT_METADATA','RECONCILE_ITEM_DOCUMENTS') then
   if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or nullif(current_setting('otr.core.operation',true),'') is null
    or nullif(current_setting('otr.core.target_item',true),'') is null
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or not coalesce(public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE'),false)
    or not coalesce(public.trip_core_actor_has_trip(actor,trip),false)
   then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
   if tg_table_name='trip_core_command_receipts' and tg_op='INSERT'
      and new_json->>'actor_account_id'=actor::text
      and new_json->>'operation_id'=current_setting('otr.core.operation',true)
      and new_json->'body'->>'command'=current_setting('otr.core.command',true)
   then return new;end if;
   if current_setting('otr.core.command',true)='CREATE_DOCUMENT_METADATA' then
    if tg_table_name='trip_operational_documents' and tg_op='INSERT'
       and new_json->>'id'=current_setting('otr.core.target_item',true)
       and new_json->>'owner_account_id'=actor::text
       and new_json->>'custody'='LOCAL_ONLY' and new_json->>'visibility'='PRIVATE'
    then return new;end if;
   else
    if tg_table_name='itinerary_events' and tg_op='UPDATE'
       and new_json->>'id'=current_setting('otr.core.target_item',true)
       and old_json->>'owner_account_id'=actor::text
       and old_json->>'business_contract_version'='2'
       and new_json-array['semantic_revision','updated_at']=old_json-array['semantic_revision','updated_at']
       and (new_json->>'semantic_revision')::bigint=(old_json->>'semantic_revision')::bigint+1
    then return new;end if;
    if tg_table_name='trip_item_document_links' and tg_op in ('INSERT','UPDATE')
       and new_json->>'item_id'=current_setting('otr.core.target_item',true)
       and new_json->>'linked_by'=actor::text
       and (tg_op='INSERT' or new_json-'active'=old_json-'active')
       and exists(select 1 from public.itinerary_events i where i.trip_id=trip and i.id=(new_json->>'item_id')::uuid
           and i.owner_account_id=actor and i.business_contract_version=2)
       and exists(select 1 from public.trip_operational_documents d where d.trip_id=trip
           and d.id=(new_json->>'document_id')::uuid and d.owner_account_id=actor
           and d.custody='LOCAL_ONLY' and d.visibility='PRIVATE')
    then return new;end if;
   end if;
   raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';
  end if;
  if public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and current_setting('otr.core.admission',true)='REVIEWED_SOURCE' then
   perform public.trip_sustained_import_p1_guard(tg_table_name,tg_op,new_json,old_json,actor,trip);
  elsif public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') then
   if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or NOT (current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P1' OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') and current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P3') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P4') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P5') AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P5') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P6') AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P6') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2') AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2'))
    or coalesce(current_setting('otr.core.command',true),'') not in ('CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS','SET_TRANSPORT_DETAILS','SET_ACTIVITY_DETAILS','CREATE_SPARSE_FLIGHT','SET_AUTHORED_FLIGHT_DETAILS')
    or (current_setting('otr.core.command',true)='SET_STAY_DETAILS' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P3')
    or (current_setting('otr.core.command',true)='SET_RENTAL_DETAILS' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P4')
    or (current_setting('otr.core.command',true)='SET_TRANSPORT_DETAILS' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P5')
    or (current_setting('otr.core.family',true)='P5' and current_setting('otr.core.command',true) NOT IN ('CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_PARTICIPATION','SET_TRANSPORT_DETAILS'))
    or (current_setting('otr.core.command',true)='SET_ACTIVITY_DETAILS' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P6')
    or (current_setting('otr.core.command',true) IN ('CREATE_SPARSE_FLIGHT','SET_AUTHORED_FLIGHT_DETAILS') AND current_setting('otr.core.family',true) IS DISTINCT FROM 'P2')
    or (current_setting('otr.core.family',true)='P2' AND coalesce(current_setting('otr.core.command',true),'') NOT IN ('CREATE_SPARSE_FLIGHT','SET_AUTHORED_FLIGHT_DETAILS','SET_ITEM_PARTICIPATION'))
    or (current_setting('otr.core.family',true)='P2' AND current_setting('otr.core.command',true) IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT' AND NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2_DETAILS'))
    -- Initial Manual Sparse creation cannot be reused as an Edit or attached to an old aggregate.
    or (current_setting('otr.core.family',true)='P2' AND current_setting('otr.core.command',true)='CREATE_SPARSE_FLIGHT' AND (
      tg_op<>'INSERT'
      OR tg_table_name NOT IN ('itinerary_events','trip_flight_intents','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
      OR (tg_table_name='itinerary_events' AND (new_json->>'semantic_revision' IS DISTINCT FROM '1' OR new_json->>'temporal_shape' IS DISTINCT FROM 'CALENDAR'))
      OR (tg_table_name<>'itinerary_events' AND NOT EXISTS (
        SELECT 1 FROM public.itinerary_events initial
        WHERE initial.id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND initial.trip_id=trip
        AND initial.owner_account_id=actor AND initial.experience_family='P2' AND initial.business_contract_version=2
        AND initial.semantic_revision=1 AND initial.temporal_shape='CALENDAR'
        AND initial.xmin::text::bigint=(txid_current()%4294967296)
      ))
      OR EXISTS(SELECT 1 FROM public.trip_core_command_receipts previous WHERE previous.trip_id=trip AND previous.body#>'{result,created}' @> jsonb_build_array(jsonb_build_object('kind','ITEM','id',current_setting('otr.core.target_item',true))))
      OR (tg_table_name='trip_core_command_receipts' AND (
        new_json->>'operation_id' IS DISTINCT FROM nullif(current_setting('otr.core.operation',true),'')
        OR new_json->>'outcome' IS DISTINCT FROM 'APPLIED'
        OR new_json#>>'{body,command}' IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT'
        OR new_json#>>'{body,actorAccountId}' IS DISTINCT FROM actor::text
        OR new_json#>>'{body,tripId}' IS DISTINCT FROM trip::text
        OR new_json#>>'{body,operationId}' IS DISTINCT FROM new_json->>'operation_id'
        OR new_json#>>'{body,intentSha256}' IS DISTINCT FROM new_json->>'intent_sha256'
        OR new_json#>>'{body,receiptSha256}' IS DISTINCT FROM new_json->>'receipt_sha256'
        OR new_json#>>'{body,outcome}' IS DISTINCT FROM 'APPLIED'
        OR new_json#>'{body,result,created}' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('kind','ITEM','id',current_setting('otr.core.target_item',true)))
        OR new_json#>'{body,targetVector}' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('kind','ITEM','id',current_setting('otr.core.target_item',true),'baseRevision',null,'committedRevision',1))
        OR (new_json->>'canonical_intent_text')::jsonb->>'command' IS DISTINCT FROM 'CREATE_SPARSE_FLIGHT'
        OR (new_json->>'canonical_intent_text')::jsonb->>'tripId' IS DISTINCT FROM trip::text
        OR (new_json->>'canonical_intent_text')::jsonb->>'operationId' IS DISTINCT FROM new_json->>'operation_id'
        OR (new_json->>'canonical_intent_text')::jsonb#>'{target}' IS DISTINCT FROM jsonb_build_object('kind','ITEM','id',current_setting('otr.core.target_item',true))
        OR (new_json->>'canonical_intent_text')::jsonb#>'{baseVector}' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('kind','ITEM','id',current_setting('otr.core.target_item',true),'revision',null))
        OR (new_json->>'canonical_intent_text')::jsonb#>'{admission}' IS DISTINCT FROM jsonb_build_object('mode','MANUAL','sourceIntentId',null,'policyVersion',null)
        OR new_json->>'intent_sha256' IS DISTINCT FROM encode(sha256(convert_to('otr-trip-core-intent-v2'||E'\n'||(new_json->>'canonical_intent_text'),'UTF8')),'hex')
      ))
    ))
    or nullif(current_setting('otr.core.target_item',true),'') is null
    or tg_table_name not in ('itinerary_events','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_rental_places','trip_activity_details','trip_activity_entry_places','itinerary_transport_endpoints','itinerary_transport_services','trip_flight_intents','trip_endpoint_details','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
    or tg_op='DELETE' and not ((tg_table_name='trip_item_participants' and current_setting('otr.core.command',true)='SET_ITEM_PARTICIPATION') or (tg_table_name='trip_stay_rooms' and current_setting('otr.core.family',true)='P3' and current_setting('otr.core.command',true)='SET_STAY_DETAILS') or (tg_table_name='trip_rental_places' and current_setting('otr.core.family',true)='P4' and current_setting('otr.core.command',true)='SET_RENTAL_DETAILS'))
    or tg_table_name='itinerary_events' and ((coalesce(new_json,old_json)->>'id') is distinct from current_setting('otr.core.target_item',true) or coalesce(new_json,old_json)->>'experience_family' is distinct from current_setting('otr.core.family',true) or coalesce(new_json,old_json)->>'business_contract_version' is distinct from '2' or coalesce(new_json,old_json)->>'owner_account_id' is distinct from actor::text)
    or tg_op='UPDATE' and tg_table_name in ('itinerary_transport_endpoints','itinerary_transport_services') and old_json->'event_id' IS DISTINCT FROM new_json->'event_id'
    or tg_op='UPDATE' and tg_table_name='itinerary_transport_endpoints' and old_json->'role' IS DISTINCT FROM new_json->'role'
    or tg_op='UPDATE' and tg_table_name='itinerary_transport_services' and old_json->'service_key' IS DISTINCT FROM new_json->'service_key'
    or tg_table_name='itinerary_transport_services' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P5'
    or tg_table_name='itinerary_transport_endpoints' and NOT (current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P5' OR (current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P2' AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_AUTHORED_FLIGHT_DETAILS'))
    or tg_table_name in ('trip_flight_intents','trip_endpoint_details') and current_setting('otr.core.family',true) IS DISTINCT FROM 'P2'
    or tg_table_name='trip_flight_intents' and (coalesce(current_setting('otr.core.command',true),'') NOT IN ('CREATE_SPARSE_FLIGHT','SET_AUTHORED_FLIGHT_DETAILS') OR tg_op NOT IN ('INSERT','UPDATE') OR new_json->>'qualification' IS DISTINCT FROM 'SPARSE' OR (tg_op='UPDATE' AND old_json->>'qualification' IS DISTINCT FROM 'SPARSE'))
    or tg_table_name='trip_endpoint_details' and current_setting('otr.core.command',true) IS DISTINCT FROM 'SET_AUTHORED_FLIGHT_DETAILS'
    or tg_op='UPDATE' and tg_table_name in ('trip_flight_intents','trip_endpoint_details') and old_json->'event_id' IS DISTINCT FROM new_json->'event_id'
    or tg_op='UPDATE' and tg_table_name='trip_endpoint_details' and old_json->'role' IS DISTINCT FROM new_json->'role'
    or tg_table_name='itinerary_transport_endpoints' and current_setting('otr.core.family',true)='P2' and (coalesce(new_json,old_json)->>'instant' IS NOT NULL OR coalesce(new_json,old_json)->>'source_instant' IS NOT NULL OR coalesce(new_json,old_json)->>'source_instant_precision' IS NOT NULL OR coalesce(new_json,old_json)->>'interpretation_key' IS NOT NULL OR coalesce(new_json,old_json)->>'interpretation_input_sha256' IS NOT NULL OR coalesce(new_json,old_json)->>'provenance_refs' IS NOT NULL OR coalesce(new_json,old_json)->>'civil_resolution' IS DISTINCT FROM 'PENDING' OR coalesce(new_json,old_json)->>'basis' IS DISTINCT FROM 'DERIVED_CIVIL' OR coalesce(new_json,old_json)->>'resolution_offset_seconds' IS NOT NULL OR coalesce(new_json,old_json)->>'supplied_offset_seconds' IS NOT NULL)
    or tg_op='UPDATE' and current_setting('otr.core.family',true)='P6' and tg_table_name in ('trip_activity_details','trip_activity_entry_places') and old_json->'event_id' IS DISTINCT FROM new_json->'event_id'
    or tg_op='UPDATE' and tg_table_name='trip_activity_entry_places' and old_json->'role' IS DISTINCT FROM new_json->'role'
    or tg_table_name='trip_activity_entry_places' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P6'
    or tg_table_name in ('trip_activity_details','trip_activity_entry_places') and current_setting('otr.core.family',true)='P6' and coalesce(current_setting('otr.core.command',true),'') NOT IN ('CREATE_ITEM','SET_ACTIVITY_DETAILS')
    or tg_op='UPDATE' and tg_table_name in ('trip_rental_details','trip_rental_places') and old_json->'event_id' IS DISTINCT FROM new_json->'event_id'
    or tg_op='UPDATE' and tg_table_name='trip_rental_places' and old_json->'role' IS DISTINCT FROM new_json->'role'
    or tg_table_name='trip_activity_details' and NOT (current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P1' OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P6') AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P6'))
    or tg_table_name in ('trip_stay_details','trip_stay_rooms') and current_setting('otr.core.family',true) IS DISTINCT FROM 'P3'
    or tg_table_name in ('trip_rental_details','trip_rental_places') and current_setting('otr.core.family',true) IS DISTINCT FROM 'P4'
    or tg_table_name in ('trip_activity_details','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_rental_places','itinerary_transport_endpoints','itinerary_transport_services','trip_activity_entry_places','trip_flight_intents','trip_endpoint_details') and (coalesce(new_json,old_json)->>'event_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_item_participants','trip_item_visibility_people') and (coalesce(new_json,old_json)->>'item_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_activity_details','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_rental_places','itinerary_transport_endpoints','itinerary_transport_services','trip_activity_entry_places','trip_flight_intents','trip_endpoint_details','trip_item_participants','trip_item_visibility_people') and not exists(select 1 from public.itinerary_events event where event.id=nullif(current_setting('otr.core.target_item',true),'')::uuid and event.trip_id=trip and event.experience_family=current_setting('otr.core.family',true) and event.owner_account_id=actor)
    or tg_table_name='trip_core_command_receipts' and (tg_op<>'INSERT' or new_json->>'actor_account_id' is distinct from actor::text)
    then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
  else
  if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or not public.trip_core_finite_scope_allowed(actor,trip)
   or current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM'
   or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
   or coalesce(current_setting('otr.core.family',true),'') not in ('P1','P3')
   or tg_op<>'INSERT' or tg_table_name not in ('itinerary_events','trip_activity_details','trip_stay_details','trip_stay_rooms','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
   or tg_table_name='itinerary_events' and (new_json->>'business_contract_version' is distinct from '2' or new_json->>'experience_family' is distinct from current_setting('otr.core.family',true))
   or tg_table_name='trip_activity_details' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P1'
   or tg_table_name in ('trip_stay_details','trip_stay_rooms') and current_setting('otr.core.family',true) IS DISTINCT FROM 'P3'
   or tg_table_name='trip_core_command_receipts' and new_json->>'actor_account_id' is distinct from actor::text
  then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
  end if;
 end if;
 if tg_table_name in ('itinerary_events','itinerary_reservations') and coalesce(old_json->>'business_contract_version',new_json->>'business_contract_version') is null then return coalesce(new,old);end if;
 if tg_table_name in ('itinerary_transport_endpoints','itinerary_transport_services') and coalesce(old_json->>'trip_id',new_json->>'trip_id') is null then return coalesce(new,old);end if;
 if current_user<>'otr_trip_core_v2_writer' or (not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) and not public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE')) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
 if not public.trip_core_actor_has_trip(actor,trip) then raise exception 'CORE_V2_NOT_VISIBLE' using errcode='42501';end if;
 if tg_op='DELETE' and tg_table_name in ('itinerary_events','itinerary_reservations','trip_entitlements','trip_operational_documents','trip_instruction_entries','trip_booking_observations','trip_core_command_receipts','trip_source_core_v2_candidates','trip_source_core_v2_intents','trip_source_core_v2_slots') then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='UPDATE' and (old_json->'id' is distinct from new_json->'id' or old_json->'trip_id' is distinct from new_json->'trip_id' or old_json->'owner_account_id' is distinct from new_json->'owner_account_id' or old_json->'created_at' is distinct from new_json->'created_at') then raise exception 'CORE_V2_IMMUTABLE_IDENTITY' using errcode='23514';end if;
 if tg_table_name='trip_core_command_receipts' and tg_op<>'INSERT' then raise exception 'CORE_V2_RECEIPT_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_source_core_v2_candidates' and tg_op<>'INSERT' then raise exception 'CORE_V2_CANDIDATE_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_instruction_entries' and tg_op='UPDATE' and (old_json-array['revision','visibility','hidden_at','updated_at','field_state']) is distinct from (new_json-array['revision','visibility','hidden_at','updated_at','field_state']) then raise exception 'CORE_V2_INSTRUCTION_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='itinerary_events' and tg_op<>'DELETE' and not public.trip_core_event_row_valid(new_json) then raise exception 'CORE_V2_INVALID_AGGREGATE' using errcode='23514';end if;
 return coalesce(new,old);
end $function$;
DO $check3$ BEGIN IF (SELECT md5(pg_get_functiondef('public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure))) IS DISTINCT FROM 'c0f23166e363febc0594d9dd1ccb159e' THEN RAISE EXCEPTION 'IMPORT_CORE_PREIMAGE_trip_sustained_core_capabilities';END IF; END $check3$;
CREATE OR REPLACE FUNCTION public.trip_sustained_core_capabilities(actor uuid, trip uuid)
 RETURNS TABLE(runtime_enabled boolean, enabled_commands text[], enabled_families text[], enabled_admission_modes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$BEGIN
 IF NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') THEN RAISE EXCEPTION 'CORE_CAPABILITY_CLOSED' USING ERRCODE='42501';END IF;
 IF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P2') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS','SET_TRANSPORT_DETAILS','SET_ACTIVITY_DETAILS','CREATE_SPARSE_FLIGHT','SET_AUTHORED_FLIGHT_DETAILS']::text[] || ARRAY['CREATE_DOCUMENT_METADATA','RECONCILE_ITEM_DOCUMENTS']::text[],ARRAY['P1','P2','P3','P4','P5','P6']::text[],ARRAY['MANUAL']::text[];
 ELSIF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P6') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS','SET_TRANSPORT_DETAILS','SET_ACTIVITY_DETAILS']::text[],ARRAY['P1','P3','P4','P5','P6']::text[],ARRAY['MANUAL']::text[];
 ELSIF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P5') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS','SET_TRANSPORT_DETAILS']::text[],ARRAY['P1','P3','P4','P5']::text[],ARRAY['MANUAL']::text[];
 ELSIF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS']::text[],ARRAY['P1','P3','P4']::text[],ARRAY['MANUAL']::text[];
 ELSIF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS']::text[],ARRAY['P1','P3']::text[],ARRAY['MANUAL']::text[];
 ELSE
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION']::text[],ARRAY['P1']::text[],ARRAY['MANUAL']::text[];
 END IF;
END $function$;
DO $check4$ BEGIN IF (SELECT md5(pg_get_functiondef('public.trip_document_bind_private_custody()'::regprocedure))) IS DISTINCT FROM 'be76211a589cc820eaa5020daae1c012' THEN RAISE EXCEPTION 'IMPORT_CORE_PREIMAGE_trip_document_bind_private_custody';END IF; END $check4$;
CREATE OR REPLACE FUNCTION public.trip_document_bind_private_custody()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare proof public.trip_operational_document_custody%rowtype;
begin
 if tg_op='UPDATE' and (new.id,new.trip_id,new.owner_account_id,new.media_type,new.byte_size,new.sha256,new.custody,new.source_representation_id,new.storage_object_key,new.content_version,new.custody_receipt_id) is distinct from
  (old.id,old.trip_id,old.owner_account_id,old.media_type,old.byte_size,old.sha256,old.custody,old.source_representation_id,old.storage_object_key,old.content_version,old.custody_receipt_id) then raise exception 'DOCUMENT_ORIGINAL_IMMUTABLE' using errcode='42501'; end if;
 if tg_op='UPDATE' then return new; end if;
 if new.custody='LOCAL_ONLY' then
  if current_user<>'otr_trip_core_v2_writer'
   or current_setting('otr.core.command',true) is distinct from 'CREATE_DOCUMENT_METADATA'
   or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
   or new.owner_account_id::text is distinct from current_setting('otr.core.actor',true)
   or new.trip_id::text is distinct from current_setting('otr.core.trip',true)
   or new.id::text is distinct from current_setting('otr.core.target_item',true)
   or new.visibility<>'PRIVATE'
  then raise exception 'DOCUMENT_METADATA_SCOPE_REQUIRED' using errcode='42501';end if;
  return new;
 end if;
 select * into proof from public.trip_operational_document_custody where id=new.custody_receipt_id and trip_id=new.trip_id for update;
 if not found or proof.state<>'VERIFIED' or new.custody<>'PRIVATE_SOURCE_REFERENCE' or new.visibility<>'PRIVATE' or new.storage_object_key is not null or
  (proof.document_id,proof.actor_account_id,proof.source_representation_id,proof.sha256,proof.byte_size,proof.media_type) is distinct from
  (new.id,new.owner_account_id,new.source_representation_id,new.sha256,new.byte_size,new.media_type) then raise exception 'DOCUMENT_CUSTODY_PROOF_REQUIRED' using errcode='42501'; end if;
 update public.trip_operational_document_custody set state='BOUND',bound_at=clock_timestamp() where id=proof.id;
 return new;
end $function$;
DO $check5$ BEGIN IF (SELECT md5(pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure))) IS DISTINCT FROM 'f593afc154e60ffbe885d887af48820a' THEN RAISE EXCEPTION 'IMPORT_CORE_PREIMAGE_trip_sustained_dev_scope_allowed';END IF; END $check5$;
CREATE OR REPLACE FUNCTION public.trip_sustained_dev_scope_allowed(actor uuid, trip uuid, operation uuid, kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE principal record;policy record;r record;owner_id oid;
BEGIN
 IF otr_auth_guest_composite.has_scope() THEN RETURN otr_auth_guest_composite.scope_allowed(actor,trip,operation,kind);END IF;
 IF current_user<>'postgres' OR actor IS NULL OR kind IS NULL OR kind NOT IN ('CREATE','METADATA','CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS','PERSON') THEN RETURN false;END IF;
 IF session_user<>(CASE kind WHEN 'CREATE' THEN 'otr_trip_create_gateway' WHEN 'METADATA' THEN 'otr_trip_metadata_gateway' WHEN 'PERSON' THEN 'otr_trip_person_command_gateway' ELSE 'otr_trip_core_v2_gateway' END) THEN RETURN false;END IF;
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname='postgres';
 SELECT * INTO principal FROM pg_roles WHERE rolname=session_user;
 IF NOT principal.rolcanlogin OR principal.rolconnlimit<>1 OR principal.rolvaliduntil IS NOT NULL AND principal.rolvaliduntil<>'infinity'::timestamptz
 OR principal.rolsuper OR principal.rolcreatedb OR principal.rolcreaterole OR principal.rolinherit OR principal.rolbypassrls OR principal.rolreplication
 OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=principal.oid AND deptype='o')
 OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE (m.roleid=principal.oid OR m.member=principal.oid) AND NOT (
 (m.member=owner_id AND m.roleid=principal.oid AND m.admin_option AND NOT m.inherit_option)
 OR(kind='PERSON' AND m.member=owner_id AND m.roleid=principal.oid AND m.grantor=owner_id AND NOT m.admin_option AND NOT m.inherit_option AND NOT m.set_option
 AND EXISTS(SELECT 1 FROM pg_auth_members paired WHERE paired.roleid=m.roleid AND paired.member=m.member AND paired.grantor='supabase_admin'::regrole AND paired.admin_option AND NOT paired.inherit_option AND NOT paired.set_option))
 OR(kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS') AND m.member=principal.oid AND m.roleid='otr_trip_core_v2_writer'::regrole AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)))
 THEN RETURN false;END IF;
 SELECT * INTO policy FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 IF FOUND AND (NOT policy.enabled OR policy.revoked_at IS NOT NULL) THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND is_anonymous IS FALSE) THEN RETURN false;END IF;
 IF kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS') AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN RETURN false;END IF;
 IF trip IS NULL THEN
  IF operation IS NULL OR kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS','PERSON') THEN RETURN false;END IF;
  IF kind='CREATE' THEN SELECT actor_account_id,trip_id INTO r FROM public.trip_create_receipts WHERE operation_id=operation;
  ELSE SELECT actor_account_id,trip_id INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=operation;END IF;
  IF NOT FOUND THEN RETURN true;END IF;
  IF r.actor_account_id<>actor THEN RETURN false;END IF;trip:=r.trip_id;
 END IF;
 IF kind='CREATE' AND NOT EXISTS(SELECT 1 FROM public.trips WHERE id=trip) THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id=operation);
 END IF;
 -- Core's authenticated MANUAL and read transactions use the ordinary Trip edit predicate.
 RETURN ((EXISTS(SELECT 1 FROM public.trip_create_receipts receipt JOIN public.trips t ON t.id=receipt.trip_id AND t.created_by=receipt.actor_account_id
  WHERE receipt.actor_account_id=actor AND receipt.trip_id=trip AND receipt.request_payload->'formatVersion'='2'::jsonb)
 AND EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked' AND role='owner'))
 OR (kind IN ('CORE','CORE_P3','CORE_P4','CORE_P5','CORE_P6','CORE_P2','CORE_P2_DETAILS')
  AND coalesce(current_setting('otr.core.manual_compat',true) IN ('MANUAL','READ'),false)
  AND actor IS NOT DISTINCT FROM nullif(current_setting('otr.core.actor',true),'')::uuid
  AND trip IS NOT DISTINCT FROM nullif(current_setting('otr.core.trip',true),'')::uuid
  AND EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
  AND NOT EXISTS(SELECT 1 FROM public.journey_removed_users WHERE trip_id=trip AND user_id=actor)
  AND (EXISTS(SELECT 1 FROM public.trips WHERE id=trip AND created_by=actor)
    OR EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=trip AND user_id=actor)
    OR EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked' AND role IN ('owner','group_member')))))
 AND (kind<>'CORE_P2_DETAILS' OR (
 EXISTS(SELECT 1 FROM public.itinerary_events event JOIN public.trip_flight_intents flight ON flight.event_id=event.id AND flight.trip_id=event.trip_id
 WHERE event.id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND event.trip_id=trip AND event.owner_account_id=actor AND event.experience_family='P2' AND flight.qualification='SPARSE' AND NOT EXISTS(SELECT 1 FROM public.trip_booking_item_links link WHERE link.trip_id=trip AND link.item_id=event.id AND link.active) AND NOT EXISTS(SELECT 1 FROM public.itinerary_transport_services service WHERE service.trip_id=trip AND service.event_id=event.id))
 AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr
 WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.outcome IN ('APPLIED','NO_CHANGE')
 AND rr.command_version=2 AND rr.intent_version=2 AND rr.receipt_version=2
 AND rr.canonical_intent_text::jsonb->>'command'='CREATE_SPARSE_FLIGHT'
 AND rr.canonical_intent_text::jsonb->>'contractVersion'='2' AND rr.canonical_intent_text::jsonb->>'intentVersion'='2'
 AND rr.canonical_intent_text::jsonb->>'tripId'=trip::text AND rr.canonical_intent_text::jsonb->>'operationId'=rr.operation_id::text
 AND rr.canonical_intent_text::jsonb#>>'{target,kind}'='ITEM'
 AND rr.canonical_intent_text::jsonb#>>'{target,id}'=current_setting('otr.core.target_item',true)
 AND rr.canonical_intent_text::jsonb#>>'{admission,mode}'='MANUAL'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.canonical_intent_text::jsonb->'baseVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=current_setting('otr.core.target_item',true) AND v->'revision' IS NOT DISTINCT FROM 'null'::jsonb)
 AND rr.canonical_intent_text::jsonb#>'{admission,sourceIntentId}' IS NOT DISTINCT FROM 'null'::jsonb
 AND rr.canonical_intent_text::jsonb#>'{admission,policyVersion}' IS NOT DISTINCT FROM 'null'::jsonb
 AND rr.intent_sha256=encode(sha256(convert_to('otr-trip-core-intent-v2'||E'\n'||rr.canonical_intent_text,'UTF8')),'hex')
 AND rr.body->>'actorAccountId'=actor::text AND rr.body->>'tripId'=trip::text AND rr.body->>'operationId'=rr.operation_id::text
 AND rr.body->>'command'='CREATE_SPARSE_FLIGHT' AND rr.body->>'intentSha256'=rr.intent_sha256 AND rr.body->>'receiptSha256'=rr.receipt_sha256 AND rr.body->>'outcome'=rr.outcome
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.body#>'{result,created}') v WHERE v->>'kind'='ITEM' AND v->>'id'=current_setting('otr.core.target_item',true))
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(rr.body->'targetVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=current_setting('otr.core.target_item',true) AND v->>'committedRevision'='1')
 )));
END $function$;
commit;
