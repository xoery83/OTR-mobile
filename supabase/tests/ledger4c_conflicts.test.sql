begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(27);
set local role service_role;

insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values
  ('12000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', 'Synthetic Owner', 'owner', 'linked', now()),
  ('12000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002', 'Synthetic Member', 'group_member', 'linked', now())
on conflict (trip_id, user_id) do update set status = 'linked';

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values (
  '45000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  '4C seed dinner', '2026-01-10 18:00:00+00', 1200, 'NZD', 2, 'ACCEPTED'
);
insert into public.expense_participants (
  expense_id, journey_id, member_id, display_name_snapshot, display_order
) values (
  '45000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'Synthetic Member', 0
);
insert into public.expense_splits (
  expense_id, journey_id, member_id, split_method, original_amount_minor,
  settlement_amount_minor
) values (
  '45000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002', 'EQUAL_PERSON', 1200, 1200
);
insert into public.settlement_valuation_snapshots (
  id, expense_id, journey_id, expense_revision, policy,
  original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale, is_active
) values (
  '46000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', 1, 'SAME_CURRENCY',
  1200, 'NZD', 2, 1200, 'NZD', 2, true
);

select lives_ok($$
  select public.ledger_record_conflict_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE', 'conflict-one', 'conflict-hash-one',
    '{"error":{"code":"REVISION_CONFLICT","conflictId":"00000000-0000-4000-8000-000000000000","expenseId":"45000000-0000-4000-8000-000000000001","baseRevision":0,"currentRevision":1,"submitted":{},"current":{},"changedGroups":["FINANCIAL_CORE"],"auditSummaries":[]}}'
  )
$$, 'stale conflict envelope is persisted');

select is(
  (select response_body #>> '{error,conflictId}' from public.ledger_idempotency_keys
    where idempotency_key = 'conflict-one'),
  (select public.ledger_record_conflict_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE', 'conflict-one', 'conflict-hash-one', '{}'::jsonb
  ) #>> '{error,conflictId}'),
  'conflict replay returns the immutable envelope id'
);

select lives_ok($$
  select public.ledger_resolve_expense_conflict_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    (select id from public.ledger_idempotency_keys where idempotency_key = 'conflict-one'),
    1, 'KEEP_JOURNEY', '{"FINANCIAL_CORE":"JOURNEY"}', 'Reviewed Journey version',
    'keep-journey', 'keep-journey-hash',
    '{"entity":{"id":"45000000-0000-4000-8000-000000000001"},"serverId":"45000000-0000-4000-8000-000000000001","revision":1,"updatedAt":"2026-01-10T18:00:00Z","idempotentReplay":false}'
  )
$$, 'Keep Journey resolves explicitly');
select is((select revision::integer from public.expenses where id = '45000000-0000-4000-8000-000000000001'), 1,
  'Keep Journey does not create a no-op Expense revision');
select is((select count(*)::integer from public.expense_audit_events
  where expense_id = '45000000-0000-4000-8000-000000000001' and event_type = 'CONFLICT_RESOLVED'), 1,
  'Keep Journey creates canonical resolution history');

select lives_ok($$
  select public.ledger_record_conflict_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE', 'conflict-two', 'conflict-hash-two',
    '{"error":{"code":"REVISION_CONFLICT","conflictId":"00000000-0000-4000-8000-000000000000","expenseId":"45000000-0000-4000-8000-000000000001","baseRevision":0,"currentRevision":1,"submitted":{},"current":{},"changedGroups":["DESCRIPTIVE"],"auditSummaries":[]}}'
  )
$$, 'a later conflict is a distinct envelope');

select lives_ok($$
  select public.ledger_resolve_expense_conflict_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    (select id from public.ledger_idempotency_keys where idempotency_key = 'conflict-two'),
    1, 'KEEP_MINE', '{"DESCRIPTIVE":"SUBMITTED"}', 'Keep submitted title',
    'keep-mine', 'keep-mine-hash',
    '{
      "entity":{"id":"45000000-0000-4000-8000-000000000001","journeyId":"10000000-0000-4000-8000-000000000001","creatorMemberId":"12000000-0000-4000-8000-000000000002","payerMemberId":"12000000-0000-4000-8000-000000000002","title":"4C resolved dinner","description":null,"category":"food","occurredAt":"2026-01-10T18:00:00Z","original":{"minor":1200,"currency":"NZD","scale":2},"businessStatus":"ACCEPTED","revision":2,"deletedAt":null,"createdAt":"2026-01-10T18:00:00Z","updatedAt":"2026-01-10T18:01:00Z","participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Synthetic Member","householdIdSnapshot":null}],"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":1200,"settlementMinor":1200,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],"valuation":{"id":"46000000-0000-4000-8000-000000000002","policy":"SAME_CURRENCY","original":{"minor":1200,"currency":"NZD","scale":2},"settlement":{"minor":1200,"currency":"NZD","scale":2},"rateSnapshotId":null,"paymentRecordId":null,"reason":null},"paymentRecords":[],"auditEvents":[{"id":"47000000-0000-4000-8000-000000000001","expenseId":"45000000-0000-4000-8000-000000000001","actorUserId":"00000000-0000-4000-8000-000000000002","actorMemberId":null,"eventType":"CONFLICT_RESOLVED","reason":"Keep submitted title","changedGroups":["DESCRIPTIVE"],"revision":2,"createdAt":"2026-01-10T18:01:00Z"}]},
      "serverId":"45000000-0000-4000-8000-000000000001","revision":2,"updatedAt":"2026-01-10T18:01:00Z","idempotentReplay":false
    }'
  )
$$, 'Keep Mine creates a validated Expense revision');
select is((select revision::integer from public.expenses where id = '45000000-0000-4000-8000-000000000001'), 2,
  'Keep Mine increments Expense revision once');
select is((select title from public.expenses where id = '45000000-0000-4000-8000-000000000001'), '4C resolved dinner',
  'Keep Mine applies the submitted aggregate');

select lives_ok($$
  select public.ledger_propose_correction_4c(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000001', 2,
    '{"title":"Suggested dinner"}', 'Please correct title', '{DESCRIPTIVE}',
    'propose-one', 'propose-one-hash',
    '{"correction":{"id":"48000000-0000-4000-8000-000000000001","status":"OPEN","requestedByMemberId":"00000000-0000-4000-8000-000000000000"},"expense":null,"idempotentReplay":false}'
  )
$$, 'ordinary proposal uses a separate command');
select is((select status from public.expense_correction_requests where id = '48000000-0000-4000-8000-000000000001'), 'OPEN',
  'current proposal is OPEN');
select is((select revision::integer from public.expenses where id = '45000000-0000-4000-8000-000000000001'), 2,
  'proposal does not mutate canonical Expense');

select lives_ok($$
  select public.ledger_transition_correction_4c(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000001', 'WITHDRAW', 1, null,
    'withdraw-one', 'withdraw-one-hash',
    '{"correction":{"status":"OPEN","revision":1},"expense":null,"idempotentReplay":false}'
  )
$$, 'proposer may withdraw an open correction');
select is((select status from public.expense_correction_requests where id = '48000000-0000-4000-8000-000000000001'), 'WITHDRAWN',
  'withdrawal is terminal');

select lives_ok($$
  select public.ledger_propose_correction_4c(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002', 1,
    '{"title":"Old suggestion"}', 'Offline old proposal', '{DESCRIPTIVE}',
    'propose-stale', 'propose-stale-hash',
    '{"correction":{"id":"48000000-0000-4000-8000-000000000002","status":"OPEN","requestedByMemberId":"00000000-0000-4000-8000-000000000000"},"expense":null,"idempotentReplay":false}'
  )
$$, 'offline stale proposal remains durable');
select is((select status from public.expense_correction_requests where id = '48000000-0000-4000-8000-000000000002'), 'STALE',
  'proposal arriving against an old Expense revision becomes STALE');

select lives_ok($$
  select public.ledger_propose_correction_4c(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000003', 2,
    '{"title":"Accepted correction","description":null,"category":"food","occurredAt":"2026-01-10T18:00:00Z","payerMemberId":"12000000-0000-4000-8000-000000000002","original":{"minor":1200,"currency":"NZD","scale":2},"businessStatus":"ACCEPTED","participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Synthetic Member","householdIdSnapshot":null}],"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":1200,"settlementMinor":1200,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],"valuation":{"policy":"SAME_CURRENCY","original":{"minor":1200,"currency":"NZD","scale":2},"settlement":{"minor":1200,"currency":"NZD","scale":2},"rateSnapshotId":null,"paymentRecordId":null,"reason":null}}',
    'Use the corrected title', '{DESCRIPTIVE}',
    'propose-accept', 'propose-accept-hash',
    '{"correction":{"status":"OPEN","requestedByMemberId":"00000000-0000-4000-8000-000000000000"},"expense":null,"idempotentReplay":false}'
  )
$$, 'a complete Stage 4 correction can be proposed');

select lives_ok($$
  select public.ledger_accept_correction_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000003', 1, 'Accepted after review',
    'accept-one', 'accept-one-hash',
    '{"correction":{"status":"OPEN","revision":1},"expense":null,"idempotentReplay":false}',
    '{
      "entity":{"id":"45000000-0000-4000-8000-000000000001","journeyId":"10000000-0000-4000-8000-000000000001","creatorMemberId":"12000000-0000-4000-8000-000000000002","payerMemberId":"12000000-0000-4000-8000-000000000002","title":"Accepted correction","description":null,"category":"food","occurredAt":"2026-01-10T18:00:00Z","original":{"minor":1200,"currency":"NZD","scale":2},"businessStatus":"ACCEPTED","revision":3,"deletedAt":null,"createdAt":"2026-01-10T18:00:00Z","updatedAt":"2026-01-10T18:02:00Z","participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Synthetic Member","householdIdSnapshot":null}],"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":1200,"settlementMinor":1200,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],"valuation":{"id":"46000000-0000-4000-8000-000000000003","policy":"SAME_CURRENCY","original":{"minor":1200,"currency":"NZD","scale":2},"settlement":{"minor":1200,"currency":"NZD","scale":2},"rateSnapshotId":null,"paymentRecordId":null,"reason":null},"paymentRecords":[],"auditEvents":[{"id":"47000000-0000-4000-8000-000000000002","expenseId":"45000000-0000-4000-8000-000000000001","actorUserId":"00000000-0000-4000-8000-000000000002","actorMemberId":null,"eventType":"CORRECTION_ACCEPTED","reason":"Accepted after review","changedGroups":["DESCRIPTIVE"],"revision":3,"createdAt":"2026-01-10T18:02:00Z"}]},
      "serverId":"45000000-0000-4000-8000-000000000001","revision":3,"updatedAt":"2026-01-10T18:02:00Z","idempotentReplay":false
    }'
  )
$$, 'creator can accept an open correction atomically');
select is((select status from public.expense_correction_requests where id = '48000000-0000-4000-8000-000000000003'), 'ACCEPTED',
  'accepted correction is terminal');
select is((select resulting_expense_revision::integer from public.expense_correction_requests where id = '48000000-0000-4000-8000-000000000003'), 3,
  'accepted correction records the resulting Expense revision');
select is((select revision::integer from public.expenses where id = '45000000-0000-4000-8000-000000000001'), 3,
  'accepting a correction increments Expense revision once');
select is((select title from public.expenses where id = '45000000-0000-4000-8000-000000000001'), 'Accepted correction',
  'accepted correction applies its complete proposed aggregate');
select is((select count(*)::integer from public.expense_audit_events
  where expense_id = '45000000-0000-4000-8000-000000000001' and event_type = 'CORRECTION_ACCEPTED'), 1,
  'accepted correction creates canonical audit');

select lives_ok($$
  select public.ledger_propose_correction_4c(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '45000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000004', 3,
    '{"title":"Rejected correction","description":null,"category":"food","occurredAt":"2026-01-10T18:00:00Z","payerMemberId":"12000000-0000-4000-8000-000000000002","original":{"minor":1200,"currency":"NZD","scale":2},"businessStatus":"ACCEPTED","participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Synthetic Member","householdIdSnapshot":null}],"splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":1200,"settlementMinor":1200,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],"valuation":null}',
    'This one should be rejected', '{DESCRIPTIVE}',
    'propose-reject', 'propose-reject-hash',
    '{"correction":{"status":"OPEN","requestedByMemberId":"00000000-0000-4000-8000-000000000000"},"expense":null,"idempotentReplay":false}'
  )
$$, 'another complete correction can be proposed');
select lives_ok($$
  select public.ledger_transition_correction_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000004', 'REJECT', 1, 'Not accurate',
    'reject-one', 'reject-one-hash',
    '{"correction":{"status":"OPEN","revision":1},"expense":null,"idempotentReplay":false}'
  )
$$, 'creator can reject an open correction');
select is((select status from public.expense_correction_requests where id = '48000000-0000-4000-8000-000000000004'), 'REJECTED',
  'rejected correction is terminal without mutating Expense');

select throws_ok($$
  select public.ledger_transition_correction_4c(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000001', 'REJECT', 2, null,
    'reject-withdrawn', 'reject-withdrawn-hash', '{}'
  )
$$, 'P0001', 'CORRECTION_NOT_OPEN', 'terminal correction cannot transition again');

rollback;
