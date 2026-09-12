-- Nested invoker functions need explicit service-role execution on Hosted Dev.
grant execute on function public.ledger_assert_payment_proposition_7_2a(
  public.settlement_transfers, jsonb
) to service_role;
grant execute on function public.ledger_refresh_transfer_7_2a(uuid)
  to service_role;

notify pgrst, 'reload schema';
