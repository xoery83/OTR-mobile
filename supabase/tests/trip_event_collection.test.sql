begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select is((select proconfig from pg_proc where oid='public.trip_event_collection_observe(uuid,uuid)'::regprocedure),array['search_path=pg_catalog','TimeZone=UTC','DateStyle=ISO, YMD','extra_float_digits=3'],'protected observation pins exact function-local output policy');
set constraints all immediate;
grant usage on schema extensions to otr_trip_event_collection_gateway;
create temporary table bt3h_before as select trip_id,collection_revision from public.trip_event_collection_state;
create temporary table bt3h_other as select jsonb_agg(to_jsonb(e) order by id) facts from public.expenses e;
create temporary table bt3h_person as select jsonb_agg(to_jsonb(p) order by id) facts from public.journey_members p;
create temporary table bt3h_pages(value jsonb);
grant all on bt3h_pages to otr_trip_event_collection_gateway;
set session authorization otr_trip_event_collection_gateway;
insert into bt3h_pages select public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select is((select value->'events' from bt3h_pages),'[]'::jsonb,'legacy-only Trip certifies empty canonical scope');
select throws_ok($q$select public.trip_event_collection_observe('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001')$q$,null,'READ_UNAVAILABLE','foreign Actor denied rather than empty');
select throws_ok($q$select public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000099')$q$,null,'READ_UNAVAILABLE','missing Trip denied');
reset session authorization;
select ok(not has_table_privilege('otr_trip_event_collection_gateway','public.trip_event_collection_state','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'gateway has no state DML/read');
select ok(not has_column_privilege('otr_trip_event_collection_gateway','public.itinerary_events','title','SELECT,INSERT,UPDATE,REFERENCES'),'gateway has no Event column access');
select ok(not has_table_privilege('otr_trip_event_collection_reader','public.itinerary_events','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'),'reader has no Event mutations');
select ok(not has_table_privilege('service_role','public.trip_event_collection_state','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'service has no counter capabilities');
select ok(not has_function_privilege('service_role','public.trip_event_collection_observe(uuid,uuid)','EXECUTE'),'service cannot certify via fixed function');
select ok(not exists(select 1 from pg_roles where rolname like 'otr_trip_event_collection_%' and (rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolinherit or rolbypassrls or rolreplication)),'all reserved identities isolated');
set session authorization service_role;
select throws_ok($q$update public.trip_event_collection_state set collection_revision=1 where false$q$,'42501',null,'zero-row counter write denied');
select throws_ok($q$select public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$q$,'42501',null,'service session cannot certify');
reset session authorization;
-- Owner-only fixture bypass exists only inside this rollback test; counters stay on.
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
insert into public.itinerary_events(id,trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision)
values('be000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000001','Canonical','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1);
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision+1 from bt3h_before where trip_id='10000000-0000-4000-8000-000000000001'),'canonical insert bumps independent counter');
set session authorization otr_trip_event_collection_gateway;
insert into bt3h_pages select public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
select is((select jsonb_array_length(value->'events') from bt3h_pages where jsonb_array_length(value->'events')=1),1,'one complete canonical object');
select ok((select not ((value->'events'->0->'event') ? 'candidate_state') and not ((value->'events'->0->'event') ? 'source_text') from bt3h_pages where jsonb_array_length(value->'events')=1),'private/candidate projection omitted');
reset session authorization;
create temporary table bt3h_current as select * from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001';
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
update public.itinerary_events set title=title where id='be000000-0000-4000-8000-000000000001';
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision from bt3h_current),'exact no-op does not advance');
update public.itinerary_events set candidate_input_revision=1,candidate_provider='test',candidate_state='RESOLVED',candidate_observed_at='2026-01-01',candidate_confidence=0.5 where id='be000000-0000-4000-8000-000000000001';
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision from bt3h_current),'candidate-only refresh does not advance');
update public.itinerary_events set title='Changed',semantic_revision=2 where id='be000000-0000-4000-8000-000000000001';
update public.itinerary_events set title='Canonical',semantic_revision=3 where id='be000000-0000-4000-8000-000000000001';
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision+2 from bt3h_current),'semantic ABA still advances twice');
-- Accepted Place FK SET NULL leaves all accepted facts/revision intact.
insert into public.places(id,normalized_name) values('be000000-0000-4000-8000-000000000010','Synthetic');
update public.itinerary_events set accepted_place_id='be000000-0000-4000-8000-000000000010' where id='be000000-0000-4000-8000-000000000001';
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
update bt3h_current set collection_revision=(select collection_revision from public.trip_event_collection_state where trip_id=bt3h_current.trip_id);
delete from public.places where id='be000000-0000-4000-8000-000000000010';
select is((select semantic_revision from public.itinerary_events where id='be000000-0000-4000-8000-000000000001'),3::bigint,'Place loss preserves semantic revision');
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision+1 from bt3h_current),'Place FK loss advances collection revision');
-- Unsupported scope/version/participant fixtures prove whole uncapped withholding.
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
alter table public.itinerary_events drop constraint itinerary_events_semantic_structure;
update public.itinerary_events set participant_scope='ASSIGNED' where id='be000000-0000-4000-8000-000000000001';
set session authorization otr_trip_event_collection_gateway;
select is(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->>'reason','UNSUPPORTED_EVENT_CONTRACT','ASSIGNED withholds entire set');
reset session authorization;
update public.itinerary_events set participant_scope='WHOLE_GROUP' where id='be000000-0000-4000-8000-000000000001';
set session authorization otr_trip_event_collection_gateway;
select is(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->>'reason','UNSUPPORTED_EVENT_CONTRACT','WHOLE_GROUP withholds entire set');
reset session authorization;
update public.itinerary_events set participant_scope='UNASSIGNED',temporal_contract_version=2 where id='be000000-0000-4000-8000-000000000001';
set session authorization otr_trip_event_collection_gateway;
select is(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->>'reason','UNSUPPORTED_EVENT_CONTRACT','future version withholds entire set');
reset session authorization;
update public.itinerary_events set temporal_contract_version=1 where id='be000000-0000-4000-8000-000000000001';
alter table public.itinerary_events add constraint itinerary_events_semantic_structure check(public.trip_event_row_valid(to_jsonb(itinerary_events.*)) is true);
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
update bt3h_current set collection_revision=(select collection_revision from public.trip_event_collection_state where trip_id=bt3h_current.trip_id);
alter table public.itinerary_event_participants disable trigger itinerary_event_participant_semantic_guard;
insert into public.itinerary_event_participants(event_id,user_id) values('be000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
set session authorization otr_trip_event_collection_gateway;
select is(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->>'reason','UNSUPPORTED_EVENT_CONTRACT','unexpected UNASSIGNED row withholds entire set');
reset session authorization;
delete from public.itinerary_event_participants where event_id='be000000-0000-4000-8000-000000000001';
alter table public.itinerary_event_participants enable trigger itinerary_event_participant_semantic_guard;
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision+2 from bt3h_current),'participant row ABA advances twice');
-- Two endpoints remain one indivisible TRANSPORT object; real FK cache loss counts.
set constraints all deferred;
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
alter table public.itinerary_transport_endpoints disable trigger itinerary_transport_endpoint_guard;
insert into public.places(id,normalized_name) values('be000000-0000-4000-8000-000000000011','Transport synthetic');
insert into public.itinerary_events(id,trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time)
values('be000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Transport','00000000-0000-4000-8000-000000000001',1,'TRANSPORT',1,'UNASSIGNED',false);
insert into public.itinerary_transport_endpoints(event_id,role,quality,basis,civil_resolution,provenance_refs,location_input_revision,accepted_place_id)
select 'be000000-0000-4000-8000-000000000002',v,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'be000000-0000-4000-8000-000000000011' from unnest(array['ORIGIN','DESTINATION']) v;
set constraints all immediate;
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
alter table public.itinerary_transport_endpoints enable trigger itinerary_transport_endpoint_guard;
set session authorization otr_trip_event_collection_gateway;
select is(jsonb_array_length(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->'events'->1->'event'->'itinerary_transport_endpoints'),2,'TRANSPORT includes both ends in same observation');
reset session authorization;
update bt3h_current set collection_revision=(select collection_revision from public.trip_event_collection_state where trip_id=bt3h_current.trip_id);
delete from public.places where id='be000000-0000-4000-8000-000000000011';
select is((select collection_revision from public.trip_event_collection_state where trip_id='10000000-0000-4000-8000-000000000001'),(select collection_revision+2 from bt3h_current),'ORIGIN and DESTINATION FK losses each bump counter');
select ok(not exists(select 1 from public.itinerary_transport_endpoints where event_id='be000000-0000-4000-8000-000000000002' and accepted_place_id is not null),'both endpoint pointers null, facts retained');
-- Scalar JSON result exceeds REST max_rows without dropping any canonical parent.
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
insert into public.itinerary_events(id,trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision)
select ('be000001-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','Many','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1 from generate_series(1,1001) i;
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
set session authorization otr_trip_event_collection_gateway;
select is(jsonb_array_length(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->'events'),1003,'1000+ canonical objects enumerated uncapped');
reset session authorization;
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
alter table public.itinerary_events drop constraint itinerary_events_semantic_structure;
update public.itinerary_events set temporal_contract_version=2 where id='be000001-0000-4000-8000-000000001001';
set session authorization otr_trip_event_collection_gateway;
select is(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->>'reason','UNSUPPORTED_EVENT_CONTRACT','future version beyond REST cap withholds whole set');
reset session authorization;
update public.itinerary_events set temporal_contract_version=1 where id='be000001-0000-4000-8000-000000001001';
alter table public.itinerary_events add constraint itinerary_events_semantic_structure check(public.trip_event_row_valid(to_jsonb(itinerary_events.*)) is true);
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
-- Session timezone cannot change the fingerprint input; microseconds remain exact.
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
update public.itinerary_events set start_quality='EXACT',start_basis='SOURCE_INSTANT',start_civil_resolution=null,
 start_source_instant='2026-12-17T06:00:00.123456Z',start_source_instant_precision=6,
 start_provenance_refs='{"source_instant":"otr-event/confirmation/source"}',planned_start='2026-12-17T06:00:00.123456Z',semantic_revision=semantic_revision+1
 where id='be000000-0000-4000-8000-000000000001';
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
truncate bt3h_pages;
set session authorization otr_trip_event_collection_gateway;
set local timezone='UTC';
insert into bt3h_pages select public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
set local timezone='America/Los_Angeles';
select is(public.trip_event_collection_observe('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')::text,(select value::text from bt3h_pages),'same full observation in UTC/Los Angeles');
select is((select value->'events'->0->'event'->>'start_source_instant' from bt3h_pages),'2026-12-17T06:00:00.123456+00:00','UTC source instant retains microseconds');
reset session authorization;
set local timezone='UTC';
-- Overflow fails the affecting write and rolls back the facts, not just the read.
grant otr_trip_event_collection_maintainer to postgres with set true;
set local role otr_trip_event_collection_maintainer;
update public.trip_event_collection_state set collection_revision=9007199254740991 where trip_id='10000000-0000-4000-8000-000000000001';
reset role;
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
select throws_ok($q$update public.itinerary_events set title='Overflow',semantic_revision=4 where id='be000000-0000-4000-8000-000000000001'$q$,null,'EVENT_COLLECTION_REVISION_UNAVAILABLE_OR_OVERFLOW','safe collection overflow rejects writer');
select is((select title from public.itinerary_events where id='be000000-0000-4000-8000-000000000001'),'Canonical','overflow rolled back Event facts');
select is((select jsonb_agg(to_jsonb(e) order by id) from public.expenses e),(select facts from bt3h_other),'financial populated rows unaffected');
select is((select jsonb_agg(to_jsonb(p) order by id) from public.journey_members p),(select facts from bt3h_person),'Track A populated rows unaffected');
select ok((select not enabled from public.trip_event_command_gate),'Event commands remain CLOSED');
select * from finish();
rollback;
