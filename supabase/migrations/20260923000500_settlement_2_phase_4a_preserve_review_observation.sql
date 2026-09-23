-- Human review observations remain immutable. Correction lineage carries old -> new IDs.
create or replace function public.ledger_finalize_correction_4a(
  actor_user uuid,
  target_journey uuid,
  target_root uuid,
  source_expense uuid,
  successor_response jsonb,
  expected_head uuid,
  input_digest_value text,
  computed_input_digest_value text,
  prior_input_digest_value text,
  expected_source_value jsonb,
  inputs_value jsonb,
  deltas_value jsonb,
  transfers_value jsonb,
  changed_expenses_value jsonb,
  reason_value text,
  allow_zero_transfer boolean,
  blocked_value boolean,
  idempotency_key_value text,
  payload_hash_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  root public.settlements%rowtype;
  current_version uuid;
  successor_id uuid := (successor_response #>> '{entity,id}')::uuid;
  correction_id uuid := gen_random_uuid();
  create_result jsonb;
  version_result jsonb;
  response_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_root::text, 0));

  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'FINALIZE_CORRECTION'
    and idempotency_key = idempotency_key_value;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into root from public.settlements
  where id = target_root and journey_id = target_journey
    and settlement_kind = 'ROOT' for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.journey_members
    where trip_id = target_journey and user_id = actor_user
      and status = 'linked' and role = 'owner'
  ) then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;
  if nullif(trim(reason_value), '') is null then raise exception 'REASON_REQUIRED'; end if;
  if successor_id is null or successor_id = source_expense then
    raise exception 'INVALID_CORRECTION_SUCCESSOR';
  end if;

  select coalesce(
    (select id from public.settlements
     where root_settlement_id = target_root and settlement_kind = 'ADJUSTMENT'
     order by lineage_sequence desc limit 1),
    target_root
  ) into current_version;
  if not exists (
    select 1 from public.settlement_inputs
    where settlement_id = current_version and expense_id = source_expense
  ) or exists (
    select 1 from public.expense_correction_successors
    where source_expense_id = source_expense
  ) then raise exception 'CORRECTION_SOURCE_STALE'; end if;

  insert into public.expense_correction_successors (
    id, journey_id, root_settlement_id, source_expense_id,
    successor_expense_id, actor_user_id, reason
  ) values (
    correction_id, target_journey, target_root, source_expense,
    successor_id, actor_user, trim(reason_value)
  );

  create_result := public.ledger_create_expense_4a(
    actor_user,
    target_journey,
    'correction-source:' || idempotency_key_value,
    payload_hash_value,
    successor_response
  );

  version_result := public.ledger_finalize_adjustment_7_2b(
    actor_user, target_journey, target_root, expected_head,
    input_digest_value, computed_input_digest_value, prior_input_digest_value,
    expected_source_value, inputs_value, deltas_value, transfers_value,
    changed_expenses_value, reason_value, allow_zero_transfer, blocked_value,
    'correction-version:' || idempotency_key_value, payload_hash_value
  );

  update public.expense_correction_successors
  set correction_settlement_id = (version_result ->> 'settlementId')::uuid
  where id = correction_id;

  update public.ledger_review_findings
  set lifecycle = 'RESOLVED_BY_EXPENSE_UPDATE',
      status = 'STALE',
      resolved_at = now(),
      resolution_reason = 'CORRECTION_SUCCESSOR_CONFIRMED'
  where journey_id = target_journey and origin = 'HUMAN' and lifecycle = 'ACTIVE'
    and (
      (target_type in ('EXPENSE', 'EXPENSE_SHARE') and expense_id = source_expense)
      or (target_type = 'SETTLEMENT' and settlement_id = target_root)
    );

  response_value := jsonb_build_object(
    'settlementId', version_result ->> 'settlementId',
    'successorExpenseId', successor_id,
    'idempotentReplay', false
  );
  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
    response_status, response_body, completed_at
  ) values (
    actor_user, target_journey, 'FINALIZE_CORRECTION', idempotency_key_value,
    payload_hash_value, 200, response_value, now()
  );
  return response_value;
end;
$$;

revoke all on function public.ledger_finalize_correction_4a(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, text, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.ledger_finalize_correction_4a(
  uuid, uuid, uuid, uuid, jsonb, uuid, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, text, boolean, boolean, text, text
) to service_role;

notify pgrst, 'reload schema';
