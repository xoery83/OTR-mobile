begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

set local role service_role;

insert into public.journey_members (
  id, trip_id, user_id, display_name, role, status, linked_at
) values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Synthetic Owner',
  'owner',
  'linked',
  '2026-01-01 00:00:00+00'
) on conflict (trip_id, user_id) do nothing;

insert into public.expenses (
  id, journey_id, creator_member_id, created_by_user_id, updated_by_user_id,
  payer_member_id, title, occurred_at, original_amount_minor,
  original_currency, original_currency_scale, business_status
) values (
  '41000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000002',
  '4B seed dinner',
  '2026-01-10 18:00:00+00',
  1200,
  'NZD',
  2,
  'ACCEPTED'
);

insert into public.expense_participants (
  expense_id, journey_id, member_id, display_name_snapshot, display_order
) values (
  '41000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  'Synthetic Member',
  0
);

insert into public.expense_splits (
  expense_id, journey_id, member_id, split_method, original_amount_minor,
  settlement_amount_minor
) values (
  '41000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  'EQUAL_PERSON',
  1200,
  1200
);

insert into public.settlement_valuation_snapshots (
  id, expense_id, journey_id, expense_revision, policy,
  original_amount_minor, original_currency, original_scale,
  settlement_amount_minor, settlement_currency, settlement_scale, is_active
) values (
  '42000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  1,
  'SAME_CURRENCY',
  1200,
  'NZD',
  2,
  1200,
  'NZD',
  2,
  true
);

select lives_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE',
    1,
    null,
    'creator-edit-hash',
    'creator-edit-key',
    '{
      "entity":{
        "id":"41000000-0000-4000-8000-000000000001",
        "journeyId":"10000000-0000-4000-8000-000000000001",
        "creatorMemberId":"12000000-0000-4000-8000-000000000002",
        "payerMemberId":"12000000-0000-4000-8000-000000000002",
        "title":"Creator edited dinner",
        "description":null,
        "category":"food",
        "occurredAt":"2026-01-10T18:00:00.000Z",
        "original":{"minor":1200,"currency":"NZD","scale":2},
        "businessStatus":"ACCEPTED",
        "revision":2,
        "deletedAt":null,
        "createdAt":"2026-01-10T18:00:00.000Z",
        "updatedAt":"2026-01-10T18:01:00.000Z",
        "participants":[{"memberId":"12000000-0000-4000-8000-000000000002","displayNameSnapshot":"Synthetic Member","householdIdSnapshot":null}],
        "splits":[{"memberId":"12000000-0000-4000-8000-000000000002","method":"EQUAL_PERSON","originalMinor":1200,"settlementMinor":1200,"weightUnits":null,"percentageUnits":null,"roundingAdjustmentMinor":0}],
        "valuation":{"id":"42000000-0000-4000-8000-000000000002","policy":"SAME_CURRENCY","original":{"minor":1200,"currency":"NZD","scale":2},"settlement":{"minor":1200,"currency":"NZD","scale":2},"rateSnapshotId":null,"paymentRecordId":null,"reason":null},
        "paymentRecords":[],
        "auditEvents":[{"id":"43000000-0000-4000-8000-000000000002","expenseId":"41000000-0000-4000-8000-000000000001","actorUserId":"00000000-0000-4000-8000-000000000002","actorMemberId":null,"eventType":"EDITED","reason":null,"changedGroups":["FINANCIAL_CORE","DESCRIPTIVE"],"revision":2,"createdAt":"2026-01-10T18:01:00.000Z"}]
      },
      "serverId":"41000000-0000-4000-8000-000000000001",
      "revision":2,
      "updatedAt":"2026-01-10T18:01:00.000Z",
      "idempotentReplay":false
    }'::jsonb
  )
$$, 'creator can edit own expense without override reason');

select throws_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE',
    2,
    null,
    'organizer-missing-reason-hash',
    'organizer-missing-reason-key',
    jsonb_set((select response_body from public.ledger_idempotency_keys where idempotency_key = 'creator-edit-key'), '{entity,auditEvents,0,id}', '"43000000-0000-4000-8000-000000000003"')
  )
$$, 'P0001', 'ORGANIZER_REASON_REQUIRED', 'organizer override without reason is rejected');

select lives_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE',
    2,
    'Organizer corrected receipt',
    'organizer-edit-hash',
    'organizer-edit-key',
    jsonb_set(
      jsonb_set(
        jsonb_set((select response_body from public.ledger_idempotency_keys where idempotency_key = 'creator-edit-key'), '{entity,revision}', '3'),
        '{entity,auditEvents,0,id}', '"43000000-0000-4000-8000-000000000004"'
      ),
      '{entity,valuation,id}', '"42000000-0000-4000-8000-000000000003"'
    )
  )
$$, 'organizer can edit another member expense with reason');

select is(
  (select reason from public.expense_audit_events
    where expense_id = '41000000-0000-4000-8000-000000000001'
      and expense_revision = 3),
  'Organizer corrected receipt',
  'organizer reason is recorded in canonical audit'
);

select throws_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'UPDATE_EXPENSE',
    2,
    null,
    'stale-hash',
    'stale-key',
    (select response_body from public.ledger_idempotency_keys where idempotency_key = 'organizer-edit-key')
  )
$$, 'P0001', 'REVISION_CONFLICT', 'stale base revision is rejected');

select lives_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'DELETE_EXPENSE',
    3,
    'Organizer deleted duplicate',
    'delete-hash',
    'delete-key',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set((select response_body from public.ledger_idempotency_keys where idempotency_key = 'organizer-edit-key'), '{entity,businessStatus}', '"DELETED"'),
          '{entity,deletedAt}', '"2026-01-10T18:03:00.000Z"'
        ),
        '{entity,auditEvents,0,id}', '"43000000-0000-4000-8000-000000000005"'
      ),
      '{entity,auditEvents,0,eventType}', '"DELETED"'
    )
  )
$$, 'organizer tombstone with reason succeeds');

select is(
  (select business_status from public.expenses
    where id = '41000000-0000-4000-8000-000000000001'),
  'DELETED',
  'delete is a tombstone'
);

select lives_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'RESTORE_EXPENSE',
    4,
    'Organizer restored duplicate',
    'restore-hash',
    'restore-key',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set((select response_body from public.ledger_idempotency_keys where idempotency_key = 'delete-key'), '{entity,businessStatus}', '"ACCEPTED"'),
          '{entity,deletedAt}', 'null'
        ),
        '{entity,auditEvents,0,id}', '"43000000-0000-4000-8000-000000000006"'
      ),
      '{entity,auditEvents,0,eventType}', '"RESTORED"'
    )
  )
$$, 'organizer restore with reason succeeds');

insert into public.settlements (
  id, journey_id, settlement_currency, settlement_scale, status,
  through_timestamp, input_digest, algorithm_version
) values (
  '44000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'NZD',
  2,
  'FINALIZED',
  '2026-01-12 00:00:00+00',
  'digest',
  'test'
);

insert into public.settlement_inputs (
  settlement_id, journey_id, expense_id, expense_revision, valuation_snapshot_id
) values (
  '44000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  5,
  (select id from public.settlement_valuation_snapshots
    where expense_id = '41000000-0000-4000-8000-000000000001' and is_active)
);

select throws_ok($$
  select public.ledger_mutate_expense_4b(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'DELETE_EXPENSE',
    5,
    'Organizer deleted after settlement',
    'guard-hash',
    'guard-key',
    (select response_body from public.ledger_idempotency_keys where idempotency_key = 'restore-key')
  )
$$, 'P0001', 'FINALIZED_SETTLEMENT_PROTECTED', 'finalized settlement protects mutation');

select * from finish();
rollback;
