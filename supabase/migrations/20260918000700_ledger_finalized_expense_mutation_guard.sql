-- Protect every Expense already captured by a finalized Settlement input.
-- Completed RPC replays return before touching this table.
create or replace function public.ledger_guard_finalized_expense_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.settlement_inputs input
    join public.settlements settlement on settlement.id = input.settlement_id
    where input.expense_id = old.id
      and settlement.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
  ) then
    raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ledger_guard_finalized_expense_mutation()
  from public, anon, authenticated;
grant execute on function public.ledger_guard_finalized_expense_mutation()
  to service_role;

create trigger expenses_finalized_input_guard
before update or delete on public.expenses
for each row execute function public.ledger_guard_finalized_expense_mutation();
