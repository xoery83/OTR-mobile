create unique index settlements_one_active_7_1
  on public.settlements(journey_id)
  where status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
    and algorithm_version = 'ledger-settlement-greedy-v1';

notify pgrst, 'reload schema';
