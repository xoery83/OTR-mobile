-- Ledger 2.0 is backend-only. Authenticated users receive no PostgREST table access.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ledger_settings', 'households', 'household_members', 'expenses',
    'expense_participants', 'expense_splits', 'exchange_rate_snapshots',
    'payment_records', 'settlement_valuation_snapshots', 'expense_links',
    'expense_audit_events', 'expense_correction_requests', 'settlements',
    'settlement_inputs', 'settlement_member_balances', 'settlement_transfers',
    'settlement_payments', 'ledger_review_findings', 'ledger_idempotency_keys',
    'ledger_changes'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke all on sequence public.ledger_changes_sequence_seq from public, anon, authenticated;
grant usage, select on sequence public.ledger_changes_sequence_seq to service_role;

revoke execute on function public.ledger_touch_revision() from public, anon, authenticated;
revoke execute on function public.ledger_reject_immutable_change() from public, anon, authenticated;
revoke execute on function public.ledger_validate_expense(uuid) from public, anon, authenticated;
revoke execute on function public.ledger_validate_expense_trigger() from public, anon, authenticated;
revoke execute on function public.ledger_record_change() from public, anon, authenticated;
revoke execute on function public.ledger_guard_valuation_snapshot() from public, anon, authenticated;
revoke execute on function public.ledger_validate_household_member() from public, anon, authenticated;
revoke execute on function public.ledger_validate_settlement(uuid) from public, anon, authenticated;
revoke execute on function public.ledger_validate_settlement_trigger() from public, anon, authenticated;

grant execute on function public.ledger_touch_revision() to service_role;
grant execute on function public.ledger_reject_immutable_change() to service_role;
grant execute on function public.ledger_validate_expense(uuid) to service_role;
grant execute on function public.ledger_validate_expense_trigger() to service_role;
grant execute on function public.ledger_record_change() to service_role;
grant execute on function public.ledger_guard_valuation_snapshot() to service_role;
grant execute on function public.ledger_validate_household_member() to service_role;
grant execute on function public.ledger_validate_settlement(uuid) to service_role;
grant execute on function public.ledger_validate_settlement_trigger() to service_role;

notify pgrst, 'reload schema';
