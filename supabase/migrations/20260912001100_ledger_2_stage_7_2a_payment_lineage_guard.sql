create unique index settlement_payments_one_replacement_per_payment_idx
  on public.settlement_payments (supersedes_payment_id)
  where supersedes_payment_id is not null;
