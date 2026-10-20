-- Keep the active UI fixture valuation lineage Mobile-schema-valid.

create or replace function public.ledger_repair_ui_polish_fixture_lineage_v1(
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journey_id constant uuid := '41076e49-0005-599f-af68-5062fd5695f8'::uuid;
  v_inserted integer;
begin
  if not exists (
    select 1 from public.trips
    where id = v_journey_id
      and name = 'Europe 2026 UI Polish'
      and created_by = p_actor_user_id
  ) then
    raise exception 'UI_POLISH_LINEAGE_REPAIR_REJECTED' using errcode = '23514';
  end if;

  with retired as (
    update public.settlement_valuation_snapshots active
    set is_active = false
    from public.expenses e,
      public.settlement_valuation_snapshots invalid_parent
    where active.journey_id = v_journey_id
      and e.id = active.expense_id
      and e.journey_id = v_journey_id
      and e.import_provenance ->> 'fixtureVersion' = 'ledger-ui-polish-v1'
      and e.import_provenance ->> 'baselineClone' = 'false'
      and active.policy = 'MANUAL_AGREED'
      and active.settlement_currency = 'CNY'
      and active.is_active
      and invalid_parent.id = active.supersedes_valuation_id
      and invalid_parent.id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and invalid_parent.supersedes_valuation_id::text
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    returning active.*, invalid_parent.supersedes_valuation_id as valid_parent_id
  ), replacements as (
    select retired.*, md5(retired.id::text || '|valid-lineage-v5') as digest
    from retired
  )
  insert into public.settlement_valuation_snapshots (
    id, expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, settlement_currency, settlement_scale,
    rate_snapshot_id, payment_record_id, reason, is_active, created_by,
    decimal_rate, rounding_mode, effective_at, supersedes_valuation_id
  )
  select
    (
      substr(digest, 1, 8) || '-' || substr(digest, 9, 4) || '-5' ||
      substr(digest, 14, 3) || '-a' || substr(digest, 18, 3) || '-' ||
      substr(digest, 21, 12)
    )::uuid,
    expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, settlement_currency, settlement_scale,
    rate_snapshot_id, payment_record_id, reason, true, p_actor_user_id,
    decimal_rate, rounding_mode, effective_at, valid_parent_id
  from replacements;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 6 then
    raise exception 'UI_POLISH_LINEAGE_REPAIR_COUNT_REJECTED' using errcode = '23514';
  end if;

  return jsonb_build_object(
    'retiredInvalidLineageValuations', v_inserted,
    'replacementValuations', v_inserted,
    'repaired', true
  );
end;
$$;

revoke all on function public.ledger_repair_ui_polish_fixture_lineage_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.ledger_repair_ui_polish_fixture_lineage_v1(uuid)
  to service_role;

notify pgrst, 'reload schema';
