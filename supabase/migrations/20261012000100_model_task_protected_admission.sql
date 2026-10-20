-- CP-LLM-02A-R2: additive CLOSED one-paid-call lifetime admission.
-- Ordered after current Core85-92; no runtime gate or historical data is changed.
begin;
grant otr_external_integration_meter_writer to postgres with inherit true,set true;
grant create on schema public to otr_external_integration_meter_writer;
create table public.model_task_admissions (
 account_id uuid not null, integration_id text not null, task_id uuid not null,
 logical_request_id uuid not null, logical_idempotency_key uuid not null,
 contract_version text not null check(contract_version='otr-model-task-v1'),
 request_snapshot jsonb not null check(jsonb_typeof(request_snapshot)='object' and octet_length(request_snapshot::text) between 1 and 16384),
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 profile_snapshot jsonb not null check(jsonb_typeof(profile_snapshot)='object' and octet_length(profile_snapshot::text) between 1 and 4096),
 profile_sha256 text not null check(profile_sha256 ~ '^[a-f0-9]{64}$'),
 policy_sha256 text not null check(policy_sha256 ~ '^[a-f0-9]{64}$'),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 max_cost_nanos numeric(60,0) not null check(max_cost_nanos>0 and max_cost_nanos::text not in ('NaN','Infinity','-Infinity')),
 deadline timestamptz not null check(isfinite(deadline)),
 call_id uuid not null references public.external_integration_calls(call_id) on delete restrict,
 created_at timestamptz not null check(isfinite(created_at)),
 primary key(account_id,integration_id,task_id),
 unique(account_id,integration_id,logical_request_id),
 unique(account_id,integration_id,logical_idempotency_key), unique(call_id)
);
alter table public.model_task_admissions owner to postgres;
alter table public.model_task_admissions enable row level security;
alter table public.model_task_admissions force row level security;
revoke all on public.model_task_admissions from public,anon,authenticated,service_role,authenticator;
grant select,insert on public.model_task_admissions to otr_external_integration_meter_writer;
create policy model_task_meter_read on public.model_task_admissions for select to otr_external_integration_meter_writer using(true);
create policy model_task_meter_insert on public.model_task_admissions for insert to otr_external_integration_meter_writer with check(true);
create function public.cp_llm_validate_binding(b jsonb,r public.external_integration_calls,e jsonb,live boolean) returns void language plpgsql set search_path=pg_catalog as $$
declare q jsonb:=b->'request';p jsonb:=q->'policy_snapshot';cfg public.intelligence_provider_configs;
begin
 if not coalesce(public.cp14_keys(b,array['version','request','request_sha256','profile','profile_sha256'],array[]::text[]) and b->'version'='1'::jsonb and octet_length(b::text)<=24576,false) then raise exception 'MODEL_TASK_BINDING_REQUIRED';end if;
 if not coalesce(public.cp14_keys(q,array['contract_version','task_id','logical_request_id','logical_idempotency_key','consumer_id','consumer_version','input','schema','policy_snapshot','policy_sha256'],array[]::text[])
 and q->>'contract_version'='otr-model-task-v1' and q->>'consumer_id'='import' and q->'consumer_version'='1'::jsonb
 and (q->>'task_id')::uuid=r.task_id and (q->>'logical_request_id')::uuid is not null and (q->>'logical_idempotency_key')::uuid is not null
 and b->>'request_sha256'=public.cp14_hash(q) and b->>'profile_sha256'=public.cp14_hash(b->'profile'),false) then raise exception 'MODEL_TASK_CHANGED_BINDING';end if;
 if b->'profile' is distinct from '{"boundary_version":"otr-flight-remote-v2","capability":"EXTRACT","consumer_id":"import","consumer_version":1,"envelope_sha256":"d83e7fa31bc0995e1c4ae87822b3dfcff85e2c73213eda514eeb54b2e8146cad","envelope_version":"FLIGHT_REMOTE_TEXT_V1","execution_scope":"FLIGHT_IMPORT_V1","minimizer_sha256":"14b7822719a9d7b6e6bc5791dcd53e62a1d125475f3184be77d09397775210c0","minimizer_version":"OTR_FLIGHT_WHITELIST_UTF8_V1","modality":"TEXT","output_schema_sha256":"a9800a43f1078e8c7ea74c8c88e3671e1655014b2212655779198472d125226e","output_schema_version":"FLIGHT_REMOTE_OUTPUT_V1","privacy_profile":"REMOTE_ALLOWED_MINIMIZED_TEXT_V1","privacy_sha256":"e112eaf04dcfc07d2347593e74f7900798f6f713bc2c62281a9c47654ece1fa5","prompt_sha256":"a1d37069c6e255b74dc73c4ccea81ae72f7a17824b35b428f09878f6b163ab40","version":1}'::jsonb then raise exception 'MODEL_TASK_PROFILE';end if;
 if not coalesce(public.cp14_keys(q->'input',array['reference','sha256','byte_count'],array[]::text[]) and (q->'input'->>'reference')::uuid is not null
 and q->'input'->>'sha256' ~ '^[a-f0-9]{64}$' and jsonb_typeof(q->'input'->'byte_count')='number'
 and q->'input'->>'byte_count' ~ '^[0-9]+$' and (q->'input'->>'byte_count')::numeric between 1 and 4194304
 and q->'schema'=jsonb_build_object('id','FLIGHT_REMOTE_OUTPUT_V1','version',1,'dialect','OTR_TYPED_V1','sha256',b->'profile'->>'output_schema_sha256'),false) then raise exception 'MODEL_TASK_INPUT_SCHEMA';end if;
 if not coalesce(public.cp14_keys(p,array['version','privacy','network_required','region','budget_currency','budget_nanos','route','max_attempts','deadline'],array[]::text[])
 and p->'version'='1'::jsonb and p->>'privacy'='REMOTE_ALLOWED' and p->'network_required'='true'::jsonb and p->'max_attempts'='1'::jsonb
 and jsonb_typeof(p->'budget_nanos')='string' and p->>'budget_nanos' ~ '^[0-9]{1,60}$' and (p->>'budget_nanos')::numeric>0
 and p->>'budget_currency' ~ '^[A-Z]{3}$' and p->>'deadline' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$'
 and isfinite((p->>'deadline')::timestamptz) and q->>'policy_sha256'=public.cp14_hash(p) and e->>'policy_sha256'=q->>'policy_sha256',false) then raise exception 'MODEL_TASK_POLICY';end if;
 select * into cfg from public.intelligence_provider_configs where provider_config_id=r.provider_config_id;
 if not coalesce(cfg.provider_class='COMMERCIAL_REMOTE' and cfg.network_required and cfg.privacy_policy='REMOTE_ALLOWED' and cfg.data_region=p->>'region' and cfg.routing_class=p->>'route'
 and cfg.schema_output and exists(select 1 from jsonb_array_elements(cfg.schema_contracts) registered where registered='[{"id":"flight","version":1,"dialect":"otr"}]'::jsonb->0)
 and 'TEXT'=any(cfg.modalities) and 'EXTRACT'=any(cfg.capabilities) and r.capability='EXTRACT'
 and r.environment='DEV' and r.task_class='FLIGHT_IMPORT_V1' and r.call_kind='OUTBOUND_MODEL' and not r.shadow and r.attempt_sequence=1,false) then raise exception 'MODEL_TASK_SCOPE';end if;
 if exists(select 1 from jsonb_each_text(b->'profile') x where x.key in ('prompt_sha256','envelope_sha256','output_schema_sha256','minimizer_sha256','privacy_sha256','envelope_version','minimizer_version','privacy_profile') and x.value is distinct from e->>x.key) then raise exception 'MODEL_TASK_PROFILE';end if;
 if live and (p->>'deadline')::timestamptz<=clock_timestamp() then raise exception 'MODEL_TASK_DEADLINE';end if;
end$$;
revoke all on function public.cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean) to otr_external_integration_meter_writer;
create function public.cp_llm_guard_model_task_admissions() returns trigger language plpgsql set search_path=pg_catalog as $$
declare r public.external_integration_calls;h public.flight_call_resource_holds;
begin
 if tg_op<>'INSERT' or session_user<>'otr_external_integration_call_gateway' or current_user<>'otr_external_integration_meter_writer' then raise exception 'MODEL_TASK_PROTECTED';end if;
 select * into r from public.external_integration_calls where call_id=new.call_id;
 select * into h from public.flight_call_resource_holds where call_id=new.call_id;
 if not coalesce(r.account_id=new.account_id and r.integration_id=new.integration_id and r.task_id=new.task_id and h.call_id=new.call_id
 and h.currency=new.currency and h.worst_cost_nanos<=new.max_cost_nanos and exists(select 1 from public.external_integration_usage_events where call_id=new.call_id and observation_kind='START')
 and new.logical_request_id=(new.request_snapshot->>'logical_request_id')::uuid and new.logical_idempotency_key=(new.request_snapshot->>'logical_idempotency_key')::uuid
 and new.policy_sha256=new.request_snapshot->>'policy_sha256' and new.currency=new.request_snapshot->'policy_snapshot'->>'budget_currency'
 and new.max_cost_nanos=(new.request_snapshot->'policy_snapshot'->>'budget_nanos')::numeric and new.deadline=(new.request_snapshot->'policy_snapshot'->>'deadline')::timestamptz,false) then raise exception 'MODEL_TASK_CHANGED_BINDING';end if;
 perform public.cp_llm_validate_binding(jsonb_build_object('version',1,'request',new.request_snapshot,'request_sha256',new.request_sha256,'profile',new.profile_snapshot,'profile_sha256',new.profile_sha256),r,h.execution_pins,true);
 return new;
end$$;
revoke all on function public.cp_llm_guard_model_task_admissions() from public,anon,authenticated,service_role,authenticator;
create trigger model_task_immutable before insert or update or delete on public.model_task_admissions for each row execute function public.cp_llm_guard_model_task_admissions();
create trigger model_task_no_truncate before truncate on public.model_task_admissions for each statement execute function public.cp_llm_guard_model_task_admissions();
set role otr_external_integration_meter_writer;
create or replace function public.flight_activation_reserve_call(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;
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
 end$$;
create or replace function public.external_integration_mark_dispatch(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare mt public.model_task_admissions; r public.external_integration_calls;h public.flight_call_resource_holds;s public.flight_activation_scopes;g public.flight_activation_account_grants;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','call_id','expected_revision','publication_fence'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_integration_mark_dispatch',array['otr_external_integration_call_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
select * into r from public.external_integration_calls where call_id=(command->>'call_id')::uuid and integration_id=command->>'integration_id' and account_id=(context->>'verified_account_id')::uuid ;
if found then
 perform public.cp15_lock_trip_authority(r.account_id,r.trip_id);
 select * into r from public.external_integration_calls where call_id=r.call_id for update;
end if;
if not found or r.row_revision<>(command->>'expected_revision')::bigint or r.publication_fence<>(command->>'publication_fence')::bigint or r.dispatch_state<>'RESERVED' then raise exception 'CP14_DISPATCH_FENCE';
end if;
if r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';end if;
if not coalesce((select runtime_enabled from public.external_integration_environment_state where environment=r.environment),false) then raise exception 'CP14_RUNTIME_CLOSED';
end if;
select * into h from public.flight_call_resource_holds where call_id=r.call_id;
if not found then raise exception 'CP14_RUNTIME_CLOSED';end if;
select * into mt from public.model_task_admissions where call_id=r.call_id and account_id=r.account_id and integration_id=r.integration_id and task_id=r.task_id;
if not found then raise exception 'MODEL_TASK_BINDING_REQUIRED';end if;
perform public.cp_llm_validate_binding(jsonb_build_object('version',1,'request',mt.request_snapshot,'request_sha256',mt.request_sha256,'profile',mt.profile_snapshot,'profile_sha256',mt.profile_sha256),r,h.execution_pins,true);
if h.currency is distinct from mt.currency or h.worst_cost_nanos>mt.max_cost_nanos then raise exception 'MODEL_TASK_BUDGET';end if;
select * into s from public.flight_activation_scopes where scope_id=h.scope_id and revision=h.scope_revision;
select * into g from public.flight_activation_account_grants where scope_id=h.scope_id and account_id=r.account_id;
perform public.cp15_flight_admission(r,s,g,h.execution_pins);
if h.execution_pins_sha256 is distinct from public.cp14_hash(h.execution_pins) then raise exception 'CP15_EXECUTION_PIN';end if;
if h.scope_sha256 is distinct from s.scope_sha256 or h.grant_revision is distinct from g.revision or h.price_schedule_id is distinct from r.price_schedule_id or h.worst_cost_nanos>s.call_cost_nanos then raise exception 'CP15_HOLD_PIN';end if;
update public.external_integration_calls set dispatch_state='MAY_HAVE_STARTED',execution_certainty='RUNNING',row_revision=row_revision+1,dispatch_marked_at=clock_timestamp() where call_id=r.call_id returning * into r;
return to_jsonb(r);
 end$$;
alter function public.flight_activation_reserve_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;
alter function public.external_integration_mark_dispatch(jsonb,jsonb) owner to otr_external_integration_meter_writer;
revoke all on function public.flight_activation_reserve_call(jsonb,jsonb),public.external_integration_mark_dispatch(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.flight_activation_reserve_call(jsonb,jsonb),public.external_integration_mark_dispatch(jsonb,jsonb) to otr_external_integration_call_gateway;
reset role;
revoke create on schema public from otr_external_integration_meter_writer;
revoke otr_external_integration_meter_writer from postgres;
commit;
