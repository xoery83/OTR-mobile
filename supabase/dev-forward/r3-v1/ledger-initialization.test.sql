-- Disposable-only behavioral checks; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='public.ledger_settings'::regclass), 'Ledger FORCE RLS is actually enabled');
select ok(not has_table_privilege('authenticated','public.ledger_settings','INSERT,UPDATE'),
  'authenticated cannot directly initialize or overwrite protected settings');
select ok(not has_function_privilege('authenticated','public.add_trip_creator_as_journey_member()','EXECUTE'),
  'internal trigger function remains unavailable as an authenticated RPC');
-- Test-only replay surface invokes the identical trigger; never retained in the schema.
create temporary table retry_trip (like public.trips including defaults);
create trigger retry_initialization after insert on retry_trip for each row
  execute function public.add_trip_creator_as_journey_member();
grant insert on retry_trip to authenticated;
select set_config('request.jwt.claims', '{"sub":"83100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$insert into public.trips(id,name,created_by)
 values('83110000-0000-4000-8000-000000000001','Fresh owner A Trip','83100000-0000-4000-8000-000000000001')$$,
 'normal authenticated owner Trip creation succeeds');
select throws_ok($$insert into public.trips(id,name,created_by)
 values('83110000-0000-4000-8000-000000000002','Forged owner Trip','83100000-0000-4000-8000-000000000002')$$,
 '42501',null,'cross-Account created_by is denied by Trip RLS');
select throws_ok($$select * from public.ledger_settings$$,'42501',null,
 'protected settings direct client read remains denied');
select throws_ok($$insert into public.trips(id,name,created_by)
 values('83110000-0000-4000-8000-000000000001','Same-ID retry','83100000-0000-4000-8000-000000000001')$$,
 '23505',null,'same-Trip retry cannot create a duplicate Trip');
select lives_ok($$insert into retry_trip(id,name,created_by)
 values('83110000-0000-4000-8000-000000000001','Repeated init','83100000-0000-4000-8000-000000000001')$$,
 'repeated trigger initialization is safe');
reset role;
select is((select count(*)::integer from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),1,'exactly one settings row');
select is((select settlement_currency from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),'NZD','existing default currency');
select is((select settlement_scale::integer from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),2,'existing ISO scale');
select is((select valuation_policy from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),'REFERENCE_RATE','existing default valuation policy');
select is((select revision::integer from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),1,'initial revision remains one');
select is((select updated_by from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),'83100000-0000-4000-8000-000000000001'::uuid,'owner attribution');
select is((select count(*)::integer from public.trip_members where trip_id='83110000-0000-4000-8000-000000000001' and role='owner'),1,'original Trip owner membership preserved');
select is((select count(*)::integer from public.journey_members where trip_id='83110000-0000-4000-8000-000000000001' and role='owner' and status='linked'),1,'linked Journey owner preserved');
select is((select count(*)::integer from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000002'),0,'denied creation has no settings residue');
-- Configure nondefault settings through the existing owner-authorized currency command.
set local role service_role;
create temporary table preview_init as select public.ledger_preview_journey_currency(
 '83100000-0000-4000-8000-000000000001','83110000-0000-4000-8000-000000000001','EUR') as body;
select lives_ok(format($$select public.ledger_commit_journey_currency(
 '83100000-0000-4000-8000-000000000001','83110000-0000-4000-8000-000000000001',
 'EUR',1,%L,'r3-init-owner-currency')$$,(select body->>'previewDigest' from preview_init)),
 'existing owner currency command succeeds');
reset role;
create temporary table retained_settings as select to_jsonb(s) as body from public.ledger_settings s
 where journey_id='83110000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$insert into retry_trip(id,name,created_by)
 values('83110000-0000-4000-8000-000000000001','Existing settings retry','83100000-0000-4000-8000-000000000001')$$,
 'initialization tolerates existing nondefault settings');
reset role;
select is((select to_jsonb(s) from public.ledger_settings s where journey_id='83110000-0000-4000-8000-000000000001'),
 (select body from retained_settings),'existing settings including revision and timestamps are unchanged');
select is((select settlement_currency from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000001'),'EUR','owner-authorized currency is preserved');
savepoint aborted_trip;
set local role authenticated;
insert into public.trips(id,name,created_by) values('83110000-0000-4000-8000-000000000003','Rolled-back Trip','83100000-0000-4000-8000-000000000001');
reset role;
-- Verify before rollback without pgTAP, whose counters would also roll back.
do $$begin if not exists(select 1 from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000003') then raise exception 'settings not atomic with Trip';end if;end$$;
rollback to aborted_trip;
select is((select count(*)::integer from public.trips where id='83110000-0000-4000-8000-000000000003'),0,'Trip transaction rollback');
select is((select count(*)::integer from public.ledger_settings where journey_id='83110000-0000-4000-8000-000000000003'),0,'settings transaction rollback');
select is((select count(*)::integer from public.journey_members where trip_id='83110000-0000-4000-8000-000000000003'),0,'Journey member transaction rollback');
select is((select count(*)::integer from public.trip_members where trip_id='83110000-0000-4000-8000-000000000003'),0,'Trip member transaction rollback');
select set_config('request.jwt.claims', '{"sub":"83100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.trips where id='83110000-0000-4000-8000-000000000001'),0,'other Account cannot read the fresh Trip');
with changed as (update public.trips set name='foreign change'
 where id='83110000-0000-4000-8000-000000000001' returning id)
select is((select count(*)::integer from changed),0,'other Account cannot update the fresh Trip');
reset role;
set local role anon;
select throws_ok($$insert into public.trips(id,name,created_by)
 values('83110000-0000-4000-8000-000000000004','Anon Trip','83100000-0000-4000-8000-000000000001')$$,
 '42501',null,'anonymous Trip creation denied');
reset role;
select is((select count(*)::integer from public.external_integration_calls),0,'zero provider calls');
select * from finish();
rollback;
