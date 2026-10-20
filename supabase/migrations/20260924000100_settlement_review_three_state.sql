alter table public.ledger_settlement_review_checkpoints
  add column review_state text not null default 'LOOKS_GOOD'
  check (review_state in ('LOOKS_GOOD', 'STILL_CHECKING'));

create or replace function public.ledger_create_settlement_review_checkpoint_3c(
  p_actor_user_id uuid,
  p_journey_id uuid,
  p_checkpoint_id uuid,
  p_operation_id uuid,
  p_statement_fingerprint text,
  p_review_state text,
  p_reviewed_statement jsonb,
  p_through_timestamp timestamptz,
  p_expected_financial_source jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_member uuid;
  existing public.ledger_settlement_review_checkpoints%rowtype;
  inserted public.ledger_settlement_review_checkpoints%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_journey_id::text, 0));

  select * into existing
  from public.ledger_settlement_review_checkpoints checkpoint
  where checkpoint.reviewer_user_id = p_actor_user_id
    and checkpoint.operation_id = p_operation_id;
  if found then
    if existing.id <> p_checkpoint_id
      or existing.journey_id <> p_journey_id
      or existing.statement_fingerprint <> p_statement_fingerprint
      or existing.review_state <> p_review_state then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'checkpoint', to_jsonb(existing),
      'idempotentReplay', true
    );
  end if;

  select member.id into actor_member
  from public.journey_members member
  where member.trip_id = p_journey_id
    and member.user_id = p_actor_user_id
    and member.status = 'linked'
  order by member.created_at asc
  limit 1;
  if actor_member is null then raise exception 'CHECKPOINT_FORBIDDEN'; end if;
  if p_checkpoint_id <> p_operation_id
    or p_statement_fingerprint !~ '^[a-f0-9]{64}$'
    or p_review_state not in ('LOOKS_GOOD', 'STILL_CHECKING')
    or p_reviewed_statement ->> 'journeyId' <> p_journey_id::text
    or p_reviewed_statement ->> 'memberId' <> actor_member::text then
    raise exception 'CHECKPOINT_INVALID';
  end if;

  perform 1 from public.ledger_settings
  where journey_id = p_journey_id for update;
  perform 1 from public.journey_members
  where trip_id = p_journey_id for update;
  perform 1 from public.expenses
  where journey_id = p_journey_id and occurred_at <= p_through_timestamp
  for update;
  if public.ledger_personal_financial_source_3b(
    p_journey_id, p_through_timestamp
  ) <> p_expected_financial_source then
    raise exception 'CHECKPOINT_STALE';
  end if;

  insert into public.ledger_settlement_review_checkpoints (
    id, journey_id, reviewer_user_id, reviewer_member_id,
    statement_fingerprint, review_state, reviewed_statement, settings_revision,
    algorithm_version, settlement_id, settlement_revision,
    settlement_input_digest, operation_id
  ) values (
    p_checkpoint_id, p_journey_id, p_actor_user_id, actor_member,
    p_statement_fingerprint, p_review_state, p_reviewed_statement,
    (p_reviewed_statement ->> 'settingsRevision')::bigint,
    p_reviewed_statement ->> 'algorithmVersion',
    nullif(p_reviewed_statement ->> 'settlementId', '')::uuid,
    nullif(p_reviewed_statement ->> 'settlementRevision', '')::bigint,
    nullif(p_reviewed_statement ->> 'settlementInputDigest', ''),
    p_operation_id
  ) returning * into inserted;

  return jsonb_build_object(
    'checkpoint', to_jsonb(inserted),
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.ledger_create_settlement_review_checkpoint_3c(
  uuid, uuid, uuid, uuid, text, text, jsonb, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.ledger_create_settlement_review_checkpoint_3c(
  uuid, uuid, uuid, uuid, text, text, jsonb, timestamptz, jsonb
) to service_role;
