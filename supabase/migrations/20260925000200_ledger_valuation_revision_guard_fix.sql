-- Qualify the later-current-revision guard with the already-validated command
-- base revision. The previous migration's bare expense_revision name collided
-- with settlement_inputs.expense_revision at PL/pgSQL statement planning.
do $$
declare definition text; updated text;
begin
  definition := pg_get_functiondef(
    'public.ledger_apply_valuation_5_1(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)'::regprocedure);
  updated := replace(definition,
    'si.expense_revision >= expense_revision',
    'si.expense_revision >= (valuation_value ->> ''baseRevision'')::bigint');
  if updated = definition then raise exception 'Expected revision guard missing'; end if;
  execute updated;
end $$;
notify pgrst, 'reload schema';
