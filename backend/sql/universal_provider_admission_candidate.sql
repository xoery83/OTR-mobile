-- CANDIDATE ONLY. Dedicated Universal DEV capability; no Provider or SQL activation.
-- Existing CP14 Call/Usage and Model Task Admission retain authority and lifetime identity.
begin;
-- Preserve the existing administrator edge and reject unexpected CREATE authority.
create temporary table universal_owner_edge on commit drop as select admin_option,inherit_option,set_option from pg_auth_members where roleid='otr_external_integration_meter_writer'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
do $$begin if has_schema_privilege('otr_external_integration_meter_writer','public','CREATE') then raise exception 'UNIVERSAL_OWNER_CREATE_PREIMAGE';end if;end$$;
grant otr_external_integration_meter_writer to postgres with inherit true,set true;
grant create on schema public to otr_external_integration_meter_writer;
create table public.universal_import_provider_scope (
 singleton boolean primary key default true check(singleton),
 actor_id uuid not null, trip_id uuid not null, batch_id uuid not null, task_id uuid not null,
 attempt_id uuid not null, call_id uuid not null, integration_id text not null,
 provider_config_id uuid not null, price_schedule_id uuid not null,
 request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
 provider_request_sha256 text not null check(provider_request_sha256 ~ '^[a-f0-9]{64}$'),
 input_sha256 text not null check(input_sha256 ~ '^[a-f0-9]{64}$'),
 model_binding jsonb not null check(jsonb_typeof(model_binding)='object' and octet_length(model_binding::text)<=24576),
 input_ceiling integer not null check(input_ceiling between 1 and 36864),
 output_ceiling integer not null check(output_ceiling between 1 and 4096),
 max_cost_nanos numeric(60,0) not null check(max_cost_nanos>0 and max_cost_nanos<=1000000000),
 starts_at timestamptz not null, expires_at timestamptz not null,
 check(isfinite(starts_at) and isfinite(expires_at) and expires_at>starts_at and expires_at<=starts_at+interval '900 seconds')
);
alter table public.universal_import_provider_scope enable row level security;
alter table public.universal_import_provider_scope force row level security;
revoke all on public.universal_import_provider_scope from public,anon,authenticated,service_role,authenticator;
grant select on public.universal_import_provider_scope to otr_external_integration_meter_writer;
create policy universal_provider_scope_read on public.universal_import_provider_scope for select to otr_external_integration_meter_writer using(true);

create function public.universal_import_expected_profile() returns jsonb language sql immutable set search_path=pg_catalog as $$
select '{"version":1,"consumer_id":"import","consumer_version":1,"boundary_version":"otr.backend.universal-interpretation/1","capability":"EXTRACT","modalities":"TEXT,IMAGE","execution_scope":"UNIVERSAL_IMPORT_V1","prompt_version":"real-llm-01-compact/5","prompt_sha256":"3076fa42c0d55dc7f97e025aa4792bb316c4b95fa9f78196a8526235fbfa7649","output_schema_version":"otr-universal-advisory/1","output_schema_sha256":"59bb20c3dc2e00338e3e1e2e9bfd470d41d0da9ea54802695f32ec220adc740f","privacy_profile":"REMOTE_ALLOWED_SOURCE_EVIDENCE_V1","max_images":1,"max_text_bytes":32768,"max_output_tokens":4096}'::jsonb $$;
alter function public.universal_import_expected_profile() owner to otr_external_integration_meter_writer;
revoke all on function public.universal_import_expected_profile() from public,anon,authenticated,service_role,authenticator;

-- No Trip UPDATE/SELECT privilege is added to the metering writer.
create function public.universal_import_lock_actor(actor uuid,trip uuid) returns boolean language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if session_user<>'otr_external_integration_call_gateway' then raise exception 'UNIVERSAL_ACTOR_FORBIDDEN';end if;
 perform 1 from public.trips where id=trip for share;
 perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
 return exists(select 1 from public.trips where id=trip and created_by=actor)
   or exists(select 1 from public.journey_members where trip_id=trip and user_id=actor and status='linked');
end$$;
revoke all on function public.universal_import_lock_actor(uuid,uuid) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.universal_import_lock_actor(uuid,uuid) to otr_external_integration_meter_writer;
create function public.universal_import_read_scope(actor uuid,task uuid,attempt uuid,call uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare s public.universal_import_provider_scope;r public.external_integration_calls;
begin
 if session_user<>'otr_external_integration_call_gateway' then raise exception 'UNIVERSAL_SCOPE_FORBIDDEN';end if;
 select * into s from public.universal_import_provider_scope where singleton and actor_id=actor and task_id=task and attempt_id=attempt and call_id=call;
 if not found or clock_timestamp()<s.starts_at or clock_timestamp()>=s.expires_at or not public.universal_import_lock_actor(actor,s.trip_id) then return null;end if;
 perform public.cp14_scope_lock('DEV',s.integration_id);
 if not exists(select 1 from public.external_integration_environment_state e where e.environment='DEV' and not e.kill_switch)
 or not exists(select 1 from public.external_integrations i where i.integration_id=s.integration_id and i.environment='DEV' and i.enabled and not i.kill_switch)
 then raise exception 'CP14_ADMISSION_CLOSED';end if;
 select * into r from public.external_integration_calls c where c.call_id=s.call_id and c.account_id=s.actor_id and c.task_id=s.task_id and c.attempt_id=s.attempt_id;
 if found then
   perform public.cp14_call_admission(r,false);
   perform public.universal_import_validate_binding(s.model_binding,r,true);
 end if;
 return to_jsonb(s)||jsonb_build_object('priceUnits',(select jsonb_agg(jsonb_build_object('unit',measurement_unit,'quantity',unit_quantity,'price',price_per_quantity::text,'definition',unit_definition) order by measurement_unit) from public.external_integration_price_schedule_units where price_schedule_id=s.price_schedule_id));
end$$;
alter function public.universal_import_read_scope(uuid,uuid,uuid,uuid) owner to otr_external_integration_meter_writer;
revoke all on function public.universal_import_read_scope(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.universal_import_read_scope(uuid,uuid,uuid,uuid) to otr_external_integration_call_gateway;

create function public.universal_import_validate_binding(b jsonb,r public.external_integration_calls,live boolean)
returns void language plpgsql volatile set search_path=pg_catalog as $$
declare s public.universal_import_provider_scope; q jsonb:=b->'request';p jsonb:=q->'policy_snapshot';cfg public.intelligence_provider_configs;input_rate numeric;output_rate numeric;worst numeric;
begin
 if session_user<>'otr_external_integration_call_gateway' or current_user<>'otr_external_integration_meter_writer' then raise exception 'UNIVERSAL_PROFILE_FORBIDDEN';end if;
 if not coalesce(public.cp14_keys(b,array['version','request','request_sha256','profile','profile_sha256'],array[]::text[]) and b->'version'='1'::jsonb and b->'profile'=public.universal_import_expected_profile() and b->>'profile_sha256'=public.cp14_hash(b->'profile') and b->>'request_sha256'=public.cp14_hash(q),false) then raise exception 'UNIVERSAL_MODEL_TASK_PROFILE';end if;
 if not coalesce(public.cp14_keys(q,array['contract_version','task_id','logical_request_id','logical_idempotency_key','consumer_id','consumer_version','input','schema','policy_snapshot','policy_sha256'],array[]::text[]) and q->>'contract_version'='otr-model-task-v1' and q->>'consumer_id'='import' and q->'consumer_version'='1'::jsonb and (q->>'task_id')::uuid=r.task_id and (q->>'logical_request_id')::uuid is not null and (q->>'logical_idempotency_key')::uuid is not null and public.cp14_keys(q->'input',array['reference','sha256','byte_count'],array[]::text[]) and (q->'input'->>'reference')::uuid is not null and q->'input'->>'sha256' ~ '^[a-f0-9]{64}$' and q->'input'->>'byte_count' ~ '^[1-9][0-9]{0,6}$' and (q->'input'->>'byte_count')::integer between 1 and 4194304 and q->'schema'=jsonb_build_object('id','UNIVERSAL_IMPORT_V1','version',1,'dialect','OTR_TYPED_V1','sha256',b->'profile'->>'output_schema_sha256'),false) then raise exception 'UNIVERSAL_MODEL_TASK_INPUT';end if;
 if not coalesce(public.cp14_keys(p,array['version','privacy','network_required','region','budget_currency','budget_nanos','route','max_attempts','deadline'],array[]::text[]) and p->'version'='1'::jsonb and p->>'privacy'='REMOTE_ALLOWED' and p->'network_required'='true'::jsonb and p->'max_attempts'='1'::jsonb and p->>'budget_currency'='USD' and p->>'budget_nanos' ~ '^[0-9]{1,60}$' and (p->>'budget_nanos')::numeric>0 and q->>'policy_sha256'=public.cp14_hash(p) and isfinite((p->>'deadline')::timestamptz),false) then raise exception 'UNIVERSAL_MODEL_TASK_POLICY';end if;
 select * into s from public.universal_import_provider_scope where singleton;
 if not found or not coalesce(s.actor_id=r.account_id and s.trip_id=r.trip_id and s.batch_id=r.import_id and s.task_id=r.task_id and s.attempt_id=r.attempt_id and s.call_id=r.call_id and s.integration_id=r.integration_id and s.provider_config_id=r.provider_config_id and s.price_schedule_id=r.price_schedule_id and s.request_sha256=r.request_sha256 and s.input_sha256=r.input_sha256 and s.model_binding=b,false) then raise exception 'UNIVERSAL_PROVIDER_SCOPE_CLOSED';end if;
 if live and (clock_timestamp()<s.starts_at or clock_timestamp()>=s.expires_at or (p->>'deadline')::timestamptz<=clock_timestamp()) then raise exception 'UNIVERSAL_PROVIDER_SCOPE_EXPIRED';end if;
 if not coalesce(r.environment='DEV' and r.user_id=r.account_id and r.task_class='UNIVERSAL_IMPORT_V1' and r.call_kind='OUTBOUND_MODEL' and not r.shadow and r.shadow_of_call_id is null and r.invocation_id is null and r.attempt_sequence=1 and r.provider_id='DeepSeek' and r.model_id='deepseek-flash' and r.model_version='DeepSeek-V4.1-Flash' and r.billing_subject_id is null and r.schema_sha256=b->'profile'->>'output_schema_sha256',false) then raise exception 'UNIVERSAL_PROVIDER_BINDING';end if;
 select * into cfg from public.intelligence_provider_configs where provider_config_id=r.provider_config_id;
 if not coalesce(cfg.integration_id=r.integration_id and cfg.provider_class='COMMERCIAL_REMOTE' and cfg.network_required and cfg.privacy_policy='REMOTE_ALLOWED' and cfg.data_region=p->>'region' and cfg.routing_class=p->>'route' and cfg.schema_output and 'TEXT'=any(cfg.modalities) and 'EXTRACT'=any(cfg.capabilities) and r.capability='EXTRACT' and exists(select 1 from jsonb_array_elements(cfg.schema_contracts) v where v=jsonb_build_object('id','universal-import','version',1,'dialect','otr')),false) then raise exception 'UNIVERSAL_PROVIDER_PROFILE';end if;
 if exists(select 1 from public.external_integration_price_schedule_units u where price_schedule_id=s.price_schedule_id and (measurement_unit not in ('input_tokens','cached_input_tokens','output_tokens') or unit_definition->>'relationship'<>'DISJOINT' or unit_definition->>'billable'<>'true')) then raise exception 'UNIVERSAL_PRICE_UNSUPPORTED';end if;
 select max(ceil(price_per_quantity*1000000000/unit_quantity)) into input_rate from public.external_integration_price_schedule_units where price_schedule_id=s.price_schedule_id and measurement_unit in ('input_tokens','cached_input_tokens');
 select max(ceil(price_per_quantity*1000000000/unit_quantity)) into output_rate from public.external_integration_price_schedule_units where price_schedule_id=s.price_schedule_id and measurement_unit='output_tokens';
 if input_rate is null or output_rate is null then raise exception 'UNIVERSAL_PRICE_UNAVAILABLE';end if;
 worst:=s.input_ceiling*input_rate+s.output_ceiling*output_rate;
 if worst>s.max_cost_nanos or worst>(p->>'budget_nanos')::numeric or (p->>'deadline')::timestamptz>s.expires_at then raise exception 'UNIVERSAL_MODEL_TASK_BUDGET';end if;
end$$;
alter function public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean) owner to otr_external_integration_meter_writer;
revoke all on function public.universal_import_validate_binding(jsonb,public.external_integration_calls,boolean) from public,anon,authenticated,service_role,authenticator;

create function public.universal_activation_reserve_call(context jsonb,command jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r public.external_integration_calls;old public.external_integration_calls;u public.external_integration_usage_events;mt public.model_task_admissions;b jsonb:=command->'model_task_binding';
begin
 if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','row','start','model_task_binding'],array[]::text[]) then raise exception 'UNIVERSAL_INVALID_COMMAND';end if;
 perform public.cp14_context(context,command,'universal_activation_reserve_call',array['otr_external_integration_call_gateway'],null);
 perform public.cp14_scope_lock('DEV',command->>'integration_id');
 r:=jsonb_populate_record(null::public.external_integration_calls,command->'row');
 if not public.cp14_keys(command->'row',array(select jsonb_object_keys(to_jsonb(r))),array[]::text[]) or r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from (context->>'verified_actor_id')::uuid or command->>'environment'<>'DEV' or r.integration_id is distinct from command->>'integration_id' or r.request_id is distinct from (command->>'request_id')::uuid or r.dispatch_state<>'RESERVED' or r.execution_certainty<>'NOT_STARTED' or r.row_revision<>1 then raise exception 'UNIVERSAL_CALL_BINDING';end if;
 if not public.universal_import_lock_actor(r.account_id,r.trip_id) then raise exception 'CP14_TRIP_FORBIDDEN';end if;
 perform public.universal_import_validate_binding(b,r,true);
 select * into mt from public.model_task_admissions where account_id=r.account_id and integration_id=r.integration_id and (task_id=r.task_id or logical_request_id=(b->'request'->>'logical_request_id')::uuid or logical_idempotency_key=(b->'request'->>'logical_idempotency_key')::uuid);
 if found and (mt.call_id<>r.call_id or mt.request_snapshot<>b->'request' or mt.profile_snapshot<>b->'profile' or mt.request_sha256<>b->>'request_sha256' or mt.profile_sha256<>b->>'profile_sha256') then raise exception 'MODEL_TASK_ALREADY_ADMITTED';end if;
 select * into old from public.external_integration_calls where call_id=r.call_id or integration_id=r.integration_id and attempt_id=r.attempt_id and account_id=r.account_id;
 if found then
   if old.admission_sha256 is distinct from context->>'request_sha256' or (to_jsonb(old)-array['row_revision','publication_fence','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason','admitted_at','admission_sha256']) is distinct from (to_jsonb(r)-array['row_revision','publication_fence','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason','admitted_at','admission_sha256']) or mt.call_id is null then raise exception 'CP14_CHANGED_REQUEST';end if;
   return to_jsonb(old);
 end if;
 if exists(select 1 from public.external_integration_calls where account_id=r.account_id and integration_id=r.integration_id and task_id=r.task_id) then raise exception 'MODEL_TASK_ALREADY_ADMITTED';end if;
 perform public.cp14_call_admission(r);
 r.admitted_at:=clock_timestamp();r.admission_sha256:=context->>'request_sha256';
 insert into public.external_integration_calls select r.*;
 u:=jsonb_populate_record(null::public.external_integration_usage_events,command->'start');
 if not public.cp14_keys(command->'start',array(select jsonb_object_keys(to_jsonb(u)-'provider_request_id')),array[]::text[]) or u.call_id<>r.call_id or u.observation_kind<>'START' or u.price_schedule_id is distinct from r.price_schedule_id or u.status<>'STARTED' or u.cost_nanos is not null or u.response_sha256 is not null then raise exception 'CP14_START_REQUIRED';end if;
 insert into public.external_integration_usage_events select u.*;
 insert into public.model_task_admissions values(r.account_id,r.integration_id,r.task_id,(b->'request'->>'logical_request_id')::uuid,(b->'request'->>'logical_idempotency_key')::uuid,'otr-model-task-v1',b->'request',b->>'request_sha256',b->'profile',b->>'profile_sha256',b->'request'->>'policy_sha256','USD',(b->'request'->'policy_snapshot'->>'budget_nanos')::numeric,(b->'request'->'policy_snapshot'->>'deadline')::timestamptz,r.call_id,clock_timestamp());
 return to_jsonb(r);
end$$;
alter function public.universal_activation_reserve_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;
revoke all on function public.universal_activation_reserve_call(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.universal_activation_reserve_call(jsonb,jsonb) to otr_external_integration_call_gateway;

create function public.universal_import_mark_dispatch(context jsonb,command jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r public.external_integration_calls;mt public.model_task_admissions;
begin
 if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','call_id','expected_revision','publication_fence'],array[]::text[]) then raise exception 'CP14_INVALID_COMMAND';end if;
 perform public.cp14_context(context,command,'external_integration_mark_dispatch',array['otr_external_integration_call_gateway'],null);
 perform public.cp14_scope_lock('DEV',command->>'integration_id');
 select * into r from public.external_integration_calls where call_id=(command->>'call_id')::uuid and integration_id=command->>'integration_id' and account_id=(context->>'verified_account_id')::uuid for update;
 if not found or r.row_revision is distinct from (command->>'expected_revision')::bigint or r.publication_fence is distinct from (command->>'publication_fence')::bigint or r.dispatch_state<>'RESERVED' or r.user_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_DISPATCH_FENCE';end if;
 if not public.universal_import_lock_actor(r.account_id,r.trip_id) then raise exception 'CP14_TRIP_FORBIDDEN';end if;
 select * into mt from public.model_task_admissions where call_id=r.call_id and account_id=r.account_id and integration_id=r.integration_id and task_id=r.task_id;
 if not found then raise exception 'MODEL_TASK_BINDING_REQUIRED';end if;
 perform public.universal_import_validate_binding(jsonb_build_object('version',1,'request',mt.request_snapshot,'request_sha256',mt.request_sha256,'profile',mt.profile_snapshot,'profile_sha256',mt.profile_sha256),r,true);
 perform public.cp14_call_admission(r,false);
 update public.external_integration_calls set dispatch_state='MAY_HAVE_STARTED',execution_certainty='RUNNING',row_revision=row_revision+1,dispatch_marked_at=clock_timestamp() where call_id=r.call_id returning * into r;
 return to_jsonb(r);
end$$;
alter function public.universal_import_mark_dispatch(jsonb,jsonb) owner to otr_external_integration_meter_writer;
revoke all on function public.universal_import_mark_dispatch(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

-- Even the old generic reservation port cannot commit an unbound Universal call.
create function public.universal_import_call_admission_guard() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare a public.model_task_admissions;
begin
 if new.task_class='UNIVERSAL_IMPORT_V1' then
   select * into a from public.model_task_admissions where call_id=new.call_id;
   if not found then raise exception 'MODEL_TASK_BINDING_REQUIRED';end if;
   perform public.universal_import_validate_binding(jsonb_build_object('version',1,'request',a.request_snapshot,'request_sha256',a.request_sha256,'profile',a.profile_snapshot,'profile_sha256',a.profile_sha256),new,true);
 end if;
 return new;
end$$;
alter function public.universal_import_call_admission_guard() owner to otr_external_integration_meter_writer;
revoke all on function public.universal_import_call_admission_guard() from public,anon,authenticated,service_role,authenticator;
create constraint trigger universal_import_paid_task_binding after insert on public.external_integration_calls deferrable initially deferred for each row execute function public.universal_import_call_admission_guard();

-- Exact protected-root preimages and branch hooks are populated by the checked-in
-- generator. Removing a hook must reproduce the original Flight body byte-for-byte.
-- UNIVERSAL_PROTECTED_ROOT_HOOKS_BEGIN
do $universal_hook$
declare original text; patched text; definition text; boundary integer; hook text := '
/* UNIVERSAL_BRANCH_BEGIN */
if b->''profile''->>''execution_scope''=''UNIVERSAL_IMPORT_V1'' then perform public.universal_import_validate_binding(b,r,live);return;end if;
/* UNIVERSAL_BRANCH_END */
';
begin
 select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.cp_llm_validate_binding(jsonb,public.external_integration_calls,jsonb,boolean)'::regprocedure;
 if md5(original)<>'14281d549d7e811def2615b32beef8eb' then raise exception 'UNIVERSAL_PROTECTED_ROOT_PREIMAGE: cp_llm_validate_binding';end if;
 boundary:=position('begin' in lower(original))+4;
 if boundary<5 then raise exception 'UNIVERSAL_PROTECTED_ROOT_PARSE';end if;
 patched:=substr(original,1,boundary)||hook||substr(original,boundary+1);
 execute replace(definition,original,patched);
end $universal_hook$;
do $universal_hook$
declare original text; patched text; definition text; boundary integer; hook text := '
/* UNIVERSAL_BRANCH_BEGIN */
if tg_op=''INSERT'' and new.profile_snapshot->>''execution_scope''=''UNIVERSAL_IMPORT_V1'' then
 if session_user<>''otr_external_integration_call_gateway'' or current_user<>''otr_external_integration_meter_writer'' then raise exception ''MODEL_TASK_PROTECTED'';end if;
 select * into r from public.external_integration_calls where call_id=new.call_id;
 perform public.universal_import_validate_binding(jsonb_build_object(''version'',1,''request'',new.request_snapshot,''request_sha256'',new.request_sha256,''profile'',new.profile_snapshot,''profile_sha256'',new.profile_sha256),r,true);
 if not coalesce(r.account_id=new.account_id and r.integration_id=new.integration_id and r.task_id=new.task_id
 and new.logical_request_id=(new.request_snapshot->>''logical_request_id'')::uuid and new.logical_idempotency_key=(new.request_snapshot->>''logical_idempotency_key'')::uuid
 and new.policy_sha256=new.request_snapshot->>''policy_sha256'' and new.currency=new.request_snapshot->''policy_snapshot''->>''budget_currency''
 and new.max_cost_nanos=(new.request_snapshot->''policy_snapshot''->>''budget_nanos'')::numeric and new.deadline=(new.request_snapshot->''policy_snapshot''->>''deadline'')::timestamptz
 and exists(select 1 from public.external_integration_usage_events where call_id=new.call_id and observation_kind=''START''),false) then raise exception ''MODEL_TASK_CHANGED_BINDING'';end if;
 return new;
end if;
/* UNIVERSAL_BRANCH_END */
';
begin
 select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.cp_llm_guard_model_task_admissions()'::regprocedure;
 if md5(original)<>'a5e5b3ed46799424bf12ce2d0956e353' then raise exception 'UNIVERSAL_PROTECTED_ROOT_PREIMAGE: cp_llm_guard_model_task_admissions';end if;
 boundary:=position('begin' in lower(original))+4;
 if boundary<5 then raise exception 'UNIVERSAL_PROTECTED_ROOT_PARSE';end if;
 patched:=substr(original,1,boundary)||hook||substr(original,boundary+1);
 execute replace(definition,original,patched);
end $universal_hook$;
do $universal_hook$
declare original text; patched text; definition text; boundary integer; hook text := '
/* UNIVERSAL_BRANCH_BEGIN */
if exists(select 1 from public.external_integration_calls c where c.call_id=(command->>''call_id'')::uuid and c.task_class=''UNIVERSAL_IMPORT_V1'') then return public.universal_import_mark_dispatch(context,command);end if;
/* UNIVERSAL_BRANCH_END */
';
begin
 select prosrc,pg_get_functiondef(oid) into original,definition from pg_proc where oid='public.external_integration_mark_dispatch(jsonb,jsonb)'::regprocedure;
 if md5(original)<>'975c4416d6f058fdb43cbb159c70c91f' then raise exception 'UNIVERSAL_PROTECTED_ROOT_PREIMAGE: external_integration_mark_dispatch';end if;
 boundary:=position('begin' in lower(original))+4;
 if boundary<5 then raise exception 'UNIVERSAL_PROTECTED_ROOT_PARSE';end if;
 patched:=substr(original,1,boundary)||hook||substr(original,boundary+1);
 execute replace(definition,original,patched);
end $universal_hook$;
-- UNIVERSAL_PROTECTED_ROOT_HOOKS_END

revoke create on schema public from otr_external_integration_meter_writer;
do $restore_owner$ declare old record;begin
 select * into old from pg_temp.universal_owner_edge;
 if found then execute format('grant otr_external_integration_meter_writer to postgres with admin %s,inherit %s,set %s',case when old.admin_option then 'true' else 'false' end,case when old.inherit_option then 'true' else 'false' end,case when old.set_option then 'true' else 'false' end);
 else revoke otr_external_integration_meter_writer from postgres;end if;
end $restore_owner$;
commit;
