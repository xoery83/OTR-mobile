begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

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


RESET ROLE;
INSERT INTO public.ledger_settings(journey_id,settlement_currency,settlement_scale,valuation_policy) VALUES ('10000000-0000-4000-8000-000000000001','NZD',2,'REFERENCE_RATE');
INSERT INTO public.personal_settlement_payment_records (
 id, journey_id, owner_user_id, owner_member_id, counterparty_member_id,
 direction, amount_minor, currency, scale, occurred_at, created_by_user_id,
 updated_by_user_id, last_operation_id, economic_date
) VALUES ('99000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
 (select id from public.journey_members where trip_id='10000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000001'),'12000000-0000-4000-8000-000000000002',
 'PAID',100,'NZD',2,'2026-01-10','00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000002','2026-01-10');
do $$begin perform public.ledger_validate_expense('41000000-0000-4000-8000-000000000001'); end$$;


-- Fixtures are synthetic. Guard disabling is owner-only test setup in this
-- rollback transaction; the deployed migration has no callable bypass.
insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time) values ('8b000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true);
insert into public.itinerary_event_participants (id,event_id,journey_member_id) values ('8b000000-0000-4000-8000-000000000002','8b000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002');
insert into public.places (id,normalized_name) values ('8b000000-0000-4000-8000-000000000003','bt3b-cache');
insert into public.trip_days (id,trip_id,day_date) values ('8b000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','2026-12-17');
insert into public.itinerary_reservations (id,trip_id,title,starts_at) values ('8b000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Commercial evidence','2026-12-17 00:00Z');
insert into public.trips (id,name,created_by) values ('8b000000-0000-4000-8000-000000000006','Other trip','00000000-0000-4000-8000-000000000001');
create temporary table bt3b_reservation_before as select to_jsonb(r) value from public.itinerary_reservations r where id='8b000000-0000-4000-8000-000000000005';
create temporary table bt3b_financial_before as select jsonb_build_object(
 'members', (select jsonb_agg(to_jsonb(m) order by id) from public.journey_members m),
 'legacy_members', (select jsonb_agg(to_jsonb(m) order by id) from public.trip_members m),
 'role_status_constraints', (select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid='public.journey_members'::regclass and (conname like '%role%' or conname like '%status%')),
 'financial_fks', (select jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid)) order by c.conrelid::regclass::text,c.conname) from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace),
 'member_grants', (select relacl::text from pg_class where oid='public.journey_members'::regclass),
 'member_policies', (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where tablename='journey_members'),
 'existing_member_triggers', (select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid='public.journey_members'::regclass and not tgisinternal and tgname<>'journey_members_participation_guard'),
 'expenses', (select jsonb_agg(to_jsonb(e) order by id) from public.expenses e),
 'participants', (select jsonb_agg(to_jsonb(e) order by expense_id,member_id) from public.expense_participants e),
 'splits', (select jsonb_agg(to_jsonb(e) order by expense_id,member_id) from public.expense_splits e),
 'valuations', (select jsonb_agg(to_jsonb(e) order by id) from public.settlement_valuation_snapshots e),
 'currency', (select jsonb_agg(to_jsonb(e) order by journey_id) from public.ledger_settings e),
 'personal_payments', (select jsonb_agg(to_jsonb(e) order by id) from public.personal_settlement_payment_records e),
 'private_grants', (select jsonb_agg(to_jsonb(e) order by record_id,user_id,relationship) from public.personal_settlement_payment_read_grants e),
 'settlement_source', public.ledger_settlement_source_7_1('10000000-0000-4000-8000-000000000001','2026-02-01'),
 'review_source', public.ledger_personal_financial_source_3b('10000000-0000-4000-8000-000000000001','2026-02-01')
) as value;

set constraints all immediate;
alter table public.itinerary_events disable trigger itinerary_event_semantic_guard;
alter table public.itinerary_transport_endpoints disable trigger itinerary_transport_endpoint_guard;
set constraints all deferred;
insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,accepted_place_id,authored_label,spatial_provenance_refs,trip_day_id,reservation_id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000010','8b000000-0000-4000-8000-000000000003','Meeting point','{"authored_label":"otr-event/confirmation/location"}','8b000000-0000-4000-8000-000000000004','8b000000-0000-4000-8000-000000000005');
insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,id,planned_start,planned_end) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'TRANSPORT',1,'UNASSIGNED',false,'8b000000-0000-4000-8000-000000000011','2026-12-17 06:00Z','2026-12-17 19:00Z');
insert into public.itinerary_transport_endpoints (event_id,role,instant,quality,basis,source_instant,source_instant_precision,provenance_refs,location_input_revision,accepted_place_id) values ('8b000000-0000-4000-8000-000000000011','ORIGIN','2026-12-17 06:00Z','EXACT','SOURCE_INSTANT','2026-12-17 06:00Z',0,'{"source_instant":"otr-event/confirmation/source"}',1,'8b000000-0000-4000-8000-000000000003');
insert into public.itinerary_transport_endpoints (event_id,role,instant,quality,basis,source_instant,source_instant_precision,provenance_refs,location_input_revision,accepted_place_id) values ('8b000000-0000-4000-8000-000000000011','DESTINATION','2026-12-17 19:00Z','EXACT','SOURCE_INSTANT','2026-12-17 19:00Z',0,'{"source_instant":"otr-event/confirmation/source"}',1,'8b000000-0000-4000-8000-000000000003');
set constraints all immediate;
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',2,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'unsupported version');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',0,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'revision lower bound');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',9007199254740992,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'revision upper bound');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'ASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'initial assigned scope disabled');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,null,'DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'missing timed quality');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN',null,'PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'missing active basis');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING',null,1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'unknown still needs map');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{"local_date":"otr-event/confirmation/unused"}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'unused reference forbidden');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'EXACT','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'exact civil requires clock');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,start_local_time,start_clock_precision) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{"local_time":"otr-event/confirmation/time"}',1,'8b000000-0000-4000-8000-000000000090','10:01:00',-1)$q$,'23514',null,'unknown forbids clock');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,accepted_latitude) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090',1)$q$,'23514',null,'coordinate pair required');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,accepted_latitude,accepted_longitude) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090',91,1)$q$,'23514',null,'coordinate range');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,candidate_provider,candidate_state,candidate_input_revision) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090','test','RESOLVED',2)$q$,'23514',null,'stale candidate generation');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,candidate_provider,candidate_state,candidate_input_revision) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090','test','RESOLVED',1)$q$,'23514',null,'completed candidate needs observation');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',0,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'location generation lower bound');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,authored_label) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'POINT',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000090','x')$q$,'23514',null,'accepted intent needs provenance');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'ALL_DAY',1,'UNASSIGNED',false,null,null,'PENDING','{}',1,'8b000000-0000-4000-8000-000000000090')$q$,'23514',null,'date-only null validation cannot pass');
select lives_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,start_local_date) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'ALL_DAY',1,'UNASSIGNED',false,null,'DERIVED_CIVIL','PENDING','{"local_date":"otr-event/confirmation/date"}',1,'8b000000-0000-4000-8000-000000000020','2026-12-17')$q$,'ALL_DAY valid partial shape');
select lives_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,start_local_date) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'CALENDAR',1,'UNASSIGNED',false,null,'DERIVED_CIVIL','PENDING','{"local_date":"otr-event/confirmation/date"}',1,'8b000000-0000-4000-8000-000000000021','2026-12-17')$q$,'CALENDAR valid partial shape');
select lives_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,timing_label,timing_provenance_ref) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'WINDOW',1,'UNASSIGNED',false,null,'DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000022','After lunch','otr-event/confirmation/window')$q$,'WINDOW valid partial shape');
select lives_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,end_quality,end_basis,end_civil_resolution,end_provenance_refs) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'SPAN',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000023','UNKNOWN','DERIVED_CIVIL','PENDING','{}')$q$,'SPAN valid partial shape');
select lives_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,start_quality,start_basis,start_civil_resolution,start_provenance_refs,location_input_revision,id,end_quality,end_basis,end_civil_resolution,end_provenance_refs) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'STAY',1,'UNASSIGNED',false,'UNKNOWN','DERIVED_CIVIL','PENDING','{}',1,'8b000000-0000-4000-8000-000000000024','UNKNOWN','DERIVED_CIVIL','PENDING','{}')$q$,'STAY valid partial shape');
select throws_ok($q$insert into public.itinerary_events (trip_id,title,created_by,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time,id,planned_start,planned_end) values ('10000000-0000-4000-8000-000000000001','Canonical protected fixture','00000000-0000-4000-8000-000000000001',1,'TRANSPORT',1,'UNASSIGNED',false,'8b000000-0000-4000-8000-000000000091','2026-12-17 06:00Z','2026-12-17 19:00Z')$q$,'23514',null,'transport needs exactly two endpoint rows');
select throws_ok($q$insert into public.itinerary_transport_endpoints(event_id,role,quality,basis,civil_resolution,provenance_refs,location_input_revision)
values('8b000000-0000-4000-8000-000000000010','ORIGIN','UNKNOWN','DERIVED_CIVIL','PENDING','{}',1)$q$,'23514',null,'POINT cannot carry transport endpoint');
select throws_ok($q$insert into public.itinerary_transport_endpoints(event_id,role,quality,basis,civil_resolution,provenance_refs,location_input_revision)
values('8b000000-0000-4000-8000-000000000001','ORIGIN','UNKNOWN','DERIVED_CIVIL','PENDING','{}',1)$q$,'23514',null,'legacy event cannot carry canonical endpoint');
select throws_ok($q$insert into public.itinerary_transport_endpoints select * from public.itinerary_transport_endpoints where role='ORIGIN'$q$,'23505',null,'composite endpoint identity rejects duplicates');
select throws_ok($q$delete from public.itinerary_transport_endpoints where role='ORIGIN'$q$,'23514',null,'transport cannot lose unknown or known endpoint row');
select throws_ok($q$update public.itinerary_transport_endpoints set instant=null where event_id='8b000000-0000-4000-8000-000000000011' and role='ORIGIN'$q$,'23514',null,'normalized instant must equal independent source');
select throws_ok($q$update public.itinerary_transport_endpoints set role='STOP' where event_id='8b000000-0000-4000-8000-000000000011' and role='ORIGIN'$q$,'23514',null,'no route stop role');
select throws_ok($q$update public.itinerary_events set planned_end='2026-12-18' where id='8b000000-0000-4000-8000-000000000011'$q$,'23514',null,'root transport summary must match endpoints');
select throws_ok($q$update public.itinerary_events set trip_day_id='8b000000-0000-4000-8000-000000000004',trip_id='8b000000-0000-4000-8000-000000000006' where id='8b000000-0000-4000-8000-000000000010'$q$,'23514',null,'cross Trip root link rejected');
set constraints all deferred;
insert into public.itinerary_events(id,trip_id,title,temporal_contract_version,temporal_shape,semantic_revision,participant_scope,is_estimated_time)
values('8b000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','Unknown transport',1,'TRANSPORT',1,'UNASSIGNED',false);
insert into public.itinerary_transport_endpoints(event_id,role,quality,basis,civil_resolution,provenance_refs,location_input_revision)
values('8b000000-0000-4000-8000-000000000012','ORIGIN','UNKNOWN','DERIVED_CIVIL','PENDING','{}',1),
('8b000000-0000-4000-8000-000000000012','DESTINATION','UNKNOWN','DERIVED_CIVIL','PENDING','{}',1);
set constraints all immediate;
select is((select count(*)::integer from public.itinerary_transport_endpoints where event_id='8b000000-0000-4000-8000-000000000012'),2,'unknown transport still has both endpoint rows');
alter table public.itinerary_events enable trigger itinerary_event_semantic_guard;
alter table public.itinerary_transport_endpoints enable trigger itinerary_transport_endpoint_guard;
create temporary table bt3b_canonical_before as select id,to_jsonb(e) value from public.itinerary_events e where temporal_contract_version=1;
create temporary table bt3b_endpoints_before as select event_id,role,to_jsonb(e) value from public.itinerary_transport_endpoints e;
select ok((select not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls from pg_roles where rolname='otr_trip_event_semantic_writer'),'private identity flags');
-- Reuse preflight additionally rejects table/column capability before guards ship.
select ok(not exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m')
    and c.relname not in ('trip_event_command_gate','trip_event_operation_receipts')
    and a.attnum>0 and not a.attisdropped
    and has_column_privilege('otr_trip_event_semantic_writer',c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')),
  'reserved writer has no effective existing business relation column capability');
select is((select count(*)::integer from pg_proc where proowner=(select oid from pg_roles where rolname='otr_trip_event_semantic_writer')),6,'private identity owns exactly six closed fixed entrypoints');
select ok(not pg_has_role('authenticated','otr_trip_event_semantic_writer','MEMBER'),'authenticated has no writer membership');
select ok(not has_table_privilege('authenticated','public.itinerary_events','TRUNCATE,TRIGGER'),'authenticated has no itinerary_events bulk/trigger grant');
select ok(not has_table_privilege('authenticated','public.itinerary_event_participants','TRUNCATE,TRIGGER'),'authenticated has no itinerary_event_participants bulk/trigger grant');
select ok(not has_table_privilege('authenticated','public.itinerary_transport_endpoints','TRUNCATE,TRIGGER'),'authenticated has no itinerary_transport_endpoints bulk/trigger grant');
select ok(not pg_has_role('service_role','otr_trip_event_semantic_writer','MEMBER'),'service_role has no writer membership');
select ok(not has_table_privilege('service_role','public.itinerary_events','TRUNCATE,TRIGGER'),'service_role has no itinerary_events bulk/trigger grant');
select ok(not has_table_privilege('service_role','public.itinerary_event_participants','TRUNCATE,TRIGGER'),'service_role has no itinerary_event_participants bulk/trigger grant');
select ok(not has_table_privilege('service_role','public.itinerary_transport_endpoints','TRUNCATE,TRIGGER'),'service_role has no itinerary_transport_endpoints bulk/trigger grant');
select ok(not pg_has_role('anon','otr_trip_event_semantic_writer','MEMBER'),'anon has no writer membership');
select ok(not has_table_privilege('anon','public.itinerary_events','TRUNCATE,TRIGGER'),'anon has no itinerary_events bulk/trigger grant');
select ok(not has_table_privilege('anon','public.itinerary_event_participants','TRUNCATE,TRIGGER'),'anon has no itinerary_event_participants bulk/trigger grant');
select ok(not has_table_privilege('anon','public.itinerary_transport_endpoints','TRUNCATE,TRIGGER'),'anon has no itinerary_transport_endpoints bulk/trigger grant');
select ok(not pg_has_role('authenticator','otr_trip_event_semantic_writer','MEMBER'),'authenticator has no writer membership');
select ok(not has_table_privilege('authenticator','public.itinerary_events','TRUNCATE,TRIGGER'),'authenticator has no itinerary_events bulk/trigger grant');
select ok(not has_table_privilege('authenticator','public.itinerary_event_participants','TRUNCATE,TRIGGER'),'authenticator has no itinerary_event_participants bulk/trigger grant');
select ok(not has_table_privilege('authenticator','public.itinerary_transport_endpoints','TRUNCATE,TRIGGER'),'authenticator has no itinerary_transport_endpoints bulk/trigger grant');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($q$set local role otr_trip_event_semantic_writer$q$,'42501',null,'authenticated cannot assume private identity');
insert into public.itinerary_events(id,trip_id,title,planned_start,is_estimated_time,created_by) values('8b000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000001','Old direct writer','2026-12-17 00:00Z',true,'00000000-0000-4000-8000-000000000001');
select ok((select temporal_contract_version is null and temporal_shape is null and semantic_revision is null and timing_label is null and timing_provenance_ref is null and participant_scope is null and legacy_planned_start is null and legacy_planned_end is null and legacy_is_estimated_time is null and legacy_snapshot_at is null and start_local_date is null and start_local_time is null and start_clock_precision is null and start_quality is null and start_basis is null and start_zone_id is null and start_supplied_offset_seconds is null and start_source_instant is null and start_source_instant_precision is null and start_civil_resolution is null and start_resolution_offset_seconds is null and start_interpretation_key is null and start_interpretation_input_sha256 is null and start_provenance_refs is null and end_local_date is null and end_local_time is null and end_clock_precision is null and end_quality is null and end_basis is null and end_zone_id is null and end_supplied_offset_seconds is null and end_source_instant is null and end_source_instant_precision is null and end_civil_resolution is null and end_resolution_offset_seconds is null and end_interpretation_key is null and end_interpretation_input_sha256 is null and end_provenance_refs is null and authored_label is null and authored_text is null and authored_address is null and accepted_address is null and accepted_latitude is null and accepted_longitude is null and accepted_place_id is null and spatial_provenance_refs is null and location_input_revision is null and candidate_input_revision is null and candidate_provider is null and candidate_provider_place_id is null and candidate_place_id is null and candidate_label is null and candidate_address is null and candidate_latitude is null and candidate_longitude is null and candidate_confidence is null and candidate_state is null and candidate_observed_at is null and candidate_error_code is null and authored_address_line1 is null and authored_address_line2 is null and authored_address_locality is null and authored_address_region is null and authored_address_postal_code is null and authored_address_country is null and accepted_address_line1 is null and accepted_address_line2 is null and accepted_address_locality is null and accepted_address_region is null and accepted_address_postal_code is null and accepted_address_country is null from public.itinerary_events where id='8b000000-0000-4000-8000-000000000081'),'authenticated legacy create leaves every new field absent');
delete from public.itinerary_events where id='8b000000-0000-4000-8000-000000000081';

select throws_ok($q$insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time,temporal_contract_version) values ('8b000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true,1)$q$,'42501',null,'authenticated marker injection');
select throws_ok($q$insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time,start_local_date) values ('8b000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true,'2026-12-17')$q$,'42501',null,'authenticated field injection');
select throws_ok($q$insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time,semantic_revision) values ('8b000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true,1)$q$,'42501',null,'authenticated revision injection');
select throws_ok($q$update public.itinerary_events set temporal_contract_version=1 where id='8b000000-0000-4000-8000-000000000001'$q$,'42501',null,'authenticated cannot adopt legacy');
select throws_ok($q$update public.itinerary_events set title='flattened' where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects edit');
select throws_ok($q$update public.itinerary_events set temporal_contract_version=null where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects marker clearing');
select throws_ok($q$update public.itinerary_events set semantic_revision=0 where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects revision downgrade');
select throws_ok($q$update public.itinerary_events set participant_scope='WHOLE_JOURNEY' where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects scope flatten');
select throws_ok($q$update public.itinerary_events set planned_start=now() where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects normalized slot flatten');
select throws_ok($q$update public.itinerary_events set title=title where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects no-op write');
select throws_ok($q$delete from public.itinerary_events where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'authenticated rejects canonical delete');
select throws_ok($q$insert into public.itinerary_transport_endpoints(event_id,role) values('8b000000-0000-4000-8000-000000000010','ORIGIN')$q$,'42501',null,'authenticated endpoint insert');
select throws_ok($q$update public.itinerary_transport_endpoints set instant=null where event_id='8b000000-0000-4000-8000-000000000011'$q$,'42501',null,'authenticated endpoint update');
select throws_ok($q$delete from public.itinerary_transport_endpoints where event_id='8b000000-0000-4000-8000-000000000011'$q$,'42501',null,'authenticated endpoint delete');
select throws_ok($q$insert into public.itinerary_event_participants (event_id,journey_member_id) values ('8b000000-0000-4000-8000-000000000010','12000000-0000-4000-8000-000000000002')$q$,'42501',null,'authenticated canonical participant insert');
select throws_ok($q$update public.itinerary_event_participants set event_id='8b000000-0000-4000-8000-000000000010' where id='8b000000-0000-4000-8000-000000000002'$q$,'42501',null,'authenticated participant move into canonical');
select throws_ok($q$truncate public.itinerary_events cascade$q$,'42501',null,'authenticated truncate itinerary_events');
select throws_ok($q$truncate public.itinerary_event_participants cascade$q$,'42501',null,'authenticated truncate itinerary_event_participants');
select throws_ok($q$truncate public.itinerary_transport_endpoints cascade$q$,'42501',null,'authenticated truncate itinerary_transport_endpoints');
select throws_ok($q$delete from public.trips where id='10000000-0000-4000-8000-000000000001'$q$,'42501',null,'authenticated Trip cascade rolls back');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',true);
set local role service_role;
select throws_ok($q$set local role otr_trip_event_semantic_writer$q$,'42501',null,'service_role cannot assume private identity');
insert into public.itinerary_events(id,trip_id,title,planned_start,is_estimated_time,created_by) values('8b000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000001','Old direct writer','2026-12-17 00:00Z',true,'00000000-0000-4000-8000-000000000001');
select ok((select temporal_contract_version is null and temporal_shape is null and semantic_revision is null and timing_label is null and timing_provenance_ref is null and participant_scope is null and legacy_planned_start is null and legacy_planned_end is null and legacy_is_estimated_time is null and legacy_snapshot_at is null and start_local_date is null and start_local_time is null and start_clock_precision is null and start_quality is null and start_basis is null and start_zone_id is null and start_supplied_offset_seconds is null and start_source_instant is null and start_source_instant_precision is null and start_civil_resolution is null and start_resolution_offset_seconds is null and start_interpretation_key is null and start_interpretation_input_sha256 is null and start_provenance_refs is null and end_local_date is null and end_local_time is null and end_clock_precision is null and end_quality is null and end_basis is null and end_zone_id is null and end_supplied_offset_seconds is null and end_source_instant is null and end_source_instant_precision is null and end_civil_resolution is null and end_resolution_offset_seconds is null and end_interpretation_key is null and end_interpretation_input_sha256 is null and end_provenance_refs is null and authored_label is null and authored_text is null and authored_address is null and accepted_address is null and accepted_latitude is null and accepted_longitude is null and accepted_place_id is null and spatial_provenance_refs is null and location_input_revision is null and candidate_input_revision is null and candidate_provider is null and candidate_provider_place_id is null and candidate_place_id is null and candidate_label is null and candidate_address is null and candidate_latitude is null and candidate_longitude is null and candidate_confidence is null and candidate_state is null and candidate_observed_at is null and candidate_error_code is null and authored_address_line1 is null and authored_address_line2 is null and authored_address_locality is null and authored_address_region is null and authored_address_postal_code is null and authored_address_country is null and accepted_address_line1 is null and accepted_address_line2 is null and accepted_address_locality is null and accepted_address_region is null and accepted_address_postal_code is null and accepted_address_country is null from public.itinerary_events where id='8b000000-0000-4000-8000-000000000081'),'service_role legacy create leaves every new field absent');
delete from public.itinerary_events where id='8b000000-0000-4000-8000-000000000081';

select throws_ok($q$insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time,temporal_contract_version) values ('8b000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true,1)$q$,'42501',null,'service_role marker injection');
select throws_ok($q$insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time,start_local_date) values ('8b000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true,'2026-12-17')$q$,'42501',null,'service_role field injection');
select throws_ok($q$insert into public.itinerary_events (id,trip_id,title,created_by,planned_start,planned_end,is_estimated_time,semantic_revision) values ('8b000000-0000-4000-8000-000000000080','10000000-0000-4000-8000-000000000001','Legacy civil literal','00000000-0000-4000-8000-000000000001','2026-12-17 00:00:00+00','2026-12-17 01:00:00+00',true,1)$q$,'42501',null,'service_role revision injection');
select throws_ok($q$update public.itinerary_events set temporal_contract_version=1 where id='8b000000-0000-4000-8000-000000000001'$q$,'42501',null,'service_role cannot adopt legacy');
select throws_ok($q$update public.itinerary_events set title='flattened' where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects edit');
select throws_ok($q$update public.itinerary_events set temporal_contract_version=null where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects marker clearing');
select throws_ok($q$update public.itinerary_events set semantic_revision=0 where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects revision downgrade');
select throws_ok($q$update public.itinerary_events set participant_scope='WHOLE_JOURNEY' where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects scope flatten');
select throws_ok($q$update public.itinerary_events set planned_start=now() where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects normalized slot flatten');
select throws_ok($q$update public.itinerary_events set title=title where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects no-op write');
select throws_ok($q$delete from public.itinerary_events where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'service_role rejects canonical delete');
select throws_ok($q$insert into public.itinerary_transport_endpoints(event_id,role) values('8b000000-0000-4000-8000-000000000010','ORIGIN')$q$,'42501',null,'service_role endpoint insert');
select throws_ok($q$update public.itinerary_transport_endpoints set instant=null where event_id='8b000000-0000-4000-8000-000000000011'$q$,'42501',null,'service_role endpoint update');
select throws_ok($q$delete from public.itinerary_transport_endpoints where event_id='8b000000-0000-4000-8000-000000000011'$q$,'42501',null,'service_role endpoint delete');
select throws_ok($q$insert into public.itinerary_event_participants (event_id,journey_member_id) values ('8b000000-0000-4000-8000-000000000010','12000000-0000-4000-8000-000000000002')$q$,'42501',null,'service_role canonical participant insert');
select throws_ok($q$update public.itinerary_event_participants set event_id='8b000000-0000-4000-8000-000000000010' where id='8b000000-0000-4000-8000-000000000002'$q$,'42501',null,'service_role participant move into canonical');
select throws_ok($q$truncate public.itinerary_events cascade$q$,'42501',null,'service_role truncate itinerary_events');
select throws_ok($q$truncate public.itinerary_event_participants cascade$q$,'42501',null,'service_role truncate itinerary_event_participants');
select throws_ok($q$truncate public.itinerary_transport_endpoints cascade$q$,'42501',null,'service_role truncate itinerary_transport_endpoints');
select throws_ok($q$delete from public.trips where id='10000000-0000-4000-8000-000000000001'$q$,'42501',null,'service_role Trip cascade rolls back');
reset role;
select ok((select rolbypassrls from pg_roles where rolname='service_role'),'service role genuinely bypasses RLS');
select throws_ok($q$update public.itinerary_transport_endpoints set instant=instant$q$,'42501',null,'endpoint no-op owner DML guarded');
select throws_ok($q$delete from public.itinerary_transport_endpoints$q$,'42501',null,'endpoint owner delete guarded');

select throws_ok($q$delete from public.itinerary_events where id='8b000000-0000-4000-8000-000000000010'$q$,'42501',null,'trusted owner DML does not silently bypass canonical guard');
select throws_ok($q$truncate public.trips cascade$q$,'42501',null,'statement guard blocks owner truncate cascade rooted elsewhere');
select throws_ok($q$update public.trip_days set trip_id='8b000000-0000-4000-8000-000000000006' where id='8b000000-0000-4000-8000-000000000004'$q$,'23514',null,'day cross Trip movement blocked');
select throws_ok($q$update public.itinerary_reservations set trip_id='8b000000-0000-4000-8000-000000000006' where id='8b000000-0000-4000-8000-000000000005'$q$,'23514',null,'reservation cross Trip movement blocked');
select throws_ok($q$delete from public.trip_days where id='8b000000-0000-4000-8000-000000000004'$q$,'42501',null,'day SET NULL is semantic and rejected');
select throws_ok($q$delete from public.itinerary_reservations where id='8b000000-0000-4000-8000-000000000005'$q$,'42501',null,'reservation SET NULL is semantic and rejected');
select throws_ok($q$delete from public.profiles where id='00000000-0000-4000-8000-000000000001'$q$,'42501',null,'profile creator SET NULL is semantic and rejected');
alter table public.itinerary_event_participants disable trigger itinerary_event_participant_semantic_guard;
insert into public.itinerary_event_participants (id,event_id,journey_member_id) values ('8b000000-0000-4000-8000-000000000050','8b000000-0000-4000-8000-000000000010','12000000-0000-4000-8000-000000000002');
alter table public.itinerary_event_participants enable trigger itinerary_event_participant_semantic_guard;
set local role service_role;
select throws_ok($q$delete from public.itinerary_event_participants where id='8b000000-0000-4000-8000-000000000050'$q$,'42501',null,'participant delete cannot damage defensive canonical fixture');
select throws_ok($q$update public.itinerary_event_participants set event_id='8b000000-0000-4000-8000-000000000001' where id='8b000000-0000-4000-8000-000000000050'$q$,'42501',null,'participant move out cannot damage defensive canonical fixture');
select throws_ok($q$delete from public.journey_members where id='12000000-0000-4000-8000-000000000002'$q$,'42501',null,'Member cascade cannot damage defensive canonical fixture');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($q$select public.remove_journey_member('12000000-0000-4000-8000-000000000002')$q$,'42501',null,'retained Member definer cannot bypass cascade guard');
reset role;
alter table public.itinerary_event_participants disable trigger itinerary_event_participant_semantic_guard;
delete from public.itinerary_event_participants where id='8b000000-0000-4000-8000-000000000050';
alter table public.itinerary_event_participants enable trigger itinerary_event_participant_semantic_guard;
select lives_ok($q$delete from public.places where id='8b000000-0000-4000-8000-000000000003'$q$,'optional Place cache deletion allowed');
select ok(not exists(select 1 from public.itinerary_events e join bt3b_canonical_before b using(id) where (to_jsonb(e)-array['accepted_place_id','candidate_place_id','place_id','updated_at'])<>(b.value-array['accepted_place_id','candidate_place_id','place_id','updated_at'])),'Place loss preserves every canonical fact and revision');
select ok(not exists(select 1 from public.itinerary_transport_endpoints e join bt3b_endpoints_before b using(event_id,role) where (to_jsonb(e)-array['accepted_place_id','candidate_place_id'])<>(b.value-array['accepted_place_id','candidate_place_id'])),'endpoint snapshot preserved on Place loss');
select is((select to_jsonb(r) from public.itinerary_reservations r where id='8b000000-0000-4000-8000-000000000005'),(select value from bt3b_reservation_before),'reservation literal commercial evidence unchanged');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.itinerary_transport_endpoints),0,'unrelated user cannot read endpoints');
reset role;
set local role service_role;
select lives_ok($q$update public.itinerary_events set title='Legacy edit' where id='8b000000-0000-4000-8000-000000000001'$q$,'legacy service update survives');
select ok((select temporal_contract_version is null and temporal_shape is null and semantic_revision is null and timing_label is null and timing_provenance_ref is null and participant_scope is null and legacy_planned_start is null and legacy_planned_end is null and legacy_is_estimated_time is null and legacy_snapshot_at is null and start_local_date is null and start_local_time is null and start_clock_precision is null and start_quality is null and start_basis is null and start_zone_id is null and start_supplied_offset_seconds is null and start_source_instant is null and start_source_instant_precision is null and start_civil_resolution is null and start_resolution_offset_seconds is null and start_interpretation_key is null and start_interpretation_input_sha256 is null and start_provenance_refs is null and end_local_date is null and end_local_time is null and end_clock_precision is null and end_quality is null and end_basis is null and end_zone_id is null and end_supplied_offset_seconds is null and end_source_instant is null and end_source_instant_precision is null and end_civil_resolution is null and end_resolution_offset_seconds is null and end_interpretation_key is null and end_interpretation_input_sha256 is null and end_provenance_refs is null and authored_label is null and authored_text is null and authored_address is null and accepted_address is null and accepted_latitude is null and accepted_longitude is null and accepted_place_id is null and spatial_provenance_refs is null and location_input_revision is null and candidate_input_revision is null and candidate_provider is null and candidate_provider_place_id is null and candidate_place_id is null and candidate_label is null and candidate_address is null and candidate_latitude is null and candidate_longitude is null and candidate_confidence is null and candidate_state is null and candidate_observed_at is null and candidate_error_code is null and authored_address_line1 is null and authored_address_line2 is null and authored_address_locality is null and authored_address_region is null and authored_address_postal_code is null and authored_address_country is null and accepted_address_line1 is null and accepted_address_line2 is null and accepted_address_locality is null and accepted_address_region is null and accepted_address_postal_code is null and accepted_address_country is null from public.itinerary_events where id='8b000000-0000-4000-8000-000000000001'),'legacy create/update leaves all new fields absent');
select is((select planned_start from public.itinerary_events where id='8b000000-0000-4000-8000-000000000001'),'2026-12-17 00:00Z'::timestamptz,'literal legacy midnight unchanged');
select lives_ok($q$delete from public.itinerary_events where id='8b000000-0000-4000-8000-000000000001'$q$,'legacy delete and participant cascade still work');
reset role;
select is((select jsonb_build_object(
 'members', (select jsonb_agg(to_jsonb(m) order by id) from public.journey_members m),
 'legacy_members', (select jsonb_agg(to_jsonb(m) order by id) from public.trip_members m),
 'role_status_constraints', (select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid='public.journey_members'::regclass and (conname like '%role%' or conname like '%status%')),
 'financial_fks', (select jsonb_agg(jsonb_build_array(c.conrelid::regclass::text,c.conname,pg_get_constraintdef(c.oid)) order by c.conrelid::regclass::text,c.conname) from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace),
 'member_grants', (select relacl::text from pg_class where oid='public.journey_members'::regclass),
 'member_policies', (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where tablename='journey_members'),
 'existing_member_triggers', (select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid='public.journey_members'::regclass and not tgisinternal and tgname<>'journey_members_participation_guard'),
 'expenses', (select jsonb_agg(to_jsonb(e) order by id) from public.expenses e),
 'participants', (select jsonb_agg(to_jsonb(e) order by expense_id,member_id) from public.expense_participants e),
 'splits', (select jsonb_agg(to_jsonb(e) order by expense_id,member_id) from public.expense_splits e),
 'valuations', (select jsonb_agg(to_jsonb(e) order by id) from public.settlement_valuation_snapshots e),
 'currency', (select jsonb_agg(to_jsonb(e) order by journey_id) from public.ledger_settings e),
 'personal_payments', (select jsonb_agg(to_jsonb(e) order by id) from public.personal_settlement_payment_records e),
 'private_grants', (select jsonb_agg(to_jsonb(e) order by record_id,user_id,relationship) from public.personal_settlement_payment_read_grants e),
 'settlement_source', public.ledger_settlement_source_7_1('10000000-0000-4000-8000-000000000001','2026-02-01'),
 'review_source', public.ledger_personal_financial_source_3b('10000000-0000-4000-8000-000000000001','2026-02-01')
)::text),(select value::text from bt3b_financial_before),'nonempty Expense/Split/valuation/currency/Payment/grants/Settlement/Review and Track A facts unchanged');
select ok(public.trip_event_boundary_valid('{"quality":"UNKNOWN","basis":"DERIVED_CIVIL","civil_resolution":"PENDING","provenance_refs":{}}'::jsonb,null,'TIME') is true,'entirely unknown endpoint retains an empty evidence object');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is true,'civil normalization uses accepted bound offset and canonical binding recipe');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,'2026-12-17 10:00Z'::timestamptz,'TIME') is not true,'UTC-like flatten of accepted civil time rejected');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-18","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,'2026-12-17 21:00Z'::timestamptz,'TIME') is not true,'stale civil binding rejected');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0000000000000000000000000000000000000000000000000000000000000000"}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is not true,'mismatched interpretation digest rejected');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-2,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,null,'TIME') is not true,'clock precision lower bound');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":7,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,null,'TIME') is not true,'clock precision upper bound');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00.000001","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,null,'TIME') is not true,'unsupplied microseconds cannot masquerade as minute precision');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":64801,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,null,'TIME') is not true,'resolved offset upper bound');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,null,'TIME') is not true,'zone bound');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"24:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb"}'::jsonb,null,'TIME') is not true,'24:00 is not silently rolled to next date');
select ok(public.trip_event_boundary_valid('{"quality":"UNKNOWN","basis":"DERIVED_CIVIL","civil_resolution":"PENDING","provenance_refs":{"local_date":"otr-event/confirmation/date"},"local_date":"infinity"}'::jsonb,null,'TIME') is not true,'infinite civil date rejected');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"GAP","resolution_offset_seconds":null,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"92c0b8e59cd8623d8c5143fc4cc95f0f55966d2efa592338366515b975f6f6ee"}'::jsonb,null,'TIME') is true,'GAP retains civil intent with null normalized instant');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"GAP","resolution_offset_seconds":null,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"92c0b8e59cd8623d8c5143fc4cc95f0f55966d2efa592338366515b975f6f6ee"}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is not true,'GAP cannot fabricate timeline instant');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"FOLD","resolution_offset_seconds":null,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"dbdff42eb9b8c1ac1028f02907abc1cda83d6c67ab6d10157f04f4ce850b8ddd"}'::jsonb,null,'TIME') is true,'FOLD retains civil intent with null normalized instant');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"FOLD","resolution_offset_seconds":null,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"dbdff42eb9b8c1ac1028f02907abc1cda83d6c67ab6d10157f04f4ce850b8ddd"}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is not true,'FOLD cannot fabricate timeline instant');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"FOLD_RESOLVED","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test","fold_choice":"otr-event/confirmation/fold"},"interpretation_input_sha256":"a2801e612ed22da42355524c592e6bea0e0f18fe27e2b38d9d305cf704390afd"}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is true,'fold choice has bound occurrence offset and evidence');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"FOLD_RESOLVED","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test"},"interpretation_input_sha256":"a2801e612ed22da42355524c592e6bea0e0f18fe27e2b38d9d305cf704390afd"}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is not true,'fold choice requires provenance');
select ok(public.trip_event_boundary_valid('{"quality":"EXACT","basis":"SOURCE_INSTANT","source_instant":"2026-12-17T06:00:00.123456Z","source_instant_precision":6,"provenance_refs":{"source_instant":"otr-event/confirmation/source"}}'::jsonb,'2026-12-17T06:00:00.123456Z'::timestamptz,'TIME') is true,'microsecond source instant survives without civil fragments');
select ok(public.trip_event_boundary_valid('{"quality":"EXACT","basis":"SOURCE_INSTANT","source_instant":"2026-12-17T06:00:00.123456Z","source_instant_precision":3,"provenance_refs":{"source_instant":"otr-event/confirmation/source"}}'::jsonb,'2026-12-17T06:00:00.123456Z'::timestamptz,'TIME') is not true,'source precision cannot hide supplied microseconds');
select ok(public.trip_event_boundary_valid('{"quality":"EXACT","basis":"SOURCE_INSTANT","source_instant":"2026-12-17T06:00:00.123456Z","source_instant_precision":6,"provenance_refs":{"source_instant":"otr-event/confirmation/source"}}'::jsonb,'2026-12-17T06:00:00.123000Z'::timestamptz,'TIME') is not true,'source instant cannot be rounded by normalized slot');
select ok(public.trip_event_boundary_valid('{"quality":"EXACT","basis":"SOURCE_INSTANT","source_instant":"2026-12-17T06:00:00.123456Z","source_instant_precision":6,"provenance_refs":{"source_instant":"otr-event/confirmation/source"},"civil_resolution":"PENDING"}'::jsonb,'2026-12-17T06:00:00.123456Z'::timestamptz,'TIME') is not true,'incomplete source civil context has no invented resolution');
select ok(public.trip_event_boundary_valid('{"local_date":"2026-12-17","local_time":"10:00:00","clock_precision":-1,"quality":"EXACT","basis":"DERIVED_CIVIL","zone_id":"Pacific/Auckland","civil_resolution":"UNIQUE","resolution_offset_seconds":46800,"interpretation_key":"TEST-ONLY/resolver-fixture","provenance_refs":{"local_date":"otr-event/confirmation/test","local_time":"otr-event/confirmation/test","zone_id":"otr-event/confirmation/test","source_instant":"otr-event/confirmation/source"},"interpretation_input_sha256":"0ef59508cbf126e8f05ef4b8d1c0766be2624d5736e90d70d19b0ed737df09cb","source_instant":"2026-12-17T06:00:00.123456Z","source_instant_precision":6}'::jsonb,'2026-12-16 21:00Z'::timestamptz,'TIME') is true,'conflicting independent source retained without replacing chosen civil basis');
select ok(public.trip_event_boundary_valid('{"quality":"UNKNOWN","basis":"DERIVED_CIVIL","civil_resolution":"PENDING","provenance_refs":{"payload":"otr-event/confirmation/arbitrary"}}'::jsonb,null,'TIME') is not true,'arbitrary evidence payload key forbidden');
select ok(public.trip_event_boundary_valid('{"quality":"ESTIMATED","basis":"DERIVED_CIVIL","civil_resolution":"PENDING","provenance_refs":{"local_time":"otr-event/confirmation/time"},"local_time":"10:00","clock_precision":-1}'::jsonb,null,'TIME') is not true,'estimated quality requires own evidence');
select ok(not exists(select 1 from pg_proc where oid in ('public.assert_trip_event_aggregate(uuid)'::regprocedure,'public.validate_trip_event_aggregate()'::regprocedure,'public.trip_event_is_canonical(uuid)'::regprocedure) and prosrc ~* '\m(insert|update|delete|truncate)\s+'), 'new definer functions only inspect and validate; no mutation command');
select * from finish();
rollback;
