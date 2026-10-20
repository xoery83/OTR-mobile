begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

select ok(
  not has_function_privilege(
    'authenticated', 'public.ledger_import_stage9_v1(uuid,text,jsonb)', 'EXECUTE'
  ),
  'authenticated clients cannot call the Stage 9 import RPC'
);
select ok(
  has_function_privilege(
    'service_role', 'public.ledger_import_stage9_v1(uuid,text,jsonb)', 'EXECUTE'
  ),
  'only the backend service role can call the Stage 9 import RPC'
);

create temporary table stage9_dataset(value jsonb);
insert into stage9_dataset values (jsonb_build_object(
  'transformVersion', 'stage9-europe-replay-v3',
  'mappingVersion', 'legacy-ledger-to-ledger2-v1',
  'allocationVersion', 'ledger-largest-remainder-v1',
  'normalizationVersion', 'legacy-equal-rounding-normalization-v2',
  'iso4217Version', 'CLDR-48.0',
  'targetProjectRef', 'tuqigdxrvrerfewsxqgm',
  'journey', jsonb_build_object(
    'id', '93000000-0000-4000-8000-000000000000',
    'name', 'Europe 2026 Replay',
    'startDate', '2026-06-01', 'endDate', '2026-06-30',
    'createdByUserId', '00000000-0000-4000-8000-000000000001'
  ),
  'settings', jsonb_build_object(
    'settlementCurrency', 'NZD', 'settlementScale', 2,
    'valuationPolicy', 'MANUAL_AGREED'
  ),
  'members', jsonb_build_array(
    jsonb_build_object(
      'id', '93100000-0000-4000-8000-000000000001',
      'userId', '00000000-0000-4000-8000-000000000001',
      'displayName', 'Traveller 01', 'role', 'owner', 'status', 'linked'
    ),
    jsonb_build_object(
      'id', '93100000-0000-4000-8000-000000000002',
      'userId', '00000000-0000-4000-8000-000000000002',
      'displayName', 'Traveller 02', 'role', 'group_member', 'status', 'linked'
    )
  ),
  'expenses', jsonb_build_array(
    jsonb_build_object(
      'id', '94000000-0000-4000-8000-000000000001',
      'payerMemberId', '93100000-0000-4000-8000-000000000001',
      'title', 'Imported food aaaaaaaa', 'category', 'food',
      'occurredAt', '2026-06-01T00:00:00.000Z',
      'originalAmountMinor', 1001, 'originalCurrency', 'EUR', 'originalScale', 2,
      'businessStatus', 'ACCEPTED', 'settlementParticipation', 'INCLUDED',
      'importProvenance', '{}'::jsonb
    ),
    jsonb_build_object(
      'id', '94000000-0000-4000-8000-000000000002',
      'payerMemberId', '93100000-0000-4000-8000-000000000001',
      'title', 'Imported food bbbbbbbb', 'category', 'food',
      'occurredAt', '2026-06-02T00:00:00.000Z',
      'originalAmountMinor', 500, 'originalCurrency', 'EUR', 'originalScale', 2,
      'businessStatus', 'DRAFT', 'settlementParticipation', 'EXCLUDED',
      'importProvenance', '{}'::jsonb
    )
  ),
  'participants', jsonb_build_array(
    jsonb_build_object(
      'expenseId', '94000000-0000-4000-8000-000000000001',
      'memberId', '93100000-0000-4000-8000-000000000001',
      'displayNameSnapshot', 'Traveller 01', 'displayOrder', 0
    ),
    jsonb_build_object(
      'expenseId', '94000000-0000-4000-8000-000000000001',
      'memberId', '93100000-0000-4000-8000-000000000002',
      'displayNameSnapshot', 'Traveller 02', 'displayOrder', 1
    ),
    jsonb_build_object(
      'expenseId', '94000000-0000-4000-8000-000000000002',
      'memberId', '93100000-0000-4000-8000-000000000002',
      'displayNameSnapshot', 'Traveller 02', 'displayOrder', 0
    )
  ),
  'splits', jsonb_build_array(
    jsonb_build_object(
      'expenseId', '94000000-0000-4000-8000-000000000001',
      'memberId', '93100000-0000-4000-8000-000000000001',
      'method', 'EQUAL_PERSON', 'originalAmountMinor', 501,
      'settlementAmountMinor', 1000, 'roundingAdjustmentMinor', 0
    ),
    jsonb_build_object(
      'expenseId', '94000000-0000-4000-8000-000000000001',
      'memberId', '93100000-0000-4000-8000-000000000002',
      'method', 'EQUAL_PERSON', 'originalAmountMinor', 500,
      'settlementAmountMinor', 1000, 'roundingAdjustmentMinor', 0
    )
  ),
  'rateSnapshots', jsonb_build_array(jsonb_build_object(
    'id', '95000000-0000-4000-8000-000000000001',
    'expenseId', '94000000-0000-4000-8000-000000000001',
    'baseCurrency', 'NZD', 'quoteCurrency', 'EUR', 'decimalRate', '1.998001998',
    'effectiveDate', '2026-06-01', 'sourceRefHmac', repeat('a', 64)
  )),
  'valuations', jsonb_build_array(jsonb_build_object(
    'id', '96000000-0000-4000-8000-000000000001',
    'expenseId', '94000000-0000-4000-8000-000000000001',
    'originalAmountMinor', 1001, 'originalCurrency', 'EUR', 'originalScale', 2,
    'settlementAmountMinor', 2000, 'settlementCurrency', 'NZD', 'settlementScale', 2,
    'rateSnapshotId', '95000000-0000-4000-8000-000000000001',
    'decimalRate', '1.998001998', 'effectiveAt', '2026-06-01T00:00:00.000Z',
    'policy', 'LEGACY_IMPORTED'
  )),
  'reviewFindings', jsonb_build_array(jsonb_build_object(
    'id', '97000000-0000-4000-8000-000000000001',
    'expenseId', '94000000-0000-4000-8000-000000000002',
    'findingType', 'IMPORT_NEEDS_REVIEW',
    'evidenceCodes', jsonb_build_array('SETTLEMENT_SPLIT_MISMATCH'),
    'rulesetVersion', 'stage9-europe-replay-v3'
  ))
));

grant select on stage9_dataset to service_role;
set local role service_role;
select lives_ok($$
  select public.ledger_import_stage9_v1(
    '00000000-0000-4000-8000-000000000001', repeat('c', 64),
    (select value from stage9_dataset)
  )
$$, 'the complete Stage 9 dataset loads in one transaction');

select is(
  (select count(*)::integer from public.expenses
   where journey_id = '93000000-0000-4000-8000-000000000000'),
  2, 'accepted and structurally loadable DRAFT rows are retained'
);
select is(
  (select count(*)::integer from public.expenses
   where journey_id = '93000000-0000-4000-8000-000000000000'
     and settlement_participation = 'EXCLUDED'),
  1, 'Stage 9 persists explicit settlement participation'
);
select is(
  (select count(*)::integer from public.expense_splits s
   join public.expenses e on e.id = s.expense_id
   where e.business_status = 'DRAFT'
     and e.journey_id = '93000000-0000-4000-8000-000000000000'),
  0, 'imported DRAFT rows have no authoritative splits'
);
select is(
  (select count(*)::integer from public.settlement_valuation_snapshots v
   join public.expenses e on e.id = v.expense_id
   where e.business_status = 'DRAFT'
     and e.journey_id = '93000000-0000-4000-8000-000000000000'),
  0, 'imported DRAFT rows have no authoritative valuation'
);
select is(
  (select jsonb_array_length(expense -> 'splits')
   from jsonb_array_elements(public.ledger_settlement_source_7_1(
     '93000000-0000-4000-8000-000000000000', '2026-06-30T00:00:00Z'
   ) -> 'expenses') expense
   where expense ->> 'businessStatus' = 'DRAFT'),
  0, 'settlement and adjustment source exposes no DRAFT financial split'
);
select is(
  (public.ledger_import_stage9_v1(
    '00000000-0000-4000-8000-000000000001', repeat('c', 64),
    (select value from stage9_dataset)
  ) ->> 'idempotentReplay')::boolean,
  true, 'same payload replays without another import'
);

select * from finish();
rollback;
