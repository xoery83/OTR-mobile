-- Stage 5.1: trusted rate candidates, append-only payer evidence, explicit valuation.

create or replace function public.ledger_currency_scale(currency_code text)
returns smallint
language sql
immutable
strict
set search_path = public
as $$
  select case
    when currency_code = any (string_to_array(
      'AFN ALL BIF CLP COP DJF GNF HUF IDR IQD IRR ISK JPY KMF KPW KRW LAK LBP MGA MMK PKR PYG RWF SLL SOS SYP UGX VND VUV XAF XOF XPF YER', ' '
    )) then 0
    when currency_code = any (string_to_array('BHD JOD KWD LYD OMR TND', ' ')) then 3
    when currency_code = any (string_to_array(
      'AED AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CNY CRC CUC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HRK HTG ILS INR JMD KES KGS KHR KYD KZT LKR LRD LSL MAD MDL MKD MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SRD SSP STN SVC SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD UYU UZS VES WST XCD XCG XDR XSU ZAR ZMW ZWG ZWL', ' '
    )) then 2
    else null
  end::smallint
$$;

alter table public.ledger_settings
  add constraint ledger_settings_iso_currency
  check (public.ledger_currency_scale(settlement_currency) = settlement_scale);
alter table public.expenses
  add constraint expenses_iso_currency
  check (public.ledger_currency_scale(original_currency) = original_currency_scale);

create table public.ledger_rate_quotes (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  quote_currency text not null,
  base_currency text not null,
  decimal_rate numeric(38,18) not null check (decimal_rate > 0),
  effective_date date not null,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  provider text not null check (char_length(provider) between 1 and 120),
  provider_reference text check (provider_reference is null or char_length(provider_reference) <= 500),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.ledger_currency_scale(quote_currency) is not null),
  check (public.ledger_currency_scale(base_currency) is not null),
  check (quote_currency <> base_currency),
  check (expires_at >= observed_at)
);
create index ledger_rate_quotes_pair_observed_idx
  on public.ledger_rate_quotes(journey_id, quote_currency, base_currency, observed_at desc);
create trigger ledger_rate_quotes_touch_revision before update on public.ledger_rate_quotes
for each row execute function public.ledger_touch_revision();

alter table public.exchange_rate_snapshots
  add column expense_revision bigint check (expense_revision is null or expense_revision > 0),
  add column observed_at timestamptz,
  add column provider_reference text,
  add column manual_reason text,
  add column staleness_state text not null default 'FRESH'
    check (staleness_state in ('FRESH', 'STALE_ACCEPTED', 'REVIEW_REQUIRED')),
  add column supersedes_rate_snapshot_id uuid
    references public.exchange_rate_snapshots(id) on delete restrict;
alter table public.exchange_rate_snapshots
  add constraint exchange_rate_snapshots_iso_codes check (
    public.ledger_currency_scale(base_currency) is not null
    and public.ledger_currency_scale(quote_currency) is not null
  );

alter table public.payment_records
  add column expense_revision bigint check (expense_revision is null or expense_revision > 0),
  add column payer_member_id uuid references public.journey_members(id) on delete restrict,
  add column authorized_at timestamptz,
  add column bank_fx_rate numeric(38,18) check (bank_fx_rate is null or bank_fx_rate > 0),
  add column source text check (source is null or char_length(source) <= 120),
  add column notes text check (notes is null or char_length(notes) <= 2000),
  add column revision bigint not null default 1 check (revision = 1);
alter table public.payment_records
  add constraint payment_records_iso_money check (
    (authorization_currency is null or public.ledger_currency_scale(authorization_currency) = authorization_scale)
    and (posted_currency is null or public.ledger_currency_scale(posted_currency) = posted_scale)
    and (fee_currency is null or public.ledger_currency_scale(fee_currency) = fee_scale)
  );

alter table public.settlement_valuation_snapshots
  add column decimal_rate numeric(38,18) check (decimal_rate is null or decimal_rate > 0),
  add column rounding_mode text not null default 'HALF_UP' check (rounding_mode = 'HALF_UP'),
  add column effective_at timestamptz,
  add column supersedes_valuation_id uuid
    references public.settlement_valuation_snapshots(id) on delete restrict;
alter table public.settlement_valuation_snapshots
  add constraint settlement_valuation_snapshots_iso_money check (
    public.ledger_currency_scale(original_currency) = original_scale
    and public.ledger_currency_scale(settlement_currency) = settlement_scale
  );

alter table public.ledger_changes drop constraint ledger_changes_entity_type_check;
alter table public.ledger_changes add constraint ledger_changes_entity_type_check
  check (entity_type in (
    'EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER', 'TRANSFER_PAYMENT',
    'HOUSEHOLD', 'RATE_QUOTE', 'PAYMENT_RECORD'
  ));
create trigger ledger_rate_quotes_change after insert or update on public.ledger_rate_quotes
for each row execute function public.ledger_record_change('RATE_QUOTE');
create trigger payment_records_change after insert on public.payment_records
for each row execute function public.ledger_record_change('PAYMENT_RECORD');

alter table public.ledger_rate_quotes enable row level security;
alter table public.ledger_rate_quotes force row level security;
revoke all on table public.ledger_rate_quotes from public, anon, authenticated;
grant select, insert, update, delete on table public.ledger_rate_quotes to service_role;
revoke execute on function public.ledger_currency_scale(text) from public, anon, authenticated;
grant execute on function public.ledger_currency_scale(text) to service_role;

create or replace function public.ledger_validate_rate_required(expense_uuid uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.expenses e
    where e.id = expense_uuid and e.business_status = 'RATE_REQUIRED'
      and (
        exists (select 1 from public.settlement_valuation_snapshots v
          where v.expense_id = e.id and v.is_active)
        or exists (select 1 from public.expense_splits s
          where s.expense_id = e.id and s.settlement_amount_minor is not null)
      )
  ) then
    raise exception 'RATE_REQUIRED_HAS_VALUATION' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.ledger_validate_rate_required_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.ledger_validate_rate_required(coalesce(
    (to_jsonb(new) ->> 'expense_id')::uuid,
    (to_jsonb(old) ->> 'expense_id')::uuid,
    (to_jsonb(new) ->> 'id')::uuid,
    (to_jsonb(old) ->> 'id')::uuid
  ));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create constraint trigger expenses_stage5_rate_state after insert or update on public.expenses
deferrable initially deferred for each row execute function public.ledger_validate_rate_required_trigger();
create constraint trigger expense_splits_stage5_rate_state after insert or update or delete on public.expense_splits
deferrable initially deferred for each row execute function public.ledger_validate_rate_required_trigger();
create constraint trigger valuations_stage5_rate_state after insert or update on public.settlement_valuation_snapshots
deferrable initially deferred for each row execute function public.ledger_validate_rate_required_trigger();

revoke execute on function public.ledger_validate_rate_required(uuid) from public, anon, authenticated;
revoke execute on function public.ledger_validate_rate_required_trigger() from public, anon, authenticated;
grant execute on function public.ledger_validate_rate_required(uuid) to service_role;
grant execute on function public.ledger_validate_rate_required_trigger() to service_role;

create or replace function public.ledger_add_payment_record_5_1(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  idempotency_key_value text,
  payload_hash_value text,
  payment_value jsonb,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  expense public.expenses%rowtype;
  actor_member uuid;
  actor_role text;
  superseded uuid := nullif(payment_value ->> 'supersedesPaymentRecordId', '')::uuid;
begin
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'ADD_PAYMENT_RECORD' and idempotency_key = idempotency_key_value
  for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into expense from public.expenses
  where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  select id, role into actor_member, actor_role from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
  order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or (actor_member <> expense.payer_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if superseded is not null and not exists (
    select 1 from public.payment_records p where p.id = superseded
      and p.expense_id = target_expense
      and not exists (select 1 from public.payment_records n where n.supersedes_payment_record_id = p.id)
  ) then raise exception 'INVALID_SUPERSESSION'; end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, 'ADD_PAYMENT_RECORD', idempotency_key_value, payload_hash_value);

  insert into public.payment_records (
    id, expense_id, journey_id, expense_revision, payer_member_id, instrument_label,
    authorization_amount_minor, authorization_currency, authorization_scale,
    posted_amount_minor, posted_currency, posted_scale, authorized_at, posted_at,
    fee_amount_minor, fee_currency, fee_scale, bank_fx_rate, source, notes,
    supersedes_payment_record_id, created_by
  ) values (
    (response_body_value #>> '{entity,id}')::uuid, target_expense, target_journey,
    expense.revision, expense.payer_member_id, payment_value ->> 'instrumentLabel',
    nullif(payment_value #>> '{authorization,minor}', '')::bigint,
    payment_value #>> '{authorization,currency}',
    nullif(payment_value #>> '{authorization,scale}', '')::smallint,
    nullif(payment_value #>> '{posted,minor}', '')::bigint,
    payment_value #>> '{posted,currency}',
    nullif(payment_value #>> '{posted,scale}', '')::smallint,
    nullif(payment_value ->> 'authorizedAt', '')::timestamptz,
    nullif(payment_value ->> 'postedAt', '')::timestamptz,
    nullif(payment_value #>> '{fee,minor}', '')::bigint,
    payment_value #>> '{fee,currency}',
    nullif(payment_value #>> '{fee,scale}', '')::smallint,
    nullif(payment_value ->> 'bankFxRate', '')::numeric,
    payment_value ->> 'source', payment_value ->> 'notes', superseded, actor_user
  );
  insert into public.expense_audit_events (
    expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, reason, changed_groups, after_hash
  ) values (
    target_expense, target_journey, expense.revision,
    case when superseded is null then 'PAYMENT_RECORD_ADDED' else 'PAYMENT_RECORD_SUPERSEDED' end,
    actor_user, actor_member, payment_value ->> 'notes', array['EVIDENCE'], payload_hash_value
  );
  update public.ledger_idempotency_keys set response_status = 201,
    response_body = response_body_value, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'ADD_PAYMENT_RECORD' and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;

create or replace function public.ledger_apply_valuation_5_1(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  idempotency_key_value text,
  payload_hash_value text,
  valuation_value jsonb,
  rate_snapshot_value jsonb,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  expense public.expenses%rowtype;
  settings public.ledger_settings%rowtype;
  actor_member uuid;
  actor_role text;
  expected_minor bigint;
  supplied_minor bigint := (valuation_value #>> '{previewSettlement,minor}')::bigint;
  rate numeric;
  payment public.payment_records%rowtype;
  quote public.ledger_rate_quotes%rowtype;
  next_revision bigint;
begin
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'APPLY_VALUATION' and idempotency_key = idempotency_key_value
  for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into expense from public.expenses where id = target_expense
    and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if expense.revision <> (valuation_value ->> 'baseRevision')::bigint then
    raise exception 'REVISION_CONFLICT';
  end if;
  if expense.business_status = 'DELETED' then raise exception 'INVALID_VALUATION'; end if;
  if exists (select 1 from public.settlement_inputs si join public.settlements s
    on s.id = si.settlement_id where si.expense_id = target_expense
    and s.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')) then
    raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
  end if;
  select * into settings from public.ledger_settings where journey_id = target_journey;
  select id, role into actor_member, actor_role from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
  order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or (actor_member <> expense.creator_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if actor_member <> expense.creator_member_id and actor_role = 'owner'
    and coalesce(nullif(trim(valuation_value ->> 'reason'), ''), '') = '' then
    raise exception 'ORGANIZER_REASON_REQUIRED';
  end if;
  if valuation_value #>> '{previewSettlement,currency}' <> settings.settlement_currency
    or (valuation_value #>> '{previewSettlement,scale}')::smallint <> settings.settlement_scale then
    raise exception 'INVALID_VALUATION';
  end if;

  case valuation_value ->> 'policy'
    when 'SAME_CURRENCY' then
      if expense.original_currency <> settings.settlement_currency
        or expense.original_currency_scale <> settings.settlement_scale then
        raise exception 'INVALID_VALUATION';
      end if;
      rate := 1;
      expected_minor := expense.original_amount_minor;
    when 'REFERENCE_RATE' then
      select * into quote from public.ledger_rate_quotes
      where id = (valuation_value ->> 'rateQuoteId')::uuid and journey_id = target_journey
        and quote_currency = expense.original_currency
        and base_currency = settings.settlement_currency;
      if not found then raise exception 'RATE_REQUIRED'; end if;
      if quote.expires_at < now() and coalesce(nullif(trim(valuation_value ->> 'reason'), ''), '') = '' then
        raise exception 'STALE_RATE_REASON_REQUIRED';
      end if;
      rate := quote.decimal_rate;
      expected_minor := round(expense.original_amount_minor * rate
        * power(10::numeric, settings.settlement_scale - expense.original_currency_scale));
    when 'MANUAL_AGREED' then
      if coalesce(nullif(trim(valuation_value ->> 'reason'), ''), '') = '' then
        raise exception 'MANUAL_REASON_REQUIRED';
      end if;
      rate := (valuation_value ->> 'manualRate')::numeric;
      if rate <= 0 then raise exception 'INVALID_VALUATION'; end if;
      expected_minor := round(expense.original_amount_minor * rate
        * power(10::numeric, settings.settlement_scale - expense.original_currency_scale));
    when 'ACTUAL_PAYER_COST' then
      select * into payment from public.payment_records p
      where p.id = (valuation_value ->> 'paymentRecordId')::uuid
        and p.expense_id = target_expense and p.posted_amount_minor is not null
        and p.posted_currency = settings.settlement_currency and p.posted_scale = settings.settlement_scale
        and not exists (select 1 from public.payment_records n
          where n.supersedes_payment_record_id = p.id);
      if not found then raise exception 'INVALID_PAYMENT_RECORD'; end if;
      expected_minor := payment.posted_amount_minor;
    else raise exception 'INVALID_VALUATION';
  end case;
  if expected_minor <> supplied_minor then raise exception 'VALUATION_PREVIEW_MISMATCH'; end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, 'APPLY_VALUATION', idempotency_key_value, payload_hash_value);
  next_revision := expense.revision + 1;
  update public.settlement_valuation_snapshots set is_active = false
    where expense_id = target_expense and is_active;
  if rate_snapshot_value <> 'null'::jsonb then
    insert into public.exchange_rate_snapshots (
      id, expense_id, journey_id, expense_revision, base_currency, quote_currency,
      decimal_rate, effective_date, source, provenance, observed_at,
      provider_reference, manual_reason, staleness_state,
      created_by
    ) values (
      (rate_snapshot_value ->> 'id')::uuid, target_expense, target_journey,
      next_revision, settings.settlement_currency, expense.original_currency,
      (rate_snapshot_value ->> 'decimalRate')::numeric,
      (rate_snapshot_value ->> 'effectiveDate')::date,
      rate_snapshot_value ->> 'provider', '{}'::jsonb,
      (rate_snapshot_value ->> 'observedAt')::timestamptz,
      rate_snapshot_value ->> 'providerReference', valuation_value ->> 'reason',
      rate_snapshot_value ->> 'stalenessState',
      actor_user
    );
  end if;
  insert into public.settlement_valuation_snapshots (
    id, expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, settlement_currency, settlement_scale,
    rate_snapshot_id, payment_record_id, reason, is_active, created_by,
    decimal_rate, rounding_mode, effective_at, supersedes_valuation_id
  ) values (
    (response_body_value #>> '{entity,valuation,id}')::uuid, target_expense,
    target_journey, next_revision, valuation_value ->> 'policy',
    expense.original_amount_minor, expense.original_currency, expense.original_currency_scale,
    supplied_minor, settings.settlement_currency, settings.settlement_scale,
    nullif(response_body_value #>> '{entity,valuation,rateSnapshotId}', '')::uuid,
    nullif(valuation_value ->> 'paymentRecordId', '')::uuid,
    valuation_value ->> 'reason', true, actor_user, rate, 'HALF_UP', now(),
    nullif(response_body_value #>> '{entity,valuation,supersedesValuationId}', '')::uuid
  );
  update public.expense_splits s set settlement_amount_minor =
    (item.value ->> 'settlementMinor')::bigint
  from jsonb_array_elements(response_body_value #> '{entity,splits}') item
  where s.expense_id = target_expense and s.member_id = (item.value ->> 'memberId')::uuid;
  update public.expenses set business_status = 'ACCEPTED', updated_by_user_id = actor_user
    where id = target_expense;
  insert into public.expense_audit_events (
    id, expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, reason, changed_groups, after_hash
  ) values (
    (response_body_value #>> '{entity,auditEvents,-1,id}')::uuid,
    target_expense, target_journey, next_revision, 'VALUATION_APPLIED', actor_user,
    actor_member, valuation_value ->> 'reason', array['FINANCIAL_CORE'], payload_hash_value
  );
  update public.ledger_idempotency_keys set response_status = 200,
    response_body = response_body_value, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'APPLY_VALUATION' and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;

revoke all on function public.ledger_add_payment_record_5_1(uuid, uuid, uuid, text, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.ledger_add_payment_record_5_1(uuid, uuid, uuid, text, text, jsonb, jsonb)
to service_role;
revoke all on function public.ledger_apply_valuation_5_1(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.ledger_apply_valuation_5_1(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb)
to service_role;

notify pgrst, 'reload schema';
