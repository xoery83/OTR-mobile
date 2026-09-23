-- Settlement 2.0 Phase 3A: human concerns inside the existing Review v2 system.

alter table public.ledger_review_findings
  add column origin text not null default 'SYSTEM'
    check (origin in ('SYSTEM', 'HUMAN')),
  add column author_user_id uuid references public.profiles(id) on delete restrict,
  add column author_member_id uuid references public.journey_members(id) on delete restrict,
  add column target_type text
    check (target_type in ('EXPENSE', 'EXPENSE_SHARE', 'PERSONAL_PAYMENT', 'SETTLEMENT')),
  add column target_member_id uuid references public.journey_members(id) on delete restrict,
  add column personal_payment_id uuid
    references public.personal_settlement_payment_records(id) on delete restrict,
  add column target_source_revision bigint check (target_source_revision > 0),
  add column human_note text check (human_note is null or char_length(human_note) <= 2000),
  add column origin_operation_id uuid,
  add constraint ledger_review_human_shape check (
    origin = 'SYSTEM' or (
      author_user_id is not null and author_member_id is not null
      and target_type is not null and target_source_revision is not null
      and origin_operation_id is not null
      and (
        (target_type = 'EXPENSE' and expense_id is not null
          and target_member_id is null and personal_payment_id is null
          and settlement_id is null)
        or (target_type = 'EXPENSE_SHARE' and expense_id is not null
          and target_member_id is not null and personal_payment_id is null
          and settlement_id is null)
        or (target_type = 'PERSONAL_PAYMENT' and expense_id is null
          and target_member_id is null and personal_payment_id is not null
          and settlement_id is null)
        or (target_type = 'SETTLEMENT' and expense_id is null
          and target_member_id is null and personal_payment_id is null
          and settlement_id is not null)
      )
    )
  );

create unique index ledger_review_human_operation_idx
  on public.ledger_review_findings(author_user_id, origin_operation_id)
  where origin = 'HUMAN';

-- The system engine owns only system observations. Human concerns may coexist.
drop index public.ledger_review_v2_active_idx;
create unique index ledger_review_v2_active_idx on public.ledger_review_findings
  (journey_id, expense_id, rule_id)
  where lifecycle = 'ACTIVE' and origin = 'SYSTEM';

create or replace function public.ledger_review_v2_observation_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.lifecycle is not null and
    (new.rule_id, new.rule_version, new.rule_category, new.rule_input_fingerprint,
     new.comparison_fingerprint, new.observation_context, new.observation_generation,
     new.origin, new.author_user_id, new.author_member_id, new.target_type,
     new.target_member_id, new.personal_payment_id, new.target_source_revision,
     new.human_note, new.origin_operation_id)
    is distinct from
    (old.rule_id, old.rule_version, old.rule_category, old.rule_input_fingerprint,
     old.comparison_fingerprint, old.observation_context, old.observation_generation,
     old.origin, old.author_user_id, old.author_member_id, old.target_type,
     old.target_member_id, old.personal_payment_id, old.target_source_revision,
     old.human_note, old.origin_operation_id) then
    raise exception 'REVIEW_OBSERVATION_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.reconcile_ledger_review_v2(
  p_journey_id uuid, p_observations jsonb, p_expense_revisions jsonb
) returns void language plpgsql set search_path = public as $$
declare
  item jsonb;
  old_f public.ledger_review_findings;
  next_id uuid;
  next_generation integer;
  digest_hex text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_journey_id::text, 192));
  if coalesce((select jsonb_object_agg(id::text, revision)
    from public.expenses where journey_id = p_journey_id), '{}'::jsonb) <> p_expense_revisions then
    raise exception 'REVIEW_SNAPSHOT_STALE' using errcode = '40001';
  end if;
  if jsonb_typeof(p_observations) <> 'array' then
    raise exception 'INVALID_REVIEW_OBSERVATIONS' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(p_observations) loop
    if item->>'ruleVersion' <> '2' or item->>'expenseId' is null or
       item->>'ruleId' is null or item->>'inputFingerprint' is null or
       jsonb_typeof(item->'context') <> 'object' then
      raise exception 'INVALID_REVIEW_OBSERVATION' using errcode = '23514';
    end if;
    select * into old_f from public.ledger_review_findings
      where journey_id = p_journey_id and expense_id = (item->>'expenseId')::uuid
        and rule_id = item->>'ruleId' and lifecycle = 'ACTIVE'
        and origin = 'SYSTEM' for update;
    if found and old_f.rule_input_fingerprint = item->>'inputFingerprint'
      and old_f.rule_version = 2 then continue; end if;

    select coalesce(max(observation_generation), 0) + 1 into next_generation
      from public.ledger_review_findings
      where journey_id = p_journey_id and expense_id = (item->>'expenseId')::uuid
        and rule_id = item->>'ruleId' and origin = 'SYSTEM';
    digest_hex := encode(extensions.digest(concat_ws(':', p_journey_id::text, item->>'expenseId',
      item->>'ruleId', '2', item->>'inputFingerprint', next_generation::text), 'sha256'), 'hex');
    next_id := (substr(digest_hex, 1, 8) || '-' || substr(digest_hex, 9, 4) || '-5' ||
      substr(digest_hex, 14, 3) || '-a' || substr(digest_hex, 18, 3) || '-' ||
      substr(digest_hex, 21, 12))::uuid;
    if old_f.id is not null then
      update public.ledger_review_findings set lifecycle = 'SUPERSEDED',
        status = 'STALE', superseded_at = now(), superseded_by_finding_id = next_id
        where id = old_f.id;
    end if;
    insert into public.ledger_review_findings (
      id, journey_id, expense_id, layer, finding_type, severity, confidence,
      evidence_codes, status, ruleset_version, entity_revision,
      rule_id, rule_version, rule_category, rule_input_fingerprint,
      comparison_fingerprint, observation_context, lifecycle, observation_generation,
      origin
    ) values (
      next_id, p_journey_id, (item->>'expenseId')::uuid, 'HEURISTIC', item->>'ruleId',
      item->>'severity', (item->>'confidence')::numeric,
      array[item->>'evidenceCode'], 'OPEN', 'ledger-review-v2',
      (item->>'expenseRevision')::bigint, item->>'ruleId', 2,
      item->>'ruleCategory', item->>'inputFingerprint',
      item->>'comparisonFingerprint', item->'context', 'ACTIVE', next_generation,
      'SYSTEM'
    );
    old_f := null;
  end loop;

  update public.ledger_review_findings f set lifecycle = 'RESOLVED_BY_EXPENSE_UPDATE',
    status = 'STALE', resolved_at = now(), resolution_reason = 'RULE_NO_LONGER_TRIGGERED'
    where f.journey_id = p_journey_id and f.lifecycle = 'ACTIVE'
      and f.origin = 'SYSTEM'
      and not exists (select 1 from jsonb_array_elements(p_observations) as pending(value)
        where pending.value->>'expenseId' = f.expense_id::text
          and pending.value->>'ruleId' = f.rule_id
          and pending.value->>'inputFingerprint' = f.rule_input_fingerprint);

  update public.ledger_review_findings set status = 'STALE'
    where journey_id = p_journey_id and origin = 'SYSTEM' and layer = 'HEURISTIC'
      and ruleset_version = 'ledger-review-v1' and status <> 'STALE';
end;
$$;

create or replace function public.ledger_review_snapshot_eligible()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.origin = 'SYSTEM' and new.rule_id is not null and new.expense_id is not null then
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
  elsif new.origin = 'HUMAN' then
    insert into public.ledger_review_finding_eligible_users(finding_id, user_id)
    select distinct new.id, user_id from (
      select new.author_user_id as user_id
      union all
      select m.user_id from public.journey_members m
        where m.trip_id = new.journey_id and m.status = 'linked' and m.role = 'owner'
      union all
      select m.user_id from public.expenses e join public.journey_members m
        on m.id in (e.creator_member_id, e.payer_member_id)
        where e.id = new.expense_id and m.status = 'linked'
      union all
      select m.user_id from public.journey_members m
        where m.id = new.target_member_id and m.status = 'linked'
      union all
      select r.owner_user_id from public.personal_settlement_payment_records r
        where r.id = new.personal_payment_id
      union all
      select m.user_id from public.personal_settlement_payment_records r
        join public.journey_members m on m.id = r.counterparty_member_id
        where r.id = new.personal_payment_id and m.status = 'linked'
    ) eligible where user_id is not null
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.ledger_review_user_eligible(p_finding_id uuid, p_user_id uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.ledger_review_findings f
    join public.journey_members m on m.trip_id = f.journey_id
      and m.user_id = p_user_id and m.status = 'linked'
    left join public.expenses e on e.id = f.expense_id
    where f.id = p_finding_id and (
      m.role = 'owner'
      or (f.origin = 'HUMAN' and exists (
        select 1 from public.ledger_review_finding_eligible_users h
        where h.finding_id = f.id and h.user_id = p_user_id))
      or (f.origin = 'SYSTEM' and f.rule_id is not null and f.lifecycle = 'ACTIVE' and
        (m.id = e.creator_member_id or m.id = e.payer_member_id
          or exists (select 1 from public.expense_splits s
            where s.expense_id = e.id and s.member_id = m.id
              and (s.original_amount_minor <> 0 or coalesce(s.settlement_amount_minor,0) <> 0))))
      or (f.origin = 'SYSTEM' and f.rule_id is not null and f.lifecycle <> 'ACTIVE'
        and exists (select 1 from public.ledger_review_finding_eligible_users h
          where h.finding_id = f.id and h.user_id = p_user_id))
      or (f.origin = 'SYSTEM' and f.rule_id is null and exists (
        select 1 from public.ledger_review_finding_actions a
        where a.finding_id = f.id and a.actor_user_id = p_user_id))
    )
  );
$$;

create or replace function public.ledger_raise_human_review_finding_3a(
  p_actor_user_id uuid,
  p_journey_id uuid,
  p_finding_id uuid,
  p_target_type text,
  p_expense_id uuid,
  p_target_member_id uuid,
  p_personal_payment_id uuid,
  p_settlement_id uuid,
  p_source_revision bigint,
  p_note text,
  p_operation_id uuid
) returns jsonb language plpgsql set search_path = public as $$
declare
  actor_member public.journey_members;
  target_expense public.expenses;
  target_payment public.personal_settlement_payment_records;
  target_settlement public.settlements;
  existing public.ledger_review_findings;
  finding public.ledger_review_findings;
  cleaned_note text := nullif(trim(p_note), '');
  target_title text;
begin
  if p_finding_id is null or p_operation_id is null or p_finding_id <> p_operation_id then
    raise exception 'REVIEW_OPERATION_IDENTITY_CONFLICT' using errcode = '23505';
  end if;
  select * into existing from public.ledger_review_findings where id = p_finding_id;
  if found then
    if existing.origin <> 'HUMAN' or existing.author_user_id <> p_actor_user_id
      or existing.journey_id <> p_journey_id or existing.target_type <> p_target_type
      or existing.expense_id is distinct from p_expense_id
      or existing.target_member_id is distinct from p_target_member_id
      or existing.personal_payment_id is distinct from p_personal_payment_id
      or existing.settlement_id is distinct from p_settlement_id
      or existing.target_source_revision <> p_source_revision
      or existing.human_note is distinct from cleaned_note
      or existing.origin_operation_id <> p_operation_id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('finding', to_jsonb(existing), 'idempotentReplay', true);
  end if;
  if p_target_type not in ('EXPENSE','EXPENSE_SHARE','PERSONAL_PAYMENT','SETTLEMENT')
    or p_source_revision is null or p_source_revision < 1
    or (cleaned_note is not null and char_length(cleaned_note) > 2000) then
    raise exception 'INVALID_HUMAN_REVIEW_FINDING' using errcode = '23514';
  end if;
  select * into actor_member from public.journey_members
    where trip_id = p_journey_id and user_id = p_actor_user_id and status = 'linked';
  if not found then raise exception 'REVIEW_RAISE_FORBIDDEN' using errcode = '42501'; end if;

  if p_target_type in ('EXPENSE','EXPENSE_SHARE') then
    if p_expense_id is null or p_personal_payment_id is not null or p_settlement_id is not null then
      raise exception 'INVALID_HUMAN_REVIEW_TARGET' using errcode = '23514';
    end if;
    select * into target_expense from public.expenses
      where id = p_expense_id and journey_id = p_journey_id;
    if not found then raise exception 'REVIEW_TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
    if target_expense.revision <> p_source_revision then
      raise exception 'REVIEW_TARGET_STALE' using errcode = '40001';
    end if;
    if actor_member.role <> 'owner' and actor_member.id not in (
      target_expense.creator_member_id, target_expense.payer_member_id
    ) and not exists (select 1 from public.expense_splits s
      where s.expense_id = target_expense.id and s.member_id = actor_member.id
        and (s.original_amount_minor <> 0 or coalesce(s.settlement_amount_minor,0) <> 0)) then
      raise exception 'REVIEW_RAISE_FORBIDDEN' using errcode = '42501';
    end if;
    if p_target_type = 'EXPENSE' and p_target_member_id is not null then
      raise exception 'INVALID_HUMAN_REVIEW_TARGET' using errcode = '23514';
    end if;
    if p_target_type = 'EXPENSE_SHARE' and (p_target_member_id is null or not exists (
      select 1 from public.expense_splits s where s.expense_id = target_expense.id
        and s.member_id = p_target_member_id
    )) then
      raise exception 'INVALID_HUMAN_REVIEW_TARGET' using errcode = '23514';
    end if;
    target_title := target_expense.title;
  elsif p_target_type = 'PERSONAL_PAYMENT' then
    if p_personal_payment_id is null or p_expense_id is not null
      or p_target_member_id is not null or p_settlement_id is not null then
      raise exception 'INVALID_HUMAN_REVIEW_TARGET' using errcode = '23514';
    end if;
    select * into target_payment from public.personal_settlement_payment_records
      where id = p_personal_payment_id and journey_id = p_journey_id and deleted_at is null;
    if not found then raise exception 'REVIEW_TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
    if target_payment.revision <> p_source_revision then
      raise exception 'REVIEW_TARGET_STALE' using errcode = '40001';
    end if;
    if not public.ledger_can_read_personal_settlement_payment_1a(
      p_actor_user_id, target_payment.id
    ) then raise exception 'REVIEW_RAISE_FORBIDDEN' using errcode = '42501'; end if;
    target_title := case target_payment.direction when 'PAID' then 'Payment record' else 'Amount received record' end;
  else
    if p_settlement_id is null or p_expense_id is not null
      or p_target_member_id is not null or p_personal_payment_id is not null then
      raise exception 'INVALID_HUMAN_REVIEW_TARGET' using errcode = '23514';
    end if;
    select * into target_settlement from public.settlements
      where id = p_settlement_id and journey_id = p_journey_id;
    if not found then raise exception 'REVIEW_TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
    if target_settlement.revision <> p_source_revision then
      raise exception 'REVIEW_TARGET_STALE' using errcode = '40001';
    end if;
    target_title := 'Settlement';
  end if;

  insert into public.ledger_review_findings (
    id, journey_id, expense_id, settlement_id, layer, finding_type, severity,
    confidence, evidence_codes, status, ruleset_version, entity_revision,
    rule_id, rule_version, rule_category, rule_input_fingerprint,
    observation_context, lifecycle, observation_generation, origin,
    author_user_id, author_member_id, target_type, target_member_id,
    personal_payment_id, target_source_revision, human_note, origin_operation_id
  ) values (
    p_finding_id, p_journey_id, p_expense_id, p_settlement_id, 'HEURISTIC',
    'HUMAN_CONCERN', 'WARNING', null, array['HUMAN_REPORTED'], 'OPEN',
    'ledger-review-human-v1', p_source_revision, 'HUMAN_CONCERN', 1, 'Human',
    p_target_type || ':' || p_source_revision::text,
    jsonb_build_object('targetType', p_target_type, 'targetTitleSnapshot', target_title,
      'targetMemberId', p_target_member_id, 'personalPaymentId', p_personal_payment_id,
      'sourceRevision', p_source_revision, 'note', cleaned_note),
    'ACTIVE', 1, 'HUMAN', p_actor_user_id, actor_member.id, p_target_type,
    p_target_member_id, p_personal_payment_id, p_source_revision, cleaned_note,
    p_operation_id
  ) returning * into finding;
  return jsonb_build_object('finding', to_jsonb(finding), 'idempotentReplay', false);
end;
$$;

create or replace function public.ledger_resolve_human_review_findings_3a(
  p_journey_id uuid
) returns integer language plpgsql set search_path = public as $$
declare resolved_count integer;
begin
  update public.ledger_review_findings f
  set lifecycle = 'RESOLVED_BY_EXPENSE_UPDATE', status = 'STALE', resolved_at = now(),
      resolution_reason = 'SOURCE_REVISION_CHANGED'
  where f.journey_id = p_journey_id and f.origin = 'HUMAN' and f.lifecycle = 'ACTIVE'
    and (
      (f.target_type in ('EXPENSE','EXPENSE_SHARE') and not exists (
        select 1 from public.expenses e where e.id = f.expense_id
          and e.journey_id = f.journey_id and e.revision = f.target_source_revision))
      or (f.target_type = 'PERSONAL_PAYMENT' and not exists (
        select 1 from public.personal_settlement_payment_records p
        where p.id = f.personal_payment_id and p.journey_id = f.journey_id
          and p.revision = f.target_source_revision and p.deleted_at is null))
      or (f.target_type = 'SETTLEMENT' and not exists (
        select 1 from public.settlements s where s.id = f.settlement_id
          and s.journey_id = f.journey_id and s.revision = f.target_source_revision))
    );
  get diagnostics resolved_count = row_count;
  return resolved_count;
end;
$$;

revoke all on function public.ledger_raise_human_review_finding_3a(
  uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,bigint,text,uuid
) from public, anon, authenticated;
grant execute on function public.ledger_raise_human_review_finding_3a(
  uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,bigint,text,uuid
) to service_role;
revoke all on function public.ledger_resolve_human_review_findings_3a(uuid)
  from public, anon, authenticated;
grant execute on function public.ledger_resolve_human_review_findings_3a(uuid)
  to service_role;

notify pgrst, 'reload schema';
