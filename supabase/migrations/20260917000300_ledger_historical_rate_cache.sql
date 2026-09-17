-- B2 candidates remain separate from immutable accepted exchange-rate snapshots.
alter table public.ledger_rate_quotes
  add column economic_date date,
  add column reference_date date,
  add column policy_version text,
  add column source_reference text;
alter table public.ledger_rate_quotes
  add constraint ledger_rate_quotes_b2_dates check (
    (economic_date is null and reference_date is null and policy_version is null)
    or (economic_date is not null and reference_date is not null
      and policy_version = 'ECB_DAILY_V1'
      and reference_date <= economic_date
      and economic_date - reference_date between 0 and 7)
  );
create unique index ledger_rate_quotes_b2_request_key
  on public.ledger_rate_quotes
  (journey_id, economic_date, quote_currency, base_currency, policy_version);

-- An Expense is the durable demand. This small table only coordinates leases and retries.
create table public.ledger_rate_quote_attempts (
  journey_id uuid not null references public.trips(id) on delete cascade,
  economic_date date not null,
  quote_currency text not null,
  base_currency text not null,
  policy_version text not null check (policy_version = 'ECB_DAILY_V1'),
  status text not null check (status in (
    'IN_FLIGHT', 'TEMPORARY_FAILURE', 'RATE_LIMITED', 'UNSUPPORTED',
    'NOT_YET_AVAILABLE', 'NO_REFERENCE_WITHIN_POLICY'
  )),
  next_retry_at timestamptz not null,
  last_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  primary key (journey_id, economic_date, quote_currency, base_currency, policy_version)
);
alter table public.ledger_rate_quote_attempts enable row level security;
alter table public.ledger_rate_quote_attempts force row level security;
revoke all on public.ledger_rate_quote_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.ledger_rate_quote_attempts to service_role;

-- One caller claims each due request; a 45-second lease exceeds the provider's
-- eight-second timeout and is recoverable after Backend process death.
create function public.ledger_claim_rate_demands(max_requests integer default 20)
returns table (
  journey_id uuid, economic_date date, quote_currency text,
  base_currency text, policy_version text
)
language sql security definer set search_path = public as $$
  with demand as (
    select distinct e.journey_id, e.economic_date,
      e.original_currency as quote_currency,
      coalesce(s.settlement_currency, 'NZD') as base_currency,
      'ECB_DAILY_V1'::text as policy_version
    from public.expenses e
    left join public.ledger_settings s on s.journey_id = e.journey_id
    where e.business_status = 'RATE_REQUIRED'
      and e.deleted_at is null and e.economic_date is not null
      and e.original_currency <> coalesce(s.settlement_currency, 'NZD')
      and not exists (
        select 1 from public.ledger_rate_quotes q
        where q.journey_id = e.journey_id
          and q.economic_date = e.economic_date
          and q.quote_currency = e.original_currency
          and q.base_currency = coalesce(s.settlement_currency, 'NZD')
          and q.policy_version = 'ECB_DAILY_V1'
          and q.expires_at > now()
      )
      and not exists (
        select 1 from public.ledger_rate_quote_attempts a
        where a.journey_id = e.journey_id
          and a.economic_date = e.economic_date
          and a.quote_currency = e.original_currency
          and a.base_currency = coalesce(s.settlement_currency, 'NZD')
          and a.policy_version = 'ECB_DAILY_V1'
          and a.next_retry_at > now()
      )
    order by e.journey_id, e.economic_date, e.original_currency,
      coalesce(s.settlement_currency, 'NZD'), policy_version
    limit least(greatest(max_requests, 0), 50)
  ), claimed as (
    insert into public.ledger_rate_quote_attempts as a (
      journey_id, economic_date, quote_currency, base_currency,
      policy_version, status, next_retry_at
    )
    select d.journey_id, d.economic_date, d.quote_currency, d.base_currency,
      d.policy_version, 'IN_FLIGHT', now() + interval '45 seconds'
    from demand d
    on conflict (journey_id, economic_date, quote_currency, base_currency, policy_version)
    do update set status = 'IN_FLIGHT',
      next_retry_at = now() + interval '45 seconds',
      last_attempt_at = now(), attempt_count = a.attempt_count + 1
    where a.next_retry_at <= now()
    returning a.journey_id, a.economic_date, a.quote_currency,
      a.base_currency, a.policy_version
  )
  select * from claimed;
$$;
revoke all on function public.ledger_claim_rate_demands(integer)
  from public, anon, authenticated;
grant execute on function public.ledger_claim_rate_demands(integer) to service_role;

notify pgrst, 'reload schema';
