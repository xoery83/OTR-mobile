-- Existing receipt objects remain in the private Supabase Storage bucket.
alter table public.receipt_assets
  add column storage_provider text not null default 'supabase_storage'
  check (char_length(storage_provider) between 1 and 64);
