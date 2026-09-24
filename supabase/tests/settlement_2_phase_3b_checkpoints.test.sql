begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);
set local role service_role;

select has_table('public', 'ledger_settlement_review_checkpoints',
  'personal Settlement checkpoints are durable');
select has_function('public', 'ledger_create_settlement_review_checkpoint_3b',
  array['uuid','uuid','uuid','uuid','text','jsonb','timestamp with time zone','jsonb'],
  'checkpoint RPC exists');
select has_column('public', 'ledger_settlement_review_checkpoints', 'review_state',
  'checkpoint stores an explicit review state');
select has_function('public', 'ledger_create_settlement_review_checkpoint_3c',
  array['uuid','uuid','uuid','uuid','text','text','jsonb','timestamp with time zone','jsonb'],
  'three-state checkpoint RPC exists');
select ok(not has_function_privilege('authenticated',
  'public.ledger_create_settlement_review_checkpoint_3b(uuid,uuid,uuid,uuid,text,jsonb,timestamp with time zone,jsonb)',
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
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
) on conflict (journey_id) do nothing;

create temporary table phase3b_fixture as
select
  now() + interval '1 hour' as through_timestamp,
  jsonb_build_object(
    'journeyId', '10000000-0000-4000-8000-000000000001',
    'memberId', '12000000-0000-4000-8000-000000000001',
    'currency', 'NZD', 'scale', 2, 'settingsRevision', 1,
    'algorithmVersion', 'ledger-settlement-greedy-v1',
    'settlementId', null, 'settlementRevision', null,
    'settlementInputDigest', null, 'paidMinor', 0, 'shareMinor', 0,
    'balanceMinor', 0, 'contributions', '[]'::jsonb
  ) as statement;

select is((public.ledger_create_settlement_review_checkpoint_3b(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-00000000f301',
  '80000000-0000-4000-8000-00000000f301', repeat('a',64),
  (select statement from phase3b_fixture),
  (select through_timestamp from phase3b_fixture),
  public.ledger_personal_financial_source_3b(
    '10000000-0000-4000-8000-000000000001',
    (select through_timestamp from phase3b_fixture)
  )
) #>> '{idempotentReplay}'), 'false', 'member creates an exact checkpoint');
select is((select reviewer_user_id::text
  from public.ledger_settlement_review_checkpoints
  where id='80000000-0000-4000-8000-00000000f301'),
  '00000000-0000-4000-8000-000000000001', 'reviewer is server-derived');
select is((select reviewer_member_id::text
  from public.ledger_settlement_review_checkpoints
  where id='80000000-0000-4000-8000-00000000f301'),
  '12000000-0000-4000-8000-000000000001', 'member identity is server-derived');
select is((public.ledger_create_settlement_review_checkpoint_3b(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-00000000f301',
  '80000000-0000-4000-8000-00000000f301', repeat('a',64),
  (select statement from phase3b_fixture),
  (select through_timestamp from phase3b_fixture), '{}'::jsonb
) #>> '{idempotentReplay}'), 'true', 'checkpoint replay is idempotent');
select is((select count(*)::integer
  from public.ledger_settlement_review_checkpoints
  where reviewer_user_id='00000000-0000-4000-8000-000000000001'), 1,
  'replay creates one checkpoint');
select throws_ok($$select public.ledger_create_settlement_review_checkpoint_3b(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-00000000f302',
  '80000000-0000-4000-8000-00000000f302', repeat('b',64),
  (select statement from phase3b_fixture),
  (select through_timestamp from phase3b_fixture), '{}'::jsonb)$$,
  'P0001', 'CHECKPOINT_STALE', 'changed financial source rejects stale checkpoint');
select throws_ok($$select public.ledger_create_settlement_review_checkpoint_3b(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-00000000f303',
  '80000000-0000-4000-8000-00000000f303', repeat('c',64),
  (select statement from phase3b_fixture),
  (select through_timestamp from phase3b_fixture), '{}'::jsonb)$$,
  'P0001', 'CHECKPOINT_FORBIDDEN', 'cross-Journey actor is rejected');
select throws_ok($$update public.ledger_settlement_review_checkpoints
  set statement_fingerprint=repeat('d',64)
  where id='80000000-0000-4000-8000-00000000f301'$$,
  '23514', null, 'checkpoint history is immutable');

set local role authenticated;
select throws_ok($$select count(*) from public.ledger_settlement_review_checkpoints$$,
  '42501', null, 'authenticated role cannot read checkpoint table');
set local role service_role;
select is((select reviewed_statement ->> 'algorithmVersion'
  from public.ledger_settlement_review_checkpoints
  where id='80000000-0000-4000-8000-00000000f301'),
  'ledger-settlement-greedy-v1', 'algorithm version is auditable');
select is((public.ledger_create_settlement_review_checkpoint_3c(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-00000000f304',
  '80000000-0000-4000-8000-00000000f304', repeat('e',64),
  'STILL_CHECKING', (select statement from phase3b_fixture),
  (select through_timestamp from phase3b_fixture),
  public.ledger_personal_financial_source_3b(
    '10000000-0000-4000-8000-000000000001',
    (select through_timestamp from phase3b_fixture)
  )
) #>> '{checkpoint,review_state}'), 'STILL_CHECKING',
  'member can explicitly remain still checking');

select * from finish();
rollback;
