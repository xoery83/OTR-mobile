begin;

create extension if not exists pgtap with schema extensions;
set local role service_role;
select set_config('search_path', format('public,%I', n.nspname), false)
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgtap';
select n.nspname as pgtap_schema
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgtap' \gset
select :"pgtap_schema".plan(26);

create temporary table phase1a_hosted_context as
select gen_random_uuid() journey_id,
       gen_random_uuid() owner_record_id,
       gen_random_uuid() member_record_id,
       gen_random_uuid() later_record_id;

create temporary table phase1a_hosted_before as
select jsonb_build_object(
  'settlements', (select count(*) from public.settlements),
  'inputs', (select count(*) from public.settlement_inputs),
  'balances', (select count(*) from public.settlement_member_balances),
  'transfers', (select count(*) from public.settlement_transfers),
  'legacyPayments', (select count(*) from public.settlement_payments),
  'legacyDischarges', (select count(*) from public.settlement_payment_discharges)
) value;

insert into public.trips (id, name, created_by)
select journey_id, 'Settlement 2 Phase 1A rollback probe',
  '00000000-0000-4000-8000-000000000001'
from phase1a_hosted_context;

insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) select gen_random_uuid(), journey_id,
  '00000000-0000-4000-8000-000000000002',
  'Phase 1A Member', 'group_member', 'linked', now()
from phase1a_hosted_context;
insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) select gen_random_uuid(), journey_id,
  '00000000-0000-4000-8000-000000000003',
  'Phase 1A Unrelated', 'guest', 'linked', now()
from phase1a_hosted_context;

select is((select count(*)::integer from information_schema.tables
  where table_schema = 'public' and table_name like 'personal_settlement_payment%'),
  4, 'all four Phase 1A tables are deployed');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'personal_settlement_payment%'
    and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity),
  4, 'all Phase 1A tables force RLS');
select ok(exists(select 1 from pg_indexes where schemaname = 'public'
  and indexname = 'personal_settlement_payment_attachments_active_idx'),
  'active attachment uniqueness index is deployed');
select ok(has_function_privilege('service_role',
  'public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text)',
  'EXECUTE'), 'service role can call the mutation RPC');
select ok(not has_function_privilege('authenticated',
  'public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text)',
  'EXECUTE'), 'authenticated clients cannot call the mutation RPC');
select ok(not has_table_privilege('authenticated',
  'public.personal_settlement_payment_records', 'SELECT'),
  'authenticated clients cannot read business tables directly');

select lives_ok(format($sql$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001', %L::uuid, %L::uuid,
    'CREATE', null, '81000000-0000-4000-8000-000000000001', 'owner-paid',
    jsonb_build_object(
      'counterpartyMemberId', (select id from public.journey_members
        where trip_id = %L::uuid and user_id = '00000000-0000-4000-8000-000000000002'),
      'direction', 'PAID', 'amountMinor', 30000, 'currency', 'NZD', 'scale', 2,
      'occurredAt', '2026-09-22T00:00:00Z',
      'recordedEquivalentMinor', 8549, 'recordedEquivalentCurrency', 'CNY',
      'recordedEquivalentScale', 0, 'referenceRateDecimal', '4.12',
      'referenceRateDate', '2026-09-21', 'referenceSource', 'rollback probe'), null)
$sql$, journey_id, owner_record_id, journey_id),
  'owner creates PAID with preserved informational FX')
from phase1a_hosted_context;
select is((select r.owner_user_id::text
  from public.personal_settlement_payment_records r, phase1a_hosted_context c
  where r.id = c.owner_record_id),
  '00000000-0000-4000-8000-000000000001', 'owner is derived from actor identity');
select is((select count(*)::integer
  from public.personal_settlement_payment_read_grants g, phase1a_hosted_context c
  where g.record_id = c.owner_record_id), 2,
  'owner and counterparty historical grants are captured');
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payments_1a(
    '00000000-0000-4000-8000-000000000002',
    (select journey_id from phase1a_hosted_context)) r,
    phase1a_hosted_context c where r.id = c.owner_record_id),
  1, 'counterparty can read the relevant record');
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payments_1a(
    '00000000-0000-4000-8000-000000000001',
    (select journey_id from phase1a_hosted_context)) r,
    phase1a_hosted_context c where r.id = c.owner_record_id),
  1, 'organizer can read Journey audit records');
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payments_1a(
    '00000000-0000-4000-8000-000000000003',
    (select journey_id from phase1a_hosted_context)) r,
    phase1a_hosted_context c where r.id = c.owner_record_id),
  0, 'unrelated member cannot read the record');

select lives_ok(format($sql$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002', %L::uuid, %L::uuid,
    'CREATE', null, gen_random_uuid(), 'member-received',
    jsonb_build_object(
      'counterpartyMemberId', (select id from public.journey_members
        where trip_id = %L::uuid and user_id = '00000000-0000-4000-8000-000000000001'),
      'direction', 'RECEIVED', 'amountMinor', 29500, 'currency', 'NZD', 'scale', 2,
      'occurredAt', '2026-09-22T00:01:00Z'), null)
$sql$, journey_id, member_record_id, journey_id),
  'member independently creates a different RECEIVED value')
from phase1a_hosted_context;
select ok((select count(distinct amount_minor) = 2
  from public.personal_settlement_payment_records r, phase1a_hosted_context c
  where r.id in (c.owner_record_id, c.member_record_id)),
  'both different personal values coexist');
select is((public.ledger_mutate_personal_settlement_payment_1a(
  '00000000-0000-4000-8000-000000000001',
  (select journey_id from phase1a_hosted_context),
  (select owner_record_id from phase1a_hosted_context), 'CREATE', null,
  '81000000-0000-4000-8000-000000000001', 'owner-paid', '{}'::jsonb, null)
  ->> 'idempotentReplay')::boolean, true, 'same create operation replays safely');
select is((select count(*)::integer from public.personal_settlement_payment_records r,
  phase1a_hosted_context c where r.id = c.owner_record_id), 1,
  'create replay does not duplicate the record');
select throws_ok(format($sql$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002', %L::uuid, %L::uuid,
    'UPDATE', 1, gen_random_uuid(), 'counterparty-edit', '{}'::jsonb, null)
$sql$, journey_id, owner_record_id),
  'P0001', 'PERSONAL_PAYMENT_WRITE_FORBIDDEN',
  'counterparty cannot edit the owner record')
from phase1a_hosted_context;

select lives_ok(format($sql$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001', %L::uuid, %L::uuid,
    'DELETE', 1, gen_random_uuid(), 'owner-delete', '{}'::jsonb, null)
$sql$, journey_id, owner_record_id), 'owner can soft-delete their record')
from phase1a_hosted_context;
select ok((select r.deleted_at is not null and c.is_tombstone
  from public.personal_settlement_payment_records r
  join public.ledger_changes c on c.entity_type = 'PERSONAL_SETTLEMENT_PAYMENT'
    and c.entity_id = r.id and c.revision = r.revision
  join phase1a_hosted_context x on x.owner_record_id = r.id),
  'soft delete persists a tombstone change');

select lives_ok(format($sql$
  update public.journey_members set status = 'unlinked'
  where trip_id = %L::uuid and user_id = '00000000-0000-4000-8000-000000000002'
$sql$, journey_id), 'member removal does not erase records')
from phase1a_hosted_context;
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payments_1a(
    '00000000-0000-4000-8000-000000000002',
    (select journey_id from phase1a_hosted_context)) r,
    phase1a_hosted_context c where r.id = c.owner_record_id and r.deleted_at is not null),
  1, 'removed counterparty retains the historical tombstone');
select throws_ok(format($sql$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002', %L::uuid, gen_random_uuid(),
    'CREATE', null, gen_random_uuid(), 'removed-write',
    jsonb_build_object(
      'counterpartyMemberId', (select id from public.journey_members
        where trip_id = %L::uuid and user_id = '00000000-0000-4000-8000-000000000001'),
      'direction', 'PAID', 'amountMinor', 1, 'currency', 'NZD', 'scale', 2,
      'occurredAt', '2026-09-22T00:02:00Z'), null)
$sql$, journey_id, journey_id),
  'P0001', 'TRIP_WRITE_FORBIDDEN', 'removed member cannot create new records')
from phase1a_hosted_context;
select lives_ok(format($sql$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001', %L::uuid, %L::uuid,
    'CREATE', null, gen_random_uuid(), 'later-unrelated',
    jsonb_build_object(
      'counterpartyMemberId', (select id from public.journey_members
        where trip_id = %L::uuid and user_id = '00000000-0000-4000-8000-000000000003'),
      'direction', 'PAID', 'amountMinor', 50, 'currency', 'NZD', 'scale', 2,
      'occurredAt', '2026-09-22T00:03:00Z'), null)
$sql$, journey_id, later_record_id, journey_id),
  'current organizer can create a later unrelated record')
from phase1a_hosted_context;
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payments_1a(
    '00000000-0000-4000-8000-000000000002',
    (select journey_id from phase1a_hosted_context)) r,
    phase1a_hosted_context c where r.id = c.later_record_id),
  0, 'historical access does not grant later Journey-wide visibility');

select is(jsonb_build_object(
  'settlements', (select count(*) from public.settlements),
  'inputs', (select count(*) from public.settlement_inputs),
  'balances', (select count(*) from public.settlement_member_balances),
  'transfers', (select count(*) from public.settlement_transfers),
  'legacyPayments', (select count(*) from public.settlement_payments),
  'legacyDischarges', (select count(*) from public.settlement_payment_discharges)
), (select value from phase1a_hosted_before),
  'personal mutations change no canonical or legacy Settlement rows');
select ok(exists(select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'expenses' and t.tgname = 'expenses_finalized_input_guard'
    and not t.tgisinternal),
  'Phase 0.5 finalized Expense guard remains deployed');

select * from finish();
rollback;
