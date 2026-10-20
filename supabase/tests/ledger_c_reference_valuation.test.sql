begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);
set local role service_role;

select ok(not has_function_privilege('service_role',
  'public.ledger_apply_valuation_5_1(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'service role cannot bypass the Phase C wrapper');
select ok(has_function_privilege('service_role',
  'public.ledger_apply_valuation_c(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,boolean)', 'EXECUTE'),
  'service role can invoke the guarded Stage 5 command');

insert into public.ledger_settings(journey_id, settlement_currency, settlement_scale, valuation_policy)
values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'MANUAL_AGREED');
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values (
  '65000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  'Phase C weekend EUR 100', '2026-07-12T00:00:00Z', '2026-07-12',
  10000, 'EUR', 2, 'RATE_REQUIRED'
);
insert into public.expense_participants(expense_id, journey_id, member_id,
  display_name_snapshot, display_order) values (
  '65000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'Member', 0
);
insert into public.expense_splits(expense_id, journey_id, member_id,
  split_method, original_amount_minor, settlement_amount_minor,
  rounding_adjustment_minor) values (
  '65000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  'EQUAL_PERSON', 10000, null, 0
);
insert into public.ledger_rate_quotes (
  id, journey_id, quote_currency, base_currency, decimal_rate,
  effective_date, economic_date, reference_date, policy_version,
  observed_at, expires_at, provider, provider_reference, source_reference
) values (
  '65000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 'EUR', 'NZD', 1.9608,
  '2026-07-10', '2026-07-12', '2026-07-10', 'ECB_DAILY_V1',
  now(), now() + interval '30 days', 'ECB',
  'https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
);

select is((select count(*) from public.ledger_list_auto_reference_demands(4)
  where expense_id = '65000000-0000-4000-8000-000000000001'), 1::bigint,
  'new RATE_REQUIRED Expense and candidate form an auto demand despite legacy manual Journey setting');
select is((select count(*) from public.ledger_list_settlement_auto_reference_demands(
  '10000000-0000-4000-8000-000000000001', 4)
  where expense_id = '65000000-0000-4000-8000-000000000001'), 1::bigint,
  'foreground Settlement sees the same new Expense despite legacy manual Journey setting');
select is((select business_status from public.expenses
  where id = '65000000-0000-4000-8000-000000000001'), 'RATE_REQUIRED',
  'candidate alone is not financial truth');

create temp table c_payload as select
  '{"baseRevision":1,"settingsRevision":1,"policy":"REFERENCE_RATE","economicDate":"2026-07-12","rateQuoteId":"65000000-0000-4000-8000-000000000002","reason":"Automatic ECB reference valuation","previewSettlement":{"minor":19608,"currency":"NZD","scale":2}}'::jsonb as valuation,
  '{"id":"65000000-0000-4000-8000-000000000003","decimalRate":"1.9608","effectiveDate":"2026-07-10","observedAt":"2026-09-17T00:00:00Z","provider":"ECB","providerReference":"https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12","stalenessState":"FRESH"}'::jsonb as rate,
  '{"entity":{"valuation":{"id":"65000000-0000-4000-8000-000000000004","rateSnapshotId":"65000000-0000-4000-8000-000000000003","supersedesValuationId":null},"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","settlementMinor":19608}],"auditEvents":[{"id":"65000000-0000-4000-8000-000000000005"}]},"serverId":"65000000-0000-4000-8000-000000000001","revision":2,"updatedAt":"2026-09-17T00:00:00Z","idempotentReplay":false}'::jsonb as response;

select throws_ok(format($$select public.ledger_apply_valuation_c(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001', 'wrong-date', 'wrong-date',
  %L::jsonb, %L::jsonb, %L::jsonb, true)$$,
  jsonb_set(valuation, '{economicDate}', '"2026-07-11"'), rate, response),
  'P0001', 'ECONOMIC_DATE_REQUIRED_OR_MISMATCH',
  'RPC rejects a forged request economic date') from c_payload;
select throws_ok(format($$select public.ledger_apply_valuation_c(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001', 'wrong-rate', 'wrong-rate',
  %L::jsonb, %L::jsonb, %L::jsonb, true)$$,
  valuation, jsonb_set(rate, '{decimalRate}', '"1.95"'), response),
  'P0001', 'INVALID_REFERENCE_RATE',
  'RPC rejects a forged decimal even when the quote ID is real') from c_payload;
select throws_ok(format($$select public.ledger_apply_valuation_c(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001', 'wrong-settings', 'wrong-settings',
  %L::jsonb, %L::jsonb, %L::jsonb, true)$$,
  jsonb_set(valuation, '{settingsRevision}', '99'), rate, response),
  'P0001', 'SETTINGS_REVISION_CONFLICT',
  'RPC rejects a stale Journey settings revision') from c_payload;

select lives_ok(format($$select public.ledger_apply_valuation_c(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001', 'auto-c-1', 'auto-c-hash-1',
  %L::jsonb, %L::jsonb, %L::jsonb, true)$$, valuation, rate, response),
  'guarded automatic call accepts the Friday rate despite legacy manual Journey setting') from c_payload;
select is((select settlement_amount_minor from public.settlement_valuation_snapshots
  where expense_id = '65000000-0000-4000-8000-000000000001' and is_active),
  19608::bigint, 'EUR 100 becomes NZD 196.08 with Stage 5 rounding');
select is((select provenance ->> 'economicDate' from public.exchange_rate_snapshots
  where id = '65000000-0000-4000-8000-000000000003'),
  '2026-07-12', 'accepted evidence freezes the economic date');
select is((select provenance ->> 'referenceDate' from public.exchange_rate_snapshots
  where id = '65000000-0000-4000-8000-000000000003'),
  '2026-07-10', 'accepted evidence freezes the actual reference date');
select is((select provenance ->> 'source' from public.exchange_rate_snapshots
  where id = '65000000-0000-4000-8000-000000000003'),
  'European Central Bank reference rate', 'ECB is attributed as economic source');

update public.ledger_rate_quotes set decimal_rate = 2.1
where id = '65000000-0000-4000-8000-000000000002';
select is((select settlement_amount_minor from public.settlement_valuation_snapshots
  where expense_id = '65000000-0000-4000-8000-000000000001' and is_active),
  19608::bigint, 'candidate correction cannot drift accepted valuation');
select is((select count(*) from public.ledger_list_auto_reference_demands(4)
  where expense_id = '65000000-0000-4000-8000-000000000001'), 0::bigint,
  'accepted valuation is not queued for automation again');
select throws_ok($$update public.exchange_rate_snapshots set provenance = '{}'::jsonb
  where id = '65000000-0000-4000-8000-000000000003'$$,
  '23514', 'exchange_rate_snapshots is append-only',
  'accepted provenance is immutable');

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
) select '65000000-0000-4000-8000-000000000006', journey_id,
  creator_member_id, created_by_user_id, updated_by_user_id, payer_member_id,
  'Next Expense', occurred_at, economic_date, 25040,
  original_currency, original_currency_scale, 'RATE_REQUIRED'
from public.expenses where id = '65000000-0000-4000-8000-000000000001';
select is((select count(*) from public.ledger_list_auto_reference_demands(4)
  where expense_id = '65000000-0000-4000-8000-000000000006'), 1::bigint,
  'accepted evidence on another Expense does not bleed into a new Expense');

select * from finish();
rollback;
