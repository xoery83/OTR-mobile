begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);
set local role service_role;

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values
  ('45000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002',
   'B2 EUR', '2026-07-15T00:00:00Z', '2026-07-15', 1200, 'EUR', 2, 'RATE_REQUIRED'),
  ('45000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002',
   'B2 EUR duplicate', '2026-07-15T00:00:00Z', '2026-07-15', 1200, 'EUR', 2, 'RATE_REQUIRED'),
  ('45000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002',
   'B2 unknown date', '2026-07-15T00:00:00Z', null, 1200, 'EUR', 2, 'RATE_REQUIRED'),
  ('45000000-0000-4000-8000-000000000004',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002',
   'B2 same currency', '2026-07-15T00:00:00Z', '2026-07-15', 1200, 'NZD', 2, 'RATE_REQUIRED');

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
)
select gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  'B2 duplicate ' || n, '2026-07-15T00:00:00Z', '2026-07-15',
  1200, 'EUR', 2, 'RATE_REQUIRED'
from generate_series(1, 28) n;

select is((select count(*) from public.ledger_claim_rate_demands(20)), 1::bigint,
  '30 Expenses sharing a date/pair create one durable demand');
select is((select count(*) from public.ledger_claim_rate_demands(20)), 0::bigint,
  'leased demand is not claimed twice');
select is((select count(*) from public.ledger_rate_quote_attempts), 1::bigint,
  'unknown date and same currency produce no attempt');
select is((select economic_date::text from public.ledger_rate_quote_attempts limit 1),
  '2026-07-15', 'demand date comes from explicit economic_date');

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values
  ('45000000-0000-4000-8000-000000000005',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002',
   'B2 another date', '2026-07-16T00:00:00Z', '2026-07-16', 1200, 'EUR', 2, 'RATE_REQUIRED'),
  ('45000000-0000-4000-8000-000000000006',
   '10000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000002',
   '12000000-0000-4000-8000-000000000002',
   'B2 another pair', '2026-07-15T00:00:00Z', '2026-07-15', 1200, 'USD', 2, 'RATE_REQUIRED');
select is((select count(*) from public.ledger_claim_rate_demands(20)), 2::bigint,
  'different economic dates and currency pairs remain distinct');
select is((select count(*) from public.ledger_rate_quote_attempts), 3::bigint,
  'distinct demands persist independently');

insert into public.ledger_rate_quotes (
  journey_id, quote_currency, base_currency, decimal_rate, effective_date,
  economic_date, reference_date, policy_version, observed_at, expires_at,
  provider, provider_reference
) values (
  '10000000-0000-4000-8000-000000000001', 'EUR', 'NZD', 1.98,
  '2026-07-10', '2026-07-15', '2026-07-10', 'ECB_DAILY_V1',
  now(), now() + interval '30 days', 'ECB', 'https://api.frankfurter.dev/'
);
select is((select count(*) from public.ledger_claim_rate_demands(20)), 0::bigint,
  'cached candidate satisfies demand');
select is((select business_status from public.expenses
  where id = '45000000-0000-4000-8000-000000000001'),
  'RATE_REQUIRED', 'candidate does not accept or value the Expense');
select is((select reference_date::text from public.ledger_rate_quotes
  where economic_date = '2026-07-15'), '2026-07-10',
  'requested and actual reference dates stay distinct');
select is((select decimal_rate_text from public.ledger_rate_quotes
  where economic_date = '2026-07-15'), '1.980000000000000000',
  'candidate decimal is readable as exact text without JS number conversion');
select throws_ok($$
  insert into public.ledger_rate_quotes (
    journey_id, quote_currency, base_currency, decimal_rate, effective_date,
    economic_date, reference_date, policy_version, observed_at, expires_at, provider
  ) values (
    '10000000-0000-4000-8000-000000000001', 'USD', 'NZD', 1.1,
    '2026-07-07', '2026-07-15', '2026-07-07', 'ECB_DAILY_V1', now(), now(), 'ECB'
  )
$$, '23514', null, 'reference beyond seven days is rejected by Dev schema');
select throws_ok($$
  insert into public.ledger_rate_quotes (
    journey_id, quote_currency, base_currency, decimal_rate, effective_date,
    economic_date, reference_date, policy_version, observed_at, expires_at, provider
  ) values (
    '10000000-0000-4000-8000-000000000001', 'USD', 'NZD', 1.1,
    '2026-07-16', '2026-07-15', '2026-07-16', 'ECB_DAILY_V1', now(), now(), 'ECB'
  )
$$, '23514', null, 'future reference is rejected by Dev schema');

select * from finish();
rollback;
