begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(27);
set local role service_role;

select has_column('public', 'ledger_review_findings', 'origin',
  'Review v2 stores human/system origin');
select has_function('public', 'ledger_raise_human_review_finding_3a',
  array['uuid','uuid','uuid','text','uuid','uuid','uuid','uuid','bigint','text','uuid'],
  'human Finding RPC exists');
select ok(not has_function_privilege('authenticated',
  'public.ledger_raise_human_review_finding_3a(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,bigint,text,uuid)',
  'EXECUTE'), 'authenticated clients cannot bypass Backend');

delete from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';
insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Synthetic Owner', 'owner', 'linked', now()
);

insert into public.expenses (
  id, journey_id, creator_member_id, payer_member_id, title, occurred_at,
  original_amount_minor, original_currency, original_currency_scale, business_status
) values (
  '30000000-0000-4000-8000-00000000f301',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000001',
  'Human Finding fixture', now(), 100, 'NZD', 2, 'ACCEPTED'
);
insert into public.expense_participants(expense_id,journey_id,member_id,display_name_snapshot)
values ('30000000-0000-4000-8000-00000000f301',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002','Synthetic Member');
insert into public.expense_splits(
  expense_id,journey_id,member_id,split_method,original_amount_minor,settlement_amount_minor
) values ('30000000-0000-4000-8000-00000000f301',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002','EXACT',100,100);

insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
) on conflict (journey_id) do nothing;

create temporary table phase3a_source_before as
select public.ledger_settlement_source_7_1(
  '10000000-0000-4000-8000-000000000001', now() + interval '1 hour'
) value;

select is((public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f301', 'EXPENSE',
  '30000000-0000-4000-8000-00000000f301', null, null, null, 1,
  'The amount looks wrong', '40000000-0000-4000-8000-00000000f301'
) #>> '{finding,origin}'), 'HUMAN', 'member raises a human Expense Finding');
select is((select author_user_id::text from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f301'),
  '00000000-0000-4000-8000-000000000002', 'reporter identity is server-derived');
select is((select target_type from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f301'),
  'EXPENSE', 'typed Expense target is preserved');
select ok(public.ledger_review_user_eligible(
  '40000000-0000-4000-8000-00000000f301',
  '00000000-0000-4000-8000-000000000002'), 'reporter can read concern');
select ok(public.ledger_review_user_eligible(
  '40000000-0000-4000-8000-00000000f301',
  '00000000-0000-4000-8000-000000000001'), 'organizer can read concern');
select ok(not public.ledger_review_user_eligible(
  '40000000-0000-4000-8000-00000000f301',
  '00000000-0000-4000-8000-000000000003'), 'unrelated member is hidden');
select is((public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f301', 'EXPENSE',
  '30000000-0000-4000-8000-00000000f301', null, null, null, 1,
  'The amount looks wrong', '40000000-0000-4000-8000-00000000f301'
) #>> '{idempotentReplay}'), 'true', 'raise replay is idempotent');
select is((select count(*)::integer from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f301'), 1,
  'raise replay creates one Finding');
select throws_ok($$select public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f301', 'EXPENSE',
  '30000000-0000-4000-8000-00000000f301', null, null, null, 1,
  'Different note', '40000000-0000-4000-8000-00000000f301')$$,
  '23505', 'IDEMPOTENCY_CONFLICT', 'reused operation with different payload conflicts');
select throws_ok($$select public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f399', 'EXPENSE',
  '30000000-0000-4000-8000-00000000f301', null, null, null, 1,
  null, '40000000-0000-4000-8000-00000000f399')$$,
  '42501', 'REVIEW_RAISE_FORBIDDEN', 'cross-Journey reporter is rejected');
select throws_ok($$select public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f398', 'EXPENSE',
  '30000000-0000-4000-8000-00000000f301', null, null, null, 99,
  null, '40000000-0000-4000-8000-00000000f398')$$,
  '40001', 'REVIEW_TARGET_STALE', 'stale target revision is rejected');

select lives_ok($$
  select public.reconcile_ledger_review_v2(
    '10000000-0000-4000-8000-000000000001', '[]'::jsonb,
    coalesce((select jsonb_object_agg(id::text,revision) from public.expenses
      where journey_id='10000000-0000-4000-8000-000000000001'),'{}'::jsonb))
$$, 'system reconciliation accepts the Journey snapshot');
select is((select lifecycle from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f301'), 'ACTIVE',
  'system reconciliation does not close human Finding');
select is(public.ledger_settlement_source_7_1(
  '10000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
  (select value from phase3a_source_before), 'human Finding does not change Settlement math');

select is((public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f302', 'EXPENSE_SHARE',
  '30000000-0000-4000-8000-00000000f301',
  '12000000-0000-4000-8000-000000000002', null, null, 1,
  null, '40000000-0000-4000-8000-00000000f302'
) #>> '{finding,target_member_id}'),
  '12000000-0000-4000-8000-000000000002', 'exact share target is preserved');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-00000000f301', 'CREATE', null,
    '71000000-0000-4000-8000-00000000f301', 'phase3a-payment',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":100,"currency":"NZD","scale":2,"occurredAt":"2026-09-23T01:00:00Z"}',
    null)
$$, 'personal Payment fixture is created');
select is((public.ledger_raise_human_review_finding_3a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f303', 'PERSONAL_PAYMENT',
  null, null, '70000000-0000-4000-8000-00000000f301', null, 1,
  null, '40000000-0000-4000-8000-00000000f303'
) #>> '{finding,personal_payment_id}'),
  '70000000-0000-4000-8000-00000000f301',
  'counterparty raises a typed Personal Payment Finding');
select ok(public.ledger_review_user_eligible(
  '40000000-0000-4000-8000-00000000f303',
  '00000000-0000-4000-8000-000000000001'), 'Payment owner can read concern');
select is((public.act_on_ledger_review_finding_v2(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-00000000f303', 'ACKNOWLEDGED', 1, 0,
  null, 'phase3a-human-ack') #>> '{decision,decision}'), 'ACKNOWLEDGED',
  'human Finding supports a personal ACK');
select is((select lifecycle from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f303'), 'ACTIVE',
  'personal ACK does not claim the source is fixed');

update public.expenses set title='Human Finding fixture corrected'
where id='30000000-0000-4000-8000-00000000f301';
select is(public.ledger_resolve_human_review_findings_3a(
  '10000000-0000-4000-8000-000000000001'), 2,
  'source revision change resolves Expense and share concerns only');
select is((select lifecycle from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f301'),
  'RESOLVED_BY_EXPENSE_UPDATE', 'source correction closes the concern explicitly');
select is((select lifecycle from public.ledger_review_findings
  where id='40000000-0000-4000-8000-00000000f303'), 'ACTIVE',
  'unrelated Personal Payment concern remains active');
select throws_ok($$update public.ledger_review_findings set human_note='changed'
  where id='40000000-0000-4000-8000-00000000f303'$$,
  '23514', 'REVIEW_OBSERVATION_IMMUTABLE', 'human report context is immutable');

select * from finish();
rollback;
