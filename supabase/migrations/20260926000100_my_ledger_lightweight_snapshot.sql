-- One MVCC statement supplies only the facts required by My Ledger. The
-- service role is the sole caller; actor_user is taken from Backend auth.
create index ledger_idempotency_keys_conflict_journey_idx
  on public.ledger_idempotency_keys (journey_id)
  where response_status = 409;

create or replace function public.my_ledger_lightweight_snapshot_2_0(
  actor_user uuid, period_key text, from_at timestamptz, to_at timestamptz
) returns jsonb language sql stable security invoker set search_path = public as $$
  with linked as materialized (
    select id as member_id, trip_id as journey_id
    from public.journey_members
    where user_id = actor_user and status = 'linked'
  ), eligible as materialized (
    select l.member_id, l.journey_id, t.name, t.start_date, t.end_date,
      s.settlement_currency, s.settlement_scale, s.updated_at
    from linked l
    join public.ledger_settings s on s.journey_id = l.journey_id
    join public.trips t on t.id = l.journey_id
  ), open_conflicts as materialized (
    select distinct k.journey_id, k.response_body #>> '{error,expenseId}' as expense_id
    from public.ledger_idempotency_keys k
    join eligible a on a.journey_id = k.journey_id
    left join public.expense_conflict_resolutions r on r.conflict_id = k.id
    where k.response_status = 409 and r.conflict_id is null
      and nullif(k.response_body #>> '{error,expenseId}', '') is not null
  ), expense_facts as materialized (
    select e.id, e.revision, e.journey_id, e.category, e.economic_date,
      e.occurred_at, e.business_status, e.settlement_participation,
      e.payer_member_id, e.original_currency, e.original_currency_scale,
      sp.original_amount_minor as personal_split_minor,
      sp.settlement_amount_minor as personal_settlement_minor,
      v.settlement_amount_minor,
      (oc.expense_id is not null) as has_open_conflict
    from eligible a
    join public.expenses e on e.journey_id = a.journey_id
    left join public.expense_splits sp
      on sp.expense_id = e.id and sp.member_id = a.member_id
    left join public.settlement_valuation_snapshots v
      on v.expense_id = e.id and v.is_active
    left join open_conflicts oc
      on oc.journey_id = e.journey_id and oc.expense_id = e.id::text
    where e.business_status <> 'DELETED' and (
      period_key = 'ALL' or
      -- A one-day superset preserves the existing JS ISO-string boundary
      -- filter (including timestamp offset formatting) in Backend aggregation.
      (e.occurred_at >= from_at - interval '1 day'
        and e.occurred_at < to_at + interval '1 day') or
      (sp.expense_id is not null and (
        (period_key = 'YEAR' and e.economic_date >=
          date_trunc('year', (from_at at time zone 'UTC') + interval '1 day')::date
          and e.economic_date <
          (date_trunc('year', (from_at at time zone 'UTC') + interval '1 day') + interval '1 year')::date)
        or (period_key = '30D' and e.economic_date >= (from_at at time zone 'UTC')::date
          and e.economic_date < (to_at at time zone 'UTC')::date)
      ))
    )
  )
  select jsonb_build_object(
    'linkedJourneyCount', (select count(*) from linked),
    'journeys', coalesce((select jsonb_agg(jsonb_build_object(
      'journeyId', journey_id, 'memberId', member_id,
      'title', coalesce(name, 'Journey'), 'startDate', start_date,
      'endDate', end_date, 'currency', settlement_currency,
      'scale', settlement_scale, 'updatedAt', updated_at
    ) order by journey_id) from eligible), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
      'expenseId', id, 'revision', revision, 'journeyId', journey_id,
      'category', category, 'economicDate', economic_date,
      'occurredAt', occurred_at, 'status', business_status,
      'settlementParticipation', settlement_participation,
      'payerMemberId', payer_member_id,
      'originalCurrency', original_currency, 'originalScale', original_currency_scale,
      'personalSplitMinor', personal_split_minor,
      'personalSettlementMinor', personal_settlement_minor,
      'settlementMinor', settlement_amount_minor,
      'hasOpenConflict', has_open_conflict
    ) order by journey_id, id) from expense_facts), '[]'::jsonb)
  );
$$;

revoke all on function public.my_ledger_lightweight_snapshot_2_0(uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.my_ledger_lightweight_snapshot_2_0(uuid,text,timestamptz,timestamptz) to service_role;
