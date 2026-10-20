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
  existing public.ledger_idempotency_keys%rowtype;
  current_expense public.expenses%rowtype;
  entity jsonb := response_body_value -> 'entity';
  valuation jsonb := response_body_value #> '{entity,valuation}';
  audit_event jsonb := response_body_value #> '{entity,auditEvents,-1}';
  actor_member uuid;
  actor_role text;
  reason_required boolean;
  next_revision bigint := base_revision_value + 1;
begin
  select *
    into existing
    from public.ledger_idempotency_keys
   where actor_user_id = actor_user
     and journey_id = target_journey
     and command_type = command_type_value
     and idempotency_key = idempotency_key_value
   for update;

  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select *
    into current_expense
    from public.expenses
   where id = target_expense
     and journey_id = target_journey
   for update;

  if not found then
    raise exception 'ENTITY_NOT_FOUND';
  end if;

  select id, role
    into actor_member, actor_role
    from public.journey_members
   where trip_id = target_journey
     and user_id = actor_user
     and status = 'linked'
   order by role = 'owner' desc, created_at asc
   limit 1;

  if actor_member is null or actor_role not in ('owner', 'group_member') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;

  if current_expense.creator_member_id is distinct from actor_member and actor_role <> 'owner' then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;

  reason_required := current_expense.creator_member_id is distinct from actor_member
    and actor_role = 'owner';
  if reason_required and coalesce(nullif(trim(audit_reason_value), ''), '') = '' then
    raise exception 'ORGANIZER_REASON_REQUIRED';
  end if;

  if current_expense.revision <> base_revision_value then
    raise exception 'REVISION_CONFLICT';
  end if;

  if exists (
    select 1
      from public.settlement_inputs si
      join public.settlements s on s.id = si.settlement_id
     where si.expense_id = target_expense
       and s.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
  ) then
    raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
  end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (
    actor_user, target_journey, command_type_value, idempotency_key_value,
    payload_hash_value
  );

  if command_type_value = 'UPDATE_EXPENSE' then
    update public.expenses
       set updated_by_user_id = actor_user,
           payer_member_id = (entity ->> 'payerMemberId')::uuid,
           title = entity ->> 'title',
           description = entity ->> 'description',
           category = entity ->> 'category',
           occurred_at = (entity ->> 'occurredAt')::timestamptz,
           original_amount_minor = (entity #>> '{original,minor}')::bigint,
           original_currency = entity #>> '{original,currency}',
           original_currency_scale = (entity #>> '{original,scale}')::smallint,
           business_status = entity ->> 'businessStatus',
           deleted_at = null,
           revision = next_revision,
           updated_at = (entity ->> 'updatedAt')::timestamptz
     where id = target_expense;

    delete from public.expense_splits where expense_id = target_expense;
    delete from public.expense_participants where expense_id = target_expense;
    update public.settlement_valuation_snapshots
       set is_active = false
     where expense_id = target_expense
       and is_active = true;

    insert into public.expense_participants (
      expense_id, journey_id, member_id, display_name_snapshot,
      household_id_snapshot, display_order
    )
    select
      target_expense,
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
      target_expense,
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
        target_expense,
        target_journey,
        next_revision,
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
  elsif command_type_value = 'DELETE_EXPENSE' then
    update public.expenses
       set updated_by_user_id = actor_user,
           business_status = 'DELETED',
           deleted_at = (entity ->> 'deletedAt')::timestamptz,
           revision = next_revision,
           updated_at = (entity ->> 'updatedAt')::timestamptz
     where id = target_expense;
  elsif command_type_value = 'RESTORE_EXPENSE' then
    update public.expenses
       set updated_by_user_id = actor_user,
           business_status = entity ->> 'businessStatus',
           deleted_at = null,
           revision = next_revision,
           updated_at = (entity ->> 'updatedAt')::timestamptz
     where id = target_expense;
  else
    raise exception 'INVALID_COMMAND';
  end if;

  insert into public.expense_audit_events (
    id, expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, reason, changed_groups, after_hash
  ) values (
    (audit_event ->> 'id')::uuid,
    target_expense,
    target_journey,
    next_revision,
    audit_event ->> 'eventType',
    actor_user,
    actor_member,
    audit_reason_value,
    array(select jsonb_array_elements_text(audit_event -> 'changedGroups')),
    payload_hash_value
  );

  response_body_value := jsonb_set(
    response_body_value,
    '{entity,creatorMemberId}',
    coalesce(to_jsonb(current_expense.creator_member_id), 'null'::jsonb)
  );
  response_body_value := jsonb_set(
    response_body_value,
    '{entity,auditEvents,-1,actorMemberId}',
    to_jsonb(actor_member)
  );

  update public.ledger_idempotency_keys
     set response_status = 200,
         response_body = response_body_value,
         completed_at = now()
   where actor_user_id = actor_user
     and journey_id = target_journey
     and command_type = command_type_value
     and idempotency_key = idempotency_key_value;

  return response_body_value;
end;
$$;

revoke all on function public.ledger_mutate_expense_4b(uuid, uuid, uuid, text, bigint, text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.ledger_mutate_expense_4b(uuid, uuid, uuid, text, bigint, text, text, text, jsonb)
to service_role;
