BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SELECT pg_advisory_xact_lock(714027,2);
CREATE TEMP TABLE p2_resource_edges ON COMMIT DROP AS SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole;
CREATE TEMP TABLE p2_resource_function ON COMMIT DROP AS SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure;
DO $check$ BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_MAINTENANCE_IDENTITY';END IF;
 IF md5(pg_get_functiondef('public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure))<>'d7d6c6285b9752b89d516f8b2aaee554' THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_FUNCTION_DRIFT';END IF;
 IF has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_CREATE_PREIMAGE';END IF;
 IF EXISTS(SELECT 1 FROM public.flight_activation_scopes s WHERE s.scope_id='baac2ca8-f769-4ace-8bd4-d394a36312d6'::uuid AND s.active AND s.revision=(SELECT max(revision) FROM public.flight_activation_scopes WHERE scope_id=s.scope_id) AND s.revision=6) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_CLOSE_SCOPE_FIRST';END IF;
END $check$;
GRANT otr_external_integration_meter_writer TO postgres WITH INHERIT true,SET true;
GRANT CREATE ON SCHEMA public TO otr_external_integration_meter_writer;
SET LOCAL ROLE otr_external_integration_meter_writer;
CREATE OR REPLACE FUNCTION public.flight_activation_reserve_call(context jsonb, command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$declare r public.external_integration_calls;
old public.external_integration_calls; mt public.model_task_admissions; b jsonb:=command->'model_task_binding';
s public.external_integration_usage_events;
sc public.flight_activation_scopes;g public.flight_activation_account_grants;
day date;admission_time timestamptz;worst numeric;input_rate numeric;output_rate numeric;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','row','start','scope_id','scope_revision','scope_sha256','grant_revision','input_ceiling','output_ceiling','execution_pins','execution_pins_sha256','model_task_binding'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['call_id','integration_id','environment','provider_config_id','provider_id','model_id','model_version','adapter_version','config_version','configuration_sha256','account_id','user_id','billing_subject_id','trip_id','import_id','task_id','attempt_id','fallback_chain_id','shadow_of_call_id','evaluation_reference','attempt_sequence','invocation_id','request_id','idempotency_key','request_sha256','input_sha256','schema_sha256','capability','task_class','call_kind','shadow','price_schedule_id','admitted_at','admission_sha256','publication_fence','row_revision','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'flight_activation_reserve_call',array['otr_external_integration_call_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
admission_time:=clock_timestamp();day:=(admission_time at time zone 'UTC')::date;
r:=jsonb_populate_record(null::public.external_integration_calls,command->'row');
if r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from r.account_id or r.environment<>context->>'verified_environment' or r.integration_id<>command->>'integration_id' or r.dispatch_state<>'RESERVED' or r.execution_certainty<>'NOT_STARTED' or r.row_revision<>1 or r.request_id<>(command->>'request_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
perform public.cp15_lock_trip_authority(r.account_id,r.trip_id);
if not public.cp14_trip_access(r.account_id,r.trip_id) then raise exception 'CP14_TRIP_FORBIDDEN';end if;
select * into mt from public.model_task_admissions where account_id=r.account_id and integration_id=r.integration_id and task_id=r.task_id;
if found then
 if mt.call_id<>r.call_id then raise exception 'MODEL_TASK_ALREADY_ADMITTED';end if;
 if mt.request_snapshot is distinct from b->'request' or mt.profile_snapshot is distinct from b->'profile' or mt.request_sha256 is distinct from b->>'request_sha256' or mt.profile_sha256 is distinct from b->>'profile_sha256' or b->'version' is distinct from '1'::jsonb or not public.cp14_keys(b,array['version','request','request_sha256','profile','profile_sha256'],array[]::text[]) then raise exception 'MODEL_TASK_CHANGED_BINDING';end if;
 if not exists(select 1 from public.flight_call_resource_holds h join public.flight_activation_account_grants replay_grant on replay_grant.scope_id=h.scope_id and replay_grant.account_id=r.account_id where h.call_id=mt.call_id and not replay_grant.revoked and replay_grant.expires_at>clock_timestamp()) then raise exception 'CP15_ACCOUNT_CLOSED';end if;
else
 if exists(select 1 from public.external_integration_calls where account_id=r.account_id and integration_id=r.integration_id and task_id=r.task_id and call_kind='OUTBOUND_MODEL') then raise exception 'MODEL_TASK_LEGACY_UNBOUND';end if;
 perform public.cp_llm_validate_binding(b,r,command->'execution_pins',true);
end if;
select * into old from public.external_integration_calls where call_id=r.call_id or integration_id=r.integration_id and attempt_id=r.attempt_id and account_id=r.account_id;
if found then if old.admission_sha256 is distinct from context->>'request_sha256' then raise exception 'CP14_CHANGED_REQUEST';end if;if (to_jsonb(old)-array['row_revision','publication_fence','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason','admitted_at','admission_sha256'])<>(to_jsonb(r)-array['row_revision','publication_fence','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason','admitted_at','admission_sha256']) then raise exception 'CP14_CHANGED_REQUEST';
end if;
if not exists(select 1 from public.flight_call_resource_holds hold where hold.call_id=old.call_id and hold.scope_id=(command->>'scope_id')::uuid and hold.scope_revision=(command->>'scope_revision')::bigint and hold.scope_sha256=command->>'scope_sha256' and hold.grant_revision=(command->>'grant_revision')::bigint and hold.input_ceiling=(command->>'input_ceiling')::integer and hold.output_ceiling=(command->>'output_ceiling')::integer and hold.execution_pins=command->'execution_pins' and hold.execution_pins_sha256=command->>'execution_pins_sha256') then raise exception 'CP15_HOLD_PIN';end if;
return to_jsonb(old);
end if;
select * into sc from public.flight_activation_scopes where scope_id=(command->>'scope_id')::uuid and revision=(command->>'scope_revision')::bigint;
select * into g from public.flight_activation_account_grants where scope_id=sc.scope_id and account_id=r.account_id;
perform public.cp15_lock_trip_authority(r.account_id,r.trip_id);
if command->>'execution_pins_sha256' is distinct from public.cp14_hash(command->'execution_pins') then raise exception 'CP15_EXECUTION_PIN';end if;
perform public.cp15_flight_admission(r,sc,g,command->'execution_pins');
if r.attempt_sequence>sc.max_attempts or (r.attempt_sequence>1 and not exists(select 1 from public.external_integration_calls previous join public.flight_call_resource_holds ph on ph.call_id=previous.call_id where previous.account_id=r.account_id and previous.task_id=r.task_id and previous.fallback_chain_id=r.fallback_chain_id and previous.attempt_sequence=r.attempt_sequence-1 and previous.provider_id='DeepSeek' and previous.dispatch_state='TERMINAL' and previous.execution_certainty='TERMINAL' and exists(select 1 from public.external_integration_usage_events usage where usage.call_id=previous.call_id and usage.observation_kind='COMPLETION' and usage.status='FAILED'))) then raise exception 'CP15_RETRY_CLOSED';end if;
if sc.scope_sha256 is distinct from command->>'scope_sha256' or g.revision is distinct from (command->>'grant_revision')::bigint or (command->>'input_ceiling')::integer not between 1 and sc.input_ceiling or (command->>'output_ceiling')::integer not between 1 and sc.output_ceiling then raise exception 'CP15_BOUNDS';end if;
-- Conservative maximum of every declared input price (including cache/time variants).
-- Unsupported billable dimensions fail closed rather than underestimate a hold.
if exists(select 1 from public.external_integration_price_schedule_units u where u.price_schedule_id=sc.price_schedule_id and (u.measurement_unit not in ('input_tokens','cached_input_tokens','output_tokens') or u.unit_definition->>'relationship'<>'DISJOINT' or u.unit_definition->>'billable'<>'true')) then raise exception 'CP15_PRICE_UNSUPPORTED';end if;
select max(ceil(price_per_quantity*1000000000/unit_quantity)) into input_rate from public.external_integration_price_schedule_units where price_schedule_id=sc.price_schedule_id and measurement_unit='input_tokens';
select greatest(input_rate,max(ceil(price_per_quantity*1000000000/unit_quantity))) into input_rate from public.external_integration_price_schedule_units where price_schedule_id=sc.price_schedule_id and measurement_unit='cached_input_tokens';
select max(ceil(price_per_quantity*1000000000/unit_quantity)) into output_rate from public.external_integration_price_schedule_units where price_schedule_id=sc.price_schedule_id and measurement_unit='output_tokens';
if input_rate is null or output_rate is null then raise exception 'CP15_PRICE_MISSING';end if;
worst:=ceil(((command->>'input_ceiling')::integer*input_rate+(command->>'output_ceiling')::integer*output_rate));
if sc.currency is distinct from b->'request'->'policy_snapshot'->>'budget_currency' or worst>(b->'request'->'policy_snapshot'->>'budget_nanos')::numeric then raise exception 'MODEL_TASK_BUDGET';end if;
if worst>sc.call_cost_nanos or worst+coalesce((select sum(worst_cost_nanos) from public.flight_call_resource_holds where account_id=r.account_id and admission_day=day),0)>sc.account_day_cost_nanos or worst+coalesce((select sum(worst_cost_nanos) from public.flight_call_resource_holds where admission_day=day),0)>sc.dev_day_cost_nanos then raise exception 'CP15_BUDGET';end if;
if (select count(*) from public.flight_call_resource_holds h join public.external_integration_calls c using(call_id) where h.account_id=r.account_id and (c.dispatch_state<>'TERMINAL' or c.execution_certainty='UNKNOWN'))>=sc.concurrent_account or (select count(*) from public.flight_call_resource_holds where account_id=r.account_id and admission_day=day)>=sc.account_daily or (select count(*) from public.flight_call_resource_holds where admission_day=day)>=sc.dev_daily or (select count(*) from public.flight_call_resource_holds where provider_id='DeepSeek' and admission_day=day)>=sc.provider_daily then raise exception 'CP15_RESOURCE_LIMIT';end if;
perform public.cp14_call_admission(r);
r.admitted_at:=admission_time;r.admission_sha256:=context->>'request_sha256';
insert into public.external_integration_calls select r.*;
if not public.cp14_keys(command->'start',array['observation_id','call_id','observation_key','observation_version','observation_kind','measurement_mode','observed_at','received_at','started_at','ended_at','latency_ms','status','outcome','response_sha256','publication_sha256','input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms','other_units','provider_extension','usage_quality','unit_quality','price_schedule_id','cost_nanos','currency','cost_quality','cost_calculation_version','supersedes_observation_id','observation_sha256'],array[]::text[]) then raise exception 'CP14_START_GRAMMAR';
end if;
s:=jsonb_populate_record(null::public.external_integration_usage_events,command->'start');
if s.call_id<>r.call_id or s.observation_kind<>'START' then raise exception 'CP14_START_REQUIRED';
end if;
insert into public.external_integration_usage_events select s.*;
insert into public.flight_call_resource_holds values(r.call_id,sc.scope_id,sc.revision,sc.scope_sha256,r.account_id,g.revision,'DeepSeek',day,(command->>'input_ceiling')::integer,(command->>'output_ceiling')::integer,worst,sc.currency,sc.price_schedule_id,command->'execution_pins',command->>'execution_pins_sha256');
insert into public.model_task_admissions values(r.account_id,r.integration_id,r.task_id,(b->'request'->>'logical_request_id')::uuid,(b->'request'->>'logical_idempotency_key')::uuid,'otr-model-task-v1',b->'request',b->>'request_sha256',b->'profile',b->>'profile_sha256',b->'request'->>'policy_sha256',b->'request'->'policy_snapshot'->>'budget_currency',(b->'request'->'policy_snapshot'->>'budget_nanos')::numeric,(b->'request'->'policy_snapshot'->>'deadline')::timestamptz,r.call_id,clock_timestamp());
return to_jsonb(r);
 end$function$
;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM otr_external_integration_meter_writer;
DO $restore$ DECLARE old record;BEGIN
 SELECT * INTO old FROM pg_temp.p2_resource_edges WHERE grantor='postgres'::regrole;
 IF found THEN EXECUTE format('grant otr_external_integration_meter_writer to postgres with admin %s,inherit %s,set %s',CASE WHEN old.admin_option THEN 'true' ELSE 'false' END,CASE WHEN old.inherit_option THEN 'true' ELSE 'false' END,CASE WHEN old.set_option THEN 'true' ELSE 'false' END);
 ELSE REVOKE otr_external_integration_meter_writer FROM postgres;END IF;
 IF EXISTS((SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole EXCEPT SELECT * FROM pg_temp.p2_resource_edges)
 UNION ALL(SELECT * FROM pg_temp.p2_resource_edges EXCEPT SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members WHERE roleid='otr_external_integration_meter_writer'::regrole AND member='postgres'::regrole)) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_MEMBERSHIP_DRIFT';END IF;
 IF has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_CREATE_DRIFT';END IF;
 IF EXISTS((SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure EXCEPT SELECT * FROM pg_temp.p2_resource_function)
 UNION ALL(SELECT * FROM pg_temp.p2_resource_function EXCEPT SELECT oid,proowner,proacl FROM pg_proc WHERE oid='public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure)) THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_ACL_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.flight_activation_reserve_call(jsonb,jsonb)'::regprocedure))<>'3cef15114775a5334a6f68332c38b044' THEN RAISE EXCEPTION 'P2_RESOURCE_LEASE_POSTIMAGE_DRIFT';END IF;
END $restore$;
COMMIT;
