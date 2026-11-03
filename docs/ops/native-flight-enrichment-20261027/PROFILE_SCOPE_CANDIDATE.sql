-- NOT INSTALLED. Registered Enrichment scope only; no runtime, grant, money or Provider activation.
-- Import reserve/validator/dispatch definitions are not replaced. Shared request binder gets one pinned admin-kind addition.
begin;
do $$begin
 perform set_config('otr.enrichment_config_create_before',has_schema_privilege('otr_external_integration_config_writer','public','CREATE')::text,true);
end $$;
grant create on schema public to otr_external_integration_config_writer;
do $$declare expected record; actual text;
begin
 for expected in select * from (values
  ('flight_activation_scopes','flight_activation_scopes_workload_check','CHECK ((workload = ANY (ARRAY[''FLIGHT_IMPORT_V1''::text, ''UNIVERSAL_IMPORT_V1''::text])))'),
  ('flight_activation_scopes','flight_activation_scopes_expected_family_check','CHECK ((expected_family = ''DeepSeek-V4.1-Flash''::text))'),
  ('flight_activation_scopes','flight_activation_scopes_input_ceiling_check',$expected$CHECK (((input_ceiling >= 1) AND (input_ceiling <=
CASE workload
    WHEN 'UNIVERSAL_IMPORT_V1'::text THEN 32768
    ELSE 8192
END)))$expected$),
  ('flight_call_resource_holds','flight_call_resource_holds_input_ceiling_check','CHECK (((input_ceiling >= 1) AND (input_ceiling <= 32768)))'),
  ('flight_call_resource_holds','flight_call_resource_holds_output_ceiling_check','CHECK (((output_ceiling >= 1) AND (output_ceiling <= 4096)))')
 ) x(table_name,constraint_name,definition) loop
  select pg_get_constraintdef(oid) into actual from pg_constraint
  where conrelid=('public.'||expected.table_name)::regclass and conname=expected.constraint_name;
  if actual is distinct from expected.definition then raise exception 'ENRICHMENT_CONSTRAINT_BEFORE_PIN_REQUIRED';end if;
 end loop;
end $$;
-- Managed postgres has no inherited writer authority; replace only this pinned function as its existing owner.
set local role otr_external_integration_config_writer;
do $$declare d text; expected text:=current_setting('otr.enrichment_cp14_bind_before_sha256',true);
 marker text:='''flight_activation_account_grant''';
begin
 d:=pg_get_functiondef('public.cp14_bind_request(jsonb,jsonb)'::regprocedure);
 if expected is null or expected !~ '^[a-f0-9]{64}$' or encode(extensions.digest(convert_to(d,'UTF8'),'sha256'),'hex')<>expected
 or position('''flight_enrichment_scope_select''' in d)>0 or (length(d)-length(replace(d,marker,'')))/length(marker)<>1
 then raise exception 'ENRICHMENT_BINDER_BEFORE_PIN_REQUIRED';end if;
 execute replace(d,marker,marker||',''flight_enrichment_scope_select''');
end $$;
reset role;
alter table public.flight_activation_scopes drop constraint flight_activation_scopes_workload_check;
alter table public.flight_activation_scopes drop constraint flight_activation_scopes_expected_family_check;
alter table public.flight_activation_scopes drop constraint flight_activation_scopes_input_ceiling_check;
alter table public.flight_activation_scopes add constraint enrichment_workload_bounds check (
 (workload='FLIGHT_IMPORT_V1' and expected_family='DeepSeek-V4.1-Flash' and input_ceiling between 1 and 8192)
 or (workload='UNIVERSAL_IMPORT_V1' and expected_family='DeepSeek-V4.1-Flash' and input_ceiling between 1 and 32768)
 or (workload='FLIGHT_ENRICHMENT_V1' and integration_id='otr-flight-enrichment-v1' and expected_family='DeepSeek-V4.1-Flash-1017' and input_ceiling between 1 and 24000
  and output_ceiling<=1200 and max_attempts=1 and currency is not null and currency='USD')
);
-- Preserve installed Universal 32768/4096 bounds; zero represents an Enrichment Search tool's token ceiling.
alter table public.flight_call_resource_holds drop constraint flight_call_resource_holds_input_ceiling_check;
alter table public.flight_call_resource_holds drop constraint flight_call_resource_holds_output_ceiling_check;
alter table public.flight_call_resource_holds add constraint enrichment_hold_input_bound check(input_ceiling between 0 and 32768);
alter table public.flight_call_resource_holds add constraint enrichment_hold_output_bound check(output_ceiling between 0 and 4096);
-- A tool has a provider but no LLM model. Limit this extension to the single new integration.
do $$declare c text; begin
 select conname into strict c from pg_constraint where conrelid='public.external_integration_price_schedules'::regclass
 and pg_get_constraintdef(oid)='CHECK (((provider_id IS NULL) = (model_id IS NULL)))';
 execute format('alter table public.external_integration_price_schedules drop constraint %I',c);
end $$;
alter table public.external_integration_price_schedules add constraint enrichment_search_price_identity check(
 (provider_id is null)=(model_id is null)
 or (integration_id='otr-flight-enrichment-v1' and provider_id='DeepSeek' and model_id is null)
);

create function public.cp_enrichment_profile() returns jsonb language sql immutable set search_path=pg_catalog as $$
 select '{"version":1,"consumer_id":"flight-enrichment","execution_scope":"FLIGHT_ENRICHMENT_V1","default_state":"CLOSED","package_sha256":"a31aeb4636fc2fc9ffe7ef9d540a8d96e77ab5b9c898a762ca1bb114ef38da3c","provider_id":"DeepSeek","model_id":"deepseek-flash","expected_family":"DeepSeek-V4.1-Flash-1017","accepted_returned_models":["deepseek-flash","DeepSeek-V4.1-Flash-1017"],"search_url":"https://api.deepseek.com/v1/tools/search","extraction_url":"https://api.deepseek.com/chat/completions","credential_reference":"vault:otr/dev/deepseek/flight-enrichment-v1","search_billable_unit":"successful_search_requests","max_search_calls":1,"max_llm_calls":1,"max_request_bytes":24000,"max_response_bytes":131072,"max_output_tokens":1200,"target_nanos":"10000000","currency":"USD"}'::jsonb
$$;
revoke all on function public.cp_enrichment_profile() from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp_enrichment_profile() to otr_external_integration_config_writer,otr_external_integration_meter_writer;

create function public.cp_enrichment_output_schema() returns jsonb language sql immutable set search_path=pg_catalog as $$
 select '{"id":"FLIGHT_ENRICHMENT_PROPOSAL_V1","version":1,"dialect":"OTR_PINNED_ZOD_V1","package_sha256":"a31aeb4636fc2fc9ffe7ef9d540a8d96e77ab5b9c898a762ca1bb114ef38da3c","source_sha256":"0481d15746de54ecff2e5cabc70c1a0ea511269743c589b12f5bbaf80f6ebaa7","symbol":"proposalSchema"}'::jsonb
$$;
revoke all on function public.cp_enrichment_output_schema() from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp_enrichment_output_schema() to otr_external_integration_config_writer,otr_external_integration_meter_writer;

create function public.cp_enrichment_prompt_sha256() returns text language sql immutable set search_path=pg_catalog as $$
 select '73beaf0f7382de2e13bd60f20a31e3a3fa26abb28f78aaf576f6a1b5c7eed1bc'::text
$$;
revoke all on function public.cp_enrichment_prompt_sha256() from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp_enrichment_prompt_sha256() to otr_external_integration_config_writer,otr_external_integration_meter_writer;

create function public.flight_enrichment_scope_select(context jsonb,command jsonb) returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare r public.flight_activation_scopes;v bigint;result jsonb;p public.intelligence_provider_configs;
begin
 if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','row'],array[]::text[])
 or command->>'version' is distinct from '1' or command->>'environment' is distinct from 'DEV'
 or command->>'integration_id' is distinct from 'otr-flight-enrichment-v1' then raise exception 'ENRICHMENT_SCOPE_INVALID';end if;
 perform public.cp14_context(context,command,'flight_enrichment_scope_select',array['otr_external_integration_admin_gateway'],'SECURITY_ADMIN');
 perform public.cp14_scope_lock('DEV',command->>'integration_id');
 result:=public.cp14_config_replay(context,command);if result is not null then return result;end if;
 r:=jsonb_populate_record(null::public.flight_activation_scopes,command->'row');
 if not public.cp14_keys(command->'row',array(select jsonb_object_keys(to_jsonb(r))),array[]::text[]) then raise exception 'ENRICHMENT_SCOPE_INVALID';end if;
 if exists(select 1 from public.flight_activation_scopes where scope_id=r.scope_id and integration_id<>r.integration_id)
 or exists(select 1 from public.flight_activation_scopes where integration_id=r.integration_id and scope_id<>r.scope_id) then raise exception 'ENRICHMENT_SCOPE_IDENTITY';end if;
 select coalesce(max(revision),0) into v from public.flight_activation_scopes where scope_id=r.scope_id;
 if v is distinct from (command->>'expected_version')::bigint or r.revision<>v+1 then raise exception 'ENRICHMENT_SCOPE_CAS';end if;
 if r.environment<>'DEV' or r.workload<>'FLIGHT_ENRICHMENT_V1' or r.integration_id<>command->>'integration_id'
 or r.currency is distinct from 'USD'
 or r.created_by is distinct from (context->>'verified_actor_id')::uuid or r.expires_at<=clock_timestamp()
 or r.scope_sha256<>public.cp14_hash(to_jsonb(r)-'scope_sha256') then raise exception 'ENRICHMENT_SCOPE_PIN';end if;
 if not public.cp14_keys(r.pins,array['adapter_version','prompt_sha256','envelope_version','envelope_sha256','output_schema_sha256','minimizer_version','minimizer_sha256','privacy_profile','privacy_sha256','policy_sha256','price_sha256','provider_config_sha256','search_price_schedule_id','search_price_sha256'],array[]::text[])
 or exists(select 1 from jsonb_each(r.pins) e where jsonb_typeof(e.value) is distinct from 'string')
 or exists(select 1 from jsonb_each_text(r.pins) e where
  (e.key in ('adapter_version','envelope_version','minimizer_version','privacy_profile') and e.value !~ '^[A-Za-z0-9._:-]{1,128}$')
  or (e.key='search_price_schedule_id' and e.value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  or (e.key not in ('adapter_version','envelope_version','minimizer_version','privacy_profile','search_price_schedule_id') and e.value !~ '^[0-9a-f]{64}$'))
 or r.pins->>'policy_sha256' is distinct from public.cp14_hash(public.cp_enrichment_profile())
 or r.pins->>'envelope_sha256' is distinct from public.cp_enrichment_profile()->>'package_sha256'
 or r.pins->>'output_schema_sha256' is distinct from public.cp14_hash(public.cp_enrichment_output_schema())
 or r.pins->>'prompt_sha256' is distinct from public.cp_enrichment_prompt_sha256()
 then raise exception 'ENRICHMENT_PROFILE_PIN';end if;
 select * into p from public.intelligence_provider_configs where provider_config_id=r.provider_config_id;
 if not found or p.integration_id<>r.integration_id or p.provider_id<>r.provider_id or p.model_id<>r.model_id
 or p.model_version<>r.expected_family or p.adapter_version<>r.pins->>'adapter_version'
 or p.configuration_sha256<>r.pins->>'provider_config_sha256'
 or p.provider_class<>'COMMERCIAL_REMOTE' or not p.network_required or p.privacy_policy<>'REMOTE_ALLOWED'
 or not ('EXTRACT'=any(p.capabilities)) or not ('TEXT'=any(p.modalities)) or not p.schema_output
 or not exists(select 1 from jsonb_array_elements(p.schema_contracts) contract where contract='{"id":"flight-enrichment","version":1,"dialect":"otr"}'::jsonb)
 then raise exception 'ENRICHMENT_PROVIDER_PIN';end if;
 if not exists(select 1 from public.external_integrations i where i.integration_id=r.integration_id and i.environment='DEV'
 and i.config_version=r.integration_version and i.config_sha256=r.configuration_sha256
 and i.credential_reference=public.cp_enrichment_profile()->>'credential_reference'
 and i.capabilities @> array['SEARCH','EXTRACT']) then raise exception 'ENRICHMENT_CONFIG_PIN';end if;
 if not exists(select 1 from public.external_integration_price_schedules price where price.price_schedule_id=r.price_schedule_id
 and price.schedule_sha256=r.pins->>'price_sha256' and price.currency='USD' and price.provider_id='DeepSeek'
 and price.model_id=r.model_id and price.integration_id=r.integration_id)
 or not exists(select 1 from public.external_integration_price_schedules price where price.price_schedule_id=(r.pins->>'search_price_schedule_id')::uuid
 and price.schedule_sha256=r.pins->>'search_price_sha256' and price.currency='USD' and price.provider_id='DeepSeek'
 and price.model_id is null and price.integration_id=r.integration_id) then raise exception 'ENRICHMENT_PRICE_PIN';end if;
 if (select count(*) from public.external_integration_price_schedule_units where price_schedule_id=r.price_schedule_id)<>3
 or (select count(distinct measurement_unit) from public.external_integration_price_schedule_units where price_schedule_id=r.price_schedule_id)<>3
 or exists(select 1 from public.external_integration_price_schedule_units where price_schedule_id=r.price_schedule_id
 and (measurement_unit not in ('input_tokens','cached_input_tokens','output_tokens') or unit_definition->>'relationship' is distinct from 'DISJOINT'
 or unit_definition->'billable' is distinct from 'true'::jsonb or unit_definition->>'included_in' is not null))
 then raise exception 'ENRICHMENT_EXTRACTION_PRICE_UNIT';end if;
 if (select count(*) from public.external_integration_price_schedule_units where price_schedule_id=(r.pins->>'search_price_schedule_id')::uuid)<>1
 or exists(select 1 from public.external_integration_price_schedule_units where price_schedule_id=(r.pins->>'search_price_schedule_id')::uuid
 and (measurement_unit<>'successful_search_requests' or unit_definition->>'relationship' is distinct from 'DISJOINT' or unit_definition->'billable' is distinct from 'true'::jsonb or unit_definition->>'included_in' is not null))
 then raise exception 'ENRICHMENT_SEARCH_PRICE_UNIT';end if;
 insert into public.flight_activation_scopes select r.*;
 perform public.cp14_audit(context,command,r.integration_id,'flight_scope',nullif(v,0),r.revision,null,r.scope_sha256,'CONFIG');
 return public.cp14_config_replay(context,command);
end $$;
alter function public.flight_enrichment_scope_select(jsonb,jsonb) owner to otr_external_integration_config_writer;
set local role otr_external_integration_config_writer;
revoke all on function public.flight_enrichment_scope_select(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.flight_enrichment_scope_select(jsonb,jsonb) to otr_external_integration_admin_gateway;
reset role;
do $$begin
 if current_setting('otr.enrichment_config_create_before')='false' then revoke create on schema public from otr_external_integration_config_writer;end if;
end $$;
commit;
