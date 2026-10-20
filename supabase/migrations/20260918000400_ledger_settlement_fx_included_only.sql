-- Foreground Settlement work targets only included Expenses. Background B2/C
-- demand remains unchanged for the rest of the Journey.
do $$
declare
  function_name text;
  definition text;
begin
  foreach function_name in array array[
    'public.ledger_claim_settlement_rate_demands(uuid,integer)',
    'public.ledger_list_settlement_auto_reference_demands(uuid,integer)'
  ] loop
    definition := pg_get_functiondef(function_name::regprocedure);
    if position('where e.journey_id = target_journey' in definition) = 0 then
      raise exception 'Settlement demand definition changed: %', function_name;
    end if;
    execute replace(definition,
      'where e.journey_id = target_journey',
      'where e.journey_id = target_journey and e.settlement_participation = ''INCLUDED''');
  end loop;
end $$;
notify pgrst, 'reload schema';
