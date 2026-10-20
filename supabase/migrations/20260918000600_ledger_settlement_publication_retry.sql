-- A deliberate Settlement refresh may retry an unpublished same-day rate now.
-- The periodic scanner keeps its one-hour negative cache and shared lease.
create function public.ledger_retry_settlement_unpublished_rates(
  target_journey uuid, max_requests integer default 4
) returns table (
  journey_id uuid, economic_date date, quote_currency text,
  base_currency text, policy_version text
) language plpgsql security definer set search_path = public as $$
begin
  update public.ledger_rate_quote_attempts a set next_retry_at = now()
  where (a.journey_id, a.economic_date, a.quote_currency,
    a.base_currency, a.policy_version) in (
    select r.journey_id, r.economic_date, r.quote_currency,
      r.base_currency, r.policy_version
    from public.ledger_rate_quote_attempts r
    where r.journey_id = target_journey
      and r.status = 'NOT_YET_AVAILABLE'
      and r.economic_date = current_date
      and r.next_retry_at > now()
      and exists (
        select 1 from public.expenses e
        join public.ledger_settings s on s.journey_id = e.journey_id
        where e.journey_id = r.journey_id
          and e.economic_date = r.economic_date
          and e.original_currency = r.quote_currency
          and s.settlement_currency = r.base_currency
          and e.business_status = 'RATE_REQUIRED'
          and e.settlement_participation = 'INCLUDED'
          and e.deleted_at is null
          and not exists (select 1 from public.settlement_valuation_snapshots v
            where v.expense_id = e.id and v.is_active)
      )
    order by r.last_attempt_at
    limit least(greatest(max_requests, 0), 4)
  );
  return query select * from public.ledger_claim_settlement_rate_demands(
    target_journey, max_requests);
end $$;
revoke all on function public.ledger_retry_settlement_unpublished_rates(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.ledger_retry_settlement_unpublished_rates(uuid, integer)
  to service_role;
notify pgrst, 'reload schema';
