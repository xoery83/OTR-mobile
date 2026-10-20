begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

-- Transport-only fixture; all function replacements roll back. No Confirm command.
create or replace function public.ledger_adjustment_source_current_7_2c(
  target_root uuid, source_cutoff timestamptz
) returns jsonb language sql set search_path = public as $$
  select jsonb_build_object('throughTimestamp', source_cutoff,
    'expenses', '[{"valuation":{"decimalRate":0.011189760712298275}}]'::jsonb);
$$;
create or replace function public.ledger_adjustment_source_7_2b(target_root uuid)
returns jsonb language sql set search_path = public as $$
  select '{"expenses":[{"valuation":{"decimalRate":0.011189760712298275}}]}'::jsonb;
$$;

select is(public.ledger_adjustment_source_text_7_2c(
  '52000000-0000-4000-8000-000000000001','2026-09-29T00:00:00Z')::jsonb,
  public.ledger_adjustment_source_current_7_2c(
  '52000000-0000-4000-8000-000000000001','2026-09-29T00:00:00Z'),
  'current source text proof remains exactly equal to transaction JSONB source');
select is(public.ledger_adjustment_source_text_7_2c(
  '52000000-0000-4000-8000-000000000001')::jsonb,
  public.ledger_adjustment_source_7_2b('52000000-0000-4000-8000-000000000001'),
  'root-cutoff source selection is unchanged');
select is(public.ledger_adjustment_source_text_7_2c(
  '52000000-0000-4000-8000-000000000001')::jsonb #>> '{expenses,0,valuation,decimalRate}',
  '0.011189760712298275','every SQL decimal digit survives JSON text transport');
select isnt(public.ledger_adjustment_source_text_7_2c(
  '52000000-0000-4000-8000-000000000001')::jsonb,
  '{"expenses":[{"valuation":{"decimalRate":0.011189760712298274}}]}'::jsonb,
  'strict equality still rejects the rounded JavaScript value');
select ok(not has_function_privilege('authenticated',
  'public.ledger_adjustment_source_text_7_2c(uuid,timestamptz)','EXECUTE'),
  'Mobile has no direct transport RPC access');
select ok(has_function_privilege('service_role',
  'public.ledger_adjustment_source_text_7_2c(uuid,timestamptz)','EXECUTE'),
  'Backend retains read access');
select * from finish();
rollback;
