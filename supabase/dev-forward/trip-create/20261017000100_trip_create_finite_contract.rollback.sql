-- Close and remove only TCL02 authority. Preserve accepted Trip/Person/receipt/Expense data.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin
 if current_user<>'postgres' then raise exception 'TCL02_INSTALLER_REQUIRED';end if;
 if (select md5(pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,text,text,date,date)'::regprocedure)))<>'9e28168bf2c88fc9fbd6dec4209f62ca' or (select md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure)))<>'ce13962ef89ce377d0a4db18c7fa8cad' or (select md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure)))<>'680f19be480eb934301c8b5b920eb76a' or (select md5(pg_get_functiondef('public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)))<>'4915f242e9e98a31800669b91d81b9bf' or (select md5(pg_get_functiondef('public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure)))<>'32f2b01d2fa890c87640485885565de2' then raise exception 'TCL02_ROLLBACK_PREIMAGE_MISMATCH';end if;
 if exists(select 1 from public.trip_create_activation_gate where enabled)
 or exists(select 1 from public.trip_core_activation_gate where runtime_enabled)
 or exists(select 1 from pg_stat_activity where usename='otr_trip_create_gateway' and pid<>pg_backend_pid())
 or exists(select 1 from pg_roles where rolname='otr_trip_create_gateway' and rolcanlogin)
 then raise exception 'TCL02_ROLLBACK_REQUIRES_CLOSED';end if;
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
create or replace function public.trip_core_finite_read_state_guard()
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
revoke all on function public.trip_create_finite_scope_allowed(uuid,uuid,uuid) from otr_trip_create_gateway;
drop function public.trip_create_finite_scope_allowed(uuid,uuid,uuid);
drop table public.trip_create_activation_gate;
commit;
