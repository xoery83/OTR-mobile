-- Stage II dormant candidate: reuse existing CP15 selection/grants/holds and
-- Model Task admission. No new scope, Call, Task or Usage authority table.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.flight_activation_scopes DROP CONSTRAINT flight_activation_scopes_workload_check,
 DROP CONSTRAINT flight_activation_scopes_input_ceiling_check,DROP CONSTRAINT flight_activation_scopes_output_ceiling_check;
ALTER TABLE public.flight_activation_scopes ADD CONSTRAINT flight_activation_scopes_workload_check CHECK(workload IN ('FLIGHT_IMPORT_V1','UNIVERSAL_IMPORT_V1')),
 ADD CONSTRAINT flight_activation_scopes_input_ceiling_check CHECK(input_ceiling BETWEEN 1 AND CASE workload WHEN 'UNIVERSAL_IMPORT_V1' THEN 32768 ELSE 8192 END),
 ADD CONSTRAINT flight_activation_scopes_output_ceiling_check CHECK(output_ceiling BETWEEN 1 AND CASE workload WHEN 'UNIVERSAL_IMPORT_V1' THEN 4096 ELSE 2048 END);
ALTER TABLE public.flight_call_resource_holds DROP CONSTRAINT flight_call_resource_holds_input_ceiling_check,DROP CONSTRAINT flight_call_resource_holds_output_ceiling_check;
ALTER TABLE public.flight_call_resource_holds ADD CONSTRAINT flight_call_resource_holds_input_ceiling_check CHECK(input_ceiling BETWEEN 1 AND 32768),
 ADD CONSTRAINT flight_call_resource_holds_output_ceiling_check CHECK(output_ceiling BETWEEN 1 AND 4096);
-- Metadata-only Source qualification for the existing protected Meter principal.
-- No Source original is disclosed or manufactured here.
CREATE FUNCTION public.universal_import_source_current(actor uuid,trip uuid,batch uuid,task uuid,input_sha text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r public.trip_source_runs;actual text;BEGIN
 IF session_user<>'otr_external_integration_call_gateway' OR NOT public.trip_sustained_universal_allowed(actor,trip) THEN RETURN false;END IF;
 SELECT * INTO r FROM public.trip_source_runs WHERE actor_account_id=actor AND trip_id=trip AND capture_batch_id=batch AND interpretation_task_id=task;
 IF NOT FOUND OR r.state='FAILED' OR r.retention_state<>'RETAINED' OR r.superseded_by IS NOT NULL OR r.extractor_key<>'otr-universal-interpretation-v1' THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.trip_source_inputs i WHERE i.run_id=r.id AND NOT public.trip_import_input_valid(i,actor,trip,true)) THEN RETURN false;END IF;
 SELECT public.cp14_hash(jsonb_agg(jsonb_build_object('kind','SOURCE','source_id',i.source_id,'material_revision',i.material_revision,'representation_id',i.representation_id,'payload_sha256',i.payload_sha256,'byte_count',i.byte_count,'input_id',i.id,'transform_sha256',null) ORDER BY i.id)) INTO actual FROM public.trip_source_inputs i WHERE i.run_id=r.id;
 RETURN actual IS NOT NULL AND actual=input_sha;
END $$;
REVOKE ALL ON FUNCTION public.universal_import_source_current(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.universal_import_source_current(uuid,uuid,uuid,uuid,text) TO otr_external_integration_meter_writer;
-- Return only the qualified owning Run timestamp; Meter never receives Source SELECT.
CREATE FUNCTION public.universal_import_source_started(actor uuid,trip uuid,batch uuid,task uuid,input_sha text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF NOT public.universal_import_source_current(actor,trip,batch,task,input_sha) THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_CLOSED';END IF;
 RETURN (SELECT created_at FROM public.trip_source_runs WHERE actor_account_id=actor AND trip_id=trip AND capture_batch_id=batch AND interpretation_task_id=task);
END $$;
REVOKE ALL ON FUNCTION public.universal_import_source_started(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.universal_import_source_started(uuid,uuid,uuid,uuid,text) TO otr_external_integration_meter_writer;
CREATE TEMP TABLE universal_config_owner_edge ON COMMIT DROP AS SELECT admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_config_writer'::regrole AND member='postgres'::regrole AND grantor='postgres'::regrole;
DO $$BEGIN IF has_schema_privilege('otr_external_integration_config_writer','public','CREATE') THEN RAISE EXCEPTION 'UNIVERSAL_CONFIG_CREATE_PREIMAGE';END IF;END $$;
GRANT otr_external_integration_config_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_external_integration_config_writer;
CREATE TEMP TABLE universal_meter_owner_edge ON COMMIT DROP AS SELECT admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole AND grantor='postgres'::regrole;
DO $$BEGIN IF has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') THEN RAISE EXCEPTION 'UNIVERSAL_METER_CREATE_PREIMAGE';END IF;END $$;
GRANT otr_external_integration_meter_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_external_integration_meter_writer;
CREATE FUNCTION public.universal_import_check_continuous_scope(s public.flight_activation_scopes) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN
 IF session_user NOT IN ('otr_external_integration_admin_gateway','otr_external_integration_call_gateway') OR s.workload IS DISTINCT FROM 'UNIVERSAL_IMPORT_V1'
 OR NOT public.cp14_keys(s.pins,ARRAY['adapter_version','prompt_sha256','output_schema_sha256','profile_sha256','task_lifetime_ms','provider_config_sha256','price_sha256'],ARRAY[]::text[])
 OR s.pins->>'profile_sha256' IS DISTINCT FROM public.cp14_hash(public.universal_import_expected_profile())
 OR s.pins->>'prompt_sha256' IS DISTINCT FROM public.universal_import_expected_profile()->>'prompt_sha256'
 OR s.pins->>'output_schema_sha256' IS DISTINCT FROM public.universal_import_expected_profile()->>'output_schema_sha256'
 OR jsonb_typeof(s.pins->'task_lifetime_ms') IS DISTINCT FROM 'number' OR (s.pins->>'task_lifetime_ms')::numeric NOT BETWEEN 60000 AND 86400000
 OR s.pins->>'adapter_version' !~ '^[A-Za-z0-9._:-]{1,128}$' OR s.pins->>'provider_config_sha256' !~ '^[a-f0-9]{64}$' OR s.pins->>'price_sha256' !~ '^[a-f0-9]{64}$'
 OR s.max_attempts<>1 OR s.input_ceiling>32768 OR s.output_ceiling>4096 OR s.currency IS DISTINCT FROM 'USD' OR NOT s.monetary_approved
 OR s.call_cost_nanos NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'UNIVERSAL_SCOPE_PIN';END IF;
END $$;
ALTER FUNCTION public.universal_import_check_continuous_scope(public.flight_activation_scopes) OWNER TO otr_external_integration_meter_writer;
REVOKE ALL ON FUNCTION public.universal_import_check_continuous_scope(public.flight_activation_scopes) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.universal_import_check_continuous_scope(public.flight_activation_scopes) TO otr_external_integration_config_writer;
CREATE FUNCTION public.universal_import_select_continuous(actor uuid,trip uuid,integration text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE s public.flight_activation_scopes;g public.flight_activation_account_grants;i public.external_integrations;p public.intelligence_provider_configs;BEGIN
 IF current_user<>'otr_external_integration_meter_writer' OR NOT public.trip_sustained_universal_allowed(actor,trip) THEN RAISE EXCEPTION 'UNIVERSAL_PROVIDER_CLOSED';END IF;
 PERFORM public.cp14_scope_lock('DEV',integration);
 SELECT * INTO s FROM public.flight_activation_scopes WHERE integration_id=integration ORDER BY revision DESC LIMIT 1;
 SELECT * INTO g FROM public.flight_activation_account_grants WHERE scope_id=s.scope_id AND account_id=actor;
 SELECT * INTO i FROM public.external_integrations WHERE integration_id=integration;
 SELECT * INTO p FROM public.intelligence_provider_configs WHERE provider_config_id=s.provider_config_id;
 IF s.scope_id IS NULL OR NOT s.active OR s.expires_at<=clock_timestamp() OR g.scope_id IS NULL OR g.revoked OR g.expires_at<=clock_timestamp()
 OR NOT i.enabled OR i.kill_switch OR i.environment<>'DEV' OR i.config_version<>s.integration_version OR i.config_sha256<>s.configuration_sha256
 OR coalesce((SELECT kill_switch FROM public.external_integration_environment_state WHERE environment='DEV'),true)
 OR i.credential_reference IS DISTINCT FROM 'vault:otr/dev/backend/OTR_DEV_DEEPSEEK_API_KEY'
 OR p.integration_id IS DISTINCT FROM integration OR p.provider_id IS DISTINCT FROM 'DeepSeek' OR p.model_id IS DISTINCT FROM 'deepseek-flash' OR p.model_version IS DISTINCT FROM 'DeepSeek-V4.1-Flash'
 OR p.routing_eligibility IS DISTINCT FROM 'ELIGIBLE' OR p.provider_class IS DISTINCT FROM 'COMMERCIAL_REMOTE' OR p.privacy_policy IS DISTINCT FROM 'REMOTE_ALLOWED'
 OR NOT p.network_required OR NOT p.schema_output OR NOT 'TEXT'=ANY(p.modalities) OR NOT 'EXTRACT'=ANY(p.capabilities)
 OR p.configuration_sha256 IS DISTINCT FROM s.pins->>'provider_config_sha256' OR p.adapter_version IS DISTINCT FROM s.pins->>'adapter_version'
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.schema_contracts) v WHERE v=jsonb_build_object('id','universal-import','version',1,'dialect','otr'))
 OR NOT EXISTS(SELECT 1 FROM public.external_integration_price_schedules price WHERE price.price_schedule_id=s.price_schedule_id AND price.integration_id=integration AND price.currency='USD' AND price.schedule_sha256=s.pins->>'price_sha256' AND price.effective_from<=clock_timestamp() AND (price.effective_until IS NULL OR price.effective_until>clock_timestamp()))
 THEN RAISE EXCEPTION 'UNIVERSAL_PROVIDER_CLOSED';END IF;
 PERFORM public.universal_import_check_continuous_scope(s);
 RETURN jsonb_build_object('integrationId',integration,'configVersion',i.config_version,'configurationSha256',i.config_sha256,'providerConfigId',p.provider_config_id,'priceScheduleId',s.price_schedule_id,
 'providerId',p.provider_id,'modelId',p.model_id,'modelVersion',p.model_version,'adapterVersion',p.adapter_version,'region',p.data_region,'route',p.routing_class,'maxCostNanos',s.call_cost_nanos::text,'taskLifetimeMs',(s.pins->>'task_lifetime_ms')::integer,
 'scope',to_jsonb(s),'grantRevision',g.revision,'grantExpiresAt',g.expires_at);
END $$;
ALTER FUNCTION public.universal_import_select_continuous(uuid,uuid,text) OWNER TO otr_external_integration_meter_writer;
REVOKE ALL ON FUNCTION public.universal_import_select_continuous(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.universal_import_select_continuous(uuid,uuid,text) TO otr_external_integration_call_gateway;
CREATE FUNCTION public.universal_import_continuous_scope(r public.external_integration_calls,b jsonb,provider_request_sha text,live boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE selected jsonb;s public.flight_activation_scopes;g public.flight_activation_account_grants;pins jsonb;p jsonb:=b->'request'->'policy_snapshot';price jsonb;started timestamptz;BEGIN
 IF session_user<>'otr_external_integration_call_gateway' OR NOT public.universal_import_source_current(r.account_id,r.trip_id,r.import_id,r.task_id,r.input_sha256) THEN RAISE EXCEPTION 'UNIVERSAL_SOURCE_CLOSED';END IF;
 selected:=public.universal_import_select_continuous(r.account_id,r.trip_id,r.integration_id);
 s:=jsonb_populate_record(null::public.flight_activation_scopes,selected->'scope');
 SELECT * INTO g FROM public.flight_activation_account_grants WHERE scope_id=s.scope_id AND account_id=r.account_id;
 IF b->'profile' IS DISTINCT FROM public.universal_import_expected_profile() OR b->>'profile_sha256' IS DISTINCT FROM public.cp14_hash(b->'profile')
 OR r.environment IS DISTINCT FROM 'DEV' OR r.user_id IS DISTINCT FROM r.account_id OR r.provider_config_id IS DISTINCT FROM s.provider_config_id OR r.price_schedule_id IS DISTINCT FROM s.price_schedule_id
 OR r.config_version IS DISTINCT FROM s.integration_version OR r.configuration_sha256 IS DISTINCT FROM s.configuration_sha256
 OR r.model_id IS DISTINCT FROM s.model_id OR r.provider_id IS DISTINCT FROM s.provider_id OR r.model_version IS DISTINCT FROM s.expected_family
 OR r.adapter_version IS DISTINCT FROM s.pins->>'adapter_version' OR r.schema_sha256 IS DISTINCT FROM s.pins->>'output_schema_sha256'
 OR r.task_class IS DISTINCT FROM 'UNIVERSAL_IMPORT_V1' OR r.call_kind IS DISTINCT FROM 'OUTBOUND_MODEL' OR r.shadow OR r.attempt_sequence<>1 OR r.invocation_id IS NOT NULL OR r.billing_subject_id IS NOT NULL
 OR b->'request'->>'task_id' IS DISTINCT FROM r.task_id::text OR p->>'privacy' IS DISTINCT FROM 'REMOTE_ALLOWED' OR p->>'budget_currency' IS DISTINCT FROM 'USD'
 OR p->'max_attempts' IS DISTINCT FROM '1'::jsonb OR p->>'region' IS DISTINCT FROM selected->>'region' OR p->>'route' IS DISTINCT FROM selected->>'route'
 OR b->>'request_sha256' IS DISTINCT FROM public.cp14_hash(b->'request') OR p->>'budget_nanos' IS DISTINCT FROM s.call_cost_nanos::text
 OR (p->>'deadline')::timestamptz>least(s.expires_at,g.expires_at) OR live AND (p->>'deadline')::timestamptz<=clock_timestamp()
 THEN RAISE EXCEPTION 'UNIVERSAL_MODEL_TASK_BINDING';END IF;
 started:=public.universal_import_source_started(r.account_id,r.trip_id,r.import_id,r.task_id,r.input_sha256);
 IF (p->>'deadline')::timestamptz IS DISTINCT FROM date_trunc('milliseconds',started)+((s.pins->>'task_lifetime_ms')::bigint*interval '1 millisecond') THEN RAISE EXCEPTION 'UNIVERSAL_TASK_DEADLINE';END IF;
 SELECT jsonb_agg(jsonb_build_object('unit',measurement_unit,'quantity',unit_quantity,'price',price_per_quantity::text,'definition',unit_definition) ORDER BY measurement_unit) INTO price FROM public.external_integration_price_schedule_units WHERE price_schedule_id=s.price_schedule_id;
 RETURN jsonb_build_object('actor_id',r.account_id,'trip_id',r.trip_id,'batch_id',r.import_id,'task_id',r.task_id,'attempt_id',r.attempt_id,'call_id',r.call_id,'integration_id',r.integration_id,
 'provider_config_id',s.provider_config_id,'price_schedule_id',s.price_schedule_id,'request_sha256',r.request_sha256,'provider_request_sha256',provider_request_sha,'input_sha256',r.input_sha256,'model_binding',b,
 'input_ceiling',s.input_ceiling,'output_ceiling',s.output_ceiling,'max_cost_nanos',s.call_cost_nanos::text,'starts_at',started,'expires_at',least(s.expires_at,g.expires_at,(p->>'deadline')::timestamptz),
 'priceUnits',price,'scope_id',s.scope_id,'scope_revision',s.revision,'scope_sha256',s.scope_sha256,'grant_revision',g.revision,'execution_pins',s.pins||jsonb_build_object('provider_request_sha256',provider_request_sha));
END $$;
ALTER FUNCTION public.universal_import_continuous_scope(public.external_integration_calls,jsonb,text,boolean) OWNER TO otr_external_integration_meter_writer;
REVOKE ALL ON FUNCTION public.universal_import_continuous_scope(public.external_integration_calls,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE FUNCTION public.universal_import_read_continuous_scope(row_json jsonb,b jsonb,provider_request_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r public.external_integration_calls;BEGIN
 IF current_user<>'otr_external_integration_meter_writer' OR provider_request_sha IS NULL OR provider_request_sha !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'UNIVERSAL_SCOPE_INVALID';END IF;
 r:=jsonb_populate_record(null::public.external_integration_calls,row_json);
 RETURN public.universal_import_continuous_scope(r,b,provider_request_sha,true);
END $$;
ALTER FUNCTION public.universal_import_read_continuous_scope(jsonb,jsonb,text) OWNER TO otr_external_integration_meter_writer;
REVOKE ALL ON FUNCTION public.universal_import_read_continuous_scope(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.universal_import_read_continuous_scope(jsonb,jsonb,text) TO otr_external_integration_call_gateway;
-- Exact branch insertions preserve every old Flight body and policy unchanged.
DO $patch$DECLARE body text;definition text;old text;replacement text;BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.flight_activation_select(jsonb,jsonb)'::regprocedure;
 old:=$old$if not public.cp14_keys(r.pins,array['adapter_version','prompt_sha256','envelope_version','envelope_sha256','output_schema_sha256','minimizer_version','minimizer_sha256','privacy_profile','privacy_sha256','policy_sha256','price_sha256','provider_config_sha256'],array[]::text[]) or exists(select 1 from jsonb_each_text(r.pins) e where (e.key in ('adapter_version','envelope_version','minimizer_version','privacy_profile') and e.value !~ '^[A-Za-z0-9._:-]{1,128}$') or (e.key not in ('adapter_version','envelope_version','minimizer_version','privacy_profile') and e.value !~ '^[0-9a-f]{64}$')) then raise exception 'CP15_SCOPE_PIN';end if;$old$;
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_SELECT_PREIMAGE';END IF;
 body:=replace(body,old,$new$if r.workload='UNIVERSAL_IMPORT_V1' then perform public.universal_import_check_continuous_scope(r);else $new$||old||'end if;');
 old:=$old$i.credential_reference='vault:otr/dev/deepseek/flight-import-v1'$old$;
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_CREDENTIAL_PREIMAGE';END IF;
 body:=replace(body,old,$new$i.credential_reference=case r.workload when 'UNIVERSAL_IMPORT_V1' then 'vault:otr/dev/backend/OTR_DEV_DEEPSEEK_API_KEY' else 'vault:otr/dev/deepseek/flight-import-v1' end$new$);
 EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='public.flight_activation_select(jsonb,jsonb)'::regprocedure),body);
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean)'::regprocedure;
 old:=$old$select * into s from public.universal_import_provider_scope where singleton;$old$;
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_BINDING_PREIMAGE';END IF;
 body:=replace(body,old,$new$if public.trip_sustained_universal_allowed(r.account_id,r.trip_id) then s:=jsonb_populate_record(null::public.universal_import_provider_scope,public.universal_import_continuous_scope(r,b,null,live));else select * into s from public.universal_import_provider_scope where singleton;end if;$new$);
 old:=$old$if not found or not coalesce(s.actor_id=r.account_id$old$;
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_BINDING_FOUND_PREIMAGE';END IF;
 -- A derived owning record does not alter PL/pgSQL FOUND. task_id is NOT NULL
 -- for the unchanged finite table and equally strict for the derived record.
 body:=replace(body,old,$new$if s.task_id is null or not coalesce(s.actor_id=r.account_id$new$);
 EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean)'::regprocedure),body);
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.cp15_flight_admission(public.external_integration_calls,public.flight_activation_scopes,public.flight_activation_account_grants,jsonb)'::regprocedure;
 -- A narrow leading branch. The old Flight branch still executes byte-for-byte.
 replacement:=$branch$begin
 if r.task_class='UNIVERSAL_IMPORT_V1' then
  if s.workload is distinct from 'UNIVERSAL_IMPORT_V1' or not s.active or s.expires_at<=clock_timestamp() or s.revision is distinct from (select max(revision) from public.flight_activation_scopes where scope_id=s.scope_id)
   or s.scope_id is distinct from g.scope_id or g.account_id is distinct from r.account_id or g.revoked or g.expires_at<=clock_timestamp()
   or execution-'provider_request_sha256' is distinct from s.pins or execution->>'provider_request_sha256' IS NULL or execution->>'provider_request_sha256' !~ '^[a-f0-9]{64}$'
   or not public.trip_sustained_universal_allowed(r.account_id,r.trip_id) then raise exception 'UNIVERSAL_PROVIDER_CLOSED';end if;
  perform public.universal_import_check_continuous_scope(s);perform public.cp14_call_admission(r,false);return;
 end if;
$branch$;
 IF position('begin' in lower(body))<1 THEN RAISE EXCEPTION 'UNIVERSAL_CP15_PREIMAGE';END IF;
 EXECUTE replace(definition,body,overlay(body placing replacement from position('begin' in lower(body)) for 5));
END $patch$;
-- Reuse the complete CP15 mark implementation, removing only the exact Stage I
-- redirect and its Flight-global enable check for the explicit Universal branch.
DO $mark$ DECLARE body text;definition text;hook text;old text;replacement text;BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.external_integration_mark_dispatch(jsonb,jsonb)'::regprocedure;
 hook:=$hook$
/* UNIVERSAL_BRANCH_BEGIN */
if exists(select 1 from public.external_integration_calls c where c.call_id=(command->>'call_id')::uuid and c.task_class='UNIVERSAL_IMPORT_V1') then return public.universal_import_mark_dispatch(context,command);end if;
/* UNIVERSAL_BRANCH_END */
$hook$;
 IF (length(body)-length(replace(body,hook,'')))/length(hook)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_MARK_REDIRECT_PREIMAGE';END IF;
 body:=replace(body,hook,'');
 old:=$old$if not coalesce((select runtime_enabled from public.external_integration_environment_state where environment=r.environment),false) then raise exception 'CP14_RUNTIME_CLOSED';$old$;
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'UNIVERSAL_MARK_ENABLE_PREIMAGE';END IF;
 replacement:=$new$if r.task_class is distinct from 'UNIVERSAL_IMPORT_V1' or not public.trip_sustained_universal_allowed(r.account_id,r.trip_id) or coalesce((select kill_switch from public.external_integration_environment_state where environment='DEV'),true) then raise exception 'UNIVERSAL_PROVIDER_CLOSED';$new$;
 body:=replace(body,old,replacement);
 definition:=replace(definition,'FUNCTION public.external_integration_mark_dispatch(', 'FUNCTION public.universal_import_mark_continuous_dispatch(');
 EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='public.external_integration_mark_dispatch(jsonb,jsonb)'::regprocedure),body);
 SELECT prosrc,pg_get_functiondef(oid) INTO body,definition FROM pg_proc WHERE oid='public.universal_import_mark_dispatch(jsonb,jsonb)'::regprocedure;
 IF position('begin' in lower(body))<1 THEN RAISE EXCEPTION 'UNIVERSAL_MARK_PREIMAGE';END IF;
 replacement:=$branch$begin
 if exists(select 1 from public.external_integration_calls c join public.flight_call_resource_holds h on h.call_id=c.call_id where c.call_id=(command->>'call_id')::uuid and c.task_class='UNIVERSAL_IMPORT_V1') then return public.universal_import_mark_continuous_dispatch(context,command);end if;
$branch$;
 EXECUTE replace(definition,body,overlay(body placing replacement from position('begin' in lower(body)) for 5));
END $mark$;
ALTER FUNCTION public.universal_import_mark_continuous_dispatch(jsonb,jsonb) OWNER TO otr_external_integration_meter_writer;
REVOKE ALL ON FUNCTION public.universal_import_mark_continuous_dispatch(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE FUNCTION public.universal_import_read_admitted_price(actor uuid,task uuid,attempt uuid,call uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE r public.external_integration_calls;a public.model_task_admissions;units jsonb;BEGIN
 IF session_user<>'otr_external_integration_call_gateway' THEN RAISE EXCEPTION 'UNIVERSAL_PRICE_DENIED';END IF;
 SELECT * INTO r FROM public.external_integration_calls WHERE call_id=call AND account_id=actor AND task_id=task AND attempt_id=attempt;
 SELECT * INTO a FROM public.model_task_admissions WHERE call_id=call AND account_id=actor AND task_id=task;
 IF r.call_id IS NULL OR a.call_id IS NULL OR r.task_class<>'UNIVERSAL_IMPORT_V1' OR a.profile_snapshot IS DISTINCT FROM public.universal_import_expected_profile()
 OR NOT public.universal_import_source_current(actor,r.trip_id,r.import_id,task,r.input_sha256) THEN RAISE EXCEPTION 'UNIVERSAL_PRICE_DENIED';END IF;
 SELECT jsonb_agg(jsonb_build_object('unit',measurement_unit,'quantity',unit_quantity,'price',price_per_quantity::text,'definition',unit_definition) ORDER BY measurement_unit) INTO units FROM public.external_integration_price_schedule_units WHERE price_schedule_id=r.price_schedule_id;
 RETURN units;
END $$;
ALTER FUNCTION public.universal_import_read_admitted_price(uuid,uuid,uuid,uuid) OWNER TO otr_external_integration_meter_writer;
REVOKE ALL ON FUNCTION public.universal_import_read_admitted_price(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT EXECUTE ON FUNCTION public.universal_import_read_admitted_price(uuid,uuid,uuid,uuid) TO otr_external_integration_call_gateway;
REVOKE CREATE ON SCHEMA public FROM otr_external_integration_config_writer;
DO $$DECLARE edge record;BEGIN SELECT * INTO edge FROM universal_config_owner_edge;
 IF FOUND THEN EXECUTE format('grant otr_external_integration_config_writer to postgres with admin %s,inherit %s,set %s',CASE WHEN edge.admin_option THEN 'true' ELSE 'false' END,CASE WHEN edge.inherit_option THEN 'true' ELSE 'false' END,CASE WHEN edge.set_option THEN 'true' ELSE 'false' END);
 ELSE REVOKE otr_external_integration_config_writer FROM postgres;END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM otr_external_integration_meter_writer;
DO $$DECLARE edge record;BEGIN SELECT * INTO edge FROM universal_meter_owner_edge;
 IF FOUND THEN EXECUTE format('grant otr_external_integration_meter_writer to postgres with admin %s,inherit %s,set %s',CASE WHEN edge.admin_option THEN 'true' ELSE 'false' END,CASE WHEN edge.inherit_option THEN 'true' ELSE 'false' END,CASE WHEN edge.set_option THEN 'true' ELSE 'false' END);
 ELSE REVOKE otr_external_integration_meter_writer FROM postgres;END IF;
END $$;
COMMIT;
