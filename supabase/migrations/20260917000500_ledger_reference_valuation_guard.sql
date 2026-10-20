-- Phase C: keep the Stage 5 command, but require a canonical historical candidate
-- before any service-role REFERENCE_RATE acceptance.
create or replace function public.ledger_freeze_reference_provenance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  candidate public.ledger_rate_quotes%rowtype;
  candidate_id text := current_setting('otr.c_rate_quote_id', true);
begin
  if candidate_id is null or candidate_id = '' then return new; end if;
  select * into candidate from public.ledger_rate_quotes where id = candidate_id::uuid;
  if not found or candidate.journey_id <> new.journey_id
    or candidate.quote_currency <> new.quote_currency
    or candidate.base_currency <> new.base_currency
    or candidate.decimal_rate <> new.decimal_rate
    or candidate.reference_date <> new.effective_date
    or candidate.provider <> new.source
    or candidate.provider_reference is distinct from new.provider_reference then
    raise exception 'INVALID_REFERENCE_RATE';
  end if;
  new.provenance := jsonb_build_object(
    'economicDate', candidate.economic_date,
    'referenceDate', candidate.reference_date,
    'policyVersion', candidate.policy_version,
    'source', 'European Central Bank reference rate',
    'sourceReference', candidate.source_reference,
    'deliveryProvider', 'Frankfurter',
    'providerReference', candidate.provider_reference,
    'rateQuoteId', candidate.id,
    'automatic', current_setting('otr.c_automatic_reference', true) = 'true',
    'roundingMode', 'HALF_UP'
  );
  return new;
end;
$$;
create trigger ledger_freeze_reference_provenance_before_insert
before insert on public.exchange_rate_snapshots for each row
execute function public.ledger_freeze_reference_provenance();
revoke all on function public.ledger_freeze_reference_provenance()
from public, anon, authenticated;

create or replace function public.ledger_apply_valuation_c(
  actor_user uuid, target_journey uuid, target_expense uuid,
  idempotency_key_value text, payload_hash_value text,
  valuation_value jsonb, rate_snapshot_value jsonb, response_body_value jsonb,
  automatic_reference boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  expense public.expenses%rowtype;
  settings public.ledger_settings%rowtype;
  candidate public.ledger_rate_quotes%rowtype;
begin
  -- A lost response replays the immutable original result, even after a cache refresh.
  if exists (select 1 from public.ledger_idempotency_keys
    where actor_user_id = actor_user and journey_id = target_journey
      and command_type = 'APPLY_VALUATION' and idempotency_key = idempotency_key_value) then
    return public.ledger_apply_valuation_5_1(actor_user, target_journey, target_expense,
      idempotency_key_value, payload_hash_value, valuation_value,
      rate_snapshot_value, response_body_value);
  end if;

  select * into expense from public.expenses
  where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  select * into settings from public.ledger_settings
  where journey_id = target_journey for share;
  if not found then raise exception 'INVALID_VALUATION'; end if;

  if valuation_value ->> 'policy' = 'REFERENCE_RATE' then
    if expense.economic_date is null
      or valuation_value ->> 'economicDate' is distinct from expense.economic_date::text
      or expense.original_currency = settings.settlement_currency then
      raise exception 'ECONOMIC_DATE_REQUIRED_OR_MISMATCH';
    end if;
    select * into candidate from public.ledger_rate_quotes
    where id = (valuation_value ->> 'rateQuoteId')::uuid for share;
    if not found or candidate.journey_id <> target_journey
      or candidate.economic_date is distinct from expense.economic_date
      or candidate.quote_currency <> expense.original_currency
      or candidate.base_currency <> settings.settlement_currency
      or candidate.policy_version is distinct from 'ECB_DAILY_V1'
      or candidate.provider <> 'ECB'
      or candidate.source_reference is distinct from 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
      or candidate.provider_reference is distinct from format(
        'https://api.frankfurter.dev/v2/providers/ecb/rate/%s/%s?date=%s',
        candidate.quote_currency, candidate.base_currency, candidate.economic_date)
      or candidate.reference_date is null
      or candidate.reference_date > expense.economic_date
      or expense.economic_date - candidate.reference_date > 7
      or candidate.reference_date <> candidate.effective_date
      or candidate.decimal_rate <= 0
      or candidate.expires_at < now()
      or (rate_snapshot_value ->> 'decimalRate')::numeric is distinct from candidate.decimal_rate
      or (rate_snapshot_value ->> 'effectiveDate')::date is distinct from candidate.reference_date
      or rate_snapshot_value ->> 'provider' is distinct from candidate.provider
      or rate_snapshot_value ->> 'providerReference' is distinct from candidate.provider_reference then
      raise exception 'INVALID_REFERENCE_RATE';
    end if;
    if automatic_reference and settings.revision is distinct from
      (valuation_value ->> 'settingsRevision')::bigint then
      raise exception 'SETTINGS_REVISION_CONFLICT';
    end if;
    if automatic_reference and settings.valuation_policy <> 'REFERENCE_RATE' then
      raise exception 'AUTO_VALUATION_NOT_ELIGIBLE';
    end if;
    if automatic_reference and (expense.business_status <> 'RATE_REQUIRED'
      or exists (select 1 from public.settlement_valuation_snapshots
        where expense_id = target_expense and is_active)
      or exists (select 1 from public.ledger_idempotency_keys k
        where k.journey_id = target_journey and k.response_status = 409
          and k.response_body #>> '{error,expenseId}' = target_expense::text
          and not exists (select 1 from public.expense_conflict_resolutions r
            where r.conflict_id = k.id))) then
      raise exception 'AUTO_VALUATION_NOT_ELIGIBLE';
    end if;
    perform set_config('otr.c_rate_quote_id', candidate.id::text, true);
    perform set_config('otr.c_automatic_reference', automatic_reference::text, true);
  else
    if automatic_reference then raise exception 'AUTO_VALUATION_NOT_ELIGIBLE'; end if;
    perform set_config('otr.c_rate_quote_id', '', true);
  end if;

  return public.ledger_apply_valuation_5_1(actor_user, target_journey, target_expense,
    idempotency_key_value, payload_hash_value, valuation_value,
    rate_snapshot_value, response_body_value);
end;
$$;

revoke execute on function public.ledger_apply_valuation_5_1(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb)
from service_role;
revoke all on function public.ledger_apply_valuation_c(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, boolean)
from public, anon, authenticated;
grant execute on function public.ledger_apply_valuation_c(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, boolean)
to service_role;

create table public.ledger_auto_valuation_failures (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  expense_revision bigint not null,
  failure_class text not null check (failure_class in ('TRANSIENT', 'CONFLICT', 'SEMANTIC')),
  next_retry_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (expense_id, expense_revision)
);
alter table public.ledger_auto_valuation_failures enable row level security;
alter table public.ledger_auto_valuation_failures force row level security;
revoke all on table public.ledger_auto_valuation_failures from public, anon, authenticated;
grant select, insert, update on table public.ledger_auto_valuation_failures to service_role;

create or replace function public.ledger_list_auto_reference_demands(max_requests integer default 4)
returns table (
  expense_id uuid, journey_id uuid, actor_user_id uuid,
  economic_date date, rate_quote_id uuid, expense_revision bigint
) language sql security definer set search_path = public as $$
  select e.id, e.journey_id, actor.user_id, e.economic_date, q.id, e.revision
  from public.expenses e
  join public.ledger_settings s on s.journey_id = e.journey_id
    and s.valuation_policy = 'REFERENCE_RATE'
  join public.ledger_rate_quotes q on q.journey_id = e.journey_id
    and q.economic_date = e.economic_date
    and q.quote_currency = e.original_currency
    and q.base_currency = s.settlement_currency
    and q.policy_version = 'ECB_DAILY_V1'
    and q.provider = 'ECB' and q.expires_at > now()
    and q.source_reference = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
    and q.provider_reference = format(
      'https://api.frankfurter.dev/v2/providers/ecb/rate/%s/%s?date=%s',
      q.quote_currency, q.base_currency, q.economic_date)
    and q.reference_date = q.effective_date
  join lateral (
    select m.user_id from public.journey_members m
    where m.trip_id = e.journey_id and m.status = 'linked'
      and m.user_id is not null
      and (m.id = e.creator_member_id or m.role = 'owner')
    order by (m.id = e.creator_member_id) desc, m.created_at asc limit 1
  ) actor on true
  where e.business_status = 'RATE_REQUIRED' and e.deleted_at is null
    and e.economic_date is not null and e.economic_date <= current_date
    and e.original_currency <> s.settlement_currency
    and not exists (select 1 from public.settlement_valuation_snapshots v
      where v.expense_id = e.id and v.is_active)
    and not exists (select 1 from public.ledger_idempotency_keys k
      where k.journey_id = e.journey_id and k.response_status = 409
        and k.response_body #>> '{error,expenseId}' = e.id::text
        and not exists (select 1 from public.expense_conflict_resolutions r
          where r.conflict_id = k.id))
    and not exists (select 1 from public.ledger_auto_valuation_failures f
      where f.expense_id = e.id and f.expense_revision = e.revision
        and (f.next_retry_at is null or f.next_retry_at > now()))
    and not exists (select 1 from public.settlement_inputs si
      join public.settlements t on t.id = si.settlement_id
      where si.expense_id = e.id
        and t.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED'))
  order by e.created_at, e.id
  limit least(greatest(max_requests, 1), 4)
$$;
revoke all on function public.ledger_list_auto_reference_demands(integer)
from public, anon, authenticated;
grant execute on function public.ledger_list_auto_reference_demands(integer)
to service_role;
notify pgrst, 'reload schema';
