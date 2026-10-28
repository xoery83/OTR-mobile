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
   or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and ((current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_STAY_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P3' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL')) OR (current_setting('otr.core.command',true)='CREATE_SPARSE_FLIGHT' AND current_setting('otr.core.family',true)='P2' AND current_setting('otr.core.admission',true)='REVIEWED_SOURCE' AND EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled AND c.enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT']::text[] AND c.enabled_families=ARRAY['P2']::text[]) AND current_setting('otr.core.operation',true)='50bfe576-c16d-8645-8cde-a355da5f13f9' AND current_setting('otr.core.target_item',true)='ec73e4fd-c580-8063-96a8-ef7accda3748' AND current_setting('otr.core.source_intent',true)='0886cd6b-02c1-8dc3-ba1e-29bc6543c6f4' AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr JOIN public.trip_source_core_v2_slots ss ON ss.operation_id=rr.operation_id AND ss.intent_sha256=rr.intent_sha256 AND ss.account_id=rr.actor_account_id AND ss.trip_id=rr.trip_id WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.operation_id=nullif(current_setting('otr.core.operation',true),'')::uuid AND ss.output_slot_id=nullif(current_setting('otr.core.source_intent',true),'')::uuid AND ss.target_id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND ss.command='CREATE_SPARSE_FLIGHT' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND rr.body->>'command'='CREATE_SPARSE_FLIGHT')))))
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$
