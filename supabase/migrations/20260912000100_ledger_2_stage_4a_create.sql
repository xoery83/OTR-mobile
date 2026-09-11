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
  existing public.ledger_idempotency_keys%rowtype;
  entity jsonb := response_body_value -> 'entity';
  valuation jsonb := response_body_value #> '{entity,valuation}';
  actor_member uuid;
  occurred timestamptz := (response_body_value #>> '{entity,occurredAt}')::timestamptz;
begin
  select *
    into existing
    from public.ledger_idempotency_keys
   where actor_user_id = actor_user
     and journey_id = target_journey
     and command_type = 'CREATE_EXPENSE'
     and idempotency_key = idempotency_key_value
   for update;

  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  if exists (
    select 1
      from public.settlements
     where journey_id = target_journey
       and status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
       and through_timestamp >= occurred
  ) then
    raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
  end if;

  select id
    into actor_member
    from public.journey_members
   where trip_id = target_journey
     and user_id = actor_user
     and status = 'linked'
   order by role = 'owner' desc, created_at asc
   limit 1;

  response_body_value := jsonb_set(
    response_body_value,
    '{entity,creatorMemberId}',
    coalesce(to_jsonb(actor_member), 'null'::jsonb)
  );

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (
    actor_user, target_journey, 'CREATE_EXPENSE', idempotency_key_value,
    payload_hash_value
  );

  insert into public.expenses (
    id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
    payer_member_id, title, description, category, occurred_at,
    original_amount_minor, original_currency, original_currency_scale,
    business_status, revision, created_at, updated_at
  ) values (
    (entity ->> 'id')::uuid,
    target_journey,
    actor_member,
    actor_user,
    actor_user,
    (entity ->> 'payerMemberId')::uuid,
    entity ->> 'title',
    entity ->> 'description',
    entity ->> 'category',
    occurred,
    (entity #>> '{original,minor}')::bigint,
    entity #>> '{original,currency}',
    (entity #>> '{original,scale}')::smallint,
    entity ->> 'businessStatus',
    1,
    (entity ->> 'createdAt')::timestamptz,
    (entity ->> 'updatedAt')::timestamptz
  );

  insert into public.expense_participants (
    expense_id, journey_id, member_id, display_name_snapshot,
    household_id_snapshot, display_order
  )
  select
    (entity ->> 'id')::uuid,
    target_journey,
    (participant.value ->> 'memberId')::uuid,
    participant.value ->> 'displayNameSnapshot',
    nullif(participant.value ->> 'householdIdSnapshot', '')::uuid,
    participant.ordinality::integer - 1
  from jsonb_array_elements(entity -> 'participants') with ordinality as participant(value, ordinality);

  insert into public.expense_splits (
    expense_id, journey_id, member_id, split_method, original_amount_minor,
    settlement_amount_minor, weight_units, percentage_units, rounding_adjustment_minor
  )
  select
    (entity ->> 'id')::uuid,
    target_journey,
    (split.value ->> 'memberId')::uuid,
    split.value ->> 'method',
    (split.value ->> 'originalMinor')::bigint,
    nullif(split.value ->> 'settlementMinor', '')::bigint,
    nullif(split.value ->> 'weightUnits', '')::integer,
    nullif(split.value ->> 'percentageUnits', '')::integer,
    (split.value ->> 'roundingAdjustmentMinor')::integer
  from jsonb_array_elements(entity -> 'splits') as split(value);

  if valuation <> 'null'::jsonb then
    insert into public.settlement_valuation_snapshots (
      id, expense_id, journey_id, expense_revision, policy,
      original_amount_minor, original_currency, original_scale,
      settlement_amount_minor, settlement_currency, settlement_scale,
      rate_snapshot_id, payment_record_id, reason, is_active, created_by,
      created_at
    ) values (
      (valuation ->> 'id')::uuid,
      (entity ->> 'id')::uuid,
      target_journey,
      1,
      valuation ->> 'policy',
      (valuation #>> '{original,minor}')::bigint,
      valuation #>> '{original,currency}',
      (valuation #>> '{original,scale}')::smallint,
      (valuation #>> '{settlement,minor}')::bigint,
      valuation #>> '{settlement,currency}',
      (valuation #>> '{settlement,scale}')::smallint,
      nullif(valuation ->> 'rateSnapshotId', '')::uuid,
      nullif(valuation ->> 'paymentRecordId', '')::uuid,
      valuation ->> 'reason',
      true,
      actor_user,
      (entity ->> 'updatedAt')::timestamptz
    );
  end if;

  insert into public.expense_audit_events (
    expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, changed_groups, after_hash
  ) values (
    (entity ->> 'id')::uuid,
    target_journey,
    1,
    'CREATED',
    actor_user,
    actor_member,
    array['FINANCIAL_CORE', 'DESCRIPTIVE'],
    payload_hash_value
  );

  update public.ledger_idempotency_keys
     set response_status = 201,
         response_body = response_body_value,
         completed_at = now()
   where actor_user_id = actor_user
     and journey_id = target_journey
     and command_type = 'CREATE_EXPENSE'
     and idempotency_key = idempotency_key_value;

  return response_body_value;
end;
$$;

revoke all on function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.ledger_create_expense_4a(uuid, uuid, text, text, jsonb)
to service_role;
