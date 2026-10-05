\connect postgres supabase_admin
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
create function pg_temp.ai2c2_intent(op integer,expected bigint,active boolean,desired boolean,person uuid default '12000000-0000-4000-8000-000000000002',actor uuid default '00000000-0000-4000-8000-000000000001',trip uuid default '10000000-0000-4000-8000-000000000001') returns text
language plpgsql as $$ declare j jsonb; begin
 j:=jsonb_build_object('contractVersion',1,'command','SET_PARTICIPATION','operationId','ac200000-0000-4000-8000-'||lpad(op::text,12,'0'),'actorUserId',actor,'actorMemberId',null,'tripId',trip,'personId',person,'expectedParticipation',jsonb_build_object('isParticipating',active,'revision',expected),'isParticipating',desired,'reason',null);
 return (j||jsonb_build_object('intentDigest',public.trip_person_hash('otr-trip-person-intent-v1',public.trip_person_intent_tuple(j))))::text;
end $$;
-- Inputs are prepared under test owner; actual gateway cannot call private codec.
create temporary table ai2c2_inputs(name text,body text);
insert into ai2c2_inputs values
 ('flip',pg_temp.ai2c2_intent(1,0,true,false)),('restore',pg_temp.ai2c2_intent(2,1,false,true)),
 ('stale',pg_temp.ai2c2_intent(3,0,true,true)),('same',pg_temp.ai2c2_intent(4,2,true,true)),
 ('changed',pg_temp.ai2c2_intent(1,0,true,true)),('wrong',pg_temp.ai2c2_intent(5,0,true,false,'12000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')),
 ('nonowner',pg_temp.ai2c2_intent(6,0,true,false,'12000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')),
 ('missing',pg_temp.ai2c2_intent(7,0,true,false,'ac200000-0000-4000-8000-999999999999')),
 ('inconsistent',pg_temp.ai2c2_intent(8,2,false,false)),
 ('self',pg_temp.ai2c2_intent(9,0,true,false,(select id from public.journey_members where trip_id='10000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000001'))),
 ('rollback',pg_temp.ai2c2_intent(10,2,true,false));
create temporary table ai2c2_historic(reply jsonb);
grant select on ai2c2_inputs to otr_trip_person_command_gateway;
grant select,insert on ai2c2_historic to otr_trip_person_command_gateway;
create temporary table ai2c2_before as select
 (select jsonb_agg(to_jsonb(x) order by id) from public.trip_members x) as legacy,
 (select jsonb_agg(to_jsonb(x) order by id) from public.expenses x) as expenses,
 (select jsonb_agg(to_jsonb(x) order by id) from public.settlements x) as settlements,
 (select jsonb_agg(to_jsonb(x) order by sequence) from public.ledger_changes x) as feed,
 (select jsonb_agg(to_jsonb(x) order by record_id,user_id,relationship) from public.personal_settlement_payment_read_grants x) as private_grants;
select ok(not (select enabled from public.trip_person_command_gate),'gate CLOSED');
select is((select count(*)::int from public.trip_person_participation_receipts),0,'no receipts');
select ok((select bool_and(not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication and not rolinherit) from pg_roles where rolname in ('otr_trip_person_lifecycle_writer','otr_trip_person_command_gateway','otr_trip_person_receipt_reader')),'reserved roles no runtime credentials/authority');
select ok(has_column_privilege('otr_trip_person_lifecycle_writer','public.journey_members','participation_active','UPDATE') and not has_table_privilege('otr_trip_person_lifecycle_writer','public.journey_members','UPDATE') and not has_column_privilege('otr_trip_person_lifecycle_writer','public.journey_members','id','UPDATE'),'activation foundation grants only protected participation columns');
select ok(not has_function_privilege('service_role','public.trip_person_set_participation(uuid,text)','EXECUTE'),'service cannot execute');
select is((select count(*)::int from pg_shdepend where refobjid='otr_trip_person_command_gateway'::regrole and deptype='o'),0,'gateway owns nothing');
set session authorization otr_trip_person_command_gateway;
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='flip'))$q$,'42501','PARTICIPATION_COMMANDS_DISABLED','closed execution consumes no key');
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000002',(select body from ai2c2_inputs where name='nonowner'))$q$,'42501','PARTICIPATION_FORBIDDEN','non-owner denied');
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='wrong'))$q$,'42501','PARTICIPATION_FORBIDDEN','wrong Trip denied');
reset session authorization;
set session authorization service_role;
select set_config('request.jwt.claims','{"role":"otr_trip_person_command_gateway","sub":"00000000-0000-4000-8000-000000000001"}',true);
select set_config('otr.participation_commands_enabled','true',true);
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001','{}')$q$,'42501',null,'JWT/GUC spoof denied');
select throws_ok($q$set role otr_trip_person_command_gateway$q$,'42501',null,'service cannot SET ROLE');
reset session authorization;
select is((select count(*)::int from public.trip_person_participation_receipts),0,'closed/denied no durable keys');
-- Trusted fixture activation only; all grants/gate changes roll back. Real
-- participation/evidence guards remain enabled throughout semantic execution.
set session authorization postgres;
select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate where singleton),true);
reset session authorization;
set session authorization otr_trip_person_command_gateway;
insert into ai2c2_historic select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='flip'));
select is((select reply->'receipt'->>'outcome' from ai2c2_historic),'APPLIED','active to inactive');
select is(public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='flip'))->'receipt',(select reply->'receipt' from ai2c2_historic),'response-loss exact replay');
select is(public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='restore'))->'receipt'->'resultingParticipation'->>'revision','2','inactive to active ABA increments twice');
select is(public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='flip'))->'receipt',(select reply->'receipt' from ai2c2_historic),'later ABA never rewrites historic replay');
select is(public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='stale'))->'receipt'->>'outcome','REVISION_CONFLICT','stale desired already matches still conflict');
select is(public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='same'))->'receipt'->>'outcome','UNCHANGED','same-value exact base neutral');
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='changed'))$q$,'P0001','IDEMPOTENCY_KEY_REUSED','changed intent rejected');
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='inconsistent'))$q$,'P0001','PARTICIPATION_BASE_INCONSISTENT','equal revision contradictory base rejected');
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='missing'))$q$,'P0001','PERSON_NOT_FOUND','missing exact target rejected');
select is(public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='self'))->'receipt'->>'outcome','APPLIED','organizer changes self without losing authority');
set constraints all immediate;
set local timezone='Pacific/Auckland';
select is(public.trip_person_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001')->'receipt',(select reply->'receipt' from ai2c2_historic),'historic UTC receipt unaffected by timezone');
select is(public.trip_person_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001')->>'resultDigest',(select reply->>'resultDigest' from ai2c2_historic),'historic digest timezone independent');
reset session authorization;
-- Caller retains immediate constraints; fixed command defers only its evidence guard.
create function pg_temp.fail_receipt() returns trigger language plpgsql as $$begin raise exception 'TEST_RECEIPT_FAILURE'; end$$;
create trigger ai2c2_fail before insert on public.trip_person_participation_receipts for each row execute function pg_temp.fail_receipt();
set session authorization otr_trip_person_command_gateway;
select throws_ok($q$select public.trip_person_set_participation('00000000-0000-4000-8000-000000000001',(select body from ai2c2_inputs where name='rollback'))$q$,'P0001','TEST_RECEIPT_FAILURE','receipt insert failure rolls back transition');
reset session authorization;
drop trigger ai2c2_fail on public.trip_person_participation_receipts;
select ok((select participation_active and participation_revision=2 from public.journey_members where id='12000000-0000-4000-8000-000000000002'),'row preserved after receipt failure');
select is((select count(*)::int from public.trip_person_participation_receipts),5,'only admitted success/noop/conflict results stored');
-- Explicit temporary grants ensure unconditional guards are exercised, even at 0 rows.
grant update,delete,truncate on public.trip_person_participation_receipts to service_role;
set session authorization service_role;
select throws_ok($q$update public.trip_person_participation_receipts set reason='x' where false$q$,'42501','PARTICIPATION_RECEIPT_IMMUTABLE','zero-row UPDATE denied');
select throws_ok($q$delete from public.trip_person_participation_receipts where false$q$,'42501','PARTICIPATION_RECEIPT_IMMUTABLE','zero-row DELETE denied');
select throws_ok($q$truncate public.trip_person_participation_receipts$q$,'42501','PARTICIPATION_RECEIPT_IMMUTABLE','TRUNCATE denied');
reset session authorization;
set session authorization postgres;
select public.trip_person_set_command_gate((select generation from public.trip_person_command_gate where singleton),false);
reset session authorization;
set session authorization otr_trip_person_command_gateway;
select is(public.trip_person_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ac200000-0000-4000-8000-000000000001')->'receipt',(select reply->'receipt' from ai2c2_historic),'historic lookup survives gate closure');
reset session authorization;
set local timezone='UTC';
select is((select jsonb_agg(to_jsonb(x) order by id) from public.trip_members x),(select legacy from ai2c2_before),'legacy access rows unchanged');
select is((select jsonb_agg(to_jsonb(x) order by id) from public.expenses x),(select expenses from ai2c2_before),'historic expenses unchanged');
select is((select jsonb_agg(to_jsonb(x) order by id) from public.settlements x),(select settlements from ai2c2_before),'historic settlements unchanged');
select is((select jsonb_agg(to_jsonb(x) order by sequence) from public.ledger_changes x),(select feed from ai2c2_before),'financial feed/checkpoint unchanged');
select is((select jsonb_agg(to_jsonb(x) order by record_id,user_id,relationship) from public.personal_settlement_payment_read_grants x),(select private_grants from ai2c2_before),'private access unchanged');
select * from finish();
rollback;
