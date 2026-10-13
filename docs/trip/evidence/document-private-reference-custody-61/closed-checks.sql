begin;
select not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}' from public.trip_core_activation_gate;
select relrowsecurity from pg_class where oid='public.trip_operational_document_custody'::regclass;
select bool_and(not has_table_privilege(role,'public.trip_operational_document_custody','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from (values ('anon'),('authenticated'),('service_role'),('otr_trip_core_v2_gateway')) p(role);
select has_table_privilege('otr_trip_core_v2_writer','public.trip_operational_document_custody','SELECT,INSERT,UPDATE') and not has_table_privilege('otr_trip_core_v2_writer','public.trip_operational_document_custody','DELETE,TRUNCATE');
select count(*)=3 and bool_and(proconfig=array['search_path=pg_catalog']) from pg_proc where oid in ('public.trip_document_private_custody_guard()'::regprocedure,'public.trip_document_bind_private_custody()'::regprocedure,'public.trip_core_guard_write()'::regprocedure);
select bool_and(not has_function_privilege(role,'public.trip_document_private_custody_guard()','EXECUTE') and not has_function_privilege(role,'public.trip_document_bind_private_custody()','EXECUTE')) from (values ('anon'),('authenticated'),('service_role'),('otr_trip_core_v2_gateway')) p(role);
select array_agg(tgname::text order by tgname)=array['core_private_custody_gate','private_custody_identity'] and bool_and(tgenabled='O') from pg_trigger where tgrelid='public.trip_operational_document_custody'::regclass and not tgisinternal;
select array_position(names,'core_v2_write_guard')<array_position(names,'document_bind_private_custody') from (select array_agg(tgname::text order by tgname) names from pg_trigger where tgrelid='public.trip_operational_documents'::regclass and not tgisinternal) t;
select condeferrable and condeferred and convalidated from pg_constraint where conrelid='public.trip_operational_documents'::regclass and conname='document_owning_custody_fk';
select count(*)=0 from public.trip_operational_document_custody;
set session authorization otr_trip_core_v2_gateway;
set local role otr_trip_core_v2_writer;
select set_config('otr.core.actor','dc610000-0000-4000-8000-000000000001',true) is not null and set_config('otr.core.trip','dc610000-0000-4000-8000-000000000002',true) is not null;
do $$declare error_text text;begin
 begin
 insert into public.trip_operational_document_custody(id,document_id,trip_id,actor_account_id,source_representation_id,custody,sha256,byte_size,media_type,state,verified_at)
 values('dc610000-0000-4000-8000-000000000003','dc610000-0000-4000-8000-000000000004','dc610000-0000-4000-8000-000000000002','dc610000-0000-4000-8000-000000000001','dc610000-0000-4000-8000-000000000005','PRIVATE_SOURCE_REFERENCE',repeat('0',64),1,'text/plain','VERIFIED',clock_timestamp());
 raise exception 'CLOSED_INSERT_UNEXPECTEDLY_ACCEPTED';
 exception when insufficient_privilege then
 get stacked diagnostics error_text=message_text;
 if error_text<>'CORE_V2_CAPABILITY_CLOSED' then raise exception 'WRONG_CLOSED_REJECTION';end if;
 end;
end $$;
reset role;
reset session authorization;
select count(*)=0 from public.trip_operational_document_custody;
select not runtime_enabled and enabled_commands='{}' and enabled_families='{}' and enabled_admission_modes='{}' from public.trip_core_activation_gate;
rollback;
