alter table public.settlements
  add column settlement_kind text not null default 'ROOT'
    check (settlement_kind in ('ROOT', 'ADJUSTMENT')),
  add column root_settlement_id uuid references public.settlements(id) on delete restrict,
  add column parent_adjustment_id uuid references public.settlements(id) on delete restrict,
  add column lineage_sequence integer not null default 0 check (lineage_sequence >= 0),
  add column prior_input_digest text,
  add column adjustment_reason text check (
    adjustment_reason is null or char_length(trim(adjustment_reason)) between 1 and 2000
  ),
  add column eligibility_version text not null default 'ledger-settlement-eligibility-v1',
  add constraint settlements_adjustment_shape_7_2b check (
    (settlement_kind = 'ROOT' and root_settlement_id is null
      and parent_adjustment_id is null and lineage_sequence = 0
      and prior_input_digest is null and adjustment_reason is null)
    or
    (settlement_kind = 'ADJUSTMENT' and root_settlement_id is not null
      and root_settlement_id <> id and lineage_sequence > 0
      and prior_input_digest ~ '^[a-f0-9]{64}$' and adjustment_reason is not null)
  );

drop index public.settlements_one_active_7_1;
create unique index settlements_one_root_7_2b
  on public.settlements(journey_id)
  where settlement_kind = 'ROOT'
    and status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
    and algorithm_version = 'ledger-settlement-greedy-v1';

drop index public.settlements_journey_digest_7_1;
create unique index settlements_root_digest_7_2b
  on public.settlements(journey_id, input_digest)
  where settlement_kind = 'ROOT';
create unique index settlements_adjustment_sequence_7_2b
  on public.settlements(root_settlement_id, lineage_sequence)
  where settlement_kind = 'ADJUSTMENT';
create unique index settlements_first_adjustment_7_2b
  on public.settlements(root_settlement_id)
  where settlement_kind = 'ADJUSTMENT' and parent_adjustment_id is null;
create unique index settlements_adjustment_successor_7_2b
  on public.settlements(parent_adjustment_id)
  where settlement_kind = 'ADJUSTMENT' and parent_adjustment_id is not null;

create table public.settlement_adjustment_deltas (
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.journey_members(id) on delete restrict,
  display_name_snapshot text not null check (
    char_length(display_name_snapshot) between 1 and 200
  ),
  delta_minor bigint not null,
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (settlement_id, member_id),
  foreign key (journey_id, settlement_id)
    references public.settlements(journey_id, id) on delete restrict
);

alter table public.settlement_adjustment_deltas enable row level security;
alter table public.settlement_adjustment_deltas force row level security;
revoke all on table public.settlement_adjustment_deltas from public, anon, authenticated;
grant select, insert, update, delete on table public.settlement_adjustment_deltas
  to service_role;
create trigger settlement_adjustment_deltas_immutable_7_2b before update or delete
on public.settlement_adjustment_deltas for each row
execute function public.ledger_reject_immutable_change();

create or replace function public.ledger_guard_settlement_lineage_7_2b()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Settlement lineage is immutable'; end if;
  if new.id <> old.id
     or new.journey_id <> old.journey_id
     or new.settlement_currency <> old.settlement_currency
     or new.settlement_scale <> old.settlement_scale
     or new.settings_revision <> old.settings_revision
     or new.through_timestamp <> old.through_timestamp
     or new.input_digest <> old.input_digest
     or new.algorithm_version <> old.algorithm_version
     or new.settlement_kind <> old.settlement_kind
     or new.root_settlement_id is distinct from old.root_settlement_id
     or new.parent_adjustment_id is distinct from old.parent_adjustment_id
     or new.lineage_sequence <> old.lineage_sequence
     or new.prior_input_digest is distinct from old.prior_input_digest
     or new.adjustment_reason is distinct from old.adjustment_reason
     or new.eligibility_version <> old.eligibility_version then
    raise exception 'Settlement lineage is immutable';
  end if;
  return new;
end;
$$;

create trigger settlements_lineage_immutable_7_2b before update or delete
on public.settlements for each row
execute function public.ledger_guard_settlement_lineage_7_2b();

create or replace function public.ledger_lock_adjustment_lineage_7_2b()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_journey uuid := coalesce(new.journey_id, old.journey_id);
  root_id uuid;
begin
  select id into root_id from public.settlements
  where journey_id = target_journey and settlement_kind = 'ROOT'
    and status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
  limit 1;
  if root_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(root_id::text, 0));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger expenses_adjustment_lineage_lock_7_2b
before insert or update or delete on public.expenses for each row
execute function public.ledger_lock_adjustment_lineage_7_2b();

create or replace function public.ledger_touch_adjustment_readiness_7_2b()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  conflict public.ledger_idempotency_keys%rowtype;
  target_journey uuid;
  target_expense uuid;
begin
  if tg_table_name = 'ledger_idempotency_keys' then
    if new.response_status is distinct from 409
       or coalesce(new.response_body #>> '{error,code}', '') <> 'REVISION_CONFLICT' then
      return new;
    end if;
    conflict := new;
  else
    select * into conflict from public.ledger_idempotency_keys
    where id = new.conflict_id;
  end if;
  target_journey := conflict.journey_id;
  target_expense := nullif(conflict.response_body #>> '{error,expenseId}', '')::uuid;
  update public.settlements root
  set revision = revision + 1, updated_at = now()
  where root.journey_id = target_journey and root.settlement_kind = 'ROOT'
    and root.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
    and exists (
      select 1 from public.expenses expense
      where expense.id = target_expense
        and expense.occurred_at <= root.through_timestamp
    );
  return new;
end;
$$;

create trigger ledger_conflict_adjustment_readiness_7_2b
after insert on public.ledger_idempotency_keys for each row
execute function public.ledger_touch_adjustment_readiness_7_2b();
create trigger ledger_conflict_resolution_adjustment_readiness_7_2b
after insert on public.expense_conflict_resolutions for each row
execute function public.ledger_touch_adjustment_readiness_7_2b();

create or replace function public.ledger_adjustment_source_7_2b(
  target_root uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  root public.settlements%rowtype;
  source_value jsonb;
begin
  select * into root from public.settlements
  where id = target_root and settlement_kind = 'ROOT';
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;

  source_value := public.ledger_settlement_source_7_1(
    root.journey_id, root.through_timestamp
  );
  source_value := jsonb_set(source_value, '{throughTimestamp}', to_jsonb(root.through_timestamp));
  source_value := jsonb_set(source_value, '{settlementCurrency}', to_jsonb(root.settlement_currency));
  source_value := jsonb_set(source_value, '{settlementScale}', to_jsonb(root.settlement_scale));
  source_value := jsonb_set(source_value, '{settingsRevision}', to_jsonb(root.settings_revision));
  return source_value;
end;
$$;

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
)
returns jsonb
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

  perform 1 from public.journey_members where trip_id = target_journey for update;
  perform 1 from public.expenses
  where journey_id = target_journey and occurred_at <= root.through_timestamp
  for update;
  if public.ledger_adjustment_source_7_2b(target_root) <> expected_source_value then
    raise exception 'SETTLEMENT_INPUT_STALE';
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
    root.settings_revision, 'FINALIZED', root.through_timestamp,
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

create or replace function public.ledger_validate_adjustment_delta_7_2b()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_id uuid := coalesce(new.settlement_id, old.settlement_id);
  total bigint;
begin
  select coalesce(sum(delta_minor), 0) into total
  from public.settlement_adjustment_deltas where settlement_id = target_id;
  if total <> 0 then raise exception 'Adjustment delta must net to zero'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create constraint trigger settlement_adjustment_delta_zero_7_2b
after insert or update or delete on public.settlement_adjustment_deltas
deferrable initially deferred for each row
execute function public.ledger_validate_adjustment_delta_7_2b();

revoke all on function public.ledger_guard_settlement_lineage_7_2b()
  from public, anon, authenticated;
revoke all on function public.ledger_adjustment_source_7_2b(uuid)
  from public, anon, authenticated;
revoke all on function public.ledger_finalize_adjustment_7_2b(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, boolean, boolean, text, text
) from public, anon, authenticated;
revoke all on function public.ledger_validate_adjustment_delta_7_2b()
  from public, anon, authenticated;
grant execute on function public.ledger_guard_settlement_lineage_7_2b()
  to service_role;
revoke all on function public.ledger_lock_adjustment_lineage_7_2b()
  from public, anon, authenticated;
grant execute on function public.ledger_lock_adjustment_lineage_7_2b()
  to service_role;
revoke all on function public.ledger_touch_adjustment_readiness_7_2b()
  from public, anon, authenticated;
grant execute on function public.ledger_touch_adjustment_readiness_7_2b()
  to service_role;
grant execute on function public.ledger_adjustment_source_7_2b(uuid)
  to service_role;
grant execute on function public.ledger_finalize_adjustment_7_2b(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, boolean, boolean, text, text
) to service_role;
grant execute on function public.ledger_validate_adjustment_delta_7_2b()
  to service_role;

notify pgrst, 'reload schema';


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

create or replace function public.ledger_propose_correction_4c(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  correction_id_value uuid,
  base_revision_value bigint,
  proposed_aggregate_value jsonb,
  reason_value text,
  changed_groups_value text[],
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
  current_expense public.expenses%rowtype;
  actor_member uuid;
  request_status text;
  command_name text := 'PROPOSE_EXPENSE_CORRECTION';
begin
  select * into existing from public.ledger_idempotency_keys
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into current_expense from public.expenses
   where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if current_expense.business_status = 'DELETED' then raise exception 'ENTITY_NOT_FOUND'; end if;
  select id into actor_member from public.journey_members
   where trip_id = target_journey and user_id = actor_user and status = 'linked'
     and role in ('owner', 'group_member')
   order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or actor_member = current_expense.creator_member_id then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  request_status := case when current_expense.revision = base_revision_value then 'OPEN' else 'STALE' end;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, command_name, idempotency_key_value, payload_hash_value);
  insert into public.expense_correction_requests (
    id, expense_id, journey_id, base_expense_revision, proposed_aggregate,
    reason, status, requested_by, requested_by_member_id, changed_groups,
    resolved_at
  ) values (
    correction_id_value, target_expense, target_journey, base_revision_value,
    proposed_aggregate_value, reason_value, request_status, actor_user,
    actor_member, changed_groups_value,
    case when request_status = 'STALE' then now() else null end
  );
  response_body_value := jsonb_set(response_body_value, '{correction,status}', to_jsonb(request_status));
  response_body_value := jsonb_set(response_body_value, '{correction,requestedByMemberId}', to_jsonb(actor_member));
  update public.ledger_idempotency_keys set response_status = 201,
    response_body = response_body_value, completed_at = now()
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;

create or replace function public.ledger_apply_valuation_5_1(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  idempotency_key_value text,
  payload_hash_value text,
  valuation_value jsonb,
  rate_snapshot_value jsonb,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  expense public.expenses%rowtype;
  settings public.ledger_settings%rowtype;
  actor_member uuid;
  actor_role text;
  expected_minor bigint;
  supplied_minor bigint := (valuation_value #>> '{previewSettlement,minor}')::bigint;
  rate numeric;
  payment public.payment_records%rowtype;
  quote public.ledger_rate_quotes%rowtype;
  next_revision bigint;
begin
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'APPLY_VALUATION' and idempotency_key = idempotency_key_value
  for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into expense from public.expenses where id = target_expense
    and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if expense.revision <> (valuation_value ->> 'baseRevision')::bigint then
    raise exception 'REVISION_CONFLICT';
  end if;
  if expense.business_status = 'DELETED' then raise exception 'INVALID_VALUATION'; end if;  select * into settings from public.ledger_settings where journey_id = target_journey;
  select id, role into actor_member, actor_role from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
  order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or (actor_member <> expense.creator_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if actor_member <> expense.creator_member_id and actor_role = 'owner'
    and coalesce(nullif(trim(valuation_value ->> 'reason'), ''), '') = '' then
    raise exception 'ORGANIZER_REASON_REQUIRED';
  end if;
  if valuation_value #>> '{previewSettlement,currency}' <> settings.settlement_currency
    or (valuation_value #>> '{previewSettlement,scale}')::smallint <> settings.settlement_scale then
    raise exception 'INVALID_VALUATION';
  end if;

  case valuation_value ->> 'policy'
    when 'SAME_CURRENCY' then
      if expense.original_currency <> settings.settlement_currency
        or expense.original_currency_scale <> settings.settlement_scale then
        raise exception 'INVALID_VALUATION';
      end if;
      rate := 1;
      expected_minor := expense.original_amount_minor;
    when 'REFERENCE_RATE' then
      select * into quote from public.ledger_rate_quotes
      where id = (valuation_value ->> 'rateQuoteId')::uuid and journey_id = target_journey
        and quote_currency = expense.original_currency
        and base_currency = settings.settlement_currency;
      if not found then raise exception 'RATE_REQUIRED'; end if;
      if quote.expires_at < now() and coalesce(nullif(trim(valuation_value ->> 'reason'), ''), '') = '' then
        raise exception 'STALE_RATE_REASON_REQUIRED';
      end if;
      rate := quote.decimal_rate;
      expected_minor := round(expense.original_amount_minor * rate
        * power(10::numeric, settings.settlement_scale - expense.original_currency_scale));
    when 'MANUAL_AGREED' then
      if coalesce(nullif(trim(valuation_value ->> 'reason'), ''), '') = '' then
        raise exception 'MANUAL_REASON_REQUIRED';
      end if;
      rate := (valuation_value ->> 'manualRate')::numeric;
      if rate <= 0 then raise exception 'INVALID_VALUATION'; end if;
      expected_minor := round(expense.original_amount_minor * rate
        * power(10::numeric, settings.settlement_scale - expense.original_currency_scale));
    when 'ACTUAL_PAYER_COST' then
      select * into payment from public.payment_records p
      where p.id = (valuation_value ->> 'paymentRecordId')::uuid
        and p.expense_id = target_expense and p.posted_amount_minor is not null
        and p.posted_currency = settings.settlement_currency and p.posted_scale = settings.settlement_scale
        and not exists (select 1 from public.payment_records n
          where n.supersedes_payment_record_id = p.id);
      if not found then raise exception 'INVALID_PAYMENT_RECORD'; end if;
      expected_minor := payment.posted_amount_minor;
    else raise exception 'INVALID_VALUATION';
  end case;
  if expected_minor <> supplied_minor then raise exception 'VALUATION_PREVIEW_MISMATCH'; end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, 'APPLY_VALUATION', idempotency_key_value, payload_hash_value);
  next_revision := expense.revision + 1;
  update public.settlement_valuation_snapshots set is_active = false
    where expense_id = target_expense and is_active;
  if rate_snapshot_value <> 'null'::jsonb then
    insert into public.exchange_rate_snapshots (
      id, expense_id, journey_id, expense_revision, base_currency, quote_currency,
      decimal_rate, effective_date, source, provenance, observed_at,
      provider_reference, manual_reason, staleness_state,
      created_by
    ) values (
      (rate_snapshot_value ->> 'id')::uuid, target_expense, target_journey,
      next_revision, settings.settlement_currency, expense.original_currency,
      (rate_snapshot_value ->> 'decimalRate')::numeric,
      (rate_snapshot_value ->> 'effectiveDate')::date,
      rate_snapshot_value ->> 'provider', '{}'::jsonb,
      (rate_snapshot_value ->> 'observedAt')::timestamptz,
      rate_snapshot_value ->> 'providerReference', valuation_value ->> 'reason',
      rate_snapshot_value ->> 'stalenessState',
      actor_user
    );
  end if;
  insert into public.settlement_valuation_snapshots (
    id, expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, settlement_currency, settlement_scale,
    rate_snapshot_id, payment_record_id, reason, is_active, created_by,
    decimal_rate, rounding_mode, effective_at, supersedes_valuation_id
  ) values (
    (response_body_value #>> '{entity,valuation,id}')::uuid, target_expense,
    target_journey, next_revision, valuation_value ->> 'policy',
    expense.original_amount_minor, expense.original_currency, expense.original_currency_scale,
    supplied_minor, settings.settlement_currency, settings.settlement_scale,
    nullif(response_body_value #>> '{entity,valuation,rateSnapshotId}', '')::uuid,
    nullif(valuation_value ->> 'paymentRecordId', '')::uuid,
    valuation_value ->> 'reason', true, actor_user, rate, 'HALF_UP', now(),
    nullif(response_body_value #>> '{entity,valuation,supersedesValuationId}', '')::uuid
  );
  update public.expense_splits s set settlement_amount_minor =
    (item.value ->> 'settlementMinor')::bigint
  from jsonb_array_elements(response_body_value #> '{entity,splits}') item
  where s.expense_id = target_expense and s.member_id = (item.value ->> 'memberId')::uuid;
  update public.expenses set business_status = 'ACCEPTED', updated_by_user_id = actor_user
    where id = target_expense;
  insert into public.expense_audit_events (
    id, expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, reason, changed_groups, after_hash
  ) values (
    (response_body_value #>> '{entity,auditEvents,-1,id}')::uuid,
    target_expense, target_journey, next_revision, 'VALUATION_APPLIED', actor_user,
    actor_member, valuation_value ->> 'reason', array['FINANCIAL_CORE'], payload_hash_value
  );
  update public.ledger_idempotency_keys set response_status = 200,
    response_body = response_body_value, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'APPLY_VALUATION' and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;

notify pgrst, 'reload schema';
