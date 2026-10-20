begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

select is(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'public' and table_name in (
      'ledger_settings', 'households', 'household_members', 'expenses',
      'expense_participants', 'expense_splits', 'exchange_rate_snapshots',
      'payment_records', 'settlement_valuation_snapshots', 'expense_links',
      'expense_audit_events', 'expense_correction_requests', 'settlements',
      'settlement_inputs', 'settlement_member_balances', 'settlement_transfers',
      'settlement_payments', 'ledger_review_findings', 'ledger_idempotency_keys',
      'ledger_changes', 'expense_conflict_resolutions', 'ledger_rate_quotes',
      'settlement_audit_events', 'ledger_review_finding_actions'
    )),
  24,
  'all Ledger 2 tables exist'
);

select is(
  (select count(*)::integer from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'ledger_settings', 'households', 'household_members', 'expenses',
      'expense_participants', 'expense_splits', 'exchange_rate_snapshots',
      'payment_records', 'settlement_valuation_snapshots', 'expense_links',
      'expense_audit_events', 'expense_correction_requests', 'settlements',
      'settlement_inputs', 'settlement_member_balances', 'settlement_transfers',
      'settlement_payments', 'ledger_review_findings', 'ledger_idempotency_keys',
      'ledger_changes', 'expense_conflict_resolutions', 'ledger_rate_quotes',
      'settlement_audit_events', 'ledger_review_finding_actions'
    ) and c.relrowsecurity and c.relforcerowsecurity),
  24,
  'all Ledger 2 tables enable and force RLS'
);

select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename like any (array[
      'ledger_settings', 'households', 'household_members', 'expenses',
      'expense_participants', 'expense_splits', 'exchange_rate_snapshots',
      'payment_records', 'settlement_valuation_snapshots', 'expense_links',
      'expense_audit_events', 'expense_correction_requests', 'settlements',
      'settlement_inputs', 'settlement_member_balances', 'settlement_transfers',
      'settlement_payments', 'ledger_review_findings', 'ledger_idempotency_keys',
      'ledger_changes', 'expense_conflict_resolutions', 'ledger_rate_quotes',
      'settlement_audit_events', 'ledger_review_finding_actions'
    ])),
  0,
  'Ledger 2 exposes no direct user policies'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name in ('expenses', 'expense_splits', 'settlements', 'settlement_payments')),
  0,
  'user API roles have no Ledger 2 table grants'
);

select is(
  (select count(distinct table_name)::integer from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'service_role'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      and table_name in (
        'ledger_settings', 'households', 'household_members', 'expenses',
        'expense_participants', 'expense_splits', 'exchange_rate_snapshots',
        'payment_records', 'settlement_valuation_snapshots', 'expense_links',
        'expense_audit_events', 'expense_correction_requests', 'settlements',
        'settlement_inputs', 'settlement_member_balances', 'settlement_transfers',
        'settlement_payments', 'ledger_review_findings', 'ledger_idempotency_keys',
        'ledger_changes', 'expense_conflict_resolutions', 'ledger_rate_quotes',
        'settlement_audit_events', 'ledger_review_finding_actions'
      )),
  24,
  'service role has backend access to all Ledger 2 tables'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into public.expenses (
      journey_id, payer_member_id, title, occurred_at,
      original_amount_minor, original_currency, original_currency_scale
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000002',
      'Direct client write', now(), 100, 'NZD', 2
    )$$,
  '42501',
  'permission denied for table expenses',
  'authenticated clients cannot bypass the backend boundary'
);
reset role;

set local role service_role;

select lives_ok($$
  insert into public.ledger_settings (
    journey_id, settlement_currency, settlement_scale, valuation_policy
  ) values (
    '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
  );
  insert into public.expenses (
    id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
    payer_member_id, title, occurred_at, original_amount_minor,
    original_currency, original_currency_scale, business_status
  ) values (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000002',
    'Synthetic dinner', '2026-01-10 18:00:00+00', 10000, 'EUR', 2, 'ACCEPTED'
  );
  insert into public.expense_participants (
    expense_id, journey_id, member_id, display_name_snapshot, display_order
  ) values
    ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000002', 'Synthetic Member', 0),
    ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000003', 'Synthetic Guest', 1);
  insert into public.expense_splits (
    expense_id, journey_id, member_id, split_method,
    original_amount_minor, settlement_amount_minor
  ) values
    ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000002', 'EQUAL_PERSON', 5000, 9900),
    ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000003', 'EQUAL_PERSON', 5000, 9900);
  insert into public.settlement_valuation_snapshots (
    id, expense_id, journey_id, expense_revision, policy,
    original_amount_minor, original_currency, original_scale,
    settlement_amount_minor, settlement_currency, settlement_scale, reason
  ) values (
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 1, 'REFERENCE_RATE',
    10000, 'EUR', 2, 19800, 'NZD', 2, 'Synthetic reference valuation'
  );
  insert into public.payment_records (
    id, expense_id, journey_id, instrument_label,
    posted_amount_minor, posted_currency, posted_scale, posted_at
  ) values (
    '30000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'Test card',
    19943, 'NZD', 2, '2026-01-11 00:00:00+00'
  );
  insert into public.expense_audit_events (
    id, expense_id, journey_id, expense_revision, event_type,
    actor_user_id, actor_member_id, after_hash
  ) values (
    '30000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 1, 'CREATED',
    '00000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000002', 'synthetic-after-hash'
  );
  set constraints all immediate;
  set constraints all deferred;
$$, 'a valid Expense aggregate commits its invariants');

select is(
  (select original_amount_minor from public.expenses
    where id = '30000000-0000-4000-8000-000000000001'),
  10000::bigint,
  'merchant amount remains authoritative and unchanged'
);
select is(
  (select posted_amount_minor from public.payment_records
    where id = '30000000-0000-4000-8000-000000000003'),
  19943::bigint,
  'actual payer posted cost is stored independently'
);
select is(
  (select settlement_amount_minor from public.settlement_valuation_snapshots
    where id = '30000000-0000-4000-8000-000000000002'),
  19800::bigint,
  'group settlement valuation is stored independently'
);
select throws_ok(
  $$update public.payment_records set instrument_label = 'Changed'
    where id = '30000000-0000-4000-8000-000000000003'$$,
  '23514', 'payment_records is append-only',
  'payment evidence is immutable'
);
select throws_ok(
  $$update public.settlement_valuation_snapshots set reason = 'Changed'
    where id = '30000000-0000-4000-8000-000000000002'$$,
  '23514', 'Settlement valuation snapshots are append-only',
  'valuation evidence is immutable'
);
select lives_ok(
  $$update public.expenses set description = 'Documented correction'
    where id = '30000000-0000-4000-8000-000000000001'$$,
  'Expense metadata can be revised'
);
select is(
  (select revision from public.expenses
    where id = '30000000-0000-4000-8000-000000000001'),
  2::bigint,
  'Expense revision increments automatically'
);
select is(
  (select count(*)::integer from public.ledger_changes
    where entity_type = 'EXPENSE'
      and entity_id = '30000000-0000-4000-8000-000000000001'),
  2,
  'Expense revisions produce durable change-feed entries'
);

insert into public.expenses (
  id, journey_id, payer_member_id, title, occurred_at,
  original_amount_minor, original_currency, original_currency_scale, business_status
) values (
  '30000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  'Invalid split', now(), 100, 'NZD', 2, 'ACCEPTED'
);
insert into public.expense_participants (
  expense_id, journey_id, member_id, display_name_snapshot
) values (
  '30000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'Synthetic Member'
);
insert into public.expense_splits (
  expense_id, journey_id, member_id, split_method,
  original_amount_minor, settlement_amount_minor
) values (
  '30000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'EXACT', 99, 99
);
insert into public.settlement_valuation_snapshots (
  id, expense_id, journey_id, expense_revision, policy,
  original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale
) values (
  '30000000-0000-4000-8000-000000000011',
  '30000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001', 1, 'SAME_CURRENCY',
  100, 'NZD', 2, 100, 'NZD', 2
);
select throws_ok(
  $$select public.ledger_validate_expense('30000000-0000-4000-8000-000000000010')$$,
  '23514', 'Expense original splits must reconcile',
  'an invalid split total is rejected'
);
update public.expenses set business_status = 'DRAFT'
where id = '30000000-0000-4000-8000-000000000010';

select throws_ok($$
  insert into public.households (id, journey_id, name) values (
    '30000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000001', 'Invalid household'
  );
  insert into public.household_members (household_id, journey_id, member_id) values (
    '30000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000099'
  );
  set constraints all immediate;
$$, '23503', null, 'unknown household member is rejected by referential integrity');

select lives_ok($$
  insert into public.settlements (
    id, journey_id, settlement_currency, settlement_scale, status,
    through_timestamp, input_digest, algorithm_version
  ) values (
    '30000000-0000-4000-8000-000000000030',
    '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'DRAFT',
    '2026-01-12 23:59:59+00', 'synthetic-input', 'v1'
  );
  insert into public.settlement_member_balances (
    settlement_id, journey_id, member_id, paid_minor, owed_minor, net_minor
  ) values
    ('30000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000002', 19800, 9900, 9900),
    ('30000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000003', 0, 9900, -9900);
  insert into public.settlement_transfers (
    id, settlement_id, journey_id, from_member_id, to_member_id,
    obligation_amount_minor, settlement_currency, settlement_scale
  ) values (
    '30000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000030',
    '10000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000003',
    '12000000-0000-4000-8000-000000000002', 9900, 'NZD', 2
  );
  update public.settlements set status = 'FINALIZED',
    finalized_by = '00000000-0000-4000-8000-000000000001', finalized_at = now()
  where id = '30000000-0000-4000-8000-000000000030';
  set constraints all immediate;
  set constraints all deferred;
$$, 'a zero-net finalized Settlement is valid');
select is(
  (select sum(net_minor) from public.settlement_member_balances
    where settlement_id = '30000000-0000-4000-8000-000000000030'),
  0::numeric,
  'finalized member balances net exactly to zero'
);

insert into public.settlement_payments (
  id, transfer_id, journey_id, payment_amount_minor, payment_currency,
  payment_scale, asserted_discharge_amount_minor, settlement_currency,
  settlement_scale, status, reported_by, paid_at, confirmed_by, confirmed_at
) values (
  '30000000-0000-4000-8000-000000000032',
  '30000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000001', 10000, 'NZD', 2, 10000,
  'NZD', 2, 'CONFIRMED', '00000000-0000-4000-8000-000000000003', now(),
  '00000000-0000-4000-8000-000000000002', now()
);
insert into public.settlement_payment_discharges (
  id, payment_id, transfer_id, journey_id, amount_minor, settlement_currency,
  settlement_scale, confirmation_authority, confirmed_by_user_id,
  confirmed_by_member_id
) values (
  '30000000-0000-4000-8000-000000000033',
  '30000000-0000-4000-8000-000000000032',
  '30000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000001', 10000, 'NZD', 2, 'RECIPIENT',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002'
);
select throws_ok(
  $$select public.ledger_validate_settlement('30000000-0000-4000-8000-000000000030')$$,
  '23514', 'TRANSFER_OVERPAYMENT',
  'confirmed partial payments cannot over-discharge a transfer'
);

insert into public.ledger_idempotency_keys (
  actor_user_id, journey_id, command_type, idempotency_key, payload_hash
) values (
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', 'CREATE_EXPENSE', 'op-1', 'hash-1'
);
select throws_ok(
  $$insert into public.ledger_idempotency_keys (
      actor_user_id, journey_id, command_type, idempotency_key, payload_hash
    ) values (
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001', 'CREATE_EXPENSE', 'op-1', 'hash-1'
    )$$,
  '23505',
  'duplicate key value violates unique constraint "ledger_idempotency_keys_actor_user_id_journey_id_command_ty_key"',
  'an idempotency key cannot create a duplicate command result'
);

select is(
  (select count(*)::integer from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and c.relname in ('expenses', 'expense_participants', 'expense_splits',
        'settlement_valuation_snapshots')
      and t.tgname like '%validate_deferred'),
  4,
  'Expense aggregate validation is attached to every mutable aggregate table'
);
select is(
  (select count(*)::integer from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and c.relname in ('settlements', 'settlement_member_balances',
        'settlement_transfers', 'settlement_payments')
      and t.tgname like '%validate_deferred'),
  4,
  'Settlement validation is attached to every mutable aggregate table'
);
select is(
  (select count(*)::integer from public.expense_audit_events
    where expense_id = '30000000-0000-4000-8000-000000000001'),
  1,
  'the Expense audit event is retained'
);
select is(
  (select count(*)::integer from public.expense_splits
    where expense_id = '30000000-0000-4000-8000-000000000001'),
  2,
  'the accepted Expense retains one exact split per participant'
);
select is(
  (select count(*)::integer from public.settlement_transfers
    where settlement_id = '30000000-0000-4000-8000-000000000030'),
  1,
  'the settlement stores an explainable transfer plan'
);

reset role;
select * from finish();
rollback;
