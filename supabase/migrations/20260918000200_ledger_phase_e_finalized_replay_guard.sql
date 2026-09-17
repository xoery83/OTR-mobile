-- A completed valuation replay must return its original receipt, even if its
-- Expense was subsequently finalized. New commands still hit the frozen-input guard.
create or replace function public.ledger_apply_valuation_5_1(
  actor_user uuid, target_journey uuid, target_expense uuid,
  idempotency_key_value text, payload_hash_value text,
  valuation_value jsonb, rate_snapshot_value jsonb, response_body_value jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  expense_revision bigint;
begin
  if exists (select 1 from public.ledger_idempotency_keys
    where actor_user_id = actor_user and journey_id = target_journey
      and command_type = 'APPLY_VALUATION' and idempotency_key = idempotency_key_value) then
    return public.ledger_apply_valuation_5_1_unprotected(
      actor_user, target_journey, target_expense, idempotency_key_value,
      payload_hash_value, valuation_value, rate_snapshot_value, response_body_value
    );
  end if;
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
