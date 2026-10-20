begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set local role service_role;
select plan(4);

select has_column('public', 'receipt_assets', 'storage_provider',
  'receipt metadata has a storage provider');
select is((select is_nullable from information_schema.columns
  where table_schema = 'public' and table_name = 'receipt_assets'
    and column_name = 'storage_provider'), 'NO', 'provider is required');
select ok((select column_default::text from information_schema.columns
  where table_schema = 'public' and table_name = 'receipt_assets'
    and column_name = 'storage_provider') like '%supabase_storage%',
  'historical rows default to Supabase');

insert into public.receipt_assets (
  id, journey_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
) values (
  '49000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'phase2a-default', '00000000-0000-4000-8000-000000000001',
  'phase2a/default', 'image/jpeg', 1, repeat('a', 64)
);
select is((select storage_provider from public.receipt_assets
  where id = '49000000-0000-4000-8000-000000000001'),
  'supabase_storage', 'receipt insert without provider remains Supabase-backed');

select * from finish();
rollback;
