begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);
set local role service_role;

delete from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';
insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Synthetic Owner', 'owner', 'linked', now()
) on conflict (trip_id, user_id) do update set role = 'owner', status = 'linked';
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE')
on conflict (journey_id) do update set settlement_currency = 'NZD', settlement_scale = 2;

select has_table('public', 'personal_settlement_payment_fx_projections',
  'projection table exists');
select has_table('public', 'personal_settlement_payment_fx_projection_audit_events',
  'projection audit table exists');
select has_column('public', 'personal_settlement_payment_records', 'economic_date',
  'payment economic date exists');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001', 'CREATE', null,
    '74100000-0000-4000-8000-000000000001', 'slice-c-create',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":1000,"currency":"USD","scale":2,"occurredAt":"2026-09-20T23:30:00-04:00","economicDate":"2026-09-20","recordedEquivalentMinor":999999,"recordedEquivalentCurrency":"NZD","recordedEquivalentScale":2}', null)
$$, 'new payment accepts an explicit economic date');
select is((select economic_date::text from public.personal_settlement_payment_records
  where id = '74000000-0000-4000-8000-000000000001'), '2026-09-20',
  'economic date does not drift with occurredAt timezone');
select ok((select recorded_equivalent_minor is null from public.personal_settlement_payment_records
  where id = '74000000-0000-4000-8000-000000000001'),
  'Backend ignores client-derived equivalent');

select is((select state from public.ledger_ensure_personal_payment_fx_projection_1c(
  '74000000-0000-4000-8000-000000000001', null)), 'PENDING',
  'cross-currency projection is its own durable demand');
select is((select revision from public.personal_settlement_payment_records
  where id = '74000000-0000-4000-8000-000000000001'), 1::bigint,
  'creating a projection does not edit the payment');

insert into public.ledger_rate_quotes (
  journey_id, quote_currency, base_currency, decimal_rate, effective_date,
  economic_date, reference_date, policy_version, observed_at, expires_at,
  provider, provider_reference, source_reference
) values (
  '10000000-0000-4000-8000-000000000001', 'USD', 'NZD', 1.5,
  '2026-09-18', '2026-09-20', '2026-09-18', 'ECB_DAILY_V1', now(),
  now() + interval '30 days', 'ECB',
  'https://api.frankfurter.dev/v2/providers/ecb/rate/USD/NZD?date=2026-09-20',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
);
select is(public.ledger_resolve_personal_payment_fx_projections_1c(
  '10000000-0000-4000-8000-000000000001'), 1,
  'resolver confirms one matching demand');
select is((select equivalent_minor from public.personal_settlement_payment_fx_projections
  where payment_id = '74000000-0000-4000-8000-000000000001' and target_currency = 'NZD'),
  1500::bigint, 'resolver uses exact scale-aware Money conversion');
select is((select revision from public.personal_settlement_payment_records
  where id = '74000000-0000-4000-8000-000000000001'), 1::bigint,
  'resolver does not create a false payment revision');
select is(public.ledger_resolve_personal_payment_fx_projections_1c(
  '10000000-0000-4000-8000-000000000001'), 0,
  'resolver replay is idempotent');
select is((select count(*)::integer
  from public.personal_settlement_payment_fx_projection_audit_events
  where payment_id = '74000000-0000-4000-8000-000000000001'), 2,
  'projection owns independent create and resolve audit revisions');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001', 'UPDATE', 1,
    '74100000-0000-4000-8000-000000000002', 'slice-c-update',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":2000,"currency":"USD","scale":2,"occurredAt":"2026-09-20T23:30:00-04:00","economicDate":"2026-09-20"}', null)
$$, 'payment input can change under its own revision');
select public.ledger_invalidate_personal_payment_fx_projections_1c(
  '74000000-0000-4000-8000-000000000001');
select is((select state from public.personal_settlement_payment_fx_projections
  where payment_id = '74000000-0000-4000-8000-000000000001' and target_currency = 'NZD'),
  'SUPERSEDED', 'payment input change invalidates the bound projection');
select is((select equivalent_minor from public.ledger_ensure_personal_payment_fx_projection_1c(
  '74000000-0000-4000-8000-000000000001', 'NZD')), 3000::bigint,
  'new payment revision reuses the trusted quote without double counting');

insert into public.ledger_rate_quotes (
  journey_id, quote_currency, base_currency, decimal_rate, effective_date,
  economic_date, reference_date, policy_version, observed_at, expires_at,
  provider, provider_reference, source_reference
) values (
  '10000000-0000-4000-8000-000000000001', 'USD', 'CNY', 7,
  '2026-09-18', '2026-09-20', '2026-09-18', 'ECB_DAILY_V1', now(),
  now() + interval '30 days', 'ECB',
  'https://api.frankfurter.dev/v2/providers/ecb/rate/USD/CNY?date=2026-09-20',
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
);
select is((select equivalent_minor from public.ledger_ensure_personal_payment_fx_projection_1c(
  '74000000-0000-4000-8000-000000000001', 'CNY')), 14000::bigint,
  'new Journey target gets its own projection');
select is((select count(*)::integer from public.personal_settlement_payment_fx_projections
  where payment_id = '74000000-0000-4000-8000-000000000001' and state = 'CONFIRMED'),
  2, 'old-target confirmed evidence is preserved');
select is((select count(*)::integer from public.ledger_list_personal_payment_fx_projections_1c(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001')),
  2, 'authorized reader receives both target projections');
select is((select count(*)::integer from public.ledger_list_personal_payment_fx_projections_1c(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001')),
  0, 'projection read remains account and Journey isolated');

select * from finish();
rollback;
