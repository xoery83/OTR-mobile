begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set local role service_role;
select plan(9);

insert into public.journey_members (id, trip_id, user_id, display_name, role, status, linked_at)
values ('12000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'Owner', 'owner', 'linked', now())
on conflict (trip_id, user_id) do update set status = 'linked';

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) select
  '47000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  member.id, '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', member.id,
  'Receipt tombstones', now(), 100, 'NZD', 2, 'ACCEPTED'
from public.journey_members member
where member.trip_id = '10000000-0000-4000-8000-000000000001'
  and member.user_id = '00000000-0000-4000-8000-000000000001';

insert into public.receipt_assets (
  id, journey_id, local_id, created_by, object_path, mime_type, size_bytes,
  sha256, upload_status
) values (
  '48000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000001',
  'historical-unlinked-candidate', '00000000-0000-4000-8000-000000000001',
  'tombstone-test/unlinked', 'image/jpeg', 1, repeat('a', 64), 'UPLOADED'
);

insert into public.receipt_assets (
  id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
)
select ('48000000-0000-4000-8000-00000000001' || n)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000002', 'tombstone-receipt-' || n,
  '00000000-0000-4000-8000-000000000001', 'tombstone-test/' || n,
  'image/jpeg', 1, repeat('a', 64)
from generate_series(1, 3) n;

select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000002' and deleted_at is null), 3,
  'three active attachments are present');

update public.receipt_assets set deleted_at = now()
where id = '48000000-0000-4000-8000-000000000011';
select is((select count(*)::integer from public.receipt_assets
  where expense_id = '47000000-0000-4000-8000-000000000002' and deleted_at is null), 2,
  'logical deletion immediately frees one slot');
select is((select count(*)::integer from public.receipt_assets
  where id = '48000000-0000-4000-8000-000000000011' and deleted_at is not null), 1,
  'tombstone row remains for recovery');

select lives_ok($$
  insert into public.receipt_assets (
    id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
  ) values (
    '48000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002', 'tombstone-receipt-4',
    '00000000-0000-4000-8000-000000000001', 'tombstone-test/4',
    'image/jpeg', 1, repeat('a', 64)
  )$$, 'a new third attachment is accepted');

select throws_ok($$
  insert into public.receipt_assets (
    id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
  ) values (
    '48000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002', 'tombstone-receipt-5',
    '00000000-0000-4000-8000-000000000001', 'tombstone-test/5',
    'image/jpeg', 1, repeat('a', 64)
  )$$, '23514', 'EXPENSE_ATTACHMENT_LIMIT_REACHED', 'fourth active attachment is rejected');

select throws_ok($$
  update public.receipt_assets set deleted_at = null
  where id = '48000000-0000-4000-8000-000000000011'
$$, '23514', 'EXPENSE_ATTACHMENT_TOMBSTONED', 'stale restore cannot resurrect tombstone');

select lives_ok($$
  insert into public.receipt_assets (
    id, journey_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
  ) values (
    '48000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000001',
    'payment-evidence-after-tombstone', '00000000-0000-4000-8000-000000000001',
    'tombstone-test/payment', 'image/jpeg', 1, repeat('a', 64)
  )$$, 'unlinked Personal Payment evidence remains valid');

select is((select count(*)::integer from public.receipt_assets
  where id = '48000000-0000-4000-8000-000000000017'
    and expense_id is null and deleted_at is null), 1,
  'uploaded unlinked candidate metadata is retained');

select ok(pg_get_functiondef('public.ledger_limit_expense_attachments()'::regprocedure)
  ~* 'for update', 'add and tombstone coordinate on Expense row lock');
select * from finish();
rollback;
