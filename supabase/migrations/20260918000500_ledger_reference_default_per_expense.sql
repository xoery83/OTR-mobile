-- The Journey setting is legacy/import metadata, not a new Expense's method.
-- Existing accepted snapshots and Phase D semantic blocks remain per Expense.
do $$
declare
  function_name text;
  definition text;
  updated text;
begin
  foreach function_name in array array[
    'public.ledger_list_auto_reference_demands(integer)',
    'public.ledger_claim_settlement_rate_demands(uuid,integer)',
    'public.ledger_list_settlement_auto_reference_demands(uuid,integer)'
  ] loop
    definition := pg_get_functiondef(function_name::regprocedure);
    updated := replace(definition,
      'and s.valuation_policy = ''REFERENCE_RATE''', '');
    if updated = definition then
      raise exception 'Expected legacy policy gate missing in %', function_name;
    end if;
    execute updated;
  end loop;

  definition := pg_get_functiondef(
    'public.ledger_apply_valuation_c(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,boolean)'::regprocedure);
  updated := regexp_replace(definition,
    '\s*if automatic_reference and settings\.valuation_policy <> ''REFERENCE_RATE'' then\s*raise exception ''AUTO_VALUATION_NOT_ELIGIBLE'';\s*end if;',
    '', 'i');
  if updated = definition then
    raise exception 'Expected Stage C Journey policy gate missing';
  end if;
  execute updated;
end $$;
notify pgrst, 'reload schema';
