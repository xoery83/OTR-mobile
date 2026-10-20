alter table public.settlements
  add column settings_revision bigint not null default 1 check (settings_revision > 0);

alter table public.settlement_inputs
  add column normalized_snapshot jsonb;

alter table public.settlement_member_balances
  add column display_name_snapshot text check (
    display_name_snapshot is null or char_length(display_name_snapshot) between 1 and 200
  );

create unique index settlements_journey_digest_7_1
  on public.settlements(journey_id, input_digest);

create table public.settlement_audit_events (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete cascade,
  settlement_revision bigint not null check (settlement_revision > 0),
  event_type text not null check (event_type in (
    'FINALIZED', 'SUPERSEDED', 'ADJUSTED', 'PAID', 'RECEIVED', 'REJECTED',
    'DISPUTED', 'CORRECTED', 'ORGANIZER_OVERRIDE'
  )),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_member_id uuid not null references public.journey_members(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (journey_id, settlement_id)
    references public.settlements(journey_id, id) on delete restrict
);

create index settlement_audit_events_settlement_revision_7_1
  on public.settlement_audit_events(settlement_id, settlement_revision, created_at);

alter table public.settlement_audit_events enable row level security;
alter table public.settlement_audit_events force row level security;
revoke all on table public.settlement_audit_events from public, anon, authenticated;
grant select, insert, update, delete on table public.settlement_audit_events to service_role;

create trigger settlement_audit_events_immutable_7_1 before update or delete
on public.settlement_audit_events for each row
execute function public.ledger_reject_immutable_change();

create or replace function public.ledger_settlement_source_7_1(
  target_journey uuid,
  through_timestamp_value timestamptz
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  settings public.ledger_settings%rowtype;
  source_value jsonb;
begin
  select * into settings from public.ledger_settings
  where journey_id = target_journey;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;

  select jsonb_build_object(
    'journeyId', target_journey,
    'throughTimestamp', to_jsonb(through_timestamp_value),
    'settlementCurrency', settings.settlement_currency,
    'settlementScale', settings.settlement_scale,
    'settingsRevision', settings.revision,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberId', jm.id,
        'displayNameSnapshot', jm.display_name
      ) order by jm.id)
      from public.journey_members jm where jm.trip_id = target_journey
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'revision', e.revision,
        'occurredAt', e.occurred_at,
        'businessStatus', e.business_status,
        'hasOpenConflict', exists (
          select 1 from public.ledger_idempotency_keys conflict
          where conflict.journey_id = target_journey
            and conflict.response_status = 409
            and conflict.response_body #>> '{error,code}' = 'REVISION_CONFLICT'
            and conflict.response_body #>> '{error,expenseId}' = e.id::text
            and not exists (
              select 1 from public.expense_conflict_resolutions resolution
              where resolution.conflict_id = conflict.id
            )
        ),
        'payerMemberId', e.payer_member_id,
        'original', jsonb_build_object(
          'minor', e.original_amount_minor,
          'currency', e.original_currency,
          'scale', e.original_currency_scale
        ),
        'participants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'memberId', ep.member_id,
            'displayNameSnapshot', ep.display_name_snapshot
          ) order by ep.member_id)
          from public.expense_participants ep where ep.expense_id = e.id
        ), '[]'::jsonb),
        'splits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'memberId', es.member_id,
            'method', es.split_method,
            'originalMinor', es.original_amount_minor,
            'settlementMinor', es.settlement_amount_minor,
            'weightUnits', es.weight_units,
            'percentageUnits', es.percentage_units,
            'roundingAdjustmentMinor', es.rounding_adjustment_minor
          ) order by es.member_id)
          from public.expense_splits es where es.expense_id = e.id
        ), '[]'::jsonb),
        'valuation', case when valuation.id is null then null else jsonb_build_object(
          'id', valuation.id,
          'policy', valuation.policy,
          'original', jsonb_build_object(
            'minor', valuation.original_amount_minor,
            'currency', valuation.original_currency,
            'scale', valuation.original_scale
          ),
          'settlement', jsonb_build_object(
            'minor', valuation.settlement_amount_minor,
            'currency', valuation.settlement_currency,
            'scale', valuation.settlement_scale
          ),
          'rateSnapshotId', valuation.rate_snapshot_id,
          'paymentRecordId', valuation.payment_record_id,
          'reason', valuation.reason,
          'decimalRate', valuation.decimal_rate,
          'roundingMode', valuation.rounding_mode,
          'effectiveAt', valuation.effective_at,
          'supersedesValuationId', valuation.supersedes_valuation_id
        ) end
      ) order by e.id)
      from public.expenses e
      left join public.settlement_valuation_snapshots valuation
        on valuation.expense_id = e.id and valuation.is_active
      where e.journey_id = target_journey
        and e.occurred_at <= through_timestamp_value
    ), '[]'::jsonb)
  ) into source_value;

  return source_value;
end;
$$;

revoke all on function public.ledger_settlement_source_7_1(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ledger_settlement_source_7_1(uuid, timestamptz)
  to service_role;

create or replace function public.ledger_finalize_settlement_7_1(
  actor_user uuid,
  target_journey uuid,
  through_timestamp_value timestamptz,
  input_digest_value text,
  expected_source_value jsonb,
  inputs_value jsonb,
  balances_value jsonb,
  transfers_value jsonb,
  idempotency_key_value text,
  payload_hash_value text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  actor_member uuid;
  existing public.ledger_idempotency_keys%rowtype;
  existing_settlement uuid;
  settlement_id_value uuid := gen_random_uuid();
  audit_id_value uuid := gen_random_uuid();
  input_value jsonb;
  balance_value jsonb;
  transfer_value jsonb;
  response_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_journey::text, 0));

  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'FINALIZE_SETTLEMENT'
    and idempotency_key = idempotency_key_value;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select jm.id into actor_member from public.journey_members jm
  where jm.trip_id = target_journey and jm.user_id = actor_user
    and jm.status = 'linked' and jm.role = 'owner'
  order by jm.created_at asc limit 1;
  if actor_member is null then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;

  perform 1 from public.ledger_settings
  where journey_id = target_journey for update;
  perform 1 from public.journey_members
  where trip_id = target_journey for update;
  perform 1 from public.expenses
  where journey_id = target_journey and occurred_at <= through_timestamp_value
  for update;

  if public.ledger_settlement_source_7_1(
    target_journey, through_timestamp_value
  ) <> expected_source_value then
    raise exception 'SETTLEMENT_INPUT_STALE';
  end if;

  select s.id into existing_settlement from public.settlements s
  where s.journey_id = target_journey and s.input_digest = input_digest_value;
  if existing_settlement is not null then
    response_value := jsonb_build_object(
      'settlementId', existing_settlement,
      'idempotentReplay', true
    );
  else
    insert into public.settlements (
      id, journey_id, settlement_currency, settlement_scale, settings_revision,
      status, through_timestamp, input_digest, algorithm_version, created_by,
      finalized_by, finalized_at
    ) values (
      settlement_id_value, target_journey,
      expected_source_value ->> 'settlementCurrency',
      (expected_source_value ->> 'settlementScale')::smallint,
      (expected_source_value ->> 'settingsRevision')::bigint,
      'FINALIZED', through_timestamp_value, input_digest_value,
      'ledger-settlement-greedy-v1', actor_user, actor_user, now()
    );

    for input_value in select value from jsonb_array_elements(inputs_value) loop
      insert into public.settlement_inputs (
        settlement_id, journey_id, expense_id, expense_revision,
        valuation_snapshot_id, normalized_snapshot
      ) values (
        settlement_id_value, target_journey,
        (input_value ->> 'expenseId')::uuid,
        (input_value ->> 'expenseRevision')::bigint,
        (input_value #>> '{valuation,id}')::uuid,
        input_value
      );
    end loop;

    for balance_value in select value from jsonb_array_elements(balances_value) loop
      insert into public.settlement_member_balances (
        settlement_id, journey_id, member_id, display_name_snapshot,
        paid_minor, owed_minor, transferred_minor, net_minor
      ) values (
        settlement_id_value, target_journey,
        (balance_value ->> 'memberId')::uuid,
        balance_value ->> 'displayNameSnapshot',
        (balance_value ->> 'paidMinor')::bigint,
        (balance_value ->> 'owedMinor')::bigint,
        0,
        (balance_value ->> 'netMinor')::bigint
      );
    end loop;

    for transfer_value in select value from jsonb_array_elements(transfers_value) loop
      insert into public.settlement_transfers (
        id, settlement_id, journey_id, from_member_id, to_member_id,
        obligation_amount_minor, settlement_currency, settlement_scale, status
      ) values (
        gen_random_uuid(), settlement_id_value, target_journey,
        (transfer_value ->> 'fromMemberId')::uuid,
        (transfer_value ->> 'toMemberId')::uuid,
        (transfer_value #>> '{amount,minor}')::bigint,
        transfer_value #>> '{amount,currency}',
        (transfer_value #>> '{amount,scale}')::smallint,
        'OPEN'
      );
    end loop;

    insert into public.settlement_audit_events (
      id, settlement_id, journey_id, settlement_revision, event_type,
      actor_user_id, actor_member_id, metadata
    ) values (
      audit_id_value, settlement_id_value, target_journey, 1, 'FINALIZED',
      actor_user, actor_member, jsonb_build_object('inputDigest', input_digest_value)
    );
    response_value := jsonb_build_object(
      'settlementId', settlement_id_value,
      'idempotentReplay', false
    );
  end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
    response_status, response_body, completed_at
  ) values (
    actor_user, target_journey, 'FINALIZE_SETTLEMENT', idempotency_key_value,
    payload_hash_value, 200, response_value, now()
  );
  return response_value;
end;
$$;

revoke all on function public.ledger_finalize_settlement_7_1(
  uuid, uuid, timestamptz, text, jsonb, jsonb, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.ledger_finalize_settlement_7_1(
  uuid, uuid, timestamptz, text, jsonb, jsonb, jsonb, jsonb, text, text
) to service_role;

notify pgrst, 'reload schema';
