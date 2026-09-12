alter table public.settlement_payments
  rename column discharged_amount_minor to asserted_discharge_amount_minor;

alter table public.settlement_payments
  drop constraint settlement_payments_status_check;
alter table public.settlement_payments
  add constraint settlement_payments_status_check check (status in (
    'AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'DISPUTED', 'CORRECTED'
  ));

create table public.repayment_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  transfer_id uuid not null references public.settlement_transfers(id) on delete restrict,
  payment_amount_minor bigint not null check (payment_amount_minor > 0),
  payment_currency text not null check (payment_currency ~ '^[A-Z]{3}$'),
  payment_scale smallint not null check (payment_scale between 0 and 4),
  settlement_amount_minor bigint not null check (settlement_amount_minor > 0),
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  decimal_rate numeric(38,18) not null check (decimal_rate > 0),
  source text not null check (source in ('REFERENCE_RATE', 'MANUAL_AGREED')),
  source_label text not null check (char_length(source_label) between 1 and 120),
  effective_at timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 2000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (journey_id, transfer_id)
    references public.settlement_transfers(journey_id, id) on delete restrict,
  check (source <> 'MANUAL_AGREED' or reason is not null)
);

alter table public.repayment_valuation_snapshots enable row level security;
alter table public.repayment_valuation_snapshots force row level security;
revoke all on table public.repayment_valuation_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.repayment_valuation_snapshots to service_role;
create trigger repayment_valuations_immutable_7_2a before update or delete
on public.repayment_valuation_snapshots for each row
execute function public.ledger_reject_immutable_change();

alter table public.settlement_payments
  add column repayment_valuation_snapshot_id uuid
    references public.repayment_valuation_snapshots(id) on delete restrict,
  add column reported_by_member_id uuid
    references public.journey_members(id) on delete restrict,
  add column reporting_authority text not null default 'PAYER'
    check (reporting_authority in ('PAYER', 'ORGANIZER_OVERRIDE')),
  add column reporting_reason text check (
    reporting_reason is null or char_length(reporting_reason) <= 2000
  ),
  add column fee_amount_minor bigint check (fee_amount_minor >= 0),
  add column fee_currency text check (fee_currency is null or fee_currency ~ '^[A-Z]{3}$'),
  add column fee_scale smallint check (fee_scale is null or fee_scale between 0 and 4),
  add column fee_borne_by text check (fee_borne_by in ('DEBTOR', 'CREDITOR', 'SHARED')),
  add column supersedes_payment_id uuid
    references public.settlement_payments(id) on delete restrict,
  add constraint settlement_payments_fee_group_7_2a check (
    (fee_amount_minor is null and fee_currency is null
      and fee_scale is null and fee_borne_by is null)
    or
    (fee_amount_minor is not null and fee_currency is not null
      and fee_scale is not null and fee_borne_by is not null)
  ),
  add constraint settlement_payments_override_reason_7_2a check (
    reporting_authority <> 'ORGANIZER_OVERRIDE' or reporting_reason is not null
  );

create unique index settlement_payments_one_replacement_7_2a
  on public.settlement_payments(supersedes_payment_id)
  where supersedes_payment_id is not null;

create table public.settlement_payment_discharges (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique
    references public.settlement_payments(id) on delete restrict,
  transfer_id uuid not null references public.settlement_transfers(id) on delete restrict,
  journey_id uuid not null references public.trips(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  settlement_currency text not null check (settlement_currency ~ '^[A-Z]{3}$'),
  settlement_scale smallint not null check (settlement_scale between 0 and 4),
  confirmation_authority text not null check (
    confirmation_authority in ('RECIPIENT', 'ORGANIZER_OVERRIDE')
  ),
  confirmed_by_user_id uuid not null references public.profiles(id) on delete restrict,
  confirmed_by_member_id uuid not null references public.journey_members(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 2000),
  confirmed_at timestamptz not null default now(),
  foreign key (journey_id, transfer_id)
    references public.settlement_transfers(journey_id, id) on delete restrict,
  check (confirmation_authority <> 'ORGANIZER_OVERRIDE' or reason is not null)
);

alter table public.settlement_payment_discharges enable row level security;
alter table public.settlement_payment_discharges force row level security;
revoke all on table public.settlement_payment_discharges from public, anon, authenticated;
grant select, insert, update, delete on table public.settlement_payment_discharges
  to service_role;
create trigger settlement_payment_discharges_immutable_7_2a before update or delete
on public.settlement_payment_discharges for each row
execute function public.ledger_reject_immutable_change();

alter table public.settlement_audit_events
  add column transfer_id uuid references public.settlement_transfers(id) on delete restrict,
  add column payment_id uuid references public.settlement_payments(id) on delete restrict,
  add column discharge_id uuid
    references public.settlement_payment_discharges(id) on delete restrict,
  add column authority text check (
    authority in ('PAYER', 'RECIPIENT', 'ORGANIZER_OVERRIDE')
  );

create or replace function public.ledger_assert_payment_proposition_7_2a(
  transfer_row public.settlement_transfers,
  payment_value jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  payment_minor bigint := (payment_value #>> '{payment,minor}')::bigint;
  payment_currency_value text := payment_value #>> '{payment,currency}';
  payment_scale_value smallint := (payment_value #>> '{payment,scale}')::smallint;
  discharge_minor bigint := (payment_value #>> '{assertedDischarge,minor}')::bigint;
  discharge_currency text := payment_value #>> '{assertedDischarge,currency}';
  discharge_scale smallint := (payment_value #>> '{assertedDischarge,scale}')::smallint;
  valuation jsonb := payment_value -> 'repaymentValuation';
  converted numeric;
begin
  if payment_minor <= 0 or discharge_minor <= 0 then
    raise exception 'PAYMENT_PROPOSITION_INVALID';
  end if;
  if discharge_currency <> transfer_row.settlement_currency
     or discharge_scale <> transfer_row.settlement_scale then
    raise exception 'PAYMENT_PROPOSITION_INVALID';
  end if;
  if payment_currency_value = transfer_row.settlement_currency
     and payment_scale_value = transfer_row.settlement_scale then
    if payment_minor <> discharge_minor
       or (valuation is not null and valuation <> 'null'::jsonb) then
      raise exception 'PAYMENT_PROPOSITION_INVALID';
    end if;
  else
    if valuation is null or valuation = 'null'::jsonb then
      raise exception 'REPAYMENT_VALUATION_INVALID';
    end if;
    converted := round(
      payment_minor::numeric * (valuation ->> 'decimalRate')::numeric
      * power(10::numeric, transfer_row.settlement_scale)
      / power(10::numeric, payment_scale_value)
    );
    if converted <> discharge_minor then
      raise exception 'REPAYMENT_VALUATION_INVALID';
    end if;
    if valuation ->> 'source' = 'MANUAL_AGREED'
       and nullif(trim(valuation ->> 'reason'), '') is null then
      raise exception 'REPAYMENT_VALUATION_INVALID';
    end if;
  end if;
end;
$$;

create or replace function public.ledger_refresh_transfer_7_2a(target_transfer uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  transfer_row public.settlement_transfers%rowtype;
  confirmed bigint;
  awaiting bigint;
  has_dispute boolean;
  next_status text;
  next_settlement_status text;
begin
  select * into transfer_row from public.settlement_transfers
  where id = target_transfer for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;

  select
    coalesce(sum(d.amount_minor), 0),
    coalesce(sum(p.asserted_discharge_amount_minor)
      filter (where p.status = 'AWAITING_CONFIRMATION'), 0),
    coalesce(bool_or(p.status = 'DISPUTED'), false)
  into confirmed, awaiting, has_dispute
  from public.settlement_payments p
  left join public.settlement_payment_discharges d on d.payment_id = p.id
  where p.transfer_id = target_transfer;

  if confirmed + awaiting > transfer_row.obligation_amount_minor then
    raise exception 'TRANSFER_OVERPAYMENT';
  end if;
  next_status := case
    when has_dispute then 'DISPUTED'
    when confirmed = transfer_row.obligation_amount_minor then 'SETTLED'
    when awaiting > 0 then 'AWAITING_CONFIRMATION'
    when confirmed > 0 then 'PARTIALLY_PAID'
    else 'OPEN'
  end;
  update public.settlement_transfers set status = next_status
  where id = target_transfer;

  select case
    when bool_and(coalesce(discharge.confirmed, 0) = st.obligation_amount_minor)
      then 'SETTLED'
    when bool_or(coalesce(discharge.confirmed, 0) > 0)
      then 'PARTIALLY_PAID'
    else 'FINALIZED'
  end into next_settlement_status
  from public.settlement_transfers st
  left join lateral (
    select coalesce(sum(d.amount_minor), 0) as confirmed
    from public.settlement_payment_discharges d where d.transfer_id = st.id
  ) discharge on true
  where st.settlement_id = transfer_row.settlement_id;

  update public.settlements set status = next_settlement_status
  where id = transfer_row.settlement_id;
end;
$$;

create or replace function public.ledger_record_settlement_payment_7_2a(
  actor_user uuid,
  target_journey uuid,
  target_transfer uuid,
  payment_value jsonb,
  idempotency_key_value text,
  payload_hash_value text,
  supersedes_payment_value uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  actor_member public.journey_members%rowtype;
  transfer_row public.settlement_transfers%rowtype;
  debtor_member public.journey_members%rowtype;
  old_payment public.settlement_payments%rowtype;
  existing public.ledger_idempotency_keys%rowtype;
  command_type_value text := case when supersedes_payment_value is null
    then 'RECORD_TRANSFER_PAYMENT' else 'CORRECT_TRANSFER_PAYMENT' end;
  authority_value text := payment_value ->> 'reportingAuthority';
  reason_value text := nullif(trim(payment_value ->> 'reason'), '');
  payment_id_value uuid := (payment_value ->> 'localId')::uuid;
  valuation_id_value uuid;
  settlement_revision_value bigint;
  audit_type text;
  response_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_transfer::text, 0));
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = command_type_value
    and idempotency_key = idempotency_key_value;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into actor_member from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
  order by created_at limit 1;
  select * into transfer_row from public.settlement_transfers
  where id = target_transfer and journey_id = target_journey for update;
  if actor_member.id is null or transfer_row.id is null then
    raise exception 'ENTITY_NOT_FOUND';
  end if;
  select * into debtor_member from public.journey_members
  where id = transfer_row.from_member_id and trip_id = target_journey;

  if supersedes_payment_value is null then
    if (authority_value = 'PAYER' and actor_member.id <> transfer_row.from_member_id)
       or (authority_value = 'ORGANIZER_OVERRIDE'
         and (actor_member.role <> 'owner' or debtor_member.status = 'linked'
           or reason_value is null)) then
      raise exception 'PAYMENT_ACTION_FORBIDDEN';
    end if;
    if (payment_value ->> 'baseTransferRevision')::bigint <> transfer_row.revision then
      raise exception 'PAYMENT_REVISION_CONFLICT';
    end if;
    audit_type := case when authority_value = 'ORGANIZER_OVERRIDE'
      then 'ORGANIZER_OVERRIDE' else 'PAID' end;
  else
    if actor_member.role <> 'owner' or reason_value is null then
      raise exception 'PAYMENT_ACTION_FORBIDDEN';
    end if;
    select * into old_payment from public.settlement_payments
    where id = supersedes_payment_value and transfer_id = target_transfer for update;
    if old_payment.id is null or old_payment.status = 'CONFIRMED' then
      raise exception 'PAYMENT_STATE_CONFLICT';
    end if;
    if (payment_value ->> 'basePaymentRevision')::bigint <> old_payment.revision then
      raise exception 'PAYMENT_REVISION_CONFLICT';
    end if;
    if old_payment.status = 'AWAITING_CONFIRMATION' then
      update public.settlement_payments set status = 'CORRECTED'
      where id = old_payment.id;
    end if;
    authority_value := 'ORGANIZER_OVERRIDE';
    audit_type := 'CORRECTED';
  end if;

  perform public.ledger_assert_payment_proposition_7_2a(transfer_row, payment_value);
  if payment_value -> 'repaymentValuation' is not null
     and payment_value -> 'repaymentValuation' <> 'null'::jsonb then
    valuation_id_value := gen_random_uuid();
    insert into public.repayment_valuation_snapshots (
      id, journey_id, transfer_id, payment_amount_minor, payment_currency,
      payment_scale, settlement_amount_minor, settlement_currency,
      settlement_scale, decimal_rate, source, source_label, effective_at,
      reason, created_by
    ) values (
      valuation_id_value, target_journey, target_transfer,
      (payment_value #>> '{payment,minor}')::bigint,
      payment_value #>> '{payment,currency}',
      (payment_value #>> '{payment,scale}')::smallint,
      (payment_value #>> '{assertedDischarge,minor}')::bigint,
      transfer_row.settlement_currency, transfer_row.settlement_scale,
      (payment_value #>> '{repaymentValuation,decimalRate}')::numeric,
      payment_value #>> '{repaymentValuation,source}',
      payment_value #>> '{repaymentValuation,sourceLabel}',
      (payment_value #>> '{repaymentValuation,effectiveAt}')::timestamptz,
      payment_value #>> '{repaymentValuation,reason}', actor_user
    );
  end if;

  insert into public.settlement_payments (
    id, transfer_id, journey_id, payment_amount_minor, payment_currency,
    payment_scale, asserted_discharge_amount_minor, settlement_currency,
    settlement_scale, repayment_rate, repayment_rate_source,
    repayment_valuation_snapshot_id, reported_by, reported_by_member_id,
    reporting_authority, reporting_reason, paid_at, evidence_asset_id, notes,
    fee_amount_minor, fee_currency, fee_scale, fee_borne_by,
    supersedes_payment_id
  ) values (
    payment_id_value, target_transfer, target_journey,
    (payment_value #>> '{payment,minor}')::bigint,
    payment_value #>> '{payment,currency}',
    (payment_value #>> '{payment,scale}')::smallint,
    (payment_value #>> '{assertedDischarge,minor}')::bigint,
    transfer_row.settlement_currency, transfer_row.settlement_scale,
    (payment_value #>> '{repaymentValuation,decimalRate}')::numeric,
    payment_value #>> '{repaymentValuation,source}', valuation_id_value,
    actor_user, actor_member.id, authority_value, reason_value,
    (payment_value ->> 'paidAt')::timestamptz,
    nullif(payment_value ->> 'evidenceAssetId', '')::uuid,
    payment_value ->> 'notes',
    (payment_value #>> '{feeTreatment,fee,minor}')::bigint,
    payment_value #>> '{feeTreatment,fee,currency}',
    (payment_value #>> '{feeTreatment,fee,scale}')::smallint,
    payment_value #>> '{feeTreatment,borneBy}', supersedes_payment_value
  );

  perform public.ledger_refresh_transfer_7_2a(target_transfer);
  select revision into settlement_revision_value from public.settlements
  where id = transfer_row.settlement_id;
  insert into public.settlement_audit_events (
    settlement_id, journey_id, settlement_revision, event_type,
    actor_user_id, actor_member_id, reason, transfer_id, payment_id, authority,
    metadata
  ) values (
    transfer_row.settlement_id, target_journey, settlement_revision_value,
    audit_type, actor_user, actor_member.id, reason_value, target_transfer,
    payment_id_value, authority_value,
    jsonb_build_object('supersedesPaymentId', supersedes_payment_value)
  );
  response_value := jsonb_build_object(
    'paymentId', payment_id_value, 'idempotentReplay', false
  );
  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
    response_status, response_body, completed_at
  ) values (
    actor_user, target_journey, command_type_value, idempotency_key_value,
    payload_hash_value, 200, response_value, now()
  );
  return response_value;
exception when unique_violation then
  raise exception 'PAYMENT_IDENTITY_CONFLICT';
end;
$$;

create or replace function public.ledger_act_on_settlement_payment_7_2a(
  actor_user uuid,
  target_journey uuid,
  target_payment uuid,
  action_value text,
  base_revision_value bigint,
  authority_value text,
  reason_value text,
  idempotency_key_value text,
  payload_hash_value text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  actor_member public.journey_members%rowtype;
  recipient_member public.journey_members%rowtype;
  payment_row public.settlement_payments%rowtype;
  transfer_row public.settlement_transfers%rowtype;
  existing public.ledger_idempotency_keys%rowtype;
  command_type_value text := upper(action_value) || '_TRANSFER_PAYMENT';
  next_status text;
  event_type_value text;
  discharge_id_value uuid;
  settlement_revision_value bigint;
  response_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_payment::text, 0));
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = command_type_value
    and idempotency_key = idempotency_key_value;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into actor_member from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
  order by created_at limit 1;
  select * into payment_row from public.settlement_payments
  where id = target_payment and journey_id = target_journey for update;
  select * into transfer_row from public.settlement_transfers
  where id = payment_row.transfer_id for update;
  select * into recipient_member from public.journey_members
  where id = transfer_row.to_member_id;
  if actor_member.id is null or payment_row.id is null or transfer_row.id is null then
    raise exception 'ENTITY_NOT_FOUND';
  end if;
  if payment_row.status <> 'AWAITING_CONFIRMATION' then
    raise exception 'PAYMENT_STATE_CONFLICT';
  end if;
  if payment_row.revision <> base_revision_value then
    raise exception 'PAYMENT_REVISION_CONFLICT';
  end if;

  if action_value = 'confirm' then
    if authority_value = 'RECIPIENT' then
      if actor_member.id <> transfer_row.to_member_id then
        raise exception 'PAYMENT_ACTION_FORBIDDEN';
      end if;
    elsif authority_value = 'ORGANIZER_OVERRIDE' then
      if actor_member.role <> 'owner' or recipient_member.status = 'linked'
         or nullif(trim(reason_value), '') is null then
        raise exception 'PAYMENT_ACTION_FORBIDDEN';
      end if;
    else
      raise exception 'PAYMENT_ACTION_FORBIDDEN';
    end if;
    next_status := 'CONFIRMED';
    event_type_value := case when authority_value = 'ORGANIZER_OVERRIDE'
      then 'ORGANIZER_OVERRIDE' else 'RECEIVED' end;
    discharge_id_value := gen_random_uuid();
    insert into public.settlement_payment_discharges (
      id, payment_id, transfer_id, journey_id, amount_minor,
      settlement_currency, settlement_scale, confirmation_authority,
      confirmed_by_user_id, confirmed_by_member_id, reason
    ) values (
      discharge_id_value, target_payment, transfer_row.id, target_journey,
      payment_row.asserted_discharge_amount_minor,
      payment_row.settlement_currency, payment_row.settlement_scale,
      authority_value, actor_user, actor_member.id, nullif(trim(reason_value), '')
    );
    update public.settlement_payments set status = next_status,
      confirmed_by = actor_user, confirmed_at = now() where id = target_payment;
  elsif action_value = 'reject' then
    if actor_member.id = transfer_row.to_member_id then
      authority_value := 'RECIPIENT';
    elsif actor_member.role = 'owner' and recipient_member.status <> 'linked' then
      authority_value := 'ORGANIZER_OVERRIDE';
    else
      raise exception 'PAYMENT_ACTION_FORBIDDEN';
    end if;
    if nullif(trim(reason_value), '') is null then raise exception 'REASON_REQUIRED'; end if;
    next_status := 'REJECTED'; event_type_value := 'REJECTED';
    update public.settlement_payments set status = next_status where id = target_payment;
  elsif action_value = 'dispute' then
    if actor_member.id = transfer_row.from_member_id then
      authority_value := 'PAYER';
    elsif actor_member.id = transfer_row.to_member_id then
      authority_value := 'RECIPIENT';
    elsif actor_member.role = 'owner' then
      authority_value := 'ORGANIZER_OVERRIDE';
    else
      raise exception 'PAYMENT_ACTION_FORBIDDEN';
    end if;
    if nullif(trim(reason_value), '') is null then raise exception 'REASON_REQUIRED'; end if;
    next_status := 'DISPUTED'; event_type_value := 'DISPUTED';
    update public.settlement_payments set status = next_status where id = target_payment;
  else
    raise exception 'PAYMENT_ACTION_INVALID';
  end if;

  perform public.ledger_refresh_transfer_7_2a(transfer_row.id);
  select revision into settlement_revision_value from public.settlements
  where id = transfer_row.settlement_id;
  insert into public.settlement_audit_events (
    settlement_id, journey_id, settlement_revision, event_type,
    actor_user_id, actor_member_id, reason, transfer_id, payment_id,
    discharge_id, authority
  ) values (
    transfer_row.settlement_id, target_journey, settlement_revision_value,
    event_type_value, actor_user, actor_member.id, nullif(trim(reason_value), ''),
    transfer_row.id, target_payment, discharge_id_value, authority_value
  );
  response_value := jsonb_build_object(
    'paymentId', target_payment, 'idempotentReplay', false
  );
  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
    response_status, response_body, completed_at
  ) values (
    actor_user, target_journey, command_type_value, idempotency_key_value,
    payload_hash_value, 200, response_value, now()
  );
  return response_value;
end;
$$;

revoke all on function public.ledger_assert_payment_proposition_7_2a(
  public.settlement_transfers, jsonb
) from public, anon, authenticated;
revoke all on function public.ledger_refresh_transfer_7_2a(uuid)
  from public, anon, authenticated;
revoke all on function public.ledger_record_settlement_payment_7_2a(
  uuid, uuid, uuid, jsonb, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.ledger_act_on_settlement_payment_7_2a(
  uuid, uuid, uuid, text, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.ledger_record_settlement_payment_7_2a(
  uuid, uuid, uuid, jsonb, text, text, uuid
) to service_role;
grant execute on function public.ledger_act_on_settlement_payment_7_2a(
  uuid, uuid, uuid, text, bigint, text, text, text, text
) to service_role;

create or replace function public.ledger_validate_settlement(settlement_uuid uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  target public.settlements%rowtype;
  balance_total bigint;
begin
  select * into target from public.settlements where id = settlement_uuid;
  if not found then return; end if;
  if exists (
    select 1 from public.settlement_member_balances smb
    left join public.journey_members jm
      on jm.id = smb.member_id and jm.trip_id = smb.journey_id
    where smb.settlement_id = settlement_uuid and jm.id is null
  ) then raise exception 'Settlement balance member must belong to its Journey' using errcode = '23514'; end if;
  if exists (
    select 1 from public.settlement_transfers st
    left join public.journey_members fm on fm.id = st.from_member_id and fm.trip_id = st.journey_id
    left join public.journey_members tm on tm.id = st.to_member_id and tm.trip_id = st.journey_id
    where st.settlement_id = settlement_uuid and (fm.id is null or tm.id is null)
  ) then raise exception 'Settlement transfer members must belong to its Journey' using errcode = '23514'; end if;
  if exists (
    select 1 from public.settlement_transfers st where st.settlement_id = settlement_uuid
      and (st.journey_id <> target.journey_id
        or st.settlement_currency <> target.settlement_currency
        or st.settlement_scale <> target.settlement_scale)
  ) then raise exception 'Settlement transfer money must match its Settlement' using errcode = '23514'; end if;
  if exists (
    select 1 from public.settlement_transfers st
    join public.settlement_payments sp on sp.transfer_id = st.id
    where st.settlement_id = settlement_uuid
      and (sp.journey_id <> target.journey_id
        or sp.settlement_currency <> st.settlement_currency
        or sp.settlement_scale <> st.settlement_scale)
  ) then raise exception 'Settlement payment must match its transfer' using errcode = '23514'; end if;
  if exists (
    select 1 from public.settlement_transfers st where st.settlement_id = settlement_uuid
      and coalesce((select sum(d.amount_minor) from public.settlement_payment_discharges d
        where d.transfer_id = st.id), 0)
        + coalesce((select sum(p.asserted_discharge_amount_minor)
          from public.settlement_payments p where p.transfer_id = st.id
            and p.status = 'AWAITING_CONFIRMATION'), 0)
        > st.obligation_amount_minor
  ) then raise exception 'TRANSFER_OVERPAYMENT' using errcode = '23514'; end if;
  if target.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED') then
    select coalesce(sum(net_minor), 0) into balance_total
    from public.settlement_member_balances where settlement_id = settlement_uuid;
    if balance_total <> 0 then
      raise exception 'Finalized settlement balances must net to zero' using errcode = '23514';
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
