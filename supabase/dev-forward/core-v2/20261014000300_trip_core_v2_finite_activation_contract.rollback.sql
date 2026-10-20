-- Owned finite-contract rollback only after reviewed Ops approval. Never delete retained business rows.
begin;
lock table public.trip_core_activation_gate in access exclusive mode;
update public.trip_core_activation_gate set runtime_enabled=false,enabled_commands='{}',enabled_families='{}',enabled_admission_modes='{}',scope_actor_account_id=null,scope_trip_id=null,scope_started_at=null,scope_expires_at=null where singleton;
create or replace function public.trip_core_guard_write()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ declare old_json jsonb;new_json jsonb;actor uuid;trip uuid; begin
 if tg_op='TRUNCATE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='DELETE' then old_json:=to_jsonb(old);else new_json:=to_jsonb(new);end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;
 if tg_table_name in ('itinerary_events','itinerary_reservations') and coalesce(old_json->>'business_contract_version',new_json->>'business_contract_version') is null then return coalesce(new,old);end if;
 if tg_table_name in ('itinerary_transport_endpoints','itinerary_transport_services') and coalesce(old_json->>'trip_id',new_json->>'trip_id') is null then return coalesce(new,old);end if;
 if current_user<>'otr_trip_core_v2_writer' or not exists(select 1 from public.trip_core_activation_gate where singleton and runtime_enabled) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
 if not public.trip_core_actor_has_trip(actor,trip) then raise exception 'CORE_V2_NOT_VISIBLE' using errcode='42501';end if;
 if tg_op='DELETE' and tg_table_name in ('itinerary_events','itinerary_reservations','trip_entitlements','trip_operational_documents','trip_instruction_entries','trip_booking_observations','trip_core_command_receipts','trip_source_core_v2_candidates','trip_source_core_v2_intents','trip_source_core_v2_slots') then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='UPDATE' and (old_json->'id' is distinct from new_json->'id' or old_json->'trip_id' is distinct from new_json->'trip_id' or old_json->'owner_account_id' is distinct from new_json->'owner_account_id' or old_json->'created_at' is distinct from new_json->'created_at') then raise exception 'CORE_V2_IMMUTABLE_IDENTITY' using errcode='23514';end if;
 if tg_table_name='trip_core_command_receipts' and tg_op<>'INSERT' then raise exception 'CORE_V2_RECEIPT_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_source_core_v2_candidates' and tg_op<>'INSERT' then raise exception 'CORE_V2_CANDIDATE_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='trip_instruction_entries' and tg_op='UPDATE' and (old_json-array['revision','visibility','hidden_at','updated_at','field_state']) is distinct from (new_json-array['revision','visibility','hidden_at','updated_at','field_state']) then raise exception 'CORE_V2_INSTRUCTION_IMMUTABLE' using errcode='23514';end if;
 if tg_table_name='itinerary_events' and tg_op<>'DELETE' and not public.trip_core_event_row_valid(new_json) then raise exception 'CORE_V2_INVALID_AGGREGATE' using errcode='23514';end if;
 return coalesce(new,old);
end $$;
create or replace function public.trip_create_result(p_operation uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare r record;t record;p record;s record;begin
 if session_user<>'otr_trip_create_gateway' then raise exception 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 select * into r from public.trip_create_receipts where operation_id=p_operation for share;
 if not found then return null;end if;
 if r.actor_account_id<>p_actor then raise exception 'TRIP_CREATE_ACTOR_MISMATCH' using errcode='42501';end if;
 select id,name,destination,start_date,end_date,created_by into t from public.trips where id=r.trip_id for share;
 select id,status into p from public.journey_members where trip_id=r.trip_id and user_id=p_actor for share;
 select epoch,revision,access_revision into s from public.trip_core_read_state where trip_id=r.trip_id for share;
 if t.id is null or t.created_by<>p_actor or p.id is null or p.status<>'linked' or s.epoch is null then
  raise exception 'TRIP_CREATE_OWNING_STATE_UNAVAILABLE' using errcode='42501';
 end if;
 return jsonb_build_object('operationId',r.operation_id,'tripId',t.id,'actorAccountId',r.actor_account_id,'ownerPersonId',p.id,
  'coreEpoch',s.epoch,'coreRevision',s.revision,'coreAccessRevision',s.access_revision,
  'name',t.name,'destination',t.destination,'startDate',t.start_date,'endDate',t.end_date);
end $$;
create or replace function public.trip_create_command(p_operation uuid,p_actor uuid,p_trip uuid,
 p_name text,p_destination text,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare payload jsonb; inserted uuid;r record;begin
 if session_user<>'otr_trip_create_gateway' then raise exception 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 if p_actor is null or p_operation is null or p_trip is null or
  p_name is null or p_name<>btrim(p_name) or length(p_name)<1 or length(p_name)>256 or
  (p_destination is not null and (p_destination<>btrim(p_destination) or length(p_destination)>256)) or
  (p_start is not null and p_end is not null and p_end<p_start)
 then raise exception 'TRIP_CREATE_INVALID' using errcode='22023';end if;
 payload:=jsonb_build_object('tripId',p_trip,'name',p_name,'destination',p_destination,
  'startDate',p_start,'endDate',p_end);
 insert into public.trip_create_receipts(operation_id,trip_id,actor_account_id,request_payload)
 values(p_operation,p_trip,p_actor,payload) on conflict(operation_id) do nothing returning operation_id into inserted;
 if inserted is null then
  select * into r from public.trip_create_receipts where operation_id=p_operation for update;
  if r.actor_account_id<>p_actor then raise exception 'TRIP_CREATE_ACTOR_MISMATCH' using errcode='42501';end if;
  if r.request_payload<>payload then raise exception 'TRIP_CREATE_OPERATION_REUSE_MISMATCH' using errcode='23505';end if;
 else
  insert into public.trips(id,name,destination,start_date,end_date,created_by)
  values(p_trip,p_name,p_destination,p_start,p_end,p_actor);
  insert into public.trip_core_read_state(trip_id) values(p_trip);
 end if;
 return public.trip_create_result(p_operation,p_actor);
end $$;
drop trigger finite_core_read_state_scope on public.trip_core_read_state;
drop function public.trip_core_finite_read_state_guard();
drop function public.trip_core_finite_scope_allowed(uuid,uuid);
alter table public.trip_core_activation_gate drop constraint finite_core_scope_contract,
 add constraint trip_core_activation_gate_runtime_enabled_check check(runtime_enabled=false),
 add constraint trip_core_activation_gate_enabled_commands_check check(enabled_commands='{}'),
 add constraint trip_core_activation_gate_enabled_families_check check(enabled_families='{}'),
 add constraint trip_core_activation_gate_enabled_admission_modes_check check(enabled_admission_modes='{}'),
 drop column scope_actor_account_id,drop column scope_trip_id,drop column scope_started_at,drop column scope_expires_at;
commit;
