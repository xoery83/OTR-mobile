-- Replace the rejected in-place repair with append-only valuation supersession.

create or replace function public.ledger_repair_ui_polish_fixture_currency_v1(
  p_actor_user_id uuid,
  p_payload_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journey_id constant uuid := '41076e49-0005-599f-af68-5062fd5695f8'::uuid;
  v_inserted integer;
begin
  if p_payload_hash !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.trips
      where id = v_journey_id
        and name = 'Europe 2026 UI Polish'
        and created_by = p_actor_user_id
    )
    or not exists (
      select 1 from public.ledger_settings
      where journey_id = v_journey_id
        and settlement_currency = 'CNY'
        and settlement_scale = 2
    ) then
    raise exception 'UI_POLISH_REPAIR_REJECTED' using errcode = '23514';
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
      and v.settlement_currency = 'NZD'
      and v.settlement_scale = 2
      and v.is_active
    returning v.*
  )
  insert into public.settlement_valuation_snapshots (
    id, expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, settlement_currency, settlement_scale,
    rate_snapshot_id, payment_record_id, reason, is_active, created_by,
    decimal_rate, rounding_mode, effective_at, supersedes_valuation_id
  )
  select
    md5(id::text || '|CNY')::uuid,
    expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, 'CNY', 2,
    rate_snapshot_id, payment_record_id, reason, true, p_actor_user_id,
    decimal_rate, rounding_mode, effective_at, id
  from retired;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 6 then
    raise exception 'UI_POLISH_REPAIR_COUNT_REJECTED' using errcode = '23514';
  end if;

  update public.ledger_idempotency_keys
  set payload_hash = p_payload_hash
  where actor_user_id = p_actor_user_id
    and journey_id = v_journey_id
    and command_type = 'UI_POLISH_FIXTURE_V1'
    and idempotency_key = 'EUROPE_2026_UI_POLISH_V1:' || v_journey_id::text;
  if not found then
    raise exception 'UI_POLISH_REPAIR_RECEIPT_MISSING' using errcode = '23514';
  end if;

  return jsonb_build_object(
    'retiredValuations', v_inserted,
    'replacementValuations', v_inserted,
    'repaired', true
  );
end;
$$;

notify pgrst, 'reload schema';
