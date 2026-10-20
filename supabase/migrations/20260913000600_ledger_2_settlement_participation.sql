-- Explicit Expense settlement participation. Existing rows remain INCLUDED.

alter table public.expenses
  add column settlement_participation text not null default 'INCLUDED'
  check (settlement_participation in ('INCLUDED', 'EXCLUDED'));

create or replace function public.ledger_apply_settlement_participation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_id text := nullif(
    current_setting('otr.settlement_participation_expense', true), ''
  );
  requested text := nullif(
    current_setting('otr.settlement_participation_value', true), ''
  );
  stage9_values jsonb := coalesce(
    nullif(current_setting('otr.stage9_settlement_participation', true), '')::jsonb,
    '{}'::jsonb
  );
begin
  if target_id = new.id::text and requested is not null then
    new.settlement_participation := requested;
  elsif stage9_values ? new.id::text then
    new.settlement_participation := stage9_values ->> new.id::text;
  end if;
  return new;
end;
$$;

create trigger expenses_settlement_participation
before insert or update on public.expenses for each row
execute function public.ledger_apply_settlement_participation();

alter function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
  rename to ledger_create_expense_4a_pre_settlement_participation;
alter function public.ledger_mutate_expense_4b(
  uuid, uuid, uuid, text, bigint, text, text, text, jsonb
) rename to ledger_mutate_expense_4b_pre_settlement_participation;
alter function public.ledger_settlement_source_7_1(uuid, timestamptz)
  rename to ledger_settlement_source_7_1_pre_settlement_participation;
alter function public.ledger_import_stage9_v1(uuid, text, jsonb)
  rename to ledger_import_stage9_v1_pre_settlement_participation;

create or replace function public.ledger_create_expense_4a(
  actor_user uuid,
  target_journey uuid,
  idempotency_key_value text,
  payload_hash_value text,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform set_config(
    'otr.settlement_participation_expense',
    response_body_value #>> '{entity,id}', true
  );
  perform set_config(
    'otr.settlement_participation_value',
    coalesce(
      nullif(response_body_value #>> '{entity,settlementParticipation}', ''),
      'INCLUDED'
    ), true
  );
  result := public.ledger_create_expense_4a_pre_settlement_participation(
    actor_user, target_journey, idempotency_key_value, payload_hash_value,
    response_body_value
  );
  perform set_config('otr.settlement_participation_expense', '', true);
  perform set_config('otr.settlement_participation_value', '', true);
  return result;
end;
$$;

create or replace function public.ledger_mutate_expense_4b(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  command_type_value text,
  base_revision_value bigint,
  audit_reason_value text,
  payload_hash_value text,
  idempotency_key_value text,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if command_type_value = 'UPDATE_EXPENSE'
     and response_body_value #> '{entity}' ? 'settlementParticipation' then
    perform set_config(
      'otr.settlement_participation_expense', target_expense::text, true
    );
    perform set_config(
      'otr.settlement_participation_value',
      response_body_value #>> '{entity,settlementParticipation}', true
    );
  end if;
  result := public.ledger_mutate_expense_4b_pre_settlement_participation(
    actor_user, target_journey, target_expense, command_type_value,
    base_revision_value, audit_reason_value, payload_hash_value,
    idempotency_key_value, response_body_value
  );
  perform set_config('otr.settlement_participation_expense', '', true);
  perform set_config('otr.settlement_participation_value', '', true);
  return result;
end;
$$;

create or replace function public.ledger_settlement_source_7_1(
  target_journey uuid,
  through_timestamp_value timestamptz
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  source_value jsonb;
  expenses_value jsonb;
begin
  source_value := public.ledger_settlement_source_7_1_pre_settlement_participation(
    target_journey, through_timestamp_value
  );
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'settlementParticipation', expense.settlement_participation
    ) order by item.ordinality
  ), '[]'::jsonb)
    into expenses_value
    from jsonb_array_elements(source_value -> 'expenses')
      with ordinality as item(value, ordinality)
    join public.expenses expense on expense.id = (item.value ->> 'id')::uuid;
  return jsonb_set(source_value, '{expenses}', expenses_value);
end;
$$;

create or replace function public.ledger_import_stage9_v1(
  p_actor_user_id uuid,
  p_payload_hash text,
  p_dataset jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  adapted jsonb;
  result jsonb;
  participation_by_expense jsonb;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260913000600'
  )
    or p_dataset ->> 'transformVersion' <> 'stage9-europe-replay-v3'
    or exists (
      select 1 from jsonb_array_elements(p_dataset -> 'expenses') expense
      where expense ->> 'settlementParticipation' not in ('INCLUDED', 'EXCLUDED')
    ) then
    raise exception 'INVALID_STAGE9_IMPORT' using errcode = '23514';
  end if;

  adapted := jsonb_set(
    p_dataset, '{transformVersion}', '"stage9-europe-replay-v2"'::jsonb
  );
  select coalesce(
    jsonb_object_agg(expense ->> 'id', expense -> 'settlementParticipation'),
    '{}'::jsonb
  ) into participation_by_expense
  from jsonb_array_elements(p_dataset -> 'expenses') expense;
  perform set_config(
    'otr.stage9_settlement_participation', participation_by_expense::text, true
  );
  result := public.ledger_import_stage9_v1_pre_settlement_participation(
    p_actor_user_id, p_payload_hash, adapted
  );
  perform set_config('otr.stage9_settlement_participation', '', true);
  return result;
end;
$$;

revoke all on function public.ledger_apply_settlement_participation()
  from public, anon, authenticated;
grant execute on function public.ledger_apply_settlement_participation()
  to postgres, service_role;

revoke all on function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ledger_mutate_expense_4b(
  uuid, uuid, uuid, text, bigint, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.ledger_settlement_source_7_1(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.ledger_import_stage9_v1(uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.ledger_mutate_expense_4b(
  uuid, uuid, uuid, text, bigint, text, text, text, jsonb
) to service_role;
grant execute on function public.ledger_settlement_source_7_1(uuid, timestamptz)
  to service_role;
grant execute on function public.ledger_import_stage9_v1(uuid, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
