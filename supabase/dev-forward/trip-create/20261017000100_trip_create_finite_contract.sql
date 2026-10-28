-- TCL02 isolated candidate only. No Hosted installation, LOGIN or activation authorized.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin
 if current_user<>'postgres' then raise exception 'TCL02_INSTALLER_REQUIRED';end if;
 if (select md5(pg_get_functiondef('public.trip_create_command(uuid,uuid,uuid,text,text,date,date)'::regprocedure)))<>'200a322310145e32544b367ec58c395b'
 or (select md5(pg_get_functiondef('public.trip_create_result(uuid,uuid)'::regprocedure)))<>'682946ac85ad222b86947e6561ca9297'
 or (select md5(pg_get_functiondef('public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure)))<>'32f2b01d2fa890c87640485885565de2'
 or (select md5(pg_get_functiondef('public.trip_core_finite_read_state_guard()'::regprocedure)))<>'de920b3d4fe5f1cdfbcd6edb1e004b4f'
 then raise exception 'TCL02_PREIMAGE_MISMATCH';end if;
 if exists(select 1 from pg_proc p where p.oid in ('public.trip_create_command(uuid,uuid,uuid,text,text,date,date)'::regprocedure,'public.trip_create_result(uuid,uuid)'::regprocedure,'public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure,'public.trip_core_finite_read_state_guard()'::regprocedure) and (p.proowner<>'postgres'::regrole or p.proconfig is distinct from array['search_path=pg_catalog'] or p.prosecdef is distinct from (p.proname<>'trip_core_finite_read_state_guard') or (select array_agg(r.rolname::text||':'||a.privilege_type||':'||a.is_grantable order by r.rolname) from aclexplode(p.proacl) a left join pg_roles r on r.oid=a.grantee) is distinct from case p.proname when 'trip_core_finite_scope_allowed' then array['otr_trip_core_v2_gateway:EXECUTE:false','otr_trip_core_v2_writer:EXECUTE:false','otr_trip_create_gateway:EXECUTE:false','postgres:EXECUTE:false'] when 'trip_core_finite_read_state_guard' then array['otr_trip_core_v2_writer:EXECUTE:false','postgres:EXECUTE:false'] else array['otr_trip_create_gateway:EXECUTE:false','postgres:EXECUTE:false'] end)) then raise exception 'TCL02_SECURITY_PREIMAGE_MISMATCH';end if;
 if not exists(select 1 from public.trip_core_activation_gate where singleton and not runtime_enabled)
 or exists(select 1 from pg_roles where rolname='otr_trip_create_gateway' and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls or rolreplication))
 then raise exception 'TCL02_REQUIRES_CLOSED_PARENT';end if;
end $$;
create table public.trip_create_activation_gate (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 actor_account_id uuid,trip_id uuid,operation_id uuid,request_payload jsonb,
 started_at timestamptz,expires_at timestamptz,
 constraint trip_create_scope_shape check (
  (not enabled and actor_account_id is null and trip_id is null and operation_id is null and request_payload is null and started_at is null and expires_at is null)
  or (enabled and actor_account_id is not null and trip_id is not null and operation_id is not null and request_payload is not null
   and jsonb_typeof(request_payload)='object' and octet_length(request_payload::text)<=2048
   and request_payload ?& array['tripId','name','destination','startDate','endDate']
   and request_payload-array['tripId','name','destination','startDate','endDate']='{}'::jsonb
   and coalesce(request_payload->>'tripId'=trip_id::text,false)
   and started_at is not null and expires_at is not null and isfinite(started_at) and isfinite(expires_at)
   and expires_at>started_at and expires_at<=started_at+interval '15 minutes'))
 );
insert into public.trip_create_activation_gate(singleton) values(true);
alter table public.trip_create_activation_gate enable row level security;
revoke all on public.trip_create_activation_gate from public,anon,authenticated,service_role,otr_trip_create_gateway;
create function public.trip_create_finite_scope_allowed(actor uuid,trip uuid,operation uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare gate public.trip_create_activation_gate%rowtype; principal record;instant timestamptz;owner_id oid;
begin
 if session_user<>'otr_trip_create_gateway' or current_user<>'postgres' or actor is null or operation is null then return false;end if;
 select oid into owner_id from pg_roles where rolname=current_user;
 select * into principal from pg_roles where rolname='otr_trip_create_gateway';
 if not found or not principal.rolcanlogin or principal.rolconnlimit<>1 or principal.rolvaliduntil is null
 or principal.rolsuper or principal.rolcreatedb or principal.rolcreaterole or principal.rolinherit or principal.rolbypassrls or principal.rolreplication
 or exists(select 1 from pg_auth_members m where (m.roleid=principal.oid or m.member=principal.oid) and not (m.roleid=principal.oid and m.member=owner_id and m.admin_option and not m.inherit_option and not m.set_option))
 or not exists(select 1 from pg_class c where c.oid='public.trip_create_activation_gate'::regclass and c.relowner=owner_id and c.relrowsecurity and not c.relforcerowsecurity)
 or exists(select 1 from pg_policy where polrelid='public.trip_create_activation_gate'::regclass)
 or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.trip_create_activation_gate'::regclass and (a.grantee<>owner_id or a.is_grantable))
 or exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=principal.oid and deptype='o')
 or exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_namespace n cross join lateral aclexplode(n.nspacl) a where a.grantee=principal.oid and (n.nspname<>'public' or a.privilege_type<>'USAGE' or a.is_grantable))
 or exists(select 1 from pg_database d cross join lateral aclexplode(d.datacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_tablespace t cross join lateral aclexplode(t.spcacl) a where a.grantee=principal.oid)
 or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where a.grantee=principal.oid and (a.privilege_type<>'EXECUTE' or a.is_grantable or p.oid not in (
  'public.trip_create_command(uuid,uuid,uuid,text,text,date,date)'::regprocedure,
  'public.trip_create_result(uuid,uuid)'::regprocedure,
  'public.trip_core_finite_scope_allowed(uuid,uuid)'::regprocedure,
  'public.trip_create_finite_scope_allowed(uuid,uuid,uuid)'::regprocedure)))
 then return false;end if;
 select * into gate from public.trip_create_activation_gate where singleton for share;
 instant:=clock_timestamp();
 return coalesce(gate.enabled and actor=gate.actor_account_id and operation=gate.operation_id
  and (trip=gate.trip_id or trip is null)
  and instant>=gate.started_at and instant<gate.expires_at
  and principal.rolvaliduntil>instant and principal.rolvaliduntil<=gate.expires_at,false);
end $$;
revoke all on function public.trip_create_finite_scope_allowed(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_create_finite_scope_allowed(uuid,uuid,uuid) to otr_trip_create_gateway;

create or replace function public.trip_create_result(p_operation uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare r record;t record;p record;s record;begin
 if session_user<>'otr_trip_create_gateway' then raise exception 'TRIP_CREATE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 if not public.trip_create_finite_scope_allowed(p_actor,null,p_operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 select * into r from public.trip_create_receipts where operation_id=p_operation for share;
 if not found then return null;end if;
 if not public.trip_create_finite_scope_allowed(p_actor,r.trip_id,p_operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
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
 if not public.trip_create_finite_scope_allowed(p_actor,p_trip,p_operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 if p_actor is null or p_operation is null or p_trip is null or
  p_name is null or p_name<>btrim(p_name) or length(p_name)<1 or length(p_name)>256 or
  (p_destination is not null and (p_destination<>btrim(p_destination) or length(p_destination)>256)) or
  (p_start is not null and p_end is not null and p_end<p_start)
 then raise exception 'TRIP_CREATE_INVALID' using errcode='22023';end if;
 payload:=jsonb_build_object('tripId',p_trip,'name',p_name,'destination',p_destination,
  'startDate',p_start,'endDate',p_end);
 if payload is distinct from (select request_payload from public.trip_create_activation_gate where singleton) then raise exception 'TRIP_CREATE_OPERATION_REUSE_MISMATCH' using errcode='23505';end if;
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
create or replace function public.trip_core_finite_read_state_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid;trip uuid;operation uuid;
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
  select r.actor_account_id,r.operation_id into actor,operation from public.trip_create_receipts r join public.trips t on t.id=r.trip_id and t.created_by=r.actor_account_id where r.trip_id=trip for share of r;
  if tg_op<>'INSERT' or not public.trip_create_finite_scope_allowed(actor,trip,operation) then raise exception 'TRIP_CREATE_CAPABILITY_CLOSED' using errcode='55000';end if;
 end if;
 -- Existing privileged membership invalidation retains its current authority.
 return coalesce(new,old);
end $$;
commit;
