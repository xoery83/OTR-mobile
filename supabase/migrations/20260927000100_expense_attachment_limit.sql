-- Serialize Expense attachment claims through the parent row. Personal Payment evidence
-- has no Expense id and is outside this limit.
create function public.ledger_limit_expense_attachments()
returns trigger language plpgsql set search_path = public as $$
declare
  attachment_count integer;
begin
  if new.expense_id is null or (tg_op = 'UPDATE' and new.expense_id is not distinct from old.expense_id) then
    return new;
  end if;

  perform 1 from public.expenses where id = new.expense_id and journey_id = new.journey_id for update;
  if not found then
    raise exception 'EXPENSE_ATTACHMENT_TARGET_INVALID' using errcode = '23514';
  end if;

  select count(*) into attachment_count from public.receipt_assets
    where expense_id = new.expense_id and id <> new.id;
  if attachment_count >= 3 then
    raise exception 'EXPENSE_ATTACHMENT_LIMIT_REACHED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger receipt_assets_expense_attachment_limit
before insert or update of expense_id on public.receipt_assets
for each row execute function public.ledger_limit_expense_attachments();
