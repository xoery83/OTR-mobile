-- Only after stopping new P1 ingress, verified zero active Core sessions and matching installed postimage. Restore exact saved DEV functions; never delete business rows.
-- Scope closure only; retain all candidates/Core records/receipts.
BEGIN;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM public.trip_sustained_dev_policy WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543' AND universal_p1_review_scope IS NOT NULL AND universal_p1_review_scope->>'candidateId' IS DISTINCT FROM '44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67') THEN RAISE EXCEPTION 'P1_REVIEW_CLOSE_SCOPE_DRIFT';END IF;
 UPDATE public.trip_sustained_dev_policy SET universal_p1_import_enabled=false,universal_p1_review_scope=NULL WHERE actor_account_id='f4b059c5-8241-4ffb-aa15-37fa25474543';
END $$;
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION public.trip_core_guard_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ declare old_json jsonb;new_json jsonb;actor uuid;trip uuid; begin
 if tg_op='TRUNCATE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='DELETE' then old_json:=to_jsonb(old);else new_json:=to_jsonb(new);end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;
 if tg_op='INSERT' and tg_table_name in ('trip_source_core_v2_publications','trip_source_core_v2_candidates','trip_source_core_v2_intents') and public.trip_core_source_review_row_allowed(tg_table_name,tg_op,new_json) then return new;end if;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
  if public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') then
   if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or current_setting('otr.core.family',true) is distinct from 'P1'
    or coalesce(current_setting('otr.core.command',true),'') not in ('CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION')
    or nullif(current_setting('otr.core.target_item',true),'') is null
    or tg_table_name not in ('itinerary_events','trip_activity_details','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
    or tg_op='DELETE' and (tg_table_name<>'trip_item_participants' or current_setting('otr.core.command',true)<>'SET_ITEM_PARTICIPATION')
    or tg_table_name='itinerary_events' and ((coalesce(new_json,old_json)->>'id') is distinct from current_setting('otr.core.target_item',true) or coalesce(new_json,old_json)->>'experience_family' is distinct from 'P1' or coalesce(new_json,old_json)->>'business_contract_version' is distinct from '2' or coalesce(new_json,old_json)->>'owner_account_id' is distinct from actor::text)
    or tg_table_name='trip_activity_details' and (coalesce(new_json,old_json)->>'event_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_item_participants','trip_item_visibility_people') and (coalesce(new_json,old_json)->>'item_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_activity_details','trip_item_participants','trip_item_visibility_people') and not exists(select 1 from public.itinerary_events event where event.id=nullif(current_setting('otr.core.target_item',true),'')::uuid and event.trip_id=trip and event.experience_family='P1' and event.owner_account_id=actor)
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
   or tg_table_name='trip_activity_details' and current_setting('otr.core.family',true)<>'P1'
   or tg_table_name in ('trip_stay_details','trip_stay_rooms') and current_setting('otr.core.family',true)<>'P3'
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
end $function$
;
CREATE OR REPLACE FUNCTION public.trip_core_guard_historical_source_association()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin
 if tg_op<>'INSERT' then raise exception 'CORE_V2_PUBLICATION_IMMUTABLE' using errcode='42501';end if;
 if new.account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 if not exists(select 1 from public.trip_sources src join public.trip_source_revisions rev on rev.source_id=src.id and rev.material_revision=new.source_revision join public.trip_source_runs r on r.id=new.run_id where src.id=new.source_id and src.trip_id=new.trip_id and src.acquired_by=new.account_id and src.lifecycle='ACTIVE' and src.retention_state='RETAINED' and rev.retention_state='RETAINED' and r.trip_id=new.trip_id and r.actor_account_id=new.account_id and new.source_id=any(r.scope_source_ids) and r.state='READY' and r.retention_state='RETAINED') then raise exception 'INPUT_STALE' using errcode='23514';end if;
 if not exists(select 1 from public.trip_source_core_v2_slots slot join public.trip_source_core_v2_candidates candidate on candidate.candidate_id=slot.candidate_id join public.trip_core_command_receipts receipt on receipt.id=new.domain_receipt_id where slot.output_slot_id=new.output_slot_id and slot.account_id=new.account_id and slot.trip_id=new.trip_id and slot.source_id=new.source_id and slot.candidate_id=new.candidate_id and candidate.source_revision=new.source_revision and candidate.run_id=new.run_id and candidate.candidate_json->'fieldEvidence'=new.field_evidence and slot.target_kind=new.target_kind and slot.target_id=new.target_id and slot.identity_sha256=new.identity_sha256 and receipt.actor_account_id=new.account_id and receipt.trip_id=new.trip_id and receipt.operation_id=slot.operation_id and receipt.intent_sha256=slot.intent_sha256 and receipt.receipt_sha256=new.receipt_sha256 and receipt.outcome in ('APPLIED','NO_CHANGE') and receipt.body->>'command'=slot.command and exists(select 1 from jsonb_array_elements(receipt.body->'targetVector') v where v->>'kind'=new.target_kind and v->>'id'=new.target_id::text and (v->>'committedRevision')::bigint=new.target_revision)) then raise exception 'RECEIPT_TARGET_MISMATCH' using errcode='23514';end if;
 return new;
end $function$
;
DROP POLICY core_v2_p1_source_association_read ON public.trip_source_associations;
REVOKE SELECT ON public.trip_source_associations FROM otr_trip_core_v2_writer;
REVOKE EXECUTE ON FUNCTION public.trip_import_observation(jsonb),public.trip_event_utc_timestamp(timestamptz) FROM otr_trip_core_v2_writer;
DROP FUNCTION public.trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid);
DROP FUNCTION public.trip_sustained_import_p1_capabilities(uuid,uuid);
ALTER TABLE public.trip_sustained_dev_policy DROP COLUMN universal_p1_import_enabled,DROP COLUMN universal_p1_review_scope;
COMMIT;
