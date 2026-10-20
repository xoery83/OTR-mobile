-- Server84: CLOSED DEV Flight foundation. No activation, grants, prices or secrets seeded.
begin;
grant otr_external_integration_config_writer,otr_external_integration_meter_writer to postgres with inherit true,set true;
grant create on schema public to otr_external_integration_config_writer,otr_external_integration_meter_writer;
alter table public.external_integration_environment_state drop constraint external_integration_environment_state_runtime_enabled_check;
alter table public.external_integration_environment_state add constraint cp15_dev_runtime_only check (not runtime_enabled or environment='DEV');
grant update(runtime_enabled) on public.external_integration_environment_state to otr_external_integration_config_writer;
alter table public.external_integration_usage_events add column provider_request_id text check(provider_request_id ~ '^[A-Za-z0-9._:-]{1,128}$');

create table public.flight_activation_scopes (
 scope_id uuid not null, revision bigint not null check(revision between 1 and 9007199254740991),
 environment text not null default 'DEV' check(environment='DEV'),
 workload text not null default 'FLIGHT_IMPORT_V1' check(workload='FLIGHT_IMPORT_V1'),
 provider_id text not null default 'DeepSeek' check(provider_id='DeepSeek'),
 model_id text not null default 'deepseek-flash' check(model_id='deepseek-flash'),
 expected_family text not null default 'DeepSeek-V4.1-Flash' check(expected_family='DeepSeek-V4.1-Flash'),
 shadow boolean not null default false check(not shadow), active boolean not null default false,
 integration_id text not null references public.external_integrations(integration_id),
 integration_version bigint not null, configuration_sha256 text not null check(configuration_sha256 ~ '^[0-9a-f]{64}$'),
 provider_config_id uuid not null references public.intelligence_provider_configs(provider_config_id),
 price_schedule_id uuid references public.external_integration_price_schedules(price_schedule_id),
 pins jsonb not null check(octet_length(pins::text)<=4096),
 scope_sha256 text not null check(scope_sha256 ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null check(isfinite(expires_at)),
 input_ceiling integer not null default 8192 check(input_ceiling between 1 and 8192),
 output_ceiling integer not null default 2048 check(output_ceiling between 1 and 2048),
 concurrent_account integer not null default 1 check(concurrent_account=1),
 account_daily integer not null default 20 check(account_daily between 1 and 20),
 dev_daily integer not null default 100 check(dev_daily between 1 and 100),
 provider_daily integer not null default 100 check(provider_daily between 1 and 100),
 max_attempts integer not null default 1 check(max_attempts between 1 and 20),
 monetary_approved boolean not null default false,
 currency text check(currency ~ '^[A-Z]{3}$'),
 call_cost_nanos numeric(60,0) check(call_cost_nanos>0 and call_cost_nanos::text not in ('NaN','Infinity','-Infinity')),
 account_day_cost_nanos numeric(60,0) check(account_day_cost_nanos>0 and account_day_cost_nanos::text not in ('NaN','Infinity','-Infinity')),
 dev_day_cost_nanos numeric(60,0) check(dev_day_cost_nanos>0 and dev_day_cost_nanos::text not in ('NaN','Infinity','-Infinity')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null,
 primary key(scope_id,revision), unique(integration_id,revision),
 check(not monetary_approved or (currency is not null and price_schedule_id is not null and call_cost_nanos is not null and account_day_cost_nanos is not null and dev_day_cost_nanos is not null))
);
create table public.flight_activation_account_grants (
 scope_id uuid not null, account_id uuid not null references auth.users(id),
 revision bigint not null check(revision between 1 and 9007199254740991),
 expires_at timestamptz not null check(isfinite(expires_at)), revoked boolean not null default true,
 updated_by uuid not null references auth.users(id), primary key(scope_id,account_id)
);
create table public.flight_call_resource_holds (
 call_id uuid primary key references public.external_integration_calls(call_id),
 scope_id uuid not null, scope_revision bigint not null,
 scope_sha256 text not null check(scope_sha256 ~ '^[0-9a-f]{64}$'),
 account_id uuid not null references auth.users(id), grant_revision bigint not null,
 provider_id text not null check(provider_id='DeepSeek'), admission_day date not null,
 input_ceiling integer not null check(input_ceiling between 1 and 8192),
 output_ceiling integer not null check(output_ceiling between 1 and 2048),
 worst_cost_nanos numeric(60,0) not null check(worst_cost_nanos>=0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 price_schedule_id uuid not null references public.external_integration_price_schedules(price_schedule_id),
 execution_pins jsonb not null check(octet_length(execution_pins::text)<=4096),
 execution_pins_sha256 text not null check(execution_pins_sha256 ~ '^[0-9a-f]{64}$'),
 foreign key(scope_id,scope_revision) references public.flight_activation_scopes(scope_id,revision),
 foreign key(scope_id,account_id) references public.flight_activation_account_grants(scope_id,account_id)
);
create or replace function public.cp14_guard_external_integration_environment_state() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.environment is distinct from old.environment) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.config_version<>old.config_version+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;
set role otr_external_integration_config_writer;
create or replace function public.cp14_bind_request(context jsonb, command jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$declare a public.external_integration_config_audit;kind text:=context->>'command_kind';scope text:=public.cp14_request_scope(context);begin
 if current_user<>'otr_external_integration_config_writer' or session_user::text is distinct from context->>'gateway_identity' or session_user::text not in ('otr_external_integration_admin_gateway','otr_external_integration_call_gateway','otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway','otr_external_integration_reporting_gateway') then raise exception 'CP14_CONTEXT_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('cp14/request/'||(command->>'request_id'),0));
 select * into a from public.external_integration_config_audit where command_id=(command->>'request_id')::uuid;
 if found then
  if a.environment is distinct from context->>'verified_environment' or a.safe_diff->>'request_sha256' is distinct from command->>'request_sha256' or a.safe_diff->>'scope_sha256' is distinct from scope or a.safe_diff->>'command_kind' is distinct from kind then raise exception 'CP14_CHANGED_REQUEST';end if;
  return;
 end if;
 if kind in ('external_integration_configure','external_integration_set_kill','intelligence_provider_config_append','external_integration_price_append','external_client_authorize_grant','external_client_revoke_grant','flight_activation_runtime','flight_activation_select','flight_activation_account_grant') then return;end if;
 insert into public.external_integration_config_audit(audit_id,integration_id,environment,entity_kind,entity_key,new_version,admin_actor_id,command_id,change_type,after_sha256,safe_diff,reason_code,occurred_at) values((command->>'request_id')::uuid,command->>'integration_id',context->>'verified_environment','request',command->>'request_id',1,(context->>'verified_actor_id')::uuid,(command->>'request_id')::uuid,'REQUEST_BINDING',command->>'request_sha256',jsonb_build_object('request_sha256',command->>'request_sha256','scope_sha256',scope,'command_kind',kind),'EXACT_REQUEST',clock_timestamp());
end$$;
reset role;
alter table public.flight_activation_scopes enable row level security;
alter table public.flight_activation_scopes force row level security;
revoke all on public.flight_activation_scopes from public,anon,authenticated,service_role,authenticator;
grant select on public.flight_activation_scopes to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_reader;
create policy cp15_read on public.flight_activation_scopes for select to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_reader using(true);
grant insert on public.flight_activation_scopes to otr_external_integration_config_writer;
create policy cp15_insert on public.flight_activation_scopes for insert to otr_external_integration_config_writer with check(true);
create function public.cp15_guard_flight_activation_scopes() returns trigger language plpgsql set search_path=pg_catalog as $$begin
if session_user<>'otr_external_integration_admin_gateway' or current_user<>'otr_external_integration_config_writer' or tg_op not in ('INSERT') then raise exception 'CP15_PROTECTED';end if;
return new;end$$;
revoke all on function public.cp15_guard_flight_activation_scopes() from public,anon,authenticated,service_role,authenticator;
create trigger cp15_guard before insert or update or delete on public.flight_activation_scopes for each row execute function public.cp15_guard_flight_activation_scopes();
create trigger cp15_no_truncate before truncate on public.flight_activation_scopes for each statement execute function public.cp15_guard_flight_activation_scopes();
alter table public.flight_activation_account_grants enable row level security;
alter table public.flight_activation_account_grants force row level security;
revoke all on public.flight_activation_account_grants from public,anon,authenticated,service_role,authenticator;
grant select on public.flight_activation_account_grants to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_reader;
create policy cp15_read on public.flight_activation_account_grants for select to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_reader using(true);
grant insert on public.flight_activation_account_grants to otr_external_integration_config_writer;
create policy cp15_insert on public.flight_activation_account_grants for insert to otr_external_integration_config_writer with check(true);
grant update(expires_at,revoked,revision,updated_by) on public.flight_activation_account_grants to otr_external_integration_config_writer;
create policy cp15_update on public.flight_activation_account_grants for update to otr_external_integration_config_writer using(true) with check(true);
create function public.cp15_guard_flight_activation_account_grants() returns trigger language plpgsql set search_path=pg_catalog as $$begin
if session_user<>'otr_external_integration_admin_gateway' or current_user<>'otr_external_integration_config_writer' or tg_op not in ('INSERT','UPDATE') then raise exception 'CP15_PROTECTED';end if;
if tg_op='UPDATE' and (new.scope_id<>old.scope_id or new.account_id<>old.account_id or new.revision<>old.revision+1) then raise exception 'CP15_CAS';end if;
return new;end$$;
revoke all on function public.cp15_guard_flight_activation_account_grants() from public,anon,authenticated,service_role,authenticator;
create trigger cp15_guard before insert or update or delete on public.flight_activation_account_grants for each row execute function public.cp15_guard_flight_activation_account_grants();
create trigger cp15_no_truncate before truncate on public.flight_activation_account_grants for each statement execute function public.cp15_guard_flight_activation_account_grants();
alter table public.flight_call_resource_holds enable row level security;
alter table public.flight_call_resource_holds force row level security;
revoke all on public.flight_call_resource_holds from public,anon,authenticated,service_role,authenticator;
grant select on public.flight_call_resource_holds to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_reader;
create policy cp15_read on public.flight_call_resource_holds for select to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_reader using(true);
grant insert on public.flight_call_resource_holds to otr_external_integration_meter_writer;
create policy cp15_insert on public.flight_call_resource_holds for insert to otr_external_integration_meter_writer with check(true);
create function public.cp15_guard_flight_call_resource_holds() returns trigger language plpgsql set search_path=pg_catalog as $$begin
if session_user<>'otr_external_integration_call_gateway' or current_user<>'otr_external_integration_meter_writer' or tg_op not in ('INSERT') then raise exception 'CP15_PROTECTED';end if;
return new;end$$;
revoke all on function public.cp15_guard_flight_call_resource_holds() from public,anon,authenticated,service_role,authenticator;
create trigger cp15_guard before insert or update or delete on public.flight_call_resource_holds for each row execute function public.cp15_guard_flight_call_resource_holds();
create trigger cp15_no_truncate before truncate on public.flight_call_resource_holds for each statement execute function public.cp15_guard_flight_call_resource_holds();
create function public.flight_activation_runtime(context jsonb,command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare v bigint;result jsonb;begin
if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','runtime_enabled'],array[]::text[]) or command->>'version'<>'1' or command->>'environment'<>'DEV' or command->>'integration_id' is not null or jsonb_typeof(command->'runtime_enabled')<>'boolean' then raise exception 'CP15_INVALID_COMMAND';end if;
perform public.cp14_context(context,command,'flight_activation_runtime',array['otr_external_integration_admin_gateway'],'SECURITY_ADMIN');
perform public.cp14_scope_lock('DEV',null);
result:=public.cp14_config_replay(context,command);if result is not null then return result;end if;
select config_version into v from public.external_integration_environment_state where environment='DEV';
if v is distinct from (command->>'expected_version')::bigint then raise exception 'CP15_CAS';end if;
update public.external_integration_environment_state set runtime_enabled=(command->>'runtime_enabled')::boolean,config_version=v+1,updated_at=clock_timestamp(),updated_by=(context->>'verified_actor_id')::uuid where environment='DEV';
perform public.cp14_audit(context,command,null,'runtime',v,v+1,null,public.cp14_hash(command-'request_sha256'),'CONFIG');
return public.cp14_config_replay(context,command);end$$;

create function public.flight_activation_select(context jsonb,command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.flight_activation_scopes;v bigint;result jsonb;p public.intelligence_provider_configs;begin
if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','row'],array[]::text[]) or command->>'version'<>'1' or command->>'environment'<>'DEV' then raise exception 'CP15_INVALID_COMMAND';end if;
perform public.cp14_context(context,command,'flight_activation_select',array['otr_external_integration_admin_gateway'],'SECURITY_ADMIN');perform public.cp14_scope_lock('DEV',command->>'integration_id');
result:=public.cp14_config_replay(context,command);if result is not null then return result;end if;
r:=jsonb_populate_record(null::public.flight_activation_scopes,command->'row');
if not public.cp14_keys(command->'row',array(select jsonb_object_keys(to_jsonb(r))),array[]::text[]) then raise exception 'CP15_SCOPE_GRAMMAR';end if;
if exists(select 1 from public.flight_activation_scopes where scope_id=r.scope_id and integration_id<>r.integration_id) or exists(select 1 from public.flight_activation_scopes where integration_id=r.integration_id and scope_id<>r.scope_id) then raise exception 'CP15_SCOPE_IDENTITY';end if;
select coalesce(max(revision),0) into v from public.flight_activation_scopes where scope_id=r.scope_id;
if v is distinct from (command->>'expected_version')::bigint or r.revision<>v+1 then raise exception 'CP15_CAS';end if;
if r.environment<>'DEV' or r.integration_id<>command->>'integration_id' or r.created_by is distinct from (context->>'verified_actor_id')::uuid or r.expires_at<=clock_timestamp() or r.scope_sha256<>public.cp14_hash(to_jsonb(r)-'scope_sha256') then raise exception 'CP15_SCOPE_PIN';end if;
if not public.cp14_keys(r.pins,array['adapter_version','prompt_sha256','envelope_version','envelope_sha256','output_schema_sha256','minimizer_version','minimizer_sha256','privacy_profile','privacy_sha256','policy_sha256','price_sha256','provider_config_sha256'],array[]::text[]) or exists(select 1 from jsonb_each_text(r.pins) e where (e.key in ('adapter_version','envelope_version','minimizer_version','privacy_profile') and e.value !~ '^[A-Za-z0-9._:-]{1,128}$') or (e.key not in ('adapter_version','envelope_version','minimizer_version','privacy_profile') and e.value !~ '^[0-9a-f]{64}$')) then raise exception 'CP15_SCOPE_PIN';end if;
select * into p from public.intelligence_provider_configs where provider_config_id=r.provider_config_id;
if not found or p.integration_id<>r.integration_id or p.provider_id<>r.provider_id or p.model_id<>r.model_id or p.model_version<>r.expected_family or p.adapter_version<>r.pins->>'adapter_version' or p.configuration_sha256<>r.pins->>'provider_config_sha256' then raise exception 'CP15_PROVIDER_PIN';end if;
if not exists(select 1 from public.external_integrations i where i.integration_id=r.integration_id and i.environment='DEV' and i.config_version=r.integration_version and i.config_sha256=r.configuration_sha256 and i.credential_reference='vault:otr/dev/deepseek/flight-import-v1') then raise exception 'CP15_CONFIG_PIN';end if;
if r.price_schedule_id is not null and not exists(select 1 from public.external_integration_price_schedules price where price.price_schedule_id=r.price_schedule_id and price.schedule_sha256=r.pins->>'price_sha256' and price.currency=r.currency and price.provider_id='DeepSeek' and price.model_id='deepseek-flash' and price.integration_id=r.integration_id) then raise exception 'CP15_PRICE_PIN';end if;
insert into public.flight_activation_scopes select r.*;
perform public.cp14_audit(context,command,r.integration_id,'flight_scope',nullif(v,0),r.revision,null,r.scope_sha256,'CONFIG');return public.cp14_config_replay(context,command);end$$;

create function public.flight_activation_account_grant(context jsonb,command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.flight_activation_account_grants;v bigint;result jsonb;begin
if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','row'],array[]::text[]) or command->>'version'<>'1' or command->>'environment'<>'DEV' then raise exception 'CP15_INVALID_COMMAND';end if;
perform public.cp14_context(context,command,'flight_activation_account_grant',array['otr_external_integration_admin_gateway'],'SECURITY_ADMIN');perform public.cp14_scope_lock('DEV',command->>'integration_id');
result:=public.cp14_config_replay(context,command);if result is not null then return result;end if;
r:=jsonb_populate_record(null::public.flight_activation_account_grants,command->'row');if not public.cp14_keys(command->'row',array(select jsonb_object_keys(to_jsonb(r))),array[]::text[]) then raise exception 'CP15_GRANT_GRAMMAR';end if;
if not exists(select 1 from public.flight_activation_scopes where scope_id=r.scope_id and integration_id=command->>'integration_id') or r.updated_by is distinct from (context->>'verified_actor_id')::uuid or r.expires_at<=clock_timestamp() then raise exception 'CP15_GRANT_SCOPE';end if;
select revision into v from public.flight_activation_account_grants where scope_id=r.scope_id and account_id=r.account_id;v:=coalesce(v,0);
if v is distinct from (command->>'expected_version')::bigint or r.revision<>v+1 then raise exception 'CP15_CAS';end if;
insert into public.flight_activation_account_grants select r.* on conflict(scope_id,account_id) do update set revision=excluded.revision,expires_at=excluded.expires_at,revoked=excluded.revoked,updated_by=excluded.updated_by;
perform public.cp14_audit(context,command,command->>'integration_id','flight_grant',nullif(v,0),r.revision,null,public.cp14_hash(to_jsonb(r)),'CONFIG');return public.cp14_config_replay(context,command);end$$;
alter function public.flight_activation_runtime(jsonb,jsonb) owner to otr_external_integration_config_writer;
revoke all on function public.flight_activation_runtime(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.flight_activation_runtime(jsonb,jsonb) to otr_external_integration_admin_gateway;
alter function public.flight_activation_select(jsonb,jsonb) owner to otr_external_integration_config_writer;
revoke all on function public.flight_activation_select(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.flight_activation_select(jsonb,jsonb) to otr_external_integration_admin_gateway;
alter function public.flight_activation_account_grant(jsonb,jsonb) owner to otr_external_integration_config_writer;
revoke all on function public.flight_activation_account_grant(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.flight_activation_account_grant(jsonb,jsonb) to otr_external_integration_admin_gateway;
-- Existing C admission lock and Trip → membership row-lock convention.
-- CP14 environment/integration precede this helper; call/hold locks follow it.
create function public.cp15_lock_trip_authority(actor uuid,trip uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$begin
 perform public.trip_import_scope_lock(actor,trip);
 perform 1 from public.trips where id=trip for share;
 perform 1 from public.trip_members where trip_id=trip and user_id=actor order by id for share;
 perform 1 from public.journey_members where trip_id=trip and user_id=actor order by id for share;
 -- The existing cp14_call_admission predicate is checked after these locks.
end$$;
revoke all on function public.cp15_lock_trip_authority(uuid,uuid) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp15_lock_trip_authority(uuid,uuid) to otr_external_integration_meter_writer;
create function public.cp15_flight_admission(r public.external_integration_calls,s public.flight_activation_scopes,g public.flight_activation_account_grants,execution jsonb) returns void language plpgsql set search_path=pg_catalog as $$begin
if r.environment<>'DEV' or r.task_class<>'FLIGHT_IMPORT_V1' or r.call_kind<>'OUTBOUND_MODEL' or r.shadow or r.shadow_of_call_id is not null or r.invocation_id is not null or r.trip_id is null or r.provider_id<>'DeepSeek' or r.model_id<>'deepseek-flash' or r.model_version<>'DeepSeek-V4.1-Flash' or r.billing_subject_id is not null then raise exception 'CP15_WORKLOAD_CLOSED';end if;
if not coalesce((select runtime_enabled and not kill_switch from public.external_integration_environment_state where environment='DEV'),false) then raise exception 'CP14_RUNTIME_CLOSED';end if;
if s.scope_id is null or not s.active or s.expires_at<=clock_timestamp() or s.revision is distinct from (select max(revision) from public.flight_activation_scopes where scope_id=s.scope_id) or s.integration_id<>r.integration_id or s.integration_version<>r.config_version or s.configuration_sha256<>r.configuration_sha256 or s.provider_config_id is distinct from r.provider_config_id or s.price_schedule_id is distinct from r.price_schedule_id or s.pins->>'adapter_version'<>r.adapter_version or s.pins->>'output_schema_sha256'<>r.schema_sha256 then raise exception 'CP15_SCOPE_CLOSED';end if;
if execution is distinct from s.pins then raise exception 'CP15_EXECUTION_PIN';end if;
if g.scope_id is null or g.account_id is distinct from r.account_id or g.revoked or g.expires_at<=clock_timestamp() then raise exception 'CP15_ACCOUNT_CLOSED';end if;
if not s.monetary_approved then raise exception 'CP15_MONETARY_CLOSED';end if;
perform public.cp14_call_admission(r,false);
end$$;
revoke all on function public.cp15_flight_admission(public.external_integration_calls,public.flight_activation_scopes,public.flight_activation_account_grants,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp15_flight_admission(public.external_integration_calls,public.flight_activation_scopes,public.flight_activation_account_grants,jsonb) to otr_external_integration_meter_writer;
create or replace function public.flight_activation_reserve_call(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;
old public.external_integration_calls;
s public.external_integration_usage_events;
sc public.flight_activation_scopes;g public.flight_activation_account_grants;
day date;admission_time timestamptz;worst numeric;input_rate numeric;output_rate numeric;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','row','start','scope_id','scope_revision','scope_sha256','grant_revision','input_ceiling','output_ceiling','execution_pins','execution_pins_sha256'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['call_id','integration_id','environment','provider_config_id','provider_id','model_id','model_version','adapter_version','config_version','configuration_sha256','account_id','user_id','billing_subject_id','trip_id','import_id','task_id','attempt_id','fallback_chain_id','shadow_of_call_id','evaluation_reference','attempt_sequence','invocation_id','request_id','idempotency_key','request_sha256','input_sha256','schema_sha256','capability','task_class','call_kind','shadow','price_schedule_id','admitted_at','admission_sha256','publication_fence','row_revision','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'flight_activation_reserve_call',array['otr_external_integration_call_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
admission_time:=clock_timestamp();day:=(admission_time at time zone 'UTC')::date;
r:=jsonb_populate_record(null::public.external_integration_calls,command->'row');
if r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from r.account_id or r.environment<>context->>'verified_environment' or r.integration_id<>command->>'integration_id' or r.dispatch_state<>'RESERVED' or r.execution_certainty<>'NOT_STARTED' or r.row_revision<>1 or r.request_id<>(command->>'request_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';
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
return to_jsonb(r);
 end$$;
alter function public.flight_activation_reserve_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;
revoke all on function public.flight_activation_reserve_call(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.flight_activation_reserve_call(jsonb,jsonb) to otr_external_integration_call_gateway;
set role otr_external_integration_meter_writer;
create or replace function public.external_integration_mark_dispatch(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;h public.flight_call_resource_holds;s public.flight_activation_scopes;g public.flight_activation_account_grants;
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
select * into s from public.flight_activation_scopes where scope_id=h.scope_id and revision=h.scope_revision;
select * into g from public.flight_activation_account_grants where scope_id=h.scope_id and account_id=r.account_id;
perform public.cp15_flight_admission(r,s,g,h.execution_pins);
if h.execution_pins_sha256 is distinct from public.cp14_hash(h.execution_pins) then raise exception 'CP15_EXECUTION_PIN';end if;
if h.scope_sha256 is distinct from s.scope_sha256 or h.grant_revision is distinct from g.revision or h.price_schedule_id is distinct from r.price_schedule_id or h.worst_cost_nanos>s.call_cost_nanos then raise exception 'CP15_HOLD_PIN';end if;
update public.external_integration_calls set dispatch_state='MAY_HAVE_STARTED',execution_certainty='RUNNING',row_revision=row_revision+1,dispatch_marked_at=clock_timestamp() where call_id=r.call_id returning * into r;
return to_jsonb(r);
 end$$;
reset role;
set role otr_external_integration_meter_writer;
create or replace function public.external_integration_usage_append(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_usage_events;
old public.external_integration_usage_events;
call public.external_integration_calls;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','integration_id','call_id','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['observation_id','call_id','observation_key','observation_version','observation_kind','measurement_mode','observed_at','received_at','started_at','ended_at','latency_ms','status','outcome','response_sha256','publication_sha256','input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms','other_units','provider_extension','usage_quality','unit_quality','price_schedule_id','cost_nanos','currency','cost_quality','cost_calculation_version','supersedes_observation_id','observation_sha256'],array['provider_request_id']) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_integration_usage_append',array['otr_external_integration_call_gateway','otr_external_integration_recovery_gateway'],null);
select * into call from public.external_integration_calls where call_id=(command->>'call_id')::uuid for update;
if not found or call.integration_id<>command->>'integration_id' or call.environment<>context->>'verified_environment' then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
if call.account_id is distinct from (context->>'verified_account_id')::uuid or call.user_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';end if;
if command->'row'->>'cost_nanos' is not null and command->'row'->>'cost_nanos' !~ '^[0-9]{1,60}$' then raise exception 'CP14_COST_INTEGER';
end if;
r:=jsonb_populate_record(null::public.external_integration_usage_events,command->'row');
if r.provider_request_id is not null and (call.task_class<>'FLIGHT_IMPORT_V1' or call.environment<>'DEV' or call.call_kind<>'OUTBOUND_MODEL' or call.shadow or not exists(select 1 from public.flight_call_resource_holds where call_id=call.call_id) or call.dispatch_state='RESERVED' or r.observation_kind='START') then raise exception 'CP15_PROVIDER_ID_FORBIDDEN';end if;
if r.call_id<>call.call_id or r.price_schedule_id is distinct from call.price_schedule_id then raise exception 'CP14_USAGE_PIN';
end if;
select * into old from public.external_integration_usage_events where call_id=r.call_id and observation_key=r.observation_key;
if found then if to_jsonb(old)<>to_jsonb(r) then raise exception 'CP14_CHANGED_OBSERVATION';
end if;
return to_jsonb(old);
end if;
if r.measurement_mode<>'NONE' and exists(select 1 from public.external_integration_usage_events e where e.call_id=r.call_id and e.measurement_mode not in ('NONE',r.measurement_mode) and e.observation_id is distinct from r.supersedes_observation_id and (exists(select 1 from unnest(array['input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms']) unit where to_jsonb(e)->>unit is not null and to_jsonb(r)->>unit is not null) or exists(select 1 from jsonb_object_keys(r.other_units) key where e.other_units ? key) or exists(select 1 from jsonb_object_keys(r.provider_extension) key where e.provider_extension ? key))) then raise exception 'CP14_MIXED_MEASUREMENTS';
end if;
if r.supersedes_observation_id is not null and not exists(select 1 from public.external_integration_usage_events where call_id=r.call_id and observation_id=r.supersedes_observation_id and received_at<=r.received_at) then raise exception 'CP14_INVALID_CORRECTION';
end if;
if jsonb_typeof(r.other_units)<>'object' or (select count(*) from jsonb_each(r.other_units))>16 or exists(select 1 from jsonb_each(r.other_units||r.provider_extension) e where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]{1,16}$' or (value::text)::numeric>9007199254740991 or key !~ '^[A-Za-z0-9._:-]{1,128}$') or exists(select 1 from jsonb_each(r.unit_quality) e where jsonb_typeof(value) is distinct from 'string' or value#>>'{}' not in ('ACTUAL_REPORTED','ESTIMATED','UNKNOWN') or not key=any(array['input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms']) and not r.other_units ? key and not r.provider_extension ? key) then raise exception 'CP14_USAGE_GRAMMAR';
end if;
insert into public.external_integration_usage_events select r.*;
return to_jsonb(r);
 end$$;
reset role;
revoke create on schema public from otr_external_integration_config_writer,otr_external_integration_meter_writer;
revoke otr_external_integration_config_writer,otr_external_integration_meter_writer from postgres;
commit;
