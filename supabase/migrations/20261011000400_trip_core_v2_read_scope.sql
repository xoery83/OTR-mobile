-- Core88: bounded actor binding read and additive access-generation invalidation.
begin;
create function public.trip_core_read_person_bindings(actor uuid,trip uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$ declare scope jsonb; rows jsonb;begin
 scope:=public.trip_core_lock_actor_scope(actor,trip);
 if scope->>'active'<>'true' then raise exception 'NOT_VISIBLE' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('person_id',id,'account_id',case when status='linked' then user_id else null end,'active',status<>'removed','participating',participation_active and status<>'removed','revision',participation_revision) order by id),'[]'::jsonb) into rows from public.journey_members where trip_id=trip;
 if jsonb_array_length(rows)>20000 then raise exception 'CORE_READ_RESOURCE_LIMIT';end if;
 return rows;
end $$;
revoke all on function public.trip_core_read_person_bindings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.trip_core_read_person_bindings(uuid,uuid) to otr_trip_core_v2_gateway;

create function public.trip_core_invalidate_actor_read()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
 if tg_op<>'INSERT' then update public.trip_core_read_state set revision=revision+1,access_revision=access_revision+1 where trip_id=old.trip_id;end if;
 if tg_op='INSERT' or tg_op='UPDATE' and new.trip_id is distinct from old.trip_id then update public.trip_core_read_state set revision=revision+1,access_revision=access_revision+1 where trip_id=new.trip_id;end if;
 return null;
end $$;
revoke all on function public.trip_core_invalidate_actor_read() from public,anon,authenticated,service_role;
create trigger core_v2_member_read_invalidation after insert or update or delete on public.trip_members for each row execute function public.trip_core_invalidate_actor_read();
create trigger core_v2_person_read_invalidation after insert or update or delete on public.journey_members for each row execute function public.trip_core_invalidate_actor_read();
commit;
