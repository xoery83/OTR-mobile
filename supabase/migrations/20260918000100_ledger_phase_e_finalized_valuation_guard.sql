-- Stage 7.2B replaced the Stage 5 function without its finalized-input guard.
-- Keep the canonical RPC contract and restore the guard before any evidence write.
alter function public.ledger_apply_valuation_5_1(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb
) rename to ledger_apply_valuation_5_1_unprotected;

create function public.ledger_apply_valuation_5_1(
  actor_user uuid, target_journey uuid, target_expense uuid,
  idempotency_key_value text, payload_hash_value text,
  valuation_value jsonb, rate_snapshot_value jsonb, response_body_value jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  expense_revision bigint;
begin
  select revision into expense_revision from public.expenses
  where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if expense_revision <> (valuation_value ->> 'baseRevision')::bigint then
    raise exception 'REVISION_CONFLICT';
  end if;
  if exists (select 1 from public.settlement_inputs si join public.settlements s
    on s.id = si.settlement_id where si.expense_id = target_expense
    and s.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')) then
    raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
  end if;
  return public.ledger_apply_valuation_5_1_unprotected(
    actor_user, target_journey, target_expense, idempotency_key_value,
    payload_hash_value, valuation_value, rate_snapshot_value, response_body_value
  );
end;
$$;

revoke all on function public.ledger_apply_valuation_5_1(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
