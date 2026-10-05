begin;
set local search_path=pg_catalog;
grant otr_trip_source_writer to postgres with set true;
grant create on schema public to otr_trip_source_writer;
create function public.trip_source_revoke_undispatched_slot(actor uuid,trip uuid,confirmation uuid,expected_revision bigint,slot_id uuid,expected_digest text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$declare c public.trip_source_confirmations;s public.trip_source_output_slots;
begin
 if current_user<>'otr_trip_source_writer' or session_user<>'otr_trip_source_command_gateway' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'UNSUPPORTED_TRANSACTION_ISOLATION' using errcode='25000';end if;
 perform public.trip_import_scope_lock(actor,trip);perform public.trip_import_require_gate();
 select slot.* into s from public.trip_source_output_slots slot join public.trip_source_confirmations parent on parent.id=slot.confirmation_id where parent.id=confirmation and parent.trip_id=trip and parent.actor_account_id=actor and slot.slot_id=trip_source_revoke_undispatched_slot.slot_id;
 if s.slot_id is null or s.domain_intent_sha256 is distinct from expected_digest or s.disposition not in ('CREATE','UPDATE') then raise exception 'INVALID_IMPORT_BINDING';end if;
 perform pg_advisory_xact_lock(hashtextextended('otr-event-operation/'||trip||'/'||actor||'/'||s.domain_operation_key,0));
 perform public.trip_import_lock_admission(actor,trip);
 perform 1 from public.trip_sources where id in(select source_id from public.trip_source_inputs where confirmation_id=confirmation) order by id for update;
 perform 1 from public.trip_source_runs where id=s.reviewed_run_id for update;
 select * into c from public.trip_source_confirmations where id=confirmation for update;
 select * into s from public.trip_source_output_slots where trip_source_output_slots.slot_id=trip_source_revoke_undispatched_slot.slot_id for update;
 if s.no_commit_basis='UNDISPATCHED_REVOKED' and s.state='CANCELED' then return to_jsonb(s);end if;
 if c.row_revision<>expected_revision then raise exception 'CONFIRMATION_CAS_CONFLICT';end if;
 if s.state<>'PREPARED' or s.dispatched_at is not null or s.receipt_sha256 is not null then raise exception 'DISPATCHED_OUTCOME_REQUIRES_RECEIPT';end if;
 update public.trip_source_output_slots set state='CANCELED',create_claim_active=false,no_commit_basis='UNDISPATCHED_REVOKED',no_commit_at=clock_timestamp() where trip_source_output_slots.slot_id=s.slot_id returning * into s;
 update public.trip_source_confirmations set row_revision=row_revision+1,state=case when exists(select 1 from public.trip_source_output_slots where confirmation_id=c.id and state in ('PREPARED','OUTCOME_UNKNOWN','DOMAIN_SUCCEEDED','EVIDENCE_PENDING')) then 'PARTIAL' else 'STOPPED' end where id=c.id;
 return to_jsonb(s);
end $$;
revoke all on function public.trip_source_revoke_undispatched_slot(uuid,uuid,uuid,bigint,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.trip_source_revoke_undispatched_slot(uuid,uuid,uuid,bigint,uuid,text) to otr_trip_source_command_gateway;
alter function public.trip_source_revoke_undispatched_slot(uuid,uuid,uuid,bigint,uuid,text) owner to otr_trip_source_writer;
revoke create on schema public from otr_trip_source_writer;
grant otr_trip_source_writer to postgres with inherit false,set false;
commit;
