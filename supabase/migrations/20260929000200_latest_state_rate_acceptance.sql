-- The existing locked/idempotent RPC remains the transaction owner.
create function public.ledger_rate_acceptance_rebase_v2(base jsonb, current_value jsonb, intent jsonb)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(
    intent ->> 'type' = 'APPLY_VALUATION'
    and intent #>> '{valuation,policy}' = 'MANUAL_AGREED'
    and base ->> 'businessStatus' = 'RATE_REQUIRED' and base -> 'valuation' = 'null'::jsonb
    and current_value ->> 'businessStatus' = 'ACCEPTED'
    and current_value #>> '{valuation,policy}' = 'REFERENCE_RATE'
    and current_value #>> '{valuation,referenceEvidence,automatic}' = 'true'
    and intent #> '{valuation,rateAcceptance,original}' = base -> 'original'
    and intent #>> '{valuation,rateAcceptance,economicDate}' = base ->> 'economicDate'
    and intent #> '{valuation,rateAcceptance,settlement}' = current_value #> '{valuation,settlement}'
    and intent #> '{valuation,previewSettlement}' = current_value #> '{valuation,settlement}'
    and (intent #>> '{valuation,manualRate}')::numeric = (intent #>> '{valuation,rateAcceptance,decimalRate}')::numeric
    and (intent #>> '{valuation,manualRate}')::numeric = (current_value #>> '{valuation,decimalRate}')::numeric
    and (select jsonb_object_agg(k,base -> k) from unnest(array['original','economicDate','payerMemberId','settlementParticipation','participants']) k)
      = (select jsonb_object_agg(k,current_value -> k) from unnest(array['original','economicDate','payerMemberId','settlementParticipation','participants']) k)
    and (select jsonb_agg(s - array['settlementMinor','roundingAdjustmentMinor'] order by s ->> 'memberId') from jsonb_array_elements(base -> 'splits') s)
      = (select jsonb_agg(s - array['settlementMinor','roundingAdjustmentMinor'] order by s ->> 'memberId') from jsonb_array_elements(current_value -> 'splits') s)
  ,false);
$$;
revoke all on function public.ledger_rate_acceptance_rebase_v2(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.ledger_rate_acceptance_rebase_v2(jsonb,jsonb,jsonb) to service_role;

-- Preserve the reviewed Phase 3 function, changing only the admission guard.
do $migration$
declare definition text; old_guard text := $$eligibility_value not in ('DESCRIPTIVE_REBASE','EQUIVALENT')$$;
  anchor text := $$  if resolution_value is not null then
    if nullif(trim(reason_value), '') is null then raise exception 'RESOLUTION_REASON_REQUIRED'; end if;$$;
begin
  select pg_get_functiondef('public.ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)'::regprocedure) into definition;
  if position(old_guard in definition) = 0 or position(anchor in definition) = 0 then
    raise exception 'RATE_ACCEPTANCE_MIGRATION_PARENT_DRIFT';
  end if;
  definition := replace(definition,old_guard,$$eligibility_value not in ('DESCRIPTIVE_REBASE','EQUIVALENT','VALUATION_REBASE')$$);
  definition := replace(definition,anchor,$guard$
  if eligibility_value = 'VALUATION_REBASE' and (
    resolution_value is not null or historical_base_value is null
    or not public.ledger_rate_acceptance_rebase_v2(coalesce(causal_base,historical_base_value),response_body_value -> '_verifiedCurrent',intent)
  ) then eligibility_value := 'CONFLICT'; end if;
  if intent_type = 'APPLY_VALUATION' and intent #> '{valuation,rateAcceptance}' is not null and (
    intent #> '{valuation,rateAcceptance,original}' <> response_body_value #> '{_verifiedCurrent,original}'
    or intent #>> '{valuation,rateAcceptance,economicDate}' is distinct from response_body_value #>> '{_verifiedCurrent,economicDate}'
    or intent #>> '{valuation,rateAcceptance,settlement,currency}' is distinct from
      (select settlement_currency from public.ledger_settings where journey_id = target_journey)
    or (intent #>> '{valuation,rateAcceptance,settlement,scale}')::int is distinct from
      (select settlement_scale from public.ledger_settings where journey_id = target_journey)
  ) then eligibility_value := 'CONFLICT'; end if;
  if resolution_value is not null then
    if nullif(trim(reason_value), '') is null then raise exception 'RESOLUTION_REASON_REQUIRED'; end if;
$guard$);
  execute definition;
end;
$migration$;
