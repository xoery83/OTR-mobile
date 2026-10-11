-- Core87: unprovisioned owning-session scope; no public/service-role write path.
begin;
create function public.trip_core_lock_actor_scope(actor uuid,trip uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare owner uuid;member uuid;person record;self_id uuid;known jsonb:='[]';is_active boolean;begin
 if session_user<>'otr_trip_core_v2_gateway' then raise exception 'CORE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 if actor is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 select created_by into owner from public.trips where id=trip for share;
 select user_id into member from public.trip_members where trip_id=trip and user_id=actor for share;
 is_active:=owner=actor or member is not null;
 for person in select id,user_id,status from public.journey_members where trip_id=trip order by id for share loop
  if person.status<>'removed' then known:=known||jsonb_build_array(person.id);end if;
  if person.status='linked' and person.user_id=actor then
   if self_id is not null then raise exception 'CORE_PERSON_BINDING_INVALID' using errcode='23514';end if;
   self_id:=person.id;is_active:=true;
  end if;
 end loop;
 return jsonb_build_object('accountId',actor,'tripId',trip,'active',coalesce(is_active,false),'canManageShared',coalesce(owner=actor,false),'personId',self_id,'personIds',case when is_active then known else '[]'::jsonb end);
end $$;
revoke all on function public.trip_core_lock_actor_scope(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_lock_actor_scope(uuid,uuid) to otr_trip_core_v2_gateway;
create policy core_v2_gateway_scope on public.itinerary_events for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.itinerary_transport_endpoints for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_endpoint_details for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_flight_intents for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.itinerary_transport_services for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_stay_details for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_stay_rooms for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_rental_details for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_activity_details for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_rental_places for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_activity_entry_places for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_transport_operational_facts for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.itinerary_reservations for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_booking_observations for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_entitlements for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_operational_documents for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_instruction_entries for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_booking_item_links for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_entitlement_item_links for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_booking_entitlement_links for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_booking_document_links for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_entitlement_document_links for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_item_document_links for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_item_participants for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_entitlement_holders for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_item_visibility_people for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_booking_visibility_people for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_entitlement_visibility_people for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_document_visibility_people for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_instruction_visibility_people for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_core_command_receipts for select to otr_trip_core_v2_gateway using(actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_core_read_state for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_source_core_v2_candidates for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and account_id=nullif(current_setting('otr.core.actor',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_source_core_v2_intents for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and account_id=nullif(current_setting('otr.core.actor',true),'')::uuid);
create policy core_v2_gateway_scope on public.trip_source_core_v2_slots for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid and account_id=nullif(current_setting('otr.core.actor',true),'')::uuid);
grant select on public.trip_event_operation_receipts to otr_trip_core_v2_gateway;
create policy core_v2_gateway_legacy_collision on public.trip_event_operation_receipts for select to otr_trip_core_v2_gateway
 using(actor_account_id=nullif(current_setting('otr.core.actor',true),'')::uuid);
-- Existing CHECK expressions resolve their pure validators under the new role even
-- when version dispatch short-circuits the legacy branch. No admission/mutation grant.
grant execute on function public.trip_event_row_valid(jsonb),
 public.trip_event_boundary_valid(jsonb,timestamptz,text),
 public.trip_event_spatial_valid(jsonb,boolean),
 public.trip_event_family(jsonb,text,text[]),
 public.trip_event_refs_valid(jsonb,text[],integer),
 public.trip_event_canonical_json(json,integer),
 public.trip_import_json_valid(jsonb,integer)
 to otr_trip_core_v2_writer;
commit;
