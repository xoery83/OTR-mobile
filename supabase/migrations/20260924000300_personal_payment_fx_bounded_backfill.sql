-- Slice D: durable economic-date provenance and a guarded, service-only backfill.

alter table public.personal_settlement_payment_records
  add column economic_date_source text
  check (economic_date_source is null or economic_date_source in (
    'EXPLICIT', 'LEGACY_DERIVED_UTC'
  ));

-- Preserve the established mutation boundary. New Mobile requests always carry
-- economicDate; old-client omission remains deterministic and visibly derived.
do $$
declare definition text;
begin
  definition := pg_get_functiondef(
    'public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text)'::regprocedure
  );
  definition := replace(definition,
    'occurred_at, economic_date, note,',
    'occurred_at, economic_date, economic_date_source, note,');
  definition := replace(definition,
    'coalesce(nullif(payment_value ->> ''economicDate'', '''')::date, ((payment_value ->> ''occurredAt'')::timestamptz at time zone ''UTC'')::date), payment_value ->> ''note'',',
    'coalesce(nullif(payment_value ->> ''economicDate'', '''')::date, ((payment_value ->> ''occurredAt'')::timestamptz at time zone ''UTC'')::date), case when nullif(payment_value ->> ''economicDate'', '''') is null then ''LEGACY_DERIVED_UTC'' else ''EXPLICIT'' end, payment_value ->> ''note'',');
  definition := replace(definition,
    'economic_date = coalesce(nullif(payment_value ->> ''economicDate'', '''')::date, ((payment_value ->> ''occurredAt'')::timestamptz at time zone ''UTC'')::date),
        note = payment_value ->> ''note'',',
    'economic_date = coalesce(nullif(payment_value ->> ''economicDate'', '''')::date, ((payment_value ->> ''occurredAt'')::timestamptz at time zone ''UTC'')::date),
        economic_date_source = case when nullif(payment_value ->> ''economicDate'', '''') is null then ''LEGACY_DERIVED_UTC'' else ''EXPLICIT'' end,
        note = payment_value ->> ''note'',');
  if position('economic_date_source' in definition) = 0 then
    raise exception 'Personal Payment economic-date provenance patch failed';
  end if;
  execute definition;
end $$;

create function public.ledger_backfill_personal_payment_fx_1d(
  cohort jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  entry jsonb;
  payment public.personal_settlement_payment_records%rowtype;
  projection public.personal_settlement_payment_fx_projections%rowtype;
  target_code text;
  classification text;
  source_value text;
  expected_digest text;
  created_count integer := 0;
  provenance_count integer := 0;
  satisfied_count integer := 0;
  demand_keys text[] := array[]::text[];
begin
  if jsonb_typeof(cohort) <> 'array' or jsonb_array_length(cohort) not between 1 and 100 then
    raise exception 'PERSONAL_PAYMENT_BACKFILL_COHORT_INVALID';
  end if;
  if (select count(*) <> count(distinct value ->> 'paymentId') from jsonb_array_elements(cohort)) then
    raise exception 'PERSONAL_PAYMENT_BACKFILL_DUPLICATE';
  end if;

  for entry in select value from jsonb_array_elements(cohort) order by value ->> 'paymentId'
  loop
    classification := entry ->> 'classification';
    source_value := entry ->> 'economicDateSource';
    expected_digest := entry ->> 'expectedInputDigest';
    if classification not in ('IDENTITY_SAFE', 'NEEDS_RESOLUTION')
       or source_value not in ('EXPLICIT', 'LEGACY_DERIVED_UTC')
       or expected_digest !~ '^[0-9a-f]{32}$' then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_ENTRY_INVALID';
    end if;

    select * into payment from public.personal_settlement_payment_records
    where id = (entry ->> 'paymentId')::uuid for update;
    if payment.id is null then raise exception 'PERSONAL_PAYMENT_BACKFILL_NOT_FOUND'; end if;
    if payment.deleted_at is not null then raise exception 'PERSONAL_PAYMENT_BACKFILL_DELETED'; end if;
    if payment.revision <> (entry ->> 'expectedRevision')::bigint
       or public.ledger_personal_payment_fx_input_digest_1c(payment) <> expected_digest then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_INPUT_STALE';
    end if;
    select settlement_currency into target_code from public.ledger_settings
    where journey_id = payment.journey_id for share;
    if target_code is null or target_code <> entry ->> 'expectedTargetCurrency' then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_TARGET_STALE';
    end if;
    if (classification = 'IDENTITY_SAFE') <> (payment.currency = target_code) then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_CLASSIFICATION_STALE';
    end if;
    if payment.economic_date_source is not null
       and payment.economic_date_source <> source_value then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_PROVENANCE_CONFLICT';
    end if;

    if payment.economic_date_source is null then
      update public.personal_settlement_payment_records
      set economic_date_source = source_value where id = payment.id;
      provenance_count := provenance_count + 1;
    end if;

    select * into projection from public.personal_settlement_payment_fx_projections
    where payment_id = payment.id and target_currency = target_code
      and policy_version = 'ECB_DAILY_V1';
    if projection.id is null then created_count := created_count + 1;
    else satisfied_count := satisfied_count + 1;
    end if;

    perform public.ledger_ensure_personal_payment_fx_projection_1c(payment.id, target_code);
    select * into projection from public.personal_settlement_payment_fx_projections
    where payment_id = payment.id and target_currency = target_code
      and policy_version = 'ECB_DAILY_V1';
    if projection.id is null or projection.source_payment_revision <> payment.revision
       or projection.input_digest <> expected_digest then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_PROJECTION_INVALID';
    end if;
    if classification = 'IDENTITY_SAFE' and (
      projection.state <> 'CONFIRMED' or projection.equivalent_minor <> payment.amount_minor
      or projection.decimal_rate <> 1 or projection.rate_quote_id is not null
    ) then
      raise exception 'PERSONAL_PAYMENT_BACKFILL_IDENTITY_INVALID';
    end if;
    if classification = 'NEEDS_RESOLUTION' then
      demand_keys := array_append(demand_keys, format('%s:%s:%s:%s:ECB_DAILY_V1',
        payment.journey_id, payment.economic_date, payment.currency, target_code));
    end if;
  end loop;

  return jsonb_build_object(
    'entries', jsonb_array_length(cohort),
    'provenanceUpdated', provenance_count,
    'projectionsCreated', created_count,
    'alreadySatisfied', satisfied_count,
    'demandGroups', (select count(distinct value) from unnest(demand_keys) as value)
  );
end;
$$;

revoke all on function public.ledger_backfill_personal_payment_fx_1d(jsonb)
  from public, anon, authenticated;
grant execute on function public.ledger_backfill_personal_payment_fx_1d(jsonb)
  to service_role;

notify pgrst, 'reload schema';
