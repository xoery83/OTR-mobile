-- Codify two previously approved Hosted Dev hardening changes so a clean rebuild
-- has the same privileges and Stage 5.1 payment-evidence audit linkage.
revoke update, delete on table public.expense_conflict_resolutions from service_role;

create or replace function public.ledger_add_payment_record_5_1(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  idempotency_key_value text,
  payload_hash_value text,
  payment_value jsonb,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  expense public.expenses%rowtype;
  actor_member uuid;
  actor_role text;
  superseded uuid := nullif(payment_value ->> 'supersedesPaymentRecordId', '')::uuid;
begin
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'ADD_PAYMENT_RECORD' and idempotency_key = idempotency_key_value
  for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into expense from public.expenses
  where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  select id, role into actor_member, actor_role from public.journey_members
  where trip_id = target_journey and user_id = actor_user and status = 'linked'
  order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or (actor_member <> expense.payer_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if superseded is not null and not exists (
    select 1 from public.payment_records p where p.id = superseded
      and p.expense_id = target_expense
      and not exists (select 1 from public.payment_records n where n.supersedes_payment_record_id = p.id)
  ) then raise exception 'INVALID_SUPERSESSION'; end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, 'ADD_PAYMENT_RECORD', idempotency_key_value, payload_hash_value);

  insert into public.payment_records (
    id, expense_id, journey_id, expense_revision, payer_member_id, instrument_label,
    authorization_amount_minor, authorization_currency, authorization_scale,
    posted_amount_minor, posted_currency, posted_scale, authorized_at, posted_at,
    fee_amount_minor, fee_currency, fee_scale, bank_fx_rate, source, notes,
    supersedes_payment_record_id, created_by
  ) values (
    (response_body_value #>> '{entity,id}')::uuid, target_expense, target_journey,
    expense.revision, expense.payer_member_id, payment_value ->> 'instrumentLabel',
    nullif(payment_value #>> '{authorization,minor}', '')::bigint,
    payment_value #>> '{authorization,currency}',
    nullif(payment_value #>> '{authorization,scale}', '')::smallint,
    nullif(payment_value #>> '{posted,minor}', '')::bigint,
    payment_value #>> '{posted,currency}',
    nullif(payment_value #>> '{posted,scale}', '')::smallint,
    nullif(payment_value ->> 'authorizedAt', '')::timestamptz,
    nullif(payment_value ->> 'postedAt', '')::timestamptz,
    nullif(payment_value #>> '{fee,minor}', '')::bigint,
    payment_value #>> '{fee,currency}',
    nullif(payment_value #>> '{fee,scale}', '')::smallint,
    nullif(payment_value ->> 'bankFxRate', '')::numeric,
    payment_value ->> 'source', payment_value ->> 'notes', superseded, actor_user
  );
  insert into public.expense_audit_events (
    expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, reason, changed_groups, after_hash, metadata
  ) values (
    target_expense, target_journey, expense.revision,
    case when superseded is null then 'PAYMENT_RECORD_ADDED' else 'PAYMENT_RECORD_SUPERSEDED' end,
    actor_user, actor_member, payment_value ->> 'notes', array['EVIDENCE'], payload_hash_value,
    jsonb_build_object('paymentRecordId', response_body_value #>> '{entity,id}')
  );
  update public.ledger_idempotency_keys set response_status = 201,
    response_body = response_body_value, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'ADD_PAYMENT_RECORD' and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;
