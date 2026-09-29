begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

-- Isolate the source formatter; every replacement is rolled back at the end.
create or replace function public.ledger_settlement_source_7_1(
  target_journey uuid, through_timestamp_value timestamptz
) returns jsonb language sql stable set search_path = public as $$
  select '{"members":[],"expenses":[
    {"id":"rate","participants":[],"valuation":{"decimalRate":0.011189760712298275}},
    {"id":"unvalued","participants":[],"valuation":null}
  ]}'::jsonb;
$$;
create temporary table exact_source as
select public.ledger_personal_financial_source_3b(
  '10000000-0000-4000-8000-000000000001', now()
) as value;
select is(jsonb_typeof((select value #> '{expenses,0,valuation,decimalRate}' from exact_source)),
  'string', 'checkpoint source carries exact rates as strings');
select is((select value #>> '{expenses,0,valuation,decimalRate}' from exact_source),
  '0.011189760712298275', 'all high-precision rate digits survive transport');
select is((select value #> '{expenses,1,valuation}' from exact_source),
  'null'::jsonb, 'unresolved valuations remain null');
select * from finish();
rollback;
