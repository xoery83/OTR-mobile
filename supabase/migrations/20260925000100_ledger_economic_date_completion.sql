-- A later current revision may acquire missing date evidence and its own automatic
-- reference valuation. Frozen Settlement inputs and their valuations stay immutable.
create or replace function public.ledger_guard_finalized_expense_mutation()
returns trigger language plpgsql set search_path = public as $$
declare frozen_revision bigint;
begin
  select max(input.expense_revision) into frozen_revision
  from public.settlement_inputs input
  join public.settlements settlement on settlement.id = input.settlement_id
  where input.expense_id = old.id
    and settlement.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED');
  if frozen_revision is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'FINALIZED_SETTLEMENT_PROTECTED'; end if;
  if old.revision <= frozen_revision then
    raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
  end if;

  if nullif(current_setting('otr.economic_date_completion_expense', true), '') = old.id::text
    and old.economic_date is null and new.economic_date is not null
    and (to_jsonb(new) - array['economic_date','revision','updated_at','updated_by_user_id'])
      = (to_jsonb(old) - array['economic_date','revision','updated_at','updated_by_user_id'])
  then return new; end if;

  if current_setting('otr.c_automatic_reference', true) = 'true'
    and old.economic_date is not null
    and old.business_status = 'RATE_REQUIRED' and new.business_status = 'ACCEPTED'
    and (to_jsonb(new) - array['business_status','revision','updated_at','updated_by_user_id'])
      = (to_jsonb(old) - array['business_status','revision','updated_at','updated_by_user_id'])
  then return new; end if;
  raise exception 'FINALIZED_SETTLEMENT_PROTECTED';
end;
$$;

-- This command never submits an aggregate replacement. It can only fill NULL.
create function public.ledger_complete_expense_economic_date_v1(
  actor_user uuid, target_journey uuid, target_expense uuid,
  expected_revision bigint, confirmed_date date, evidence_source text,
  idempotency_key_value text, payload_hash_value text, response_body_value jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prior public.expenses%rowtype;
  changed public.expenses%rowtype;
  existing public.ledger_idempotency_keys%rowtype;
  actor_member uuid;
  actor_role text;
  result jsonb;
begin
  select * into existing from public.ledger_idempotency_keys
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'COMPLETE_ECONOMIC_DATE_V1'
    and idempotency_key = idempotency_key_value for update;
  if found then
    if existing.payload_hash <> payload_hash_value then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_set(existing.response_body, '{idempotentReplay}', 'true'::jsonb);
  end if;

  select * into prior from public.expenses
  where id = target_expense and journey_id = target_journey for update;
  if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  if prior.revision <> expected_revision then raise exception 'REVISION_CONFLICT'; end if;
  if confirmed_date is null or confirmed_date > current_date
    or prior.economic_date is not null or prior.deleted_at is not null
    or prior.business_status <> 'RATE_REQUIRED'
    or not exists (select 1 from public.ledger_settings s
      where s.journey_id = target_journey
        and s.settlement_currency <> prior.original_currency)
    or exists (select 1 from public.settlement_valuation_snapshots v
      where v.expense_id = target_expense and v.is_active)
  then raise exception 'ECONOMIC_DATE_NOT_ELIGIBLE'; end if;
  if exists (select 1 from public.settlement_inputs si
    join public.settlements s on s.id = si.settlement_id
    where si.expense_id = target_expense
      and s.status in ('FINALIZED', 'PARTIALLY_PAID', 'SETTLED')
      and si.expense_revision >= prior.revision)
  then raise exception 'FINALIZED_SETTLEMENT_PROTECTED'; end if;
  if exists (select 1 from public.ledger_idempotency_keys k
    where k.journey_id = target_journey and k.response_status = 409
      and k.response_body #>> '{error,expenseId}' = target_expense::text
      and not exists (select 1 from public.expense_conflict_resolutions r
        where r.conflict_id = k.id))
  then raise exception 'REVISION_CONFLICT'; end if;

  select m.id, m.role into actor_member, actor_role
  from public.journey_members m
  where m.trip_id = target_journey and m.user_id = actor_user
    and m.status = 'linked'
  order by (m.role = 'owner') desc, m.created_at limit 1;
  if actor_member is null
    or (actor_role <> 'owner' and actor_member is distinct from prior.creator_member_id)
  then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;

  if evidence_source = 'STAGE9_DATE_ONLY_V1' then
    if prior.import_provenance ->> 'occurredPrecision' is distinct from 'DATE'
      or prior.import_provenance ->> 'mappingVersion' is distinct from 'legacy-ledger-to-ledger2-v1'
      or coalesce(prior.import_provenance ->> 'transformVersion', '') not in
        ('stage9-europe-replay-v2', 'stage9-europe-replay-v3')
      or prior.occurred_at <> (confirmed_date::text || 'T00:00:00.000Z')::timestamptz
      or exists (select 1 from public.expense_audit_events a
        where a.expense_id = target_expense and a.expense_revision > 1
          and 'FINANCIAL_CORE' = any(a.changed_groups))
    then raise exception 'ECONOMIC_DATE_EVIDENCE_REJECTED'; end if;
  elsif evidence_source <> 'USER_CONFIRMED_V1' then
    raise exception 'ECONOMIC_DATE_EVIDENCE_REJECTED';
  end if;

  insert into public.ledger_idempotency_keys (
    actor_user_id, journey_id, command_type, idempotency_key, payload_hash
  ) values (
    actor_user, target_journey, 'COMPLETE_ECONOMIC_DATE_V1',
    idempotency_key_value, payload_hash_value
  );
  perform set_config('otr.economic_date_completion_expense', target_expense::text, true);
  update public.expenses set economic_date = confirmed_date,
    updated_by_user_id = actor_user where id = target_expense returning * into changed;
  perform set_config('otr.economic_date_completion_expense', '', true);

  insert into public.expense_audit_events (
    id, expense_id, journey_id, expense_revision, event_type, actor_user_id,
    actor_member_id, reason, changed_groups, after_hash, metadata
  ) values (
    (response_body_value #>> '{entity,auditEvents,-1,id}')::uuid,
    target_expense, target_journey, changed.revision,
    'ECONOMIC_DATE_COMPLETED', actor_user, actor_member,
    'Completed missing transaction date evidence.', array['FINANCIAL_CORE'],
    payload_hash_value,
    jsonb_build_object('source', evidence_source, 'ruleVersion',
      'RESTORE_MISSING_ECONOMIC_DATE_V1', 'economicDate', confirmed_date,
      'baseRevision', expected_revision, 'evidenceDigest', payload_hash_value)
  );
  result := jsonb_set(response_body_value, '{entity,economicDate}', to_jsonb(confirmed_date));
  result := jsonb_set(result, '{entity,revision}', to_jsonb(changed.revision));
  result := jsonb_set(result, '{revision}', to_jsonb(changed.revision));
  result := jsonb_set(result, '{entity,updatedAt}', to_jsonb(changed.updated_at));
  result := jsonb_set(result, '{updatedAt}', to_jsonb(changed.updated_at));
  result := jsonb_set(result, '{entity,auditEvents,-1,actorMemberId}', to_jsonb(actor_member));
  update public.ledger_idempotency_keys set response_status = 200,
    response_body = result, completed_at = now()
  where actor_user_id = actor_user and journey_id = target_journey
    and command_type = 'COMPLETE_ECONOMIC_DATE_V1'
    and idempotency_key = idempotency_key_value;
  return result;
end;
$$;
revoke all on function public.ledger_complete_expense_economic_date_v1(
  uuid,uuid,uuid,bigint,date,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ledger_complete_expense_economic_date_v1(
  uuid,uuid,uuid,bigint,date,text,text,text,jsonb) to service_role;

-- Keep the original financial guard on a frozen or older current revision.
-- Only change the predicate shared by the established scanner and valuation RPCs.
do $$
declare name text; definition text; updated text;
begin
  foreach name in array array[
    'public.ledger_list_auto_reference_demands(integer)',
    'public.ledger_list_settlement_auto_reference_demands(uuid,integer)',
    'public.ledger_claim_settlement_rate_demands(uuid,integer)'
  ] loop
    definition := pg_get_functiondef(name::regprocedure);
    updated := replace(definition, 'where si.expense_id = e.id',
      'where si.expense_id = e.id and si.expense_revision >= e.revision');
    if updated = definition then raise exception 'Expected scanner guard missing: %', name; end if;
    execute updated;
  end loop;
  foreach name in array array[
    'public.ledger_apply_valuation_5_1(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)'
  ] loop
    definition := pg_get_functiondef(name::regprocedure);
    updated := replace(definition, 'where si.expense_id = target_expense',
      'where si.expense_id = target_expense and si.expense_revision >= expense_revision');
    if updated = definition then raise exception 'Expected valuation guard missing: %', name; end if;
    execute updated;
  end loop;
end $$;
notify pgrst, 'reload schema';
