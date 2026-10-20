-- Historical occurred_at is not evidence of the traveller's intended local day.
alter table public.expenses add column economic_date date;

-- Inject the date into the existing INSERT/UPDATE, not a second UPDATE: the
-- existing expenses_touch_revision trigger increments revision on every update.
create function public.ledger_apply_economic_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if nullif(current_setting('otr.economic_date_expense', true), '') = new.id::text then
    new.economic_date := nullif(current_setting('otr.economic_date_value', true), '')::date;
  end if;
  return new;
end;
$$;
create trigger expenses_economic_date before insert or update on public.expenses
for each row execute function public.ledger_apply_economic_date();

-- Preserve Stage 4A/4B financial, conflict, audit and idempotency behavior.
alter function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
  rename to ledger_create_expense_4a_without_economic_date;

create function public.ledger_create_expense_4a(
  actor_user uuid, target_journey uuid, idempotency_key_value text,
  payload_hash_value text, response_body_value jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform set_config('otr.economic_date_expense', response_body_value #>> '{entity,id}', true);
  perform set_config('otr.economic_date_value',
    coalesce(response_body_value #>> '{entity,economicDate}', ''), true);
  result := public.ledger_create_expense_4a_without_economic_date(
    actor_user, target_journey, idempotency_key_value,
    payload_hash_value, response_body_value
  );
  perform set_config('otr.economic_date_expense', '', true);
  perform set_config('otr.economic_date_value', '', true);
  return result;
end;
$$;
revoke all on function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
  to service_role;

alter function public.ledger_mutate_expense_4b(
  uuid, uuid, uuid, text, bigint, text, text, text, jsonb
) rename to ledger_mutate_expense_4b_without_economic_date;

create function public.ledger_mutate_expense_4b(
  actor_user uuid, target_journey uuid, target_expense uuid,
  command_type_value text, base_revision_value bigint, audit_reason_value text,
  payload_hash_value text, idempotency_key_value text, response_body_value jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if command_type_value = 'UPDATE_EXPENSE' then
    perform set_config('otr.economic_date_expense', target_expense::text, true);
    perform set_config('otr.economic_date_value',
      coalesce(response_body_value #>> '{entity,economicDate}', ''), true);
  end if;
  result := public.ledger_mutate_expense_4b_without_economic_date(
    actor_user, target_journey, target_expense, command_type_value,
    base_revision_value, audit_reason_value, payload_hash_value,
    idempotency_key_value, response_body_value
  );
  perform set_config('otr.economic_date_expense', '', true);
  perform set_config('otr.economic_date_value', '', true);
  return result;
end;
$$;
revoke all on function public.ledger_mutate_expense_4b(
  uuid, uuid, uuid, text, bigint, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ledger_mutate_expense_4b(
  uuid, uuid, uuid, text, bigint, text, text, text, jsonb
) to service_role;

notify pgrst, 'reload schema';
