-- Core92: REVIEW is not proof that a certified physical claim had no domain effect.
begin;
create function public.trip_core_fence_retained_v2_source_claim()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ declare actor uuid;trip uuid;begin
 if new.disposition<>'CREATE' then return new;end if;
 if tg_op='UPDATE' and old.disposition='CREATE' and not (old.no_commit_basis is not null and new.no_commit_basis is null) and not (not old.create_claim_active and new.create_claim_active) then return new;end if;
 select actor_account_id,trip_id into actor,trip from public.trip_source_confirmations where id=new.confirmation_id;
 if actor is null or trip is null then return new;end if;
 perform public.trip_import_scope_lock(actor,trip);
 if exists(select 1 from public.trip_source_core_v2_slots slot where slot.account_id=actor and slot.trip_id=trip and exists(select 1 from public.trip_source_inputs pin where pin.confirmation_id=new.confirmation_id and pin.source_id=slot.source_id)) then raise exception 'CORE_V2_SOURCE_CLAIM_PRESENT' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.trip_core_fence_retained_v2_source_claim() from public,anon,authenticated,service_role;
drop trigger core_v2_legacy_create_fence on public.trip_source_output_slots;
create trigger core_v2_retained_claim_fence before insert or update on public.trip_source_output_slots for each row execute function public.trip_core_fence_retained_v2_source_claim();
-- Finalization binds retained historical evidence to an already committed exact receipt.
create function public.trip_core_guard_historical_source_association()
returns trigger language plpgsql security invoker set search_path=pg_catalog
as $$ begin
 if tg_op<>'INSERT' then raise exception 'CORE_V2_PUBLICATION_IMMUTABLE' using errcode='42501';end if;
 if new.account_id is distinct from nullif(current_setting('otr.core.actor',true),'')::uuid or new.trip_id is distinct from nullif(current_setting('otr.core.trip',true),'')::uuid then raise exception 'CORE_SCOPE_MISMATCH' using errcode='42501';end if;
 if not exists(select 1 from public.trip_sources src join public.trip_source_revisions rev on rev.source_id=src.id and rev.material_revision=new.source_revision join public.trip_source_runs r on r.id=new.run_id where src.id=new.source_id and src.trip_id=new.trip_id and src.acquired_by=new.account_id and src.lifecycle='ACTIVE' and src.retention_state='RETAINED' and rev.retention_state='RETAINED' and r.trip_id=new.trip_id and r.actor_account_id=new.account_id and new.source_id=any(r.scope_source_ids) and r.state='READY' and r.retention_state='RETAINED') then raise exception 'INPUT_STALE' using errcode='23514';end if;
 if not exists(select 1 from public.trip_source_core_v2_slots slot join public.trip_source_core_v2_candidates candidate on candidate.candidate_id=slot.candidate_id join public.trip_core_command_receipts receipt on receipt.id=new.domain_receipt_id where slot.output_slot_id=new.output_slot_id and slot.account_id=new.account_id and slot.trip_id=new.trip_id and slot.source_id=new.source_id and slot.candidate_id=new.candidate_id and candidate.source_revision=new.source_revision and candidate.run_id=new.run_id and candidate.candidate_json->'fieldEvidence'=new.field_evidence and slot.target_kind=new.target_kind and slot.target_id=new.target_id and slot.identity_sha256=new.identity_sha256 and receipt.actor_account_id=new.account_id and receipt.trip_id=new.trip_id and receipt.operation_id=slot.operation_id and receipt.intent_sha256=slot.intent_sha256 and receipt.receipt_sha256=new.receipt_sha256 and receipt.outcome in ('APPLIED','NO_CHANGE') and receipt.body->>'command'=slot.command and exists(select 1 from jsonb_array_elements(receipt.body->'targetVector') v where v->>'kind'=new.target_kind and v->>'id'=new.target_id::text and (v->>'committedRevision')::bigint=new.target_revision)) then raise exception 'RECEIPT_TARGET_MISMATCH' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.trip_core_guard_historical_source_association() from public,anon,authenticated,service_role;
grant execute on function public.trip_core_guard_historical_source_association() to otr_trip_core_v2_writer;
drop trigger core_v2_publication_guard on public.trip_source_core_v2_associations;
create trigger core_v2_historical_association_guard before insert or update or delete on public.trip_source_core_v2_associations for each row execute function public.trip_core_guard_historical_source_association();
commit;
