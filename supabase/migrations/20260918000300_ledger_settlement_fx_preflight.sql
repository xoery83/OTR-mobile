-- Service-role-only Journey-scoped demand; the same retry/lease table is shared
-- with the periodic scanner, so foreground and background cannot claim twice.
create function public.ledger_claim_settlement_rate_demands(
  target_journey uuid, max_requests integer default 4
) returns table (
  journey_id uuid, economic_date date, quote_currency text,
  base_currency text, policy_version text
) language sql security definer set search_path = public as $$
  with demand as (
    select distinct e.journey_id, e.economic_date,
      e.original_currency as quote_currency,
      s.settlement_currency as base_currency,
      'ECB_DAILY_V1'::text as policy_version
    from public.expenses e
    join public.ledger_settings s on s.journey_id = e.journey_id
      and s.valuation_policy = 'REFERENCE_RATE'
    where e.journey_id = target_journey
      and e.business_status = 'RATE_REQUIRED'
      and e.deleted_at is null and e.economic_date is not null
      and e.economic_date <= current_date
      and e.original_currency <> s.settlement_currency
      and not exists (select 1 from public.settlement_valuation_snapshots v
        where v.expense_id = e.id and v.is_active)
      and not exists (select 1 from public.ledger_idempotency_keys k
        where k.journey_id = e.journey_id and k.response_status = 409
          and k.response_body #>> '{error,expenseId}' = e.id::text
          and not exists (select 1 from public.expense_conflict_resolutions r
            where r.conflict_id = k.id))
      and not exists (select 1 from public.settlement_inputs si
        join public.settlements t on t.id = si.settlement_id
        where si.expense_id = e.id
          and t.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED'))
      and not exists (select 1 from public.ledger_rate_quotes q
        where q.journey_id = e.journey_id
          and q.economic_date = e.economic_date
          and q.quote_currency = e.original_currency
          and q.base_currency = s.settlement_currency
          and q.policy_version = 'ECB_DAILY_V1' and q.expires_at > now())
      and not exists (select 1 from public.ledger_rate_quote_attempts a
        where a.journey_id = e.journey_id
          and a.economic_date = e.economic_date
          and a.quote_currency = e.original_currency
          and a.base_currency = s.settlement_currency
          and a.policy_version = 'ECB_DAILY_V1' and a.next_retry_at > now())
    order by e.journey_id, e.economic_date, e.original_currency,
      s.settlement_currency, policy_version
    limit least(greatest(max_requests, 0), 4)
  ), claimed as (
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
      a.base_currency, a.policy_version
  ) select * from claimed;
$$;
revoke all on function public.ledger_claim_settlement_rate_demands(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.ledger_claim_settlement_rate_demands(uuid, integer)
  to service_role;

-- Reuse Stage C eligibility verbatim, but constrain the priority batch to one Journey.
create function public.ledger_list_settlement_auto_reference_demands(
  target_journey uuid, max_requests integer default 4
) returns table (
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
  where e.journey_id = target_journey
    and e.business_status = 'RATE_REQUIRED' and e.deleted_at is null
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
revoke all on function public.ledger_list_settlement_auto_reference_demands(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.ledger_list_settlement_auto_reference_demands(uuid, integer)
  to service_role;
notify pgrst, 'reload schema';
