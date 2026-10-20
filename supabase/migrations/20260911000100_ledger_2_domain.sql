-- Ledger 2.0 forward-only Dev/Staging domain schema.
-- Legacy ledger_entries and related production-shape tables remain untouched.

create table public.ledger_settings (
  journey_id uuid primary key references public.trips(id) on delete cascade,
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  valuation_policy text not null check (valuation_policy in (
    'REFERENCE_RATE', 'ACTUAL_PAYER_COST', 'MANUAL_AGREED', 'SAME_CURRENCY'
  )),
  rate_stale_after_hours integer not null default 72 check (rate_stale_after_hours > 0),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  display_order integer not null default 0,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, id),
  unique (journey_id, name)
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.journey_members(id) on delete cascade,
  share_units integer not null default 1000 check (share_units > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, member_id),
  unique (journey_id, member_id),
  foreign key (journey_id, household_id)
    references public.households(journey_id, id) on delete cascade
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  creator_member_id uuid references public.journey_members(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  payer_member_id uuid not null references public.journey_members(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  category text not null default 'other' check (category in (
    'flight', 'hotel', 'car', 'fuel', 'food', 'ticket', 'shopping',
    'transport', 'insurance', 'groceries', 'activity', 'other'
  )),
  occurred_at timestamptz not null,
  original_amount_minor bigint not null check (original_amount_minor > 0),
  original_currency text not null check (original_currency ~ '^[A-Z]{3}$'),
  original_currency_scale smallint not null check (original_currency_scale between 0 and 4),
  business_status text not null default 'ACCEPTED' check (business_status in (
    'DRAFT', 'ACCEPTED', 'RATE_REQUIRED', 'DELETED'
  )),
  location_snapshot jsonb,
  import_provenance jsonb,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, id),
  check ((business_status = 'DELETED') = (deleted_at is not null))
);

create table public.expense_participants (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.journey_members(id) on delete restrict,
  display_name_snapshot text not null check (char_length(display_name_snapshot) between 1 and 200),
  household_id_snapshot uuid,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (expense_id, member_id),
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.expense_splits (
  expense_id uuid not null,
  journey_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.journey_members(id) on delete restrict,
  split_method text not null check (split_method in (
    'EQUAL_PERSON', 'EQUAL_HOUSEHOLD', 'HOUSEHOLD_SHARES', 'EXACT', 'PERCENTAGE'
  )),
  original_amount_minor bigint not null check (original_amount_minor >= 0),
  settlement_amount_minor bigint check (settlement_amount_minor is null or settlement_amount_minor >= 0),
  weight_units integer check (weight_units is null or weight_units > 0),
  percentage_units integer check (percentage_units is null or percentage_units between 0 and 1000000),
  rounding_adjustment_minor integer not null default 0 check (rounding_adjustment_minor between -1 and 1),
  created_at timestamptz not null default now(),
  primary key (expense_id, member_id),
  foreign key (expense_id, member_id)
    references public.expense_participants(expense_id, member_id) on delete cascade,
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.exchange_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  decimal_rate numeric(38,18) not null check (decimal_rate > 0),
  effective_date date not null,
  source text not null check (char_length(source) between 1 and 120),
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  instrument_label text check (instrument_label is null or char_length(instrument_label) <= 120),
  authorization_amount_minor bigint,
  authorization_currency text check (authorization_currency is null or authorization_currency ~ '^[A-Z]{3}$'),
  authorization_scale smallint check (authorization_scale is null or authorization_scale between 0 and 4),
  posted_amount_minor bigint,
  posted_currency text check (posted_currency is null or posted_currency ~ '^[A-Z]{3}$'),
  posted_scale smallint check (posted_scale is null or posted_scale between 0 and 4),
  posted_at timestamptz,
  fee_amount_minor bigint,
  fee_currency text check (fee_currency is null or fee_currency ~ '^[A-Z]{3}$'),
  fee_scale smallint check (fee_scale is null or fee_scale between 0 and 4),
  bank_fx_evidence jsonb,
  evidence_asset_id uuid,
  supersedes_payment_record_id uuid references public.payment_records(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade,
  check (authorization_amount_minor is null or authorization_amount_minor >= 0),
  check (posted_amount_minor is null or posted_amount_minor >= 0),
  check (fee_amount_minor is null or fee_amount_minor >= 0),
  check ((authorization_amount_minor is null) = (authorization_currency is null and authorization_scale is null)),
  check ((posted_amount_minor is null) = (posted_currency is null and posted_scale is null)),
  check ((fee_amount_minor is null) = (fee_currency is null and fee_scale is null)),
  check (authorization_amount_minor is not null or posted_amount_minor is not null)
);

create table public.settlement_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  expense_revision bigint not null check (expense_revision > 0),
  policy text not null check (policy in (
    'REFERENCE_RATE', 'ACTUAL_PAYER_COST', 'MANUAL_AGREED',
    'SAME_CURRENCY', 'LEGACY_IMPORTED'
  )),
  original_amount_minor bigint not null check (original_amount_minor > 0),
  original_currency text not null check (original_currency ~ '^[A-Z]{3}$'),
  original_scale smallint not null check (original_scale between 0 and 4),
  settlement_amount_minor bigint not null check (settlement_amount_minor > 0),
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  rate_snapshot_id uuid references public.exchange_rate_snapshots(id) on delete restrict,
  payment_record_id uuid references public.payment_records(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 1000),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.expense_links (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  link_type text not null check (link_type in (
    'ITINERARY_EVENT', 'ITINERARY_RESERVATION', 'DOCUMENT', 'RECEIPT'
  )),
  target_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (expense_id, link_type, target_id),
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.expense_audit_events (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  expense_revision bigint not null check (expense_revision > 0),
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_member_id uuid references public.journey_members(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 2000),
  changed_groups text[] not null default '{}',
  before_hash text,
  after_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (expense_id, expense_revision, event_type),
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.expense_correction_requests (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  base_expense_revision bigint not null check (base_expense_revision > 0),
  proposed_aggregate jsonb not null,
  reason text not null check (char_length(reason) between 1 and 2000),
  status text not null default 'OPEN' check (status in (
    'OPEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'STALE'
  )),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_reason text check (resolution_reason is null or char_length(resolution_reason) <= 2000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete cascade
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'READY', 'FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED'
  )),
  through_timestamp timestamptz not null,
  input_digest text not null,
  algorithm_version text not null,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid references public.profiles(id) on delete set null,
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  supersedes_settlement_id uuid references public.settlements(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, id)
);

create table public.settlement_inputs (
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  expense_revision bigint not null check (expense_revision > 0),
  valuation_snapshot_id uuid not null references public.settlement_valuation_snapshots(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (settlement_id, expense_id),
  foreign key (journey_id, settlement_id)
    references public.settlements(journey_id, id) on delete cascade,
  foreign key (journey_id, expense_id)
    references public.expenses(journey_id, id) on delete restrict
);

create table public.settlement_member_balances (
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.journey_members(id) on delete restrict,
  paid_minor bigint not null,
  owed_minor bigint not null,
  transferred_minor bigint not null default 0,
  net_minor bigint not null,
  created_at timestamptz not null default now(),
  primary key (settlement_id, member_id),
  foreign key (journey_id, settlement_id)
    references public.settlements(journey_id, id) on delete cascade,
  check (paid_minor >= 0 and owed_minor >= 0)
);

create table public.settlement_transfers (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  from_member_id uuid not null references public.journey_members(id) on delete restrict,
  to_member_id uuid not null references public.journey_members(id) on delete restrict,
  obligation_amount_minor bigint not null check (obligation_amount_minor > 0),
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  status text not null default 'OPEN' check (status in (
    'OPEN', 'PARTIALLY_PAID', 'AWAITING_CONFIRMATION', 'SETTLED', 'DISPUTED', 'CANCELLED'
  )),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (journey_id, id),
  foreign key (journey_id, settlement_id)
    references public.settlements(journey_id, id) on delete cascade,
  check (from_member_id <> to_member_id)
);

create table public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.settlement_transfers(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  payment_amount_minor bigint not null check (payment_amount_minor > 0),
  payment_currency text not null check (payment_currency ~ '^[A-Z]{3}$'),
  payment_scale smallint not null check (payment_scale between 0 and 4),
  discharged_amount_minor bigint not null check (discharged_amount_minor > 0),
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  repayment_rate numeric(38,18),
  repayment_rate_source text,
  status text not null default 'AWAITING_CONFIRMATION' check (status in (
    'AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'DISPUTED'
  )),
  reported_by uuid not null references public.profiles(id) on delete restrict,
  paid_at timestamptz not null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  evidence_asset_id uuid,
  notes text check (notes is null or char_length(notes) <= 2000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (journey_id, transfer_id)
    references public.settlement_transfers(journey_id, id) on delete cascade,
  check ((status = 'CONFIRMED') = (confirmed_by is not null and confirmed_at is not null)),
  check ((payment_currency = settlement_currency and payment_scale = settlement_scale)
    or repayment_rate is not null)
);

create table public.ledger_review_findings (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid references public.expenses(id) on delete cascade,
  settlement_id uuid references public.settlements(id) on delete cascade,
  layer text not null check (layer in ('DETERMINISTIC', 'HEURISTIC')),
  finding_type text not null,
  severity text not null check (severity in ('INFO', 'WARNING', 'BLOCKING')),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  evidence_codes text[] not null default '{}',
  status text not null default 'OPEN' check (status in (
    'OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED', 'STALE'
  )),
  ruleset_version text not null,
  entity_revision bigint,
  acted_by uuid references public.profiles(id) on delete set null,
  action_reason text check (action_reason is null or char_length(action_reason) <= 2000),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expense_id is not null or settlement_id is not null)
);

create table public.ledger_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  command_type text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  payload_hash text not null,
  response_status integer,
  response_body jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (actor_user_id, journey_id, command_type, idempotency_key)
);

create table public.ledger_changes (
  sequence bigint generated always as identity primary key,
  journey_id uuid not null references public.trips(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER', 'TRANSFER_PAYMENT', 'HOUSEHOLD'
  )),
  entity_id uuid not null,
  revision bigint not null check (revision > 0),
  is_tombstone boolean not null default false,
  changed_at timestamptz not null default now(),
  unique (entity_type, entity_id, revision)
);

create unique index settlement_valuation_one_active_per_expense
  on public.settlement_valuation_snapshots(expense_id) where is_active;
create index expenses_journey_occurred_idx
  on public.expenses(journey_id, occurred_at desc, id);
create index expenses_journey_status_idx
  on public.expenses(journey_id, business_status, updated_at desc);
create index expenses_payer_idx on public.expenses(payer_member_id);
create index expense_participants_member_idx
  on public.expense_participants(journey_id, member_id, expense_id);
create index expense_splits_member_idx
  on public.expense_splits(journey_id, member_id, expense_id);
create index exchange_rate_snapshots_expense_idx
  on public.exchange_rate_snapshots(expense_id, created_at desc);
create index payment_records_expense_idx
  on public.payment_records(expense_id, created_at desc);
create index expense_audit_events_expense_idx
  on public.expense_audit_events(expense_id, expense_revision desc, created_at desc);
create index expense_corrections_journey_status_idx
  on public.expense_correction_requests(journey_id, status, updated_at desc);
create index settlements_journey_status_idx
  on public.settlements(journey_id, status, created_at desc);
create index settlement_transfers_member_idx
  on public.settlement_transfers(journey_id, from_member_id, to_member_id, status);
create index settlement_payments_transfer_idx
  on public.settlement_payments(transfer_id, created_at);
create index ledger_review_findings_journey_status_idx
  on public.ledger_review_findings(journey_id, status, severity);
create index ledger_changes_journey_cursor_idx
  on public.ledger_changes(journey_id, sequence);

create or replace function public.ledger_touch_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger ledger_settings_touch_revision before update on public.ledger_settings
for each row execute function public.ledger_touch_revision();
create trigger households_touch_revision before update on public.households
for each row execute function public.ledger_touch_revision();
create trigger expenses_touch_revision before update on public.expenses
for each row execute function public.ledger_touch_revision();
create trigger expense_corrections_touch_revision before update on public.expense_correction_requests
for each row execute function public.ledger_touch_revision();
create trigger settlements_touch_revision before update on public.settlements
for each row execute function public.ledger_touch_revision();
create trigger settlement_transfers_touch_revision before update on public.settlement_transfers
for each row execute function public.ledger_touch_revision();
create trigger settlement_payments_touch_revision before update on public.settlement_payments
for each row execute function public.ledger_touch_revision();
create trigger ledger_review_findings_touch_revision before update on public.ledger_review_findings
for each row execute function public.ledger_touch_revision();

create or replace function public.ledger_reject_immutable_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
end;
$$;

create trigger exchange_rate_snapshots_immutable before update or delete
on public.exchange_rate_snapshots for each row execute function public.ledger_reject_immutable_change();
create trigger payment_records_immutable before update or delete
on public.payment_records for each row execute function public.ledger_reject_immutable_change();
create trigger expense_audit_events_immutable before update or delete
on public.expense_audit_events for each row execute function public.ledger_reject_immutable_change();
create trigger settlement_inputs_immutable before update or delete
on public.settlement_inputs for each row execute function public.ledger_reject_immutable_change();
create trigger settlement_member_balances_immutable before update or delete
on public.settlement_member_balances for each row execute function public.ledger_reject_immutable_change();

create or replace function public.ledger_guard_valuation_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - 'is_active') <> (to_jsonb(old) - 'is_active')
    or not old.is_active or new.is_active then
    raise exception 'Settlement valuation snapshots are append-only' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger settlement_valuations_immutable before update or delete
on public.settlement_valuation_snapshots for each row execute function public.ledger_guard_valuation_snapshot();

create or replace function public.ledger_validate_expense(expense_uuid uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  target public.expenses%rowtype;
  participant_count integer;
  split_count integer;
  original_total bigint;
  settlement_total bigint;
  active_valuation public.settlement_valuation_snapshots%rowtype;
begin
  select * into target from public.expenses where id = expense_uuid;
  if not found then return; end if;

  if not exists (
    select 1 from public.journey_members jm
    where jm.id = target.payer_member_id and jm.trip_id = target.journey_id
  ) then
    raise exception 'Expense payer must belong to its Journey' using errcode = '23514';
  end if;

  select count(*), coalesce(sum(es.original_amount_minor), 0),
    coalesce(sum(es.settlement_amount_minor), 0)
  into split_count, original_total, settlement_total
  from public.expense_splits es where es.expense_id = expense_uuid;
  select count(*) into participant_count
  from public.expense_participants ep where ep.expense_id = expense_uuid;

  if exists (
    select 1 from public.expense_participants ep
    left join public.journey_members jm on jm.id = ep.member_id and jm.trip_id = ep.journey_id
    where ep.expense_id = expense_uuid and jm.id is null
  ) then
    raise exception 'Expense participant must belong to its Journey' using errcode = '23514';
  end if;

  if target.business_status in ('ACCEPTED', 'RATE_REQUIRED') then
    if participant_count = 0 or split_count <> participant_count then
      raise exception 'Expense participants and splits must match' using errcode = '23514';
    end if;
    if original_total <> target.original_amount_minor then
      raise exception 'Expense original splits must reconcile' using errcode = '23514';
    end if;
  end if;

  select * into active_valuation from public.settlement_valuation_snapshots
  where expense_id = expense_uuid and is_active;
  if target.business_status = 'ACCEPTED' then
    if not found then
      raise exception 'Accepted expense requires an active valuation' using errcode = '23514';
    end if;
    if active_valuation.original_amount_minor <> target.original_amount_minor
      or active_valuation.original_currency <> target.original_currency
      or active_valuation.original_scale <> target.original_currency_scale then
      raise exception 'Valuation original money must match Expense' using errcode = '23514';
    end if;
    if settlement_total <> active_valuation.settlement_amount_minor
      or exists (select 1 from public.expense_splits where expense_id = expense_uuid and settlement_amount_minor is null) then
      raise exception 'Expense settlement splits must reconcile' using errcode = '23514';
    end if;
  end if;
end;
$$;

create or replace function public.ledger_validate_expense_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.ledger_validate_expense(
    coalesce(
      (to_jsonb(new) ->> 'expense_id')::uuid,
      (to_jsonb(old) ->> 'expense_id')::uuid,
      (to_jsonb(new) ->> 'id')::uuid,
      (to_jsonb(old) ->> 'id')::uuid
    )
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create constraint trigger expenses_validate_deferred after insert or update on public.expenses
deferrable initially deferred for each row execute function public.ledger_validate_expense_trigger();
create constraint trigger expense_participants_validate_deferred after insert or update or delete on public.expense_participants
deferrable initially deferred for each row execute function public.ledger_validate_expense_trigger();
create constraint trigger expense_splits_validate_deferred after insert or update or delete on public.expense_splits
deferrable initially deferred for each row execute function public.ledger_validate_expense_trigger();
create constraint trigger settlement_valuations_validate_deferred after insert on public.settlement_valuation_snapshots
deferrable initially deferred for each row execute function public.ledger_validate_expense_trigger();

create or replace function public.ledger_validate_household_member()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  if not exists (
    select 1 from public.journey_members jm
    where jm.id = (row_data ->> 'member_id')::uuid
      and jm.trip_id = (row_data ->> 'journey_id')::uuid
  ) then
    raise exception 'Household member must belong to its Journey' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create constraint trigger household_members_validate_deferred
after insert or update on public.household_members
deferrable initially deferred for each row
execute function public.ledger_validate_household_member();

create or replace function public.ledger_validate_settlement(settlement_uuid uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  target public.settlements%rowtype;
  balance_total bigint;
begin
  select * into target from public.settlements where id = settlement_uuid;
  if not found then return; end if;

  if exists (
    select 1 from public.settlement_member_balances smb
    left join public.journey_members jm
      on jm.id = smb.member_id and jm.trip_id = smb.journey_id
    where smb.settlement_id = settlement_uuid and jm.id is null
  ) then
    raise exception 'Settlement balance member must belong to its Journey' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.settlement_transfers st
    left join public.journey_members from_member
      on from_member.id = st.from_member_id and from_member.trip_id = st.journey_id
    left join public.journey_members to_member
      on to_member.id = st.to_member_id and to_member.trip_id = st.journey_id
    where st.settlement_id = settlement_uuid
      and (from_member.id is null or to_member.id is null)
  ) then
    raise exception 'Settlement transfer members must belong to its Journey' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.settlement_transfers st
    where st.settlement_id = settlement_uuid
      and (st.journey_id <> target.journey_id
        or st.settlement_currency <> target.settlement_currency
        or st.settlement_scale <> target.settlement_scale)
  ) then
    raise exception 'Settlement transfer money must match its Settlement' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.settlement_transfers st
    join public.settlement_payments sp on sp.transfer_id = st.id
    where st.settlement_id = settlement_uuid
      and (sp.journey_id <> target.journey_id
        or sp.settlement_currency <> st.settlement_currency
        or sp.settlement_scale <> st.settlement_scale)
  ) then
    raise exception 'Settlement payment must match its transfer' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.settlement_transfers st
    where st.settlement_id = settlement_uuid
      and coalesce((
        select sum(sp.discharged_amount_minor)
        from public.settlement_payments sp
        where sp.transfer_id = st.id and sp.status = 'CONFIRMED'
      ), 0) > st.obligation_amount_minor
  ) then
    raise exception 'Confirmed payments cannot exceed their transfer obligation' using errcode = '23514';
  end if;

  if target.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED') then
    select coalesce(sum(net_minor), 0) into balance_total
    from public.settlement_member_balances where settlement_id = settlement_uuid;
    if balance_total <> 0 then
      raise exception 'Finalized settlement balances must net to zero' using errcode = '23514';
    end if;
  end if;
end;
$$;

create or replace function public.ledger_validate_settlement_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  row_data jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  settlement_uuid uuid;
begin
  settlement_uuid := coalesce(
    (row_data ->> 'settlement_id')::uuid,
    case when tg_table_name = 'settlements' then (row_data ->> 'id')::uuid end,
    (select st.settlement_id from public.settlement_transfers st
      where st.id = (row_data ->> 'transfer_id')::uuid)
  );
  perform public.ledger_validate_settlement(settlement_uuid);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create constraint trigger settlements_validate_deferred after insert or update on public.settlements
deferrable initially deferred for each row execute function public.ledger_validate_settlement_trigger();
create constraint trigger settlement_balances_validate_deferred after insert on public.settlement_member_balances
deferrable initially deferred for each row execute function public.ledger_validate_settlement_trigger();
create constraint trigger settlement_transfers_validate_deferred after insert or update or delete on public.settlement_transfers
deferrable initially deferred for each row execute function public.ledger_validate_settlement_trigger();
create constraint trigger settlement_payments_validate_deferred after insert or update or delete on public.settlement_payments
deferrable initially deferred for each row execute function public.ledger_validate_settlement_trigger();

create or replace function public.ledger_record_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  kind text := tg_argv[0];
  target_id uuid;
  target_journey uuid;
  target_revision bigint;
  tombstone boolean := false;
begin
  target_id := coalesce(
    (to_jsonb(new) ->> 'id')::uuid,
    (to_jsonb(old) ->> 'id')::uuid
  );
  target_journey := coalesce(
    (to_jsonb(new) ->> 'journey_id')::uuid,
    (to_jsonb(old) ->> 'journey_id')::uuid
  );
  target_revision := coalesce(
    (to_jsonb(new) ->> 'revision')::bigint,
    (to_jsonb(old) ->> 'revision')::bigint,
    1
  );
  if kind = 'EXPENSE' then
    tombstone := coalesce(to_jsonb(new) ->> 'business_status', to_jsonb(old) ->> 'business_status') = 'DELETED';
  end if;
  insert into public.ledger_changes(journey_id, entity_type, entity_id, revision, is_tombstone)
  values (target_journey, kind, target_id, target_revision, tombstone)
  on conflict (entity_type, entity_id, revision) do nothing;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger expenses_change after insert or update on public.expenses
for each row execute function public.ledger_record_change('EXPENSE');
create trigger households_change after insert or update on public.households
for each row execute function public.ledger_record_change('HOUSEHOLD');
create trigger expense_corrections_change after insert or update on public.expense_correction_requests
for each row execute function public.ledger_record_change('CORRECTION');
create trigger settlements_change after insert or update on public.settlements
for each row execute function public.ledger_record_change('SETTLEMENT');
create trigger settlement_transfers_change after insert or update on public.settlement_transfers
for each row execute function public.ledger_record_change('TRANSFER');
create trigger settlement_payments_change after insert or update on public.settlement_payments
for each row execute function public.ledger_record_change('TRANSFER_PAYMENT');

notify pgrst, 'reload schema';
