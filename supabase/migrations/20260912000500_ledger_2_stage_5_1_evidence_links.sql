-- Forward-only follow-up: link evidence audit/rate history without rewriting the
-- already-applied Stage 5.1 migration.

create or replace function public.ledger_link_payment_audit_5_1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  payment_id uuid;
begin
  if new.event_type not in ('PAYMENT_RECORD_ADDED', 'PAYMENT_RECORD_SUPERSEDED') then
    return new;
  end if;
  select p.id into payment_id
  from public.payment_records p
  where p.expense_id = new.expense_id
    and p.created_by = new.actor_user_id
    and not exists (
      select 1 from public.expense_audit_events a
      where a.metadata ->> 'paymentRecordId' = p.id::text
    )
  order by p.created_at desc, p.id desc
  limit 1;
  if payment_id is not null then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('paymentRecordId', payment_id);
  end if;
  return new;
end;
$$;

create trigger ledger_link_payment_audit_5_1
before insert on public.expense_audit_events
for each row execute function public.ledger_link_payment_audit_5_1();

create or replace function public.ledger_link_rate_snapshot_5_1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.supersedes_rate_snapshot_id is null then
    select v.rate_snapshot_id into new.supersedes_rate_snapshot_id
    from public.settlement_valuation_snapshots v
    where v.expense_id = new.expense_id and v.rate_snapshot_id is not null
    order by v.expense_revision desc, v.created_at desc
    limit 1;
  end if;
  return new;
end;
$$;

create trigger ledger_link_rate_snapshot_5_1
before insert on public.exchange_rate_snapshots
for each row execute function public.ledger_link_rate_snapshot_5_1();

revoke all on function public.ledger_link_payment_audit_5_1() from public;
revoke all on function public.ledger_link_rate_snapshot_5_1() from public;
