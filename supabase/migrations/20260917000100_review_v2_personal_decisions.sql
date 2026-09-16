-- Review v2 decisions are private to one authenticated user; observations stay shared.
alter table public.ledger_review_finding_actions alter column reason drop not null;
alter table public.ledger_review_finding_actions
  drop constraint ledger_review_finding_actions_reason_check;
alter table public.ledger_review_finding_actions
  add constraint ledger_review_finding_actions_reason_check
  check (reason is null or char_length(reason) between 1 and 2000);

create table public.ledger_review_decisions (
  finding_id uuid not null references public.ledger_review_findings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('ACKNOWLEDGED', 'DISMISSED')),
  revision bigint not null check (revision > 0),
  last_action_id uuid not null references public.ledger_review_finding_actions(id),
  acted_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (finding_id, user_id)
);
create index ledger_review_decisions_user_idx on public.ledger_review_decisions(user_id, finding_id);
alter table public.ledger_review_decisions enable row level security;
alter table public.ledger_review_decisions force row level security;
revoke all on public.ledger_review_decisions from public, anon, authenticated;
grant select, insert, update on public.ledger_review_decisions to service_role;

create table public.ledger_review_finding_eligible_users (
  finding_id uuid not null references public.ledger_review_findings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (finding_id, user_id)
);
create index ledger_review_eligible_user_idx on public.ledger_review_finding_eligible_users(user_id, finding_id);
alter table public.ledger_review_finding_eligible_users enable row level security;
alter table public.ledger_review_finding_eligible_users force row level security;
revoke all on public.ledger_review_finding_eligible_users from public, anon, authenticated;
grant select, insert on public.ledger_review_finding_eligible_users to service_role;

-- Historical decisions are reconstructed only from the actor's append-only actions.
insert into public.ledger_review_decisions
  (finding_id, user_id, decision, revision, last_action_id, acted_at)
select finding_id, actor_user_id, action, revision, id, created_at
from (
  select a.*, row_number() over (
    partition by finding_id, actor_user_id order by created_at, id
  ) as revision,
  row_number() over (
    partition by finding_id, actor_user_id order by created_at desc, id desc
  ) as latest
  from public.ledger_review_finding_actions a
) ordered
where latest = 1;

-- Existing ACTIVE v2 observations acquire a conservative/current eligibility snapshot.
insert into public.ledger_review_finding_eligible_users(finding_id, user_id)
select distinct f.id, m.user_id
from public.ledger_review_findings f
join public.expenses e on e.id = f.expense_id
join public.journey_members m on m.trip_id = f.journey_id and m.status = 'linked'
  and m.user_id is not null
where f.rule_id is not null and f.lifecycle = 'ACTIVE'
  and (m.role = 'owner' or m.id = e.creator_member_id or m.id = e.payer_member_id
    or exists (select 1 from public.expense_splits s
      where s.expense_id = e.id and s.member_id = m.id
        and (s.original_amount_minor <> 0 or coalesce(s.settlement_amount_minor,0) <> 0)))
on conflict do nothing;
-- For pre-existing closed observations, actor history is the only trustworthy grant.
insert into public.ledger_review_finding_eligible_users(finding_id, user_id)
select distinct f.id, a.actor_user_id
from public.ledger_review_findings f
join public.ledger_review_finding_actions a on a.finding_id = f.id
where f.rule_id is not null and f.lifecycle <> 'ACTIVE'
on conflict do nothing;

create or replace function public.ledger_review_snapshot_eligible()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rule_id is not null and new.expense_id is not null then
    insert into public.ledger_review_finding_eligible_users(finding_id, user_id)
    select distinct new.id, m.user_id
    from public.expenses e
    join public.journey_members m on m.trip_id = new.journey_id
      and m.status = 'linked' and m.user_id is not null
    where e.id = new.expense_id
      and (m.role = 'owner' or m.id = e.creator_member_id or m.id = e.payer_member_id
        or exists (select 1 from public.expense_splits s
          where s.expense_id = e.id and s.member_id = m.id
            and (s.original_amount_minor <> 0 or coalesce(s.settlement_amount_minor,0) <> 0)))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.ledger_review_snapshot_eligible() from public, anon, authenticated;
grant execute on function public.ledger_review_snapshot_eligible() to service_role;
create trigger ledger_review_snapshot_eligible after insert on public.ledger_review_findings
for each row execute function public.ledger_review_snapshot_eligible();

create or replace function public.ledger_review_user_eligible(p_finding_id uuid, p_user_id uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.ledger_review_findings f
    join public.journey_members m on m.trip_id = f.journey_id
      and m.user_id = p_user_id and m.status = 'linked'
    left join public.expenses e on e.id = f.expense_id
    where f.id = p_finding_id and (
      m.role = 'owner'
      or (f.rule_id is not null and f.lifecycle = 'ACTIVE' and
        (m.id = e.creator_member_id or m.id = e.payer_member_id
          or exists (select 1 from public.expense_splits s
            where s.expense_id = e.id and s.member_id = m.id
              and (s.original_amount_minor <> 0 or coalesce(s.settlement_amount_minor,0) <> 0))))
      or (f.rule_id is not null and f.lifecycle <> 'ACTIVE' and exists (
        select 1 from public.ledger_review_finding_eligible_users h
        where h.finding_id = f.id and h.user_id = p_user_id))
      or (f.rule_id is null and exists (
        select 1 from public.ledger_review_finding_actions a
        where a.finding_id = f.id and a.actor_user_id = p_user_id))
    )
  );
$$;
revoke all on function public.ledger_review_user_eligible(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ledger_review_user_eligible(uuid, uuid) to service_role;

create or replace function public.read_ledger_review_projection_v2(
  p_user_id uuid, p_journey_id uuid
) returns jsonb language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.journey_members m where m.trip_id = p_journey_id
    and m.user_id = p_user_id and m.status = 'linked') then
    raise exception 'REVIEW_READ_FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'findings', coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object(
      'personal_decision',coalesce(d.decision,'NEEDS_REVIEW'),
      'decision_revision',coalesce(d.revision,0),
      'last_action_id',d.last_action_id,
      'decision_acted_at',d.acted_at) order by f.created_at, f.id)
      from public.ledger_review_findings f
      left join public.ledger_review_decisions d
        on d.finding_id = f.id and d.user_id = p_user_id
      where f.journey_id = p_journey_id
        and public.ledger_review_user_eligible(f.id,p_user_id)), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id)
      from public.ledger_review_finding_actions a
      where a.journey_id = p_journey_id and a.actor_user_id = p_user_id
        and public.ledger_review_user_eligible(a.finding_id,p_user_id)), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.read_ledger_review_projection_v2(uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_ledger_review_projection_v2(uuid,uuid) to service_role;

create or replace function public.act_on_ledger_review_finding_v2(
  p_actor_user_id uuid, p_journey_id uuid, p_finding_id uuid, p_action text,
  p_base_revision bigint, p_decision_revision bigint, p_reason text, p_operation_id text
) returns jsonb language plpgsql set search_path = public as $$
declare
  f public.ledger_review_findings;
  m public.journey_members;
  a public.ledger_review_finding_actions;
  d public.ledger_review_decisions;
  cleaned_reason text := nullif(trim(p_reason), '');
  current_revision bigint;
begin
  select * into a from public.ledger_review_finding_actions
    where actor_user_id = p_actor_user_id and operation_id = p_operation_id;
  if found then
    if a.journey_id <> p_journey_id or a.finding_id <> p_finding_id
      or a.action <> p_action or a.finding_revision <> p_base_revision
      or a.reason is distinct from cleaned_reason then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    select * into f from public.ledger_review_findings where id = a.finding_id;
    if f.rule_id is null then
      raise exception 'REVIEW_V2_REQUIRED' using errcode = '23514';
    end if;
    if not public.ledger_review_user_eligible(f.id,p_actor_user_id) then
      raise exception 'REVIEW_ACTION_FORBIDDEN' using errcode = '42501';
    end if;
    select * into d from public.ledger_review_decisions
      where finding_id = f.id and user_id = p_actor_user_id;
    return jsonb_build_object('finding',to_jsonb(f),'action',to_jsonb(a),
      'decision',to_jsonb(d),'idempotentReplay',true);
  end if;
  if p_action not in ('ACKNOWLEDGED','DISMISSED') or p_operation_id is null
    or char_length(p_operation_id) not between 1 and 200
    or (cleaned_reason is not null and char_length(cleaned_reason) > 2000) then
    raise exception 'INVALID_REVIEW_ACTION' using errcode = '23514';
  end if;
  select * into f from public.ledger_review_findings
    where id = p_finding_id and journey_id = p_journey_id for update;
  if not found then raise exception 'REVIEW_FINDING_NOT_FOUND' using errcode = 'P0002'; end if;
  if f.rule_id is null or f.layer <> 'HEURISTIC' then
    raise exception 'REVIEW_V2_REQUIRED' using errcode = '23514';
  end if;
  if f.lifecycle <> 'ACTIVE' then
    raise exception 'REVIEW_FINDING_NOT_ACTIONABLE' using errcode = '23514';
  end if;
  if f.revision <> p_base_revision then
    raise exception 'REVIEW_FINDING_STALE' using errcode = '40001';
  end if;
  select * into m from public.journey_members where trip_id = p_journey_id
    and user_id = p_actor_user_id and status = 'linked';
  if not found or not public.ledger_review_user_eligible(f.id,p_actor_user_id) then
    raise exception 'REVIEW_ACTION_FORBIDDEN' using errcode = '42501';
  end if;
  -- The Finding row serializes actions; a decision revision is personal, never shared.
  select coalesce(revision,0) into current_revision from public.ledger_review_decisions
    where finding_id = f.id and user_id = p_actor_user_id;
  if coalesce(current_revision,0) <> p_decision_revision then
    raise exception 'REVIEW_DECISION_STALE' using errcode = '40001';
  end if;
  insert into public.ledger_review_finding_actions (
    finding_id, journey_id, action, actor_user_id, actor_member_id, actor_role,
    reason, finding_revision, entity_revision, ruleset_version, operation_id
  ) values (
    f.id, f.journey_id, p_action, p_actor_user_id, m.id, m.role,
    cleaned_reason, f.revision, f.entity_revision, f.ruleset_version, p_operation_id
  ) returning * into a;
  insert into public.ledger_review_decisions
    (finding_id,user_id,decision,revision,last_action_id,acted_at)
  values (f.id,p_actor_user_id,p_action,p_decision_revision+1,a.id,a.created_at)
  on conflict (finding_id,user_id) do update set
    decision = excluded.decision, revision = excluded.revision,
    last_action_id = excluded.last_action_id, acted_at = excluded.acted_at,
    updated_at = now()
  returning * into d;
  return jsonb_build_object('finding',to_jsonb(f),'action',to_jsonb(a),
    'decision',to_jsonb(d),'idempotentReplay',false);
end;
$$;
revoke all on function public.act_on_ledger_review_finding_v2(uuid,uuid,uuid,text,bigint,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.act_on_ledger_review_finding_v2(uuid,uuid,uuid,text,bigint,bigint,text,text)
  to service_role;

-- Old RPC may not alter v2 global state after this migration.
create or replace function public.ledger_review_v2_status_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.rule_id is not null and new.status in ('ACKNOWLEDGED','DISMISSED') then
    raise exception 'REVIEW_V2_PERSONAL_DECISION_REQUIRED' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.ledger_review_v2_status_guard() from public, anon, authenticated;
grant execute on function public.ledger_review_v2_status_guard() to service_role;
create trigger ledger_review_v2_status_guard before update of status on public.ledger_review_findings
for each row execute function public.ledger_review_v2_status_guard();
update public.ledger_review_findings set status = case when lifecycle = 'ACTIVE' then 'OPEN' else 'STALE' end
where rule_id is not null and status is distinct from case when lifecycle = 'ACTIVE' then 'OPEN' else 'STALE' end;

notify pgrst, 'reload schema';
