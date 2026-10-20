begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);
set local role service_role;

insert into public.ledger_settings(journey_id, settlement_currency, settlement_scale, valuation_policy)
values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE');
insert into public.expenses(id, journey_id, creator_member_id,
  payer_member_id, title, occurred_at, economic_date,
  original_amount_minor, original_currency, original_currency_scale,
  business_status)
values ('67000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002', 'KWD identity',
  '2026-07-12T00:00:00Z', '2026-07-12', 1001, 'KWD', 3,
  'RATE_REQUIRED');
insert into public.expense_participants(expense_id, journey_id, member_id,
  display_name_snapshot, display_order)
values ('67000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'Member', 0);
insert into public.expense_splits(expense_id, journey_id, member_id,
  split_method, original_amount_minor)
values ('67000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'EQUAL_PERSON', 1001);
create temp table preview as select public.ledger_preview_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'KWD') as body;
select lives_ok(format($$select public.ledger_commit_journey_currency(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'KWD', 1, %L, 'scale3')$$,
  (select body ->> 'previewDigest' from preview)),
  'two-decimal Journey changes to three-decimal KWD');
select is((select settlement_scale from public.ledger_settings
  where journey_id = '10000000-0000-4000-8000-000000000001'),
  3::smallint, 'KWD scale is three');
select is((select settlement_amount_minor from public.settlement_valuation_snapshots
  where expense_id = '67000000-0000-4000-8000-000000000001' and is_active),
  1001::bigint, 'KWD original identity retains exact minor units');
select * from finish();
rollback;
