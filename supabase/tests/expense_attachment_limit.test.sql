begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set local role service_role;
select plan(9);

insert into public.journey_members (id, trip_id, user_id, display_name, role, status, linked_at)
values ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'Owner', 'owner', 'linked', now())
on conflict (trip_id, user_id) do update set status = 'linked';

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) select
  '47000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  member.id, '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', member.id,
  'Receipt limit', now(), 100, 'NZD', 2, 'ACCEPTED'
from public.journey_members member
where member.trip_id = '10000000-0000-4000-8000-000000000001'
  and member.user_id = '00000000-0000-4000-8000-000000000001';

select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000001'), 0,
  'new Expense starts with zero attachments');

insert into public.receipt_assets (
  id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
)
select ('48000000-0000-4000-8000-00000000000' || n)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001', 'expense-receipt-' || n,
  '00000000-0000-4000-8000-000000000001', 'expense-limit/' || n,
  'image/jpeg', 1, repeat('a', 64)
from generate_series(1, 1) n;

select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000001'), 1,
  'Expense can add attachment one');

insert into public.receipt_assets (
  id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
)
select ('48000000-0000-4000-8000-00000000000' || n)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001', 'expense-receipt-' || n,
  '00000000-0000-4000-8000-000000000001', 'expense-limit/' || n,
  'image/jpeg', 1, repeat('a', 64)
from generate_series(2, 2) n;

select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000001'), 2,
  'Expense can add attachment two');

insert into public.receipt_assets (
  id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
)
select ('48000000-0000-4000-8000-00000000000' || n)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001', 'expense-receipt-' || n,
  '00000000-0000-4000-8000-000000000001', 'expense-limit/' || n,
  'image/jpeg', 1, repeat('a', 64)
from generate_series(3, 3) n;

select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000001'), 3,
  'three Expense receipts are allowed');

select lives_ok($$
  update public.receipt_assets set expense_id = '47000000-0000-4000-8000-000000000001'
  where id = '48000000-0000-4000-8000-000000000001'
$$, 'idempotent link replay does not consume another slot');

select throws_ok($$
  insert into public.receipt_assets (
    id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
  ) values (
    '48000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001', 'expense-receipt-4',
    '00000000-0000-4000-8000-000000000001', 'expense-limit/4',
    'image/jpeg', 1, repeat('a', 64)
  )$$, '23514', 'EXPENSE_ATTACHMENT_LIMIT_REACHED', 'fourth Expense receipt is rejected');

select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000001'), 3,
  'rejected receipt leaves no fourth linked metadata row');

select lives_ok($$
  insert into public.receipt_assets (
    id, journey_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
  ) values (
    '48000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
    'personal-evidence', '00000000-0000-4000-8000-000000000001',
    'personal-evidence/5', 'image/jpeg', 1, repeat('a', 64)
  )$$, 'unlinked Personal Payment evidence is unaffected');

select ok(pg_get_functiondef('public.ledger_limit_expense_attachments()'::regprocedure)
  ~* 'for update', 'Expense row lock serializes competing claims');

select * from finish();
rollback;
