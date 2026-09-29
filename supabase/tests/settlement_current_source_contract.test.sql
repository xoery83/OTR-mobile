begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);
set local role service_role;

insert into public.ledger_settings (journey_id, settlement_currency, settlement_scale, valuation_policy)
values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE');
insert into public.expenses (id, journey_id, creator_member_id, created_by_user_id,
  updated_by_user_id, payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status)
select ('51000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  jm.trip_id, jm.id, jm.user_id, jm.user_id, jm.id, 'Correction source contract ' || n,
  '2026-09-01T00:00:00Z', n * 100, 'NZD', 2, 'ACCEPTED'
from public.journey_members jm cross join generate_series(1, 5) n
where jm.trip_id = '10000000-0000-4000-8000-000000000001'
  and jm.user_id = '00000000-0000-4000-8000-000000000001';
insert into public.settlements (id, journey_id, settlement_currency, settlement_scale,
  settings_revision, status, through_timestamp, input_digest, algorithm_version,
  created_by, finalized_by, finalized_at)
values ('52000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 1, 'FINALIZED',
  '2026-09-01T23:59:59Z', repeat('1',64), 'ledger-settlement-greedy-v1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', '2026-09-02T00:00:00Z');
-- Fixture lineage only, rolled back. No finalization command is invoked.
insert into public.expense_correction_successors (id, journey_id, root_settlement_id,
  source_expense_id, successor_expense_id, actor_user_id, reason)
select ('53000000-0000-4000-8000-' || lpad(a::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001',
  ('51000000-0000-4000-8000-' || lpad(a::text,12,'0'))::uuid,
  ('51000000-0000-4000-8000-' || lpad(b::text,12,'0'))::uuid,
  '00000000-0000-4000-8000-000000000001', 'Synthetic correction chain'
from (values (1,2),(2,3),(4,5)) chain(a,b);
create temporary table source_contract as select
  public.ledger_adjustment_source_current_7_2c(
    '52000000-0000-4000-8000-000000000001', clock_timestamp()) as value;
select is(jsonb_array_length(public.ledger_settlement_source_7_1(
  '10000000-0000-4000-8000-000000000001', clock_timestamp())->'expenses'),5,
  'initial raw source retains all historical identities');
select is(jsonb_array_length((select value->'expenses' from source_contract)),2,
  'current root source excludes every predecessor in multiple correction chains');
select is((select jsonb_agg(e->>'id' order by e->>'id')
  from source_contract, jsonb_array_elements(value->'expenses') e),
  '["51000000-0000-4000-8000-000000000003","51000000-0000-4000-8000-000000000005"]'::jsonb,
  'only terminal successors remain effective');
select is((select count(*)::integer from public.expenses where id::text like '51000000-%'),5,
  'source reads do not mutate historical Expense records');
select is(public.ledger_adjustment_source_current_7_2c(
  '52000000-0000-4000-8000-000000000001',
  (select (value->>'throughTimestamp')::timestamptz from source_contract)),
  (select value from source_contract), 'same-cutoff refresh is stable');
select throws_ok($$select public.ledger_adjustment_source_current_7_2c(
  '52000000-0000-4000-8000-000000000001','2026-08-31T00:00:00Z')$$,
  'P0001','SETTLEMENT_INPUT_STALE','cutoff before frozen root remains rejected');
select throws_ok($$select public.ledger_adjustment_source_current_7_2c(
  '52000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour')$$,
  'P0001','SETTLEMENT_INPUT_STALE','future cutoff remains rejected');
select ok(not has_function_privilege('authenticated',
  'public.ledger_adjustment_source_current_7_2c(uuid,timestamptz)','EXECUTE'),
  'Mobile cannot bypass Backend for correction-aware source');
select throws_ok($$select public.ledger_adjustment_source_current_7_2c(
  '52000000-0000-4000-8000-000000000099',clock_timestamp())$$,
  'P0001','ENTITY_NOT_FOUND','missing root cannot fall back to raw inputs');
select * from finish();
rollback;
