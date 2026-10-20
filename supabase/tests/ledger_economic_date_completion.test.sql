begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);
set local role service_role;

insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values (
  '12000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Date-test Owner', 'owner', 'linked', now()
) on conflict (trip_id, user_id) do nothing;
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'CNY', 2, 'MANUAL_AGREED'
);
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, payer_member_id,
  title, occurred_at, original_amount_minor, original_currency,
  original_currency_scale, business_status, revision
) select
  '52000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001', m.id,
  '00000000-0000-4000-8000-000000000001', m.id,
  'Later unresolved revision', '2026-07-25T18:00:00Z', 75, 'ISK', 0,
  'RATE_REQUIRED', 3
from public.journey_members m
where m.trip_id = '10000000-0000-4000-8000-000000000001'
  and m.user_id = '00000000-0000-4000-8000-000000000001';
insert into public.expense_participants (
  expense_id, journey_id, member_id, display_name_snapshot, display_order
) select '52000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001', m.id, 'Date-test Owner', 0
from public.journey_members m
where m.trip_id = '10000000-0000-4000-8000-000000000001'
  and m.user_id = '00000000-0000-4000-8000-000000000001';
insert into public.expense_splits (
  expense_id, journey_id, member_id, split_method,
  original_amount_minor, settlement_amount_minor
) select '52000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001', m.id,
  'EQUAL_PERSON', 75, null
from public.journey_members m
where m.trip_id = '10000000-0000-4000-8000-000000000001'
  and m.user_id = '00000000-0000-4000-8000-000000000001';
insert into public.settlement_valuation_snapshots (
  id, expense_id, journey_id, expense_revision, policy,
  original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale, is_active
) values (
  '55000000-0000-4000-8000-000000000091',
  '52000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001', 1, 'LEGACY_IMPORTED',
  75, 'ISK', 0, 4, 'CNY', 2, false
);
insert into public.settlements (
  id, journey_id, settlement_currency, settlement_scale, status,
  through_timestamp, input_digest, algorithm_version
) values (
  '60000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001', 'CNY', 2,
  'PARTIALLY_PAID', '2026-07-26T00:00:00Z', 'date-test', 'date-test-v1'
);
insert into public.settlement_inputs (
  settlement_id, journey_id, expense_id, expense_revision, valuation_snapshot_id
) values (
  '60000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000091', 1,
  '55000000-0000-4000-8000-000000000091'
);
create temporary table frozen_date_test as
select to_jsonb(si) as input, to_jsonb(v) as valuation
from public.settlement_inputs si
join public.settlement_valuation_snapshots v on v.id = si.valuation_snapshot_id
where si.expense_id = '52000000-0000-4000-8000-000000000091';

select throws_ok($$update public.expenses set original_amount_minor = 76
  where id = '52000000-0000-4000-8000-000000000091'$$,
  'P0001', 'FINALIZED_SETTLEMENT_PROTECTED',
  'later revision cannot change Money through a generic update');
select lives_ok($$select public.ledger_complete_expense_economic_date_v1(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000091', 3, '2026-07-25',
  'USER_CONFIRMED_V1', 'date-test-key', 'date-test-hash',
  '{"entity":{"auditEvents":[{"id":"56000000-0000-4000-8000-000000000091"}]}}'::jsonb
)$$, 'later revision accepts explicit date-only evidence');
select is((select revision::integer from public.expenses
  where id = '52000000-0000-4000-8000-000000000091'), 4,
  'date-only command advances exactly one current revision');
select is((select economic_date::text from public.expenses
  where id = '52000000-0000-4000-8000-000000000091'), '2026-07-25',
  'explicit economic date is persisted');
select is((select metadata ->> 'source' from public.expense_audit_events
  where expense_id = '52000000-0000-4000-8000-000000000091'
    and event_type = 'ECONOMIC_DATE_COMPLETED'), 'USER_CONFIRMED_V1',
  'date evidence provenance is audited');
select is((select public.ledger_complete_expense_economic_date_v1(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000091', 3, '2026-07-25',
  'USER_CONFIRMED_V1', 'date-test-key', 'date-test-hash', '{}'::jsonb
) ->> 'idempotentReplay'), 'true', 'repeated command replays without mutation');
select is((select count(*)::integer from public.expense_audit_events
  where expense_id = '52000000-0000-4000-8000-000000000091'
    and event_type = 'ECONOMIC_DATE_COMPLETED'), 1,
  'replay creates no duplicate audit');
select ok((select f.input = to_jsonb(si) and f.valuation = to_jsonb(v)
  from frozen_date_test f, public.settlement_inputs si
  join public.settlement_valuation_snapshots v on v.id = si.valuation_snapshot_id
  where si.expense_id = '52000000-0000-4000-8000-000000000091'),
  'frozen revision and valuation remain byte-stable');
select is((select count(*)::integer from public.ledger_claim_settlement_rate_demands(
  '10000000-0000-4000-8000-000000000001', 4)), 1,
  'later current revision wakes reference demand despite old MANUAL_AGREED metadata');
insert into public.ledger_rate_quotes (
  id, journey_id, quote_currency, base_currency, decimal_rate,
  effective_date, economic_date, reference_date, policy_version,
  observed_at, expires_at, provider, provider_reference, source_reference
) values (
  '65000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001', 'ISK', 'CNY', 0.05388,
  '2026-07-24', '2026-07-25', '2026-07-24', 'ECB_DAILY_V1',
  now(), now() + interval '30 days', 'ECB',
  'https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-07-25',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
);
select is((select count(*)::integer from public.ledger_list_settlement_auto_reference_demands(
  '10000000-0000-4000-8000-000000000001', 4)
  where expense_id = '52000000-0000-4000-8000-000000000091'), 1,
  'trusted weekend quote makes the later revision visible to the scanner');
select lives_ok($sql$select public.ledger_apply_valuation_c(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000091',
  'date-auto-valuation', 'date-auto-hash',
  '{"baseRevision":4,"settingsRevision":1,"policy":"REFERENCE_RATE","economicDate":"2026-07-25","rateQuoteId":"65000000-0000-4000-8000-000000000091","reason":"Automatic ECB reference valuation","previewSettlement":{"minor":404,"currency":"CNY","scale":2}}'::jsonb,
  '{"id":"65000000-0000-4000-8000-000000000092","decimalRate":"0.05388","effectiveDate":"2026-07-24","observedAt":"2026-09-25T00:00:00Z","provider":"ECB","providerReference":"https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-07-25","stalenessState":"FRESH"}'::jsonb,
  '{"entity":{"valuation":{"id":"65000000-0000-4000-8000-000000000093","rateSnapshotId":"65000000-0000-4000-8000-000000000092","supersedesValuationId":null},"splits":[{"memberId":"12000000-0000-4000-8000-000000000091","settlementMinor":404}],"auditEvents":[{"id":"65000000-0000-4000-8000-000000000094"}]},"serverId":"52000000-0000-4000-8000-000000000091","revision":5,"updatedAt":"2026-09-25T00:00:00Z","idempotentReplay":false}'::jsonb,
  true
)$sql$, 'later revision receives an automatic previous-working-day reference valuation');
select is((select policy from public.settlement_valuation_snapshots
  where expense_id = '52000000-0000-4000-8000-000000000091' and is_active),
  'REFERENCE_RATE', 'successor valuation is authoritative reference evidence');
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, payer_member_id,
  title, occurred_at, original_amount_minor, original_currency,
  original_currency_scale, business_status
) select
  '52000000-0000-4000-8000-000000000092',
  '10000000-0000-4000-8000-000000000001', m.id,
  '00000000-0000-4000-8000-000000000001', m.id,
  'Exact frozen revision', '2026-07-25T18:00:00Z', 75, 'ISK', 0,
  'RATE_REQUIRED'
from public.journey_members m
where m.trip_id = '10000000-0000-4000-8000-000000000001'
  and m.user_id = '00000000-0000-4000-8000-000000000001';
insert into public.settlement_valuation_snapshots (
  id, expense_id, journey_id, expense_revision, policy,
  original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale, is_active
) values (
  '55000000-0000-4000-8000-000000000092',
  '52000000-0000-4000-8000-000000000092',
  '10000000-0000-4000-8000-000000000001', 1, 'LEGACY_IMPORTED',
  75, 'ISK', 0, 4, 'CNY', 2, false
);
insert into public.settlement_inputs (
  settlement_id, journey_id, expense_id, expense_revision, valuation_snapshot_id
) values (
  '60000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000092', 1,
  '55000000-0000-4000-8000-000000000092'
);
select throws_ok($$select public.ledger_complete_expense_economic_date_v1(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000092', 1, '2026-07-25',
  'USER_CONFIRMED_V1', 'frozen-date-key', 'frozen-date-hash', '{}'::jsonb
)$$, 'P0001', 'FINALIZED_SETTLEMENT_PROTECTED',
  'the exact frozen revision remains locked');
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, payer_member_id,
  title, occurred_at, original_amount_minor, original_currency,
  original_currency_scale, business_status, import_provenance
) select
  '52000000-0000-4000-8000-000000000093',
  '10000000-0000-4000-8000-000000000001', m.id,
  '00000000-0000-4000-8000-000000000001', m.id,
  'Approved Stage 9 date-only evidence', '2026-07-25T00:00:00Z', 75, 'ISK', 0,
  'RATE_REQUIRED',
  '{"occurredPrecision":"DATE","mappingVersion":"legacy-ledger-to-ledger2-v1","transformVersion":"stage9-europe-replay-v3"}'::jsonb
from public.journey_members m
where m.trip_id = '10000000-0000-4000-8000-000000000001'
  and m.user_id = '00000000-0000-4000-8000-000000000001';
select lives_ok($$select public.ledger_complete_expense_economic_date_v1(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000093', 1, '2026-07-25',
  'STAGE9_DATE_ONLY_V1', 'stage9-date-key', 'stage9-date-hash',
  '{"entity":{"auditEvents":[{"id":"56000000-0000-4000-8000-000000000093"}]}}'::jsonb
)$$, 'approved v3 date-only import may repair without user input');
select * from finish();
rollback;
