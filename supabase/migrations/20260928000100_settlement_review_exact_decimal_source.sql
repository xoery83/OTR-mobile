-- Preserve PostgreSQL numeric precision across the Backend JSON round trip.
create or replace function public.ledger_personal_financial_source_3b(
  p_journey_id uuid,
  p_through_timestamp timestamptz
) returns jsonb
language sql
stable
set search_path = public
as $$
  with source as (
    select public.ledger_settlement_source_7_1(
      p_journey_id, p_through_timestamp
    ) as value
  )
  select jsonb_build_object(
    'journeyId', value -> 'journeyId',
    'settlementCurrency', value -> 'settlementCurrency',
    'settlementScale', value -> 'settlementScale',
    'settingsRevision', value -> 'settingsRevision',
    'members', coalesce((
      select jsonb_agg(member.value -> 'memberId' order by member.ordinality)
      from jsonb_array_elements(value -> 'members')
        with ordinality as member(value, ordinality)
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', expense.value -> 'id',
        'occurredAt', expense.value -> 'occurredAt',
        'businessStatus', expense.value -> 'businessStatus',
        'settlementParticipation', expense.value -> 'settlementParticipation',
        'hasOpenConflict', expense.value -> 'hasOpenConflict',
        'payerMemberId', expense.value -> 'payerMemberId',
        'original', expense.value -> 'original',
        'participants', coalesce((
          select jsonb_agg(participant.value -> 'memberId' order by participant.ordinality)
          from jsonb_array_elements(expense.value -> 'participants')
            with ordinality as participant(value, ordinality)
        ), '[]'::jsonb),
        'splits', expense.value -> 'splits',
        'valuation', case
          when jsonb_typeof(expense.value -> 'valuation') = 'object'
            and jsonb_typeof(expense.value #> '{valuation,decimalRate}') = 'number'
          then jsonb_set(expense.value -> 'valuation', '{decimalRate}',
            to_jsonb(expense.value #>> '{valuation,decimalRate}'))
          else expense.value -> 'valuation'
        end
      ) order by expense.ordinality)
      from jsonb_array_elements(value -> 'expenses')
        with ordinality as expense(value, ordinality)
    ), '[]'::jsonb)
  )
  from source;
$$;

revoke all on function public.ledger_personal_financial_source_3b(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ledger_personal_financial_source_3b(uuid, timestamptz)
  to service_role;

