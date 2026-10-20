alter table public.expense_audit_events
  drop constraint if exists expense_audit_events_expense_id_expense_revision_event_type_key;

alter table public.expense_correction_requests
  add column requested_by_member_id uuid references public.journey_members(id) on delete restrict,
  add column resolved_by_member_id uuid references public.journey_members(id) on delete set null,
  add column resulting_expense_revision bigint check (resulting_expense_revision is null or resulting_expense_revision > 0),
  add column changed_groups text[] not null default '{}';

create table public.expense_conflict_resolutions (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  conflict_id uuid not null references public.ledger_idempotency_keys(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_member_id uuid references public.journey_members(id) on delete set null,
  resolution text not null check (resolution in ('KEEP_MINE', 'KEEP_JOURNEY', 'EDITED')),
  selected_sources jsonb not null,
  reason text not null check (char_length(reason) between 1 and 2000),
  resulting_expense_revision bigint not null check (resulting_expense_revision > 0),
  created_at timestamptz not null default now(),
  unique (conflict_id)
);

create trigger expense_conflict_resolutions_immutable_update
before update on public.expense_conflict_resolutions
for each row execute function public.ledger_reject_immutable_change();
create trigger expense_conflict_resolutions_immutable_delete
before delete on public.expense_conflict_resolutions
for each row execute function public.ledger_reject_immutable_change();

create or replace function public.ledger_stale_corrections_after_expense_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.expense_correction_requests
     set status = 'STALE',
         resolved_at = now()
   where expense_id = new.id
     and status = 'OPEN'
     and base_expense_revision < new.revision;
  return new;
end;
$$;

create trigger expenses_stale_corrections
after update of revision on public.expenses
for each row when (new.revision > old.revision)
execute function public.ledger_stale_corrections_after_expense_update();

create or replace function public.ledger_record_conflict_4c(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  command_type_value text,
  idempotency_key_value text,
  payload_hash_value text,
  conflict_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  conflict_key uuid := gen_random_uuid();
  actor_member uuid;
  actor_role text;
  creator_member uuid;
begin
  select * into existing
    from public.ledger_idempotency_keys
   where actor_user_id = actor_user
     and journey_id = target_journey
     and command_type = command_type_value
     and idempotency_key = idempotency_key_value
   for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.response_body;
  end if;

  select e.creator_member_id, jm.id, jm.role
    into creator_member, actor_member, actor_role
    from public.expenses e
    left join public.journey_members jm
      on jm.trip_id = e.journey_id and jm.user_id = actor_user and jm.status = 'linked'
   where e.id = target_expense and e.journey_id = target_journey
   order by jm.role = 'owner' desc nulls last
   limit 1;
  if creator_member is null then raise exception 'ENTITY_NOT_FOUND'; end if;
  if actor_member is null or (actor_member <> creator_member and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;

  conflict_body_value := jsonb_set(
    conflict_body_value, '{error,conflictId}', to_jsonb(conflict_key::text)
  );
  insert into public.ledger_idempotency_keys (
    id, actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
    response_status, response_body, completed_at
  ) values (
    conflict_key, actor_user, target_journey, command_type_value,
    idempotency_key_value, payload_hash_value, 409, conflict_body_value, now()
  );
  return conflict_body_value;
end;
$$;

create or replace function public.ledger_resolve_expense_conflict_4c(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  conflict_id_value uuid,
  current_revision_value bigint,
  resolution_value text,
  selected_sources_value jsonb,
  reason_value text,
  idempotency_key_value text,
  payload_hash_value text,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  conflict_record public.ledger_idempotency_keys%rowtype;
  current_expense public.expenses%rowtype;
  actor_member uuid;
  actor_role text;
  applied jsonb;
  command_name text := 'RESOLVE_EXPENSE_CONFLICT';
  resolution_audit_id uuid;
begin
  select * into existing from public.ledger_idempotency_keys
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value
   for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into conflict_record from public.ledger_idempotency_keys
   where id = conflict_id_value and journey_id = target_journey
     and response_status = 409 and response_body #>> '{error,expenseId}' = target_expense::text;
  if not found then raise exception 'CONFLICT_NOT_FOUND'; end if;
  if exists (select 1 from public.expense_conflict_resolutions where conflict_id = conflict_id_value) then
    raise exception 'CONFLICT_ALREADY_RESOLVED';
  end if;

  select * into current_expense from public.expenses
   where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;

  select id, role into actor_member, actor_role from public.journey_members
   where trip_id = target_journey and user_id = actor_user and status = 'linked'
   order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or
     (actor_member <> current_expense.creator_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if coalesce(nullif(trim(reason_value), ''), '') = '' then raise exception 'RESOLUTION_REASON_REQUIRED'; end if;
  if current_expense.revision <> current_revision_value then raise exception 'REVISION_CONFLICT'; end if;

  if resolution_value = 'KEEP_JOURNEY' then
    resolution_audit_id := coalesce(
      (response_body_value #>> '{entity,auditEvents,-1,id}')::uuid,
      gen_random_uuid()
    );
    insert into public.ledger_idempotency_keys (
      actor_user_id, journey_id, command_type, idempotency_key, payload_hash
    ) values (actor_user, target_journey, command_name, idempotency_key_value, payload_hash_value);

    insert into public.expense_audit_events (
      id, expense_id, journey_id, expense_revision, event_type, actor_user_id,
      actor_member_id, reason, changed_groups, after_hash, metadata
    ) values (
      resolution_audit_id,
      target_expense, target_journey, current_expense.revision,
      'CONFLICT_RESOLVED', actor_user, actor_member, reason_value, '{}',
      payload_hash_value,
      jsonb_build_object('conflictId', conflict_id_value, 'resolution', resolution_value,
        'selectedSources', selected_sources_value, 'expenseRevisionChanged', false)
    );
    applied := jsonb_set(jsonb_set(
      response_body_value, '{entity,auditEvents,-1,id}', to_jsonb(resolution_audit_id)
    ),
      '{entity,auditEvents,-1,actorMemberId}',
      to_jsonb(actor_member)
    );
  elsif resolution_value in ('KEEP_MINE', 'EDITED') then
    applied := public.ledger_mutate_expense_4b(
      actor_user, target_journey, target_expense, 'UPDATE_EXPENSE',
      current_revision_value, reason_value, payload_hash_value,
      'resolve-' || md5(idempotency_key_value), response_body_value
    );
    insert into public.ledger_idempotency_keys (
      actor_user_id, journey_id, command_type, idempotency_key, payload_hash,
      response_status, response_body, completed_at
    ) values (
      actor_user, target_journey, command_name, idempotency_key_value,
      payload_hash_value, 200, applied, now()
    );
  else
    raise exception 'INVALID_RESOLUTION';
  end if;

  insert into public.expense_conflict_resolutions (
    journey_id, expense_id, conflict_id, actor_user_id, actor_member_id,
    resolution, selected_sources, reason, resulting_expense_revision
  ) values (
    target_journey, target_expense, conflict_id_value, actor_user, actor_member,
    resolution_value, selected_sources_value, reason_value,
    (applied ->> 'revision')::bigint
  );

  if resolution_value = 'KEEP_JOURNEY' then
    update public.ledger_idempotency_keys
       set response_status = 200, response_body = applied, completed_at = now()
     where actor_user_id = actor_user and journey_id = target_journey
       and command_type = command_name and idempotency_key = idempotency_key_value;
  end if;
  return applied;
end;
$$;

create or replace function public.ledger_propose_correction_4c(
  actor_user uuid,
  target_journey uuid,
  target_expense uuid,
  correction_id_value uuid,
  base_revision_value bigint,
  proposed_aggregate_value jsonb,
  reason_value text,
  changed_groups_value text[],
  idempotency_key_value text,
  payload_hash_value text,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  current_expense public.expenses%rowtype;
  actor_member uuid;
  request_status text;
  command_name text := 'PROPOSE_EXPENSE_CORRECTION';
begin
  select * into existing from public.ledger_idempotency_keys
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into current_expense from public.expenses
   where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if current_expense.business_status = 'DELETED' then raise exception 'ENTITY_NOT_FOUND'; end if;
  if exists (
    select 1 from public.settlement_inputs si join public.settlements s on s.id = si.settlement_id
     where si.expense_id = target_expense and s.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
  ) then raise exception 'FINALIZED_SETTLEMENT_PROTECTED'; end if;

  select id into actor_member from public.journey_members
   where trip_id = target_journey and user_id = actor_user and status = 'linked'
     and role in ('owner', 'group_member')
   order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or actor_member = current_expense.creator_member_id then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  request_status := case when current_expense.revision = base_revision_value then 'OPEN' else 'STALE' end;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, command_name, idempotency_key_value, payload_hash_value);
  insert into public.expense_correction_requests (
    id, expense_id, journey_id, base_expense_revision, proposed_aggregate,
    reason, status, requested_by, requested_by_member_id, changed_groups,
    resolved_at
  ) values (
    correction_id_value, target_expense, target_journey, base_revision_value,
    proposed_aggregate_value, reason_value, request_status, actor_user,
    actor_member, changed_groups_value,
    case when request_status = 'STALE' then now() else null end
  );
  response_body_value := jsonb_set(response_body_value, '{correction,status}', to_jsonb(request_status));
  response_body_value := jsonb_set(response_body_value, '{correction,requestedByMemberId}', to_jsonb(actor_member));
  update public.ledger_idempotency_keys set response_status = 201,
    response_body = response_body_value, completed_at = now()
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;

create or replace function public.ledger_transition_correction_4c(
  actor_user uuid,
  target_journey uuid,
  correction_id_value uuid,
  action_value text,
  base_request_revision_value bigint,
  resolution_reason_value text,
  idempotency_key_value text,
  payload_hash_value text,
  response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  correction public.expense_correction_requests%rowtype;
  expense public.expenses%rowtype;
  actor_member uuid;
  actor_role text;
  command_name text := action_value || '_EXPENSE_CORRECTION';
begin
  select * into existing from public.ledger_idempotency_keys
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;
  if action_value not in ('REJECT', 'WITHDRAW') then raise exception 'INVALID_COMMAND'; end if;

  select * into correction from public.expense_correction_requests
   where id = correction_id_value and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if correction.status <> 'OPEN' or correction.revision <> base_request_revision_value then
    raise exception 'CORRECTION_NOT_OPEN';
  end if;
  select * into expense from public.expenses where id = correction.expense_id;
  select id, role into actor_member, actor_role from public.journey_members
   where trip_id = target_journey and user_id = actor_user and status = 'linked'
   order by role = 'owner' desc, created_at asc limit 1;
  if action_value = 'WITHDRAW' then
    if correction.requested_by <> actor_user then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;
  elsif actor_member is null or
        (actor_member <> expense.creator_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, command_name, idempotency_key_value, payload_hash_value);
  update public.expense_correction_requests set
    status = case when action_value = 'REJECT' then 'REJECTED' else 'WITHDRAWN' end,
    resolved_by = actor_user,
    resolved_by_member_id = actor_member,
    resolution_reason = resolution_reason_value,
    resolved_at = now()
  where id = correction_id_value;
  response_body_value := jsonb_set(response_body_value, '{correction,status}',
    to_jsonb(case when action_value = 'REJECT' then 'REJECTED' else 'WITHDRAWN' end));
  response_body_value := jsonb_set(response_body_value, '{correction,resolvedByUserId}', to_jsonb(actor_user));
  response_body_value := jsonb_set(response_body_value, '{correction,resolvedByMemberId}', coalesce(to_jsonb(actor_member), 'null'::jsonb));
  response_body_value := jsonb_set(response_body_value, '{correction,revision}', to_jsonb(base_request_revision_value + 1));
  update public.ledger_idempotency_keys set response_status = 200,
    response_body = response_body_value, completed_at = now()
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value;
  return response_body_value;
end;
$$;

create or replace function public.ledger_accept_correction_4c(
  actor_user uuid,
  target_journey uuid,
  correction_id_value uuid,
  base_request_revision_value bigint,
  resolution_reason_value text,
  idempotency_key_value text,
  payload_hash_value text,
  correction_response_body_value jsonb,
  expense_response_body_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.ledger_idempotency_keys%rowtype;
  correction public.expense_correction_requests%rowtype;
  expense public.expenses%rowtype;
  actor_member uuid;
  actor_role text;
  applied jsonb;
  command_name text := 'ACCEPT_EXPENSE_CORRECTION';
begin
  select * into existing from public.ledger_idempotency_keys
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value for update;
  if found then
    if existing.payload_hash <> payload_hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;
  select * into correction from public.expense_correction_requests
   where id = correction_id_value and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if correction.status <> 'OPEN' or correction.revision <> base_request_revision_value then
    raise exception 'CORRECTION_NOT_OPEN';
  end if;
  select * into expense from public.expenses where id = correction.expense_id for update;
  select id, role into actor_member, actor_role from public.journey_members
   where trip_id = target_journey and user_id = actor_user and status = 'linked'
   order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or
     (actor_member <> expense.creator_member_id and actor_role <> 'owner') then
    raise exception 'TRIP_WRITE_FORBIDDEN';
  end if;
  if actor_member <> expense.creator_member_id and actor_role = 'owner' and
     coalesce(nullif(trim(resolution_reason_value), ''), '') = '' then
    raise exception 'ORGANIZER_REASON_REQUIRED';
  end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (actor_user, target_journey, command_name, idempotency_key_value, payload_hash_value);
  if expense.revision <> correction.base_expense_revision then
    update public.expense_correction_requests set status = 'STALE',
      resolved_by = actor_user, resolved_by_member_id = actor_member,
      resolution_reason = resolution_reason_value, resolved_at = now()
     where id = correction_id_value;
    correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,status}', '"STALE"');
    correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,revision}', to_jsonb(base_request_revision_value + 1));
    update public.ledger_idempotency_keys set response_status = 409,
      response_body = correction_response_body_value, completed_at = now()
     where actor_user_id = actor_user and journey_id = target_journey
       and command_type = command_name and idempotency_key = idempotency_key_value;
    return correction_response_body_value;
  end if;

  update public.expense_correction_requests set status = 'ACCEPTED',
    resolved_by = actor_user, resolved_by_member_id = actor_member,
    resolution_reason = resolution_reason_value,
    resulting_expense_revision = expense.revision + 1, resolved_at = now()
   where id = correction_id_value;
  applied := public.ledger_mutate_expense_4b(
    actor_user, target_journey, correction.expense_id, 'UPDATE_EXPENSE',
    expense.revision, resolution_reason_value, payload_hash_value,
    'accept-' || md5(idempotency_key_value), expense_response_body_value
  );
  correction_response_body_value := jsonb_set(correction_response_body_value, '{expense}', applied -> 'entity');
  correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,status}', '"ACCEPTED"');
  correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,resolvedByUserId}', to_jsonb(actor_user));
  correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,resolvedByMemberId}', to_jsonb(actor_member));
  correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,resultingExpenseRevision}', to_jsonb(expense.revision + 1));
  correction_response_body_value := jsonb_set(correction_response_body_value, '{correction,revision}', to_jsonb(base_request_revision_value + 1));
  update public.ledger_idempotency_keys set response_status = 200,
    response_body = correction_response_body_value, completed_at = now()
   where actor_user_id = actor_user and journey_id = target_journey
     and command_type = command_name and idempotency_key = idempotency_key_value;
  return correction_response_body_value;
end;
$$;

alter table public.expense_conflict_resolutions enable row level security;
alter table public.expense_conflict_resolutions force row level security;
revoke all on table public.expense_conflict_resolutions from public, anon, authenticated;
grant select, insert on table public.expense_conflict_resolutions to service_role;

revoke all on function public.ledger_record_conflict_4c(uuid, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ledger_resolve_expense_conflict_4c(uuid, uuid, uuid, uuid, bigint, text, jsonb, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ledger_propose_correction_4c(uuid, uuid, uuid, uuid, bigint, jsonb, text, text[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ledger_transition_correction_4c(uuid, uuid, uuid, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ledger_accept_correction_4c(uuid, uuid, uuid, bigint, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ledger_record_conflict_4c(uuid, uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.ledger_resolve_expense_conflict_4c(uuid, uuid, uuid, uuid, bigint, text, jsonb, text, text, text, jsonb) to service_role;
grant execute on function public.ledger_propose_correction_4c(uuid, uuid, uuid, uuid, bigint, jsonb, text, text[], text, text, jsonb) to service_role;
grant execute on function public.ledger_transition_correction_4c(uuid, uuid, uuid, text, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.ledger_accept_correction_4c(uuid, uuid, uuid, bigint, text, text, text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
