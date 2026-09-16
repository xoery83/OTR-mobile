begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);
set local role service_role;

insert into public.expenses (
  id, journey_id, created_by_user_id, updated_by_user_id, payer_member_id,
  title, occurred_at, original_amount_minor, original_currency,
  original_currency_scale, business_status
) values (
  '30000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  'Review fixture', now(), 100, 'NZD', 2, 'DRAFT'
);

insert into public.ledger_review_findings (
  id, journey_id, expense_id, layer, finding_type, severity, confidence,
  evidence_codes, status, ruleset_version, entity_revision
) values (
  '40000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-00000000f001',
  'HEURISTIC', 'AMOUNT_OUTLIER', 'WARNING', 0.75,
  array['TEN_TIMES_JOURNEY_MEDIAN'], 'ACKNOWLEDGED', 'ledger-review-v1', 1
);
insert into public.ledger_review_finding_actions (
  finding_id, journey_id, action, actor_user_id, actor_member_id, actor_role,
  reason, finding_revision, entity_revision, ruleset_version, operation_id
) values (
  '40000000-0000-4000-8000-00000000f001',
  '10000000-0000-4000-8000-000000000001', 'ACKNOWLEDGED',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002', 'owner', 'Known historical action',
  1, 1, 'ledger-review-v1', 'review-v2-legacy-test'
);

create function pg_temp.review_v2_run(p_hash text) returns void language plpgsql as $$
begin
  perform public.reconcile_ledger_review_v2(
    '10000000-0000-4000-8000-000000000001',
    case when p_hash is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'expenseId', '30000000-0000-4000-8000-00000000f001',
      'expenseRevision', 1, 'ruleId', 'AMOUNT_OUTLIER', 'ruleVersion', 2,
      'ruleCategory', 'Amount', 'inputFingerprint', p_hash,
      'comparisonFingerprint', 'cohort', 'context', jsonb_build_object('medianMinor', 10),
      'severity', 'WARNING', 'confidence', 0.75, 'evidenceCode', 'TEN_TIMES_CURRENCY_COHORT_MEDIAN'
    )) end,
    (select jsonb_object_agg(id::text, revision) from public.expenses
      where journey_id = '10000000-0000-4000-8000-000000000001')
  );
end;
$$;

select pg_temp.review_v2_run('h1');
select is((select count(*)::integer from public.ledger_review_findings
  where rule_version = 2 and lifecycle = 'ACTIVE'), 1, 'first observation active');
select is((select status from public.ledger_review_findings
  where ruleset_version = 'ledger-review-v1'), 'STALE', 'v1 active projection retired');
select is((select evidence_codes[1] from public.ledger_review_findings
  where ruleset_version = 'ledger-review-v1'), 'TEN_TIMES_JOURNEY_MEDIAN', 'v1 evidence unchanged');
select is((select count(*)::integer from public.ledger_review_finding_actions
  where operation_id = 'review-v2-legacy-test'), 1, 'v1 action history retained');
select throws_ok($$select public.reconcile_ledger_review_v2(
  '10000000-0000-4000-8000-000000000001', '[]'::jsonb, '{}'::jsonb)$$,
  '40001', 'REVIEW_SNAPSHOT_STALE', 'stale source snapshot rejected');

select pg_temp.review_v2_run('h1');
select is((select count(*)::integer from public.ledger_review_findings
  where rule_version = 2), 1, 'refresh is idempotent');
select throws_ok($$update public.ledger_review_findings set observation_context = '{}'::jsonb
  where rule_version = 2$$, '23514', 'REVIEW_OBSERVATION_IMMUTABLE', 'observation immutable');

select pg_temp.review_v2_run('h2');
select is((select count(*)::integer from public.ledger_review_findings
  where lifecycle = 'SUPERSEDED'), 1, 'old input superseded');
select is((select observation_generation from public.ledger_review_findings
  where lifecycle = 'ACTIVE'), 2, 'new input starts generation 2');
select ok((select superseded_by_finding_id is not null from public.ledger_review_findings
  where lifecycle = 'SUPERSEDED'), 'supersession points to replacement');

select pg_temp.review_v2_run(null);
select is((select count(*)::integer from public.ledger_review_findings
  where lifecycle = 'RESOLVED_BY_EXPENSE_UPDATE'), 1, 'disappearing rule resolves');
select pg_temp.review_v2_run('h1');
select is((select observation_generation from public.ledger_review_findings
  where lifecycle = 'ACTIVE'), 3, 'reappearance makes generation 3');
select is((select count(*)::integer from public.ledger_review_findings
  where rule_version = 2), 3, 'all three observations retained');
select is((select count(*)::integer from public.ledger_review_findings
  where rule_version = 2 and lifecycle = 'ACTIVE'), 1, 'one active observation per rule');

select * from finish();
rollback;
