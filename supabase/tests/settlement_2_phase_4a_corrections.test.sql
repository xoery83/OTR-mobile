begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);
set local role service_role;

update public.journey_members set role = 'owner', status = 'linked'
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
);

create temporary table phase4_members as select
  max(id::text) filter (where user_id = '00000000-0000-4000-8000-000000000001')::uuid owner_id,
  max(id::text) filter (where user_id = '00000000-0000-4000-8000-000000000002')::uuid member_id
from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001';

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) select
  '44000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', owner_id,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', owner_id,
  'Frozen original', '2026-09-01T00:00:00Z', 100, 'NZD', 2, 'ACCEPTED'
from phase4_members;
insert into public.expense_participants (
  expense_id, journey_id, member_id, display_name_snapshot, display_order
) select '44000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', member_id, 'Synthetic Member', 0
from phase4_members;
insert into public.expense_splits (
  expense_id, journey_id, member_id, split_method, original_amount_minor,
  settlement_amount_minor, rounding_adjustment_minor
) select '44000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', member_id, 'EXACT', 100, 100, 0
from phase4_members;
insert into public.settlement_valuation_snapshots (
  id, expense_id, journey_id, expense_revision, policy,
  original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale,
  reason, is_active, created_by
) values (
  '45000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 1, 'SAME_CURRENCY',
  100, 'NZD', 2, 100, 'NZD', 2, 'Identity', true,
  '00000000-0000-4000-8000-000000000001'
);

insert into public.settlements (
  id, journey_id, settlement_currency, settlement_scale, settings_revision,
  status, through_timestamp, input_digest, algorithm_version, created_by,
  finalized_by, finalized_at
) values (
  '47000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 1, 'FINALIZED',
  '2026-09-30T00:00:00Z', repeat('1', 64), 'ledger-settlement-greedy-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', now()
);
insert into public.settlement_inputs (
  settlement_id, journey_id, expense_id, expense_revision,
  valuation_snapshot_id, normalized_snapshot
) values (
  '47000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001', 1,
  '45000000-0000-4000-8000-000000000001', '{}'::jsonb
);
insert into public.settlement_member_balances (
  settlement_id, journey_id, member_id, display_name_snapshot,
  paid_minor, owed_minor, net_minor
) select '47000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid, owner_id, 'Synthetic Owner',
  100, 0, 100 from phase4_members
union all
select '47000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid, member_id, 'Synthetic Member',
  0, 100, -100 from phase4_members;

create temporary table phase4_before as
select public.ledger_adjustment_source_7_2b(
  '47000000-0000-4000-8000-000000000001'
) value;
create temporary table phase4_successor as
select jsonb_build_object('entity', jsonb_build_object(
  'id', '44000000-0000-4000-8000-000000000002',
  'creatorMemberId', owner_id,
  'payerMemberId', owner_id,
  'title', 'Corrected successor', 'description', null, 'category', 'other',
  'occurredAt', '2026-09-01T00:00:00Z', 'economicDate', '2026-09-01',
  'original', jsonb_build_object('minor', 120, 'currency', 'NZD', 'scale', 2),
  'businessStatus', 'ACCEPTED', 'settlementParticipation', 'INCLUDED',
  'createdAt', '2026-09-23T00:00:00Z', 'updatedAt', '2026-09-23T00:00:00Z',
  'participants', jsonb_build_array(jsonb_build_object(
    'memberId', member_id, 'displayNameSnapshot', 'Synthetic Member',
    'householdIdSnapshot', null
  )),
  'splits', jsonb_build_array(jsonb_build_object(
    'memberId', member_id, 'method', 'EXACT', 'originalMinor', 120,
    'settlementMinor', 120, 'weightUnits', null, 'percentageUnits', null,
    'roundingAdjustmentMinor', 0
  )),
  'valuation', jsonb_build_object(
    'id', '45000000-0000-4000-8000-000000000002',
    'policy', 'SAME_CURRENCY',
    'original', jsonb_build_object('minor', 120, 'currency', 'NZD', 'scale', 2),
    'settlement', jsonb_build_object('minor', 120, 'currency', 'NZD', 'scale', 2),
    'rateSnapshotId', null, 'paymentRecordId', null, 'reason', 'Identity'
  )
)) value from phase4_members;
create temporary table phase4_expected as
select jsonb_set(before.value, '{expenses}', jsonb_build_array(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(before.value #> '{expenses,0}', '{id}',
          '"44000000-0000-4000-8000-000000000002"'::jsonb),
        '{original,minor}', '120'::jsonb),
      '{valuation,id}', '"45000000-0000-4000-8000-000000000002"'::jsonb),
    '{valuation,original,minor}', '120'::jsonb
  ) || jsonb_build_object(
    'splits', jsonb_build_array(
      (before.value #> '{expenses,0,splits,0}') ||
      jsonb_build_object('originalMinor', 120, 'settlementMinor', 120)
    ),
    'valuation', (before.value #> '{expenses,0,valuation}') ||
      jsonb_build_object(
        'id', '45000000-0000-4000-8000-000000000002',
        'original', jsonb_build_object('minor', 120, 'currency', 'NZD', 'scale', 2),
        'settlement', jsonb_build_object('minor', 120, 'currency', 'NZD', 'scale', 2)
      )
  )
)) value from phase4_before before;

select lives_ok($$
  select public.ledger_finalize_correction_4a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001',
    (select value from phase4_successor), null,
    repeat('2', 64), repeat('2', 64), repeat('1', 64),
    (select value from phase4_expected),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('memberId', owner_id, 'displayNameSnapshot', 'Synthetic Owner', 'deltaMinor', 20),
      jsonb_build_object('memberId', member_id, 'displayNameSnapshot', 'Synthetic Member', 'deltaMinor', -20)
    ),
    jsonb_build_array(jsonb_build_object(
      'fromMemberId', member_id, 'toMemberId', owner_id,
      'amount', jsonb_build_object('minor', 20, 'currency', 'NZD', 'scale', 2)
    )),
    jsonb_build_array(jsonb_build_object(
      'expenseId', '44000000-0000-4000-8000-000000000001', 'change', 'CHANGED'
    )),
    'Correct amount', false, false, 'phase4-correct-1', 'phase4-correct-1-hash'
  ) from phase4_members
$$, 'correction atomically creates a successor and immutable version');

select is((select count(*)::integer from public.expenses where id in (
  '44000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000002'
)), 2, 'old and successor Expense both remain stored');
select is((select original_amount_minor from public.expenses
  where id = '44000000-0000-4000-8000-000000000001'), 100::bigint,
  'old finalized Expense is byte-stable');
select is((select original_amount_minor from public.expenses
  where id = '44000000-0000-4000-8000-000000000002'), 120::bigint,
  'successor stores corrected economics');
select is((select count(*)::integer from public.expense_correction_successors), 1,
  'one explicit source-successor link is stored');
select ok((select correction_settlement_id is not null
  from public.expense_correction_successors), 'successor points to its correction version');
select is((select count(*)::integer
  from jsonb_array_elements(public.ledger_adjustment_source_7_2b(
    '47000000-0000-4000-8000-000000000001') -> 'expenses') expense
  where expense ->> 'id' = '44000000-0000-4000-8000-000000000001'), 0,
  'current source excludes the frozen predecessor');
select is((select count(*)::integer
  from jsonb_array_elements(public.ledger_adjustment_source_7_2b(
    '47000000-0000-4000-8000-000000000001') -> 'expenses') expense
  where expense ->> 'id' = '44000000-0000-4000-8000-000000000002'), 1,
  'current source includes the successor exactly once');
select is((select input_digest from public.settlements
  where id = '47000000-0000-4000-8000-000000000001'), repeat('1', 64),
  'old root digest remains unchanged');
select is((select count(*)::integer from public.settlements
  where settlement_kind = 'ADJUSTMENT'), 1, 'one updated Settlement version is created');
select ok((public.ledger_finalize_correction_4a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000001', '{}'::jsonb, null,
    repeat('2', 64), repeat('2', 64), repeat('1', 64), '{}'::jsonb,
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'ignored', false, false, 'phase4-correct-1', 'phase4-correct-1-hash'
  ) ->> 'idempotentReplay')::boolean, 'confirmation replay is idempotent');
select throws_ok($$update public.expenses set original_amount_minor = 101
  where id = '44000000-0000-4000-8000-000000000001'$$,
  'P0001', 'FINALIZED_SETTLEMENT_PROTECTED',
  'ordinary mutation of the frozen predecessor stays blocked');
select throws_ok($$update public.expense_correction_successors
  set reason = 'rewrite'$$, 'P0001', 'Correction successor lineage is immutable',
  'correction lineage cannot be rewritten');
select ok(not has_function_privilege(
  'authenticated',
  'public.ledger_finalize_correction_4a(uuid,uuid,uuid,uuid,jsonb,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,boolean,text,text)',
  'EXECUTE'
), 'authenticated clients cannot call correction finalization directly');

select * from finish();
rollback;
