begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(23);
set local role service_role;

update public.journey_members set role = 'owner', status = 'linked'
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
);
insert into public.settlements (
  id, journey_id, settlement_currency, settlement_scale, settings_revision,
  status, through_timestamp, input_digest, algorithm_version, created_by,
  finalized_by, finalized_at
) values (
  '70000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 1, 'FINALIZED',
  '2026-09-12T00:00:00Z', repeat('7', 64), 'ledger-settlement-greedy-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', now()
);
insert into public.settlement_member_balances (
  settlement_id, journey_id, member_id, display_name_snapshot,
  paid_minor, owed_minor, net_minor
)
select '70000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001', id, display_name,
  case when user_id = '00000000-0000-4000-8000-000000000001' then 100 else 0 end,
  case when user_id = '00000000-0000-4000-8000-000000000002' then 100 else 0 end,
  case when user_id = '00000000-0000-4000-8000-000000000001' then 100 else -100 end
from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id in (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002'
  );

create temporary table stage72b_source as
select public.ledger_adjustment_source_7_2b(
  '70000000-0000-4000-8000-000000000003'
) value;
create temporary table stage72b_vectors as select
  jsonb_build_array(
    jsonb_build_object(
      'memberId', (select id from public.journey_members where trip_id = '10000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000001'),
      'displayNameSnapshot', 'Synthetic Owner', 'deltaMinor', -30
    ),
    jsonb_build_object(
      'memberId', (select id from public.journey_members where trip_id = '10000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000002'),
      'displayNameSnapshot', 'Synthetic Member', 'deltaMinor', 30
    )
  ) deltas,
  jsonb_build_array(jsonb_build_object(
    'fromMemberId', (select id from public.journey_members where trip_id = '10000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000001'),
    'toMemberId', (select id from public.journey_members where trip_id = '10000000-0000-4000-8000-000000000001' and user_id = '00000000-0000-4000-8000-000000000002'),
    'amount', jsonb_build_object('minor', 30, 'currency', 'NZD', 'scale', 2)
  )) transfers;

select is(
  public.ledger_adjustment_source_7_2b('70000000-0000-4000-8000-000000000003') #>> '{throughTimestamp}',
  '2026-09-12T00:00:00+00:00',
  'Adjustment source preserves the root cutoff'
);
select throws_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003', null,
    repeat('b', 64), repeat('b', 64), repeat('a', 64),
    (select value from stage72b_source), '[]',
    (select deltas from stage72b_vectors), (select transfers from stage72b_vectors),
    '[]', '', false, false, 'missing-reason', 'missing-reason-hash'
  )
$$, 'P0001', 'REASON_REQUIRED', 'every Adjustment requires a reason');

select lives_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003', null,
    repeat('b', 64), repeat('b', 64), repeat('a', 64),
    (select value from stage72b_source), '[]',
    (select deltas from stage72b_vectors), (select transfers from stage72b_vectors),
    '[]', 'Expense correction', false, false, 'adjust-one', 'adjust-one-hash'
  )
$$, 'Organizer finalizes an immutable Adjustment');
select is((select count(*)::integer from public.settlements where settlement_kind = 'ADJUSTMENT'), 1,
  'one canonical successor is stored');
select is((select sum(delta_minor) from public.settlement_adjustment_deltas), 0::numeric,
  'Adjustment delta vector nets to zero');
select is((select authority from public.settlement_audit_events where event_type = 'ADJUSTED'),
  'ORGANIZER_OVERRIDE', 'canonical Adjustment audit records authority');
select throws_ok($$update public.settlement_adjustment_deltas set delta_minor = 0$$,
  '23514', 'settlement_adjustment_deltas is append-only', 'Adjustment deltas are immutable');
select ok((public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003', null,
    repeat('b', 64), repeat('b', 64), repeat('a', 64),
    '{}'::jsonb, '[]', '[]', '[]', '[]', 'ignored', false, false,
    'adjust-one', 'adjust-one-hash'
  ) ->> 'idempotentReplay')::boolean,
  'response-loss replay returns the original result before stale checks');
select is((select count(*)::integer from public.settlements where settlement_kind = 'ADJUSTMENT'), 1,
  'idempotent replay creates no duplicate');
select throws_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003', null,
    repeat('c', 64), repeat('c', 64), repeat('b', 64),
    (select value from stage72b_source), '[]', '[]', '[]', '[]',
    'Concurrent correction', true, false, 'stale-head', 'stale-head-hash'
  )
$$, 'P0001', 'SETTLEMENT_INPUT_STALE', 'same-head concurrent finalization is stably stale');
select throws_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003',
    (select id from public.settlements where settlement_kind = 'ADJUSTMENT'),
    repeat('b', 64), repeat('b', 64), repeat('b', 64),
    (select value from stage72b_source), '[]', '[]', '[]', '[]',
    'No change', true, false, 'no-change', 'no-change-hash'
  )
$$, 'P0001', 'ADJUSTMENT_NOT_REQUIRED', 'identical financial input creates no no-op history');
select throws_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003',
    (select id from public.settlements where settlement_kind = 'ADJUSTMENT'),
    repeat('c', 64), repeat('c', 64), repeat('b', 64),
    (select value from stage72b_source), '[]', '[]', '[]', '[]',
    'Zero transfer correction', false, false, 'zero-unacked', 'zero-unacked-hash'
  )
$$, 'P0001', 'ZERO_TRANSFER_ACK_REQUIRED', 'zero-transfer Adjustment requires explicit acknowledgement');
select lives_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003',
    (select id from public.settlements where settlement_kind = 'ADJUSTMENT'),
    repeat('c', 64), repeat('c', 64), repeat('b', 64),
    (select value from stage72b_source), '[]', '[]', '[]', '[]',
    'Zero transfer correction', true, false, 'zero-acked', 'zero-acked-hash'
  )
$$, 'changed digest may create an explicitly acknowledged zero-transfer Adjustment');
select is((select max(lineage_sequence) from public.settlements), 2,
  'Adjustment lineage advances in order');
select is((select parent_adjustment_id from public.settlements where lineage_sequence = 2),
  (select id from public.settlements where lineage_sequence = 1),
  'Adjustment successor records the canonical parent');
select throws_ok($$update public.settlements set input_digest = repeat('d', 64)
  where settlement_kind = 'ADJUSTMENT'$$,
  'P0001', 'Settlement lineage is immutable', 'historical Adjustment lineage cannot be rewritten');
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) select
  '41000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000001', id,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', id, 'Conflict after finalization',
  '2026-09-11T00:00:00Z', 100, 'NZD', 2, 'ACCEPTED'
from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';
insert into public.ledger_idempotency_keys (
  actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
  response_status, response_body, completed_at
) values (
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'UPDATE_EXPENSE',
  'adjustment-conflict', 'adjustment-conflict-hash', 409,
  jsonb_build_object('error', jsonb_build_object(
    'code', 'REVISION_CONFLICT',
    'expenseId', '41000000-0000-4000-8000-000000000009'
  )), now()
);
select is((select revision from public.settlements where settlement_kind = 'ROOT'),
  2::bigint, 'open conflict invalidates the root readiness projection');
select is(
  public.ledger_adjustment_source_7_2b('70000000-0000-4000-8000-000000000003')
    #>> '{expenses,0,hasOpenConflict}',
  'true', 'current root-scoped source exposes the open conflict blocker'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.ledger_finalize_adjustment_7_2b(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,boolean,text,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot call Adjustment finalization directly'
);

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) select
  '41000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001', id,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', id, 'After root cutoff',
  '2026-09-16T00:00:00Z', 100, 'NZD', 2, 'ACCEPTED'
from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';
select is(
  jsonb_array_length(
    public.ledger_adjustment_source_7_2b('70000000-0000-4000-8000-000000000003')
      -> 'expenses'
  ),
  1, 'historical root-cutoff source still excludes the later Expense'
);
select is(
  jsonb_array_length(
    public.ledger_adjustment_source_current_7_2c(
      '70000000-0000-4000-8000-000000000003', '2026-09-25T00:00:00Z'
    ) -> 'expenses'
  ),
  2, 'current Adjustment source includes the later Expense'
);
select lives_ok($$
  select public.ledger_finalize_adjustment_7_2b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003',
    (select id from public.settlements where lineage_sequence = 2),
    repeat('d', 64), repeat('d', 64), repeat('c', 64),
    public.ledger_adjustment_source_current_7_2c(
      '70000000-0000-4000-8000-000000000003', '2026-09-25T00:00:00Z'
    ),
    '[]', '[]', '[]', '[]', 'Later Expense update', true, false,
    'current-cutoff', 'current-cutoff-hash'
  )
$$, 'a new immutable version accepts the explicit current cutoff');
select is(
  (select through_timestamp from public.settlements where lineage_sequence = 3),
  '2026-09-25T00:00:00Z'::timestamptz,
  'new version stores its own cutoff while the root remains frozen'
);

select * from finish();
rollback;
