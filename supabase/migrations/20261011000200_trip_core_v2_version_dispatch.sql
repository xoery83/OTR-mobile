-- Core86 version dispatch. Existing v1 function bytes and semantics remain authoritative.

begin;

alter table public.itinerary_events drop constraint itinerary_events_semantic_structure;

alter table public.itinerary_events add constraint itinerary_events_semantic_structure check ((business_contract_version is null and ((trip_event_row_valid(to_jsonb(itinerary_events.*)) IS TRUE))) or (business_contract_version is not null and public.trip_core_event_row_valid(to_jsonb(itinerary_events.*))));

alter table public.itinerary_transport_endpoints drop constraint itinerary_transport_endpoint_structure;

alter table public.itinerary_transport_endpoints add constraint itinerary_transport_endpoint_structure check ((trip_id is null and (((trip_event_boundary_valid(trip_event_family(to_jsonb(itinerary_transport_endpoints.*), ''::text, ARRAY['local_date'::text, 'local_time'::text, 'clock_precision'::text, 'quality'::text, 'basis'::text, 'zone_id'::text, 'supplied_offset_seconds'::text, 'source_instant'::text, 'source_instant_precision'::text, 'civil_resolution'::text, 'resolution_offset_seconds'::text, 'interpretation_key'::text, 'interpretation_input_sha256'::text, 'provenance_refs'::text]), instant, 'TIME'::text) IS TRUE) AND (trip_event_spatial_valid(trip_event_family(to_jsonb(itinerary_transport_endpoints.*), ''::text, ARRAY['authored_label'::text, 'authored_text'::text, 'authored_address'::text, 'accepted_address'::text, 'accepted_latitude'::text, 'accepted_longitude'::text, 'accepted_place_id'::text, 'spatial_provenance_refs'::text, 'location_input_revision'::text, 'candidate_input_revision'::text, 'candidate_provider'::text, 'candidate_provider_place_id'::text, 'candidate_place_id'::text, 'candidate_label'::text, 'candidate_address'::text, 'candidate_latitude'::text, 'candidate_longitude'::text, 'candidate_confidence'::text, 'candidate_state'::text, 'candidate_observed_at'::text, 'candidate_error_code'::text, 'authored_address_line1'::text, 'authored_address_line2'::text, 'authored_address_locality'::text, 'authored_address_region'::text, 'authored_address_postal_code'::text, 'authored_address_country'::text, 'accepted_address_line1'::text, 'accepted_address_line2'::text, 'accepted_address_locality'::text, 'accepted_address_region'::text, 'accepted_address_postal_code'::text, 'accepted_address_country'::text]), true) IS TRUE)))) or (trip_id is not null and public.trip_core_boundary_valid(to_jsonb(itinerary_transport_endpoints.*),'')));

drop trigger itinerary_event_semantic_guard on public.itinerary_events;

create trigger itinerary_event_semantic_guard_insert_v1 before insert on public.itinerary_events for each row when (new.business_contract_version is null) execute function public.guard_trip_event_semantics();

create trigger itinerary_event_semantic_guard_update_v1 before update on public.itinerary_events for each row when (old.business_contract_version is null or new.business_contract_version is null) execute function public.guard_trip_event_semantics();

create trigger itinerary_event_semantic_guard_delete_v1 before delete on public.itinerary_events for each row when (old.business_contract_version is null) execute function public.guard_trip_event_semantics();

drop trigger itinerary_transport_endpoint_guard on public.itinerary_transport_endpoints;

create trigger itinerary_transport_endpoint_guard_insert_v1 before insert on public.itinerary_transport_endpoints for each row when (new.trip_id is null) execute function public.guard_trip_transport_endpoints();

create trigger itinerary_transport_endpoint_guard_update_v1 before update on public.itinerary_transport_endpoints for each row when (old.trip_id is null or new.trip_id is null) execute function public.guard_trip_transport_endpoints();

create trigger itinerary_transport_endpoint_guard_delete_v1 before delete on public.itinerary_transport_endpoints for each row when (old.trip_id is null) execute function public.guard_trip_transport_endpoints();

drop trigger transport_service_row_guard on public.itinerary_transport_services;

create trigger transport_service_row_guard_insert_v1 before insert on public.itinerary_transport_services for each row when (new.trip_id is null) execute function public.guard_trip_import_services();

create trigger transport_service_row_guard_update_v1 before update on public.itinerary_transport_services for each row when (old.trip_id is null or new.trip_id is null) execute function public.guard_trip_import_services();

create trigger transport_service_row_guard_delete_v1 before delete on public.itinerary_transport_services for each row when (old.trip_id is null) execute function public.guard_trip_import_services();

drop trigger itinerary_event_aggregate_check on public.itinerary_events;

create constraint trigger itinerary_event_aggregate_check_insert_v1 after insert on public.itinerary_events deferrable initially deferred for each row when (new.business_contract_version is null) execute function public.validate_trip_event_aggregate();

create constraint trigger itinerary_event_aggregate_check_update_v1 after update on public.itinerary_events deferrable initially deferred for each row when (new.business_contract_version is null) execute function public.validate_trip_event_aggregate();

drop trigger flight_parent_service_check on public.itinerary_events;

create constraint trigger flight_parent_service_check_insert_v1 after insert on public.itinerary_events deferrable initially deferred for each row when (new.business_contract_version is null) execute function public.validate_trip_flight_services();

create constraint trigger flight_parent_service_check_update_v1 after update on public.itinerary_events deferrable initially deferred for each row when (new.business_contract_version is null) execute function public.validate_trip_flight_services();

drop trigger itinerary_transport_aggregate_check on public.itinerary_transport_endpoints;

create constraint trigger itinerary_transport_aggregate_check_insert_v1 after insert on public.itinerary_transport_endpoints deferrable initially deferred for each row when (new.trip_id is null) execute function public.validate_trip_event_aggregate();

create constraint trigger itinerary_transport_aggregate_check_delete_v1 after delete on public.itinerary_transport_endpoints deferrable initially deferred for each row when (old.trip_id is null) execute function public.validate_trip_event_aggregate();

create constraint trigger itinerary_transport_aggregate_check_update_v1 after update on public.itinerary_transport_endpoints deferrable initially deferred for each row when (new.trip_id is null) execute function public.validate_trip_event_aggregate();

drop trigger flight_service_aggregate_check on public.itinerary_transport_services;

create constraint trigger flight_service_aggregate_check_insert_v1 after insert on public.itinerary_transport_services deferrable initially deferred for each row when (new.trip_id is null) execute function public.validate_trip_flight_services();

create constraint trigger flight_service_aggregate_check_delete_v1 after delete on public.itinerary_transport_services deferrable initially deferred for each row when (old.trip_id is null) execute function public.validate_trip_flight_services();

create constraint trigger flight_service_aggregate_check_update_v1 after update on public.itinerary_transport_services deferrable initially deferred for each row when (new.trip_id is null) execute function public.validate_trip_flight_services();

-- Statement triggers have no row-version WHEN; retain exact v1 branch in new dispatcher.
create function public.trip_core_service_statement_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ begin
 if current_user='otr_trip_core_v2_writer' and session_user='otr_trip_core_v2_gateway' then
  if tg_op='TRUNCATE' or not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
  return null;
 end if;
 if current_user<>'otr_trip_event_semantic_writer' or session_user<>'otr_trip_event_command_gateway' or tg_op='TRUNCATE' then raise exception 'TRANSPORT_SERVICES_PROTECTED' using errcode='42501';end if;
 perform public.trip_import_require_gate();
 if not exists(select 1 from public.trip_event_command_gate where singleton and enabled) then raise exception 'CANONICAL_WRITES_DISABLED' using errcode='42501';end if;
 return null;
end $$;
revoke all on function public.trip_core_service_statement_guard() from public,anon,authenticated,service_role;
grant execute on function public.trip_core_service_statement_guard() to otr_trip_core_v2_writer,otr_trip_event_semantic_writer;
drop trigger transport_service_statement_guard on public.itinerary_transport_services;
create trigger transport_service_statement_guard before insert or update or delete or truncate on public.itinerary_transport_services for each statement execute function public.trip_core_service_statement_guard();

alter table public.itinerary_transport_services drop constraint itinerary_transport_services_transport_subtype_check;
alter table public.itinerary_transport_services add constraint itinerary_transport_services_transport_subtype_check check (
 trip_id is null and transport_subtype in ('FLIGHT','TRAIN','BUS','FERRY') or trip_id is not null and transport_subtype in ('FLIGHT','TRAIN','BUS','FERRY','WATER_TAXI','SHUTTLE','TRANSFER')
);

create function public.assert_trip_core_v2_aggregate(item uuid)
returns void language plpgsql security definer set search_path=pg_catalog
as $$ declare root public.itinerary_events;endpoint_count integer;service_count integer;begin
 select * into root from public.itinerary_events where id=item;
 if not found then return;end if;
 if root.business_contract_version is null then perform public.assert_trip_event_aggregate(item);return;end if;
 if not public.trip_core_event_row_valid(to_jsonb(root)) then raise exception 'CORE_V2_INVALID_AGGREGATE' using errcode='23514';end if;
 select count(*) into endpoint_count from public.itinerary_transport_endpoints where event_id=item;
 select count(*) into service_count from public.itinerary_transport_services where event_id=item;
 if root.temporal_shape='TRANSPORT' then
  if endpoint_count<>2 or not exists(select 1 from public.itinerary_transport_endpoints where event_id=item and role='ORIGIN' and local_date is not null) then raise exception 'CORE_V2_INVALID_ENDPOINTS' using errcode='23514';end if;
  if root.experience_family='P2' and (service_count not between 1 and 4 or exists(select 1 from public.itinerary_transport_services where event_id=item and transport_subtype<>'FLIGHT') or not exists(select 1 from public.trip_flight_intents where event_id=item and qualification='QUALIFIED')) then raise exception 'CORE_V2_INVALID_FLIGHT' using errcode='23514';end if;
  if root.experience_family='P5' and (service_count<>1 or exists(select 1 from public.itinerary_transport_services where event_id=item and transport_subtype='FLIGHT')) then raise exception 'CORE_V2_INVALID_SEGMENT' using errcode='23514';end if;
 elsif endpoint_count<>0 or service_count<>0 then raise exception 'CORE_V2_DUPLICATE_SCHEDULE' using errcode='23514';end if;
 if root.experience_family='P2' and root.temporal_shape='CALENDAR' and not exists(select 1 from public.trip_flight_intents where event_id=item and qualification='SPARSE') then raise exception 'CORE_V2_INVALID_SPARSE_FLIGHT' using errcode='23514';end if;
 if root.participation_mode='SELECTED_MEMBERS' and not exists(select 1 from public.trip_item_participants where item_id=item and active) or root.participation_mode<>'SELECTED_MEMBERS' and exists(select 1 from public.trip_item_participants where item_id=item and active) then raise exception 'CORE_V2_INVALID_PARTICIPATION' using errcode='23514';end if;
 if root.visibility='SELECTED_PERSONS' and not exists(select 1 from public.trip_item_visibility_people where item_id=item) or root.visibility<>'SELECTED_PERSONS' and exists(select 1 from public.trip_item_visibility_people where item_id=item) then raise exception 'CORE_V2_INVALID_VISIBILITY' using errcode='23514';end if;
end $$;
revoke all on function public.assert_trip_core_v2_aggregate(uuid) from public,anon,authenticated,service_role;
grant execute on function public.assert_trip_core_v2_aggregate(uuid) to otr_trip_core_v2_writer;

create function public.validate_trip_core_v2_aggregate()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare item uuid;begin
 if tg_table_name='itinerary_events' then
  if tg_op<>'DELETE' then perform public.assert_trip_core_v2_aggregate(new.id);end if;
 elsif tg_table_name in ('trip_days','itinerary_reservations') then
  for item in select id from public.itinerary_events where temporal_contract_version is not null and ((tg_table_name='trip_days' and trip_day_id=new.id) or (tg_table_name='itinerary_reservations' and reservation_id=new.id)) loop perform public.assert_trip_core_v2_aggregate(item);end loop;
 else
  if tg_op<>'INSERT' then perform public.assert_trip_core_v2_aggregate(old.event_id);end if;
  if tg_op<>'DELETE' then perform public.assert_trip_core_v2_aggregate(new.event_id);end if;
 end if;
 return null;
end $$;
revoke all on function public.validate_trip_core_v2_aggregate() from public,anon,authenticated,service_role;
grant execute on function public.validate_trip_core_v2_aggregate() to otr_trip_core_v2_writer;
create constraint trigger core_v2_item_aggregate after insert or update on public.itinerary_events deferrable initially deferred for each row when (new.business_contract_version=2) execute function public.validate_trip_core_v2_aggregate();
create constraint trigger core_v2_endpoint_aggregate after insert or update or delete on public.itinerary_transport_endpoints deferrable initially deferred for each row execute function public.validate_trip_core_v2_aggregate();
create constraint trigger core_v2_service_aggregate after insert or update or delete on public.itinerary_transport_services deferrable initially deferred for each row execute function public.validate_trip_core_v2_aggregate();

-- The original dependent-row loops cannot see v2 as a v1 temporal aggregate.
drop trigger trip_day_canonical_link_check on public.trip_days;
create constraint trigger trip_day_canonical_link_check after update on public.trip_days deferrable initially deferred for each row execute function public.validate_trip_core_v2_aggregate();
drop trigger reservation_canonical_link_check on public.itinerary_reservations;
create constraint trigger reservation_canonical_link_check after update on public.itinerary_reservations deferrable initially deferred for each row execute function public.validate_trip_core_v2_aggregate();

create policy core_v2_member_read on public.itinerary_events for select to authenticated using(business_contract_version=2 and public.trip_core_authenticated_root_access('ITEM',id));
create policy core_v2_member_read on public.itinerary_reservations for select to authenticated using(business_contract_version=2 and public.trip_core_authenticated_root_access('BOOKING',id));
alter table public.itinerary_events add constraint core_v2_required_fields check(business_contract_version is null or (id is not null and trip_id is not null and semantic_revision is not null and owner_account_id is not null and visibility is not null and created_at is not null and updated_at is not null and field_state is not null and business_contract_version is not null and experience_family is not null and temporal_contract_version is not null and temporal_shape is not null and title is not null and event_type is not null and status is not null and participation_mode is not null and participant_scope is not null));

alter table public.itinerary_reservations add constraint core_v2_required_fields check(business_contract_version is null or (id is not null and trip_id is not null and revision is not null and owner_account_id is not null and visibility is not null and created_at is not null and updated_at is not null and field_state is not null and business_contract_version is not null and title is not null and commercial_status is not null));

alter table public.itinerary_transport_endpoints add constraint core_v2_required_fields check(trip_id is null or (event_id is not null and trip_id is not null and role is not null));

alter table public.itinerary_transport_services add constraint core_v2_required_fields check(trip_id is null or (event_id is not null and trip_id is not null and service_key is not null and transport_subtype is not null and attribution is not null and operator_namespace is not null and operator_issuer is not null and operator_value is not null and operator_literal is not null and service_number is not null and service_literal is not null));

alter table public.itinerary_reservations add constraint core_v2_no_legacy_booking_schedule check(business_contract_version is null or starts_at is null and ends_at is null and trip_day_id is null);
alter table public.itinerary_reservations add constraint core_v2_money_tuples check(business_contract_version is null or
 (price_minor is null and price_currency is null and price_scale is null or price_minor is not null and price_currency is not null and price_scale is not null) and
 (due_minor is null and due_currency is null and due_scale is null or due_minor is not null and due_currency is not null and due_scale is not null));
alter table public.trip_entitlements add constraint core_v2_entitlement_validity check (
 (validity_precision is null and valid_from_date is null and valid_until_date is null and valid_from_instant is null and valid_until_instant is null) or
 (validity_precision='DATE' and valid_from_instant is null and valid_until_instant is null and (valid_from_date is null or valid_until_date is null or valid_until_date>=valid_from_date)) or
 (validity_precision='INSTANT' and valid_from_date is null and valid_until_date is null and (valid_from_instant is null or valid_until_instant is null or valid_until_instant>=valid_from_instant))
);
alter table public.itinerary_events add constraint core_v2_self_binding_shape check(business_contract_version is null or participation_mode='SELF' or self_person_id is null);
alter table public.itinerary_events add constraint core_v2_self_trip_person foreign key(trip_id,self_person_id) references public.journey_members(trip_id,id) on delete restrict deferrable initially deferred;
alter table public.trip_days add constraint core_v2_trip_day_trip_key unique(trip_id,id);
alter table public.itinerary_events add constraint core_v2_grouping_trip foreign key(trip_id,trip_day_id) references public.trip_days(trip_id,id) on delete restrict deferrable initially deferred;
create table public.trip_core_field_registry(table_name text not null,field_name text not null,primary key(table_name,field_name));
revoke all on public.trip_core_field_registry from public,anon,authenticated,service_role;
grant select on public.trip_core_field_registry to otr_trip_core_v2_writer;
insert into public.trip_core_field_registry values('itinerary_events','visibility');
insert into public.trip_core_field_registry values('itinerary_events','hidden_at');
insert into public.trip_core_field_registry values('itinerary_events','business_contract_version');
insert into public.trip_core_field_registry values('itinerary_events','experience_family');
insert into public.trip_core_field_registry values('itinerary_events','temporal_contract_version');
insert into public.trip_core_field_registry values('itinerary_events','temporal_shape');
insert into public.trip_core_field_registry values('itinerary_events','title');
insert into public.trip_core_field_registry values('itinerary_events','description');
insert into public.trip_core_field_registry values('itinerary_events','event_type');
insert into public.trip_core_field_registry values('itinerary_events','status');
insert into public.trip_core_field_registry values('itinerary_events','order_index');
insert into public.trip_core_field_registry values('itinerary_events','trip_day_id');
insert into public.trip_core_field_registry values('itinerary_events','participation_mode');
insert into public.trip_core_field_registry values('itinerary_events','participant_scope');
insert into public.trip_core_field_registry values('itinerary_events','self_person_id');
insert into public.trip_core_field_registry values('itinerary_events','activity_category');
insert into public.trip_core_field_registry values('itinerary_events','reservation_id');
insert into public.trip_core_field_registry values('itinerary_events','timing_label');
insert into public.trip_core_field_registry values('itinerary_events','start_local_date');
insert into public.trip_core_field_registry values('itinerary_events','start_local_time');
insert into public.trip_core_field_registry values('itinerary_events','start_clock_precision');
insert into public.trip_core_field_registry values('itinerary_events','start_quality');
insert into public.trip_core_field_registry values('itinerary_events','start_basis');
insert into public.trip_core_field_registry values('itinerary_events','start_zone_id');
insert into public.trip_core_field_registry values('itinerary_events','start_supplied_offset_seconds');
insert into public.trip_core_field_registry values('itinerary_events','start_source_instant');
insert into public.trip_core_field_registry values('itinerary_events','start_source_instant_precision');
insert into public.trip_core_field_registry values('itinerary_events','start_civil_resolution');
insert into public.trip_core_field_registry values('itinerary_events','start_resolution_offset_seconds');
insert into public.trip_core_field_registry values('itinerary_events','start_interpretation_key');
insert into public.trip_core_field_registry values('itinerary_events','start_interpretation_input_sha256');
insert into public.trip_core_field_registry values('itinerary_events','start_provenance_refs');
insert into public.trip_core_field_registry values('itinerary_events','planned_start');
insert into public.trip_core_field_registry values('itinerary_events','end_local_date');
insert into public.trip_core_field_registry values('itinerary_events','end_local_time');
insert into public.trip_core_field_registry values('itinerary_events','end_clock_precision');
insert into public.trip_core_field_registry values('itinerary_events','end_quality');
insert into public.trip_core_field_registry values('itinerary_events','end_basis');
insert into public.trip_core_field_registry values('itinerary_events','end_zone_id');
insert into public.trip_core_field_registry values('itinerary_events','end_supplied_offset_seconds');
insert into public.trip_core_field_registry values('itinerary_events','end_source_instant');
insert into public.trip_core_field_registry values('itinerary_events','end_source_instant_precision');
insert into public.trip_core_field_registry values('itinerary_events','end_civil_resolution');
insert into public.trip_core_field_registry values('itinerary_events','end_resolution_offset_seconds');
insert into public.trip_core_field_registry values('itinerary_events','end_interpretation_key');
insert into public.trip_core_field_registry values('itinerary_events','end_interpretation_input_sha256');
insert into public.trip_core_field_registry values('itinerary_events','end_provenance_refs');
insert into public.trip_core_field_registry values('itinerary_events','planned_end');
insert into public.trip_core_field_registry values('itinerary_events','authored_label');
insert into public.trip_core_field_registry values('itinerary_events','authored_text');
insert into public.trip_core_field_registry values('itinerary_events','authored_address');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address');
insert into public.trip_core_field_registry values('itinerary_events','accepted_latitude');
insert into public.trip_core_field_registry values('itinerary_events','accepted_longitude');
insert into public.trip_core_field_registry values('itinerary_events','accepted_place_id');
insert into public.trip_core_field_registry values('itinerary_events','spatial_provenance_refs');
insert into public.trip_core_field_registry values('itinerary_events','location_input_revision');
insert into public.trip_core_field_registry values('itinerary_events','authored_address_line1');
insert into public.trip_core_field_registry values('itinerary_events','authored_address_line2');
insert into public.trip_core_field_registry values('itinerary_events','authored_address_locality');
insert into public.trip_core_field_registry values('itinerary_events','authored_address_region');
insert into public.trip_core_field_registry values('itinerary_events','authored_address_postal_code');
insert into public.trip_core_field_registry values('itinerary_events','authored_address_country');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address_line1');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address_line2');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address_locality');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address_region');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address_postal_code');
insert into public.trip_core_field_registry values('itinerary_events','accepted_address_country');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','role');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','local_date');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','local_time');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','clock_precision');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','quality');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','basis');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','zone_id');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','supplied_offset_seconds');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','source_instant');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','source_instant_precision');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','civil_resolution');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','resolution_offset_seconds');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','interpretation_key');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','interpretation_input_sha256');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','provenance_refs');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','instant');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_label');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_text');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_latitude');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_longitude');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_place_id');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','spatial_provenance_refs');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','location_input_revision');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address_line1');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address_line2');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address_locality');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address_region');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address_postal_code');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','authored_address_country');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address_line1');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address_line2');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address_locality');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address_region');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address_postal_code');
insert into public.trip_core_field_registry values('itinerary_transport_endpoints','accepted_address_country');
insert into public.trip_core_field_registry values('trip_endpoint_details','airport_code');
insert into public.trip_core_field_registry values('trip_endpoint_details','terminal');
insert into public.trip_core_field_registry values('trip_endpoint_details','platform');
insert into public.trip_core_field_registry values('trip_endpoint_details','pier');
insert into public.trip_core_field_registry values('trip_endpoint_details','role');
insert into public.trip_core_field_registry values('trip_flight_intents','flight_number_literal');
insert into public.trip_core_field_registry values('trip_flight_intents','qualification');
insert into public.trip_core_field_registry values('itinerary_transport_services','service_key');
insert into public.trip_core_field_registry values('itinerary_transport_services','transport_subtype');
insert into public.trip_core_field_registry values('itinerary_transport_services','attribution');
insert into public.trip_core_field_registry values('itinerary_transport_services','operator_namespace');
insert into public.trip_core_field_registry values('itinerary_transport_services','operator_issuer');
insert into public.trip_core_field_registry values('itinerary_transport_services','operator_value');
insert into public.trip_core_field_registry values('itinerary_transport_services','operator_literal');
insert into public.trip_core_field_registry values('itinerary_transport_services','service_number');
insert into public.trip_core_field_registry values('itinerary_transport_services','service_literal');
insert into public.trip_core_field_registry values('itinerary_transport_services','codeshare_operating_key');
insert into public.trip_core_field_registry values('trip_stay_details','property_name');
insert into public.trip_core_field_registry values('trip_stay_details','permitted_checkin_from');
insert into public.trip_core_field_registry values('trip_stay_details','permitted_checkin_until');
insert into public.trip_core_field_registry values('trip_stay_details','permitted_checkout_by');
insert into public.trip_core_field_registry values('trip_stay_rooms','room_id');
insert into public.trip_core_field_registry values('trip_stay_rooms','category');
insert into public.trip_core_field_registry values('trip_stay_rooms','quantity');
insert into public.trip_core_field_registry values('trip_stay_rooms','capacity');
insert into public.trip_core_field_registry values('trip_rental_details','supplier');
insert into public.trip_core_field_registry values('trip_rental_details','reserved_category');
insert into public.trip_core_field_registry values('trip_rental_details','or_similar');
insert into public.trip_core_field_registry values('trip_rental_details','actual_vehicle_model');
insert into public.trip_core_field_registry values('trip_rental_details','verified_plate');
insert into public.trip_core_field_registry values('trip_activity_details','session_label');
insert into public.trip_core_field_registry values('trip_activity_details','admission_note');
insert into public.trip_core_field_registry values('trip_rental_places','role');
insert into public.trip_core_field_registry values('trip_rental_places','authored_label');
insert into public.trip_core_field_registry values('trip_rental_places','authored_text');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_latitude');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_longitude');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_place_id');
insert into public.trip_core_field_registry values('trip_rental_places','spatial_provenance_refs');
insert into public.trip_core_field_registry values('trip_rental_places','location_input_revision');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address_line1');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address_line2');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address_locality');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address_region');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address_postal_code');
insert into public.trip_core_field_registry values('trip_rental_places','authored_address_country');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address_line1');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address_line2');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address_locality');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address_region');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address_postal_code');
insert into public.trip_core_field_registry values('trip_rental_places','accepted_address_country');
insert into public.trip_core_field_registry values('trip_activity_entry_places','role');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_label');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_text');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_latitude');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_longitude');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_place_id');
insert into public.trip_core_field_registry values('trip_activity_entry_places','spatial_provenance_refs');
insert into public.trip_core_field_registry values('trip_activity_entry_places','location_input_revision');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address_line1');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address_line2');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address_locality');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address_region');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address_postal_code');
insert into public.trip_core_field_registry values('trip_activity_entry_places','authored_address_country');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address_line1');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address_line2');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address_locality');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address_region');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address_postal_code');
insert into public.trip_core_field_registry values('trip_activity_entry_places','accepted_address_country');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','role');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_label');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_text');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_latitude');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_longitude');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_place_id');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','spatial_provenance_refs');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','location_input_revision');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address_line1');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address_line2');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address_locality');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address_region');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address_postal_code');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','authored_address_country');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address_line1');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address_line2');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address_locality');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address_region');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address_postal_code');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','accepted_address_country');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','local_date');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','local_time');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','clock_precision');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','quality');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','basis');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','zone_id');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','supplied_offset_seconds');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','source_instant');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','source_instant_precision');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','civil_resolution');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','resolution_offset_seconds');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','interpretation_key');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','interpretation_input_sha256');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','provenance_refs');
insert into public.trip_core_field_registry values('trip_transport_operational_facts','instant');
insert into public.trip_core_field_registry values('itinerary_reservations','visibility');
insert into public.trip_core_field_registry values('itinerary_reservations','hidden_at');
insert into public.trip_core_field_registry values('itinerary_reservations','business_contract_version');
insert into public.trip_core_field_registry values('itinerary_reservations','title');
insert into public.trip_core_field_registry values('itinerary_reservations','provider');
insert into public.trip_core_field_registry values('itinerary_reservations','confirmation_code');
insert into public.trip_core_field_registry values('itinerary_reservations','contact');
insert into public.trip_core_field_registry values('itinerary_reservations','booking_url');
insert into public.trip_core_field_registry values('itinerary_reservations','commercial_status');
insert into public.trip_core_field_registry values('itinerary_reservations','replaces_booking_id');
insert into public.trip_core_field_registry values('itinerary_reservations','supplier_observation');
insert into public.trip_core_field_registry values('itinerary_reservations','price_minor');
insert into public.trip_core_field_registry values('itinerary_reservations','price_currency');
insert into public.trip_core_field_registry values('itinerary_reservations','price_scale');
insert into public.trip_core_field_registry values('itinerary_reservations','due_minor');
insert into public.trip_core_field_registry values('itinerary_reservations','due_currency');
insert into public.trip_core_field_registry values('itinerary_reservations','due_scale');
insert into public.trip_core_field_registry values('trip_booking_observations','holder_label');
insert into public.trip_core_field_registry values('trip_booking_observations','observed_start');
insert into public.trip_core_field_registry values('trip_booking_observations','observed_end');
insert into public.trip_core_field_registry values('trip_booking_observations','source_summary');
insert into public.trip_core_field_registry values('trip_booking_observations','booking_id');
insert into public.trip_core_field_registry values('trip_booking_observations','observation_id');
insert into public.trip_core_field_registry values('trip_booking_observations','evidence_ref');
insert into public.trip_core_field_registry values('trip_entitlements','visibility');
insert into public.trip_core_field_registry values('trip_entitlements','hidden_at');
insert into public.trip_core_field_registry values('trip_entitlements','kind');
insert into public.trip_core_field_registry values('trip_entitlements','title');
insert into public.trip_core_field_registry values('trip_entitlements','issuer');
insert into public.trip_core_field_registry values('trip_entitlements','reference');
insert into public.trip_core_field_registry values('trip_entitlements','quantity');
insert into public.trip_core_field_registry values('trip_entitlements','holder_label');
insert into public.trip_core_field_registry values('trip_entitlements','status');
insert into public.trip_core_field_registry values('trip_entitlements','access_class');
insert into public.trip_core_field_registry values('trip_entitlements','provider_url');
insert into public.trip_core_field_registry values('trip_entitlements','valid_from_date');
insert into public.trip_core_field_registry values('trip_entitlements','valid_until_date');
insert into public.trip_core_field_registry values('trip_entitlements','valid_from_instant');
insert into public.trip_core_field_registry values('trip_entitlements','valid_until_instant');
insert into public.trip_core_field_registry values('trip_entitlements','validity_zone_id');
insert into public.trip_core_field_registry values('trip_entitlements','validity_precision');
insert into public.trip_core_field_registry values('trip_operational_documents','visibility');
insert into public.trip_core_field_registry values('trip_operational_documents','hidden_at');
insert into public.trip_core_field_registry values('trip_operational_documents','title');
insert into public.trip_core_field_registry values('trip_operational_documents','media_type');
insert into public.trip_core_field_registry values('trip_operational_documents','byte_size');
insert into public.trip_core_field_registry values('trip_operational_documents','sha256');
insert into public.trip_core_field_registry values('trip_operational_documents','custody');
insert into public.trip_core_field_registry values('trip_operational_documents','source_representation_id');
insert into public.trip_core_field_registry values('trip_operational_documents','storage_object_key');
insert into public.trip_core_field_registry values('trip_operational_documents','content_version');
insert into public.trip_core_field_registry values('trip_operational_documents','ticket_face_index');
insert into public.trip_core_field_registry values('trip_operational_documents','qr_region');
insert into public.trip_core_field_registry values('trip_operational_documents','custody_receipt_id');
insert into public.trip_core_field_registry values('trip_instruction_entries','visibility');
insert into public.trip_core_field_registry values('trip_instruction_entries','hidden_at');
insert into public.trip_core_field_registry values('trip_instruction_entries','section');
insert into public.trip_core_field_registry values('trip_instruction_entries','body');
insert into public.trip_core_field_registry values('trip_instruction_entries','sensitivity');
insert into public.trip_core_field_registry values('trip_instruction_entries','supersedes_id');
insert into public.trip_core_field_registry values('trip_instruction_entries','source_representation_id');
insert into public.trip_core_field_registry values('trip_booking_item_links','booking_id');
insert into public.trip_core_field_registry values('trip_booking_item_links','item_id');
insert into public.trip_core_field_registry values('trip_booking_item_links','active');
insert into public.trip_core_field_registry values('trip_booking_item_links','linked_by');
insert into public.trip_core_field_registry values('trip_booking_item_links','linked_at');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','entitlement_id');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','item_id');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','active');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','linked_by');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','linked_at');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','coach');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','seat');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','section');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','cabin');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','fare_class');
insert into public.trip_core_field_registry values('trip_entitlement_item_links','baggage_allowance');
insert into public.trip_core_field_registry values('trip_booking_entitlement_links','booking_id');
insert into public.trip_core_field_registry values('trip_booking_entitlement_links','entitlement_id');
insert into public.trip_core_field_registry values('trip_booking_entitlement_links','active');
insert into public.trip_core_field_registry values('trip_booking_entitlement_links','linked_by');
insert into public.trip_core_field_registry values('trip_booking_entitlement_links','linked_at');
insert into public.trip_core_field_registry values('trip_booking_document_links','booking_id');
insert into public.trip_core_field_registry values('trip_booking_document_links','document_id');
insert into public.trip_core_field_registry values('trip_booking_document_links','active');
insert into public.trip_core_field_registry values('trip_booking_document_links','linked_by');
insert into public.trip_core_field_registry values('trip_booking_document_links','linked_at');
insert into public.trip_core_field_registry values('trip_entitlement_document_links','entitlement_id');
insert into public.trip_core_field_registry values('trip_entitlement_document_links','document_id');
insert into public.trip_core_field_registry values('trip_entitlement_document_links','active');
insert into public.trip_core_field_registry values('trip_entitlement_document_links','linked_by');
insert into public.trip_core_field_registry values('trip_entitlement_document_links','linked_at');
insert into public.trip_core_field_registry values('trip_item_document_links','item_id');
insert into public.trip_core_field_registry values('trip_item_document_links','document_id');
insert into public.trip_core_field_registry values('trip_item_document_links','active');
insert into public.trip_core_field_registry values('trip_item_document_links','linked_by');
insert into public.trip_core_field_registry values('trip_item_document_links','linked_at');
insert into public.trip_core_field_registry values('trip_item_participants','item_id');
insert into public.trip_core_field_registry values('trip_item_participants','person_id');
insert into public.trip_core_field_registry values('trip_item_participants','active');
insert into public.trip_core_field_registry values('trip_entitlement_holders','entitlement_id');
insert into public.trip_core_field_registry values('trip_entitlement_holders','person_id');
insert into public.trip_core_field_registry values('trip_entitlement_holders','active');
insert into public.trip_core_field_registry values('trip_item_visibility_people','item_id');
insert into public.trip_core_field_registry values('trip_item_visibility_people','person_id');
insert into public.trip_core_field_registry values('trip_booking_visibility_people','booking_id');
insert into public.trip_core_field_registry values('trip_booking_visibility_people','person_id');
insert into public.trip_core_field_registry values('trip_entitlement_visibility_people','entitlement_id');
insert into public.trip_core_field_registry values('trip_entitlement_visibility_people','person_id');
insert into public.trip_core_field_registry values('trip_document_visibility_people','document_id');
insert into public.trip_core_field_registry values('trip_document_visibility_people','person_id');
insert into public.trip_core_field_registry values('trip_instruction_visibility_people','instruction_id');
insert into public.trip_core_field_registry values('trip_instruction_visibility_people','person_id');
insert into public.trip_core_field_registry values('expense_links','expense_id');
insert into public.trip_core_field_registry values('expense_links','journey_id');
insert into public.trip_core_field_registry values('expense_links','type');
insert into public.trip_core_field_registry values('expense_links','target_id');
insert into public.trip_core_field_registry values('expense_links','metadata');
insert into public.trip_core_field_registry values('expense_links','created_by');

create function public.trip_core_field_state_valid(states jsonb,revision bigint)
returns boolean language plpgsql stable security definer set search_path=pg_catalog
as $$ <<core_fields>> declare address text;state jsonb;table_name text;field_name text;middle text;begin
 if states is null or jsonb_typeof(states)<>'object' or octet_length(states::text)>65536 or (select count(*) from jsonb_object_keys(states))>256 then return false;end if;
 for address,state in select * from jsonb_each(states) loop
  table_name:=split_part(address,'.',1);field_name:=regexp_replace(address,'^.*\.','');middle:=case when address=table_name||'.'||field_name then '' else substr(address,length(table_name)+2,length(address)-length(table_name)-length(field_name)-2) end;
  if not exists(select 1 from public.trip_core_field_registry r where r.table_name=core_fields.table_name and r.field_name=core_fields.field_name) or jsonb_typeof(state)<>'object' or array(select jsonb_object_keys(state) order by 1)<>array['changed_revision','evidence_ref','origin','protected','state'] then return false;end if;
  if middle<>'' and not (table_name in ('itinerary_transport_endpoints','trip_endpoint_details') and middle in ('ORIGIN','DESTINATION') or table_name='trip_rental_places' and middle in ('PICKUP','RETURN') or table_name='trip_activity_entry_places' and middle='ENTRY' or table_name='trip_transport_operational_facts' and middle in ('MEETING','CHECKIN','BOARDING_CUTOFF') or table_name='itinerary_transport_services' and middle ~ '^[A-Za-z0-9._:-]{1,32}$' or table_name='trip_stay_rooms' and middle ~ '^[0-9a-f-]{36}$') then return false;end if;
  if coalesce(state->>'state','') not in ('KNOWN','UNKNOWN','CLEARED') or coalesce(state->>'origin','') not in ('MANUAL','SOURCE','PROVIDER','DERIVED') or jsonb_typeof(state->'protected')<>'boolean' or jsonb_typeof(state->'changed_revision')<>'number' or state->>'changed_revision' !~ '^[1-9][0-9]{0,15}$' or (state->>'changed_revision')::bigint not between 1 and revision or (state->>'protected')::boolean and state->>'origin'<>'MANUAL' or jsonb_typeof(state->'evidence_ref') not in ('null','string') then return false;end if;
 end loop;
 return true;
exception when others then return false;end $$;
revoke all on function public.trip_core_field_state_valid(jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_field_state_valid(jsonb,bigint) to otr_trip_core_v2_writer;
alter table public.itinerary_events add constraint core_v2_field_state check(business_contract_version is null or public.trip_core_field_state_valid(field_state,semantic_revision) is true);
alter table public.itinerary_reservations add constraint core_v2_field_state check(business_contract_version is null or public.trip_core_field_state_valid(field_state,revision) is true);
alter table public.trip_entitlements add constraint core_v2_field_state check(public.trip_core_field_state_valid(field_state,revision) is true);
alter table public.trip_operational_documents add constraint core_v2_field_state check(public.trip_core_field_state_valid(field_state,revision) is true);
alter table public.trip_instruction_entries add constraint core_v2_field_state check(public.trip_core_field_state_valid(field_state,revision) is true);

commit;
