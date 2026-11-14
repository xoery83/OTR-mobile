-- DEV-only compatibility: preserve an already valid authored Sparse Flight during Document association.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('otr-core-p2-document-association-20261113',0));
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR session_user<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'CORE_P2_DOCUMENT_EXECUTION_IDENTITY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.assert_trip_core_v2_aggregate(uuid)'::regprocedure AND p.oid=65418 AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' AND md5(pg_get_functiondef(p.oid))='3224ef85fb4e193bf5293f7ba86d03d1') THEN RAISE EXCEPTION 'CORE_P2_DOCUMENT_DEFINITION_DRIFT'; END IF;
END $guard$;
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
   AND coalesce(current_setting('otr.core.command',true),'') IN ('SET_AUTHORED_FLIGHT_DETAILS','SET_ITEM_PARTICIPATION')
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
end $function$
;
DO $post$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.assert_trip_core_v2_aggregate(uuid)'::regprocedure AND p.oid=65418 AND pg_get_userbyid(p.proowner)='postgres' AND p.proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,otr_trip_core_v2_writer=X/postgres}' AND md5(pg_get_functiondef(p.oid))='82eb172c0e6cab2a44995e36a5c3087e') THEN RAISE EXCEPTION 'CORE_P2_DOCUMENT_POSTIMAGE'; END IF;
END $post$;
COMMIT;
