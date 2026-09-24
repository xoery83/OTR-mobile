begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);
set local role service_role;

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
) on conflict (trip_id, user_id) do update set role = 'owner', status = 'linked';
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE')
on conflict (journey_id) do update set settlement_currency = 'NZD', settlement_scale = 2;

select ok(not has_function_privilege('authenticated',
  'public.ledger_backfill_personal_payment_fx_1d(jsonb)', 'EXECUTE'),
  'authenticated clients cannot invoke the backfill');
select ok(has_function_privilege('service_role',
  'public.ledger_backfill_personal_payment_fx_1d(jsonb)', 'EXECUTE'),
  'service role can invoke the bounded backfill');

select public.ledger_mutate_personal_settlement_payment_1a(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000001', 'CREATE', null,
  '74300000-0000-4000-8000-000000000001', 'slice-d-identity',
  '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":500,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T23:30:00-04:00"}', null);
select public.ledger_mutate_personal_settlement_payment_1a(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000002', 'CREATE', null,
  '74300000-0000-4000-8000-000000000002', 'slice-d-demand',
  '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"RECEIVED","amountMinor":1500,"currency":"ISK","scale":0,"occurredAt":"2026-09-21T01:30:00+00:00"}', null);

select is((select economic_date_source from public.personal_settlement_payment_records
  where id = '74200000-0000-4000-8000-000000000001'), 'LEGACY_DERIVED_UTC',
  'old-client omission persists derived provenance');

-- Model the pre-Slice-D rows selected by a reviewed environment manifest.
update public.personal_settlement_payment_records set economic_date_source = null
where id in ('74200000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000002');
create temporary table slice_d_before as select
  (select count(*) from public.personal_settlement_payment_audit_events
    where record_id::text like '74200000%') payment_audits,
  (select count(*) from public.ledger_changes where entity_type = 'PERSONAL_SETTLEMENT_PAYMENT'
    and entity_id::text like '74200000%') payment_changes,
  public.ledger_settlement_source_7_1(
    '10000000-0000-4000-8000-000000000001', '2026-09-22T00:00:00Z') canonical;
create temporary table slice_d_manifest as select jsonb_build_array(
  jsonb_build_object(
    'paymentId', p1.id, 'expectedRevision', p1.revision,
    'expectedInputDigest', public.ledger_personal_payment_fx_input_digest_1c(p1),
    'expectedTargetCurrency', 'NZD', 'classification', 'IDENTITY_SAFE',
    'economicDateSource', 'LEGACY_DERIVED_UTC'),
  jsonb_build_object(
    'paymentId', p2.id, 'expectedRevision', p2.revision,
    'expectedInputDigest', public.ledger_personal_payment_fx_input_digest_1c(p2),
    'expectedTargetCurrency', 'NZD', 'classification', 'NEEDS_RESOLUTION',
    'economicDateSource', 'LEGACY_DERIVED_UTC')) cohort
from public.personal_settlement_payment_records p1,
  public.personal_settlement_payment_records p2
where p1.id = '74200000-0000-4000-8000-000000000001'
  and p2.id = '74200000-0000-4000-8000-000000000002';
create temporary table slice_d_result as
select public.ledger_backfill_personal_payment_fx_1d(cohort) value
from slice_d_manifest;

select is((select (value ->> 'provenanceUpdated')::integer from slice_d_result), 2,
  'first execution assigns reviewed provenance');
select is((select (value ->> 'projectionsCreated')::integer from slice_d_result), 2,
  'first execution creates exactly two projections');
select is((select (value ->> 'demandGroups')::integer from slice_d_result), 1,
  'only cross-currency input creates a demand group');
select results_eq($$select economic_date_source from public.personal_settlement_payment_records
  where id::text like '74200000%' order by id$$,
  $$values ('LEGACY_DERIVED_UTC'::text), ('LEGACY_DERIVED_UTC'::text)$$,
  'manifest assigns only the declared provenance');
select results_eq($$select revision from public.personal_settlement_payment_records
  where id::text like '74200000%' order by id$$,
  $$values (1::bigint), (1::bigint)$$,
  'backfill does not alter Payment revisions');
select is((select state from public.personal_settlement_payment_fx_projections
  where payment_id = '74200000-0000-4000-8000-000000000001'), 'CONFIRMED',
  'identity projection confirms without a provider');
select is((select equivalent_minor from public.personal_settlement_payment_fx_projections
  where payment_id = '74200000-0000-4000-8000-000000000001'), 500::bigint,
  'identity projection preserves exact Money');
select is((select state from public.personal_settlement_payment_fx_projections
  where payment_id = '74200000-0000-4000-8000-000000000002'), 'PENDING',
  'cross-currency projection uses the normal pending path');
select is((select count(*)::integer from public.personal_settlement_payment_fx_projection_audit_events
  where payment_id::text like '74200000%'), 2,
  'first run creates exactly one projection audit per entry');
select is((select count(*)::integer from public.ledger_changes
  where entity_type = 'PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION'
    and entity_id in (select id from public.personal_settlement_payment_fx_projections
      where payment_id::text like '74200000%')), 2,
  'first run creates exactly one projection change per entry');
select is((select count(*) from public.personal_settlement_payment_audit_events
  where record_id::text like '74200000%'), (select payment_audits from slice_d_before),
  'provenance repair creates no false Payment audit');
select is((select count(*) from public.ledger_changes
  where entity_type = 'PERSONAL_SETTLEMENT_PAYMENT' and entity_id::text like '74200000%'),
  (select payment_changes from slice_d_before),
  'provenance repair creates no false Payment change revision');
select is(public.ledger_settlement_source_7_1(
  '10000000-0000-4000-8000-000000000001', '2026-09-22T00:00:00Z'),
  (select canonical from slice_d_before),
  'canonical Settlement source remains byte-stable');

create temporary table slice_d_replay as
select public.ledger_backfill_personal_payment_fx_1d(cohort) value
from slice_d_manifest;
select is((select (value ->> 'provenanceUpdated')::integer from slice_d_replay), 0,
  'replay performs no provenance mutation');
select is((select (value ->> 'projectionsCreated')::integer from slice_d_replay), 0,
  'replay creates no projection');
select is((select count(*)::integer from public.personal_settlement_payment_fx_projection_audit_events
  where payment_id::text like '74200000%'), 2,
  'replay creates no projection audit event');

select throws_ok($$select public.ledger_backfill_personal_payment_fx_1d(
  '[{"paymentId":"74200000-0000-4000-8000-000000000001","expectedRevision":2,"expectedInputDigest":"00000000000000000000000000000000","expectedTargetCurrency":"NZD","classification":"IDENTITY_SAFE","economicDateSource":"LEGACY_DERIVED_UTC"}]')$$,
  'P0001', 'PERSONAL_PAYMENT_BACKFILL_INPUT_STALE',
  'revision and digest guard reject stale manifest input');
select throws_ok($$select public.ledger_backfill_personal_payment_fx_1d(
  '[{"paymentId":"74200000-0000-4000-8000-000000000001","expectedRevision":1,"expectedInputDigest":"c6993cf2d2cd805da320acddab65b33a","expectedTargetCurrency":"NZD","classification":"NEEDS_RESOLUTION","economicDateSource":"LEGACY_DERIVED_UTC"}]')$$,
  'P0001', 'PERSONAL_PAYMENT_BACKFILL_CLASSIFICATION_STALE',
  'classification guard rejects a changed cohort decision');

select * from finish();
rollback;
