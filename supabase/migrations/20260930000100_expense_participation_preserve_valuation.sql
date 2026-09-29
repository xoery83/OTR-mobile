-- Participation changes alter Settlement membership, not rate or split evidence.
do $$
declare
  definition text;
  old_guard text := 'not (intent -> ''patch'' ? ''financial'' or intent -> ''patch'' ? ''participantSplit'')';
  new_guard text := 'not (intent -> ''patch'' ? ''participantSplit'') and coalesce((intent #> ''{patch,financial}'') - ''settlementParticipation'', ''{}''::jsonb) = ''{}''::jsonb and response_body_value #>> ''{entity,businessStatus}'' = current_expense.business_status';
  old_update text := 'update public.expenses set title=canonical_value ->> ''title''';
  new_update text := 'update public.expenses set settlement_participation=canonical_value ->> ''settlementParticipation'', title=canonical_value ->> ''title''';
  old_groups text := '''{DESCRIPTIVE}'',hash_value,jsonb_build_object';
  new_groups text := 'array_remove(array[case when intent -> ''patch'' ? ''descriptive'' then ''DESCRIPTIVE'' end, case when intent #> ''{patch,financial}'' ? ''settlementParticipation'' then ''FINANCIAL_CORE'' end],null),hash_value,jsonb_build_object';
begin
  definition := pg_get_functiondef('public.ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)'::regprocedure);
  if position(old_guard in definition) = 0 or position(old_update in definition) = 0 or position(old_groups in definition) = 0
  then raise exception 'UNEXPECTED_EXPENSE_V2_DEFINITION'; end if;
  definition := replace(definition, old_guard, new_guard);
  definition := replace(definition, old_update, new_update);
  definition := replace(definition, old_groups, new_groups);
  execute definition;
end;
$$;
notify pgrst, 'reload schema';
