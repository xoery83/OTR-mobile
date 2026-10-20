create table public.ledger_review_finding_actions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.ledger_review_findings(id) on delete cascade,
  journey_id uuid not null references public.trips(id) on delete cascade,
  action text not null check (action in ('ACKNOWLEDGED', 'DISMISSED')),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_member_id uuid not null references public.journey_members(id) on delete restrict,
  actor_role text not null,
  reason text not null check (char_length(reason) between 1 and 2000),
  finding_revision bigint not null check (finding_revision > 0),
  entity_revision bigint,
  ruleset_version text not null,
  operation_id text not null check (char_length(operation_id) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (actor_user_id, operation_id)
);

create index ledger_review_finding_actions_finding_idx
  on public.ledger_review_finding_actions(finding_id, created_at);

alter table public.ledger_review_finding_actions enable row level security;
alter table public.ledger_review_finding_actions force row level security;
revoke all on table public.ledger_review_finding_actions from public, anon, authenticated;
grant select, insert on table public.ledger_review_finding_actions to service_role;

create or replace function public.ledger_review_finding_action_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'ledger_review_finding_actions is append-only' using errcode = '23514';
end;
$$;

revoke all on function public.ledger_review_finding_action_immutable() from public;
grant execute on function public.ledger_review_finding_action_immutable() to service_role;

create trigger ledger_review_finding_actions_immutable
before update or delete on public.ledger_review_finding_actions
for each row execute function public.ledger_review_finding_action_immutable();

create or replace function public.act_on_ledger_review_finding(
  p_actor_user_id uuid,
  p_journey_id uuid,
  p_finding_id uuid,
  p_action text,
  p_base_revision bigint,
  p_reason text,
  p_operation_id text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  f public.ledger_review_findings;
  m public.journey_members;
  a public.ledger_review_finding_actions;
  creator_id uuid;
begin
  select * into a from public.ledger_review_finding_actions
    where actor_user_id = p_actor_user_id and operation_id = p_operation_id;
  if found then
    if a.journey_id <> p_journey_id or a.finding_id <> p_finding_id or
       a.action <> p_action or a.finding_revision <> p_base_revision or
       a.reason <> trim(p_reason) then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    select * into f from public.ledger_review_findings where id = a.finding_id;
    return jsonb_build_object('finding', to_jsonb(f), 'action', to_jsonb(a), 'idempotentReplay', true);
  end if;

  select * into f from public.ledger_review_findings
    where id = p_finding_id and journey_id = p_journey_id for update;
  if not found then raise exception 'REVIEW_FINDING_NOT_FOUND' using errcode = 'P0002'; end if;
  if f.layer <> 'HEURISTIC' then raise exception 'DETERMINISTIC_REVIEW_ACTION_FORBIDDEN' using errcode = '23514'; end if;
  if f.revision <> p_base_revision then raise exception 'REVIEW_FINDING_STALE' using errcode = '40001'; end if;
  if f.status not in ('OPEN', 'ACKNOWLEDGED', 'DISMISSED') then raise exception 'REVIEW_FINDING_NOT_ACTIONABLE' using errcode = '23514'; end if;
  if p_action not in ('ACKNOWLEDGED', 'DISMISSED') or char_length(trim(p_reason)) not between 1 and 2000 then
    raise exception 'INVALID_REVIEW_ACTION' using errcode = '23514';
  end if;

  select * into m from public.journey_members
    where trip_id = p_journey_id and user_id = p_actor_user_id and status = 'linked';
  if not found then raise exception 'REVIEW_ACTION_FORBIDDEN' using errcode = '42501'; end if;
  if f.expense_id is not null then
    select creator_member_id into creator_id from public.expenses where id = f.expense_id;
  end if;
  if m.role <> 'owner' and (f.settlement_id is not null or creator_id is distinct from m.id) then
    raise exception 'REVIEW_ACTION_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.ledger_review_finding_actions (
    finding_id, journey_id, action, actor_user_id, actor_member_id, actor_role,
    reason, finding_revision, entity_revision, ruleset_version, operation_id
  ) values (
    f.id, f.journey_id, p_action, p_actor_user_id, m.id, m.role,
    trim(p_reason), f.revision, f.entity_revision, f.ruleset_version, p_operation_id
  ) returning * into a;

  update public.ledger_review_findings set status = p_action where id = f.id returning * into f;
  return jsonb_build_object('finding', to_jsonb(f), 'action', to_jsonb(a), 'idempotentReplay', false);
end;
$$;

revoke all on function public.act_on_ledger_review_finding(uuid, uuid, uuid, text, bigint, text, text) from public;
grant execute on function public.act_on_ledger_review_finding(uuid, uuid, uuid, text, bigint, text, text) to service_role;

notify pgrst, 'reload schema';
