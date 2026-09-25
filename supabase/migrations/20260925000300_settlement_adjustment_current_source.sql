create or replace function public.ledger_adjustment_source_current_7_2c(
  target_root uuid,
  source_cutoff timestamptz
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  root public.settlements%rowtype;
  source_value jsonb;
  current_expenses jsonb;
begin
  select * into root from public.settlements
  where id = target_root and settlement_kind = 'ROOT';
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if source_cutoff is null or source_cutoff < root.through_timestamp
     or source_cutoff > clock_timestamp() + interval '5 minutes' then
    raise exception 'SETTLEMENT_INPUT_STALE';
  end if;

  source_value := public.ledger_settlement_source_7_1(root.journey_id, source_cutoff);
  select coalesce(jsonb_agg(expense.value order by expense.value ->> 'id'), '[]'::jsonb)
    into current_expenses
  from jsonb_array_elements(source_value -> 'expenses') expense(value)
  where not exists (
    select 1 from public.expense_correction_successors correction
    where correction.root_settlement_id = target_root
      and correction.source_expense_id = (expense.value ->> 'id')::uuid
  );
  source_value := jsonb_set(source_value, '{expenses}', current_expenses);
  source_value := jsonb_set(source_value, '{settlementCurrency}', to_jsonb(root.settlement_currency));
  source_value := jsonb_set(source_value, '{settlementScale}', to_jsonb(root.settlement_scale));
  source_value := jsonb_set(source_value, '{settingsRevision}', to_jsonb(root.settings_revision));
  return source_value;
end;
$$;

revoke all on function public.ledger_adjustment_source_current_7_2c(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ledger_adjustment_source_current_7_2c(uuid, timestamptz)
  to service_role;

create or replace function public.ledger_finalize_adjustment_7_2b(
  actor_user uuid,
  target_journey uuid,
  target_root uuid,
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
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  root public.settlements%rowtype;
  head public.settlements%rowtype;
  actor_member uuid;
  existing public.ledger_idempotency_keys%rowtype;
  adjustment_id uuid := gen_random_uuid();
  next_sequence integer;
  source_cutoff timestamptz;
  current_source jsonb;
  delta_value jsonb;
  input_value jsonb;
  transfer_value jsonb;
  response_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_root::text, 0));

  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'FINALIZE_ADJUSTMENT'
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

  select jm.id into actor_member from public.journey_members jm
  where jm.trip_id = target_journey and jm.user_id = actor_user
    and jm.status = 'linked' and jm.role = 'owner'
  order by jm.created_at asc limit 1;
  if actor_member is null then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;
  if nullif(trim(reason_value), '') is null then raise exception 'REASON_REQUIRED'; end if;

  select * into head from public.settlements
  where root_settlement_id = target_root and settlement_kind = 'ADJUSTMENT'
  order by lineage_sequence desc limit 1 for update;
  if head.id is distinct from expected_head then raise exception 'SETTLEMENT_INPUT_STALE'; end if;
  if input_digest_value <> computed_input_digest_value then
    raise exception 'SETTLEMENT_INPUT_STALE';
  end if;
  if blocked_value then raise exception 'FINANCIAL_INVARIANT_FAILED'; end if;
  if head.id is not null and head.input_digest <> prior_input_digest_value then
    raise exception 'SETTLEMENT_INPUT_STALE';
  end if;
  if computed_input_digest_value = prior_input_digest_value then
    raise exception 'ADJUSTMENT_NOT_REQUIRED';
  end if;
  if jsonb_array_length(transfers_value) = 0 and not allow_zero_transfer then
    raise exception 'ZERO_TRANSFER_ACK_REQUIRED';
  end if;

  source_cutoff := (expected_source_value ->> 'throughTimestamp')::timestamptz;
  if source_cutoff is null then raise exception 'SETTLEMENT_INPUT_STALE'; end if;
  perform 1 from public.journey_members where trip_id = target_journey for update;
  perform 1 from public.expenses
  where journey_id = target_journey and occurred_at <= source_cutoff
  for update;
  if source_cutoff = root.through_timestamp then
    -- Preserve the existing root-cutoff correction successor contract.
    if public.ledger_adjustment_source_7_2b(target_root) <> expected_source_value then
      raise exception 'SETTLEMENT_INPUT_STALE';
    end if;
  else
    if public.ledger_adjustment_source_current_7_2c(target_root, source_cutoff)
       <> expected_source_value then
      raise exception 'SETTLEMENT_INPUT_STALE';
    end if;
    current_source := public.ledger_adjustment_source_current_7_2c(
      target_root, clock_timestamp()
    );
    if jsonb_set(current_source, '{throughTimestamp}',
        expected_source_value -> 'throughTimestamp') <> expected_source_value then
      raise exception 'SETTLEMENT_INPUT_STALE';
    end if;
  end if;

  next_sequence := coalesce(head.lineage_sequence, 0) + 1;
  insert into public.settlements (
    id, journey_id, settlement_currency, settlement_scale, settings_revision,
    status, through_timestamp, input_digest, algorithm_version, created_by,
    finalized_by, finalized_at, settlement_kind, root_settlement_id,
    parent_adjustment_id, lineage_sequence, prior_input_digest,
    adjustment_reason, eligibility_version
  ) values (
    adjustment_id, target_journey, root.settlement_currency, root.settlement_scale,
    root.settings_revision, 'FINALIZED', source_cutoff,
    computed_input_digest_value, root.algorithm_version, actor_user, actor_user, now(),
    'ADJUSTMENT', target_root, head.id, next_sequence,
    prior_input_digest_value, trim(reason_value), root.eligibility_version
  );

  for input_value in select value from jsonb_array_elements(inputs_value) loop
    insert into public.settlement_inputs (
      settlement_id, journey_id, expense_id, expense_revision,
      valuation_snapshot_id, normalized_snapshot
    ) values (
      adjustment_id, target_journey,
      (input_value ->> 'expenseId')::uuid,
      (input_value ->> 'expenseRevision')::bigint,
      (input_value #>> '{valuation,id}')::uuid,
      input_value
    );
  end loop;

  for delta_value in select value from jsonb_array_elements(deltas_value) loop
    insert into public.settlement_adjustment_deltas (
      settlement_id, journey_id, member_id, display_name_snapshot,
      delta_minor, settlement_currency, settlement_scale
    ) values (
      adjustment_id, target_journey,
      (delta_value ->> 'memberId')::uuid,
      delta_value ->> 'displayNameSnapshot',
      (delta_value ->> 'deltaMinor')::bigint,
      root.settlement_currency, root.settlement_scale
    );
  end loop;
  if (select coalesce(sum((value ->> 'deltaMinor')::bigint), 0)
      from jsonb_array_elements(deltas_value)) <> 0 then
    raise exception 'FINANCIAL_INVARIANT_FAILED';
  end if;

  for transfer_value in select value from jsonb_array_elements(transfers_value) loop
    insert into public.settlement_transfers (
      id, settlement_id, journey_id, from_member_id, to_member_id,
      obligation_amount_minor, settlement_currency, settlement_scale, status
    ) values (
      gen_random_uuid(), adjustment_id, target_journey,
      (transfer_value ->> 'fromMemberId')::uuid,
      (transfer_value ->> 'toMemberId')::uuid,
      (transfer_value #>> '{amount,minor}')::bigint,
      root.settlement_currency, root.settlement_scale, 'OPEN'
    );
  end loop;

  insert into public.settlement_audit_events (
    settlement_id, journey_id, settlement_revision, event_type,
    actor_user_id, actor_member_id, reason, authority, metadata
  ) values (
    adjustment_id, target_journey, 1, 'ADJUSTED', actor_user, actor_member,
    trim(reason_value), 'ORGANIZER_OVERRIDE',
    jsonb_build_object(
      'rootSettlementId', target_root,
      'parentAdjustmentId', head.id,
      'priorInputDigest', prior_input_digest_value,
      'inputDigest', computed_input_digest_value,
      'zeroTransfer', jsonb_array_length(transfers_value) = 0,
      'changedExpenses', changed_expenses_value
    )
  );

  response_value := jsonb_build_object(
    'settlementId', adjustment_id, 'idempotentReplay', false
  );
  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
    response_status, response_body, completed_at
  ) values (
    actor_user, target_journey, 'FINALIZE_ADJUSTMENT', idempotency_key_value,
    payload_hash_value, 200, response_value, now()
  );
  return response_value;
exception when unique_violation then
  raise exception 'SETTLEMENT_INPUT_STALE';
end;
$$;

revoke all on function public.ledger_finalize_adjustment_7_2b(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.ledger_finalize_adjustment_7_2b(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, boolean, boolean, text, text
) to service_role;

notify pgrst, 'reload schema';
