-- Phase D: one revisioned Journey-level financial command. Dev only.
alter table public.ledger_changes drop constraint ledger_changes_entity_type_check;
alter table public.ledger_changes add constraint ledger_changes_entity_type_check
  check (entity_type in ('EXPENSE', 'CORRECTION', 'SETTLEMENT', 'TRANSFER',
    'TRANSFER_PAYMENT', 'HOUSEHOLD', 'RATE_QUOTE', 'PAYMENT_RECORD',
    'RECEIPT', 'REVIEW_FINDING', 'JOURNEY_CURRENCY'));

create table public.ledger_journey_currency_changes (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_member_id uuid not null references public.journey_members(id) on delete restrict,
  old_currency text not null,
  new_currency text not null,
  old_scale smallint not null,
  new_scale smallint not null,
  settings_revision bigint not null,
  preview_digest text not null,
  affected_count integer not null,
  unresolved_count integer not null,
  created_at timestamptz not null default now()
);
alter table public.ledger_journey_currency_changes enable row level security;
alter table public.ledger_journey_currency_changes force row level security;
revoke all on public.ledger_journey_currency_changes from public, anon, authenticated;
grant select, insert on public.ledger_journey_currency_changes to service_role;

create or replace function public.ledger_guard_journey_currency()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.settlement_currency, new.settlement_scale)
    is distinct from (old.settlement_currency, old.settlement_scale) then
    if current_setting('otr.journey_currency_command', true) is distinct from 'true' then
      raise exception 'JOURNEY_CURRENCY_COMMAND_REQUIRED';
    end if;
    if exists (select 1 from public.settlements
      where journey_id = new.journey_id and (finalized_at is not null
        or status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED'))) then
      raise exception 'JOURNEY_CURRENCY_FINALIZED_LOCK';
    end if;
  end if;
  return new;
end;
$$;
create trigger ledger_settings_currency_guard before update on public.ledger_settings
for each row execute function public.ledger_guard_journey_currency();

-- All relevant writers share the settings row, so the command's FOR UPDATE
-- lock serializes Expense inserts/edits, quote updates and settlement finalization.
create or replace function public.ledger_currency_serialize_input()
returns trigger language plpgsql set search_path = public as $$
declare target_journey uuid;
begin
  if tg_op = 'DELETE' then target_journey := old.journey_id;
  else target_journey := new.journey_id; end if;
  perform 1 from public.ledger_settings
  where journey_id = target_journey for share;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger expenses_currency_serialize before insert or update or delete
on public.expenses for each row execute function public.ledger_currency_serialize_input();
create trigger rate_quotes_currency_serialize before insert or update or delete
on public.ledger_rate_quotes for each row execute function public.ledger_currency_serialize_input();
create trigger settlements_currency_serialize before insert or update or delete
on public.settlements for each row execute function public.ledger_currency_serialize_input();
create trigger idempotency_currency_serialize before insert or update or delete
on public.ledger_idempotency_keys for each row
execute function public.ledger_currency_serialize_input();
create trigger conflict_resolutions_currency_serialize before insert
on public.expense_conflict_resolutions for each row
execute function public.ledger_currency_serialize_input();

create or replace function public.ledger_preview_journey_currency(
  actor_user uuid, target_journey uuid, target_currency text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.ledger_settings%rowtype;
  e record;
  actor_member uuid;
  old_policy text;
  quote public.ledger_rate_quotes%rowtype;
  fingerprint text;
  digest_value text;
  total_count integer := 0;
  same_count integer := 0;
  reference_count integer := 0;
  missing_date_count integer := 0;
  missing_quote_count integer := 0;
  manual_count integer := 0;
  actual_count integer := 0;
  other_count integer := 0;
  unresolved_count integer := 0;
  conflict_count integer := 0;
  finalized_count integer;
  open_count integer;
begin
  if public.ledger_currency_scale(target_currency) is null then
    raise exception 'INVALID_CURRENCY';
  end if;
  select * into s from public.ledger_settings where journey_id = target_journey;
  if not found then raise exception 'JOURNEY_NOT_FOUND'; end if;
  select id into actor_member from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
    and role = 'owner' limit 1;
  if actor_member is null then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;
  select count(*) into finalized_count from public.settlements
    where journey_id = target_journey and (finalized_at is not null
      or status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED'));
  select count(*) into open_count from public.settlements
    where journey_id = target_journey and finalized_at is null
      and status not in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED');
  fingerprint := format('%s:%s:%s:%s:%s', s.revision, s.settlement_currency,
    target_currency, finalized_count, open_count);
  for e in select x.id, x.revision, x.original_currency, x.economic_date,
      x.business_status, x.deleted_at, v.policy, v.id as valuation_id
    from public.expenses x
    left join public.settlement_valuation_snapshots v
      on v.expense_id = x.id and v.is_active
    where x.journey_id = target_journey order by x.id loop
    if e.business_status not in ('DRAFT', 'DELETED') then
      total_count := total_count + 1;
    end if;
    old_policy := coalesce(e.policy, 'RATE_REQUIRED');
    quote := null;
    if e.business_status not in ('DRAFT', 'DELETED')
      and e.original_currency <> target_currency
      and old_policy in ('REFERENCE_RATE', 'RATE_REQUIRED', 'SAME_CURRENCY')
      and e.economic_date is not null and e.economic_date <= current_date then
      select * into quote from public.ledger_rate_quotes q
      where q.journey_id = target_journey and q.economic_date = e.economic_date
        and q.quote_currency = e.original_currency
        and q.base_currency = target_currency and q.policy_version = 'ECB_DAILY_V1'
        and q.provider = 'ECB' and q.reference_date = q.effective_date
        and q.reference_date <= e.economic_date
        and e.economic_date - q.reference_date between 0 and 7
        and q.expires_at > now()
        and q.source_reference = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
        and q.provider_reference = format(
          'https://api.frankfurter.dev/v2/providers/ecb/rate/%s/%s?date=%s',
          q.quote_currency, q.base_currency, q.economic_date);
    end if;
    fingerprint := fingerprint || format('|%s:%s:%s:%s:%s:%s:%s', e.id,
      e.revision, e.business_status, coalesce(e.policy, ''),
      coalesce(e.valuation_id::text, ''), coalesce(quote.id::text, ''),
      coalesce(quote.revision::text, ''));
    if e.business_status in ('DRAFT', 'DELETED') then continue; end if;
    if old_policy = 'MANUAL_AGREED' then manual_count := manual_count + 1; end if;
    if old_policy = 'ACTUAL_PAYER_COST' then actual_count := actual_count + 1; end if;
    if old_policy not in ('REFERENCE_RATE', 'RATE_REQUIRED', 'MANUAL_AGREED',
      'ACTUAL_PAYER_COST', 'SAME_CURRENCY') then other_count := other_count + 1; end if;
    if e.original_currency <> target_currency and e.economic_date is null then
      missing_date_count := missing_date_count + 1;
    end if;
    if e.original_currency = target_currency then
      same_count := same_count + 1;
    elsif old_policy = 'MANUAL_AGREED' then
      unresolved_count := unresolved_count + 1;
    elsif old_policy = 'ACTUAL_PAYER_COST' then
      unresolved_count := unresolved_count + 1;
    elsif old_policy not in ('REFERENCE_RATE', 'RATE_REQUIRED', 'SAME_CURRENCY') then
      unresolved_count := unresolved_count + 1;
    elsif e.economic_date is null then
      unresolved_count := unresolved_count + 1;
    elsif quote.id is null then
      missing_quote_count := missing_quote_count + 1;
      unresolved_count := unresolved_count + 1;
    elsif round((select original_amount_minor from public.expenses where id = e.id)
      * quote.decimal_rate * power(10::numeric,
        public.ledger_currency_scale(target_currency) -
        (select original_currency_scale from public.expenses where id = e.id))) <= 0 then
      missing_quote_count := missing_quote_count + 1;
      unresolved_count := unresolved_count + 1;
    else
      reference_count := reference_count + 1;
    end if;
  end loop;
  select count(distinct x.id) into conflict_count from public.expenses x
  join public.ledger_idempotency_keys k on k.journey_id = x.journey_id
    and k.response_status = 409
    and k.response_body #>> '{error,expenseId}' = x.id::text
  where x.journey_id = target_journey
    and not exists (select 1 from public.expense_conflict_resolutions r
      where r.conflict_id = k.id);
  fingerprint := fingerprint || coalesce((select string_agg(k.id::text, ',' order by k.id)
    from public.ledger_idempotency_keys k
    where k.journey_id = target_journey and k.response_status = 409
      and not exists (select 1 from public.expense_conflict_resolutions r
        where r.conflict_id = k.id)), '');
  digest_value := encode(sha256(convert_to(fingerprint || ':' || conflict_count, 'UTF8')), 'hex');
  return jsonb_build_object(
    'currentCurrency', s.settlement_currency,
    'currentScale', s.settlement_scale,
    'proposedCurrency', target_currency,
    'proposedScale', public.ledger_currency_scale(target_currency),
    'settingsRevision', s.revision,
    'previewDigest', digest_value,
    'affectedExpenses', total_count,
    'sameCurrencyCount', same_count,
    'referenceCandidateCount', reference_count,
    'missingEconomicDateCount', missing_date_count,
    'missingHistoricalQuoteCount', missing_quote_count,
    'manualAgreedCount', manual_count,
    'actualPayerCostCount', actual_count,
    'otherPolicyCount', other_count,
    'conflictCount', conflict_count,
    'expectedUnresolvedCount', unresolved_count,
    'openSettlementCount', open_count,
    'finalizedSettlementCount', finalized_count,
    'totalsAvailable', unresolved_count = 0 and conflict_count = 0,
    'requiresAbandonPreview', open_count > 0);
end;
$$;

revoke all on function public.ledger_preview_journey_currency(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.ledger_preview_journey_currency(uuid, uuid, text)
to service_role;

create or replace function public.ledger_claim_currency_preview_demands(
  actor_user uuid, target_journey uuid, target_currency text,
  max_requests integer default 4
) returns table (
  journey_id uuid, economic_date date, quote_currency text,
  base_currency text, policy_version text
) language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.journey_members
    where trip_id = target_journey and user_id = actor_user
      and role = 'owner' and status = 'linked') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if public.ledger_currency_scale(target_currency) is null then
    raise exception 'INVALID_CURRENCY';
  end if;
  if exists (select 1 from public.settlements
    where settlements.journey_id = target_journey and (finalized_at is not null
      or status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED', 'SUPERSEDED'))) then
    return;
  end if;
  return query
  with demand as (
    select distinct e.journey_id, e.economic_date,
      e.original_currency as quote_currency,
      target_currency as base_currency,
      'ECB_DAILY_V1'::text as policy_version
    from public.expenses e
    left join public.settlement_valuation_snapshots v
      on v.expense_id = e.id and v.is_active
    where e.journey_id = target_journey
      and e.business_status in ('ACCEPTED', 'RATE_REQUIRED')
      and e.economic_date is not null and e.economic_date <= current_date
      and e.original_currency <> target_currency
      and coalesce(v.policy, 'RATE_REQUIRED') in (
        'REFERENCE_RATE', 'RATE_REQUIRED', 'SAME_CURRENCY')
      and not exists (select 1 from public.ledger_rate_quotes q
        where q.journey_id = e.journey_id and q.economic_date = e.economic_date
          and q.quote_currency = e.original_currency
          and q.base_currency = target_currency and q.policy_version = 'ECB_DAILY_V1'
          and q.expires_at > now())
      and not exists (select 1 from public.ledger_rate_quote_attempts a
        where a.journey_id = e.journey_id and a.economic_date = e.economic_date
          and a.quote_currency = e.original_currency
          and a.base_currency = target_currency and a.policy_version = 'ECB_DAILY_V1'
          and a.next_retry_at > now())
    order by e.journey_id, e.economic_date, e.original_currency
    limit least(greatest(max_requests, 0), 4)
  )
  insert into public.ledger_rate_quote_attempts as a (
    journey_id, economic_date, quote_currency, base_currency,
    policy_version, status, next_retry_at
  ) select d.journey_id, d.economic_date, d.quote_currency,
      d.base_currency, d.policy_version, 'IN_FLIGHT', now() + interval '45 seconds'
    from demand d
    on conflict (journey_id, economic_date, quote_currency, base_currency, policy_version)
    do update set status = 'IN_FLIGHT',
      next_retry_at = now() + interval '45 seconds',
      last_attempt_at = now(), attempt_count = a.attempt_count + 1
    where a.next_retry_at <= now()
    returning a.journey_id, a.economic_date, a.quote_currency,
      a.base_currency, a.policy_version;
end;
$$;
revoke all on function public.ledger_claim_currency_preview_demands(uuid, uuid, text, integer)
from public, anon, authenticated;
grant execute on function public.ledger_claim_currency_preview_demands(uuid, uuid, text, integer)
to service_role;

create or replace function public.ledger_commit_journey_currency(
  actor_user uuid, target_journey uuid, target_currency text,
  base_revision bigint, expected_digest text, operation_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.ledger_settings%rowtype;
  preview jsonb;
  existing public.ledger_idempotency_keys%rowtype;
  e public.expenses%rowtype;
  prior public.settlement_valuation_snapshots%rowtype;
  quote public.ledger_rate_quotes%rowtype;
  actor_member uuid;
  new_policy text;
  new_minor bigint;
  next_revision bigint;
  valuation_id uuid;
  rate_id uuid;
  change_id uuid := gen_random_uuid();
  changed_count integer := 0;
  unresolved_count integer := 0;
  response_value jsonb;
begin
  if operation_id is null or length(operation_id) not between 1 and 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  select id into actor_member from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
    and role = 'owner' limit 1;
  if actor_member is null then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'CHANGE_JOURNEY_CURRENCY' and idempotency_key = operation_id
  for update;
  if found then
    if existing.payload_hash <> encode(sha256(convert_to(
      format('%s:%s:%s:%s', target_currency, base_revision, expected_digest, operation_id),
      'UTF8')), 'hex') then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;
  select * into s from public.ledger_settings
  where journey_id = target_journey for update;
  if not found then raise exception 'JOURNEY_NOT_FOUND'; end if;
  if s.revision <> base_revision then raise exception 'SETTINGS_REVISION_CONFLICT'; end if;
  if s.settlement_currency = target_currency then raise exception 'CURRENCY_UNCHANGED'; end if;
  -- Lock every existing Expense before checking the digest. The serialization
  -- triggers prevent new Expenses, quote edits and finalized settlements.
  perform 1 from public.expenses where journey_id = target_journey
    order by id for update;
  perform 1 from public.ledger_rate_quotes where journey_id = target_journey
    order by id for share;
  preview := public.ledger_preview_journey_currency(actor_user, target_journey, target_currency);
  if preview ->> 'previewDigest' is distinct from expected_digest then
    raise exception 'JOURNEY_CURRENCY_PREVIEW_STALE';
  end if;
  if (preview ->> 'finalizedSettlementCount')::integer > 0 then
    raise exception 'JOURNEY_CURRENCY_FINALIZED_LOCK';
  end if;
  if (preview ->> 'openSettlementCount')::integer > 0 then
    raise exception 'JOURNEY_CURRENCY_OPEN_SETTLEMENT';
  end if;
  if (preview ->> 'conflictCount')::integer > 0 then
    raise exception 'JOURNEY_CURRENCY_CONFLICT';
  end if;
  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, 'CHANGE_JOURNEY_CURRENCY', operation_id,
    encode(sha256(convert_to(format('%s:%s:%s:%s', target_currency,
      base_revision, expected_digest, operation_id), 'UTF8')), 'hex'));
  perform set_config('otr.journey_currency_command', 'true', true);
  update public.ledger_settings set settlement_currency = target_currency,
    settlement_scale = public.ledger_currency_scale(target_currency),
    updated_by = actor_user where journey_id = target_journey;
  -- This first feed item is a bootstrap barrier. The Backend rejects any
  -- older cursor before returning the individual Expense changes.
  insert into public.ledger_changes (
    journey_id, entity_type, entity_id, revision
  ) values (target_journey, 'JOURNEY_CURRENCY', change_id, s.revision + 1);

  for e in select * from public.expenses
    where journey_id = target_journey and business_status not in ('DRAFT', 'DELETED')
    order by id loop
    select * into prior from public.settlement_valuation_snapshots
      where expense_id = e.id and is_active;
    new_policy := null;
    new_minor := null;
    quote := null;
    if e.original_currency = target_currency then
      new_policy := 'SAME_CURRENCY';
      new_minor := e.original_amount_minor;
    elsif coalesce(prior.policy, 'RATE_REQUIRED') in (
      'REFERENCE_RATE', 'RATE_REQUIRED', 'SAME_CURRENCY')
      and e.economic_date is not null and e.economic_date <= current_date then
      select * into quote from public.ledger_rate_quotes q
      where q.journey_id = target_journey and q.economic_date = e.economic_date
        and q.quote_currency = e.original_currency
        and q.base_currency = target_currency and q.policy_version = 'ECB_DAILY_V1'
        and q.provider = 'ECB' and q.reference_date = q.effective_date
        and q.reference_date <= e.economic_date
        and e.economic_date - q.reference_date between 0 and 7
        and q.expires_at > now()
        and q.source_reference = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
        and q.provider_reference = format(
          'https://api.frankfurter.dev/v2/providers/ecb/rate/%s/%s?date=%s',
          q.quote_currency, q.base_currency, q.economic_date);
      if quote.id is not null then
        new_minor := round(e.original_amount_minor * quote.decimal_rate
          * power(10::numeric, public.ledger_currency_scale(target_currency)
            - e.original_currency_scale));
        if new_minor > 0 then new_policy := 'REFERENCE_RATE'; end if;
      end if;
    end if;
    if prior.id is not null then
      update public.settlement_valuation_snapshots set is_active = false
        where id = prior.id;
    end if;
    next_revision := e.revision + 1;
    rate_id := null;
    valuation_id := null;
    if new_policy = 'REFERENCE_RATE' then
      rate_id := gen_random_uuid();
      perform set_config('otr.c_rate_quote_id', quote.id::text, true);
      perform set_config('otr.c_automatic_reference', 'true', true);
      insert into public.exchange_rate_snapshots (
        id, expense_id, journey_id, expense_revision, base_currency,
        quote_currency, decimal_rate, effective_date, source, observed_at,
        provider_reference, staleness_state, supersedes_rate_snapshot_id,
        created_by
      ) values (rate_id, e.id, target_journey, next_revision, target_currency,
        e.original_currency, quote.decimal_rate, quote.reference_date,
        quote.provider, quote.observed_at, quote.provider_reference, 'FRESH',
        prior.rate_snapshot_id, actor_user);
      perform set_config('otr.c_rate_quote_id', '', true);
    end if;
    if new_policy is not null then
      valuation_id := gen_random_uuid();
      insert into public.settlement_valuation_snapshots (
        id, expense_id, journey_id, expense_revision, policy,
        original_amount_minor, original_currency, original_scale,
        settlement_amount_minor, settlement_currency, settlement_scale,
        rate_snapshot_id, reason, is_active, created_by,
        decimal_rate, rounding_mode, effective_at, supersedes_valuation_id
      ) values (valuation_id, e.id, target_journey, next_revision, new_policy,
        e.original_amount_minor, e.original_currency, e.original_currency_scale,
        new_minor, target_currency, public.ledger_currency_scale(target_currency),
        rate_id, 'Journey Currency changed', true, actor_user,
        case when new_policy = 'SAME_CURRENCY' then 1 else quote.decimal_rate end,
        'HALF_UP', now(), prior.id);
      with raw as (
        select member_id, floor(new_minor::numeric * original_amount_minor /
          e.original_amount_minor)::bigint as base_minor,
          mod(new_minor::numeric * original_amount_minor,
            e.original_amount_minor) as remainder
        from public.expense_splits where expense_id = e.id
      ), ranked as (
        select member_id, base_minor,
          row_number() over (order by remainder desc, member_id::text collate "C") as rank,
          sum(base_minor) over () as base_total from raw
      )
      update public.expense_splits split set settlement_amount_minor =
        ranked.base_minor + case when ranked.rank <= new_minor - ranked.base_total
          then 1 else 0 end
      from ranked where split.expense_id = e.id and split.member_id = ranked.member_id;
    else
      unresolved_count := unresolved_count + 1;
      update public.expense_splits set settlement_amount_minor = null
        where expense_id = e.id;
    end if;
    update public.expenses set business_status =
      case when new_policy is null then 'RATE_REQUIRED' else 'ACCEPTED' end,
      updated_by_user_id = actor_user where id = e.id;
    if new_policy is null and prior.policy in (
      'MANUAL_AGREED', 'ACTUAL_PAYER_COST', 'LEGACY_IMPORTED'
    ) then
      insert into public.ledger_auto_valuation_failures (
        expense_id, expense_revision, failure_class, next_retry_at
      ) values (e.id, next_revision, 'SEMANTIC', null)
      on conflict (expense_id, expense_revision) do nothing;
    end if;
    insert into public.expense_audit_events (
      id, expense_id, journey_id, expense_revision, event_type,
      actor_user_id, actor_member_id, reason, changed_groups, after_hash,
      metadata
    ) values (gen_random_uuid(), e.id, target_journey, next_revision,
      'JOURNEY_CURRENCY_CHANGED', actor_user, actor_member,
      format('%s to %s', s.settlement_currency, target_currency),
      array['FINANCIAL_CORE'], expected_digest,
      jsonb_build_object('oldCurrency', s.settlement_currency,
        'newCurrency', target_currency, 'oldValuationId', prior.id,
        'newValuationId', valuation_id));
    changed_count := changed_count + 1;
  end loop;
  insert into public.ledger_journey_currency_changes (
    id, journey_id, actor_user_id, actor_member_id, old_currency,
    new_currency, old_scale, new_scale, settings_revision, preview_digest,
    affected_count, unresolved_count
  ) values (change_id, target_journey, actor_user, actor_member,
    s.settlement_currency, target_currency, s.settlement_scale,
    public.ledger_currency_scale(target_currency), s.revision + 1,
    expected_digest, changed_count, unresolved_count);
  response_value := jsonb_build_object('changeId', change_id,
    'settlementCurrency', target_currency,
    'settlementScale', public.ledger_currency_scale(target_currency),
    'settingsRevision', s.revision + 1,
    'affectedExpenses', changed_count,
    'unresolvedExpenses', unresolved_count,
    'idempotentReplay', false);
  update public.ledger_idempotency_keys set response_status = 200,
    response_body = response_value, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'CHANGE_JOURNEY_CURRENCY'
    and idempotency_key = operation_id;
  return response_value;
end;
$$;
revoke all on function public.ledger_commit_journey_currency(uuid, uuid, text, bigint, text, text)
from public, anon, authenticated;
grant execute on function public.ledger_commit_journey_currency(uuid, uuid, text, bigint, text, text)
to service_role;

notify pgrst, 'reload schema';
