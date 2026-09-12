begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(31);

select is(public.ledger_currency_scale('EUR'), 2::smallint, 'EUR uses scale 2');
select is(public.ledger_currency_scale('JPY'), 0::smallint, 'JPY uses scale 0');
select is(public.ledger_currency_scale('BHD'), 3::smallint, 'BHD uses scale 3');
select is(public.ledger_currency_scale('ZZZ'), null::smallint, 'unknown currency is rejected');

set local role service_role;
select throws_ok(
  $$insert into public.ledger_settings (
    journey_id, settlement_currency, settlement_scale, valuation_policy
  ) values ('10000000-0000-4000-8000-000000000001', 'NZD', 3, 'REFERENCE_RATE')$$,
  '23514', null, 'ISO currency exponent is enforced'
);
insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values ('10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE');

select lives_ok($$
  insert into public.ledger_rate_quotes (
    id, journey_id, quote_currency, base_currency, decimal_rate,
    effective_date, observed_at, expires_at, provider, provider_reference
  ) values (
    '51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'EUR', 'NZD', 1.978,
    '2026-09-12', '2026-09-12T00:00:00Z', '2026-09-15T00:00:00Z',
    'stage5-test-provider', 'quote-1'
  )
$$, 'service role can maintain trusted rate candidates');
select ok(
  not has_table_privilege('authenticated', 'public.ledger_rate_quotes', 'INSERT'),
  'authenticated clients cannot write trusted rate candidates'
);

select lives_ok($$
  insert into public.expenses (
    id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
    payer_member_id, title, occurred_at, original_amount_minor,
    original_currency, original_currency_scale, business_status
  ) values (
    '52000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '12000000-0000-4000-8000-000000000002',
    'EUR merchant expense', '2026-09-12T00:00:00Z', 10000, 'EUR', 2, 'RATE_REQUIRED'
  );
  insert into public.expense_participants (
    expense_id, journey_id, member_id, display_name_snapshot, display_order
  ) values
    ('52000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'Member', 0),
    ('52000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'Owner', 1);
  insert into public.expense_splits (
    expense_id, journey_id, member_id, split_method, original_amount_minor,
    settlement_amount_minor, rounding_adjustment_minor
  ) values
    ('52000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'EQUAL_PERSON', 5000, null, 0),
    ('52000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'EQUAL_PERSON', 5000, null, 0)
$$, 'RATE_REQUIRED expense is valid without settlement values');

select lives_ok($$
  select public.ledger_add_payment_record_5_1(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    'payment-1', 'hash-payment-1',
    '{"instrumentLabel":"Visa NZ","authorization":null,"posted":{"minor":19943,"currency":"NZD","scale":2},"authorizedAt":null,"postedAt":"2026-09-12T01:00:00Z","fee":{"minor":200,"currency":"NZD","scale":2},"bankFxRate":"1.9943","source":"manual","notes":null,"supersedesPaymentRecordId":null}'::jsonb,
    '{"entity":{"id":"53000000-0000-4000-8000-000000000001"},"serverId":"53000000-0000-4000-8000-000000000001","revision":1,"updatedAt":"2026-09-12T01:00:00Z","idempotentReplay":false}'::jsonb
  )
$$, 'payer can append posted-cost evidence');
select is((select count(*)::integer from public.payment_records where expense_id = '52000000-0000-4000-8000-000000000001'), 1, 'payment evidence is stored once');
select is((select revision::integer from public.expenses where id = '52000000-0000-4000-8000-000000000001'), 1, 'payment evidence does not revise the expense');
select is((select business_status from public.expenses where id = '52000000-0000-4000-8000-000000000001'), 'RATE_REQUIRED', 'payment evidence does not resolve valuation');
select is(
  (select metadata ->> 'paymentRecordId' from public.expense_audit_events
   where event_type = 'PAYMENT_RECORD_ADDED' and expense_id = '52000000-0000-4000-8000-000000000001'),
  '53000000-0000-4000-8000-000000000001', 'payment audit links canonical evidence'
);

select lives_ok($$
  select public.ledger_apply_valuation_5_1(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    'valuation-reference', 'hash-reference',
    '{"baseRevision":1,"policy":"REFERENCE_RATE","rateQuoteId":"51000000-0000-4000-8000-000000000001","paymentRecordId":null,"manualRate":null,"reason":null,"previewSettlement":{"minor":19780,"currency":"NZD","scale":2}}'::jsonb,
    '{"id":"54000000-0000-4000-8000-000000000001","decimalRate":"1.978","effectiveDate":"2026-09-12","observedAt":"2026-09-12T00:00:00Z","provider":"stage5-test-provider","providerReference":"quote-1","stalenessState":"FRESH"}'::jsonb,
    '{"entity":{"valuation":{"id":"55000000-0000-4000-8000-000000000001","rateSnapshotId":"54000000-0000-4000-8000-000000000001","supersedesValuationId":null},"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","settlementMinor":9890},{"memberId":"12000000-0000-4000-8000-000000000003","settlementMinor":9890}],"auditEvents":[{"id":"56000000-0000-4000-8000-000000000001"}]},"serverId":"52000000-0000-4000-8000-000000000001","revision":2,"updatedAt":"2026-09-12T02:00:00Z","idempotentReplay":false}'::jsonb
  )
$$, 'explicit reference valuation resolves RATE_REQUIRED');
select is((select settlement_amount_minor::integer from public.settlement_valuation_snapshots where is_active and expense_id = '52000000-0000-4000-8000-000000000001'), 19780, 'reference group value is immutable evidence');
select is((select revision::integer from public.expenses where id = '52000000-0000-4000-8000-000000000001'), 2, 'valuation advances expense revision once');
select is((public.ledger_apply_valuation_5_1(
    '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001', 'valuation-reference', 'hash-reference',
    '{}'::jsonb, 'null'::jsonb, '{}'::jsonb
  ) ->> 'idempotentReplay')::boolean, true, 'valuation retry returns the original result');

update public.ledger_rate_quotes set decimal_rate = 2.1,
  observed_at = '2026-09-13T00:00:00Z', expires_at = '2026-09-16T00:00:00Z'
where id = '51000000-0000-4000-8000-000000000001';
select is((select settlement_amount_minor::integer from public.settlement_valuation_snapshots where is_active and expense_id = '52000000-0000-4000-8000-000000000001'), 19780, 'candidate refresh does not drift accepted value');
select is((select revision::integer from public.expenses where id = '52000000-0000-4000-8000-000000000001'), 2, 'candidate refresh does not revise expense');

select lives_ok($$
  select public.ledger_apply_valuation_5_1(
    '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001', 'valuation-actual', 'hash-actual',
    '{"baseRevision":2,"policy":"ACTUAL_PAYER_COST","rateQuoteId":null,"paymentRecordId":"53000000-0000-4000-8000-000000000001","manualRate":null,"reason":null,"previewSettlement":{"minor":19943,"currency":"NZD","scale":2}}'::jsonb,
    'null'::jsonb,
    '{"entity":{"valuation":{"id":"55000000-0000-4000-8000-000000000002","rateSnapshotId":null,"supersedesValuationId":"55000000-0000-4000-8000-000000000001"},"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","settlementMinor":9972},{"memberId":"12000000-0000-4000-8000-000000000003","settlementMinor":9971}],"auditEvents":[{"id":"56000000-0000-4000-8000-000000000002"}]},"serverId":"52000000-0000-4000-8000-000000000001","revision":3,"updatedAt":"2026-09-12T03:00:00Z","idempotentReplay":false}'::jsonb
  )
$$, 'actual payer cost is applied only by explicit valuation command');
select is(
  (select e.original_amount_minor::text || ':' || p.posted_amount_minor::text || ':' || v.settlement_amount_minor::text
   from public.expenses e join public.payment_records p on p.expense_id = e.id
   join public.settlement_valuation_snapshots v on v.expense_id = e.id and v.is_active
   where e.id = '52000000-0000-4000-8000-000000000001'),
  '10000:19943:19943', 'merchant, payer, and group facts remain separate'
);

select lives_ok($$
  select public.ledger_add_payment_record_5_1(
    '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001', 'payment-2', 'hash-payment-2',
    '{"instrumentLabel":"Visa NZ corrected","authorization":null,"posted":{"minor":20000,"currency":"NZD","scale":2},"authorizedAt":null,"postedAt":"2026-09-12T04:00:00Z","fee":null,"bankFxRate":null,"source":"manual","notes":"Corrected statement","supersedesPaymentRecordId":"53000000-0000-4000-8000-000000000001"}'::jsonb,
    '{"entity":{"id":"53000000-0000-4000-8000-000000000002"},"serverId":"53000000-0000-4000-8000-000000000002","revision":1,"updatedAt":"2026-09-12T04:00:00Z","idempotentReplay":false}'::jsonb
  )
$$, 'payment correction appends a superseding record');
select is((select count(*)::integer from public.payment_records where expense_id = '52000000-0000-4000-8000-000000000001'), 2, 'supersession preserves both payment records');
select is((select settlement_amount_minor::integer from public.settlement_valuation_snapshots where is_active and expense_id = '52000000-0000-4000-8000-000000000001'), 19943, 'new payment evidence never silently revalues group value');

select throws_ok(
  $$select public.ledger_apply_valuation_5_1(
    '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001', 'manual-no-reason', 'hash-manual-no-reason',
    '{"baseRevision":3,"policy":"MANUAL_AGREED","rateQuoteId":null,"paymentRecordId":null,"manualRate":"1.95","reason":null,"previewSettlement":{"minor":19500,"currency":"NZD","scale":2}}'::jsonb,
    'null'::jsonb, '{}'::jsonb)$$,
  'P0001', 'MANUAL_REASON_REQUIRED', 'manual valuation requires a reason'
);
select lives_ok($$
  select public.ledger_apply_valuation_5_1(
    '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001', 'manual-reason', 'hash-manual-reason',
    '{"baseRevision":3,"policy":"MANUAL_AGREED","rateQuoteId":null,"paymentRecordId":null,"manualRate":"1.95","reason":"Agreed by travellers","previewSettlement":{"minor":19500,"currency":"NZD","scale":2}}'::jsonb,
    '{"id":"54000000-0000-4000-8000-000000000002","decimalRate":"1.95","effectiveDate":"2026-09-12","observedAt":"2026-09-12T05:00:00Z","provider":"manual","providerReference":null,"stalenessState":"FRESH"}'::jsonb,
    '{"entity":{"valuation":{"id":"55000000-0000-4000-8000-000000000003","rateSnapshotId":"54000000-0000-4000-8000-000000000002","supersedesValuationId":"55000000-0000-4000-8000-000000000002"},"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","settlementMinor":9750},{"memberId":"12000000-0000-4000-8000-000000000003","settlementMinor":9750}],"auditEvents":[{"id":"56000000-0000-4000-8000-000000000003"}]},"serverId":"52000000-0000-4000-8000-000000000001","revision":4,"updatedAt":"2026-09-12T05:00:00Z","idempotentReplay":false}'::jsonb
  )
$$, 'manual valuation succeeds with preview and reason');
select is((select reason from public.expense_audit_events where id = '56000000-0000-4000-8000-000000000003'), 'Agreed by travellers', 'manual reason is canonical audit evidence');
select is(
  (select supersedes_rate_snapshot_id::text from public.exchange_rate_snapshots
   where id = '54000000-0000-4000-8000-000000000002'),
  '54000000-0000-4000-8000-000000000001', 'accepted rate snapshots preserve history'
);
select throws_ok(
  $$update public.payment_records set instrument_label = 'mutated' where id = '53000000-0000-4000-8000-000000000001'$$,
  '23514', 'payment_records is append-only', 'payment records are immutable'
);
select throws_ok(
  $$update public.settlement_valuation_snapshots set reason = 'mutated' where id = '55000000-0000-4000-8000-000000000003'$$,
  '23514', 'Settlement valuation snapshots are append-only', 'accepted valuations are immutable'
);
select throws_ok(
  $$select public.ledger_apply_valuation_5_1(
    '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001', 'stale-client', 'hash-stale-client',
    '{"baseRevision":3,"policy":"MANUAL_AGREED","rateQuoteId":null,"paymentRecordId":null,"manualRate":"2","reason":"Concurrent client","previewSettlement":{"minor":20000,"currency":"NZD","scale":2}}'::jsonb,
    'null'::jsonb, '{}'::jsonb)$$,
  'P0001', 'REVISION_CONFLICT', 'concurrent valuation uses the expense revision conflict boundary'
);

select * from finish();
rollback;
