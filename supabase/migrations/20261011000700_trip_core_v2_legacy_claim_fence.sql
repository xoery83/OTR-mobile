-- Core91: v1 fresh CREATE cannot ignore already active v2 Source claims.
begin;
create function public.trip_core_fence_legacy_source_create()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare actor uuid;trip uuid;begin
 if new.disposition<>'CREATE' then return new;end if;
 if tg_op='UPDATE' and old.disposition='CREATE' and not (old.no_commit_basis is not null and new.no_commit_basis is null) and not (not old.create_claim_active and new.create_claim_active) then return new;end if;
 select actor_account_id,trip_id into actor,trip from public.trip_source_confirmations where id=new.confirmation_id;
 if actor is null or trip is null then return new;end if;
 perform public.trip_import_scope_lock(actor,trip);
 if exists(select 1 from public.trip_source_core_v2_slots slot where slot.account_id=actor and slot.trip_id=trip and slot.state<>'REVIEW' and exists(select 1 from public.trip_source_inputs pin where pin.confirmation_id=new.confirmation_id and pin.source_id=slot.source_id)) then raise exception 'CORE_V2_SOURCE_CLAIM_PRESENT' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.trip_core_fence_legacy_source_create() from public,anon,authenticated,service_role;
create trigger core_v2_legacy_create_fence before insert or update on public.trip_source_output_slots for each row execute function public.trip_core_fence_legacy_source_create();
commit;
