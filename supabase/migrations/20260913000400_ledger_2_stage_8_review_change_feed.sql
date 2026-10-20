-- Deploy only after Mobile schema/DTO and Backend review support are live in Dev.
alter table public.ledger_changes drop constraint ledger_changes_entity_type_check;
alter table public.ledger_changes add constraint ledger_changes_entity_type_check
  check (entity_type in ('EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER',
    'TRANSFER_PAYMENT', 'HOUSEHOLD', 'RATE_QUOTE', 'PAYMENT_RECORD', 'RECEIPT',
    'REVIEW_FINDING'));

create trigger ledger_review_findings_change
after insert or update on public.ledger_review_findings
for each row execute function public.ledger_record_change('REVIEW_FINDING');

notify pgrst, 'reload schema';
