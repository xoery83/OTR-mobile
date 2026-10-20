-- Stage 9: service-only, transactional Dev replay import.
-- The backend validates the exact Dev project before calling this function.

create or replace function public.ledger_import_stage9_v1(
  p_actor_user_id uuid,
  p_payload_hash text,
  p_dataset jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.ledger_idempotency_keys%rowtype;
  v_journey jsonb := p_dataset -> 'journey';
  v_settings jsonb := p_dataset -> 'settings';
  v_journey_id uuid := (p_dataset #>> '{journey,id}')::uuid;
  v_item jsonb;
  v_response jsonb;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260913000500'
  ) then
    raise exception 'IMPORT_SCHEMA_VERSION_MISMATCH' using errcode = '23514';
  end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_dataset ->> 'targetProjectRef' <> 'tuqigdxrvrerfewsxqgm'
    or p_dataset ->> 'transformVersion' <> 'stage9-europe-replay-v2'
    or p_dataset ->> 'normalizationVersion' <> 'legacy-equal-rounding-normalization-v2'
    or p_dataset ->> 'mappingVersion' <> 'legacy-ledger-to-ledger2-v1'
    or v_journey ->> 'name' <> 'Europe 2026 Replay'
    or (v_journey ->> 'createdByUserId')::uuid <> p_actor_user_id then
    raise exception 'INVALID_STAGE9_IMPORT' using errcode = '23514';
  end if;

  select * into v_existing from public.ledger_idempotency_keys
  where actor_user_id = p_actor_user_id and journey_id = v_journey_id
    and command_type = 'STAGE9_IMPORT_V1'
    and idempotency_key = 'STAGE9_EUROPE_REPLAY_V1:' || v_journey_id::text;
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      raise exception 'IMPORT_PAYLOAD_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_set(v_existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  if exists (select 1 from public.trips where id = v_journey_id) then
    raise exception 'IMPORT_JOURNEY_CONFLICT' using errcode = '23505';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_user_id) then
    raise exception 'IMPORT_ACTOR_NOT_FOUND' using errcode = '23503';
  end if;

  insert into public.trips (id, name, start_date, end_date, created_by)
  values (
    v_journey_id,
    v_journey ->> 'name',
    nullif(v_journey ->> 'startDate', '')::date,
    nullif(v_journey ->> 'endDate', '')::date,
    p_actor_user_id
  );

  -- The existing Trip trigger creates the owner Journey member. Preserve that
  -- invariant while replacing its generated identity and label deterministically.
  select value into v_item from jsonb_array_elements(p_dataset -> 'members')
  where value ->> 'role' = 'owner'
    and (value ->> 'userId')::uuid = p_actor_user_id;
  update public.journey_members set
    id = (v_item ->> 'id')::uuid,
    display_name = v_item ->> 'displayName',
    role = 'owner',
    status = 'linked'
  where trip_id = v_journey_id and user_id = p_actor_user_id;
  if not found then
    raise exception 'IMPORT_OWNER_TRIGGER_MISSING' using errcode = '23514';
  end if;

  for v_item in select value from jsonb_array_elements(p_dataset -> 'members') loop
    if v_item ->> 'role' = 'owner'
      and (v_item ->> 'userId')::uuid = p_actor_user_id then
      continue;
    end if;
    insert into public.journey_members (
      id, trip_id, user_id, display_name, role, status
    ) values (
      (v_item ->> 'id')::uuid,
      v_journey_id,
      nullif(v_item ->> 'userId', '')::uuid,
      v_item ->> 'displayName',
      v_item ->> 'role',
      v_item ->> 'status'
    );
  end loop;

  if (select count(*) from public.journey_members
      where trip_id = v_journey_id and user_id = p_actor_user_id
        and role = 'owner' and status = 'linked') <> 1 then
    raise exception 'IMPORT_OWNER_INVALID' using errcode = '23514';
  end if;

  insert into public.ledger_settings (
    journey_id, settlement_currency, settlement_scale, valuation_policy,
    updated_by
  ) values (
    v_journey_id,
    v_settings ->> 'settlementCurrency',
    (v_settings ->> 'settlementScale')::smallint,
    v_settings ->> 'valuationPolicy',
    p_actor_user_id
  );

  for v_item in select value from jsonb_array_elements(p_dataset -> 'expenses') loop
    insert into public.expenses (
      id, journey_id, payer_member_id, title, category, occurred_at,
      original_amount_minor, original_currency, original_currency_scale,
      business_status, import_provenance, revision
    ) values (
      (v_item ->> 'id')::uuid,
      v_journey_id,
      (v_item ->> 'payerMemberId')::uuid,
      v_item ->> 'title',
      v_item ->> 'category',
      (v_item ->> 'occurredAt')::timestamptz,
      (v_item ->> 'originalAmountMinor')::bigint,
      v_item ->> 'originalCurrency',
      (v_item ->> 'originalScale')::smallint,
      v_item ->> 'businessStatus',
      v_item -> 'importProvenance',
      1
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_dataset -> 'participants') loop
    insert into public.expense_participants (
      expense_id, journey_id, member_id, display_name_snapshot, display_order
    ) values (
      (v_item ->> 'expenseId')::uuid,
      v_journey_id,
      (v_item ->> 'memberId')::uuid,
      v_item ->> 'displayNameSnapshot',
      (v_item ->> 'displayOrder')::integer
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_dataset -> 'splits') loop
    insert into public.expense_splits (
      expense_id, journey_id, member_id, split_method,
      original_amount_minor, settlement_amount_minor, rounding_adjustment_minor
    ) values (
      (v_item ->> 'expenseId')::uuid,
      v_journey_id,
      (v_item ->> 'memberId')::uuid,
      v_item ->> 'method',
      (v_item ->> 'originalAmountMinor')::bigint,
      (v_item ->> 'settlementAmountMinor')::bigint,
      (v_item ->> 'roundingAdjustmentMinor')::integer
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_dataset -> 'rateSnapshots') loop
    insert into public.exchange_rate_snapshots (
      id, expense_id, journey_id, expense_revision, base_currency,
      quote_currency, decimal_rate, effective_date, source, provenance,
      staleness_state
    ) values (
      (v_item ->> 'id')::uuid,
      (v_item ->> 'expenseId')::uuid,
      v_journey_id,
      1,
      v_item ->> 'baseCurrency',
      v_item ->> 'quoteCurrency',
      (v_item ->> 'decimalRate')::numeric,
      (v_item ->> 'effectiveDate')::date,
      'LEGACY_IMPORTED',
      jsonb_build_object('sourceRefHmac', v_item ->> 'sourceRefHmac'),
      'STALE_ACCEPTED'
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_dataset -> 'valuations') loop
    insert into public.settlement_valuation_snapshots (
      id, expense_id, journey_id, expense_revision, policy,
      original_amount_minor, original_currency, original_scale,
      settlement_amount_minor, settlement_currency, settlement_scale,
      rate_snapshot_id, decimal_rate, rounding_mode, effective_at, is_active
    ) values (
      (v_item ->> 'id')::uuid,
      (v_item ->> 'expenseId')::uuid,
      v_journey_id,
      1,
      'LEGACY_IMPORTED',
      (v_item ->> 'originalAmountMinor')::bigint,
      v_item ->> 'originalCurrency',
      (v_item ->> 'originalScale')::smallint,
      (v_item ->> 'settlementAmountMinor')::bigint,
      v_item ->> 'settlementCurrency',
      (v_item ->> 'settlementScale')::smallint,
      (v_item ->> 'rateSnapshotId')::uuid,
      null,
      'HALF_UP',
      (v_item ->> 'effectiveAt')::timestamptz,
      true
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_dataset -> 'reviewFindings') loop
    insert into public.ledger_review_findings (
      id, journey_id, expense_id, layer, finding_type, severity,
      evidence_codes, status, ruleset_version, entity_revision, revision
    ) values (
      (v_item ->> 'id')::uuid,
      v_journey_id,
      (v_item ->> 'expenseId')::uuid,
      'DETERMINISTIC',
      'IMPORT_NEEDS_REVIEW',
      'BLOCKING',
      array(select jsonb_array_elements_text(v_item -> 'evidenceCodes')),
      'OPEN',
      v_item ->> 'rulesetVersion',
      1,
      1
    );
  end loop;

  set constraints all immediate;

  v_response := jsonb_build_object(
    'journeyId', v_journey_id,
    'counts', jsonb_build_object(
      'members', jsonb_array_length(p_dataset -> 'members'),
      'expenses', jsonb_array_length(p_dataset -> 'expenses'),
      'participants', jsonb_array_length(p_dataset -> 'participants'),
      'splits', jsonb_array_length(p_dataset -> 'splits'),
      'rateSnapshots', jsonb_array_length(p_dataset -> 'rateSnapshots'),
      'valuations', jsonb_array_length(p_dataset -> 'valuations'),
      'reviewFindings', jsonb_array_length(p_dataset -> 'reviewFindings')
    ),
    'idempotentReplay', false
  );

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key,
    payload_hash, response_status, response_body, completed_at
  ) values (
    p_actor_user_id,
    v_journey_id,
    'STAGE9_IMPORT_V1',
    'STAGE9_EUROPE_REPLAY_V1:' || v_journey_id::text,
    p_payload_hash,
    201,
    v_response,
    now()
  );

  return v_response;
end;
$$;

revoke all on function public.ledger_import_stage9_v1(uuid, text, jsonb) from public;
revoke all on function public.ledger_import_stage9_v1(uuid, text, jsonb) from anon;
revoke all on function public.ledger_import_stage9_v1(uuid, text, jsonb) from authenticated;
grant execute on function public.ledger_import_stage9_v1(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
