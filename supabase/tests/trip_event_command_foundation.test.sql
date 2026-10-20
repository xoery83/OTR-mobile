-- Test-only superuser connection; all opening/grants/guard changes roll back.
-- Production migration contains no opening setter or caller-controlled bypass.
\connect postgres supabase_admin
begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select is((select enabled from public.trip_event_command_gate),false,'activation CLOSED');
select is((select count(*)::int from public.trip_event_operation_receipts),0,'no installed success records');
select ok(not has_table_privilege('otr_trip_event_command_gateway','public.itinerary_events','INSERT,UPDATE,DELETE'),'gateway no table DML');
select ok(not has_column_privilege('otr_trip_event_command_gateway','public.itinerary_events','title','UPDATE'),'gateway no column DML');
select ok(not has_column_privilege('otr_trip_event_semantic_writer','public.itinerary_events','title','UPDATE'),'writer has no parent DML in deployed foundation');
select ok(not has_table_privilege('service_role','public.trip_event_operation_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'API has no receipt grants');
select ok(not exists(select 1 from pg_roles where rolname in ('otr_trip_event_semantic_writer','otr_trip_event_command_gateway','otr_trip_event_receipt_reader') and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls)),'isolated reserved attributes');
select ok(not exists(select 1 from pg_auth_members where roleid in (select oid from pg_roles where rolname in ('otr_trip_event_semantic_writer','otr_trip_event_command_gateway','otr_trip_event_receipt_reader')) and (set_option or inherit_option)),'no SET ROLE/inheritance path');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname like 'trip_event_%' and has_function_privilege('otr_trip_event_command_gateway',oid,'EXECUTE')),9,'gateway exact nine Event entrypoint/recovery capabilities');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname like 'trip_event_%' and has_function_privilege('otr_trip_event_receipt_reader',oid,'EXECUTE')),5,'reader exact five read/codec/UTC helpers including private C bridge');
select ok(not exists(select 1 from pg_namespace where nspname not in ('pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)' and (has_schema_privilege('otr_trip_event_semantic_writer',oid,'CREATE') or has_schema_privilege('otr_trip_event_command_gateway',oid,'CREATE') or has_schema_privilege('otr_trip_event_receipt_reader',oid,'CREATE'))),'no unexpected non-system schema CREATE in final identities');
select is(public.trip_event_canonical_json('{"z":[2,1],"a":{"b":null,"a":"雪\n"}}'::json),'{"a":{"a":"雪\n","b":null},"z":[2,1]}','codec exact golden');
select throws_ok($q$select public.trip_event_canonical_json('{"a":1,"a":2}'::json)$q$,'P0001','INVALID_COMMAND','duplicate JSON members');
select throws_ok($q$select public.trip_event_canonical_json('{"x":-0}'::json)$q$,'P0001','INVALID_COMMAND','negative zero rejected');
select throws_ok($q$select public.trip_event_canonical_json('{"x":1e0}'::json)$q$,'P0001','INVALID_COMMAND','exponent number rejected');
select throws_ok($q$select public.trip_event_coordinate('91',90)$q$,'P0001','INVALID_COMMAND','coordinate range');
insert into public.trips(id,name,created_by) values('bd300000-0000-4000-8000-000000000001','Other synthetic trip','00000000-0000-4000-8000-000000000001');
insert into public.trip_days(id,trip_id,day_date) values('bd300000-0000-4000-8000-000000000002','bd300000-0000-4000-8000-000000000001','2026-12-17');
create temporary table bt3d_unchanged as select jsonb_build_object(
 'members',(select jsonb_agg(to_jsonb(x) order by id) from public.journey_members x),
 'sources',(select jsonb_agg(to_jsonb(x) order by id) from public.trip_sources x),
 'expenses',(select jsonb_agg(to_jsonb(x) order by id) from public.expenses x),
 'payments',(select jsonb_agg(to_jsonb(x) order by id) from public.personal_settlement_payment_records x),
 'participants',(select jsonb_agg(to_jsonb(x) order by id) from public.itinerary_event_participants x)) value;
create function pg_temp.bt3d_intent(family text,op integer,base bigint default null,payload jsonb default '{}') returns text
language sql as $$ select jsonb_build_object('contractVersion',1,'intentVersion',1,'command',family,'commandVersion',1,
 'actorAccountId','00000000-0000-4000-8000-000000000001','tripId','10000000-0000-4000-8000-000000000001',
 'operationKey','bd000000-0000-4000-8000-'||lpad(op::text,12,'0'),'eventId','bd000000-0000-4000-8000-000000000001',
 'baseSemanticRevision',base,'payload',payload)::text $$;
create function pg_temp.bt3d_call(family text,op integer,base bigint default null,payload jsonb default '{}') returns jsonb
language plpgsql security invoker as $$ declare source text:=pg_temp.bt3d_intent(family,op,base,payload); result jsonb;
begin
 case family
 when 'CREATE_EVENT' then result:=public.trip_event_create_event('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'bd000000-0000-4000-8000-000000000001',source);
 when 'UPDATE_CORE_TEXT' then result:=public.trip_event_update_core_text('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'bd000000-0000-4000-8000-000000000001',base,source);
 when 'UPDATE_TIME' then result:=public.trip_event_update_time('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'bd000000-0000-4000-8000-000000000001',base,source);
 when 'UPDATE_LOCATION' then result:=public.trip_event_update_location('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'bd000000-0000-4000-8000-000000000001',base,source);
 when 'UPDATE_GROUPING' then result:=public.trip_event_update_grouping('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'bd000000-0000-4000-8000-000000000001',base,source);
 when 'UPDATE_STATUS' then result:=public.trip_event_update_status('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'bd000000-0000-4000-8000-000000000001',base,source);
 end case; return result;
end $$;
create function pg_temp.bt3d_new_create(op integer,payload jsonb) returns jsonb
language plpgsql security invoker as $$ declare id uuid:=('bd100000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid; source jsonb;
begin source:=pg_temp.bt3d_intent('CREATE_EVENT',op,null,payload)::jsonb||jsonb_build_object('eventId',id);
 return public.trip_event_create_event('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',('bd000000-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,id,source::text);
end $$;
create temporary table bt3d_historic(receipt jsonb);
grant select,insert on bt3d_historic to otr_trip_event_command_gateway;
create temporary table bt3d_inputs(name text,payload jsonb);
insert into bt3d_inputs values('create','{"shape":"POINT","participantScope":"UNASSIGNED","core":{"title":"Exact manual","description":null},"time":{"start":{"local_date":null,"local_time":null,"clock_precision":null,"quality":"UNKNOWN","basis":"DERIVED_CIVIL","zone_id":null,"supplied_offset_seconds":null,"source_instant":null,"source_instant_precision":null,"fold_choice":null}},"proofs":{"ROOT.title":{"kind":"MANUAL"}}}');
grant select on bt3d_inputs to public;
grant usage on schema extensions to otr_trip_event_command_gateway;
reset role;
set session authorization otr_trip_event_command_gateway;
select throws_ok($q$select pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))$q$,'42501','CANONICAL_WRITES_DISABLED','closed CREATE');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_CORE_TEXT',2,1,'{}')$q$,'42501','CANONICAL_WRITES_DISABLED','closed text');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_TIME',3,1,'{}')$q$,'42501','CANONICAL_WRITES_DISABLED','closed time');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_LOCATION',4,1,'{}')$q$,'42501','CANONICAL_WRITES_DISABLED','closed location');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_GROUPING',5,1,'{}')$q$,'42501','CANONICAL_WRITES_DISABLED','closed grouping');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_STATUS',6,1,'{}')$q$,'42501','CANONICAL_WRITES_DISABLED','closed status');
select throws_ok($q$update public.trip_event_command_gate set enabled=true$q$,'42501',null,'gateway cannot open gate');
select throws_ok($q$set role otr_trip_event_semantic_writer$q$,'42501',null,'gateway cannot assume writer');
select is(public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001'),null::jsonb,'scoped receipt absence');
reset session authorization;
set session authorization service_role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"otr_trip_event_command_gateway","canonical_writes":true}',true);
select set_config('otr.event_commands_enabled','true',true);
select throws_ok($q$select pg_temp.bt3d_call('CREATE_EVENT',1,null,'{}')$q$,'42501',null,'service JWT/GUC spoof cannot execute');
select throws_ok($q$set role otr_trip_event_command_gateway$q$,'42501',null,'service cannot assume gateway');
reset session authorization;
set session authorization authenticated;
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_STATUS',7,1,'{"status":"completed"}')$q$,'42501',null,'authenticated cannot execute');
reset session authorization;
-- Supplemental actual-session probes for the private identities.
set session authorization otr_trip_event_receipt_reader;
select throws_ok($q$select public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001')$q$,'42501','FORBIDDEN','reader cannot expose recovery outside gateway session');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_STATUS',70,1,'{"status":"completed"}')$q$,'42501',null,'reader cannot execute semantic entrypoint');
select throws_ok($q$update public.trip_event_command_gate set enabled=true$q$,'42501',null,'reader cannot open gate');
reset session authorization;
set session authorization otr_trip_event_semantic_writer;
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_STATUS',71,1,'{"status":"completed"}')$q$,'42501','FORBIDDEN','private writer alone is not a command gateway session');
select throws_ok($q$update public.itinerary_events set title='Hostile helper bypass'$q$,'42501',null,'private writer has no deployed parent DML');
reset session authorization;
-- Open ONLY in rollback-local owner fixture. No gate-opening function is shipped.
alter table public.trip_event_command_gate drop constraint trip_event_gate_closed;
update public.trip_event_command_gate set enabled=true;
grant select,insert,update on public.itinerary_events to otr_trip_event_semantic_writer;
grant select,update(id) on public.trips,public.trip_members,public.journey_members,public.trip_days,public.places to otr_trip_event_semantic_writer;
grant select on public.itinerary_event_participants,public.itinerary_transport_endpoints,public.itinerary_reservations to otr_trip_event_semantic_writer;
create policy bt3d_test_parent on public.itinerary_events to otr_trip_event_semantic_writer using(true) with check(true);
create policy bt3d_test_trip on public.trips to otr_trip_event_semantic_writer using(true) with check(true);
create policy bt3d_test_member on public.trip_members to otr_trip_event_semantic_writer using(true) with check(true);
create policy bt3d_test_person on public.journey_members to otr_trip_event_semantic_writer using(true) with check(true);
create policy bt3d_test_day on public.trip_days to otr_trip_event_semantic_writer using(true) with check(true);
create policy bt3d_test_place on public.places to otr_trip_event_semantic_writer using(true) with check(true);
create policy bt3d_test_child on public.itinerary_event_participants to otr_trip_event_semantic_writer using(true);
create policy bt3d_test_endpoint on public.itinerary_transport_endpoints to otr_trip_event_semantic_writer using(true);
create policy bt3d_test_reservation on public.itinerary_reservations to otr_trip_event_semantic_writer using(true);
set constraints all immediate;
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
set session authorization otr_trip_event_command_gateway;
set local timezone='UTC';
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt'->>'outcome','APPLIED','manual create commits atomic receipt');
insert into bt3d_historic select public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001');
set local timezone='UTC';
select is(public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001')::text,(select receipt::text from bt3d_historic),'identical receipt bytes in UTC');
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt',(select receipt from bt3d_historic),'same-key complete historical receipt in UTC');
reset session authorization;
select is(public.trip_event_utc_timestamp('2026-11-01T09:00:00.123456Z'::timestamptz),'2026-11-01T09:00:00.123456Z','DST instant exact UTC in UTC');
set session authorization otr_trip_event_command_gateway;
set local timezone='Pacific/Auckland';
select is(public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001')::text,(select receipt::text from bt3d_historic),'identical receipt bytes in Pacific/Auckland');
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt',(select receipt from bt3d_historic),'same-key complete historical receipt in Pacific/Auckland');
reset session authorization;
select is(public.trip_event_utc_timestamp('2026-11-01T09:00:00.123456Z'::timestamptz),'2026-11-01T09:00:00.123456Z','DST instant exact UTC in Pacific/Auckland');
set session authorization otr_trip_event_command_gateway;
set local timezone='America/Los_Angeles';
select is(public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001')::text,(select receipt::text from bt3d_historic),'identical receipt bytes in America/Los_Angeles');
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt',(select receipt from bt3d_historic),'same-key complete historical receipt in America/Los_Angeles');
reset session authorization;
select is(public.trip_event_utc_timestamp('2026-11-01T09:00:00.123456Z'::timestamptz),'2026-11-01T09:00:00.123456Z','DST instant exact UTC in America/Los_Angeles');
set session authorization otr_trip_event_command_gateway;
set local timezone='UTC';
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->>'idempotentReplay','true','lost response exact replay');
select throws_ok($q$select pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload||'{"core":{"title":"Changed","description":null}}'::jsonb from bt3d_inputs where name='create'))$q$,'23505','IDEMPOTENCY_KEY_REUSED','changed-intent key rejected');
select is(pg_temp.bt3d_call('UPDATE_STATUS',10,1,'{"status":"completed"}')->'receipt'->>'committed_semantic_revision','2','status CAS increment');
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt'->>'committed_semantic_revision','1','historic replay after edit retains revision1');
select is(pg_temp.bt3d_call('UPDATE_STATUS',11,1,'{"status":"skipped"}')->'receipt'->>'error_code','STALE_BASE_REVISION','same-base competitor conflicts');
select is(pg_temp.bt3d_call('UPDATE_STATUS',12,2,'{"status":"completed"}')->'receipt'->>'outcome','NO_CHANGE','true metadata no-op');
select is(pg_temp.bt3d_call('UPDATE_CORE_TEXT',13,2,'{"patch":{"title":"Exact manual"},"proofs":{"ROOT.title":{"kind":"MANUAL"}}}')->'receipt'->>'committed_semantic_revision','3','same display new proof advances');
select is(pg_temp.bt3d_call('UPDATE_LOCATION',14,3,'{"patch":{"authored_label":"駅"},"proofs":{"ROOT.authored_label":{"kind":"MANUAL"}}}')->'receipt'->>'committed_semantic_revision','4','location acceptance increment');
select is(pg_temp.bt3d_call('UPDATE_GROUPING',15,4,'{"patch":{"order_index":3}}')->'receipt'->>'committed_semantic_revision','5','grouping whitelist');
select is(pg_temp.bt3d_call('UPDATE_TIME',16,5,'{"start":{"local_date":"2026-12-17","local_time":null,"clock_precision":null,"quality":"UNKNOWN","basis":"DERIVED_CIVIL","zone_id":null,"supplied_offset_seconds":null,"source_instant":null,"source_instant_precision":null,"fold_choice":null},"proofs":{"ROOT.start.local_date":{"kind":"MANUAL"}}}')->'receipt'->>'committed_semantic_revision','6','unknown date remains unnormalized');
select is(pg_temp.bt3d_call('UPDATE_TIME',17,6,'{"start":{"local_date":"2026-12-17","local_time":"10:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","supplied_offset_seconds":null,"source_instant":null,"source_instant_precision":null,"fold_choice":null},"proofs":{}}')->'receipt'->>'error_code','TIME_RESOLUTION_UNAVAILABLE','zoned input blocked');
select is(pg_temp.bt3d_call('UPDATE_CORE_TEXT',18,6,'{"patch":{"title":"C evidence"},"proofs":{"ROOT.title":{"kind":"TRACK_C","ref":"track-c/field-evidence/arbitrary"}}}')->'receipt'->>'error_code','INVALID_PROVENANCE','Track C blocked');
select is(pg_temp.bt3d_call('UPDATE_CORE_TEXT',19,6,'{"patch":{"title":"Bad","temporal_shape":"SPAN"},"proofs":{"ROOT.title":{"kind":"MANUAL"}}}')->'receipt'->>'error_code','INVALID_COMMAND','shape not a first-slice mutation field');
select is(pg_temp.bt3d_call('CREATE_EVENT',20,null,(select payload||'{"shape":"SPAN"}' from bt3d_inputs where name='create'))->'receipt'->>'error_code','EVENT_ID_IN_USE','no alternative ID/remap on duplicate target');
select is(pg_temp.bt3d_new_create(30,(select payload||'{"shape":"SPAN"}' from bt3d_inputs where name='create'))->'receipt'->>'error_code','UNSUPPORTED_SHAPE','unsupported CREATE shape');
select is(pg_temp.bt3d_new_create(31,(select payload||'{"participantScope":"ASSIGNED"}' from bt3d_inputs where name='create'))->'receipt'->>'error_code','UNSUPPORTED_PARTICIPANT_SCOPE','participant scope remains UNASSIGNED');
select is(pg_temp.bt3d_new_create(32,(select payload||'{"shape":"ALL_DAY","time":{"start":{"local_date":"2026-12-17","local_time":null,"clock_precision":null,"quality":null,"basis":"DERIVED_CIVIL","zone_id":null,"supplied_offset_seconds":null,"source_instant":null,"source_instant_precision":null,"fold_choice":null}},"proofs":{"ROOT.title":{"kind":"MANUAL"},"ROOT.start.local_date":{"kind":"MANUAL"}}}' from bt3d_inputs where name='create'))->'receipt'->>'outcome','APPLIED','ALL_DAY date only');
select is(pg_temp.bt3d_new_create(33,(select payload||'{"shape":"CALENDAR","time":{"start":{"local_date":"2026-12-17","local_time":null,"clock_precision":null,"quality":null,"basis":"DERIVED_CIVIL","zone_id":null,"supplied_offset_seconds":null,"source_instant":null,"source_instant_precision":null,"fold_choice":null}},"proofs":{"ROOT.title":{"kind":"MANUAL"},"ROOT.start.local_date":{"kind":"MANUAL"}}}' from bt3d_inputs where name='create'))->'receipt'->>'outcome','APPLIED','CALENDAR annotation');
select is(pg_temp.bt3d_new_create(34,(select payload||'{"time":{"start":{"local_date":null,"local_time":null,"clock_precision":null,"quality":"EXACT","basis":"SOURCE_INSTANT","zone_id":null,"supplied_offset_seconds":null,"source_instant":"2026-12-17T06:00:00.123456Z","source_instant_precision":6,"fold_choice":null}},"proofs":{"ROOT.title":{"kind":"MANUAL"},"ROOT.start.source_instant":{"kind":"MANUAL"}}}' from bt3d_inputs where name='create'))->'receipt'->'result_fields'->>'planned_start','2026-12-17T06:00:00.123456Z','SOURCE_INSTANT microseconds lossless');
select is(pg_temp.bt3d_call('UPDATE_CORE_TEXT',35,6,jsonb_build_object('patch',jsonb_build_object('title','Exact manual'),'proofs',jsonb_build_object('ROOT.title',jsonb_build_object('kind','RETAINED','ref','otr-event/confirmation/10000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001/bd000000-0000-4000-8000-000000000013/ROOT.title'))))->'receipt'->>'outcome','NO_CHANGE','exact current retained proof is neutral');
select is(pg_temp.bt3d_call('UPDATE_CORE_TEXT',36,6,jsonb_build_object('patch',jsonb_build_object('title','Changed'),'proofs',jsonb_build_object('ROOT.title',jsonb_build_object('kind','RETAINED','ref','otr-event/confirmation/10000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001/bd000000-0000-4000-8000-000000000013/ROOT.title'))))->'receipt'->>'error_code','INVALID_PROVENANCE','retained proof cannot authorize changed value');
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt',(select receipt from bt3d_historic),'later edits preserve complete historic receipt');
reset session authorization;
select is((select semantic_revision from public.itinerary_events where id='bd000000-0000-4000-8000-000000000001'),6::bigint,'replays/rejections preserve head');
select ok((select planned_start is null from public.itinerary_events where id='bd000000-0000-4000-8000-000000000001'),'unknown date never midnight');
select is((select location_input_revision from public.itinerary_events where id='bd000000-0000-4000-8000-000000000001'),2::bigint,'location generation advances once');
-- Fractional provider cache is preserved on NO_CHANGE and never enters receipts.
update public.itinerary_events set candidate_input_revision=2,candidate_provider='test',candidate_state='RESOLVED',candidate_observed_at='2026-01-01',candidate_confidence=0.75 where id='bd000000-0000-4000-8000-000000000001';
set session authorization otr_trip_event_command_gateway;
select is(pg_temp.bt3d_call('UPDATE_LOCATION',42,6,'{"patch":{"authored_label":"駅"},"proofs":{"ROOT.authored_label":{"kind":"RETAINED","ref":"otr-event/confirmation/10000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001/bd000000-0000-4000-8000-000000000014/ROOT.authored_label"}}}')->'receipt'->>'outcome','NO_CHANGE','retained location with fractional provider cache is neutral');
select ok(not (pg_temp.bt3d_call('UPDATE_LOCATION',42,6,'{"patch":{"authored_label":"駅"},"proofs":{"ROOT.authored_label":{"kind":"RETAINED","ref":"otr-event/confirmation/10000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000001/bd000000-0000-4000-8000-000000000014/ROOT.authored_label"}}}')->'receipt'->'result_fields' ? 'candidate_confidence'),'historical receipt excludes provider cache');
reset session authorization;
select is((select candidate_confidence from public.itinerary_events where id='bd000000-0000-4000-8000-000000000001'),0.75::numeric,'NO_CHANGE preserves provider confidence');
select throws_ok($q$update public.trip_event_operation_receipts set intended_payload='{}'$q$,'42501','TRIP_EVENT_RECEIPT_IMMUTABLE','receipt update blocked');
select throws_ok($q$delete from public.trip_event_operation_receipts$q$,'42501','TRIP_EVENT_RECEIPT_IMMUTABLE','receipt delete blocked');
select throws_ok($q$truncate public.trip_event_operation_receipts$q$,'42501','TRIP_EVENT_RECEIPT_IMMUTABLE','receipt truncate blocked');
select throws_ok($q$update public.trip_event_operation_receipts set intent_sha256=intent_sha256 where false$q$,'42501','TRIP_EVENT_RECEIPT_IMMUTABLE','zero-row tampering fenced');
-- A failed receipt INSERT must roll back the tentative semantic mutation too.
create function pg_temp.bt3d_fail_receipt() returns trigger language plpgsql as $$begin
 if new.operation_key='bd000000-0000-4000-8000-000000000040' then raise exception 'TEST_RECEIPT_FAILURE'; end if; return new; end$$;
create trigger bt3d_test_fail_receipt before insert on public.trip_event_operation_receipts for each row execute function pg_temp.bt3d_fail_receipt();
set session authorization otr_trip_event_command_gateway;
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_STATUS',40,6,'{"status":"skipped"}')$q$,'P0001','TEST_RECEIPT_FAILURE','receipt failure atomically rolls back mutation');
reset session authorization;
select is((select semantic_revision from public.itinerary_events where id='bd000000-0000-4000-8000-000000000001'),6::bigint,'no mutation without receipt');
select ok(not exists(select 1 from public.trip_event_operation_receipts where operation_key='bd000000-0000-4000-8000-000000000040'),'no false receipt on failed transaction');
drop trigger bt3d_test_fail_receipt on public.trip_event_operation_receipts;
-- Closing new admission does not prevent authorized historical recovery.
update public.trip_event_command_gate set enabled=false;
set session authorization otr_trip_event_command_gateway;
select is(pg_temp.bt3d_call('CREATE_EVENT',1,null,(select payload from bt3d_inputs where name='create'))->'receipt'->>'committed_semantic_revision','1','closed gate historical exact replay');
select throws_ok($q$select pg_temp.bt3d_call('UPDATE_STATUS',41,6,'{"status":"skipped"}')$q$,'42501','CANONICAL_WRITES_DISABLED','closure blocks fresh key');
reset session authorization;
update public.trip_event_command_gate set enabled=true;
-- Ordinary guard remains unchanged; fixture restores it before runtime probes.
set constraints all immediate;
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
set session authorization service_role;
select throws_ok($q$update public.itinerary_events set title='Old full save',planned_start='2026-12-17' where id='bd000000-0000-4000-8000-000000000001'$q$,'42501','TRIP_EVENT_CANONICAL_WRITES_DISABLED','old canonical full-save blocked');
select lives_ok($q$insert into public.itinerary_events(id,trip_id,title,created_by,planned_start,is_estimated_time) values('bd200000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00Z',true)$q$,'legacy create remains legacy');
reset session authorization;
select ok((select temporal_contract_version is null and planned_start='2026-12-17 00:00Z'::timestamptz and is_estimated_time from public.itinerary_events where id='bd200000-0000-4000-8000-000000000001'),'legacy marker/literal preserved');
set constraints all immediate;
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
set session authorization otr_trip_event_command_gateway;
select is(pg_temp.bt3d_call('UPDATE_GROUPING',37,6,'{"patch":{"trip_day_id":"bd300000-0000-4000-8000-000000000002"}}')->'receipt'->>'error_code','INVALID_AGGREGATE','cross-Trip Day rejected');
reset session authorization;
update public.itinerary_events set semantic_revision=9007199254740991 where id='bd000000-0000-4000-8000-000000000001';
set session authorization otr_trip_event_command_gateway;
select is(pg_temp.bt3d_call('UPDATE_STATUS',21,9007199254740991,'{"status":"skipped"}')->'receipt'->>'error_code','REVISION_OVERFLOW','overflow rejects without mutation');
select throws_ok($q$select public.trip_event_receipt_lookup('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000001')$q$,'42501','FORBIDDEN','foreign Trip no oracle');
reset session authorization;
select is(jsonb_build_object(
 'members',(select jsonb_agg(to_jsonb(x) order by id) from public.journey_members x),
 'sources',(select jsonb_agg(to_jsonb(x) order by id) from public.trip_sources x),
 'expenses',(select jsonb_agg(to_jsonb(x) order by id) from public.expenses x),
 'payments',(select jsonb_agg(to_jsonb(x) order by id) from public.personal_settlement_payment_records x),
 'participants',(select jsonb_agg(to_jsonb(x) order by id) from public.itinerary_event_participants x)),(select value from bt3d_unchanged),'A/C/financial/participant facts unchanged');
select * from finish();
rollback;
\connect postgres postgres
