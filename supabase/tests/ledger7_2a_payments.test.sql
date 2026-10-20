begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(28);
set local role service_role;

update public.journey_members set role = 'owner', status = 'linked'
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';

insert into public.settlements (
  id, journey_id, settlement_currency, settlement_scale, settings_revision,
  status, through_timestamp, input_digest, algorithm_version, created_by,
  finalized_by, finalized_at
) values (
  '70000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 1, 'FINALIZED',
  '2026-09-12T00:00:00Z', repeat('7', 64), 'ledger-settlement-greedy-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', now()
);
insert into public.settlement_member_balances (
  settlement_id, journey_id, member_id, display_name_snapshot,
  paid_minor, owed_minor, net_minor
)
select '70000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', id, display_name,
  case when user_id = '00000000-0000-4000-8000-000000000001' then 10000 else 0 end,
  case when user_id = '00000000-0000-4000-8000-000000000002' then 10000 else 0 end,
  case when user_id = '00000000-0000-4000-8000-000000000001' then 10000 else -10000 end
from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id in (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002'
  );
insert into public.settlement_transfers (
  id, settlement_id, journey_id, from_member_id, to_member_id,
  obligation_amount_minor, settlement_currency, settlement_scale
)
select '72000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  (select id from public.journey_members where user_id = '00000000-0000-4000-8000-000000000002'
    and trip_id = '10000000-0000-4000-8000-000000000001'),
  (select id from public.journey_members where user_id = '00000000-0000-4000-8000-000000000001'
    and trip_id = '10000000-0000-4000-8000-000000000001'),
  10000, 'NZD', 2;

select lives_ok($$
  select public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'localId', '73000000-0000-4000-8000-000000000001',
      'baseTransferRevision', (select revision from public.settlement_transfers
        where id = '72000000-0000-4000-8000-000000000002'),
      'payment', jsonb_build_object('minor', 4000, 'currency', 'NZD', 'scale', 2),
      'assertedDischarge', jsonb_build_object('minor', 4000, 'currency', 'NZD', 'scale', 2),
      'repaymentValuation', null, 'feeTreatment', null,
      'paidAt', '2026-09-12T01:00:00Z', 'evidenceAssetId', null, 'notes', null,
      'reportingAuthority', 'PAYER', 'reason', null
    ), 'payment-one', 'payment-one-hash', null
  )
$$, 'payer records a partial Paid proposition');
select is((select status from public.settlement_payments where id = '73000000-0000-4000-8000-000000000001'),
  'AWAITING_CONFIRMATION', 'Paid begins awaiting confirmation');
select is((select status from public.settlement_transfers where id = '72000000-0000-4000-8000-000000000002'),
  'AWAITING_CONFIRMATION', 'awaiting reservation derives Transfer state');
select is((select status from public.settlements where id = '70000000-0000-4000-8000-000000000002'),
  'FINALIZED', 'Paid alone does not reduce debt or advance Settlement');
select is((select count(*)::integer from public.settlement_payment_discharges), 0,
  'Paid creates no discharge fact');
select ok((public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002', '{}'::jsonb,
    'payment-one', 'payment-one-hash', null
  ) ->> 'idempotentReplay')::boolean,
  'response-loss retry replays the original Paid result');
select is((select count(*)::integer from public.settlement_payments), 1,
  'Paid replay creates no duplicate');

select throws_ok($$
  select public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'localId', '73000000-0000-4000-8000-000000000099',
      'baseTransferRevision', (select revision from public.settlement_transfers where id = '72000000-0000-4000-8000-000000000002'),
      'payment', jsonb_build_object('minor', 7000, 'currency', 'NZD', 'scale', 2),
      'assertedDischarge', jsonb_build_object('minor', 7000, 'currency', 'NZD', 'scale', 2),
      'repaymentValuation', null, 'feeTreatment', null,
      'paidAt', now(), 'evidenceAssetId', null, 'notes', null,
      'reportingAuthority', 'PAYER', 'reason', null
    ), 'payment-over', 'payment-over-hash', null
  )
$$, 'P0001', 'TRANSFER_OVERPAYMENT', 'confirmed plus awaiting cannot overbook obligation');

select lives_ok($$
  select public.ledger_act_on_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001', 'confirm', 1,
    'RECIPIENT', null, 'confirm-one', 'confirm-one-hash'
  )
$$, 'recipient confirms the exact repayment proposition');
select is((select amount_minor from public.settlement_payment_discharges
  where payment_id = '73000000-0000-4000-8000-000000000001'), 4000::bigint,
  'Received creates a separate exact discharge fact');
select is((select status from public.settlement_transfers where id = '72000000-0000-4000-8000-000000000002'),
  'PARTIALLY_PAID', 'partial confirmed discharge advances Transfer');
select is((select status from public.settlements where id = '70000000-0000-4000-8000-000000000002'),
  'PARTIALLY_PAID', 'partial confirmed discharge advances Settlement');
select throws_ok($$
  select public.ledger_act_on_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001', 'reject', 2,
    'RECIPIENT', 'late reject', 'reject-late', 'reject-late-hash'
  )
$$, 'P0001', 'PAYMENT_STATE_CONFLICT', 'confirmed Payment is terminal');

select lives_ok($$
  select public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'localId', '73000000-0000-4000-8000-000000000002',
      'baseTransferRevision', (select revision from public.settlement_transfers where id = '72000000-0000-4000-8000-000000000002'),
      'payment', jsonb_build_object('minor', 3000, 'currency', 'EUR', 'scale', 2),
      'assertedDischarge', jsonb_build_object('minor', 5400, 'currency', 'NZD', 'scale', 2),
      'repaymentValuation', jsonb_build_object(
        'decimalRate', '1.8', 'source', 'MANUAL_AGREED',
        'sourceLabel', 'Traveller agreement', 'effectiveAt', '2026-09-12T02:00:00Z',
        'reason', 'Agreed rate'
      ), 'feeTreatment', jsonb_build_object(
        'fee', jsonb_build_object('minor', 50, 'currency', 'EUR', 'scale', 2),
        'borneBy', 'DEBTOR'
      ), 'paidAt', '2026-09-12T02:00:00Z', 'evidenceAssetId', null, 'notes', null,
      'reportingAuthority', 'PAYER', 'reason', null
    ), 'payment-fx', 'payment-fx-hash', null
  )
$$, 'cross-currency proposition stores immutable valuation and fee treatment');
select is((select count(*)::integer from public.repayment_valuation_snapshots), 1,
  'cross-currency repayment owns one valuation snapshot');
select lives_ok($$
  select public.ledger_act_on_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000002', 'reject', 1,
    'RECIPIENT', 'Amount not received', 'reject-fx', 'reject-fx-hash'
  )
$$, 'recipient rejects a complete cross-currency proposition');
select throws_ok($$
  select public.ledger_act_on_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000002', 'confirm', 2,
    'RECIPIENT', null, 'confirm-rejected', 'confirm-rejected-hash'
  )
$$, 'P0001', 'PAYMENT_STATE_CONFLICT', 'rejected Payment cannot return to awaiting or confirm');
select throws_ok($$update public.settlement_payment_discharges set amount_minor = 1$$,
  '23514', 'settlement_payment_discharges is append-only', 'discharge fact is immutable');
select throws_ok($$update public.repayment_valuation_snapshots set decimal_rate = 2$$,
  '23514', 'repayment_valuation_snapshots is append-only', 'repayment valuation is immutable');

select lives_ok($$
  select public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'localId', '73000000-0000-4000-8000-000000000003',
      'baseTransferRevision', (select revision from public.settlement_transfers where id = '72000000-0000-4000-8000-000000000002'),
      'payment', jsonb_build_object('minor', 1000, 'currency', 'NZD', 'scale', 2),
      'assertedDischarge', jsonb_build_object('minor', 1000, 'currency', 'NZD', 'scale', 2),
      'repaymentValuation', null, 'feeTreatment', null,
      'paidAt', now(), 'evidenceAssetId', null, 'notes', null,
      'reportingAuthority', 'PAYER', 'reason', null
    ), 'payment-dispute', 'payment-dispute-hash', null
  )
$$, 'payer records a Payment that will be disputed');
select lives_ok($$
  select public.ledger_act_on_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003', 'dispute', 1,
    'PAYER', 'Recipient disputes the proposition', 'dispute-one', 'dispute-one-hash'
  )
$$, 'recipient may dispute even if the client supplies a false authority label');
select is((select authority from public.settlement_audit_events
  where payment_id = '73000000-0000-4000-8000-000000000003' and event_type = 'DISPUTED'),
  'RECIPIENT', 'canonical audit authority is derived from the real actor');
select throws_ok($$
  select public.ledger_act_on_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003', 'confirm', 2,
    'RECIPIENT', null, 'confirm-disputed', 'confirm-disputed-hash'
  )
$$, 'P0001', 'PAYMENT_STATE_CONFLICT', 'disputed Payment is terminal');
select lives_ok($$
  select public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'localId', '73000000-0000-4000-8000-000000000004',
      'basePaymentRevision', 2,
      'payment', jsonb_build_object('minor', 1200, 'currency', 'NZD', 'scale', 2),
      'assertedDischarge', jsonb_build_object('minor', 1200, 'currency', 'NZD', 'scale', 2),
      'repaymentValuation', null, 'feeTreatment', null,
      'paidAt', now(), 'evidenceAssetId', null, 'notes', null,
      'reportingAuthority', 'ORGANIZER_OVERRIDE', 'reason', 'Resolution replacement'
    ), 'correct-disputed', 'correct-disputed-hash',
    '73000000-0000-4000-8000-000000000003'
  )
$$, 'organizer resolves a dispute through an explicit replacement fact');
select is((select status from public.settlement_payments
  where id = '73000000-0000-4000-8000-000000000003'),
  'DISPUTED', 'replacement never resurrects or rewrites the disputed Payment');
select is((select supersedes_payment_id from public.settlement_payments
  where id = '73000000-0000-4000-8000-000000000004'),
  '73000000-0000-4000-8000-000000000003'::uuid,
  'replacement preserves explicit Payment lineage');
select is((select status from public.settlement_payments
  where id = '73000000-0000-4000-8000-000000000004'),
  'AWAITING_CONFIRMATION', 'replacement is a new confirmation proposition');
select throws_ok($$
  select public.ledger_record_settlement_payment_7_2a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'localId', '73000000-0000-4000-8000-000000000005',
      'basePaymentRevision', 2,
      'payment', jsonb_build_object('minor', 100, 'currency', 'NZD', 'scale', 2),
      'assertedDischarge', jsonb_build_object('minor', 100, 'currency', 'NZD', 'scale', 2),
      'repaymentValuation', null, 'feeTreatment', null,
      'paidAt', now(), 'evidenceAssetId', null, 'notes', null,
      'reportingAuthority', 'ORGANIZER_OVERRIDE', 'reason', 'Second replacement branch'
    ), 'correct-disputed-again', 'correct-disputed-again-hash',
    '73000000-0000-4000-8000-000000000003'
  )
$$, 'P0001', 'PAYMENT_IDENTITY_CONFLICT',
  'one Payment lineage cannot fork into multiple replacement facts');

select * from finish();
rollback;
