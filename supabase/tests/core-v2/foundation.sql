-- Synthetic SQL acceptance only. Run after Server84+Core85+Core86 in an owned clone.
-- All fixtures and trigger changes roll back; runtime capability remains CLOSED.
begin;
do $$ begin
 if exists(select 1 from pg_roles where rolname in ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer') and (rolcanlogin or rolbypassrls or rolsuper)) then raise exception 'UNSAFE_CORE_ROLE';end if;
 if exists(select 1 from public.trip_core_activation_gate where runtime_enabled or enabled_commands<>'{}' or enabled_families<>'{}' or enabled_admission_modes<>'{}') then raise exception 'CORE_GATE_NOT_CLOSED';end if;
 if pg_has_role('authenticated','otr_trip_core_v2_writer','MEMBER') or pg_has_role('service_role','otr_trip_core_v2_writer','MEMBER') or pg_has_role('anon','otr_trip_core_v2_gateway','MEMBER') then raise exception 'PUBLIC_WRITER_MEMBERSHIP';end if;
 if has_table_privilege('authenticated','public.trip_entitlements','INSERT') or has_table_privilege('service_role','public.trip_operational_documents','UPDATE') or has_function_privilege('authenticated','public.trip_core_actor_has_trip(uuid,uuid)','EXECUTE') then raise exception 'PUBLIC_CORE_MUTATION';end if;
 if has_column_privilege('otr_trip_core_v2_gateway','public.trip_operational_documents','storage_object_key','SELECT') or has_table_privilege('otr_trip_core_v2_gateway','public.trip_sources','SELECT') or has_table_privilege('otr_trip_core_v2_writer','public.trip_sources','UPDATE') then raise exception 'PRIVATE_SOURCE_OR_CUSTODY_PRIVILEGE';end if;
 if not public.trip_core_field_state_valid('{"itinerary_transport_services.main.code.service_literal":{"state":"KNOWN","origin":"MANUAL","protected":true,"changed_revision":1,"evidence_ref":null}}',1) then raise exception 'REGISTERED_DOTTED_SERVICE_REJECTED';end if;
 if public.trip_core_field_state_valid('{"itinerary_events.arbitrary":{"state":"KNOWN","origin":"MANUAL","protected":true,"changed_revision":1,"evidence_ref":null}}',1) then raise exception 'UNKNOWN_FIELD_ACCEPTED';end if;
 if public.trip_core_boundary_valid('{"local_date":"2026-12-14","local_time":"11:00:01","clock_precision":-1,"quality":"ESTIMATED","basis":"DERIVED_CIVIL","civil_resolution":"PENDING"}','') then raise exception 'INVALID_MINUTE_PRECISION_ACCEPTED';end if;
end $$;

-- Owner inserts known synthetic rows by bypassing only the closed write trigger.
alter table public.itinerary_events disable trigger core_v2_write_guard;
alter table public.trip_item_visibility_people disable trigger core_v2_write_guard;
insert into public.itinerary_events(id,trip_id,title,event_type,status,semantic_revision,owner_account_id,visibility,field_state,business_contract_version,experience_family,temporal_contract_version,temporal_shape,participation_mode,participant_scope,start_local_date,start_quality,start_basis,start_civil_resolution) values
 ('85000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','private fixture','activity','planned',1,'00000000-0000-4000-8000-000000000002','PRIVATE','{}',2,'P1',1,'CALENDAR','SELF','ASSIGNED','2026-12-14','UNKNOWN','DERIVED_CIVIL','PENDING'),
 ('85000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','group fixture','activity','planned',1,'00000000-0000-4000-8000-000000000002','GROUP','{}',2,'P1',1,'CALENDAR','WHOLE_GROUP','WHOLE_GROUP','2026-12-14','UNKNOWN','DERIVED_CIVIL','PENDING'),
 ('85000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','selected fixture','activity','planned',1,'00000000-0000-4000-8000-000000000002','SELECTED_PERSONS','{}',2,'P1',1,'CALENDAR','WHOLE_GROUP','WHOLE_GROUP','2026-12-14','UNKNOWN','DERIVED_CIVIL','PENDING');

insert into public.trip_item_visibility_people(trip_id,item_id,person_id) values ('10000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003');
set constraints all immediate;
alter table public.itinerary_events enable trigger core_v2_write_guard;
alter table public.trip_item_visibility_people enable trigger core_v2_write_guard;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.itinerary_events where id::text like '85000000-%')<>1 then raise exception 'ORGANIZER_PRIVATE_OR_SELECTED_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$ begin
 if (select count(*) from public.itinerary_events where id::text like '85000000-%')<>2 then raise exception 'SELECTED_PERSON_ACL_FAILURE';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.itinerary_events where id::text like '85000000-%')<>3 then raise exception 'OWNER_ACL_FAILURE';end if;
end $$;
select set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
do $$ begin
 if exists(select 1 from public.itinerary_events where id::text like '85000000-%') then raise exception 'CROSS_ACCOUNT_OR_TRIP_LEAK';end if;
end $$;
reset role;
set local role otr_trip_core_v2_writer;
do $$ begin
 begin
  insert into public.trip_entitlements(id) values('85000000-0000-4000-8000-000000000010');
  raise exception 'CLOSED_CORE_WRITER_SUCCEEDED';
 exception when insufficient_privilege then
  if sqlerrm<>'CORE_V2_CAPABILITY_CLOSED' then raise;end if;
 end;
end $$;
reset role;
rollback;
