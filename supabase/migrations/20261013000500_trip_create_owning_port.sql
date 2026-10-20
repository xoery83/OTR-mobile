-- Dormant Trip creation port. No LOGIN, credential, HTTP wiring or Core activation.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='otr_trip_create_gateway') then
  create role otr_trip_create_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 end if;
 if exists(select 1 from pg_roles where rolname='otr_trip_create_gateway' and
  (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication)) or
  exists(select 1 from pg_auth_members where
   (roleid='otr_trip_create_gateway'::regrole or member='otr_trip_create_gateway'::regrole)
   and not (roleid='otr_trip_create_gateway'::regrole and
    member=(select oid from pg_roles where rolname=current_user) and
    not inherit_option and not set_option))
 then raise exception 'UNSAFE_TRIP_CREATE_PRINCIPAL';end if;
end $$;
grant usage on schema public to otr_trip_create_gateway;

create table public.trip_create_receipts (
 operation_id uuid primary key,
 trip_id uuid not null unique references public.trips(id) deferrable initially deferred,
 actor_account_id uuid not null references auth.users(id),
 request_payload jsonb not null check(jsonb_typeof(request_payload)='object' and octet_length(request_payload::text)<=2048),
 created_at timestamptz(6) not null default clock_timestamp()
);
alter table public.trip_create_receipts enable row level security;
revoke all on public.trip_create_receipts from public,anon,authenticated,service_role;

create function public.trip_create_result(p_operation uuid,p_actor uuid)
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

create function public.trip_create_command(p_operation uuid,p_actor uuid,p_trip uuid,
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

revoke all on function public.trip_create_result(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.trip_create_command(uuid,uuid,uuid,text,text,date,date) from public,anon,authenticated,service_role;
grant execute on function public.trip_create_result(uuid,uuid),
 public.trip_create_command(uuid,uuid,uuid,text,text,date,date) to otr_trip_create_gateway;
commit;
