-- Dormant finite first-loop contract. No installation or enable on DEV is authorized.
begin;
do $$begin
 if not exists(select 1 from public.trip_core_activation_gate where singleton and not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}') then raise exception 'FINITE_CORE_REQUIRES_CLOSED_PARENT';end if;
end $$;
alter table public.trip_core_activation_gate
 add column scope_actor_account_id uuid,
 add column scope_trip_id uuid,
 add column scope_started_at timestamptz(6),
 add column scope_expires_at timestamptz(6),
 drop constraint trip_core_activation_gate_runtime_enabled_check,
 drop constraint trip_core_activation_gate_enabled_commands_check,
 drop constraint trip_core_activation_gate_enabled_families_check,
 drop constraint trip_core_activation_gate_enabled_admission_modes_check,
 add constraint finite_core_scope_contract check (
  (not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}'
   and scope_actor_account_id is null and scope_trip_id is null and scope_started_at is null and scope_expires_at is null)
  or (runtime_enabled and enabled_commands=array['CREATE_ITEM']::text[] and enabled_families=array['P1','P3']::text[] and enabled_admission_modes=array['MANUAL']::text[]
   and scope_actor_account_id is not null and scope_trip_id is not null and scope_started_at is not null and scope_expires_at is not null
   and isfinite(scope_started_at) and isfinite(scope_expires_at) and scope_expires_at>scope_started_at and scope_expires_at<=scope_started_at+interval '15 minutes'));
-- Prospective Trip UUID deliberately has no Trip FK: it bounds Trip100 bootstrap.
create function public.trip_core_finite_scope_allowed(actor uuid,trip uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare gate public.trip_core_activation_gate%rowtype; instant timestamptz;
begin
 -- ADMIN is trusted migration ownership, not a sandbox; unexpected edges fail closed.
 if exists(select 1 from pg_roles where rolname in ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer','otr_trip_create_gateway') and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication))
 or (select count(*) from pg_roles where rolname in ('otr_trip_core_v2_gateway','otr_trip_core_v2_writer','otr_trip_create_gateway'))<>3
 or exists(select 1 from pg_auth_members m where (m.roleid in ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole,'otr_trip_create_gateway'::regrole) or m.member in ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole,'otr_trip_create_gateway'::regrole)) and not (
  (m.member=current_user::regrole and m.roleid in ('otr_trip_core_v2_gateway'::regrole,'otr_trip_core_v2_writer'::regrole,'otr_trip_create_gateway'::regrole) and m.admin_option and not m.inherit_option and not m.set_option)
  or (m.roleid='otr_trip_core_v2_writer'::regrole and m.member='otr_trip_core_v2_gateway'::regrole and not m.admin_option and not m.inherit_option and m.set_option))) then return false;end if;
 if session_user not in ('otr_trip_core_v2_gateway','otr_trip_create_gateway') or actor is null then return false;end if;
 select * into gate from public.trip_core_activation_gate where singleton for share;
 instant:=clock_timestamp();
 return coalesce(gate.runtime_enabled and actor=gate.scope_actor_account_id
  and (trip=gate.scope_trip_id or trip is null and session_user='otr_trip_create_gateway')
  and instant>=gate.scope_started_at and instant<gate.scope_expires_at,false);
end $$;
revoke all on function public.trip_core_finite_scope_allowed(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_finite_scope_allowed(uuid,uuid) to otr_trip_core_v2_gateway,otr_trip_core_v2_writer,otr_trip_create_gateway;
create or replace function public.trip_core_guard_write()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ declare old_json jsonb;new_json jsonb;actor uuid;trip uuid; begin
 if tg_op='TRUNCATE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if tg_op='DELETE' then old_json:=to_jsonb(old);else new_json:=to_jsonb(new);end if;
 if tg_op='UPDATE' then old_json:=to_jsonb(old);end if;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;trip:=(coalesce(new_json,old_json)->>'trip_id')::uuid;
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
create function public.trip_core_finite_read_state_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid;trip uuid;
begin
 trip:=(to_jsonb(coalesce(new,old))->>'trip_id')::uuid;
 if session_user='otr_trip_core_v2_gateway' or current_user='otr_trip_core_v2_writer' then
  actor:=nullif(current_setting('otr.core.actor',true),'')::uuid;
  if current_user<>'otr_trip_core_v2_writer' or session_user<>'otr_trip_core_v2_gateway' or tg_op not in ('INSERT','UPDATE') or not public.trip_core_finite_scope_allowed(actor,trip)
   or trip is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid
   or current_setting('otr.core.command',true) is distinct from 'CREATE_ITEM'
   or tg_op='INSERT' and not exists(select 1 from public.trip_core_read_state where trip_id=trip)
   or tg_op='UPDATE' and (new.epoch is distinct from old.epoch or new.access_revision is distinct from old.access_revision or new.revision<>old.revision+1) then raise exception 'CORE_V2_CAPABILITY_CLOSED' using errcode='42501';end if;
 elsif session_user='otr_trip_create_gateway' then
  select created_by into actor from public.trips where id=trip;
  if tg_op<>'INSERT' or not public.trip_core_finite_scope_allowed(actor,trip) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $$;
revoke all on function public.trip_core_finite_read_state_guard() from public,anon,authenticated,service_role;
grant execute on function public.trip_core_finite_read_state_guard() to otr_trip_core_v2_writer;
create trigger finite_core_read_state_scope before insert or update or delete on public.trip_core_read_state for each row execute function public.trip_core_finite_read_state_guard();
create or replace function public.trip_create_result(p_operation uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare r record;t record;p record;s record;begin
 if session_user<>'otr_trip_create_gateway' then raise exception 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 if not public.trip_core_finite_scope_allowed(p_actor,null) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 select * into r from public.trip_create_receipts where operation_id=p_operation for share;
 if not found then return null;end if;
 if not public.trip_core_finite_scope_allowed(p_actor,r.trip_id) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
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
 if not public.trip_core_finite_scope_allowed(p_actor,p_trip) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
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
commit;
