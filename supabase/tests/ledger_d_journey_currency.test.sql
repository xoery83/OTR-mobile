begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(24);
set local role service_role;

insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values ('12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Synthetic Owner', 'owner', 'linked', '2026-01-01T00:00:00Z')
on conflict (trip_id, user_id) do nothing;

insert into public.ledger_settings(journey_id, settlement_currency, settlement_scale, valuation_policy)
values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE');

select throws_ok($$update public.ledger_settings set settlement_currency = 'EUR'
  where journey_id = '10000000-0000-4000-8000-000000000001'$$,
  'P0001', 'JOURNEY_CURRENCY_COMMAND_REQUIRED', 'direct settings write is forbidden');

create temp table preview_a as select public.ledger_preview_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'EUR') as body;
select is((select body ->> 'affectedExpenses' from preview_a), '0',
  'empty Journey preview has no affected Expenses');
select lives_ok(format($$select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'EUR', 1, %L, 'phase-d-empty')$$,
  (select body ->> 'previewDigest' from preview_a)),
  'empty Journey currency command commits');
select is((select settlement_currency from public.ledger_settings
  where journey_id = '10000000-0000-4000-8000-000000000001'), 'EUR',
  'Journey Currency is EUR');
select is((select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'EUR', 1,
  (select body ->> 'previewDigest' from preview_a), 'phase-d-empty') ->> 'idempotentReplay'),
  'true', 'duplicate commit replays');

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values
  ('66000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002', 'EUR identity',
   '2026-07-12T00:00:00Z', '2026-07-12', 10000, 'EUR', 2, 'ACCEPTED'),
  ('66000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002', 'ISK historical',
   '2026-07-12T00:00:00Z', '2026-07-12', 10000, 'ISK', 0, 'RATE_REQUIRED');
insert into public.expense_participants(expense_id, journey_id, member_id,
  display_name_snapshot, display_order)
select id, journey_id, payer_member_id, 'Owner', 0 from public.expenses
where id in ('66000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000002');
insert into public.expense_splits(expense_id, journey_id, member_id,
  split_method, original_amount_minor, settlement_amount_minor)
select id, journey_id, payer_member_id, 'EQUAL_PERSON', original_amount_minor,
  case when original_currency = 'EUR' then original_amount_minor else null end
from public.expenses where id in ('66000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000002');
insert into public.settlement_valuation_snapshots(id, expense_id, journey_id,
  expense_revision, policy, original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale)
values ('66000000-0000-4000-8000-000000000003',
  '66000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 1, 'SAME_CURRENCY',
  10000, 'EUR', 2, 10000, 'EUR', 2);
select is((select count(*) from public.ledger_claim_currency_preview_demands(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'USD', 4)), 2::bigint,
  'preview claims eligible historical quote demands');
insert into public.ledger_rate_quotes(id, journey_id, quote_currency,
  base_currency, decimal_rate, effective_date, economic_date, reference_date,
  policy_version, observed_at, expires_at, provider, provider_reference,
  source_reference)
values ('66000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001', 'ISK', 'USD', 0.0075,
  '2026-07-10', '2026-07-12', '2026-07-10', 'ECB_DAILY_V1',
  now(), now() + interval '30 days', 'ECB',
  'https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/USD?date=2026-07-12',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html');
create temp table preview_b as select public.ledger_preview_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'USD') as body;
select is((select body ->> 'referenceCandidateCount' from preview_b), '1',
  'preview recognizes weekend ISK/USD candidate');
select lives_ok(format($$select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'USD', 2, %L, 'phase-d-expenses')$$,
  (select body ->> 'previewDigest' from preview_b)),
  'Expense Journey currency command commits atomically');
select is((select original_amount_minor from public.expenses
  where id = '66000000-0000-4000-8000-000000000002'), 10000::bigint,
  'original ISK Money remains unchanged');
select is((select settlement_amount_minor from public.settlement_valuation_snapshots
  where expense_id = '66000000-0000-4000-8000-000000000002' and is_active),
  7500::bigint, 'ISK 10000 is valued in USD from original Money');
select is((select provenance ->> 'referenceDate' from public.exchange_rate_snapshots
  where expense_id = '66000000-0000-4000-8000-000000000002'),
  '2026-07-10', 'weekend valuation freezes Friday reference date');
select is((select count(*) from public.settlement_valuation_snapshots
  where expense_id = '66000000-0000-4000-8000-000000000001' and not is_active),
  1::bigint, 'old accepted valuation remains historical');
select is((select count(*) from public.settlement_valuation_snapshots v
  join public.ledger_settings s on s.journey_id = v.journey_id
  where v.journey_id = '10000000-0000-4000-8000-000000000001'
    and v.is_active and v.settlement_currency <> s.settlement_currency),
  0::bigint, 'no active valuation retains the old Journey Currency');

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values
  ('66000000-0000-4000-8000-000000000005',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002', 'Manual GBP',
   '2026-07-12T00:00:00Z', 1000, 'GBP', 2, 'ACCEPTED'),
  ('66000000-0000-4000-8000-000000000006',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002', 'Undated CAD',
   '2026-07-12T00:00:00Z', 1000, 'CAD', 2, 'RATE_REQUIRED');
insert into public.expense_participants(expense_id, journey_id, member_id,
  display_name_snapshot, display_order)
select id, journey_id, payer_member_id, 'Member', 0 from public.expenses
where id in ('66000000-0000-4000-8000-000000000005',
  '66000000-0000-4000-8000-000000000006');
insert into public.expense_splits(expense_id, journey_id, member_id,
  split_method, original_amount_minor, settlement_amount_minor)
select id, journey_id, payer_member_id, 'EQUAL_PERSON', original_amount_minor,
  case when original_currency = 'GBP' then 2000 else null end
from public.expenses where id in ('66000000-0000-4000-8000-000000000005',
  '66000000-0000-4000-8000-000000000006');
insert into public.settlement_valuation_snapshots(id, expense_id, journey_id,
  expense_revision, policy, original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale, reason)
values ('66000000-0000-4000-8000-000000000007',
  '66000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001', 1, 'MANUAL_AGREED',
  1000, 'GBP', 2, 2000, 'USD', 2, 'Group agreement');
create temp table preview_c as select public.ledger_preview_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'JPY') as body;
select is((select body ->> 'manualAgreedCount' from preview_c), '1',
  'manual agreement has a separate preview count');
select is((select body ->> 'missingEconomicDateCount' from preview_c), '2',
  'all cross-currency missing economic dates are explicit');
insert into public.ledger_rate_quotes(id, journey_id, quote_currency,
  base_currency, decimal_rate, effective_date, economic_date, reference_date,
  policy_version, observed_at, expires_at, provider, provider_reference,
  source_reference)
values ('66000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001', 'ISK', 'JPY', 0.95,
  '2026-07-10', '2026-07-12', '2026-07-10', 'ECB_DAILY_V1',
  now(), now() + interval '30 days', 'ECB',
  'https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/JPY?date=2026-07-12',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html');
select throws_ok(format($$select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'JPY', 3, %L, 'stale-quote')$$,
  (select body ->> 'previewDigest' from preview_c)),
  'P0001', 'JOURNEY_CURRENCY_PREVIEW_STALE',
  'new quote invalidates the preview');
create temp table preview_d as select public.ledger_preview_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'JPY') as body;
select lives_ok(format($$select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'JPY', 3, %L, 'phase-d-jpy')$$,
  (select body ->> 'previewDigest' from preview_d)),
  'zero-decimal currency command succeeds');
select is((select settlement_scale from public.ledger_settings
  where journey_id = '10000000-0000-4000-8000-000000000001'),
  0::smallint, 'JPY uses zero decimal places');
select is((select settlement_amount_minor from public.settlement_valuation_snapshots
  where expense_id = '66000000-0000-4000-8000-000000000002' and is_active),
  9500::bigint, 'ISK original revalues directly into JPY minor units');
select is((select business_status from public.expenses
  where id = '66000000-0000-4000-8000-000000000005'),
  'RATE_REQUIRED', 'manual agreement is not silently replaced');
select is((select count(*) from public.settlement_valuation_snapshots
  where id = '66000000-0000-4000-8000-000000000007' and not is_active),
  1::bigint, 'old manual evidence is historical');
select is((select count(*) from public.ledger_auto_valuation_failures
  where expense_id = '66000000-0000-4000-8000-000000000005'
    and expense_revision = 2 and failure_class = 'SEMANTIC'),
  1::bigint, 'Phase C scanner cannot auto-replace a manual agreement');

insert into public.settlements(id, journey_id, settlement_currency,
  settlement_scale, status, through_timestamp, input_digest, algorithm_version,
  created_by, finalized_by, finalized_at, settings_revision)
values ('66000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000001', 'JPY', 0, 'SETTLED',
  '2026-07-13T00:00:00Z', 'phase-d-finalized', 'ledger-settlement-greedy-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', now(), 4);
select is((select public.ledger_preview_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'EUR') ->> 'finalizedSettlementCount'),
  '1', 'paid finalized settlement remains a permanent lock');
select throws_ok(format($$select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'EUR', 4, %L, 'after-finalized')$$,
  (select public.ledger_preview_journey_currency(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'EUR') ->> 'previewDigest')),
  'P0001', 'JOURNEY_CURRENCY_FINALIZED_LOCK',
  'paid finalized history blocks change');

select * from finish();
rollback;
