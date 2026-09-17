-- Resolve RETURN TABLE output-name ambiguity in the demand upsert.
create or replace function public.ledger_claim_currency_preview_demands(
  actor_user uuid, target_journey uuid, target_currency text,
  max_requests integer default 4
) returns table (
  journey_id uuid, economic_date date, quote_currency text,
  base_currency text, policy_version text
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
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

