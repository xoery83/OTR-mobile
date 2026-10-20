begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(27);
set local role service_role;

insert into public.expenses (
  id, journey_id, creator_member_id, payer_member_id, title, occurred_at,
  original_amount_minor, original_currency, original_currency_scale, business_status
) values (
  '30000000-0000-4000-8000-00000000f201',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000003',
  'Personal Review fixture', now(), 100, 'NZD', 2, 'DRAFT'
);
insert into public.ledger_review_findings (
  id, journey_id, expense_id, layer, finding_type, severity, evidence_codes,
  status, ruleset_version, entity_revision, rule_id, rule_version, rule_category,
  rule_input_fingerprint, observation_context, lifecycle, observation_generation
) values (
  '40000000-0000-4000-8000-00000000f201',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-00000000f201', 'HEURISTIC', 'AMOUNT_OUTLIER',
  'WARNING', array['TEST'], 'OPEN', 'ledger-review-v2', 1,
  'AMOUNT_OUTLIER', 2, 'Amount', 'f201', '{}'::jsonb, 'ACTIVE', 1
);

select ok(public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000001'), 'owner visible without split');
select ok(public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000002'), 'creator visible');
select ok(public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000003'), 'payer visible');
select ok(not public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000004'), 'unlinked account excluded');
select is((select count(*)::integer from public.ledger_review_finding_eligible_users
  where finding_id='40000000-0000-4000-8000-00000000f201'), 3,
  'snapshot contains only linked qualifying users');
select throws_ok($$select public.act_on_ledger_review_finding(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'ACKNOWLEDGED', 1,
  'legacy global action', 'review-phase2-legacy-forbidden')$$,
  '23514', 'REVIEW_V2_PERSONAL_DECISION_REQUIRED',
  'legacy RPC cannot write a v2 shared decision');

select is((public.read_ledger_review_projection_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001') #>> '{findings,0,personal_decision}'),
  'NEEDS_REVIEW', 'absence is personal needs review');
select is((public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'ACKNOWLEDGED', 1, 0,
  null, 'review-phase2-a') #>> '{decision,decision}'), 'ACKNOWLEDGED',
  'creator acknowledges without reason');
select is((public.read_ledger_review_projection_v2(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001') #>> '{findings,0,personal_decision}'),
  'NEEDS_REVIEW', 'payer remains pending');
select is((select status from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f201'), 'OPEN',
  'personal ACK does not change shared status');
select is((public.read_ledger_review_projection_v2(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001') #> '{actions}')::text,
  '[]', 'other actor action history is private');
select is((public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'ACKNOWLEDGED', 1, 0,
  null, 'review-phase2-a') #>> '{idempotentReplay}'), 'true',
  'duplicate operation replays once');
select is((select count(*)::integer from public.ledger_review_finding_actions
  where operation_id='review-phase2-a'), 1, 'one append-only action on replay');
select throws_ok($$select public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'DISMISSED', 1, 0,
  null, 'review-phase2-stale')$$, '40001', 'REVIEW_DECISION_STALE',
  'same-user stale decision rejected');
select is((public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'DISMISSED', 1, 1,
  'Optional note', 'review-phase2-b') #>> '{decision,decision}'), 'DISMISSED',
  'same user can revise personal decision');
select is((public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'ACKNOWLEDGED', 1, 0,
  null, 'review-phase2-c') #>> '{decision,decision}'), 'ACKNOWLEDGED',
  'second user acts independently');
select is((select decision from public.ledger_review_decisions
  where finding_id='40000000-0000-4000-8000-00000000f201'
    and user_id='00000000-0000-4000-8000-000000000002'), 'DISMISSED',
  'second user does not overwrite first user');

-- A zero-allocation participant is not eligible unless another role applies.
update public.expenses set creator_member_id = (select id from public.journey_members
  where trip_id='10000000-0000-4000-8000-000000000001' and role='owner'),
  payer_member_id = (select id from public.journey_members
  where trip_id='10000000-0000-4000-8000-000000000001' and role='owner')
where id='30000000-0000-4000-8000-00000000f201';
insert into public.expense_participants(expense_id,journey_id,member_id,display_name_snapshot)
values ('30000000-0000-4000-8000-00000000f201',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002','Synthetic Member'),
  ('30000000-0000-4000-8000-00000000f201',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000003','Synthetic Guest');
insert into public.expense_splits(expense_id,journey_id,member_id,split_method,original_amount_minor,settlement_amount_minor)
values ('30000000-0000-4000-8000-00000000f201',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002','EXACT',100,0),
  ('30000000-0000-4000-8000-00000000f201',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000003','EXACT',0,0);
select ok(public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000002'), 'nonzero original split qualifies');
select ok(not public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000003'), 'zero split excluded');
update public.expense_splits set original_amount_minor=0, settlement_amount_minor=10
where expense_id='30000000-0000-4000-8000-00000000f201'
  and member_id='12000000-0000-4000-8000-000000000003';
select ok(public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000003'), 'settlement-only nonzero split qualifies');
update public.journey_members set status='unlinked'
where id='12000000-0000-4000-8000-000000000003';
select ok(not public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000003'), 'removed linkage blocks Review');
select throws_ok($$select public.read_ledger_review_projection_v2(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001')$$,
  '42501', 'REVIEW_READ_FORBIDDEN', 'removed member cannot read projection');
select throws_ok($$select public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'ACKNOWLEDGED', 1, 0,
  null, 'review-phase2-c')$$, '42501', 'REVIEW_ACTION_FORBIDDEN',
  'removed member cannot replay an old action');
update public.ledger_review_findings set lifecycle='RESOLVED_BY_EXPENSE_UPDATE', status='STALE'
where id='40000000-0000-4000-8000-00000000f201';
select ok(public.ledger_review_user_eligible('40000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-000000000002'), 'history preserves original eligible user');
insert into public.ledger_review_findings (
  id, journey_id, expense_id, layer, finding_type, severity, evidence_codes,
  status, ruleset_version, entity_revision, rule_id, rule_version, rule_category,
  rule_input_fingerprint, observation_context, lifecycle, observation_generation
) values (
  '40000000-0000-4000-8000-00000000f202',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-00000000f201', 'HEURISTIC', 'AMOUNT_OUTLIER',
  'WARNING', array['TEST'], 'OPEN', 'ledger-review-v2', 2,
  'AMOUNT_OUTLIER', 2, 'Amount', 'f202', '{}'::jsonb, 'ACTIVE', 2
);
select is((public.read_ledger_review_projection_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001') #>> '{findings,1,personal_decision}'),
  'NEEDS_REVIEW', 'new observation generation does not inherit decision');
select throws_ok($$select public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f201', 'ACKNOWLEDGED', 1, 2,
  null, 'review-phase2-closed')$$, '23514', 'REVIEW_FINDING_NOT_ACTIONABLE',
  'resolved observation rejects new action');
select is((public.read_ledger_review_projection_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001') #>> '{findings,0,lifecycle}'),
  'RESOLVED_BY_EXPENSE_UPDATE', 'resolved observation remains accessible as history');

select * from finish();
rollback;
