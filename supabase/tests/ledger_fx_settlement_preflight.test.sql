begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);
set local role service_role;

select ok(has_function_privilege('service_role',
  'public.ledger_claim_settlement_rate_demands(uuid,integer)', 'EXECUTE'),
  'service role can claim foreground demand');
select ok(not has_function_privilege('authenticated',
  'public.ledger_claim_settlement_rate_demands(uuid,integer)', 'EXECUTE'),
  'Mobile cannot claim provider work');
select ok(not has_function_privilege('authenticated',
  'public.ledger_list_settlement_auto_reference_demands(uuid,integer)', 'EXECUTE'),
  'Mobile cannot select canonical acceptance demand');

insert into public.ledger_settings(journey_id, settlement_currency, settlement_scale, valuation_policy)
values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'MANUAL_AGREED');
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values (
  '67000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  'Settlement preflight EUR', '2026-07-15T00:00:00Z', '2026-07-15',
  1200, 'EUR', 2, 'RATE_REQUIRED'
);
insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, economic_date, original_amount_minor,
  original_currency, original_currency_scale, business_status,
  settlement_participation
) values (
  '67000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  'Excluded USD', '2026-07-16T00:00:00Z', '2026-07-16',
  1200, 'USD', 2, 'RATE_REQUIRED', 'EXCLUDED'
);
select is((select count(*) from public.ledger_claim_settlement_rate_demands(
  '10000000-0000-4000-8000-000000000001', 4)), 1::bigint,
  'legacy manual Journey setting does not block a new Expense reference demand');
update public.ledger_settings set valuation_policy = 'REFERENCE_RATE'
where journey_id = '10000000-0000-4000-8000-000000000001';
select is((select count(*) from public.ledger_claim_settlement_rate_demands(
  '10000000-0000-4000-8000-000000000002', 4)), 0::bigint,
  'other Journey demand cannot leak into target');
select is((select count(*) from public.ledger_claim_settlement_rate_demands(
  '10000000-0000-4000-8000-000000000001', 4)), 0::bigint,
  'the selected Journey does not reclaim its leased included pair');
select is((select count(*) from public.ledger_claim_rate_demands(4)
  where quote_currency = 'EUR'), 0::bigint,
  'background scanner does not reclaim foreground lease');
select is((select count(*) from public.ledger_rate_quote_attempts
  where quote_currency = 'USD'), 1::bigint,
  'background scanner still independently handles excluded demand');
select is((select count(*) from public.ledger_claim_settlement_rate_demands(
  '10000000-0000-4000-8000-000000000001', 4)), 0::bigint,
  'foreground retry shares the lease');

select * from finish();
rollback;
