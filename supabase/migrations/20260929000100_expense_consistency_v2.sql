-- Additive typed commands. Legacy aggregate mutation remains strict CAS.
create table public.expense_revision_evidence (
  receipt_id uuid primary key references public.ledger_idempotency_keys(id) on delete restrict,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  revision bigint not null check (revision > 0),
  canonical jsonb not null,
  canonical_digest text not null,
  observed_base jsonb,
  observed_base_digest text,
  created_at timestamptz not null default now()
);
create index expense_revision_evidence_lookup on public.expense_revision_evidence(expense_id, revision);
create table public.expense_conflict_outcomes_v2 (
  conflict_id uuid primary key references public.ledger_idempotency_keys(id) on delete restrict,
  resolution_key_id uuid not null references public.ledger_idempotency_keys(id) on delete restrict,
  lifecycle text not null check (lifecycle in ('RESOLVED', 'SUPERSEDED')),
  reason text not null,
  superseded_by_command_id text,
  resulting_revision bigint not null,
  operation_receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.expense_revision_evidence enable row level security;
alter table public.expense_conflict_outcomes_v2 enable row level security;
revoke all on public.expense_revision_evidence, public.expense_conflict_outcomes_v2 from public, anon, authenticated;
revoke all on public.expense_revision_evidence, public.expense_conflict_outcomes_v2 from service_role;
grant select, insert on public.expense_revision_evidence, public.expense_conflict_outcomes_v2 to service_role;
create trigger expense_revision_evidence_immutable before update or delete on public.expense_revision_evidence
for each row execute function public.ledger_reject_immutable_change();
create trigger expense_conflict_outcomes_v2_immutable before update or delete on public.expense_conflict_outcomes_v2
for each row execute function public.ledger_reject_immutable_change();

create function public.ledger_expense_evidence_projection_v2(canonical_value jsonb) returns jsonb
language sql immutable set search_path=public as $$
  select (canonical_value - array['auditEvents','createdAt','updatedAt']) || jsonb_build_object(
    'economicDate',canonical_value -> 'economicDate',
    'occurredAt',to_char((canonical_value ->> 'occurredAt')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
$$;
create function public.ledger_expense_audit_evidence_v2() returns trigger
language plpgsql set search_path=public as $$
declare evidence jsonb := nullif(current_setting('otr.expense_command_v2',true),'')::jsonb;
begin
  if evidence is not null and evidence ->> 'expenseId'=new.expense_id::text then
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || evidence;
  end if;
  return new;
end;
$$;
create trigger expense_audit_evidence_v2 before insert on public.expense_audit_events
for each row execute function public.ledger_expense_audit_evidence_v2();

-- Only SQL-success receipts are historical evidence. No inference from 409 submissions.
create function public.ledger_capture_expense_evidence_v2() returns trigger
language plpgsql security definer set search_path = public as $$
declare canonical_value jsonb := coalesce(new.response_body -> 'entity', new.response_body -> 'canonical');
begin
  if new.response_status in (200, 201) and new.completed_at is not null
    and canonical_value ? 'businessStatus' and canonical_value ? 'participants'
    and exists (select 1 from public.expenses e where e.id = (canonical_value ->> 'id')::uuid
      and e.journey_id = new.journey_id and e.revision = (canonical_value ->> 'revision')::bigint)
  then
    insert into public.expense_revision_evidence(receipt_id, expense_id, revision, canonical, canonical_digest, observed_base, observed_base_digest)
    values (new.id, (canonical_value ->> 'id')::uuid, (canonical_value ->> 'revision')::bigint,
      canonical_value, encode(extensions.digest(public.ledger_expense_evidence_projection_v2(canonical_value)::text, 'sha256'), 'hex'),
      nullif(current_setting('otr.expense_base_v2',true),'')::jsonb,
      case when nullif(current_setting('otr.expense_base_v2',true),'') is not null then encode(extensions.digest(public.ledger_expense_evidence_projection_v2(current_setting('otr.expense_base_v2',true)::jsonb)::text,'sha256'),'hex') end)
    on conflict (receipt_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger ledger_idempotency_expense_evidence_v2 after insert or update on public.ledger_idempotency_keys
for each row execute function public.ledger_capture_expense_evidence_v2();
-- Existing immutable success responses are valid evidence of that historical revision.
insert into public.expense_revision_evidence(receipt_id, expense_id, revision, canonical, canonical_digest)
select k.id, e.id, (k.response_body #>> '{entity,revision}')::bigint, k.response_body -> 'entity',
  encode(extensions.digest(public.ledger_expense_evidence_projection_v2(k.response_body -> 'entity')::text, 'sha256'), 'hex')
from public.ledger_idempotency_keys k join public.expenses e on e.id::text = k.response_body #>> '{entity,id}'
where k.response_status in (200, 201) and k.completed_at is not null
  and k.response_body -> 'entity' ? 'participants' and k.response_body -> 'entity' ? 'businessStatus';

create function public.ledger_expense_chain_v2(target_journey uuid, target_expense uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('records', records, 'chainDigest', encode(extensions.digest(records::text, 'sha256'), 'hex'))
  from (select coalesce(jsonb_agg(jsonb_build_object(
    'conflictId', k.id, 'actorUserId', k.actor_user_id, 'commandType', k.command_type,
    'idempotencyKey', k.idempotency_key, 'payloadHash', k.payload_hash, 'body', k.response_body,
    'lifecycle', coalesce(o.lifecycle, case when r.id is null then 'OPEN' else 'RESOLVED' end),
    'reason', coalesce(o.reason, r.reason), 'supersededByCommandId', o.superseded_by_command_id, 'operationReceipt', o.operation_receipt
  ) order by k.id), '[]'::jsonb) records
  from public.ledger_idempotency_keys k
  left join public.expense_conflict_outcomes_v2 o on o.conflict_id = k.id
  left join public.expense_conflict_resolutions r on r.conflict_id = k.id
  where k.journey_id = target_journey and k.response_status = 409
    and k.response_body #>> '{error,expenseId}' = target_expense::text) chain;
$$;

create function public.ledger_replay_expense_v2(
  actor_user uuid,target_journey uuid,target_expense uuid,envelope_value jsonb,reason_value text,resolution_value jsonb default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare existing public.ledger_idempotency_keys%rowtype; hash_value text;
begin
  select * into existing from public.ledger_idempotency_keys where actor_user_id=actor_user and journey_id=target_journey
    and command_type=case when resolution_value is null then 'EXPENSE_COMMAND_V2' else 'RESOLVE_EXPENSE_CHAIN_V2' end
    and idempotency_key=envelope_value ->> 'idempotencyKey';
  if not found then return null; end if;
  hash_value := encode(extensions.digest(jsonb_build_object('expenseId',target_expense,
    'envelope',envelope_value,'reason',reason_value,'resolution',resolution_value)::text,'sha256'),'hex');
  if existing.payload_hash <> hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return existing.response_body;
end;
$$;

create function public.ledger_expense_causal_base_v2(actor_user uuid,target_journey uuid,target_expense uuid,envelope_value jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare canonical_value jsonb; receipt jsonb := envelope_value -> 'causalBaseReceipt';
begin
  if envelope_value ->> 'predecessorOperationId' is null and coalesce(receipt,'null'::jsonb)='null'::jsonb then
    if envelope_value ->> 'boundExecutionRevision' is not null and
      (envelope_value ->> 'boundExecutionRevision')::bigint <> (envelope_value ->> 'observedServerRevision')::bigint
    then raise exception 'INVALID_CAUSAL_RECEIPT'; end if;
    return null;
  end if;
  if receipt ->> 'operationId' is distinct from envelope_value ->> 'predecessorOperationId'
    or receipt ->> 'disposition' is distinct from 'APPLIED'
    or receipt ->> 'expenseId' is distinct from target_expense::text
    or (receipt ->> 'intentSequence')::bigint >= (envelope_value ->> 'intentSequence')::bigint
    or (receipt ->> 'canonicalRevision')::bigint is distinct from (envelope_value ->> 'boundExecutionRevision')::bigint
  then raise exception 'INVALID_CAUSAL_RECEIPT'; end if;
  select h.canonical into canonical_value from public.ledger_idempotency_keys k
    join public.expense_revision_evidence h on h.receipt_id=k.id
    where k.actor_user_id=actor_user and k.journey_id=target_journey and h.expense_id=target_expense
      and k.response_status=200 and coalesce(k.response_body -> 'receipt',k.response_body -> 'resolutionReceipt')=receipt;
  if canonical_value is null then
    select h.canonical into canonical_value from public.expense_conflict_outcomes_v2 o
      join public.ledger_idempotency_keys k on k.id=o.resolution_key_id
      join public.ledger_idempotency_keys original_key on original_key.id=o.conflict_id
      join public.expense_revision_evidence h on h.receipt_id=k.id
      where original_key.actor_user_id=actor_user and original_key.journey_id=target_journey
        and k.journey_id=target_journey and h.expense_id=target_expense
        and k.response_status=200 and o.operation_receipt=receipt;
  end if;
  if canonical_value is null then
    -- Existing successful CRUD/valuation receipts prove an actual APPLIED legacy
    -- effect. Never promote an old resolution/KEEP_JOURNEY receipt to APPLIED.
    select h.canonical into canonical_value from public.ledger_idempotency_keys k
      join public.expense_revision_evidence h on h.receipt_id=k.id
      where k.actor_user_id=actor_user and k.journey_id=target_journey and h.expense_id=target_expense
        and k.response_status in (200,201) and k.idempotency_key=receipt ->> 'idempotencyKey'
        and h.revision=(receipt ->> 'canonicalRevision')::bigint
        and receipt ->> 'operationId'=receipt ->> 'commandId'
        and k.command_type=case receipt ->> 'commandType' when 'CREATE' then 'CREATE_EXPENSE'
          when 'UPDATE' then 'UPDATE_EXPENSE' when 'DELETE' then 'DELETE_EXPENSE'
          when 'RESTORE' then 'RESTORE_EXPENSE' when 'APPLY_VALUATION' then 'APPLY_VALUATION' end;
  end if;
  if canonical_value is null then raise exception 'INVALID_CAUSAL_RECEIPT'; end if;
  return canonical_value;
end;
$$;

create function public.ledger_execute_expense_v2(
  actor_user uuid, target_journey uuid, target_expense uuid,
  envelope_value jsonb, reason_value text, prepared_revision bigint,
  historical_base_value jsonb, eligibility_value text,
  response_body_value jsonb, rate_snapshot_value jsonb default null,
  resolution_value jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_expense public.expenses%rowtype;
  existing public.ledger_idempotency_keys%rowtype;
  actor_member uuid; actor_role text;
  intent jsonb := coalesce(resolution_value -> 'submittedIntent', envelope_value -> 'patchOrIntent');
  intent_type text := intent ->> 'type';
  command_id text := coalesce(resolution_value ->> 'commandId', envelope_value ->> 'commandId');
  key_value text := envelope_value ->> 'idempotencyKey';
  command_name text := case when resolution_value is null then 'EXPENSE_COMMAND_V2' else 'RESOLVE_EXPENSE_CHAIN_V2' end;
  hash_value text;
  observed_revision bigint := coalesce((resolution_value ->> 'observedBaseRevision')::bigint,
    (envelope_value ->> 'observedServerRevision')::bigint);
  chain jsonb; record jsonb; covered uuid[]; outcomes jsonb := '[]'::jsonb; open_ids jsonb;
  resolution_key uuid := gen_random_uuid();
  inner_key text;
  applied jsonb; receipt jsonb; canonical_value jsonb;
  mutated boolean := true; disposition text := 'APPLIED';
  sequence_value bigint := (envelope_value ->> 'intentSequence')::bigint;
  audit_id uuid;
  causal_base jsonb; execution_revision bigint;
begin
  if key_value is null or command_id is null or intent_type not in ('CREATE','UPDATE','APPLY_VALUATION','DELETE','RESTORE')
    or sequence_value is null or sequence_value < 1 then raise exception 'INVALID_TYPED_COMMAND'; end if;
  -- Serialize identical keys as well as different commands on the same Expense.
  perform pg_advisory_xact_lock(hashtextextended(actor_user::text || target_journey::text || command_name || key_value, 0));
  hash_value := encode(extensions.digest(jsonb_build_object('expenseId',target_expense,
    'envelope', envelope_value, 'reason', reason_value, 'resolution', resolution_value)::text, 'sha256'), 'hex');
  select * into existing from public.ledger_idempotency_keys where actor_user_id = actor_user
    and journey_id = target_journey and command_type = command_name and idempotency_key = key_value;
  if found then
    if existing.payload_hash <> hash_value then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.response_body;
  end if;
  if intent_type='CREATE' and (observed_revision <> 0 or resolution_value is not null) then raise exception 'INVALID_TYPED_COMMAND'; end if;
  if intent_type <> 'CREATE' then
    select * into current_expense from public.expenses where id = target_expense and journey_id = target_journey for update;
    if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
  end if;
  select id, role into actor_member, actor_role from public.journey_members
    where trip_id = target_journey and user_id = actor_user and status = 'linked'
    order by role = 'owner' desc, created_at asc limit 1;
  if actor_member is null or actor_role not in ('owner','group_member')
    or (intent_type <> 'CREATE' and actor_member <> current_expense.creator_member_id and actor_role <> 'owner')
  then raise exception 'TRIP_WRITE_FORBIDDEN'; end if;
  if intent_type <> 'CREATE' and actor_member <> current_expense.creator_member_id
    and nullif(trim(reason_value), '') is null then raise exception 'ORGANIZER_REASON_REQUIRED'; end if;
  if exists (select 1 from public.settlement_inputs i join public.settlements s on s.id = i.settlement_id
    where i.expense_id = target_expense and s.status in ('FINALIZED','PARTIALLY_PAID','SETTLED'))
  then raise exception 'FINALIZED_SETTLEMENT_PROTECTED'; end if;
  if intent_type <> 'CREATE' and current_expense.revision <> prepared_revision then raise exception 'REVISION_CONFLICT'; end if;
  if resolution_value is null then
    causal_base := public.ledger_expense_causal_base_v2(actor_user,target_journey,target_expense,envelope_value);
  end if;
  execution_revision := coalesce((causal_base ->> 'revision')::bigint,observed_revision);
  if historical_base_value is not null and not exists (
    select 1 from public.expense_revision_evidence h where h.expense_id = target_expense
      and h.revision = observed_revision and h.canonical = historical_base_value
      and h.canonical_digest = encode(extensions.digest(public.ledger_expense_evidence_projection_v2(historical_base_value)::text, 'sha256'), 'hex'))
  then raise exception 'UNVERIFIED_OBSERVED_BASE'; end if;
  if intent_type <> 'CREATE' and execution_revision <> prepared_revision and resolution_value is null
    and (historical_base_value is null or eligibility_value not in ('DESCRIPTIVE_REBASE','EQUIVALENT'))
  then eligibility_value := 'CONFLICT'; end if;
  if resolution_value is not null then
    if nullif(trim(reason_value), '') is null then raise exception 'RESOLUTION_REASON_REQUIRED'; end if;
    if (resolution_value ->> 'currentServerRevision')::bigint <> current_expense.revision then raise exception 'REVISION_CONFLICT'; end if;
    chain := public.ledger_expense_chain_v2(target_journey, target_expense);
    if chain ->> 'chainDigest' <> resolution_value ->> 'expectedChainDigest' then raise exception 'CONFLICT_CHAIN_DRIFT'; end if;
    select array_agg(value::uuid) into covered from jsonb_array_elements_text(resolution_value -> 'coveredConflictIds');
    if coalesce(cardinality(covered),0) = 0 or cardinality(covered) <> (select count(distinct x) from unnest(covered) x)
    then raise exception 'INVALID_COVERED_CONFLICTS'; end if;
    if (select count(*) from jsonb_array_elements(chain -> 'records') r
      where (r ->> 'conflictId')::uuid = any(covered) and r ->> 'lifecycle' = 'OPEN'
        and (r ->> 'actorUserId' = actor_user::text or actor_role = 'owner')) <> cardinality(covered)
    then raise exception 'INVALID_COVERED_CONFLICTS'; end if;
    -- The primary command must match an actual covered original intent, not a forged lifecycle.
    if not exists (select 1 from jsonb_array_elements(chain -> 'records') r
      where (r ->> 'conflictId')::uuid = any(covered)
        and coalesce(r #>> '{body,error,commandId}', r ->> 'idempotencyKey') = command_id
        and coalesce(r #> '{body,error,submittedIntent}',
          case when r ->> 'commandType' = 'DELETE_EXPENSE' then '{"type":"DELETE"}'::jsonb
            when r ->> 'commandType'='UPDATE_EXPENSE' and resolution_value ->> 'choice'='KEEP_SERVER' then '{"type":"UPDATE","patch":{}}'::jsonb end) = intent
        and (r #>> '{body,error,baseRevision}')::bigint = observed_revision)
    then raise exception 'INVALID_RESOLUTION_INTENT'; end if;
    select coalesce((r #>> '{body,error,envelope,intentSequence}')::bigint,1) into sequence_value
      from jsonb_array_elements(chain -> 'records') r
      where (r ->> 'conflictId')::uuid = any(covered)
        and coalesce(r #>> '{body,error,commandId}',r ->> 'idempotencyKey')=command_id limit 1;
    if resolution_value ->> 'intentType' <> intent_type then raise exception 'INVALID_RESOLUTION_INTENT'; end if;
    if resolution_value ->> 'choice' = 'KEEP_SERVER' then mutated := false; disposition := 'KEPT_SERVER';
    elsif resolution_value ->> 'choice' = 'ACCEPT_EQUIVALENT' and intent_type = 'UPDATE'
      and historical_base_value is not null and eligibility_value = 'EQUIVALENT' then mutated := false;
    elsif not ((resolution_value ->> 'choice' = 'APPLY_PATCH' and intent_type = 'UPDATE')
      or (resolution_value ->> 'choice' = 'APPLY_VALUATION' and intent_type = 'APPLY_VALUATION')
      or (resolution_value ->> 'choice' = 'CONFIRM_DELETE' and intent_type = 'DELETE')
      or (resolution_value ->> 'choice' = 'CONFIRM_RESTORE' and intent_type = 'RESTORE'))
    then raise exception 'INVALID_RESOLUTION_CHOICE'; end if;
  elsif eligibility_value = 'CONFLICT' then
    applied := jsonb_build_object('error', jsonb_build_object('code','REVISION_CONFLICT',
      'conflictId',resolution_key, 'expenseId',target_expense, 'commandId',command_id,
      'commandType',intent_type, 'submittedIntent',intent, 'envelope',envelope_value,
      'baseRevision',observed_revision, 'currentRevision',current_expense.revision,
      'current',response_body_value -> 'entity', 'changedGroups',
        case when intent_type in ('DELETE','RESTORE') then '["LIFECYCLE"]'::jsonb
          when intent_type='APPLY_VALUATION' then '["FINANCIAL_CORE"]'::jsonb
          else to_jsonb(array_remove(array[case when intent -> 'patch' ? 'descriptive' then 'DESCRIPTIVE' end,
            case when intent -> 'patch' ? 'financial' or intent -> 'patch' ? 'participantSplit' then 'FINANCIAL_CORE' end],null)) end));
    insert into public.ledger_idempotency_keys(id,actor_user_id,journey_id,command_type,idempotency_key,payload_hash,response_status,response_body,completed_at)
    values(resolution_key,actor_user,target_journey,command_name,key_value,hash_value,409,applied,now());
    return applied;
  elsif eligibility_value = 'EQUIVALENT' then mutated := false;
  end if;
  if intent_type <> 'CREATE' and current_expense.business_status = 'DELETED' and intent_type not in ('RESTORE','DELETE') and mutated
  then raise exception 'EXPENSE_DELETED'; end if;
  if intent_type = 'RESTORE' and current_expense.business_status <> 'DELETED' and mutated then raise exception 'INVALID_RESTORE'; end if;
  perform set_config('otr.expense_base_v2',coalesce(coalesce(causal_base,historical_base_value)::text,''),true);
  perform set_config('otr.expense_command_v2',jsonb_build_object('expenseId',target_expense,
    'contractVersion',2,'ruleVersion','EXPENSE_THREE_WAY_V2','commandId',command_id,'typedIntent',intent,
    'base',public.ledger_expense_evidence_projection_v2(coalesce(causal_base,historical_base_value)),
    'current',public.ledger_expense_evidence_projection_v2(response_body_value -> '_verifiedCurrent'),
    'result',public.ledger_expense_evidence_projection_v2(response_body_value -> 'entity'),
    'baseDigest',case when coalesce(causal_base,historical_base_value) is not null then encode(extensions.digest(public.ledger_expense_evidence_projection_v2(coalesce(causal_base,historical_base_value))::text,'sha256'),'hex') end,
    'currentDigest',case when response_body_value -> '_verifiedCurrent' is not null then encode(extensions.digest(public.ledger_expense_evidence_projection_v2(response_body_value -> '_verifiedCurrent')::text,'sha256'),'hex') end,
    'resultDigest',encode(extensions.digest(public.ledger_expense_evidence_projection_v2(response_body_value -> 'entity')::text,'sha256'),'hex'),
    'preservedFields',case when intent_type='UPDATE' and not (intent -> 'patch' ? 'financial' or intent -> 'patch' ? 'participantSplit') then '["valuation","splits"]'::jsonb else '[]'::jsonb end)::text,true);
  response_body_value := response_body_value - '_verifiedCurrent';
  inner_key := 'v2-' || md5(actor_user::text || command_name || key_value);
  insert into public.ledger_idempotency_keys(id,actor_user_id,journey_id,command_type,idempotency_key,payload_hash)
  values(resolution_key,actor_user,target_journey,command_name,key_value,hash_value);
  if not mutated then
    applied := response_body_value;
    if resolution_value is null then
      audit_id := gen_random_uuid();
      insert into public.expense_audit_events(id,expense_id,journey_id,expense_revision,event_type,actor_user_id,actor_member_id,reason,changed_groups,after_hash)
      values(audit_id,target_expense,target_journey,prepared_revision,'INTENT_EQUIVALENT',actor_user,actor_member,reason_value,'{}',hash_value);
      applied := jsonb_set(applied,'{entity,auditEvents}',(applied #> '{entity,auditEvents}') || jsonb_build_array(jsonb_build_object(
        'id',audit_id,'expenseId',target_expense,'actorUserId',actor_user,'actorMemberId',actor_member,
        'eventType','INTENT_EQUIVALENT','reason',reason_value,'changedGroups','[]'::jsonb,'revision',prepared_revision,'createdAt',now())));
    end if;
  elsif intent_type = 'CREATE' then
    applied := public.ledger_create_expense_4a(actor_user,target_journey,inner_key,hash_value,response_body_value);
  elsif intent_type = 'APPLY_VALUATION' then
    applied := public.ledger_apply_valuation_c(actor_user,target_journey,target_expense,inner_key,hash_value,
      (intent -> 'valuation') || jsonb_build_object('baseRevision',prepared_revision), rate_snapshot_value,response_body_value,false);
  elsif intent_type = 'UPDATE' and not (intent -> 'patch' ? 'financial' or intent -> 'patch' ? 'participantSplit') then
    -- Descriptive SQL preserves the exact valuation/split identity, including newer derived evidence.
    canonical_value := response_body_value -> 'entity';
    if (canonical_value ->> 'revision')::bigint <> prepared_revision + 1 then raise exception 'INVALID_PREPARED_REVISION'; end if;
    update public.expenses set title=canonical_value ->> 'title', description=canonical_value ->> 'description',
      category=canonical_value ->> 'category', occurred_at=(canonical_value ->> 'occurredAt')::timestamptz,
      revision=prepared_revision+1, updated_at=(canonical_value ->> 'updatedAt')::timestamptz, updated_by_user_id=actor_user
      where id=target_expense;
    audit_id := (canonical_value #>> '{auditEvents,-1,id}')::uuid;
    insert into public.expense_audit_events(id,expense_id,journey_id,expense_revision,event_type,actor_user_id,actor_member_id,reason,changed_groups,after_hash,metadata)
    values(audit_id,target_expense,target_journey,prepared_revision+1,'EDITED',actor_user,actor_member,reason_value,
      '{DESCRIPTIVE}',hash_value,jsonb_build_object('contractVersion',2,'commandId',command_id,
        'base',historical_base_value,'result',canonical_value,'baseDigest',case when historical_base_value is not null then encode(extensions.digest(historical_base_value::text,'sha256'),'hex') end));
    applied := jsonb_set(response_body_value,'{entity,auditEvents,-1,actorMemberId}',to_jsonb(actor_member));
  else
    applied := public.ledger_mutate_expense_4b(actor_user,target_journey,target_expense,
      case intent_type when 'UPDATE' then 'UPDATE_EXPENSE' when 'DELETE' then 'DELETE_EXPENSE' when 'RESTORE' then 'RESTORE_EXPENSE' end,
      prepared_revision,reason_value,hash_value,inner_key,response_body_value);
  end if;
  canonical_value := applied -> 'entity';
  receipt := jsonb_build_object('operationId',command_id,'commandId',command_id,'idempotencyKey',key_value,
    'expenseId',canonical_value ->> 'id','commandType',intent_type,'intentSequence',sequence_value,
    'disposition',disposition,'canonicalRevision',(canonical_value ->> 'revision')::bigint);
  if resolution_value is not null then
    for record in select value from jsonb_array_elements(chain -> 'records') loop
      if (record ->> 'conflictId')::uuid = any(covered) then
        insert into public.expense_conflict_outcomes_v2(conflict_id,resolution_key_id,lifecycle,reason,superseded_by_command_id,resulting_revision,operation_receipt)
        values((record ->> 'conflictId')::uuid,resolution_key,
          case when coalesce(record #>> '{body,error,commandId}',record ->> 'idempotencyKey') = command_id then 'RESOLVED' else 'SUPERSEDED' end,
          reason_value,case when coalesce(record #>> '{body,error,commandId}',record ->> 'idempotencyKey') <> command_id then command_id end,
          (canonical_value ->> 'revision')::bigint,
          jsonb_build_object('operationId',coalesce(record #>> '{body,error,commandId}',record ->> 'idempotencyKey'),
            'commandId',coalesce(record #>> '{body,error,commandId}',record ->> 'idempotencyKey'),
            'idempotencyKey',record ->> 'idempotencyKey','expenseId',target_expense,
            'commandType',coalesce(record #>> '{body,error,commandType}',case record ->> 'commandType'
              when 'DELETE_EXPENSE' then 'DELETE' when 'RESTORE_EXPENSE' then 'RESTORE'
              when 'APPLY_VALUATION' then 'APPLY_VALUATION' else 'UPDATE' end),
            'intentSequence',coalesce((record #>> '{body,error,envelope,intentSequence}')::bigint,1),
            'disposition',case when coalesce(record #>> '{body,error,commandId}',record ->> 'idempotencyKey')=command_id then disposition else 'SUPERSEDED' end,
            'canonicalRevision',(canonical_value ->> 'revision')::bigint));
        -- Compatibility projection keeps existing rates/Settlement/reporting guards
        -- aware of covered closure; v2 lifecycle remains authoritative above.
        insert into public.expense_conflict_resolutions(journey_id,expense_id,conflict_id,actor_user_id,actor_member_id,
          resolution,selected_sources,reason,resulting_expense_revision)
        values(target_journey,target_expense,(record ->> 'conflictId')::uuid,actor_user,actor_member,
          case when disposition='KEPT_SERVER' then 'KEEP_JOURNEY' else 'KEEP_MINE' end,
          jsonb_build_object('contractVersion',2,'typedCommand',intent_type,'resolutionKeyId',resolution_key),
          reason_value,(canonical_value ->> 'revision')::bigint);
      end if;
    end loop;
    -- Closure is audited even KEEP_SERVER/equivalent; no aggregate revision is fabricated.
    audit_id := gen_random_uuid();
    insert into public.expense_audit_events(id,expense_id,journey_id,expense_revision,event_type,actor_user_id,actor_member_id,reason,changed_groups,after_hash,metadata)
    values(audit_id,target_expense,target_journey,(canonical_value ->> 'revision')::bigint,'CONFLICT_RESOLVED',actor_user,actor_member,reason_value,'{}',hash_value,
      jsonb_build_object('contractVersion',2,'commandId',command_id,'coveredConflictIds',covered,
        'chainDigest',resolution_value ->> 'expectedChainDigest','choice',resolution_value ->> 'choice',
        'base',historical_base_value,'result',canonical_value));
    canonical_value := jsonb_set(canonical_value,'{auditEvents}',(canonical_value -> 'auditEvents') || jsonb_build_array(jsonb_build_object(
      'id',audit_id,'expenseId',target_expense,'actorUserId',actor_user,'actorMemberId',actor_member,
      'eventType','CONFLICT_RESOLVED','reason',reason_value,'changedGroups','[]'::jsonb,
      'revision',(canonical_value ->> 'revision')::bigint,'createdAt',now())));
    chain := public.ledger_expense_chain_v2(target_journey,target_expense);
    select coalesce(jsonb_agg(r -> 'conflictId' order by r ->> 'conflictId'),'[]'::jsonb) into open_ids
      from jsonb_array_elements(chain -> 'records') r where r ->> 'lifecycle' = 'OPEN';
    select coalesce(jsonb_agg(jsonb_build_object('conflictId',r -> 'conflictId','lifecycle',r -> 'lifecycle',
      'reason',coalesce(r ->> 'reason','Uncovered conflict remains open'),'supersededByCommandId',r -> 'supersededByCommandId','operationReceipt',r -> 'operationReceipt') order by r ->> 'conflictId'),'[]'::jsonb)
      into outcomes from jsonb_array_elements(chain -> 'records') r;
    applied := jsonb_build_object('resolutionReceipt',receipt,'canonical',canonical_value,'openConflictIds',open_ids,'conflictOutcomes',outcomes);
  else applied := applied || jsonb_build_object('receipt',receipt); end if;
  update public.ledger_idempotency_keys set response_status=200,response_body=applied,completed_at=now() where id=resolution_key;
  perform set_config('otr.expense_command_v2','',true);
  perform set_config('otr.expense_base_v2','',true);
  return applied;
end;
$$;

-- Old single-conflict/full-aggregate resolver cannot reinterpret DELETE or typed commands.
alter function public.ledger_resolve_expense_conflict_4c(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,text,jsonb)
rename to ledger_resolve_expense_conflict_4c_pre_v2;
create function public.ledger_resolve_expense_conflict_4c(
  actor_user uuid,target_journey uuid,target_expense uuid,conflict_id_value uuid,current_revision_value bigint,
  resolution_value text,selected_sources_value jsonb,reason_value text,idempotency_key_value text,payload_hash_value text,response_body_value jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.ledger_idempotency_keys where actor_user_id=actor_user and journey_id=target_journey
    and command_type='RESOLVE_EXPENSE_CONFLICT' and idempotency_key=idempotency_key_value) then
    return public.ledger_resolve_expense_conflict_4c_pre_v2(actor_user,target_journey,target_expense,conflict_id_value,
      current_revision_value,resolution_value,selected_sources_value,reason_value,idempotency_key_value,payload_hash_value,response_body_value);
  end if;
  perform 1 from public.expenses where id=target_expense and journey_id=target_journey for update;
  if exists(select 1 from public.expenses where id=target_expense and journey_id=target_journey and business_status='DELETED')
    then raise exception 'TYPED_RESOLUTION_REQUIRED'; end if;
  if exists(select 1 from public.ledger_idempotency_keys where id=conflict_id_value
    and command_type <> 'UPDATE_EXPENSE') then raise exception 'TYPED_RESOLUTION_REQUIRED'; end if;
  if exists(select 1 from public.expense_conflict_outcomes_v2 where conflict_id=conflict_id_value)
    then raise exception 'CONFLICT_ALREADY_RESOLVED'; end if;
  if exists(select 1 from public.settlement_inputs i join public.settlements s on s.id=i.settlement_id
    where i.expense_id=target_expense and s.status in ('FINALIZED','PARTIALLY_PAID','SETTLED'))
    then raise exception 'FINALIZED_SETTLEMENT_PROTECTED'; end if;
  return public.ledger_resolve_expense_conflict_4c_pre_v2(actor_user,target_journey,target_expense,
    conflict_id_value,current_revision_value,resolution_value,selected_sources_value,reason_value,idempotency_key_value,payload_hash_value,response_body_value);
end;
$$;
revoke all on function public.ledger_resolve_expense_conflict_4c_pre_v2(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ledger_resolve_expense_conflict_4c(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ledger_resolve_expense_conflict_4c(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,text,jsonb) to service_role;
revoke all on function public.ledger_capture_expense_evidence_v2() from public,anon,authenticated;
revoke all on function public.ledger_expense_chain_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ledger_expense_chain_v2(uuid,uuid), public.ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';

-- Legacy conflict insertion must participate in the same Expense lock; otherwise a
-- new 409 could appear between the chain check and covered closure.
alter function public.ledger_record_conflict_4c(uuid,uuid,uuid,text,text,text,jsonb) rename to ledger_record_conflict_4c_pre_v2;
create function public.ledger_record_conflict_4c(actor_user uuid,target_journey uuid,target_expense uuid,
  command_type_value text,idempotency_key_value text,payload_hash_value text,conflict_body_value jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.expenses where id=target_expense and journey_id=target_journey for update;
  return public.ledger_record_conflict_4c_pre_v2(actor_user,target_journey,target_expense,
    command_type_value,idempotency_key_value,payload_hash_value,conflict_body_value);
end;
$$;
revoke all on function public.ledger_record_conflict_4c_pre_v2(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ledger_record_conflict_4c(uuid,uuid,uuid,text,text,text,jsonb),
  public.ledger_replay_expense_v2(uuid,uuid,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.ledger_record_conflict_4c(uuid,uuid,uuid,text,text,text,jsonb),
  public.ledger_replay_expense_v2(uuid,uuid,uuid,jsonb,text,jsonb) to service_role;

notify pgrst, 'reload schema';

revoke all on function public.ledger_expense_causal_base_v2(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ledger_expense_causal_base_v2(uuid,uuid,uuid,jsonb) to service_role;

create function public.ledger_list_expense_chain_metadata_v2(target_journey uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('expenseId',expense_id,'chainDigest',chain -> 'chainDigest',
    'conflictIds',(select jsonb_agg(r -> 'conflictId' order by r ->> 'conflictId') from jsonb_array_elements(chain -> 'records') r),
    'openConflictIds',(select coalesce(jsonb_agg(r -> 'conflictId' order by r ->> 'conflictId'),'[]'::jsonb) from jsonb_array_elements(chain -> 'records') r where r ->> 'lifecycle'='OPEN')) order by expense_id),'[]'::jsonb)
  from (select e.id expense_id,public.ledger_expense_chain_v2(target_journey,e.id) chain from public.expenses e
    where e.journey_id=target_journey and exists(select 1 from public.ledger_idempotency_keys k
      where k.journey_id=target_journey and k.response_status=409 and k.response_body #>> '{error,expenseId}'=e.id::text)) c;
$$;
revoke all on function public.ledger_list_expense_chain_metadata_v2(uuid) from public,anon,authenticated;
grant execute on function public.ledger_list_expense_chain_metadata_v2(uuid) to service_role;
notify pgrst, 'reload schema';

revoke all on function public.ledger_expense_evidence_projection_v2(jsonb),public.ledger_expense_audit_evidence_v2() from public,anon,authenticated;
grant execute on function public.ledger_expense_evidence_projection_v2(jsonb) to service_role;

-- Completed v2 envelopes/results are immutable; closure is appended separately.
create function public.ledger_reject_completed_expense_receipt_v2() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.command_type in ('EXPENSE_COMMAND_V2','RESOLVE_EXPENSE_CHAIN_V2') and old.completed_at is not null
    then raise exception 'Completed Expense v2 receipt is append-only' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger ledger_completed_expense_receipt_v2 before update or delete on public.ledger_idempotency_keys
for each row execute function public.ledger_reject_completed_expense_receipt_v2();
revoke truncate on public.ledger_idempotency_keys from service_role;
revoke all on function public.ledger_reject_completed_expense_receipt_v2() from public,anon,authenticated;
notify pgrst,'reload schema';

-- Apply the lifecycle rule at the shared persistence function so an old full
-- aggregate client cannot revive a tombstone by UPDATE even with a fresh CAS.
do $$
declare definition text; anchor text := '  if command_type_value = ''UPDATE_EXPENSE'' then';
begin
  definition := pg_get_functiondef('public.ledger_mutate_expense_4b_pre_settlement_participation(uuid,uuid,uuid,text,bigint,text,text,text,jsonb)'::regprocedure);
  if position(anchor in definition)=0 then raise exception 'UNEXPECTED_EXPENSE_MUTATION_DEFINITION'; end if;
  execute replace(definition,anchor,anchor || E'\n    if current_expense.business_status = ''DELETED'' then raise exception ''EXPENSE_DELETED''; end if;');
end;
$$;
notify pgrst,'reload schema';
