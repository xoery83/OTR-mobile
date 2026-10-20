-- Stage 5.2: receipt metadata only. Binary lives in private Storage.

create table public.receipt_assets (
  id uuid primary key,
  journey_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete restrict,
  local_id text not null check (char_length(local_id) between 1 and 200),
  created_by uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_size_bytes bigint,
  uploaded_sha256 text,
  upload_status text not null default 'PENDING' check (upload_status in ('PENDING', 'UPLOADED')),
  ocr_status text not null default 'PENDING' check (ocr_status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  ocr_suggestion jsonb check (ocr_suggestion is null or jsonb_typeof(ocr_suggestion) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, created_by, local_id),
  check ((uploaded_size_bytes is null) = (uploaded_sha256 is null)),
  check (uploaded_sha256 is null or uploaded_sha256 ~ '^[a-f0-9]{64}$')
);
create index receipt_assets_journey_expense_idx on public.receipt_assets(journey_id, expense_id, created_at desc);
create trigger receipt_assets_touch_revision before update on public.receipt_assets
for each row execute function public.ledger_touch_revision();

alter table public.ledger_changes drop constraint ledger_changes_entity_type_check;
alter table public.ledger_changes add constraint ledger_changes_entity_type_check
  check (entity_type in ('EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER',
    'TRANSFER_PAYMENT', 'HOUSEHOLD', 'RATE_QUOTE', 'PAYMENT_RECORD', 'RECEIPT'));
create trigger receipt_assets_change after insert or update on public.receipt_assets
for each row execute function public.ledger_record_change('RECEIPT');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ledger-receipts', 'ledger-receipts', false, 15728640,
  array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.receipt_assets enable row level security;
alter table public.receipt_assets force row level security;
revoke all on table public.receipt_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.receipt_assets to service_role;
