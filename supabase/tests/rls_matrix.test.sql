begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(32);

select is(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'),
  102,
  'canonical, Ledger 2 and Settlement 2 Phase 3B public table count is 102'
);
select is(
  (select count(*)::integer from information_schema.columns where table_schema = 'public'),
  1425,
  'canonical, Ledger 2 and Settlement 2 Phase 3B column count is 1425'
);
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  102,
  'RLS is enabled on every public table'
);
select is(
  (select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'ai_jobs' and column_name = 'current_step')
        or (table_name = 'memory_entries' and column_name = 'parent_memory_id'))),
  0,
  'deferred repo-only columns are absent'
);
select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles'
      and t.tgname = 'protect_profile_account_role_trigger'
      and not t.tgisinternal
  ),
  'account-role protection trigger exists'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public' and p.prosecdef
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute SECURITY DEFINER functions'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public' and p.prosecdef
      and acl.grantee = (select oid from pg_roles where rolname = 'anon')
      and acl.privilege_type = 'EXECUTE'
  ),
  'anon cannot execute SECURITY DEFINER functions'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'daily_reports'),
  0,
  'daily reports have no user-facing policy'
);
select ok(not has_table_privilege('authenticated',
  'public.ledger_review_decisions', 'SELECT'),
  'authenticated cannot directly read private Review decisions');
select ok(not has_table_privilege('authenticated',
  'public.ledger_review_finding_eligible_users', 'SELECT'),
  'authenticated cannot directly read Review eligibility snapshots');
select ok(not has_function_privilege('authenticated',
  'public.read_ledger_review_projection_v2(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot call service-only Review projection RPC');
select ok(has_function_privilege('service_role',
  'public.read_ledger_review_projection_v2(uuid,uuid)', 'EXECUTE'),
  'Backend service role can call Review projection RPC');
select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename in ('journey_member_face_embeddings', 'photo_faces')
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'face and embedding tables have no direct mutation policy'
);
select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'memory_shot_artifacts'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and policyname like 'Authors and owners can%'),
  3,
  'memory artifact mutation remains author/owner scoped'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is(
  (select count(*)::integer from public.trips),
  0,
  'anon cannot read trips'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.trips
    where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'member can read their trip'
);
select is(
  (select count(*)::integer from public.trip_members
    where trip_id = '10000000-0000-4000-8000-000000000001'),
  0,
  'member cannot directly read trip_members'
);
select is(
  (select count(*)::integer from public.get_trip_members_for_current_user(
    '10000000-0000-4000-8000-000000000001')),
  2,
  'member can read trip members through the approved RPC'
);
update public.profiles set display_name = 'Synthetic Member Updated'
where id = '00000000-0000-4000-8000-000000000002';
select is(
  (select display_name from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'),
  'Synthetic Member Updated',
  'member can update a non-privileged own-profile field'
);
select throws_ok(
  $$update public.profiles set account_role = 'admin'
    where id = '00000000-0000-4000-8000-000000000002'$$,
  '42501',
  'Only system admins can change account roles.',
  'member cannot self-escalate account_role'
);
select is(
  (select account_role from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'),
  'free_user',
  'failed escalation leaves account_role unchanged'
);
update public.parser_rules set pattern = 'member-change'
where id = '20000000-0000-4000-8000-000000000003';
select is(
  (select pattern from public.parser_rules
    where id = '20000000-0000-4000-8000-000000000003'),
  'synthetic',
  'member cannot change global parser configuration'
);
update public.capture_routing_config set force_local_only = true where id = 'default';
select is(
  (select force_local_only from public.capture_routing_config where id = 'default'),
  false,
  'member cannot change capture configuration'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into public.journey_live_locations (
      journey_id, user_id, latitude, longitude, is_live_enabled
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003', -36.85, 174.76, true
    )$$,
  '42501',
  'new row violates row-level security policy for table "journey_live_locations"',
  'guest cannot publish live location'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select lives_ok(
  $$insert into public.journey_live_locations (
      journey_id, user_id, latitude, longitude, is_live_enabled
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002', -36.85, 174.76, true
    )$$,
  'linked group member can publish own live location'
);
delete from public.itinerary_item_ratings
where id = '20000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::integer from public.itinerary_item_ratings
    where id = '20000000-0000-4000-8000-000000000004'),
  0,
  'member can delete their own itinerary rating'
);
delete from public.memory_entries
where id = '20000000-0000-4000-8000-000000000005';
select is(
  (select count(*)::integer from public.memory_entries
    where id = '20000000-0000-4000-8000-000000000005'),
  1,
  'member cannot directly delete memory entry'
);
select is(
  public.delete_memory_entry_for_current_user(
    '20000000-0000-4000-8000-000000000005'
  ),
  '20000000-0000-4000-8000-000000000005'::uuid,
  'member can delete own memory through approved RPC'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
update public.parser_rules set pattern = 'admin-change'
where id = '20000000-0000-4000-8000-000000000003';
select is(
  (select pattern from public.parser_rules
    where id = '20000000-0000-4000-8000-000000000003'),
  'admin-change',
  'system admin can change global parser configuration'
);
update public.capture_routing_config set force_local_only = true where id = 'default';
select is(
  (select force_local_only from public.capture_routing_config where id = 'default'),
  true,
  'system admin can change capture configuration'
);
reset role;

set local role service_role;
select is(
  (select count(*)::integer from public.trips
    where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'service role can access canonical data for backend work'
);
select lives_ok(
  $$insert into public.journey_member_face_embeddings (
      id, trip_id, journey_member_id, embedding, source
    ) values (
      '22000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000002',
      array_fill(0.1::real, array[512]), 'manual_seed'
    )$$,
  'service role can perform backend-controlled embedding mutation'
);
reset role;

select * from finish();
rollback;
