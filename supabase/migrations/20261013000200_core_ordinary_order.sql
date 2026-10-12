-- CLOSED ordinary ordering carrier; existing Core owning writer and receipts only.
begin;
create table public.trip_person_ordinary_orders (
 id uuid primary key, trip_id uuid not null references public.trips(id),
 revision bigint not null check(revision between 1 and 9007199254740991),
 owner_account_id uuid not null, person_id uuid not null, branch_id uuid not null,
 visibility text not null check(visibility='PRIVATE'), hidden_at timestamptz check(hidden_at is null),
 created_at timestamptz not null, updated_at timestamptz not null, field_state jsonb not null,
 nodes jsonb not null check(jsonb_typeof(nodes)='array' and jsonb_array_length(nodes) between 2 and 30),
 gaps jsonb not null check(jsonb_typeof(gaps)='array' and jsonb_array_length(gaps)=jsonb_array_length(nodes)-1),
 unique(trip_id,person_id)
);
alter table public.trip_person_ordinary_orders enable row level security;
revoke all on public.trip_person_ordinary_orders from public,anon,authenticated,service_role;
grant select,insert,update on public.trip_person_ordinary_orders to otr_trip_core_v2_writer;
grant select on public.trip_person_ordinary_orders to otr_trip_core_v2_gateway;
create policy owning_write on public.trip_person_ordinary_orders to otr_trip_core_v2_writer using(true) with check(true);
create policy owning_read on public.trip_person_ordinary_orders for select to otr_trip_core_v2_gateway using(trip_id=nullif(current_setting('otr.core.trip',true),'')::uuid);
create trigger owning_write_guard before insert or update or delete on public.trip_person_ordinary_orders for each row execute function public.trip_core_guard_write();
create function public.trip_core_guard_ordinary_order() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if session_user<>'otr_trip_core_v2_gateway' then raise exception 'CORE_PRINCIPAL_UNAVAILABLE' using errcode='42501';end if;
 if tg_op='DELETE' then raise exception 'CORE_V2_PHYSICAL_DELETE_FORBIDDEN' using errcode='42501';end if;
 if new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 if new.owner_account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or
    not exists(select 1 from public.journey_members where id=new.person_id and trip_id=new.trip_id and user_id=new.owner_account_id and status='linked' and participation_active)
 then raise exception 'INVALID_SELF_PERSON' using errcode='42501';end if;
 if tg_op='INSERT' and new.revision<>1 then raise exception 'REVISION_CONFLICT' using errcode='23514';end if;
 if tg_op='UPDATE' and (new.person_id<>old.person_id or new.revision<>old.revision+1) then raise exception 'REVISION_CONFLICT' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.trip_core_guard_ordinary_order() from public,anon,authenticated,service_role;
grant execute on function public.trip_core_guard_ordinary_order() to otr_trip_core_v2_writer;

create trigger ordinary_order_scope before insert or update or delete on public.trip_person_ordinary_orders for each row execute function public.trip_core_guard_ordinary_order();
commit;
