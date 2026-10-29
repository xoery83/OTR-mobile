-- P6 independent Manual DEV candidate: NOT APPROVED / NOT INSTALLED; P5 remains closed. No Schema/RLS/GRANT changes.
BEGIN; SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s';
DO $$ BEGIN
IF md5(pg_get_functiondef('public.trip_core_guard_write()'::regprocedure)) <> 'edef79316577006a6e4a6f81959c0577' THEN RAISE EXCEPTION 'MANUAL_P6_FUNCTION_DRIFT: trip_core_guard_write()'; END IF;
IF md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure)) <> '768570a187cd47a16c6c19be3ec06bd3' THEN RAISE EXCEPTION 'MANUAL_P6_FUNCTION_DRIFT: trip_core_finite_read_state_guard()'; END IF;
IF md5(pg_get_functiondef('public.trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'::regprocedure)) <> 'af515d5dc6a07fe89c9dabc443f3ba0b' THEN RAISE EXCEPTION 'MANUAL_P6_FUNCTION_DRIFT: trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text)'; END IF;
IF md5(pg_get_functiondef('public.trip_sustained_core_capabilities(uuid,uuid)'::regprocedure)) <> '13d5e1b62637f8d2ef3077fcb9e9d6b7' THEN RAISE EXCEPTION 'MANUAL_P6_FUNCTION_DRIFT: trip_sustained_core_capabilities(uuid,uuid)'; END IF;
END $$;
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
  if public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and current_setting('otr.core.admission',true)='REVIEWED_SOURCE' then
   perform public.trip_sustained_import_p1_guard(tg_table_name,tg_op,new_json,old_json,actor,trip);
  elsif public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') then
   if session_user<>'otr_trip_core_v2_gateway' or current_user<>'otr_trip_core_v2_writer'
    or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
    or current_setting('otr.core.admission',true) is distinct from 'MANUAL'
    or NOT (current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P1' OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') and current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P3') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P4'))
    or coalesce(current_setting('otr.core.command',true),'') not in ('CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS')
    or (current_setting('otr.core.command',true)='SET_STAY_DETAILS' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P3')
    or (current_setting('otr.core.command',true)='SET_RENTAL_DETAILS' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P4')
    or nullif(current_setting('otr.core.target_item',true),'') is null
    or tg_table_name not in ('itinerary_events','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_rental_places','trip_activity_details','trip_item_participants','trip_item_visibility_people','trip_core_command_receipts')
    or tg_op='DELETE' and not ((tg_table_name='trip_item_participants' and current_setting('otr.core.command',true)='SET_ITEM_PARTICIPATION') or (tg_table_name='trip_stay_rooms' and current_setting('otr.core.family',true)='P3' and current_setting('otr.core.command',true)='SET_STAY_DETAILS') or (tg_table_name='trip_rental_places' and current_setting('otr.core.family',true)='P4' and current_setting('otr.core.command',true)='SET_RENTAL_DETAILS'))
    or tg_table_name='itinerary_events' and ((coalesce(new_json,old_json)->>'id') is distinct from current_setting('otr.core.target_item',true) or coalesce(new_json,old_json)->>'experience_family' is distinct from current_setting('otr.core.family',true) or coalesce(new_json,old_json)->>'business_contract_version' is distinct from '2' or coalesce(new_json,old_json)->>'owner_account_id' is distinct from actor::text)
    or tg_op='UPDATE' and tg_table_name in ('trip_rental_details','trip_rental_places') and old_json->'event_id' IS DISTINCT FROM new_json->'event_id'
    or tg_op='UPDATE' and tg_table_name='trip_rental_places' and old_json->'role' IS DISTINCT FROM new_json->'role'
    or tg_table_name='trip_activity_details' and current_setting('otr.core.family',true) IS DISTINCT FROM 'P1'
    or tg_table_name in ('trip_stay_details','trip_stay_rooms') and current_setting('otr.core.family',true) IS DISTINCT FROM 'P3'
    or tg_table_name in ('trip_rental_details','trip_rental_places') and current_setting('otr.core.family',true) IS DISTINCT FROM 'P4'
    or tg_table_name in ('trip_activity_details','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_rental_places') and (coalesce(new_json,old_json)->>'event_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_item_participants','trip_item_visibility_people') and (coalesce(new_json,old_json)->>'item_id') is distinct from current_setting('otr.core.target_item',true)
    or tg_table_name in ('trip_activity_details','trip_stay_details','trip_stay_rooms','trip_rental_details','trip_rental_places','trip_item_participants','trip_item_visibility_people') and not exists(select 1 from public.itinerary_events event where event.id=nullif(current_setting('otr.core.target_item',true),'')::uuid and event.trip_id=trip and event.experience_family=current_setting('otr.core.family',true) and event.owner_account_id=actor)
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
   or (current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM' and not (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') and ((current_setting('otr.core.command',true) in ('SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_STAY_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P3' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL') OR (public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') AND current_setting('otr.core.command',true) IS NOT DISTINCT FROM 'SET_RENTAL_DETAILS' AND current_setting('otr.core.family',true) IS NOT DISTINCT FROM 'P4' AND current_setting('otr.core.admission',true) IS NOT DISTINCT FROM 'MANUAL')) OR (current_setting('otr.core.command',true)='CREATE_SPARSE_FLIGHT' AND current_setting('otr.core.family',true)='P2' AND current_setting('otr.core.admission',true)='REVIEWED_SOURCE' AND EXISTS(SELECT 1 FROM public.trip_sustained_import_p1_capabilities(actor,trip) c WHERE c.runtime_enabled AND c.enabled_commands=ARRAY['CREATE_SPARSE_FLIGHT']::text[] AND c.enabled_families=ARRAY['P2']::text[]) AND EXISTS(SELECT 1 FROM public.trip_core_command_receipts rr JOIN public.trip_source_core_v2_slots ss ON ss.operation_id=rr.operation_id AND ss.intent_sha256=rr.intent_sha256 AND ss.account_id=rr.actor_account_id AND ss.trip_id=rr.trip_id WHERE rr.actor_account_id=actor AND rr.trip_id=trip AND rr.operation_id=nullif(current_setting('otr.core.operation',true),'')::uuid AND ss.output_slot_id=nullif(current_setting('otr.core.source_intent',true),'')::uuid AND ss.target_id=nullif(current_setting('otr.core.target_item',true),'')::uuid AND ss.command='CREATE_SPARSE_FLIGHT' AND rr.outcome IN ('APPLIED','NO_CHANGE') AND rr.body->>'command'='CREATE_SPARSE_FLIGHT')))))
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $function$;
CREATE OR REPLACE FUNCTION public.trip_sustained_dev_scope_allowed(actor uuid, trip uuid, operation uuid, kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE principal record;policy record;r record;owner_id oid;
BEGIN
 IF current_user<>'postgres' OR actor IS NULL OR kind IS NULL OR kind NOT IN ('CREATE','METADATA','CORE','CORE_P3','CORE_P4','PERSON') THEN RETURN false;END IF;
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
 OR(kind IN ('CORE','CORE_P3','CORE_P4') AND m.member=principal.oid AND m.roleid='otr_trip_core_v2_writer'::regrole AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)))
 THEN RETURN false;END IF;
 SELECT * INTO policy FROM public.trip_sustained_dev_policy WHERE actor_account_id=actor FOR SHARE;
 IF NOT FOUND OR NOT policy.enabled OR policy.revoked_at IS NOT NULL THEN RETURN false;END IF;
 IF kind IN ('CORE','CORE_P3','CORE_P4') AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='otr_trip_core_v2_writer' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls OR rolreplication)) THEN RETURN false;END IF;
 IF trip IS NULL THEN
  IF operation IS NULL OR kind IN ('CORE','CORE_P3','CORE_P4','PERSON') THEN RETURN false;END IF;
  IF kind='CREATE' THEN SELECT actor_account_id,trip_id INTO r FROM public.trip_create_receipts WHERE operation_id=operation;
  ELSE SELECT actor_account_id,trip_id INTO r FROM public.trip_metadata_update_receipts WHERE operation_id=operation;END IF;
  IF NOT FOUND THEN RETURN true;END IF;
  IF r.actor_account_id<>actor THEN RETURN false;END IF;trip:=r.trip_id;
 END IF;
 IF kind='CREATE' AND NOT EXISTS(SELECT 1 FROM public.trips WHERE id=trip) THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.trip_create_receipts WHERE operation_id=operation);
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.trip_create_receipts receipt JOIN public.trips t ON t.id=receipt.trip_id AND t.created_by=receipt.actor_account_id
  WHERE receipt.actor_account_id=actor AND receipt.trip_id=trip AND receipt.request_payload->'formatVersion'='2'::jsonb AND receipt.created_at>=policy.adoption_cutoff AND (kind NOT IN ('CORE_P3','CORE_P4') OR (actor='3f7e964e-79d3-4028-a585-470e798e41ec'::uuid AND receipt.created_at>='2026-10-28T02:16:48Z'::timestamptz)))
 AND EXISTS(SELECT 1 FROM public.journey_members WHERE trip_id=trip AND user_id=actor AND status='linked' AND role='owner');
END $function$;
CREATE OR REPLACE FUNCTION public.trip_sustained_core_capabilities(actor uuid, trip uuid)
 RETURNS TABLE(runtime_enabled boolean, enabled_commands text[], enabled_families text[], enabled_admission_modes text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$BEGIN
 IF NOT public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE') THEN RAISE EXCEPTION 'CORE_CAPABILITY_CLOSED' USING ERRCODE='42501';END IF;
 IF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P4') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS','SET_RENTAL_DETAILS']::text[],ARRAY['P1','P3','P4']::text[],ARRAY['MANUAL']::text[];
 ELSIF public.trip_sustained_dev_scope_allowed(actor,trip,null,'CORE_P3') THEN
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION','SET_STAY_DETAILS']::text[],ARRAY['P1','P3']::text[],ARRAY['MANUAL']::text[];
 ELSE
 RETURN QUERY SELECT true,ARRAY['CREATE_ITEM','SET_ITEM_TEXT','SET_ITEM_SCHEDULE','SET_ITEM_PLACE','SET_ITEM_PARTICIPATION']::text[],ARRAY['P1']::text[],ARRAY['MANUAL']::text[];
 END IF;
END $function$;
COMMIT;
