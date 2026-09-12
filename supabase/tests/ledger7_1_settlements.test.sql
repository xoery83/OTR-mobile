begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);
set local role service_role;

update public.journey_members set role = 'owner', status = 'linked'
where trip_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '00000000-0000-4000-8000-000000000001';

insert into public.ledger_settings (
  journey_id, settlement_currency, settlement_scale, valuation_policy
) values (
  '10000000-0000-4000-8000-000000000001', 'NZD', 2, 'REFERENCE_RATE'
);

select is(
  public.ledger_settlement_source_7_1(
    '10000000-0000-4000-8000-000000000001', '2026-09-12T00:00:00Z'
  ) #>> '{settlementCurrency}',
  'NZD',
  'canonical source uses Journey settlement currency'
);

create temporary table stage7_source as select public.ledger_settlement_source_7_1(
  '10000000-0000-4000-8000-000000000001', '2026-09-12T00:00:00Z'
) value;

select lives_ok($$
  select public.ledger_finalize_settlement_7_1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '2026-09-12T00:00:00Z', repeat('a', 64),
    (select value from stage7_source), '[]'::jsonb,
    (select jsonb_agg(member || jsonb_build_object(
      'paidMinor', 0, 'owedMinor', 0, 'netMinor', 0
    )) from stage7_source, jsonb_array_elements(value -> 'members') member),
    '[]'::jsonb, 'stage7-finalize', 'stage7-payload'
  )
$$, 'authoritative finalization commits atomically');

select is(
  (select count(*)::integer from public.settlements where input_digest = repeat('a', 64)),
  1,
  'finalization creates one canonical Settlement'
);
select is(
  (select count(*)::integer from public.settlement_member_balances smb
   join public.settlements s on s.id = smb.settlement_id
   where s.input_digest = repeat('a', 64)),
  (select jsonb_array_length(value -> 'members') from stage7_source),
  'finalization freezes every member balance snapshot'
);
select is(
  (select count(*)::integer from public.settlement_audit_events sae
   join public.settlements s on s.id = sae.settlement_id
   where s.input_digest = repeat('a', 64) and sae.event_type = 'FINALIZED'),
  1,
  'successful finalization writes one business audit event'
);
select is(
  (public.ledger_finalize_settlement_7_1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '2026-09-12T00:00:00Z', repeat('a', 64),
    (select value from stage7_source), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'stage7-finalize', 'stage7-payload'
  ) ->> 'idempotentReplay')::boolean,
  true,
  'same idempotency key replays the canonical result'
);
select is(
  (select count(*)::integer from public.settlements where input_digest = repeat('a', 64)),
  1,
  'idempotent retry creates no duplicate Settlement'
);
select is(
  (public.ledger_finalize_settlement_7_1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '2026-09-12T00:00:00Z', repeat('a', 64),
    (select value from stage7_source), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'stage7-concurrent-key', 'stage7-concurrent-payload'
  ) ->> 'settlementId'),
  (select id::text from public.settlements where input_digest = repeat('a', 64)),
  'a distinct concurrent command receives the same canonical Settlement'
);

select throws_ok(
  $$update public.settlement_member_balances set net_minor = 1$$,
  '23514', 'settlement_member_balances is append-only',
  'finalized balances are immutable'
);
select throws_ok(
  $$update public.settlement_audit_events set event_type = 'SUPERSEDED'$$,
  '23514', 'settlement_audit_events is append-only',
  'Settlement business audit is immutable'
);

update public.ledger_settings set valuation_policy = 'MANUAL_AGREED'
where journey_id = '10000000-0000-4000-8000-000000000001';
select throws_ok($$
  select public.ledger_finalize_settlement_7_1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '2026-09-12T00:00:00Z', repeat('b', 64),
    (select value from stage7_source), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'stage7-stale', 'stage7-stale-payload'
  )
$$, 'P0001', 'SETTLEMENT_INPUT_STALE', 'canonical change rejects stale preview');

select throws_ok($$
  select public.ledger_finalize_settlement_7_1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '2026-09-12T00:00:00Z', repeat('c', 64),
    public.ledger_settlement_source_7_1(
      '10000000-0000-4000-8000-000000000001', '2026-09-12T00:00:00Z'
    ), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'stage7-second-active', 'stage7-second-active-payload'
  )
$$, '23505', 'duplicate key value violates unique constraint "settlements_one_active_7_1"',
'a Journey cannot acquire a second active Settlement before Stage 7.2');

select ok(
  not has_function_privilege(
    'authenticated',
    'public.ledger_finalize_settlement_7_1(uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb,jsonb,text,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot call finalization RPC directly'
);

select * from finish();
rollback;
