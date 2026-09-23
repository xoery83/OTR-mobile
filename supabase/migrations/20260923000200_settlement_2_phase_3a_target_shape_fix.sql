-- Permit Review findings whose typed target is a Personal Payment rather than an Expense/Settlement.
alter table public.ledger_review_findings
  drop constraint ledger_review_findings_check;
alter table public.ledger_review_findings
  add constraint ledger_review_findings_target_check check (
    expense_id is not null or settlement_id is not null or personal_payment_id is not null
  );

notify pgrst, 'reload schema';
