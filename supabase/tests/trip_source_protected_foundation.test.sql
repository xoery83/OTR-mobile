begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select ok((select count(*)=0 from public.trip_sources),'foundation has no business backfill');
select ok((select not public and file_size_limit=52428800 and allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/heic','image/heif'] from storage.buckets where id='trip-source-material'),'exact private Source bucket');
select ok((select not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls and not rolreplication from pg_roles where rolname='otr_trip_source_writer'),'reserved writer exact attributes');
select ok(not exists(select 1 from pg_auth_members where member='otr_trip_source_writer'::regrole or roleid='otr_trip_source_writer'::regrole and (set_option or inherit_option or member<>'postgres'::regrole)),'no writer inheritance or SET ROLE path');
select ok(not exists(select 1 from pg_proc where proowner='otr_trip_source_writer'::regrole),'no Source writer function or executable command');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.trip_sources'::regclass),'trip_sources enabled and forced RLS');
select ok(not has_table_privilege('anon','public.trip_sources','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_sources'::regclass and attnum>0 and not attisdropped and has_column_privilege('anon',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'anon: trip_sources no effective table or column grants');
select ok(not has_table_privilege('authenticated','public.trip_sources','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_sources'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticated',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticated: trip_sources no effective table or column grants');
select ok(not has_table_privilege('service_role','public.trip_sources','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_sources'::regclass and attnum>0 and not attisdropped and has_column_privilege('service_role',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'service_role: trip_sources no effective table or column grants');
select ok(not has_table_privilege('authenticator','public.trip_sources','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_sources'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticator',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticator: trip_sources no effective table or column grants');
select ok(not has_table_privilege('otr_trip_source_writer','public.trip_sources','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_sources'::regclass and attnum>0 and not attisdropped and has_column_privilege('otr_trip_source_writer',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'otr_trip_source_writer: trip_sources no effective table or column grants');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.trip_source_revisions'::regclass),'trip_source_revisions enabled and forced RLS');
select ok(not has_table_privilege('anon','public.trip_source_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_revisions'::regclass and attnum>0 and not attisdropped and has_column_privilege('anon',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'anon: trip_source_revisions no effective table or column grants');
select ok(not has_table_privilege('authenticated','public.trip_source_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_revisions'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticated',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticated: trip_source_revisions no effective table or column grants');
select ok(not has_table_privilege('service_role','public.trip_source_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_revisions'::regclass and attnum>0 and not attisdropped and has_column_privilege('service_role',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'service_role: trip_source_revisions no effective table or column grants');
select ok(not has_table_privilege('authenticator','public.trip_source_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_revisions'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticator',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticator: trip_source_revisions no effective table or column grants');
select ok(not has_table_privilege('otr_trip_source_writer','public.trip_source_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_revisions'::regclass and attnum>0 and not attisdropped and has_column_privilege('otr_trip_source_writer',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'otr_trip_source_writer: trip_source_revisions no effective table or column grants');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.trip_source_representations'::regclass),'trip_source_representations enabled and forced RLS');
select ok(not has_table_privilege('anon','public.trip_source_representations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_representations'::regclass and attnum>0 and not attisdropped and has_column_privilege('anon',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'anon: trip_source_representations no effective table or column grants');
select ok(not has_table_privilege('authenticated','public.trip_source_representations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_representations'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticated',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticated: trip_source_representations no effective table or column grants');
select ok(not has_table_privilege('service_role','public.trip_source_representations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_representations'::regclass and attnum>0 and not attisdropped and has_column_privilege('service_role',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'service_role: trip_source_representations no effective table or column grants');
select ok(not has_table_privilege('authenticator','public.trip_source_representations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_representations'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticator',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticator: trip_source_representations no effective table or column grants');
select ok(not has_table_privilege('otr_trip_source_writer','public.trip_source_representations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_representations'::regclass and attnum>0 and not attisdropped and has_column_privilege('otr_trip_source_writer',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'otr_trip_source_writer: trip_source_representations no effective table or column grants');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.trip_source_actions'::regclass),'trip_source_actions enabled and forced RLS');
select ok(not has_table_privilege('anon','public.trip_source_actions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_actions'::regclass and attnum>0 and not attisdropped and has_column_privilege('anon',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'anon: trip_source_actions no effective table or column grants');
select ok(not has_table_privilege('authenticated','public.trip_source_actions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_actions'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticated',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticated: trip_source_actions no effective table or column grants');
select ok(not has_table_privilege('service_role','public.trip_source_actions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_actions'::regclass and attnum>0 and not attisdropped and has_column_privilege('service_role',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'service_role: trip_source_actions no effective table or column grants');
select ok(not has_table_privilege('authenticator','public.trip_source_actions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_actions'::regclass and attnum>0 and not attisdropped and has_column_privilege('authenticator',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'authenticator: trip_source_actions no effective table or column grants');
select ok(not has_table_privilege('otr_trip_source_writer','public.trip_source_actions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not exists(select 1 from pg_attribute where attrelid='public.trip_source_actions'::regclass and attnum>0 and not attisdropped and has_column_privilege('otr_trip_source_writer',attrelid,attnum,'SELECT,INSERT,UPDATE,REFERENCES')),'otr_trip_source_writer: trip_source_actions no effective table or column grants');
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
SELECT public.ledger_validate_expense('41000000-0000-4000-8000-000000000001');

insert into public.receipt_assets(id,journey_id,expense_id,local_id,created_by,object_path,mime_type,size_bytes,sha256) values ('9c000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','ci3b-receipt','00000000-0000-4000-8000-000000000001','ci3b/receipt.jpg','image/jpeg',100,repeat('a',64));
create temporary table ci3b_receipt_before as select jsonb_build_object('bucket',(select to_jsonb(b) from storage.buckets b where id='ledger-receipts'),'grants',(select relacl::text from pg_class where oid='public.receipt_assets'::regclass),'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where tablename='receipt_assets'),'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid='public.receipt_assets'::regclass and not tgisinternal)) value;
-- Only isolated trusted test owner disables row guards; no bypass is shipped.
alter table public.trip_sources disable trigger trip_source_mutation_guard;
alter table public.trip_sources disable trigger trip_source_statement_guard;
alter table public.trip_source_revisions disable trigger trip_source_mutation_guard;
alter table public.trip_source_revisions disable trigger trip_source_statement_guard;
alter table public.trip_source_representations disable trigger trip_source_mutation_guard;
alter table public.trip_source_representations disable trigger trip_source_statement_guard;
alter table public.trip_source_actions disable trigger trip_source_mutation_guard;
alter table public.trip_source_actions disable trigger trip_source_statement_guard;
insert into public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) values ('9c000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ci3b-text',repeat('a',64),'TEXT','PASTE','UNKNOWN','2026-01-01',1,1),('9c000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ci3b-binary',repeat('a',64),'FILE','FILES','UNKNOWN','2026-01-01',1,1);
insert into public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) values ('9c000000-0000-4000-8000-000000000001',1,'2026-01-01','00000000-0000-4000-8000-000000000001','ci3b-text',repeat('b',64),array['9c000000-0000-4000-8000-000000000002'::uuid],'AS_SUPPLIED','ACQUISITION'),('9c000000-0000-4000-8000-000000000003',1,'2026-01-01','00000000-0000-4000-8000-000000000001','ci3b-binary',repeat('b',64),array['9c000000-0000-4000-8000-000000000004'::uuid],'AS_SUPPLIED','ACQUISITION');
insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) values ('9c000000-0000-4000-8000-000000000002',1,'9c000000-0000-4000-8000-000000000001',1,'ORIGINAL','TEXT','UTF-8',encode(extensions.digest('旅行 UTF-8','sha256'),'hex'),octet_length('旅行 UTF-8'),'旅行 UTF-8','NOT_APPLICABLE','2026-01-01','NOT_APPLICABLE');
insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,mime_type,payload_sha256,byte_count,regenerability,created_at,storage_provider,storage_bucket,object_key,remote_state) values ('9c000000-0000-4000-8000-000000000004',1,'9c000000-0000-4000-8000-000000000003',1,'ORIGINAL','BINARY','application/pdf',repeat('c',64),100,'NOT_APPLICABLE','2026-01-01','supabase_storage','trip-source-material','v1/10000000-0000-4000-8000-000000000001/9c000000-0000-4000-8000-000000000003/9c000000-0000-4000-8000-000000000004/payload','PENDING');
select lives_ok($q$set constraints all immediate; set constraints all deferred;$q$,'valid TEXT and BINARY aggregates resolve circular references');
select throws_ok($q$update public.trip_sources set row_revision=0 where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'zero revision');
select throws_ok($q$update public.trip_sources set row_revision=9007199254740992 where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'unsafe revision');
select throws_ok($q$update public.trip_sources set acquisition_sha256=null where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'missing retained digest');
select throws_ok($q$update public.trip_sources set acquisition_key='bad key' where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'nonopaque acquisition key');
select throws_ok($q$update public.trip_sources set source_kind='EMAIL' where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'incompatible acquisition channel');
select throws_ok($q$update public.trip_sources set captured_at='2026-01-01' where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'unknown capture with invented instant');
select throws_ok($q$update public.trip_sources set lifecycle='DELETED' where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'deleted without actor/time');
select throws_ok($q$update public.trip_sources set access_mode='PUBLIC' where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'sharing not admitted');
select throws_ok($q$update public.trip_sources set current_material_revision=2 where id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23503',null,'dangling current revision');
select throws_ok($q$update public.trip_source_revisions set previous_revision=1 where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'invalid first chain');
select throws_ok($q$update public.trip_source_revisions set original_representation_ids='{}' where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'empty manifest');
select throws_ok($q$update public.trip_source_revisions set original_representation_ids=array['9c000000-0000-4000-8000-000000000002'::uuid,'9c000000-0000-4000-8000-000000000002'::uuid] where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'duplicate manifest');
select throws_ok($q$update public.trip_source_revisions set original_representation_ids=array['9c000000-0000-4000-8000-000000000004'::uuid] where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'cross Source manifest');
select throws_ok($q$update public.trip_source_revisions set original_representation_ids=array['9c000000-0000-4000-8000-000000000098'::uuid] where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'missing manifest member');
select throws_ok($q$update public.trip_source_revisions set created_by='00000000-0000-4000-8000-000000000002' where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'revision creator scope');
select throws_ok($q$update public.trip_source_revisions set reason='AUTHORIZED_COPY' where source_id='9c000000-0000-4000-8000-000000000001'; set constraints all immediate;$q$,'23514',null,'copy without origin');
select throws_ok($q$update public.trip_source_representations set row_revision=0 where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'Representation zero revision');
select throws_ok($q$update public.trip_source_representations set payload_sha256=repeat('d',64) where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'TEXT integrity mismatch');
select throws_ok($q$update public.trip_source_representations set byte_count=1 where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'TEXT byte count mismatch');
select throws_ok($q$update public.trip_source_representations set encoding=null where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'TEXT missing encoding');
select throws_ok($q$update public.trip_source_representations set mime_type='image/png' where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'TEXT binary MIME');
select throws_ok($q$update public.trip_source_representations set text_content=null where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'missing retained TEXT');
select throws_ok($q$update public.trip_source_representations set locator_uri='https://example.invalid' where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'TEXT locator exclusivity');
select throws_ok($q$update public.trip_source_representations set remote_state='VERIFIED' where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'TEXT fake remote verification');
select throws_ok($q$update public.trip_source_representations set parent_ids=array['9c000000-0000-4000-8000-000000000004'::uuid] where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'ORIGINAL parents forbidden');
select throws_ok($q$update public.trip_source_representations set transform_key='ocr' where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'ORIGINAL transform forbidden');
select throws_ok($q$update public.trip_source_representations set role='DERIVED' where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'DERIVED transform and parent required');
select throws_ok($q$update public.trip_source_representations set retention_state='PAYLOAD_PURGED' where id='9c000000-0000-4000-8000-000000000002'; set constraints all immediate;$q$,'23514',null,'purged inline payload still present');
select throws_ok($q$update public.trip_source_representations set mime_type='application/octet-stream' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'unsupported binary MIME');
select throws_ok($q$update public.trip_source_representations set byte_count=10485761 where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'PDF exact cap');
select throws_ok($q$update public.trip_source_representations set byte_count=0 where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'empty BINARY');
select throws_ok($q$update public.trip_source_representations set storage_provider='other' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'provider mismatch');
select throws_ok($q$update public.trip_source_representations set storage_bucket='ledger-receipts' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'receipt bucket forbidden');
select throws_ok($q$update public.trip_source_representations set object_key='wrong' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'object key wrong scope');
select throws_ok($q$update public.trip_source_representations set remote_state='VERIFIED' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'VERIFIED requires proof time');
select throws_ok($q$update public.trip_source_representations set remote_state='PURGED' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'PURGED with retained material');
select throws_ok($q$update public.trip_source_representations set retention_state='IDENTITY_ONLY' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'redaction requires purged binary state');
select throws_ok($q$update public.trip_source_representations set encoding='UTF-8' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'BINARY encoding forbidden');
select throws_ok($q$update public.trip_source_representations set text_content='x' where id='9c000000-0000-4000-8000-000000000004'; set constraints all immediate;$q$,'23514',null,'BINARY TEXT forbidden');
select lives_ok($q$insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,parent_ids,transform_key,transform_version,transform_options_sha256,regenerability,created_at,remote_state) values ('9c000000-0000-4000-8000-000000000010',1,'9c000000-0000-4000-8000-000000000001',1,'DERIVED','TEXT','UTF-8',encode(extensions.digest('x','sha256'),'hex'),1,'x',array['9c000000-0000-4000-8000-000000000002'::uuid],'extract','1',repeat('a',64),'POSSIBLE','2026-01-02','NOT_APPLICABLE');set constraints all immediate;set constraints all deferred;$q$,'valid same Source derived lineage');
select throws_ok($q$update public.trip_source_representations set parent_ids=array['9c000000-0000-4000-8000-000000000004'::uuid] where id='9c000000-0000-4000-8000-000000000010';set constraints all immediate;$q$,'23514',null,'cross Source derived parent');
select throws_ok($q$update public.trip_source_representations set parent_ids=array[id] where id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'self parent');
select lives_ok($q$insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,parent_ids,transform_key,transform_version,transform_options_sha256,regenerability,created_at,remote_state) values ('9c000000-0000-4000-8000-000000000011',1,'9c000000-0000-4000-8000-000000000001',1,'DERIVED','TEXT','UTF-8',encode(extensions.digest('x','sha256'),'hex'),1,'x',array['9c000000-0000-4000-8000-000000000010'::uuid],'extract','1',repeat('a',64),'POSSIBLE','2026-01-02','NOT_APPLICABLE');set constraints all immediate;set constraints all deferred;$q$,'second derivative preserves lineage');
select throws_ok($q$update public.trip_source_representations set parent_ids=array['9c000000-0000-4000-8000-000000000011'::uuid] where id='9c000000-0000-4000-8000-000000000010';set constraints all immediate;$q$,'23514',null,'indirect lineage cycle');
select throws_ok($q$update public.trip_source_revisions set original_representation_ids=array['9c000000-0000-4000-8000-000000000010'::uuid] where source_id='9c000000-0000-4000-8000-000000000001';set constraints all immediate;$q$,'23514',null,'DERIVED excluded from original manifest');
select ok((select count(*)=2 from public.trip_sources where acquisition_sha256=repeat('a',64)),'same envelope digest with different acquisition keys is structurally allowed');
select throws_ok($q$update public.trip_sources set acquisition_key='ci3b-text' where id='9c000000-0000-4000-8000-000000000003';$q$,'23505',null,'same Trip Account acquisition key unique');
select lives_ok($q$insert into public.trip_source_actions(id,source_id,actor_account_id,operation_key,operation_sha256,action,occurred_at,source_row_revision,material_revision,reason_code) values ('9c000000-0000-4000-8000-000000000020','9c000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','act',repeat('a',64),'ACQUIRE','2026-01-01',1,1,'USER_REQUEST');set constraints all immediate;set constraints all deferred;$q$,'bounded first-slice ACQUIRE Action valid');
select throws_ok($q$update public.trip_source_actions set action='LINK';$q$,'23514',null,'LINK future family disabled');
select throws_ok($q$update public.trip_source_actions set action='UNLINK';$q$,'23514',null,'UNLINK future family disabled');
select throws_ok($q$update public.trip_source_actions set action='RELINK';$q$,'23514',null,'RELINK future family disabled');
select throws_ok($q$update public.trip_source_actions set action='TARGET_DELETE';$q$,'23514',null,'TARGET_DELETE future family disabled');
select throws_ok($q$update public.trip_source_actions set run_id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'run_id future selector null');
select throws_ok($q$update public.trip_source_actions set candidate_id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'candidate_id future selector null');
select throws_ok($q$update public.trip_source_actions set slot_id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'slot_id future selector null');
select throws_ok($q$update public.trip_source_actions set association_id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'association_id future selector null');
select throws_ok($q$update public.trip_source_actions set confirmation_id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'confirmation_id future selector null');
select throws_ok($q$update public.trip_source_actions set action='MARK_LOST',reason_code='VERIFIED_LOSS';$q$,'23514',null,'MARK_LOST requires Representation');
select throws_ok($q$update public.trip_source_revisions set original_representation_ids=array(select md5(i::text)::uuid from generate_series(1,65) i);$q$,'23514',null,'manifest count capped at 64');
select throws_ok($q$update public.trip_source_representations set parent_ids=array[array['9c000000-0000-4000-8000-000000000002'::uuid]] where id='9c000000-0000-4000-8000-000000000010';$q$,'23514',null,'multidimensional lineage rejected');
select lives_ok($q$insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,locator_uri,parent_ids,transform_key,transform_version,transform_options_sha256,regenerability,created_at,remote_state) values ('9c000000-0000-4000-8000-000000000050',1,'9c000000-0000-4000-8000-000000000001',1,'DERIVED','LOCATOR','UTF-8',encode(extensions.digest('https://example.invalid/path','sha256'),'hex'),octet_length('https://example.invalid/path'),'https://example.invalid/path',array['9c000000-0000-4000-8000-000000000002'::uuid],'locator','1',repeat('a',64),'IMPOSSIBLE','2026-01-02','NOT_APPLICABLE');set constraints all immediate;set constraints all deferred;$q$,'valid LOCATOR exact UTF-8 integrity');
select throws_ok($q$update public.trip_source_representations set locator_uri='file:///private/path' where id='9c000000-0000-4000-8000-000000000050';$q$,'23514',null,'LOCATOR excludes filesystem URI');
select throws_ok($q$update public.trip_source_representations set text_content='x' where id='9c000000-0000-4000-8000-000000000050';$q$,'23514',null,'LOCATOR TEXT exclusivity');
select throws_ok($q$insert into public.trip_source_revisions(source_id,material_revision,previous_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) values ('9c000000-0000-4000-8000-000000000001',3,1,'2026-01-02','00000000-0000-4000-8000-000000000001','gap',repeat('a',64),array['9c000000-0000-4000-8000-000000000002'::uuid],'AS_SUPPLIED','REPLACEMENT');$q$,'23514',null,'later revision chain cannot skip previous revision');
select lives_ok($q$update public.trip_source_representations set retention_state='PAYLOAD_PURGED',remote_state='PURGED' where id='9c000000-0000-4000-8000-000000000004';set constraints all immediate;set constraints all deferred;$q$,'binary purge structure retains integrity metadata');
select lives_ok($q$update public.trip_source_representations set retention_state='PAYLOAD_PURGED',text_content=null where id='9c000000-0000-4000-8000-000000000002';set constraints all immediate;set constraints all deferred;$q$,'inline purge retains descriptor without binary state');
select lives_ok($q$update public.trip_source_representations set retention_state='IDENTITY_ONLY',payload_sha256=null,byte_count=null where id='9c000000-0000-4000-8000-000000000002';set constraints all immediate;set constraints all deferred;$q$,'explicit identity-only structural exception');
-- P2: bounded shared-ancestor regressions. All fixture writes are trusted-owner
-- setup with BOTH mutation fences disabled, and rollback with this test transaction.
create function pg_temp.source_dag_id(label text, node integer) returns uuid
language sql immutable set search_path=pg_catalog
as $$select md5('ci3b-p2/'||label||'/'||node::text)::uuid$$;
create function pg_temp.seed_source_dag(label text, nodes integer) returns double precision
language plpgsql set search_path=pg_catalog as $$
declare sid uuid:=md5('ci3b-p2/'||label||'/source')::uuid; started timestamptz:=clock_timestamp();
begin
 insert into public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,
  source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision)
 values(sid,'10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  label,repeat('a',64),'TEXT','PASTE','UNKNOWN','2026-01-01',1,1);
 insert into public.trip_source_revisions(source_id,material_revision,created_at,created_by,
  operation_key,capture_sha256,original_representation_ids,completeness,reason)
 values(sid,1,'2026-01-01','00000000-0000-4000-8000-000000000001',label,repeat('b',64),
  array[pg_temp.source_dag_id(label,0)],'AS_SUPPLIED','ACQUISITION');
 insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,
  role,material_kind,encoding,payload_sha256,byte_count,text_content,parent_ids,transform_key,
  transform_version,transform_options_sha256,regenerability,created_at,remote_state)
 select pg_temp.source_dag_id(label,i),1,sid,1,case when i=0 then 'ORIGINAL' else 'DERIVED' end,
  'TEXT','UTF-8',encode(extensions.digest('x','sha256'),'hex'),1,'x',
  array(select pg_temp.source_dag_id(label,j) from generate_series(greatest(0,i-2),i-1) j order by 1),
  case when i>0 then 'test' end,case when i>0 then '1' end,case when i>0 then repeat('a',64) end,
  case when i=0 then 'NOT_APPLICABLE' else 'IMPOSSIBLE' end,
  case when i=0 then '2026-01-01'::timestamptz else '2026-01-02'::timestamptz end,'NOT_APPLICABLE'
 from generate_series(0,nodes-1) i;
 -- Flush every queued aggregate trigger, not just a synthetic closure query.
 set constraints all immediate;
 set constraints all deferred;
 return extract(epoch from clock_timestamp()-started)*1000;
end$$;
create temporary table ci3b_dag_ms(nodes integer primary key, elapsed_ms double precision);
set local statement_timeout='3s';
select lives_ok($q$insert into ci3b_dag_ms select 31,pg_temp.seed_source_dag('p2-fibonacci31',31);$q$,'reviewer 31-node Fibonacci DAG completes under 3s timeout');
select lives_ok($q$insert into ci3b_dag_ms select 128,pg_temp.seed_source_dag('p2-fibonacci128',128);$q$,'128-node shared-ancestor DAG completes under 3s timeout');
select ok((select elapsed_ms<1500 from ci3b_dag_ms where nodes=31),'31-node full aggregate flush comfortably below timeout (1500ms)');
select ok((select elapsed_ms<1500 from ci3b_dag_ms where nodes=128),'128-node full aggregate flush comfortably below timeout (1500ms)');
select diag('P2 DAG '||nodes||' nodes: '||round(elapsed_ms::numeric,3)||' ms') from ci3b_dag_ms order by nodes;
select lives_ok($q$select pg_temp.seed_source_dag('p2-diamond',4);
 update public.trip_source_representations set parent_ids=array[pg_temp.source_dag_id('p2-diamond',0)] where id=pg_temp.source_dag_id('p2-diamond',2);
 set constraints all immediate;set constraints all deferred;$q$,'diamond DAG with shared original passes');
select throws_ok($q$update public.trip_source_representations set parent_ids=array[pg_temp.source_dag_id('p2-diamond',3)] where id=pg_temp.source_dag_id('p2-diamond',1);set constraints all immediate;$q$,'23514',null,'small two-node cycle rejects');
select throws_ok($q$update public.trip_source_representations set parent_ids=array[pg_temp.source_dag_id('p2-fibonacci128',127)] where id=pg_temp.source_dag_id('p2-fibonacci128',1);set constraints all immediate;$q$,'23514',null,'long indirect cycle rejects without path enumeration');
select throws_ok($q$update public.trip_source_representations set parent_ids=array['9c000000-0000-4000-8000-000000000098'::uuid] where id=pg_temp.source_dag_id('p2-diamond',1);set constraints all immediate;$q$,'23514',null,'missing derived parent remains fail-closed');
select throws_ok($q$update public.trip_sources set current_material_revision=2 where id=md5('ci3b-p2/p2-diamond/source')::uuid;
 insert into public.trip_source_revisions(source_id,material_revision,previous_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason)
 values(md5('ci3b-p2/p2-diamond/source')::uuid,2,1,'2026-01-02','00000000-0000-4000-8000-000000000001','p2-diamond-next',repeat('b',64),array[pg_temp.source_dag_id('p2-diamond',0)],'AS_SUPPLIED','ADD_PART');
 update public.trip_source_representations set introduced_revision=2 where id=pg_temp.source_dag_id('p2-diamond',1);set constraints all immediate;$q$,'23514',null,'parent introduced after child remains rejected');
select throws_ok($q$update public.trip_source_representations set created_at='2026-01-03' where id=pg_temp.source_dag_id('p2-diamond',1);set constraints all immediate;$q$,'23514',null,'parent descriptor later than child remains rejected');
set local statement_timeout=0;
-- An isolated Trip/Account has no financial or temporal rows: only Source blocks deletion.
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values ('9c000000-0000-4000-8000-000000000030','source-only@otr.invalid','{}','{}');
insert into public.profiles(id,display_name) values ('9c000000-0000-4000-8000-000000000030','Source-only synthetic Account');
insert into public.trips(id,name,created_by) values ('9c000000-0000-4000-8000-000000000031','Source-only delete fixture','00000000-0000-4000-8000-000000000001');
insert into public.trip_sources(id,trip_id,acquired_by,acquisition_key,acquisition_sha256,source_kind,acquisition_channel,capture_time_basis,created_at,current_material_revision,row_revision) values ('9c000000-0000-4000-8000-000000000032','9c000000-0000-4000-8000-000000000031','9c000000-0000-4000-8000-000000000030','delete-only',repeat('a',64),'TEXT','PASTE','UNKNOWN','2026-01-01',1,1);
insert into public.trip_source_revisions(source_id,material_revision,created_at,created_by,operation_key,capture_sha256,original_representation_ids,completeness,reason) values ('9c000000-0000-4000-8000-000000000032',1,'2026-01-01','9c000000-0000-4000-8000-000000000030','delete-only',repeat('b',64),array['9c000000-0000-4000-8000-000000000033'::uuid],'AS_SUPPLIED','ACQUISITION');
insert into public.trip_source_representations(id,row_revision,source_id,introduced_revision,role,material_kind,encoding,payload_sha256,byte_count,text_content,regenerability,created_at,remote_state) values ('9c000000-0000-4000-8000-000000000033',1,'9c000000-0000-4000-8000-000000000032',1,'ORIGINAL','TEXT','UTF-8',encode(extensions.digest('x','sha256'),'hex'),1,'x','NOT_APPLICABLE','2026-01-01','NOT_APPLICABLE');
set constraints all immediate;
set constraints all deferred;
create temporary table ci3b_finance_before as select jsonb_build_object('expenses',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.expenses r),
'expense_participants',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.expense_participants r),
'expense_splits',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.expense_splits r),
'settlement_valuation_snapshots',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.settlement_valuation_snapshots r),
'ledger_settings',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.ledger_settings r),
'personal_settlement_payment_records',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.personal_settlement_payment_records r),
'personal_settlement_payment_read_grants',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.personal_settlement_payment_read_grants r),
'receipt_assets',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.receipt_assets r),
'ledger_changes',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.ledger_changes r),
'journey_members',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.journey_members r)) value;
alter table public.trip_sources enable trigger trip_source_mutation_guard;
alter table public.trip_sources enable trigger trip_source_statement_guard;
alter table public.trip_source_revisions enable trigger trip_source_mutation_guard;
alter table public.trip_source_revisions enable trigger trip_source_statement_guard;
alter table public.trip_source_representations enable trigger trip_source_mutation_guard;
alter table public.trip_source_representations enable trigger trip_source_statement_guard;
alter table public.trip_source_actions enable trigger trip_source_mutation_guard;
alter table public.trip_source_actions enable trigger trip_source_statement_guard;
select ok((select rolbypassrls from pg_roles where rolname='service_role'),'P2 service_role is actual BYPASSRLS');
select ok((select rolsuper or rolbypassrls from pg_roles where rolname='postgres'),'P2 existing privileged test owner bypasses RLS');
select ok((select tgtype=62 from pg_trigger where tgrelid='public.trip_sources'::regclass and tgname='trip_source_statement_guard'),'P2 trip_sources BEFORE statement fence covers all four mutation events');
select ok((select tgtype=62 from pg_trigger where tgrelid='public.trip_source_revisions'::regclass and tgname='trip_source_statement_guard'),'P2 trip_source_revisions BEFORE statement fence covers all four mutation events');
select ok((select tgtype=62 from pg_trigger where tgrelid='public.trip_source_representations'::regclass and tgname='trip_source_statement_guard'),'P2 trip_source_representations BEFORE statement fence covers all four mutation events');
select ok((select tgtype=62 from pg_trigger where tgrelid='public.trip_source_actions'::regclass and tgname='trip_source_statement_guard'),'P2 trip_source_actions BEFORE statement fence covers all four mutation events');
grant select,insert,update,delete,truncate on public.trip_sources to service_role;
grant select,insert,update,delete,truncate on public.trip_source_revisions to service_role;
grant select,insert,update,delete,truncate on public.trip_source_representations to service_role;
grant select,insert,update,delete,truncate on public.trip_source_actions to service_role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"otr_trip_source_writer"}',true);
select set_config('otr.trip_source_writer','true',true);
select throws_ok($q$update public.trip_sources set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_sources where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_sources select * from public.trip_sources where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_sources set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_sources;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_sources select * from public.trip_sources;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_sources cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_sources TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_revisions set source_id=source_id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_revisions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_revisions select * from public.trip_source_revisions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_revisions set source_id=source_id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_revisions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_revisions select * from public.trip_source_revisions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_revisions cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_revisions TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_representations set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_representations where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_representations select * from public.trip_source_representations where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_representations set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_representations;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_representations select * from public.trip_source_representations;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_representations cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_representations TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_actions set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_actions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_actions select * from public.trip_source_actions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_actions set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_actions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_actions select * from public.trip_source_actions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_actions cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 service_role: trip_source_actions TRUNCATE rejects despite temporary privileges/JWT/GUC');
reset role;
revoke all on public.trip_sources from service_role;
revoke all on public.trip_source_revisions from service_role;
revoke all on public.trip_source_representations from service_role;
revoke all on public.trip_source_actions from service_role;
grant select,insert,update,delete,truncate on public.trip_sources to otr_trip_source_writer;
grant select,insert,update,delete,truncate on public.trip_source_revisions to otr_trip_source_writer;
grant select,insert,update,delete,truncate on public.trip_source_representations to otr_trip_source_writer;
grant select,insert,update,delete,truncate on public.trip_source_actions to otr_trip_source_writer;
-- Trusted test owner temporarily obtains SET ROLE only inside this rollback transaction.
grant usage on schema public,extensions to otr_trip_source_writer;
grant otr_trip_source_writer to postgres with set true;
set local role otr_trip_source_writer;
select set_config('request.jwt.claims','{"role":"otr_trip_source_writer"}',true);
select set_config('otr.trip_source_writer','true',true);
select throws_ok($q$update public.trip_sources set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_sources where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_sources select * from public.trip_sources where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_sources set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_sources;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_sources select * from public.trip_sources;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_sources cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_sources TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_revisions set source_id=source_id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_revisions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_revisions select * from public.trip_source_revisions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_revisions set source_id=source_id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_revisions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_revisions select * from public.trip_source_revisions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_revisions cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_revisions TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_representations set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_representations where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_representations select * from public.trip_source_representations where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_representations set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_representations;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_representations select * from public.trip_source_representations;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_representations cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_representations TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_actions set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_actions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_actions select * from public.trip_source_actions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_actions set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_actions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_actions select * from public.trip_source_actions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_actions cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 otr_trip_source_writer: trip_source_actions TRUNCATE rejects despite temporary privileges/JWT/GUC');
reset role;
revoke all on public.trip_sources from otr_trip_source_writer;
revoke all on public.trip_source_revisions from otr_trip_source_writer;
revoke all on public.trip_source_representations from otr_trip_source_writer;
revoke all on public.trip_source_actions from otr_trip_source_writer;
grant otr_trip_source_writer to postgres with set false;
revoke usage on schema public,extensions from otr_trip_source_writer;
select ok(not pg_has_role('postgres','otr_trip_source_writer','SET'),'test-only writer SET ROLE path restored to disabled');
grant select,insert,update,delete,truncate on public.trip_sources to postgres;
grant select,insert,update,delete,truncate on public.trip_source_revisions to postgres;
grant select,insert,update,delete,truncate on public.trip_source_representations to postgres;
grant select,insert,update,delete,truncate on public.trip_source_actions to postgres;
set local role postgres;
select set_config('request.jwt.claims','{"role":"otr_trip_source_writer"}',true);
select set_config('otr.trip_source_writer','true',true);
select throws_ok($q$update public.trip_sources set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_sources where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_sources select * from public.trip_sources where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_sources set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_sources;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_sources select * from public.trip_sources;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_sources cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_sources TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_revisions set source_id=source_id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_revisions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_revisions select * from public.trip_source_revisions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_revisions set source_id=source_id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_revisions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_revisions select * from public.trip_source_revisions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_revisions cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_revisions TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_representations set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_representations where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_representations select * from public.trip_source_representations where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_representations set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_representations;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_representations select * from public.trip_source_representations;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_representations cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_representations TRUNCATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_actions set id=id where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions zero-row UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_actions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions zero-row DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_actions select * from public.trip_source_actions where false;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions zero-row INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$update public.trip_source_actions set id=id;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions populated UPDATE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$delete from public.trip_source_actions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions populated DELETE rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$insert into public.trip_source_actions select * from public.trip_source_actions;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions populated INSERT rejects despite temporary privileges/JWT/GUC');
select throws_ok($q$truncate public.trip_source_actions cascade;$q$,'42501','TRIP_SOURCE_COMMANDS_DISABLED','P2 postgres: trip_source_actions TRUNCATE rejects despite temporary privileges/JWT/GUC');
reset role;
select throws_ok($q$update public.trip_sources set row_revision=row_revision;$q$,'42501',null,'trip_sources direct owner no-op mutation blocked');
select throws_ok($q$delete from public.trip_sources;$q$,'42501',null,'trip_sources physical delete blocked');
select throws_ok($q$truncate public.trip_sources cascade;$q$,'42501',null,'trip_sources runtime truncate guard');
select throws_ok($q$update public.trip_source_revisions set created_at=created_at;$q$,'42501',null,'trip_source_revisions direct owner no-op mutation blocked');
select throws_ok($q$delete from public.trip_source_revisions;$q$,'42501',null,'trip_source_revisions physical delete blocked');
select throws_ok($q$truncate public.trip_source_revisions cascade;$q$,'42501',null,'trip_source_revisions runtime truncate guard');
select throws_ok($q$update public.trip_source_representations set row_revision=row_revision;$q$,'42501',null,'trip_source_representations direct owner no-op mutation blocked');
select throws_ok($q$delete from public.trip_source_representations;$q$,'42501',null,'trip_source_representations physical delete blocked');
select throws_ok($q$truncate public.trip_source_representations cascade;$q$,'42501',null,'trip_source_representations runtime truncate guard');
select throws_ok($q$update public.trip_source_actions set occurred_at=occurred_at;$q$,'42501',null,'trip_source_actions direct owner no-op mutation blocked');
select throws_ok($q$delete from public.trip_source_actions;$q$,'42501',null,'trip_source_actions physical delete blocked');
select throws_ok($q$truncate public.trip_source_actions cascade;$q$,'42501',null,'trip_source_actions runtime truncate guard');
select set_config('request.jwt.claims','{"role":"otr_trip_source_writer"}',true);
select throws_ok($q$update public.trip_sources set trip_id='9c000000-0000-4000-8000-000000000031';$q$,'42501',null,'Source Trip immutable');
select throws_ok($q$update public.trip_sources set acquired_by='00000000-0000-4000-8000-000000000002';$q$,'42501',null,'Source Account immutable');
select throws_ok($q$update public.trip_sources set row_revision=row_revision;$q$,'42501',null,'JWT cannot authorize Source mutation');
select throws_ok($q$delete from public.trips where id='9c000000-0000-4000-8000-000000000031';$q$,'23503',null,'Source Trip RESTRICT deletion impact explicit');
select throws_ok($q$delete from auth.users where id='9c000000-0000-4000-8000-000000000030';$q$,'23503',null,'Source Account RESTRICT deletion impact explicit');
set local role anon;
select throws_ok($q$select * from public.trip_sources;$q$,'42501',null,'anon cannot read private trip_sources');
select throws_ok($q$select * from public.trip_source_revisions;$q$,'42501',null,'anon cannot read private trip_source_revisions');
select throws_ok($q$select * from public.trip_source_representations;$q$,'42501',null,'anon cannot read private trip_source_representations');
select throws_ok($q$select * from public.trip_source_actions;$q$,'42501',null,'anon cannot read private trip_source_actions');
select throws_ok($q$set role otr_trip_source_writer;$q$,'42501',null,'anon cannot SET ROLE writer');
reset role;
set local role authenticated;
select throws_ok($q$select * from public.trip_sources;$q$,'42501',null,'authenticated cannot read private trip_sources');
select throws_ok($q$select * from public.trip_source_revisions;$q$,'42501',null,'authenticated cannot read private trip_source_revisions');
select throws_ok($q$select * from public.trip_source_representations;$q$,'42501',null,'authenticated cannot read private trip_source_representations');
select throws_ok($q$select * from public.trip_source_actions;$q$,'42501',null,'authenticated cannot read private trip_source_actions');
select throws_ok($q$set role otr_trip_source_writer;$q$,'42501',null,'authenticated cannot SET ROLE writer');
reset role;
set local role service_role;
select throws_ok($q$select * from public.trip_sources;$q$,'42501',null,'service_role cannot read private trip_sources');
select throws_ok($q$select * from public.trip_source_revisions;$q$,'42501',null,'service_role cannot read private trip_source_revisions');
select throws_ok($q$select * from public.trip_source_representations;$q$,'42501',null,'service_role cannot read private trip_source_representations');
select throws_ok($q$select * from public.trip_source_actions;$q$,'42501',null,'service_role cannot read private trip_source_actions');
select throws_ok($q$set role otr_trip_source_writer;$q$,'42501',null,'service_role cannot SET ROLE writer');
reset role;
grant select,insert,update,delete on public.trip_sources to service_role;
grant select,insert,update,delete on public.trip_source_revisions to service_role;
grant select,insert,update,delete on public.trip_source_representations to service_role;
grant select,insert,update,delete on public.trip_source_actions to service_role;
set local role service_role;
select throws_ok($q$update public.trip_sources set row_revision=2;$q$,'42501',null,'BYPASSRLS with temporary DML grant cannot write semantic state');
select throws_ok($q$update public.trip_source_representations set payload_sha256=repeat('d',64) where id='9c000000-0000-4000-8000-000000000002';$q$,'42501',null,'BYPASSRLS cannot rewrite material');
select throws_ok($q$insert into public.trip_source_actions(id,source_id,actor_account_id,operation_key,operation_sha256,action,occurred_at,source_row_revision,material_revision,reason_code) values ('9c000000-0000-4000-8000-000000000021','9c000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','act2',repeat('a',64),'ACQUIRE','2026-01-01',1,1,'USER_REQUEST');$q$,'42501',null,'BYPASSRLS cannot append fake Action');
select throws_ok($q$delete from public.trip_source_revisions;$q$,'42501',null,'BYPASSRLS cannot delete history');
reset role;
revoke all on public.trip_sources from service_role;
revoke all on public.trip_source_revisions from service_role;
revoke all on public.trip_source_representations from service_role;
revoke all on public.trip_source_actions from service_role;
insert into storage.objects(bucket_id,name) values ('trip-source-material','v1/10000000-0000-4000-8000-000000000001/9c000000-0000-4000-8000-000000000003/9c000000-0000-4000-8000-000000000004/payload');
-- Existing Storage API delete context only; Source RLS still denies every client row.
select set_config('storage.allow_delete_query','true',true);
create policy ci3b_test_objects_allow on storage.objects for all to anon,authenticated using(true) with check(true);
create policy ci3b_test_buckets_allow on storage.buckets for all to anon,authenticated using(true) with check(true);
set local role anon;
select ok((select count(*)=0 from storage.objects where bucket_id='trip-source-material'),'anon direct Source object list/read denied');
select ok((select count(*)=0 from storage.buckets where id='trip-source-material'),'anon Source bucket metadata denied');
select throws_ok($q$insert into storage.objects(bucket_id,name) values ('trip-source-material','forbidden');$q$,'42501',null,'anon Source object write denied');
with changed as (delete from storage.objects where bucket_id='trip-source-material' returning *) select ok((select count(*)=0 from changed),'anon Source object delete denied');
with changed as (update storage.objects set name='rewritten' where bucket_id='trip-source-material' returning *) select ok((select count(*)=0 from changed),'anon Source object update denied');
reset role;
set local role authenticated;
select ok((select count(*)=0 from storage.objects where bucket_id='trip-source-material'),'authenticated direct Source object list/read denied');
select ok((select count(*)=0 from storage.buckets where id='trip-source-material'),'authenticated Source bucket metadata denied');
select throws_ok($q$insert into storage.objects(bucket_id,name) values ('trip-source-material','forbidden');$q$,'42501',null,'authenticated Source object write denied');
with changed as (delete from storage.objects where bucket_id='trip-source-material' returning *) select ok((select count(*)=0 from changed),'authenticated Source object delete denied');
with changed as (update storage.objects set name='rewritten' where bucket_id='trip-source-material' returning *) select ok((select count(*)=0 from changed),'authenticated Source object update denied');
reset role;
select ok(jsonb_build_object('expenses',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.expenses r),'expense_participants',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.expense_participants r),'expense_splits',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.expense_splits r),'settlement_valuation_snapshots',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.settlement_valuation_snapshots r),'ledger_settings',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.ledger_settings r),'personal_settlement_payment_records',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.personal_settlement_payment_records r),'personal_settlement_payment_read_grants',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.personal_settlement_payment_read_grants r),'receipt_assets',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.receipt_assets r),'ledger_changes',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.ledger_changes r),'journey_members',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.journey_members r))=(select value from ci3b_finance_before),'meaningful receipt and financial rows remain byte equivalent');
select ok(jsonb_build_object('bucket',(select to_jsonb(b) from storage.buckets b where id='ledger-receipts'),'grants',(select relacl::text from pg_class where oid='public.receipt_assets'::regclass),'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where tablename='receipt_assets'),'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid='public.receipt_assets'::regclass and not tgisinternal))=(select value from ci3b_receipt_before),'receipt bucket grants policies and triggers unchanged');
select * from finish();
rollback;
