-- Slice C: Backend-owned Personal Payment FX projections. These remain outside
-- canonical Settlement and never advance the user-owned payment revision.

alter table public.personal_settlement_payment_records add column economic_date date;
update public.personal_settlement_payment_records
set economic_date = (occurred_at at time zone 'UTC')::date
where economic_date is null;
alter table public.personal_settlement_payment_records alter column economic_date set not null;

-- Keep the established idempotent mutation function and change only its storage
-- boundary. Old clients may omit economicDate; their deterministic compatibility
-- value is the UTC date of occurredAt. Client-derived equivalent fields are ignored.
do $$
declare definition text;
begin
  definition := pg_get_functiondef(
    'public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text)'::regprocedure
  );
  definition := replace(definition,
    'direction, amount_minor, currency, scale, occurred_at, note,',
    'direction, amount_minor, currency, scale, occurred_at, economic_date, note,');
  definition := replace(definition,
    '(payment_value ->> ''occurredAt'')::timestamptz, payment_value ->> ''note'',',
    '(payment_value ->> ''occurredAt'')::timestamptz, coalesce(nullif(payment_value ->> ''economicDate'', '''')::date, ((payment_value ->> ''occurredAt'')::timestamptz at time zone ''UTC'')::date), payment_value ->> ''note'',');
  definition := replace(definition,
    'nullif(payment_value ->> ''recordedEquivalentMinor'', '''')::bigint,
      payment_value ->> ''recordedEquivalentCurrency'',
      nullif(payment_value ->> ''recordedEquivalentScale'', '''')::smallint,
      nullif(payment_value ->> ''referenceRateDecimal'', '''')::numeric,
      nullif(payment_value ->> ''referenceRateDate'', '''')::date,
      payment_value ->> ''referenceSource'',
      nullif(payment_value -> ''referenceProvenance'', ''null''::jsonb),',
    'null, null, null, null, null, null, null,');
  definition := replace(definition,
    'occurred_at = (payment_value ->> ''occurredAt'')::timestamptz,
        note = payment_value ->> ''note'',',
    'occurred_at = (payment_value ->> ''occurredAt'')::timestamptz,
        economic_date = coalesce(nullif(payment_value ->> ''economicDate'', '''')::date, ((payment_value ->> ''occurredAt'')::timestamptz at time zone ''UTC'')::date),
        note = payment_value ->> ''note'',');
  definition := replace(definition,
    'recorded_equivalent_minor = nullif(payment_value ->> ''recordedEquivalentMinor'', '''')::bigint,
        recorded_equivalent_currency = payment_value ->> ''recordedEquivalentCurrency'',
        recorded_equivalent_scale = nullif(payment_value ->> ''recordedEquivalentScale'', '''')::smallint,
        reference_rate_decimal = nullif(payment_value ->> ''referenceRateDecimal'', '''')::numeric,
        reference_rate_date = nullif(payment_value ->> ''referenceRateDate'', '''')::date,
        reference_source = payment_value ->> ''referenceSource'',
        reference_provenance = nullif(payment_value -> ''referenceProvenance'', ''null''::jsonb),',
    'recorded_equivalent_minor = null,
        recorded_equivalent_currency = null,
        recorded_equivalent_scale = null,
        reference_rate_decimal = null,
        reference_rate_date = null,
        reference_source = null,
        reference_provenance = null,');
  if position('economic_date' in definition) = 0 then
    raise exception 'Personal Payment mutation economic-date patch failed';
  end if;
  execute definition;
end $$;

create table public.personal_settlement_payment_fx_projections (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.personal_settlement_payment_records(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete restrict,
  target_currency text not null,
  target_scale smallint not null,
  policy_version text not null check (policy_version = 'ECB_DAILY_V1'),
  source_payment_revision bigint not null check (source_payment_revision > 0),
  input_digest text not null check (char_length(input_digest) = 32),
  economic_date date not null,
  original_amount_minor bigint not null check (original_amount_minor > 0),
  original_currency text not null,
  original_scale smallint not null,
  state text not null check (state in (
    'PENDING', 'CONFIRMED', 'UNAVAILABLE', 'SUPERSEDED'
  )),
  equivalent_minor bigint check (equivalent_minor is null or equivalent_minor > 0),
  decimal_rate numeric(38,18) check (decimal_rate is null or decimal_rate > 0),
  rate_quote_id uuid references public.ledger_rate_quotes(id) on delete restrict,
  reference_date date,
  provider text,
  provider_reference text,
  source_reference text,
  failure_category text check (failure_category is null or failure_category in (
    'TEMPORARY_FAILURE', 'RATE_LIMITED', 'UNSUPPORTED',
    'NOT_YET_AVAILABLE', 'NO_REFERENCE_WITHIN_POLICY'
  )),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, target_currency, policy_version),
  foreign key (journey_id, payment_id)
    references public.personal_settlement_payment_records(journey_id, id) on delete restrict,
  check (public.ledger_currency_scale(target_currency) = target_scale),
  check (public.ledger_currency_scale(original_currency) = original_scale),
  check (
    (state = 'CONFIRMED' and equivalent_minor is not null and decimal_rate is not null)
    or (state <> 'CONFIRMED' and equivalent_minor is null and decimal_rate is null)
  )
);
create index personal_payment_fx_projection_pending_idx
  on public.personal_settlement_payment_fx_projections
  (state, journey_id, economic_date, original_currency, target_currency);

create table public.personal_settlement_payment_fx_projection_audit_events (
  id uuid primary key default gen_random_uuid(),
  projection_id uuid not null references public.personal_settlement_payment_fx_projections(id) on delete restrict,
  payment_id uuid not null references public.personal_settlement_payment_records(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete restrict,
  prior_revision bigint,
  new_revision bigint not null,
  event_type text not null check (event_type in ('CREATED', 'RESOLVED', 'INVALIDATED', 'STATE_CHANGED')),
  projection_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (projection_id, new_revision)
);

alter table public.ledger_changes drop constraint ledger_changes_entity_type_check;
alter table public.ledger_changes add constraint ledger_changes_entity_type_check check (
  entity_type in (
    'EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER', 'TRANSFER_PAYMENT',
    'HOUSEHOLD', 'RATE_QUOTE', 'PAYMENT_RECORD', 'RECEIPT', 'REVIEW_FINDING',
    'JOURNEY_CURRENCY', 'PERSONAL_SETTLEMENT_PAYMENT',
    'PERSONAL_SETTLEMENT_PAYMENT_ATTACHMENT',
    'PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION'
  )
);

create function public.ledger_personal_payment_fx_input_digest_1c(
  payment public.personal_settlement_payment_records
) returns text language sql immutable set search_path = public as $$
  select md5(format('%s:%s:%s:%s:%s', payment.amount_minor, payment.currency,
    payment.scale, payment.economic_date, payment.revision));
$$;

create function public.ledger_record_personal_payment_fx_projection_1c()
returns trigger language plpgsql set search_path = public as $$
declare event_name text;
begin
  event_name := case
    when tg_op = 'INSERT' then 'CREATED'
    when new.state = 'CONFIRMED' and old.state <> 'CONFIRMED' then 'RESOLVED'
    when new.state = 'SUPERSEDED' then 'INVALIDATED'
    else 'STATE_CHANGED'
  end;
  insert into public.personal_settlement_payment_fx_projection_audit_events (
    projection_id, payment_id, journey_id, prior_revision, new_revision,
    event_type, projection_snapshot
  ) values (new.id, new.payment_id, new.journey_id,
    case when tg_op = 'INSERT' then null else old.revision end,
    new.revision, event_name, to_jsonb(new));
  insert into public.ledger_changes (
    journey_id, entity_type, entity_id, revision, is_tombstone
  ) values (new.journey_id, 'PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION',
    new.id, new.revision, new.state = 'SUPERSEDED')
  on conflict (entity_type, entity_id, revision) do nothing;
  return new;
end;
$$;
create trigger personal_payment_fx_projection_change
after insert or update on public.personal_settlement_payment_fx_projections
for each row execute function public.ledger_record_personal_payment_fx_projection_1c();
create trigger personal_payment_fx_projection_audit_immutable
before update or delete on public.personal_settlement_payment_fx_projection_audit_events
for each row execute function public.ledger_reject_immutable_change();

create function public.ledger_ensure_personal_payment_fx_projection_1c(
  target_payment uuid, requested_target_currency text default null
) returns setof public.personal_settlement_payment_fx_projections
language plpgsql security definer set search_path = public as $$
declare
  payment public.personal_settlement_payment_records%rowtype;
  target_code text;
  target_scale_value smallint;
  quote public.ledger_rate_quotes%rowtype;
  digest text;
  next_state text;
  next_minor bigint;
  next_rate numeric(38,18);
begin
  select * into payment from public.personal_settlement_payment_records
  where id = target_payment for update;
  if payment.id is null or payment.deleted_at is not null then return; end if;
  if requested_target_currency is null then
    select settlement_currency, settlement_scale into target_code, target_scale_value
    from public.ledger_settings where journey_id = payment.journey_id;
  else
    target_code := requested_target_currency;
    target_scale_value := public.ledger_currency_scale(target_code);
  end if;
  if target_scale_value is null then raise exception 'PERSONAL_PAYMENT_TARGET_CURRENCY_INVALID'; end if;
  digest := public.ledger_personal_payment_fx_input_digest_1c(payment);

  if payment.currency = target_code then
    next_state := 'CONFIRMED'; next_minor := payment.amount_minor; next_rate := 1;
    quote := null;
  else
    select * into quote from public.ledger_rate_quotes q
    where q.journey_id = payment.journey_id
      and q.economic_date = payment.economic_date
      and q.quote_currency = payment.currency
      and q.base_currency = target_code
      and q.policy_version = 'ECB_DAILY_V1'
      and q.provider = 'ECB'
      and q.source_reference = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
      and q.provider_reference = format(
        'https://api.frankfurter.dev/v2/providers/ecb/rate/%s/%s?date=%s',
        q.quote_currency, q.base_currency, q.economic_date)
    order by q.observed_at desc limit 1;
    if quote.id is null then
      next_state := 'PENDING'; next_minor := null; next_rate := null;
    else
      next_state := 'CONFIRMED'; next_rate := quote.decimal_rate;
      next_minor := round(payment.amount_minor::numeric * quote.decimal_rate
        * power(10::numeric, target_scale_value - payment.scale))::bigint;
      if next_minor <= 0 then raise exception 'PERSONAL_PAYMENT_PROJECTION_INVALID'; end if;
    end if;
  end if;

  insert into public.personal_settlement_payment_fx_projections as p (
    payment_id, journey_id, target_currency, target_scale, policy_version,
    source_payment_revision, input_digest, economic_date, original_amount_minor,
    original_currency, original_scale, state, equivalent_minor, decimal_rate,
    rate_quote_id, reference_date, provider, provider_reference, source_reference,
    failure_category
  ) values (
    payment.id, payment.journey_id, target_code, target_scale_value, 'ECB_DAILY_V1',
    payment.revision, digest, payment.economic_date, payment.amount_minor,
    payment.currency, payment.scale, next_state, next_minor, next_rate,
    quote.id, quote.reference_date, quote.provider, quote.provider_reference,
    quote.source_reference, null
  ) on conflict (payment_id, target_currency, policy_version) do update set
    target_scale = excluded.target_scale,
    source_payment_revision = excluded.source_payment_revision,
    input_digest = excluded.input_digest,
    economic_date = excluded.economic_date,
    original_amount_minor = excluded.original_amount_minor,
    original_currency = excluded.original_currency,
    original_scale = excluded.original_scale,
    state = excluded.state,
    equivalent_minor = excluded.equivalent_minor,
    decimal_rate = excluded.decimal_rate,
    rate_quote_id = excluded.rate_quote_id,
    reference_date = excluded.reference_date,
    provider = excluded.provider,
    provider_reference = excluded.provider_reference,
    source_reference = excluded.source_reference,
    failure_category = null,
    revision = p.revision + 1,
    updated_at = now()
  where p.input_digest <> excluded.input_digest or p.state <> excluded.state
    or p.rate_quote_id is distinct from excluded.rate_quote_id;
  return query select * from public.personal_settlement_payment_fx_projections p
    where p.payment_id = payment.id and p.target_currency = target_code
      and p.policy_version = 'ECB_DAILY_V1';
end;
$$;

create function public.ledger_invalidate_personal_payment_fx_projections_1c(
  target_payment uuid
) returns void language plpgsql security definer set search_path = public as $$
declare payment public.personal_settlement_payment_records%rowtype;
begin
  select * into payment from public.personal_settlement_payment_records where id = target_payment;
  if payment.id is null then return; end if;
  update public.personal_settlement_payment_fx_projections p set
    state = 'SUPERSEDED', equivalent_minor = null, decimal_rate = null,
    rate_quote_id = null, reference_date = null, provider = null,
    provider_reference = null, source_reference = null, failure_category = null,
    revision = p.revision + 1, updated_at = now()
  where p.payment_id = payment.id and p.state <> 'SUPERSEDED'
    and (p.source_payment_revision <> payment.revision
      or p.input_digest <> public.ledger_personal_payment_fx_input_digest_1c(payment));
end;
$$;

create function public.ledger_resolve_personal_payment_fx_projections_1c(
  target_journey uuid default null
) returns integer language plpgsql security definer set search_path = public as $$
declare candidate record; resolved integer := 0; next_minor bigint;
begin
  for candidate in
    select p.id, p.revision, p.input_digest, p.source_payment_revision,
      r.id as quote_id, r.decimal_rate, r.reference_date, r.provider,
      r.provider_reference, r.source_reference, pay.amount_minor, pay.scale,
      pay.revision as payment_revision,
      public.ledger_personal_payment_fx_input_digest_1c(pay) as current_digest
    from public.personal_settlement_payment_fx_projections p
    join public.personal_settlement_payment_records pay on pay.id = p.payment_id
    join public.ledger_rate_quotes r on r.journey_id = p.journey_id
      and r.economic_date = p.economic_date
      and r.quote_currency = p.original_currency
      and r.base_currency = p.target_currency
      and r.policy_version = p.policy_version and r.provider = 'ECB'
      and r.source_reference = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
      and r.provider_reference = format(
        'https://api.frankfurter.dev/v2/providers/ecb/rate/%s/%s?date=%s',
        r.quote_currency, r.base_currency, r.economic_date)
    where p.state in ('PENDING', 'UNAVAILABLE') and pay.deleted_at is null
      and (target_journey is null or p.journey_id = target_journey)
    order by p.created_at, p.id
  loop
    if candidate.payment_revision <> candidate.source_payment_revision
       or candidate.current_digest <> candidate.input_digest then
      continue;
    end if;
    select round(candidate.amount_minor::numeric * candidate.decimal_rate
      * power(10::numeric, p.target_scale - candidate.scale))::bigint into next_minor
    from public.personal_settlement_payment_fx_projections p where p.id = candidate.id;
    update public.personal_settlement_payment_fx_projections p set
      state = 'CONFIRMED', equivalent_minor = next_minor,
      decimal_rate = candidate.decimal_rate, rate_quote_id = candidate.quote_id,
      reference_date = candidate.reference_date, provider = candidate.provider,
      provider_reference = candidate.provider_reference,
      source_reference = candidate.source_reference, failure_category = null,
      revision = p.revision + 1, updated_at = now()
    where p.id = candidate.id and p.revision = candidate.revision
      and p.state in ('PENDING', 'UNAVAILABLE');
    if found then resolved := resolved + 1; end if;
  end loop;
  return resolved;
end;
$$;

create function public.ledger_mark_personal_payment_fx_demand_1c(
  target_journey uuid, target_economic_date date, quote_currency_value text,
  base_currency_value text, failure_category_value text
) returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.personal_settlement_payment_fx_projections p set
    state = case when failure_category_value in ('UNSUPPORTED', 'NO_REFERENCE_WITHIN_POLICY')
      then 'UNAVAILABLE' else 'PENDING' end,
    failure_category = failure_category_value,
    revision = p.revision + 1, updated_at = now()
  where p.journey_id = target_journey and p.economic_date = target_economic_date
    and p.original_currency = quote_currency_value
    and p.target_currency = base_currency_value and p.policy_version = 'ECB_DAILY_V1'
    and p.state = 'PENDING' and p.failure_category is distinct from failure_category_value;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create function public.ledger_list_personal_payment_fx_projections_1c(
  actor_user uuid, target_journey uuid
) returns setof public.personal_settlement_payment_fx_projections
language sql security definer stable set search_path = public as $$
  select p.* from public.personal_settlement_payment_fx_projections p
  where p.journey_id = target_journey and p.state <> 'SUPERSEDED'
    and public.ledger_can_read_personal_settlement_payment_1a(actor_user, p.payment_id)
  order by p.updated_at, p.id;
$$;

create or replace function public.ledger_list_personal_settlement_payment_changes_1a(
  actor_user uuid, target_journey uuid, after_sequence bigint, page_size integer
) returns table (sequence bigint, entity_type text, entity_id uuid,
  revision bigint, is_tombstone boolean, changed_at timestamptz)
language sql security definer stable set search_path = public as $$
  select c.sequence, c.entity_type, c.entity_id, c.revision, c.is_tombstone, c.changed_at
  from public.ledger_changes c
  where c.journey_id = target_journey and c.sequence > after_sequence
    and c.entity_type in (
      'PERSONAL_SETTLEMENT_PAYMENT', 'PERSONAL_SETTLEMENT_PAYMENT_ATTACHMENT',
      'PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION'
    )
    and public.ledger_can_read_personal_settlement_payment_1a(
      actor_user,
      case
        when c.entity_type = 'PERSONAL_SETTLEMENT_PAYMENT' then c.entity_id
        when c.entity_type = 'PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION'
          then (select p.payment_id from public.personal_settlement_payment_fx_projections p where p.id = c.entity_id)
        else (select a.record_id from public.personal_settlement_payment_attachments a where a.id = c.entity_id)
      end
    )
  order by c.sequence limit least(greatest(page_size, 1), 500);
$$;

-- Extend the existing shared demand scanner; projection rows are the durable demand.
create or replace function public.ledger_claim_rate_demands(max_requests integer default 20)
returns table (journey_id uuid, economic_date date, quote_currency text,
  base_currency text, policy_version text)
language sql security definer set search_path = public as $$
  with demand as (
    select distinct d.journey_id, d.economic_date, d.quote_currency,
      d.base_currency, d.policy_version from (
      select e.journey_id, e.economic_date, e.original_currency as quote_currency,
        coalesce(s.settlement_currency, 'NZD') as base_currency,
        'ECB_DAILY_V1'::text as policy_version
      from public.expenses e left join public.ledger_settings s on s.journey_id = e.journey_id
      where e.business_status = 'RATE_REQUIRED' and e.deleted_at is null
        and e.economic_date is not null and e.original_currency <> coalesce(s.settlement_currency, 'NZD')
      union all
      select p.journey_id, p.economic_date, p.original_currency,
        p.target_currency, p.policy_version
      from public.personal_settlement_payment_fx_projections p
      join public.personal_settlement_payment_records pay on pay.id = p.payment_id
      where p.state in ('PENDING', 'UNAVAILABLE') and pay.deleted_at is null
        and p.original_currency <> p.target_currency
        and p.source_payment_revision = pay.revision
        and p.input_digest = public.ledger_personal_payment_fx_input_digest_1c(pay)
    ) d
    where d.economic_date <= current_date
      and not exists (select 1 from public.ledger_rate_quotes q
        where q.journey_id = d.journey_id and q.economic_date = d.economic_date
          and q.quote_currency = d.quote_currency and q.base_currency = d.base_currency
          and q.policy_version = d.policy_version)
      and not exists (select 1 from public.ledger_rate_quote_attempts a
        where a.journey_id = d.journey_id and a.economic_date = d.economic_date
          and a.quote_currency = d.quote_currency and a.base_currency = d.base_currency
          and a.policy_version = d.policy_version and a.next_retry_at > now())
    order by d.journey_id, d.economic_date, d.quote_currency, d.base_currency
    limit least(greatest(max_requests, 0), 50)
  ), claimed as (
    insert into public.ledger_rate_quote_attempts as a (
      journey_id, economic_date, quote_currency, base_currency,
      policy_version, status, next_retry_at
    ) select d.journey_id, d.economic_date, d.quote_currency, d.base_currency,
      d.policy_version, 'IN_FLIGHT', now() + interval '45 seconds' from demand d
    on conflict (journey_id, economic_date, quote_currency, base_currency, policy_version)
    do update set status = 'IN_FLIGHT', next_retry_at = now() + interval '45 seconds',
      last_attempt_at = now(), attempt_count = a.attempt_count + 1
    where a.next_retry_at <= now()
    returning a.journey_id, a.economic_date, a.quote_currency,
      a.base_currency, a.policy_version
  ) select * from claimed;
$$;

alter table public.personal_settlement_payment_fx_projections enable row level security;
alter table public.personal_settlement_payment_fx_projections force row level security;
alter table public.personal_settlement_payment_fx_projection_audit_events enable row level security;
alter table public.personal_settlement_payment_fx_projection_audit_events force row level security;
revoke all on public.personal_settlement_payment_fx_projections,
  public.personal_settlement_payment_fx_projection_audit_events from public, anon, authenticated;
grant select, insert, update, delete on public.personal_settlement_payment_fx_projections to service_role;
grant select, insert on public.personal_settlement_payment_fx_projection_audit_events to service_role;
revoke all on function public.ledger_personal_payment_fx_input_digest_1c(public.personal_settlement_payment_records),
  public.ledger_record_personal_payment_fx_projection_1c(),
  public.ledger_ensure_personal_payment_fx_projection_1c(uuid,text),
  public.ledger_invalidate_personal_payment_fx_projections_1c(uuid),
  public.ledger_resolve_personal_payment_fx_projections_1c(uuid),
  public.ledger_mark_personal_payment_fx_demand_1c(uuid,date,text,text,text),
  public.ledger_list_personal_payment_fx_projections_1c(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.ledger_ensure_personal_payment_fx_projection_1c(uuid,text),
  public.ledger_invalidate_personal_payment_fx_projections_1c(uuid),
  public.ledger_resolve_personal_payment_fx_projections_1c(uuid),
  public.ledger_mark_personal_payment_fx_demand_1c(uuid,date,text,text,text),
  public.ledger_list_personal_payment_fx_projections_1c(uuid,uuid)
  to service_role;

notify pgrst, 'reload schema';
