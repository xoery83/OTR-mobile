-- Additive Review v2 observation/lifecycle metadata. Legacy rows remain untouched.
alter table public.ledger_review_findings
  add column rule_id text,
  add column rule_version integer,
  add column rule_category text,
  add column rule_input_fingerprint text,
  add column comparison_fingerprint text,
  add column observation_context jsonb,
  add column lifecycle text check (lifecycle in ('ACTIVE', 'RESOLVED_BY_EXPENSE_UPDATE', 'SUPERSEDED')),
  add column observation_generation integer check (observation_generation > 0),
  add column resolved_at timestamptz,
  add column resolution_reason text,
  add column superseded_at timestamptz,
  add column superseded_by_finding_id uuid;

create unique index ledger_review_v2_active_idx on public.ledger_review_findings
  (journey_id, expense_id, rule_id) where lifecycle = 'ACTIVE';

create or replace function public.ledger_review_v2_observation_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.lifecycle is not null and
    (new.rule_id, new.rule_version, new.rule_category, new.rule_input_fingerprint,
     new.comparison_fingerprint, new.observation_context, new.observation_generation)
    is distinct from
    (old.rule_id, old.rule_version, old.rule_category, old.rule_input_fingerprint,
     old.comparison_fingerprint, old.observation_context, old.observation_generation) then
    raise exception 'REVIEW_OBSERVATION_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.ledger_review_v2_observation_immutable() from public, anon, authenticated;
grant execute on function public.ledger_review_v2_observation_immutable() to service_role;
create trigger ledger_review_v2_observation_immutable
before update on public.ledger_review_findings
for each row execute function public.ledger_review_v2_observation_immutable();

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
  -- Reject an evaluation based on an Expense snapshot already superseded by another writer.
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
        and rule_id = item->>'ruleId' and lifecycle = 'ACTIVE' for update;
    if found and old_f.rule_input_fingerprint = item->>'inputFingerprint'
      and old_f.rule_version = 2 then continue; end if;

    select coalesce(max(observation_generation), 0) + 1 into next_generation
      from public.ledger_review_findings
      where journey_id = p_journey_id and expense_id = (item->>'expenseId')::uuid
        and rule_id = item->>'ruleId';
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
      comparison_fingerprint, observation_context, lifecycle, observation_generation
    ) values (
      next_id, p_journey_id, (item->>'expenseId')::uuid, 'HEURISTIC', item->>'ruleId',
      item->>'severity', (item->>'confidence')::numeric,
      array[item->>'evidenceCode'], 'OPEN', 'ledger-review-v2',
      (item->>'expenseRevision')::bigint, item->>'ruleId', 2,
      item->>'ruleCategory', item->>'inputFingerprint',
      item->>'comparisonFingerprint', item->'context', 'ACTIVE', next_generation
    );
    old_f := null;
  end loop;

  update public.ledger_review_findings f set lifecycle = 'RESOLVED_BY_EXPENSE_UPDATE',
    status = 'STALE', resolved_at = now(), resolution_reason = 'RULE_NO_LONGER_TRIGGERED'
    where f.journey_id = p_journey_id and f.lifecycle = 'ACTIVE'
      and not exists (select 1 from jsonb_array_elements(p_observations) as pending(value)
        where pending.value->>'expenseId' = f.expense_id::text
          and pending.value->>'ruleId' = f.rule_id
          and pending.value->>'inputFingerprint' = f.rule_input_fingerprint);

  -- Retire only the v1 shared active projection after the v2 snapshot is complete.
  -- Immutable codes and append-only actor actions remain untouched and readable.
  update public.ledger_review_findings set status = 'STALE'
    where journey_id = p_journey_id and layer = 'HEURISTIC'
      and ruleset_version = 'ledger-review-v1' and status <> 'STALE';
end;
$$;
revoke all on function public.reconcile_ledger_review_v2(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_ledger_review_v2(uuid, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
