-- Append-only replacement for six repair snapshots whose UUID version nibble was invalid.

create or replace function public.ledger_repair_ui_polish_fixture_uuid_v1(
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
    raise exception 'UI_POLISH_UUID_REPAIR_REJECTED' using errcode = '23514';
  end if;

  with retired as (
    update public.settlement_valuation_snapshots v
    set is_active = false
    from public.expenses e
    where v.journey_id = v_journey_id
      and e.id = v.expense_id
      and e.journey_id = v_journey_id
      and e.import_provenance ->> 'fixtureVersion' = 'ledger-ui-polish-v1'
      and e.import_provenance ->> 'baselineClone' = 'false'
      and e.business_status = 'ACCEPTED'
      and v.policy = 'MANUAL_AGREED'
      and v.settlement_currency = 'CNY'
      and v.settlement_scale = 2
      and v.is_active
      and v.id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    returning v.*
  ), replacements as (
    select retired.*, md5(retired.id::text || '|valid-v5') as digest
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
    decimal_rate, rounding_mode, effective_at, id
  from replacements;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 6 then
    raise exception 'UI_POLISH_UUID_REPAIR_COUNT_REJECTED' using errcode = '23514';
  end if;

  return jsonb_build_object(
    'retiredInvalidUuidValuations', v_inserted,
    'replacementValuations', v_inserted,
    'repaired', true
  );
end;
$$;

revoke all on function public.ledger_repair_ui_polish_fixture_uuid_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.ledger_repair_ui_polish_fixture_uuid_v1(uuid)
  to service_role;

notify pgrst, 'reload schema';
