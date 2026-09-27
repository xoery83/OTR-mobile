-- Expense attachment deletion retains metadata and private bytes for recovery.
alter table public.receipt_assets add column deleted_at timestamptz;
alter table public.receipt_assets add constraint receipt_assets_expense_tombstone_only
  check (deleted_at is null or expense_id is not null);

create or replace function public.ledger_limit_expense_attachments()
returns trigger language plpgsql set search_path = public as $$
declare
  attachment_count integer;
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is distinct from old.deleted_at or
       new.expense_id is distinct from old.expense_id then
      raise exception 'EXPENSE_ATTACHMENT_TOMBSTONED' using errcode = '23514';
    end if;
  end if;
  if new.expense_id is null or
     (tg_op = 'UPDATE' and new.expense_id is not distinct from old.expense_id
      and new.deleted_at is not distinct from old.deleted_at) then
    return new;
  end if;

  perform 1 from public.expenses
    where id = new.expense_id and journey_id = new.journey_id for update;
  if not found then
    raise exception 'EXPENSE_ATTACHMENT_TARGET_INVALID' using errcode = '23514';
  end if;
  if new.deleted_at is not null then return new; end if;

  select count(*) into attachment_count from public.receipt_assets
    where expense_id = new.expense_id and deleted_at is null and id <> new.id;
  if attachment_count >= 3 then
    raise exception 'EXPENSE_ATTACHMENT_LIMIT_REACHED' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger receipt_assets_expense_attachment_limit on public.receipt_assets;
create trigger receipt_assets_expense_attachment_limit
before insert or update of expense_id, deleted_at on public.receipt_assets
for each row execute function public.ledger_limit_expense_attachments();

create index receipt_assets_active_expense_idx on public.receipt_assets(expense_id)
  where expense_id is not null and deleted_at is null;
