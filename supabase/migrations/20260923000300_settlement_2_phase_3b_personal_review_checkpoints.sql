create table public.ledger_settlement_review_checkpoints (
  id uuid primary key,
  journey_id uuid not null references public.trips(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  reviewer_member_id uuid not null references public.journey_members(id) on delete restrict,
  statement_fingerprint text not null check (statement_fingerprint ~ '^[a-f0-9]{64}$'),
  reviewed_statement jsonb not null check (jsonb_typeof(reviewed_statement) = 'object'),
  settings_revision bigint not null check (settings_revision > 0),
  algorithm_version text not null,
  settlement_id uuid references public.settlements(id) on delete restrict,
  settlement_revision bigint check (settlement_revision is null or settlement_revision > 0),
  settlement_input_digest text check (
    settlement_input_digest is null or settlement_input_digest ~ '^[a-f0-9]{64}$'
  ),
  operation_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  reviewed_at timestamptz not null default now(),
  unique (reviewer_user_id, operation_id)
);

create index ledger_settlement_review_checkpoint_latest_3b
  on public.ledger_settlement_review_checkpoints(
    reviewer_user_id, journey_id, reviewed_at desc, id desc
  );

alter table public.ledger_settlement_review_checkpoints enable row level security;
alter table public.ledger_settlement_review_checkpoints force row level security;
revoke all on table public.ledger_settlement_review_checkpoints
  from public, anon, authenticated;
grant select, insert on table public.ledger_settlement_review_checkpoints to service_role;

create trigger ledger_settlement_review_checkpoints_immutable_3b
before update or delete on public.ledger_settlement_review_checkpoints
for each row execute function public.ledger_reject_immutable_change();

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
        'valuation', expense.value -> 'valuation'
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

create or replace function public.ledger_create_settlement_review_checkpoint_3b(
  p_actor_user_id uuid,
  p_journey_id uuid,
  p_checkpoint_id uuid,
  p_operation_id uuid,
  p_statement_fingerprint text,
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
      or existing.statement_fingerprint <> p_statement_fingerprint then
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
    statement_fingerprint, reviewed_statement, settings_revision,
    algorithm_version, settlement_id, settlement_revision,
    settlement_input_digest, operation_id
  ) values (
    p_checkpoint_id, p_journey_id, p_actor_user_id, actor_member,
    p_statement_fingerprint, p_reviewed_statement,
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

revoke all on function public.ledger_create_settlement_review_checkpoint_3b(
  uuid, uuid, uuid, uuid, text, jsonb, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.ledger_create_settlement_review_checkpoint_3b(
  uuid, uuid, uuid, uuid, text, jsonb, timestamptz, jsonb
) to service_role;
