-- Read-only metadata only, single result envelope for the existing management transport.
begin read only;
set local statement_timeout='5000ms';
select jsonb_build_object(
'check_1', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select current_database(),current_user,version()) v),
'check_2', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select p.oid::regprocedure::text as function_name,md5(p.prosrc) as body_md5,
       p.proowner::regrole::text as owner,p.prosecdef,p.proconfig,p.proacl::text
from pg_proc p where p.oid in (
 to_regprocedure('public.trip_source_read_import_catalogs(uuid,uuid)'),
 to_regprocedure('public.trip_source_command_codec(text)'),
 to_regprocedure('public.trip_source_register(text,uuid,text)'),
 to_regprocedure('public.cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean)'),
 to_regprocedure('public.cp_llm_guard_model_task_admissions()'),
 to_regprocedure('public.external_integration_mark_dispatch(jsonb,jsonb)'))) v),
'check_3', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select rolname,rolcanlogin,rolconnlimit,rolvaliduntil,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
from pg_roles where rolname in ('otr_trip_source_command_gateway','otr_trip_source_writer',
 'otr_external_integration_call_gateway','otr_external_integration_meter_writer',
 'otr_external_integration_reader','otr_trip_publication_catalog_reader')) v),
'check_4', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select name,to_regclass('public.'||name)::text as existing_relation
from (values ('trip_source_universal_scope'),('universal_import_provider_scope'),
 ('trip_source_runs'),('model_task_admissions'),('external_integration_calls')) n(name)) v),
'check_5', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole::text,c.relacl::text
from pg_class c where c.oid in (to_regclass('public.trip_source_universal_scope'),to_regclass('public.universal_import_provider_scope'))) v),
'check_6', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select r.rolname,has_schema_privilege(r.rolname,'public','CREATE') as has_public_create
from pg_roles r where r.rolname in ('otr_trip_source_writer','otr_external_integration_meter_writer','otr_external_integration_reader')) v),
'check_7', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select environment,kill_switch from public.external_integration_environment_state where environment='DEV') v),
'check_8', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select integration_id,environment,enabled,kill_switch from public.external_integrations where environment='DEV' order by integration_id limit 32) v),
'check_9', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select provider_config_id,integration_id,provider_class,network_required,privacy_policy,
 data_region,routing_class,schema_output,modalities,capabilities,schema_contracts
from public.intelligence_provider_configs order by provider_config_id limit 32) v),
'check_10', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select price_schedule_id,integration_id,provider_id,model_id,currency,schedule_sha256
from public.external_integration_price_schedules where provider_id='DeepSeek' order by price_schedule_id limit 32) v),
'check_11', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (select price_schedule_id,measurement_unit,price_per_quantity,unit_quantity,unit_definition
from public.external_integration_price_schedule_units
where price_schedule_id in (select price_schedule_id from public.external_integration_price_schedules where provider_id='DeepSeek')
order by price_schedule_id,measurement_unit limit 96) v)
) as qualification;
rollback;
