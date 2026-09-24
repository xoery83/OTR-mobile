begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(74);
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
) on conflict (trip_id, user_id) do update
set role = 'owner', status = 'linked';

insert into public.trips (id, name, created_by)
values (
  '10000000-0000-4000-8000-000000000002', 'Other Journey',
  '00000000-0000-4000-8000-000000000004'
) on conflict (id) do nothing;
delete from public.journey_members
where trip_id = '10000000-0000-4000-8000-000000000002'
  and user_id = '00000000-0000-4000-8000-000000000004';
insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values (
  '12000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  'Other Owner', 'owner', 'linked', now()
) on conflict (trip_id, user_id) do update
set role = 'owner', status = 'linked';

select has_table('public', 'personal_settlement_payment_records', 'personal record table exists');
select has_table('public', 'personal_settlement_payment_read_grants', 'historical read grants exist');
select has_table('public', 'personal_settlement_payment_audit_events', 'append-only audit exists');
select has_table('public', 'personal_settlement_payment_attachments', 'attachment link table exists');
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'personal_settlement_payment%'
     and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity),
  6, 'all Personal Payment tables force RLS'
);
select ok(not has_table_privilege('authenticated',
  'public.personal_settlement_payment_records', 'INSERT'),
  'authenticated clients cannot mutate personal records directly');
select ok(not has_function_privilege('authenticated',
  'public.ledger_list_personal_settlement_payments_1a(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot call the projection RPC directly');
select ok(has_function_privilege('service_role',
  'public.ledger_mutate_personal_settlement_payment_1a(uuid,uuid,uuid,text,bigint,uuid,text,jsonb,text)',
  'EXECUTE'), 'Backend service role can mutate personal records');
select hasnt_column('public', 'personal_settlement_payment_records', 'related_transfer_id',
  'personal records are not coupled to legacy transfers');

insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
) on conflict (journey_id) do nothing;
create temporary table phase1a_source_before as
select public.ledger_settlement_source_7_1(
  '10000000-0000-4000-8000-000000000001', '2026-09-22T00:00:00Z'
) value;

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001', 'CREATE', null,
    '71000000-0000-4000-8000-000000000001', 'paid-100',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":100,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:00:00Z"}',
    null
  )
$$, 'owner can create a pre-final PAID assertion');
select is(
  public.ledger_settlement_source_7_1(
    '10000000-0000-4000-8000-000000000001', '2026-09-22T00:00:00Z'
  ),
  (select value from phase1a_source_before),
  'pre-final personal payment does not change canonical Settlement source'
);
select is((select owner_user_id::text from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-000000000001', 'owner identity is derived from actor');
select is((select count(*)::integer from public.personal_settlement_payment_read_grants
  where record_id = '70000000-0000-4000-8000-000000000001'), 2,
  'creation freezes owner and linked-counterparty read grants');
select is((select count(*)::integer from public.personal_settlement_payment_audit_events
  where record_id = '70000000-0000-4000-8000-000000000001' and event_type = 'CREATED'), 1,
  'create writes one audit snapshot');
select is((select count(*)::integer from public.ledger_changes
  where entity_type = 'PERSONAL_SETTLEMENT_PAYMENT'
    and entity_id = '70000000-0000-4000-8000-000000000001'
    and not is_tombstone), 1, 'create emits a projection change');
select is((public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001', 'CREATE', null,
    '71000000-0000-4000-8000-000000000001', 'paid-100', '{}'::jsonb, null
  ) ->> 'idempotentReplay')::boolean, true, 'create replay returns the prior result');
select is((select count(*)::integer from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000001'), 1,
  'create replay does not duplicate the record');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001', 'CREATE', null,
    '71000000-0000-4000-8000-000000000001', 'different-hash', '{}'::jsonb, null)
$$, 'P0001', 'IDEMPOTENCY_CONFLICT', 'same operation with a different payload conflicts');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000010', 'CREATE', null,
    '71000000-0000-4000-8000-000000000010', 'zero',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":0,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:00:00Z"}', null)
$$, 'P0001', 'PERSONAL_PAYMENT_AMOUNT_INVALID', 'amount must be positive');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000011', 'CREATE', null,
    '71000000-0000-4000-8000-000000000011', 'self',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000001","direction":"PAID","amountMinor":1,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:00:00Z"}', null)
$$, 'P0001', 'PERSONAL_PAYMENT_SELF_COUNTERPARTY', 'self-counterparty is rejected');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000012', 'CREATE', null,
    '71000000-0000-4000-8000-000000000012', 'cross',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000004","direction":"PAID","amountMinor":1,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:00:00Z"}', null)
$$, 'P0001', 'PERSONAL_PAYMENT_COUNTERPARTY_INVALID', 'cross-Journey counterparty is rejected');

select lives_ok($$
  select public.ledger_finalize_settlement_7_1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', '2026-09-22T00:00:00Z',
    repeat('d', 64), (select value from phase1a_source_before), '[]'::jsonb,
    (select jsonb_agg(member || jsonb_build_object(
      'paidMinor', 0, 'owedMinor', 0, 'netMinor', 0
    )) from phase1a_source_before, jsonb_array_elements(value -> 'members') member),
    '[]'::jsonb, 'phase1a-final', 'phase1a-final'
  )
$$, 'fixture finalizes after the pre-final personal record');

create temporary table phase1a_canonical_before as
select jsonb_build_object(
  'settlements', (select jsonb_agg(to_jsonb(x) order by x.id) from public.settlements x),
  'inputs', (select jsonb_agg(to_jsonb(x) order by x.settlement_id, x.expense_id) from public.settlement_inputs x),
  'balances', (select jsonb_agg(to_jsonb(x) order by x.settlement_id, x.member_id) from public.settlement_member_balances x),
  'transfers', (select jsonb_agg(to_jsonb(x) order by x.id) from public.settlement_transfers x)
) value;
create temporary table phase1a_legacy_before as
select (select count(*) from public.settlement_payments) payments,
       (select count(*) from public.settlement_payment_discharges) discharges;

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'CREATE', null,
    '71000000-0000-4000-8000-000000000002', 'received-95',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000001","direction":"RECEIVED","amountMinor":95,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:01:00Z"}', null)
$$, 'counterparty can independently create a post-final RECEIVED assertion');
select is((select count(*)::integer from public.personal_settlement_payment_records
  where id in ('70000000-0000-4000-8000-000000000001',
               '70000000-0000-4000-8000-000000000002')), 2,
  'both sides retain independent records');
select ok((select count(distinct amount_minor) = 2 from public.personal_settlement_payment_records
  where id in ('70000000-0000-4000-8000-000000000001',
               '70000000-0000-4000-8000-000000000002')),
  'the two sides may record different values');
select is((select owner_user_id::text from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000002'),
  '00000000-0000-4000-8000-000000000002', 'RECEIVED record stays owned by its actor');
select ok((select recorded_equivalent_minor is null and reference_rate_decimal is null
  from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000002'),
  'no equivalent and no FX reference are valid');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000003', 'CREATE', null,
    '71000000-0000-4000-8000-000000000003', 'equivalent',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":30000,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:02:00Z","recordedEquivalentMinor":8549,"recordedEquivalentCurrency":"CNY","recordedEquivalentScale":0,"referenceRateDecimal":"4.120000000000000000","referenceRateDate":"2026-09-19","referenceSource":"ECB cache","referenceProvenance":{"quoteId":"quote-1"}}', null)
$$, 'optional equivalent and informational reference metadata are accepted');
select is((select recorded_equivalent_minor from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000003'), null::bigint,
  'deprecated client equivalent is ignored');
select is((select reference_rate_decimal::text from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000003'), null::text,
  'deprecated client reference rate is ignored');
select isnt((select recorded_equivalent_minor from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000003'), 123600::bigint,
  'reference metadata never recalculates the recorded equivalent');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000004', 'CREATE', null,
    '71000000-0000-4000-8000-000000000004', 'advance',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000002","direction":"PAID","amountMinor":999999999,"currency":"JPY","scale":0,"occurredAt":"2026-09-20T10:03:00Z"}', null)
$$, 'advance and overpayment-sized assertions are not capped by a transfer');
select ok((select count(*) >= 3 from public.ledger_list_personal_settlement_payments_1a(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001')),
  'owner can read their records');
select ok((select count(*) >= 1 from public.ledger_list_personal_settlement_payments_1a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001') where id = '70000000-0000-4000-8000-000000000001'),
  'named counterparty can read the other side record');
select ok((select count(*) >= 1 from public.ledger_list_personal_settlement_payments_1a(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001') where id = '70000000-0000-4000-8000-000000000002'),
  'current organizer has Journey-level audit visibility');
select is((select count(*)::integer from public.ledger_list_personal_settlement_payments_1a(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001') where id = '70000000-0000-4000-8000-000000000001'),
  0, 'unrelated member cannot read a personal record');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001', 'UPDATE', 1,
    '71000000-0000-4000-8000-000000000020', 'counterparty-edit', '{}', null)
$$, 'P0001', 'PERSONAL_PAYMENT_WRITE_FORBIDDEN', 'counterparty cannot edit owner record');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'UPDATE', 1,
    '71000000-0000-4000-8000-000000000021', 'organizer-edit', '{}', null)
$$, 'P0001', 'PERSONAL_PAYMENT_WRITE_FORBIDDEN', 'organizer cannot impersonate record owner');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'UPDATE', 1,
    '71000000-0000-4000-8000-000000000022', 'received-97',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000001","direction":"RECEIVED","amountMinor":97,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:01:00Z","note":"bank fee"}', 'corrected my record')
$$, 'owner can update their own record');
select is((select revision from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000002'), 2::bigint,
  'owner update increments revision');
select ok((select recorded_equivalent_minor is null and reference_source is null
  from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000002'),
  'optional equivalent/reference fields remain nullable on update');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'UPDATE', 1,
    '71000000-0000-4000-8000-000000000023', 'stale-update',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000001","direction":"RECEIVED","amountMinor":98,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:01:00Z"}', null)
$$, 'P0001', 'REVISION_CONFLICT', 'stale update is rejected deterministically');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'DELETE', 1,
    '71000000-0000-4000-8000-000000000024', 'stale-delete', '{}'::jsonb, null)
$$, 'P0001', 'REVISION_CONFLICT', 'stale delete is rejected deterministically');
select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'DELETE', 2,
    '71000000-0000-4000-8000-000000000025', 'delete-own', '{}'::jsonb, null)
$$, 'owner can soft-delete their own record');
select ok((select deleted_at is not null and revision = 3
  from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000002'),
  'soft delete preserves the row and increments revision');
select is((select count(*)::integer from public.ledger_changes
  where entity_type = 'PERSONAL_SETTLEMENT_PAYMENT'
    and entity_id = '70000000-0000-4000-8000-000000000002'
    and revision = 3 and is_tombstone), 1, 'soft delete emits a tombstone');
select is((public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002', 'DELETE', 2,
    '71000000-0000-4000-8000-000000000025', 'delete-own', '{}'::jsonb, null
  ) ->> 'idempotentReplay')::boolean, true, 'delete replay is safe');
select is((select count(*)::integer from public.personal_settlement_payment_audit_events
  where record_id = '70000000-0000-4000-8000-000000000002'), 3,
  'create, update and delete retain three audit snapshots');
select throws_ok($$
  update public.personal_settlement_payment_audit_events set reason = 'rewrite'
  where record_id = '70000000-0000-4000-8000-000000000002'
$$, '23514', 'personal_settlement_payment_audit_events is append-only',
  'audit history cannot be rewritten');

select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000006', 'CREATE', null,
    '71000000-0000-4000-8000-000000000006', 'attachment-owner',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000001","direction":"PAID","amountMinor":25,"currency":"NZD","scale":2,"occurredAt":"2026-09-20T10:04:00Z"}', null)
$$, 'linked owner can create the record used for attachment-removal authorization');

insert into public.receipt_assets (
  id, journey_id, local_id, created_by, object_path, mime_type, size_bytes, sha256
) values (
  '72000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 'phase1a-asset',
  '00000000-0000-4000-8000-000000000001',
  'phase1a/asset.png', 'image/png', 10, repeat('a', 64)
), (
  '72000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 'phase1a-member-asset',
  '00000000-0000-4000-8000-000000000002',
  'phase1a/member-asset.png', 'image/png', 10, repeat('b', 64)
);
select lives_ok($$
  insert into public.personal_settlement_payment_attachments (
    id, journey_id, record_id, asset_id, created_by_user_id, last_operation_id
  ) values (
    '73000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000030')
$$, 'attachment metadata can link to the existing private asset model');
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payment_attachments_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001')), 1,
  'counterparty can read authorized attachment metadata');
select throws_ok($$
  insert into public.personal_settlement_payment_attachments (
    id, journey_id, record_id, asset_id, created_by_user_id, last_operation_id
  ) values (
    '73000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000031')
$$, '23505', 'duplicate key value violates unique constraint "personal_settlement_payment_attachments_active_idx"',
  'one active link per record and asset is enforced');
select lives_ok($$
  update public.personal_settlement_payment_attachments
  set deleted_at = now(), revision = revision + 1,
      last_operation_id = '71000000-0000-4000-8000-000000000033'
  where id = '73000000-0000-4000-8000-000000000001'
$$, 'the current owner can soft-delete an attachment link');
select is((select count(*)::integer
  from public.personal_settlement_payment_attachments
  where id = '73000000-0000-4000-8000-000000000001' and deleted_at is not null), 1,
  'attachment removal preserves the auditable link tombstone');

select lives_ok($$
  update public.journey_members set status = 'unlinked'
  where trip_id = '10000000-0000-4000-8000-000000000001'
    and user_id = '00000000-0000-4000-8000-000000000002'
$$, 'membership can be removed without deleting financial history');
select ok((select count(*) >= 1 from public.ledger_list_personal_settlement_payments_1a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001')
  where id = '70000000-0000-4000-8000-000000000001'),
  'removed counterparty retains historical record read access');
select is((select count(*)::integer
  from public.ledger_list_personal_settlement_payment_attachments_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001')), 1,
  'removed counterparty retains historical attachment metadata access');
select throws_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000040', 'CREATE', null,
    '71000000-0000-4000-8000-000000000040', 'removed-write',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000001","direction":"PAID","amountMinor":1,"currency":"NZD","scale":2,"occurredAt":"2026-09-21T00:00:00Z"}', null)
$$, 'P0001', 'TRIP_WRITE_FORBIDDEN', 'membership removal revokes future writes');
select throws_ok($$
  insert into public.personal_settlement_payment_attachments (
    id, journey_id, record_id, asset_id, created_by_user_id, last_operation_id
  ) values (
    '73000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000032')
$$, 'P0001', 'PERSONAL_PAYMENT_ATTACHMENT_INVALID',
  'membership removal revokes new attachment links');
select lives_ok($$
  select public.ledger_mutate_personal_settlement_payment_1a(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000005', 'CREATE', null,
    '71000000-0000-4000-8000-000000000005', 'later-unrelated',
    '{"counterpartyMemberId":"12000000-0000-4000-8000-000000000003","direction":"PAID","amountMinor":50,"currency":"NZD","scale":2,"occurredAt":"2026-09-21T00:01:00Z"}', null)
$$, 'a current member can create a later unrelated record');
select is((select count(*)::integer from public.ledger_list_personal_settlement_payments_1a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001')
  where id = '70000000-0000-4000-8000-000000000005'), 0,
  'historical grants do not expose later unrelated Journey records');
select ok((select count(*) >= 1 from public.ledger_list_personal_settlement_payment_changes_1a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 0, 500)
  where entity_id = '70000000-0000-4000-8000-000000000002' and is_tombstone),
  'authorized change projection includes the soft-delete tombstone');
select is((select count(*)::integer from public.ledger_list_personal_settlement_payment_changes_1a(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 0, 500)
  where entity_id = '70000000-0000-4000-8000-000000000005'), 0,
  'historical change projection excludes later unrelated records');

select is(
  jsonb_build_object(
    'settlements', (select jsonb_agg(to_jsonb(x) order by x.id) from public.settlements x),
    'inputs', (select jsonb_agg(to_jsonb(x) order by x.settlement_id, x.expense_id) from public.settlement_inputs x),
    'balances', (select jsonb_agg(to_jsonb(x) order by x.settlement_id, x.member_id) from public.settlement_member_balances x),
    'transfers', (select jsonb_agg(to_jsonb(x) order by x.id) from public.settlement_transfers x)
  ),
  (select value from phase1a_canonical_before),
  'post-final personal mutations leave canonical balances, transfers and history byte-stable'
);
select is((select input_digest from public.settlements
  where journey_id = '10000000-0000-4000-8000-000000000001'), repeat('d', 64),
  'final input digest remains unchanged');
select is((select count(*) from public.settlement_payments),
  (select payments from phase1a_legacy_before), 'legacy Payment rows are untouched');
select is((select count(*) from public.settlement_payment_discharges),
  (select discharges from phase1a_legacy_before), 'legacy discharge rows are untouched');
select ok(exists(
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'expenses' and t.tgname = 'expenses_finalized_input_guard'
    and not t.tgisinternal
), 'Phase 0.5 finalized Expense protection trigger remains installed');
select is((select count(*)::integer from pg_policies
  where schemaname = 'public' and tablename like 'personal_settlement_payment%'),
  0, 'Phase 1A tables expose no direct authenticated RLS policy');
select ok(not has_table_privilege('authenticated',
  'public.personal_settlement_payment_read_grants', 'SELECT'),
  'authenticated clients cannot inspect historical grant rows');
select ok((select created_by_user_id = owner_user_id and updated_by_user_id = owner_user_id
  from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000001'),
  'actor provenance is recorded without client-supplied ownership');
select ok((select reference_rate_decimal is null and recorded_equivalent_minor is null
  from public.personal_settlement_payment_records
  where id = '70000000-0000-4000-8000-000000000005'),
  'reference and equivalent metadata remain optional');
select is((select count(*)::integer from public.ledger_changes
  where entity_type = 'PERSONAL_SETTLEMENT_PAYMENT_ATTACHMENT'
    and entity_id = '73000000-0000-4000-8000-000000000001'),
  2, 'attachment link and soft-delete emit change-feed events');

select * from finish();
rollback;
