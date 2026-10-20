-- CP14: closed persistence. Migration owner only; no connector provisioning.
begin;

create role otr_external_integration_config_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_meter_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_inbound_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_admin_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_call_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_inbound_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_reporting_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create role otr_external_integration_recovery_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

-- Transaction-local migration ownership rights; fully removed before commit.
grant otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader to postgres with inherit true,set true;

grant create on schema public to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create table public.external_integration_environment_state (
 environment text not null check(environment ~ '^[A-Za-z0-9._:-]{1,128}$'),
 config_version bigint not null default 1 check(config_version between 1 and 9007199254740991),
 kill_switch boolean not null default true,
 runtime_enabled boolean not null default false,
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 updated_by uuid,
 primary key(environment),
 foreign key(updated_by) references auth.users(id) on delete restrict,
 check(environment in ('TEST','DEV','PRODUCTION')),
 check(runtime_enabled=false));

create table public.external_integrations (
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 category text not null check(category ~ '^[A-Za-z0-9._:-]{1,128}$'),
 vendor_namespace text not null check(vendor_namespace ~ '^[A-Za-z0-9._:-]{1,128}$'),
 environment text not null check(environment ~ '^[A-Za-z0-9._:-]{1,128}$'),
 admin_label text not null check(char_length(admin_label) between 1 and 200 and btrim(admin_label)<>''),
 enabled boolean not null default false,
 kill_switch boolean not null default true,
 config_version bigint not null default 1 check(config_version between 1 and 9007199254740991),
 config_sha256 text not null check(config_sha256 ~ '^[0-9a-f]{64}$'),
 credential_reference text check(char_length(credential_reference) between 1 and 160 and btrim(credential_reference)<>''),
 auth_config_reference text check(char_length(auth_config_reference) between 1 and 160 and btrim(auth_config_reference)<>''),
 capabilities text[] not null check(cardinality(capabilities)<=32 and array_position(capabilities,null) is null),
 quota_limit bigint check(quota_limit between 0 and 9007199254740991),
 quota_window_seconds bigint check(quota_window_seconds between 0 and 9007199254740991),
 rate_per_minute bigint check(rate_per_minute between 0 and 9007199254740991),
 health_state text not null default 'UNKNOWN' check(health_state ~ '^[A-Za-z0-9._:-]{1,128}$'),
 health_observed_at timestamptz(6) check(isfinite(health_observed_at)),
 health_observation_id uuid,
 created_at timestamptz(6) not null check(isfinite(created_at)),
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 created_by uuid not null,
 updated_by uuid not null,
 primary key(integration_id),
 foreign key(environment) references public.external_integration_environment_state(environment) on delete restrict,
 foreign key(created_by) references auth.users(id) on delete restrict,
 foreign key(updated_by) references auth.users(id) on delete restrict,
 unique(environment,vendor_namespace,integration_id),
 unique(integration_id,environment),
 check(category in ('INTELLIGENCE_OUTBOUND','AI_CLIENT_INBOUND','FLIGHT_DATA','PLACES','WEATHER','EMAIL','STORAGE_MEDIA','NOTIFICATION','PAYMENTS','FUTURE_API')),
 check((quota_limit is null)=(quota_window_seconds is null)),
 check(quota_window_seconds between 1 and 31536000),
 check(credential_reference is null or credential_reference ~ '^vault:[A-Za-z0-9/_-]{1,128}$'),
 check(auth_config_reference is null or auth_config_reference ~ '^authcfg:[A-Za-z0-9._:/-]{1,128}$'),
 check(health_state in ('HEALTHY','UNAVAILABLE','UNKNOWN')),
 check((health_observed_at is null)=(health_observation_id is null)),
 check(health_observation_id is not null or health_state='UNKNOWN'));

create table public.intelligence_provider_configs (
 provider_config_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 provider_id text not null check(provider_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 model_id text not null check(model_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 model_version text not null check(model_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 adapter_version text not null check(adapter_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 config_version bigint not null check(config_version between 1 and 9007199254740991),
 configuration_sha256 text not null check(configuration_sha256 ~ '^[0-9a-f]{64}$'),
 provider_class text not null check(provider_class ~ '^[A-Za-z0-9._:-]{1,128}$'),
 capabilities text[] not null check(cardinality(capabilities)<=32 and array_position(capabilities,null) is null),
 modalities text[] not null check(cardinality(modalities)<=32 and array_position(modalities,null) is null),
 schema_contracts jsonb not null check(octet_length(schema_contracts::text)<=16384),
 schema_output boolean not null,
 privacy_policy text not null check(privacy_policy ~ '^[A-Za-z0-9._:-]{1,128}$'),
 network_required boolean not null,
 data_region text not null check(data_region ~ '^[A-Za-z0-9._:-]{1,128}$'),
 routing_class text not null check(routing_class ~ '^[A-Za-z0-9._:-]{1,128}$'),
 routing_priority bigint not null check(routing_priority between 0 and 9007199254740991),
 routing_eligibility text not null default 'DISABLED' check(routing_eligibility ~ '^[A-Za-z0-9._:-]{1,128}$'),
 input_byte_limit bigint not null check(input_byte_limit between 0 and 9007199254740991),
 output_byte_limit bigint not null check(output_byte_limit between 0 and 9007199254740991),
 input_count_limit bigint not null check(input_count_limit between 0 and 9007199254740991),
 max_complexity bigint not null check(max_complexity between 0 and 9007199254740991),
 max_risk bigint not null check(max_risk between 0 and 9007199254740991),
 replay_support text not null check(replay_support ~ '^[A-Za-z0-9._:-]{1,128}$'),
 quality_policy_reference text check(quality_policy_reference ~ '^[A-Za-z0-9._:-]{1,128}$'),
 quality_policy_sha256 text check(quality_policy_sha256 ~ '^[0-9a-f]{64}$'),
 quality_observation_reference uuid,
 latency_estimate_ms bigint check(latency_estimate_ms between 0 and 9007199254740991),
 expected_completion_cost_nanos numeric(60,0) check(expected_completion_cost_nanos>=0 and expected_completion_cost_nanos::text not in ('NaN','Infinity','-Infinity')),
 expected_cost_currency text check(expected_cost_currency ~ '^[A-Z]{3}$'),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 created_by uuid not null,
 primary key(provider_config_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 foreign key(created_by) references auth.users(id) on delete restrict,
 unique(integration_id,provider_config_id),
 unique(integration_id,provider_id,model_id,config_version),
 check(provider_class in ('DETERMINISTIC','ON_DEVICE','OTR_SELF_HOSTED','COMMERCIAL_REMOTE')),
 check(privacy_policy in ('LOCAL_ONLY','OTR_ONLY','REMOTE_ALLOWED')),
 check(routing_eligibility in ('DISABLED','SHADOW_ONLY','ELIGIBLE')),
 check(replay_support in ('SUPPORTED','UNSUPPORTED','UNKNOWN')),
 check(privacy_policy<>'LOCAL_ONLY' or not network_required),
 check((quality_policy_reference is null)=(quality_policy_sha256 is null)),
 check((quality_policy_sha256 is null)=(quality_observation_reference is null)),
 check((expected_completion_cost_nanos is null)=(expected_cost_currency is null)));

create table public.external_integration_price_schedules (
 price_schedule_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 provider_id text check(provider_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 model_id text check(model_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 schedule_version text not null check(schedule_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 effective_from timestamptz(6) not null check(isfinite(effective_from)),
 effective_until timestamptz(6) check(isfinite(effective_until)),
 source_reference text not null check(source_reference ~ '^[A-Za-z0-9._:-]{1,128}$'),
 source_version text not null check(source_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 schedule_sha256 text not null check(schedule_sha256 ~ '^[0-9a-f]{64}$'),
 supersedes_schedule_id uuid,
 rounding_policy text not null check(rounding_policy ~ '^[A-Za-z0-9._:-]{1,128}$'),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 created_by uuid not null,
 primary key(price_schedule_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 foreign key(created_by) references auth.users(id) on delete restrict,
 unique(integration_id,price_schedule_id),
 unique(integration_id,schedule_version),
 foreign key(supersedes_schedule_id) references public.external_integration_price_schedules(price_schedule_id) on delete restrict,
 check((provider_id is null)=(model_id is null)),
 check(effective_until is null or effective_until>effective_from),
 check(rounding_policy='SUM_THEN_CEIL_NANOS_V1'));

create table public.external_integration_price_schedule_units (
 price_schedule_id uuid not null,
 unit_key text not null check(unit_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 measurement_unit text not null check(measurement_unit ~ '^[A-Za-z0-9._:-]{1,128}$'),
 unit_quantity bigint not null check(unit_quantity between 0 and 9007199254740991),
 price_per_quantity numeric(60,18) not null check(price_per_quantity>=0 and price_per_quantity::text not in ('NaN','Infinity','-Infinity')),
 unit_definition jsonb not null check(octet_length(unit_definition::text)<=4096),
 primary key(price_schedule_id,unit_key),
 foreign key(price_schedule_id) references public.external_integration_price_schedules(price_schedule_id) on delete restrict,
 check(unit_quantity>0));

create table public.external_integration_calls (
 call_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 environment text not null check(environment ~ '^[A-Za-z0-9._:-]{1,128}$'),
 provider_config_id uuid,
 provider_id text check(provider_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 model_id text check(model_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 model_version text check(model_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 adapter_version text check(adapter_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 config_version bigint not null check(config_version between 1 and 9007199254740991),
 configuration_sha256 text not null check(configuration_sha256 ~ '^[0-9a-f]{64}$'),
 account_id uuid,
 user_id uuid,
 billing_subject_id uuid,
 trip_id uuid,
 import_id uuid,
 task_id uuid,
 attempt_id uuid,
 fallback_chain_id uuid,
 shadow_of_call_id uuid,
 evaluation_reference uuid,
 attempt_sequence bigint check(attempt_sequence between 0 and 9007199254740991),
 invocation_id uuid,
 request_id uuid not null,
 idempotency_key uuid not null,
 request_sha256 text check(request_sha256 ~ '^[0-9a-f]{64}$'),
 input_sha256 text check(input_sha256 ~ '^[0-9a-f]{64}$'),
 schema_sha256 text check(schema_sha256 ~ '^[0-9a-f]{64}$'),
 capability text not null check(capability ~ '^[A-Za-z0-9._:-]{1,128}$'),
 task_class text not null check(task_class ~ '^[A-Za-z0-9._:-]{1,128}$'),
 call_kind text not null check(call_kind ~ '^[A-Za-z0-9._:-]{1,128}$'),
 shadow boolean not null default false,
 price_schedule_id uuid,
 admitted_at timestamptz(6) not null check(isfinite(admitted_at)),
 admission_sha256 text not null check(admission_sha256 ~ '^[0-9a-f]{64}$'),
 publication_fence bigint not null check(publication_fence between 1 and 9007199254740991),
 row_revision bigint not null default 1 check(row_revision between 1 and 9007199254740991),
 dispatch_state text not null default 'RESERVED' check(dispatch_state ~ '^[A-Za-z0-9._:-]{1,128}$'),
 execution_certainty text not null default 'NOT_STARTED' check(execution_certainty ~ '^[A-Za-z0-9._:-]{1,128}$'),
 dispatch_marked_at timestamptz(6) check(isfinite(dispatch_marked_at)),
 terminal_observed_at timestamptz(6) check(isfinite(terminal_observed_at)),
 safe_reason text check(safe_reason ~ '^[A-Za-z0-9._:-]{1,128}$'),
 primary key(call_id),
 foreign key(environment) references public.external_integration_environment_state(environment) on delete restrict,
 foreign key(account_id) references auth.users(id) on delete restrict,
 foreign key(user_id) references auth.users(id) on delete restrict,
 foreign key(billing_subject_id) references auth.users(id) on delete restrict,
 foreign key(trip_id) references public.trips(id) on delete restrict,
 foreign key(integration_id,environment) references public.external_integrations(integration_id,environment) on delete restrict,
 foreign key(integration_id,provider_config_id) references public.intelligence_provider_configs(integration_id,provider_config_id) on delete restrict,
 foreign key(integration_id,price_schedule_id) references public.external_integration_price_schedules(integration_id,price_schedule_id) on delete restrict,
 foreign key(shadow_of_call_id) references public.external_integration_calls(call_id) on delete restrict,
 check(account_id is not distinct from user_id),
 check(call_kind in ('OUTBOUND_MODEL','INBOUND_TOOL','GENERIC_API','SELF_HOSTED_COMPUTE')),
 check(dispatch_state in ('RESERVED','MAY_HAVE_STARTED','TERMINAL','UNKNOWN')),
 check(execution_certainty in ('NOT_STARTED','RUNNING','TERMINAL','UNKNOWN')),
 check(attempt_sequence is null or attempt_sequence>0),
 check(call_kind not in ('OUTBOUND_MODEL','SELF_HOSTED_COMPUTE') or (account_id is not null and task_id is not null and attempt_id is not null and attempt_sequence is not null and request_sha256 is not null and input_sha256 is not null and schema_sha256 is not null and provider_config_id is not null and provider_id is not null and model_id is not null and model_version is not null and adapter_version is not null)),
 check(call_kind<>'INBOUND_TOOL' or (provider_config_id is null and provider_id is null and model_id is null and model_version is null and adapter_version is null and invocation_id is not null)),
 check(shadow=(shadow_of_call_id is not null)));

create table public.external_integration_usage_events (
 observation_id uuid not null,
 call_id uuid not null,
 observation_key text not null check(observation_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 observation_version smallint not null default 1,
 observation_kind text not null check(observation_kind ~ '^[A-Za-z0-9._:-]{1,128}$'),
 measurement_mode text not null check(measurement_mode ~ '^[A-Za-z0-9._:-]{1,128}$'),
 observed_at timestamptz(6) not null check(isfinite(observed_at)),
 received_at timestamptz(6) not null check(isfinite(received_at)),
 started_at timestamptz(6) check(isfinite(started_at)),
 ended_at timestamptz(6) check(isfinite(ended_at)),
 latency_ms bigint check(latency_ms between 0 and 9007199254740991),
 status text not null check(status ~ '^[A-Za-z0-9._:-]{1,128}$'),
 outcome text check(outcome ~ '^[A-Za-z0-9._:-]{1,128}$'),
 response_sha256 text check(response_sha256 ~ '^[0-9a-f]{64}$'),
 publication_sha256 text check(publication_sha256 ~ '^[0-9a-f]{64}$'),
 input_tokens bigint check(input_tokens between 0 and 9007199254740991),
 output_tokens bigint check(output_tokens between 0 and 9007199254740991),
 total_tokens bigint check(total_tokens between 0 and 9007199254740991),
 cached_input_tokens bigint check(cached_input_tokens between 0 and 9007199254740991),
 reasoning_tokens bigint check(reasoning_tokens between 0 and 9007199254740991),
 image_units bigint check(image_units between 0 and 9007199254740991),
 audio_units bigint check(audio_units between 0 and 9007199254740991),
 call_count bigint check(call_count between 0 and 9007199254740991),
 bytes bigint check(bytes between 0 and 9007199254740991),
 wall_ms bigint check(wall_ms between 0 and 9007199254740991),
 cpu_ms bigint check(cpu_ms between 0 and 9007199254740991),
 gpu_ms bigint check(gpu_ms between 0 and 9007199254740991),
 accelerator_ms bigint check(accelerator_ms between 0 and 9007199254740991),
 other_units jsonb not null check(octet_length(other_units::text)<=4096),
 provider_extension jsonb not null check(octet_length(provider_extension::text)<=4096),
 usage_quality text not null default 'UNKNOWN' check(usage_quality ~ '^[A-Za-z0-9._:-]{1,128}$'),
 unit_quality jsonb not null check(octet_length(unit_quality::text)<=4096),
 price_schedule_id uuid,
 cost_nanos numeric(60,0) check(cost_nanos>=0 and cost_nanos::text not in ('NaN','Infinity','-Infinity')),
 currency text check(currency ~ '^[A-Z]{3}$'),
 cost_quality text not null default 'UNKNOWN' check(cost_quality ~ '^[A-Za-z0-9._:-]{1,128}$'),
 cost_calculation_version text check(cost_calculation_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 supersedes_observation_id uuid,
 observation_sha256 text not null check(observation_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(observation_id),
 foreign key(call_id) references public.external_integration_calls(call_id) on delete restrict,
 foreign key(price_schedule_id) references public.external_integration_price_schedules(price_schedule_id) on delete restrict,
 foreign key(call_id,supersedes_observation_id) references public.external_integration_usage_events(call_id,observation_id) on delete restrict,
 unique(call_id,observation_id),
 unique(call_id,observation_key),
 check(observation_kind in ('START','PROGRESS','COMPLETION','RECOVERY','COST_RECONCILIATION')),
 check(measurement_mode in ('NONE','CUMULATIVE','DELTA')),
 check(status in ('STARTED','SUCCEEDED','PARTIAL','FAILED','CANCELED','UNKNOWN')),
 check(usage_quality in ('ACTUAL_REPORTED','ESTIMATED','UNKNOWN')),
 check(cost_quality in ('ACTUAL_REPORTED','ESTIMATED','UNKNOWN')),
 check((cost_quality='UNKNOWN')=(cost_nanos is null)),
 check(cost_nanos is null or currency is not null),
 check(ended_at is null or started_at is null or ended_at>=started_at),
 check(observation_version=1),
 check(observation_kind<>'START' or (measurement_mode='NONE' and ended_at is null and latency_ms is null and input_tokens is null and output_tokens is null and total_tokens is null and cached_input_tokens is null and reasoning_tokens is null and image_units is null and audio_units is null and call_count is null and bytes is null and wall_ms is null and cpu_ms is null and gpu_ms is null and accelerator_ms is null and other_units='{}' and provider_extension='{}' and cost_nanos is null)));

create table public.external_integration_config_audit (
 audit_id uuid not null,
 integration_id text check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 environment text not null check(environment ~ '^[A-Za-z0-9._:-]{1,128}$'),
 entity_kind text not null check(entity_kind ~ '^[A-Za-z0-9._:-]{1,128}$'),
 entity_key text not null check(entity_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
 previous_version bigint check(previous_version between 1 and 9007199254740991),
 new_version bigint not null check(new_version between 1 and 9007199254740991),
 admin_actor_id uuid not null,
 command_id uuid not null,
 change_type text not null check(change_type ~ '^[A-Za-z0-9._:-]{1,128}$'),
 before_sha256 text check(before_sha256 ~ '^[0-9a-f]{64}$'),
 after_sha256 text not null check(after_sha256 ~ '^[0-9a-f]{64}$'),
 safe_diff jsonb not null check(octet_length(safe_diff::text)<=16384),
 reason_code text not null check(reason_code ~ '^[A-Za-z0-9._:-]{1,128}$'),
 occurred_at timestamptz(6) not null check(isfinite(occurred_at)),
 primary key(audit_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 foreign key(environment) references public.external_integration_environment_state(environment) on delete restrict,
 foreign key(admin_actor_id) references auth.users(id) on delete restrict,
 unique(environment,command_id),
 check(change_type in ('ENABLE','DISABLE','KILL','CONFIG','QUOTA','PRICE','CREDENTIAL_REFERENCE_ROTATION','AUTH_CONFIG','GRANT_REVOKE','REQUEST_BINDING')));

create table public.external_integration_health_observations (
 health_observation_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 config_version bigint not null check(config_version between 1 and 9007199254740991),
 health_state text not null check(health_state ~ '^[A-Za-z0-9._:-]{1,128}$'),
 safe_reason text check(safe_reason ~ '^[A-Za-z0-9._:-]{1,128}$'),
 provider_observed_at timestamptz(6) check(isfinite(provider_observed_at)),
 received_at timestamptz(6) not null check(isfinite(received_at)),
 observation_sequence bigint not null check(observation_sequence between 1 and 9007199254740991),
 latency_ms bigint check(latency_ms between 0 and 9007199254740991),
 observer_principal_id uuid not null,
 observation_sha256 text not null check(observation_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(health_observation_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 unique(integration_id,health_observation_id),
 unique(integration_id,observation_sequence),
 check(health_state in ('HEALTHY','UNAVAILABLE','UNKNOWN')));

create table public.external_client_identities (
 client_identity_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 issuer_namespace text not null check(issuer_namespace ~ '^[A-Za-z0-9._:-]{1,128}$'),
 subject_digest text not null check(subject_digest ~ '^[0-9a-f]{64}$'),
 auth_config_reference text not null check(char_length(auth_config_reference) between 1 and 160 and btrim(auth_config_reference)<>''),
 auth_config_version bigint not null check(auth_config_version between 1 and 9007199254740991),
 enabled boolean not null default false,
 revoked_at timestamptz(6) check(isfinite(revoked_at)),
 row_revision bigint not null default 1 check(row_revision between 1 and 9007199254740991),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 primary key(client_identity_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 unique(integration_id,client_identity_id),
 unique(integration_id,issuer_namespace,subject_digest),
 check(auth_config_reference ~ '^authcfg:[A-Za-z0-9._:/-]{1,128}$'));

create table public.external_client_grants (
 grant_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 client_identity_id uuid not null,
 account_id uuid not null,
 user_id uuid not null,
 scope_kind text not null check(scope_kind ~ '^[A-Za-z0-9._:-]{1,128}$'),
 trip_id uuid,
 package_id uuid,
 actions text[] not null check(cardinality(actions)<=32 and array_position(actions,null) is null),
 quota_limit bigint check(quota_limit between 0 and 9007199254740991),
 quota_window_seconds bigint check(quota_window_seconds between 0 and 9007199254740991),
 auth_session_reference text not null check(char_length(auth_session_reference) between 1 and 160 and btrim(auth_session_reference)<>''),
 auth_session_version bigint not null check(auth_session_version between 1 and 9007199254740991),
 expires_at timestamptz(6) not null check(isfinite(expires_at)),
 revoked_at timestamptz(6) check(isfinite(revoked_at)),
 grant_revision bigint not null default 1 check(grant_revision between 1 and 9007199254740991),
 authorization_sha256 text not null check(authorization_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 authorized_by uuid not null,
 primary key(grant_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 foreign key(account_id) references auth.users(id) on delete restrict,
 foreign key(user_id) references auth.users(id) on delete restrict,
 foreign key(trip_id) references public.trips(id) on delete restrict,
 foreign key(authorized_by) references auth.users(id) on delete restrict,
 unique(grant_id,integration_id,client_identity_id,account_id,user_id),
 foreign key(integration_id,client_identity_id) references public.external_client_identities(integration_id,client_identity_id) on delete restrict,
 check((quota_limit is null)=(quota_window_seconds is null)),
 check(quota_window_seconds between 1 and 31536000),
 check(account_id is not distinct from user_id),
 check(scope_kind in ('ACCOUNT_STAGING','SINGLE_TRIP')),
 check((scope_kind='SINGLE_TRIP')=(trip_id is not null)),
 check(actions <@ array['SUBMIT','STATUS','REVIEW']::text[] and cardinality(actions)>0),
 check(authorized_by=user_id),
 check(auth_session_reference ~ '^vault:[A-Za-z0-9/_-]{1,128}$'));

create table public.inbound_ai_import_reservations (
 reservation_id uuid not null,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 client_identity_id uuid not null,
 account_id uuid not null,
 user_id uuid not null,
 grant_id uuid not null,
 admitted_grant_revision bigint not null check(admitted_grant_revision between 1 and 9007199254740991),
 package_id uuid not null,
 package_version smallint not null,
 contract_version text not null check(contract_version ~ '^[A-Za-z0-9._:-]{1,128}$'),
 idempotency_key uuid not null,
 package_sha256 text not null check(package_sha256 ~ '^[0-9a-f]{64}$'),
 package_bytes bigint not null check(package_bytes between 0 and 9007199254740991),
 trip_intent_kind text not null check(trip_intent_kind ~ '^[A-Za-z0-9._:-]{1,128}$'),
 trip_id uuid,
 package_material_reference uuid,
 package_material_sha256 text check(package_material_sha256 ~ '^[0-9a-f]{64}$'),
 material_admission_sha256 text check(material_admission_sha256 ~ '^[0-9a-f]{64}$'),
 import_id uuid,
 task_id uuid,
 publication_refs jsonb not null check(octet_length(publication_refs::text)<=65536),
 review_version bigint not null default 1 check(review_version between 1 and 9007199254740991),
 state text not null default 'RESERVED' check(state ~ '^[A-Za-z0-9._:-]{1,128}$'),
 recovery_disposition text not null default 'EXACT_RECOVERY_REQUIRED' check(recovery_disposition ~ '^[A-Za-z0-9._:-]{1,128}$'),
 row_revision bigint not null default 1 check(row_revision between 1 and 9007199254740991),
 publication_fence bigint not null default 1 check(publication_fence between 1 and 9007199254740991),
 result_version bigint check(result_version between 1 and 9007199254740991),
 result_sha256 text check(result_sha256 ~ '^[0-9a-f]{64}$'),
 safe_result jsonb check(octet_length(safe_result::text)<=65536),
 safe_reason text check(safe_reason in ('INVALID_PACKAGE','STALE_REVIEW','ACCESS_REVOKED','MATERIAL_UNAVAILABLE','EXACT_RECOVERY_REQUIRED','USER_REJECTED','USER_DEFERRED')),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 completed_at timestamptz(6) check(isfinite(completed_at)),
 primary key(reservation_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 foreign key(account_id) references auth.users(id) on delete restrict,
 foreign key(user_id) references auth.users(id) on delete restrict,
 foreign key(trip_id) references public.trips(id) on delete restrict,
 foreign key(grant_id,integration_id,client_identity_id,account_id,user_id) references public.external_client_grants(grant_id,integration_id,client_identity_id,account_id,user_id) on delete restrict,
 unique(integration_id,account_id,idempotency_key),
 unique(integration_id,account_id,package_id),
 unique(reservation_id,integration_id,account_id),
 check(account_id is not distinct from user_id),
 check(trip_intent_kind in ('KNOWN','SELECT','PROPOSE')),
 check((trip_intent_kind='KNOWN')=(trip_id is not null)),
 check(package_version=1 and contract_version='otr-inbound-import-v1' and package_bytes<=4194304),
 check(state in ('RESERVED','MATERIAL_PENDING','PROCESSING','NEEDS_REVIEW','DEFERRED','UNKNOWN','REJECTED','COMPLETE')),
 check((package_material_reference is null)=(package_material_sha256 is null)),
 check((result_version is null)=(result_sha256 is null) and (result_version is null)=(safe_result is null)));

create table public.inbound_ai_invocations (
 invocation_id uuid not null,
 reservation_id uuid,
 integration_id text not null check(integration_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
 client_identity_id uuid not null,
 account_id uuid not null,
 user_id uuid not null,
 grant_id uuid not null,
 admitted_grant_revision bigint not null check(admitted_grant_revision between 1 and 9007199254740991),
 action text not null check(action ~ '^[A-Za-z0-9._:-]{1,128}$'),
 request_id uuid not null,
 request_sha256 text not null check(request_sha256 ~ '^[0-9a-f]{64}$'),
 call_id uuid not null,
 publication_fence bigint not null check(publication_fence between 1 and 9007199254740991),
 row_revision bigint not null default 1 check(row_revision between 1 and 9007199254740991),
 state text not null default 'RESERVED' check(state ~ '^[A-Za-z0-9._:-]{1,128}$'),
 response_version bigint check(response_version between 1 and 9007199254740991),
 response_sha256 text check(response_sha256 ~ '^[0-9a-f]{64}$'),
 safe_response jsonb check(octet_length(safe_response::text)<=65536),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 completed_at timestamptz(6) check(isfinite(completed_at)),
 primary key(invocation_id),
 foreign key(integration_id) references public.external_integrations(integration_id) on delete restrict,
 foreign key(account_id) references auth.users(id) on delete restrict,
 foreign key(user_id) references auth.users(id) on delete restrict,
 foreign key(integration_id,client_identity_id) references public.external_client_identities(integration_id,client_identity_id) on delete restrict,
 foreign key(grant_id,integration_id,client_identity_id,account_id,user_id) references public.external_client_grants(grant_id,integration_id,client_identity_id,account_id,user_id) on delete restrict,
 foreign key(reservation_id) references public.inbound_ai_import_reservations(reservation_id) on delete restrict,
 foreign key(call_id) references public.external_integration_calls(call_id) on delete restrict deferrable initially deferred,
 unique(call_id),
 unique(integration_id,account_id,request_id),
 check(account_id is not distinct from user_id),
 check(action in ('SUBMIT','STATUS','REVIEW')),
 check(state in ('RESERVED','PROCESSING','COMPLETE','UNKNOWN','REJECTED')),
 check((response_version is null)=(response_sha256 is null) and (response_version is null)=(safe_response is null)));

create table public.inbound_ai_review_decisions (
 review_decision_id uuid not null,
 reservation_id uuid not null,
 review_key uuid not null,
 decision_sha256 text not null check(decision_sha256 ~ '^[0-9a-f]{64}$'),
 package_version smallint not null,
 package_sha256 text not null check(package_sha256 ~ '^[0-9a-f]{64}$'),
 review_version bigint not null check(review_version between 1 and 9007199254740991),
 candidate_id uuid not null,
 candidate_sha256 text not null check(candidate_sha256 ~ '^[0-9a-f]{64}$'),
 base_revision bigint check(base_revision between 1 and 9007199254740991),
 disposition text not null check(disposition ~ '^[A-Za-z0-9._:-]{1,128}$'),
 review_material_reference uuid not null,
 review_material_sha256 text not null check(review_material_sha256 ~ '^[0-9a-f]{64}$'),
 confirmed_user_id uuid not null,
 confirmed_at timestamptz(6) not null check(isfinite(confirmed_at)),
 confirmation_source text not null check(confirmation_source ~ '^[A-Za-z0-9._:-]{1,128}$'),
 confirmation_scope text not null check(confirmation_scope ~ '^[A-Za-z0-9._:-]{1,128}$'),
 confirmation_id uuid,
 slot_id uuid,
 operation_key uuid,
 intended_event_id uuid,
 input_identity_map jsonb not null check(octet_length(input_identity_map::text)<=16384),
 preparation_sha256 text check(preparation_sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'RESERVED' check(state ~ '^[A-Za-z0-9._:-]{1,128}$'),
 row_revision bigint not null default 1 check(row_revision between 1 and 9007199254740991),
 publication_fence bigint not null default 1 check(publication_fence between 1 and 9007199254740991),
 safe_result jsonb check(octet_length(safe_result::text)<=16384),
 result_sha256 text check(result_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 updated_at timestamptz(6) not null check(isfinite(updated_at)),
 primary key(review_decision_id),
 foreign key(confirmed_user_id) references auth.users(id) on delete restrict,
 foreign key(reservation_id) references public.inbound_ai_import_reservations(reservation_id) on delete restrict,
 unique(reservation_id,review_key),
 check(disposition in ('ACCEPT','REJECT','DEFER')),
 check(state in ('RESERVED','UNKNOWN','PREPARED','REJECTED','DEFERRED')),
 check(package_version=1 and confirmation_source='EXPLICIT_USER' and confirmation_scope='EXACT_REVIEW_DECISION'),
 check((disposition='ACCEPT')=(operation_key is not null) and (disposition='ACCEPT')=(intended_event_id is not null) and (disposition='ACCEPT')=(confirmation_id is not null) and (disposition='ACCEPT')=(slot_id is not null)),
 check((safe_result is null)=(result_sha256 is null)));

create table public.external_integration_admin_grants (
 admin_grant_id uuid not null,
 actor_id uuid not null,
 environment text not null check(environment ~ '^[A-Za-z0-9._:-]{1,128}$'),
 permission text not null check(permission ~ '^[A-Za-z0-9._:-]{1,128}$'),
 grant_revision bigint not null default 1 check(grant_revision between 1 and 9007199254740991),
 expires_at timestamptz(6) not null check(isfinite(expires_at)),
 revoked_at timestamptz(6) check(isfinite(revoked_at)),
 created_at timestamptz(6) not null check(isfinite(created_at)),
 created_by uuid not null,
 primary key(admin_grant_id),
 foreign key(actor_id) references auth.users(id) on delete restrict,
 foreign key(environment) references public.external_integration_environment_state(environment) on delete restrict,
 foreign key(created_by) references auth.users(id) on delete restrict,
 unique(actor_id,environment,permission),
 check(permission in ('CONFIG_ADMIN','SECURITY_ADMIN','COST_READER','SUPPORT_RECOVERY')));

alter table public.external_integrations add foreign key(integration_id,health_observation_id) references public.external_integration_health_observations(integration_id,health_observation_id) on delete restrict;

alter table public.external_integration_calls add foreign key(invocation_id) references public.inbound_ai_invocations(invocation_id) on delete restrict deferrable initially deferred;

create index cp14_external_integrations_0 on public.external_integrations(environment,category,enabled);

create index cp14_external_integrations_1 on public.external_integrations(environment,kill_switch);

create index cp14_intelligence_provider_configs_0 on public.intelligence_provider_configs(integration_id,provider_id,model_id,config_version desc);

create index cp14_external_integration_price_schedules_0 on public.external_integration_price_schedules(integration_id,provider_id,model_id,effective_from);

create index cp14_external_integration_calls_0 on public.external_integration_calls(integration_id,admitted_at);

create index cp14_external_integration_calls_1 on public.external_integration_calls(account_id,task_id,attempt_sequence);

create index cp14_external_integration_calls_2 on public.external_integration_calls(fallback_chain_id,admitted_at);

create index cp14_external_integration_calls_3 on public.external_integration_calls(dispatch_state,admitted_at);

create index cp14_external_integration_usage_events_0 on public.external_integration_usage_events(call_id,received_at,observation_id);

create index cp14_external_integration_usage_events_1 on public.external_integration_usage_events(price_schedule_id,received_at);

create index cp14_external_integration_config_audit_0 on public.external_integration_config_audit(integration_id,occurred_at);

create index cp14_external_integration_config_audit_1 on public.external_integration_config_audit(environment,entity_kind,entity_key,new_version);

create index cp14_external_integration_health_observations_0 on public.external_integration_health_observations(integration_id,observation_sequence desc);

create index cp14_external_client_identities_0 on public.external_client_identities(integration_id,enabled);

create index cp14_external_client_grants_0 on public.external_client_grants(account_id,client_identity_id,expires_at);

create index cp14_external_client_grants_1 on public.external_client_grants(trip_id,revoked_at);

create index cp14_inbound_ai_import_reservations_0 on public.inbound_ai_import_reservations(account_id,state,updated_at);

create index cp14_inbound_ai_import_reservations_1 on public.inbound_ai_import_reservations(integration_id,package_id);

create index cp14_inbound_ai_invocations_0 on public.inbound_ai_invocations(reservation_id,created_at);

create index cp14_inbound_ai_review_decisions_0 on public.inbound_ai_review_decisions(reservation_id,review_version,candidate_id);

create index cp14_external_integration_admin_grants_0 on public.external_integration_admin_grants(actor_id,environment,expires_at);

create unique index cp14_external_integration_calls_48 on public.external_integration_calls(integration_id,account_id,attempt_id) where attempt_id is not null;

create unique index cp14_external_integration_calls_49 on public.external_integration_calls(integration_id,invocation_id) where invocation_id is not null;

create unique index cp14_external_integration_usage_events_50 on public.external_integration_usage_events(call_id) where observation_kind='START';

create unique index cp14_inbound_ai_review_decisions_51 on public.inbound_ai_review_decisions(reservation_id,candidate_id) where state in ('RESERVED','UNKNOWN','PREPARED');

alter table public.external_integration_environment_state owner to postgres;

alter table public.external_integration_environment_state enable row level security;

alter table public.external_integration_environment_state force row level security;

revoke all on public.external_integration_environment_state from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_environment_state to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integration_environment_state for select to otr_external_integration_config_writer using(true);

grant select on public.external_integration_environment_state to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integration_environment_state for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integration_environment_state to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_integration_environment_state for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_integration_environment_state to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_environment_state for select to otr_external_integration_reader using(true);

grant update(config_version,kill_switch,updated_at,updated_by) on public.external_integration_environment_state to otr_external_integration_config_writer;

create policy cp14_config_writer_update on public.external_integration_environment_state for update to otr_external_integration_config_writer using(true) with check(true);

alter table public.external_integrations owner to postgres;

alter table public.external_integrations enable row level security;

alter table public.external_integrations force row level security;

revoke all on public.external_integrations from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integrations to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integrations for select to otr_external_integration_config_writer using(true);

grant select on public.external_integrations to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integrations for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integrations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_integrations for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_integrations to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integrations for select to otr_external_integration_reader using(true);

grant insert on public.external_integrations to otr_external_integration_config_writer;

create policy cp14_config_writer_insert on public.external_integrations for insert to otr_external_integration_config_writer with check(true);

grant update(admin_label,enabled,kill_switch,config_version,config_sha256,credential_reference,auth_config_reference,capabilities,quota_limit,quota_window_seconds,rate_per_minute,health_state,health_observed_at,health_observation_id,updated_at,updated_by) on public.external_integrations to otr_external_integration_config_writer;

create policy cp14_config_writer_update on public.external_integrations for update to otr_external_integration_config_writer using(true) with check(true);

alter table public.intelligence_provider_configs owner to postgres;

alter table public.intelligence_provider_configs enable row level security;

alter table public.intelligence_provider_configs force row level security;

revoke all on public.intelligence_provider_configs from public,anon,authenticated,service_role,authenticator;

grant select on public.intelligence_provider_configs to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.intelligence_provider_configs for select to otr_external_integration_config_writer using(true);

grant select on public.intelligence_provider_configs to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.intelligence_provider_configs for select to otr_external_integration_meter_writer using(true);

grant select on public.intelligence_provider_configs to otr_external_integration_reader;

create policy cp14_reader_read on public.intelligence_provider_configs for select to otr_external_integration_reader using(true);

grant insert on public.intelligence_provider_configs to otr_external_integration_config_writer;

create policy cp14_config_writer_insert on public.intelligence_provider_configs for insert to otr_external_integration_config_writer with check(true);

alter table public.external_integration_price_schedules owner to postgres;

alter table public.external_integration_price_schedules enable row level security;

alter table public.external_integration_price_schedules force row level security;

revoke all on public.external_integration_price_schedules from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_price_schedules to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integration_price_schedules for select to otr_external_integration_config_writer using(true);

grant select on public.external_integration_price_schedules to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integration_price_schedules for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integration_price_schedules to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_price_schedules for select to otr_external_integration_reader using(true);

grant insert on public.external_integration_price_schedules to otr_external_integration_config_writer;

create policy cp14_config_writer_insert on public.external_integration_price_schedules for insert to otr_external_integration_config_writer with check(true);

alter table public.external_integration_price_schedule_units owner to postgres;

alter table public.external_integration_price_schedule_units enable row level security;

alter table public.external_integration_price_schedule_units force row level security;

revoke all on public.external_integration_price_schedule_units from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_price_schedule_units to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integration_price_schedule_units for select to otr_external_integration_config_writer using(true);

grant select on public.external_integration_price_schedule_units to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integration_price_schedule_units for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integration_price_schedule_units to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_price_schedule_units for select to otr_external_integration_reader using(true);

grant insert on public.external_integration_price_schedule_units to otr_external_integration_config_writer;

create policy cp14_config_writer_insert on public.external_integration_price_schedule_units for insert to otr_external_integration_config_writer with check(true);

alter table public.external_integration_calls owner to postgres;

alter table public.external_integration_calls enable row level security;

alter table public.external_integration_calls force row level security;

revoke all on public.external_integration_calls from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_calls to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integration_calls for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integration_calls to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_integration_calls for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_integration_calls to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_calls for select to otr_external_integration_reader using(true);

grant insert on public.external_integration_calls to otr_external_integration_meter_writer;

create policy cp14_meter_writer_insert on public.external_integration_calls for insert to otr_external_integration_meter_writer with check(true);

grant update(row_revision,publication_fence,dispatch_state,execution_certainty,dispatch_marked_at,terminal_observed_at,safe_reason) on public.external_integration_calls to otr_external_integration_meter_writer;

create policy cp14_meter_writer_update on public.external_integration_calls for update to otr_external_integration_meter_writer using(true) with check(true);

alter table public.external_integration_usage_events owner to postgres;

alter table public.external_integration_usage_events enable row level security;

alter table public.external_integration_usage_events force row level security;

revoke all on public.external_integration_usage_events from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_usage_events to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integration_usage_events for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integration_usage_events to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_usage_events for select to otr_external_integration_reader using(true);

grant insert on public.external_integration_usage_events to otr_external_integration_meter_writer;

create policy cp14_meter_writer_insert on public.external_integration_usage_events for insert to otr_external_integration_meter_writer with check(true);

alter table public.external_integration_config_audit owner to postgres;

alter table public.external_integration_config_audit enable row level security;

alter table public.external_integration_config_audit force row level security;

revoke all on public.external_integration_config_audit from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_config_audit to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integration_config_audit for select to otr_external_integration_config_writer using(true);

grant select on public.external_integration_config_audit to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_integration_config_audit for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_integration_config_audit to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_config_audit for select to otr_external_integration_reader using(true);

grant insert on public.external_integration_config_audit to otr_external_integration_config_writer;

create policy cp14_config_writer_insert on public.external_integration_config_audit for insert to otr_external_integration_config_writer with check(true);

grant insert on public.external_integration_config_audit to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_insert on public.external_integration_config_audit for insert to otr_external_integration_inbound_writer with check(true);

alter table public.external_integration_health_observations owner to postgres;

alter table public.external_integration_health_observations enable row level security;

alter table public.external_integration_health_observations force row level security;

revoke all on public.external_integration_health_observations from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_health_observations to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integration_health_observations for select to otr_external_integration_config_writer using(true);

grant select on public.external_integration_health_observations to otr_external_integration_meter_writer;

create policy cp14_meter_writer_read on public.external_integration_health_observations for select to otr_external_integration_meter_writer using(true);

grant select on public.external_integration_health_observations to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_health_observations for select to otr_external_integration_reader using(true);

grant insert on public.external_integration_health_observations to otr_external_integration_config_writer;

create policy cp14_config_writer_insert on public.external_integration_health_observations for insert to otr_external_integration_config_writer with check(true);

alter table public.external_client_identities owner to postgres;

alter table public.external_client_identities enable row level security;

alter table public.external_client_identities force row level security;

revoke all on public.external_client_identities from public,anon,authenticated,service_role,authenticator;

grant select on public.external_client_identities to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_client_identities for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_client_identities to otr_external_integration_reader;

create policy cp14_reader_read on public.external_client_identities for select to otr_external_integration_reader using(true);

grant insert on public.external_client_identities to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_insert on public.external_client_identities for insert to otr_external_integration_inbound_writer with check(true);

grant update(enabled,revoked_at,row_revision,updated_at) on public.external_client_identities to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_update on public.external_client_identities for update to otr_external_integration_inbound_writer using(true) with check(true);

alter table public.external_client_grants owner to postgres;

alter table public.external_client_grants enable row level security;

alter table public.external_client_grants force row level security;

revoke all on public.external_client_grants from public,anon,authenticated,service_role,authenticator;

grant select on public.external_client_grants to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_client_grants for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_client_grants to otr_external_integration_reader;

create policy cp14_reader_read on public.external_client_grants for select to otr_external_integration_reader using(true);

grant insert on public.external_client_grants to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_insert on public.external_client_grants for insert to otr_external_integration_inbound_writer with check(true);

grant update(actions,expires_at,revoked_at,grant_revision,updated_at) on public.external_client_grants to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_update on public.external_client_grants for update to otr_external_integration_inbound_writer using(true) with check(true);

alter table public.inbound_ai_import_reservations owner to postgres;

alter table public.inbound_ai_import_reservations enable row level security;

alter table public.inbound_ai_import_reservations force row level security;

revoke all on public.inbound_ai_import_reservations from public,anon,authenticated,service_role,authenticator;

grant select on public.inbound_ai_import_reservations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.inbound_ai_import_reservations for select to otr_external_integration_inbound_writer using(true);

grant select on public.inbound_ai_import_reservations to otr_external_integration_reader;

create policy cp14_reader_read on public.inbound_ai_import_reservations for select to otr_external_integration_reader using(true);

grant insert on public.inbound_ai_import_reservations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_insert on public.inbound_ai_import_reservations for insert to otr_external_integration_inbound_writer with check(true);

grant update(package_material_reference,package_material_sha256,material_admission_sha256,import_id,task_id,publication_refs,review_version,state,recovery_disposition,row_revision,publication_fence,result_version,result_sha256,safe_result,safe_reason,updated_at,completed_at) on public.inbound_ai_import_reservations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_update on public.inbound_ai_import_reservations for update to otr_external_integration_inbound_writer using(true) with check(true);

alter table public.inbound_ai_invocations owner to postgres;

alter table public.inbound_ai_invocations enable row level security;

alter table public.inbound_ai_invocations force row level security;

revoke all on public.inbound_ai_invocations from public,anon,authenticated,service_role,authenticator;

grant select on public.inbound_ai_invocations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.inbound_ai_invocations for select to otr_external_integration_inbound_writer using(true);

grant select on public.inbound_ai_invocations to otr_external_integration_reader;

create policy cp14_reader_read on public.inbound_ai_invocations for select to otr_external_integration_reader using(true);

grant insert on public.inbound_ai_invocations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_insert on public.inbound_ai_invocations for insert to otr_external_integration_inbound_writer with check(true);

grant update(row_revision,state,response_version,response_sha256,safe_response,updated_at,completed_at) on public.inbound_ai_invocations to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_update on public.inbound_ai_invocations for update to otr_external_integration_inbound_writer using(true) with check(true);

alter table public.inbound_ai_review_decisions owner to postgres;

alter table public.inbound_ai_review_decisions enable row level security;

alter table public.inbound_ai_review_decisions force row level security;

revoke all on public.inbound_ai_review_decisions from public,anon,authenticated,service_role,authenticator;

grant select on public.inbound_ai_review_decisions to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.inbound_ai_review_decisions for select to otr_external_integration_inbound_writer using(true);

grant select on public.inbound_ai_review_decisions to otr_external_integration_reader;

create policy cp14_reader_read on public.inbound_ai_review_decisions for select to otr_external_integration_reader using(true);

grant insert on public.inbound_ai_review_decisions to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_insert on public.inbound_ai_review_decisions for insert to otr_external_integration_inbound_writer with check(true);

grant update(preparation_sha256,state,row_revision,publication_fence,safe_result,result_sha256,updated_at) on public.inbound_ai_review_decisions to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_update on public.inbound_ai_review_decisions for update to otr_external_integration_inbound_writer using(true) with check(true);

alter table public.external_integration_admin_grants owner to postgres;

alter table public.external_integration_admin_grants enable row level security;

alter table public.external_integration_admin_grants force row level security;

revoke all on public.external_integration_admin_grants from public,anon,authenticated,service_role,authenticator;

grant select on public.external_integration_admin_grants to otr_external_integration_config_writer;

create policy cp14_config_writer_read on public.external_integration_admin_grants for select to otr_external_integration_config_writer using(true);

grant select on public.external_integration_admin_grants to otr_external_integration_inbound_writer;

create policy cp14_inbound_writer_read on public.external_integration_admin_grants for select to otr_external_integration_inbound_writer using(true);

grant select on public.external_integration_admin_grants to otr_external_integration_reader;

create policy cp14_reader_read on public.external_integration_admin_grants for select to otr_external_integration_reader using(true);

grant usage on schema public to otr_external_integration_config_writer;

grant usage on schema public to otr_external_integration_meter_writer;

grant usage on schema public to otr_external_integration_inbound_writer;

grant usage on schema public to otr_external_integration_reader;

grant usage on schema public to otr_external_integration_admin_gateway;

grant usage on schema public to otr_external_integration_call_gateway;

grant usage on schema public to otr_external_integration_inbound_gateway;

grant usage on schema public to otr_external_integration_reporting_gateway;

grant usage on schema public to otr_external_integration_recovery_gateway;

insert into public.external_integration_environment_state(environment,updated_at) values('TEST',clock_timestamp()),('DEV',clock_timestamp()),('PRODUCTION',clock_timestamp());

create function public.cp14_guard_external_integration_environment_state() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.environment is distinct from old.environment or new.runtime_enabled is distinct from old.runtime_enabled) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.config_version<>old.config_version+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_environment_state() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_environment_state for each row execute function public.cp14_guard_external_integration_environment_state();

create trigger cp14_no_truncate before truncate on public.external_integration_environment_state for each statement execute function public.cp14_guard_external_integration_environment_state();

create function public.cp14_guard_external_integrations() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway','otr_external_integration_call_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.integration_id is distinct from old.integration_id or new.category is distinct from old.category or new.vendor_namespace is distinct from old.vendor_namespace or new.environment is distinct from old.environment or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.config_version<>old.config_version+1 and not (new.config_version=old.config_version and (to_jsonb(new)-array['health_state','health_observed_at','health_observation_id'])=(to_jsonb(old)-array['health_state','health_observed_at','health_observation_id'])) then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integrations() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integrations for each row execute function public.cp14_guard_external_integrations();

create trigger cp14_no_truncate before truncate on public.external_integrations for each statement execute function public.cp14_guard_external_integrations();

create function public.cp14_guard_intelligence_provider_configs() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' then raise exception 'CP14_IMMUTABLE';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_intelligence_provider_configs() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.intelligence_provider_configs for each row execute function public.cp14_guard_intelligence_provider_configs();

create trigger cp14_no_truncate before truncate on public.intelligence_provider_configs for each statement execute function public.cp14_guard_intelligence_provider_configs();

create function public.cp14_guard_external_integration_price_schedules() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' then raise exception 'CP14_IMMUTABLE';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_price_schedules() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_price_schedules for each row execute function public.cp14_guard_external_integration_price_schedules();

create trigger cp14_no_truncate before truncate on public.external_integration_price_schedules for each statement execute function public.cp14_guard_external_integration_price_schedules();

create function public.cp14_guard_external_integration_price_schedule_units() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' then raise exception 'CP14_IMMUTABLE';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_price_schedule_units() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_price_schedule_units for each row execute function public.cp14_guard_external_integration_price_schedule_units();

create trigger cp14_no_truncate before truncate on public.external_integration_price_schedule_units for each statement execute function public.cp14_guard_external_integration_price_schedule_units();

create function public.cp14_guard_external_integration_calls() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_call_gateway','otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_meter_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.call_id is distinct from old.call_id or new.integration_id is distinct from old.integration_id or new.environment is distinct from old.environment or new.provider_config_id is distinct from old.provider_config_id or new.provider_id is distinct from old.provider_id or new.model_id is distinct from old.model_id or new.model_version is distinct from old.model_version or new.adapter_version is distinct from old.adapter_version or new.config_version is distinct from old.config_version or new.configuration_sha256 is distinct from old.configuration_sha256 or new.account_id is distinct from old.account_id or new.user_id is distinct from old.user_id or new.billing_subject_id is distinct from old.billing_subject_id or new.trip_id is distinct from old.trip_id or new.import_id is distinct from old.import_id or new.task_id is distinct from old.task_id or new.attempt_id is distinct from old.attempt_id or new.fallback_chain_id is distinct from old.fallback_chain_id or new.shadow_of_call_id is distinct from old.shadow_of_call_id or new.evaluation_reference is distinct from old.evaluation_reference or new.attempt_sequence is distinct from old.attempt_sequence or new.invocation_id is distinct from old.invocation_id or new.request_id is distinct from old.request_id or new.idempotency_key is distinct from old.idempotency_key or new.request_sha256 is distinct from old.request_sha256 or new.input_sha256 is distinct from old.input_sha256 or new.schema_sha256 is distinct from old.schema_sha256 or new.capability is distinct from old.capability or new.task_class is distinct from old.task_class or new.call_kind is distinct from old.call_kind or new.shadow is distinct from old.shadow or new.price_schedule_id is distinct from old.price_schedule_id or new.admitted_at is distinct from old.admitted_at or new.admission_sha256 is distinct from old.admission_sha256) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.row_revision<>old.row_revision+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_calls() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_calls for each row execute function public.cp14_guard_external_integration_calls();

create trigger cp14_no_truncate before truncate on public.external_integration_calls for each statement execute function public.cp14_guard_external_integration_calls();

create function public.cp14_guard_external_integration_usage_events() returns trigger language plpgsql set search_path=pg_catalog as $$declare predecessor public.external_integration_usage_events;unit text;old_quality text;new_quality text;begin if session_user::text not in ('otr_external_integration_call_gateway','otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_meter_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' then raise exception 'CP14_IMMUTABLE';
end if;
if tg_op='INSERT' and (jsonb_typeof(new.unit_quality) is distinct from 'object' or exists(select 1 from jsonb_each(new.unit_quality) e where jsonb_typeof(e.value) is distinct from 'string' or e.value#>>'{}' not in ('ACTUAL_REPORTED','ESTIMATED','UNKNOWN') or not e.key=any(array['input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms']) and not new.other_units ? e.key and not new.provider_extension ? e.key)) then raise exception 'CP14_USAGE_GRAMMAR';end if;
perform 1 from public.external_integration_calls where call_id=new.call_id for update;
if new.supersedes_observation_id is not null then
 select * into predecessor from public.external_integration_usage_events where observation_id=new.supersedes_observation_id and call_id=new.call_id;
 if not found or predecessor.received_at>new.received_at or exists(select 1 from public.external_integration_usage_events where supersedes_observation_id=predecessor.observation_id) then raise exception 'CP14_INVALID_CORRECTION';end if;
 if new.measurement_mode<>predecessor.measurement_mode or (new.cost_nanos is null)<>(predecessor.cost_nanos is null) then raise exception 'CP14_CORRECTION_COVERAGE';end if;
end if;
foreach unit in array array['input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms'] || array(select 'other_units.'||key from jsonb_object_keys(new.other_units || coalesce(predecessor.other_units,'{}')) key) || array(select 'provider_extension.'||key from jsonb_object_keys(new.provider_extension || coalesce(predecessor.provider_extension,'{}')) key) loop
 if new.supersedes_observation_id is not null and (public.cp14_measurement_value(new,unit) is null)<>(public.cp14_measurement_value(predecessor,unit) is null) then raise exception 'CP14_CORRECTION_COVERAGE';end if;
 new_quality:=coalesce(new.unit_quality->>unit,new.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,new.usage_quality);
 if new.measurement_mode='DELTA' and new.supersedes_observation_id is null and public.cp14_measurement_value(new,unit) is not null and new_quality<>'UNKNOWN' and exists(select 1 from public.external_integration_usage_events e where e.call_id=new.call_id and e.measurement_mode='DELTA' and public.cp14_measurement_value(e,unit) is not null and coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality) in ('ACTUAL_REPORTED','ESTIMATED') and coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality)<>new_quality and not exists(select 1 from public.external_integration_usage_events successor where successor.supersedes_observation_id=e.observation_id)) then raise exception 'CP14_AMBIGUOUS_DELTA';end if;
end loop;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_usage_events() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_usage_events for each row execute function public.cp14_guard_external_integration_usage_events();

create trigger cp14_no_truncate before truncate on public.external_integration_usage_events for each statement execute function public.cp14_guard_external_integration_usage_events();

create function public.cp14_guard_external_integration_config_audit() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_admin_gateway','otr_external_integration_inbound_gateway','otr_external_integration_call_gateway','otr_external_integration_recovery_gateway','otr_external_integration_reporting_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user not in ('otr_external_integration_config_writer','otr_external_integration_inbound_writer') then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if session_user::text in ('otr_external_integration_call_gateway','otr_external_integration_recovery_gateway','otr_external_integration_reporting_gateway') and new.change_type is distinct from 'REQUEST_BINDING' then raise exception 'CP14_PROTECTED';end if;
if tg_op='UPDATE' then raise exception 'CP14_IMMUTABLE';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_config_audit() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_config_audit for each row execute function public.cp14_guard_external_integration_config_audit();

create trigger cp14_no_truncate before truncate on public.external_integration_config_audit for each statement execute function public.cp14_guard_external_integration_config_audit();

create function public.cp14_guard_external_integration_health_observations() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_call_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_config_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' then raise exception 'CP14_IMMUTABLE';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_health_observations() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_health_observations for each row execute function public.cp14_guard_external_integration_health_observations();

create trigger cp14_no_truncate before truncate on public.external_integration_health_observations for each statement execute function public.cp14_guard_external_integration_health_observations();

create function public.cp14_guard_external_client_identities() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_inbound_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.client_identity_id is distinct from old.client_identity_id or new.integration_id is distinct from old.integration_id or new.issuer_namespace is distinct from old.issuer_namespace or new.subject_digest is distinct from old.subject_digest or new.auth_config_reference is distinct from old.auth_config_reference or new.auth_config_version is distinct from old.auth_config_version or new.created_at is distinct from old.created_at) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.row_revision<>old.row_revision+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_client_identities() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_client_identities for each row execute function public.cp14_guard_external_client_identities();

create trigger cp14_no_truncate before truncate on public.external_client_identities for each statement execute function public.cp14_guard_external_client_identities();

create function public.cp14_guard_external_client_grants() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_inbound_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.grant_id is distinct from old.grant_id or new.integration_id is distinct from old.integration_id or new.client_identity_id is distinct from old.client_identity_id or new.account_id is distinct from old.account_id or new.user_id is distinct from old.user_id or new.scope_kind is distinct from old.scope_kind or new.trip_id is distinct from old.trip_id or new.package_id is distinct from old.package_id or new.quota_limit is distinct from old.quota_limit or new.quota_window_seconds is distinct from old.quota_window_seconds or new.auth_session_reference is distinct from old.auth_session_reference or new.auth_session_version is distinct from old.auth_session_version or new.authorization_sha256 is distinct from old.authorization_sha256 or new.created_at is distinct from old.created_at or new.authorized_by is distinct from old.authorized_by) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.grant_revision<>old.grant_revision+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_client_grants() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_client_grants for each row execute function public.cp14_guard_external_client_grants();

create trigger cp14_no_truncate before truncate on public.external_client_grants for each statement execute function public.cp14_guard_external_client_grants();

create function public.cp14_guard_inbound_ai_import_reservations() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_inbound_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.reservation_id is distinct from old.reservation_id or new.integration_id is distinct from old.integration_id or new.client_identity_id is distinct from old.client_identity_id or new.account_id is distinct from old.account_id or new.user_id is distinct from old.user_id or new.grant_id is distinct from old.grant_id or new.admitted_grant_revision is distinct from old.admitted_grant_revision or new.package_id is distinct from old.package_id or new.package_version is distinct from old.package_version or new.contract_version is distinct from old.contract_version or new.idempotency_key is distinct from old.idempotency_key or new.package_sha256 is distinct from old.package_sha256 or new.package_bytes is distinct from old.package_bytes or new.trip_intent_kind is distinct from old.trip_intent_kind or new.trip_id is distinct from old.trip_id or new.created_at is distinct from old.created_at) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.row_revision<>old.row_revision+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_inbound_ai_import_reservations() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.inbound_ai_import_reservations for each row execute function public.cp14_guard_inbound_ai_import_reservations();

create trigger cp14_no_truncate before truncate on public.inbound_ai_import_reservations for each statement execute function public.cp14_guard_inbound_ai_import_reservations();

create function public.cp14_guard_inbound_ai_invocations() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_inbound_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.invocation_id is distinct from old.invocation_id or new.reservation_id is distinct from old.reservation_id or new.integration_id is distinct from old.integration_id or new.client_identity_id is distinct from old.client_identity_id or new.account_id is distinct from old.account_id or new.user_id is distinct from old.user_id or new.grant_id is distinct from old.grant_id or new.admitted_grant_revision is distinct from old.admitted_grant_revision or new.action is distinct from old.action or new.request_id is distinct from old.request_id or new.request_sha256 is distinct from old.request_sha256 or new.call_id is distinct from old.call_id or new.publication_fence is distinct from old.publication_fence or new.created_at is distinct from old.created_at) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.row_revision<>old.row_revision+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_inbound_ai_invocations() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.inbound_ai_invocations for each row execute function public.cp14_guard_inbound_ai_invocations();

create trigger cp14_no_truncate before truncate on public.inbound_ai_invocations for each statement execute function public.cp14_guard_inbound_ai_invocations();

create function public.cp14_guard_inbound_ai_review_decisions() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user::text not in ('otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or tg_op in ('DELETE','TRUNCATE') or current_user<>'otr_external_integration_inbound_writer' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and (new.review_decision_id is distinct from old.review_decision_id or new.reservation_id is distinct from old.reservation_id or new.review_key is distinct from old.review_key or new.decision_sha256 is distinct from old.decision_sha256 or new.package_version is distinct from old.package_version or new.package_sha256 is distinct from old.package_sha256 or new.review_version is distinct from old.review_version or new.candidate_id is distinct from old.candidate_id or new.candidate_sha256 is distinct from old.candidate_sha256 or new.base_revision is distinct from old.base_revision or new.disposition is distinct from old.disposition or new.review_material_reference is distinct from old.review_material_reference or new.review_material_sha256 is distinct from old.review_material_sha256 or new.confirmed_user_id is distinct from old.confirmed_user_id or new.confirmed_at is distinct from old.confirmed_at or new.confirmation_source is distinct from old.confirmation_source or new.confirmation_scope is distinct from old.confirmation_scope or new.confirmation_id is distinct from old.confirmation_id or new.slot_id is distinct from old.slot_id or new.operation_key is distinct from old.operation_key or new.intended_event_id is distinct from old.intended_event_id or new.input_identity_map is distinct from old.input_identity_map or new.created_at is distinct from old.created_at) then raise exception 'CP14_IDENTITY_IMMUTABLE';
end if;
if tg_op='UPDATE' and new.row_revision<>old.row_revision+1 then raise exception 'CP14_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_inbound_ai_review_decisions() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.inbound_ai_review_decisions for each row execute function public.cp14_guard_inbound_ai_review_decisions();

create trigger cp14_no_truncate before truncate on public.inbound_ai_review_decisions for each statement execute function public.cp14_guard_inbound_ai_review_decisions();

create function public.cp14_guard_external_integration_admin_grants() returns trigger language plpgsql set search_path=pg_catalog as $$begin if session_user<>'postgres' or tg_op in ('DELETE','TRUNCATE') or current_user<>'postgres' then raise exception 'CP14_PROTECTED' using errcode='42501';
end if;
if tg_op='UPDATE' and ((to_jsonb(new)-array['grant_revision','expires_at','revoked_at']) is distinct from (to_jsonb(old)-array['grant_revision','expires_at','revoked_at']) or new.grant_revision<>old.grant_revision+1) then raise exception 'CP14_ADMIN_CAS';
end if;
return new;
 end$$;

revoke all on function public.cp14_guard_external_integration_admin_grants() from public,anon,authenticated,service_role,authenticator;

create trigger cp14_guard before insert or update or delete on public.external_integration_admin_grants for each row execute function public.cp14_guard_external_integration_admin_grants();

create trigger cp14_no_truncate before truncate on public.external_integration_admin_grants for each statement execute function public.cp14_guard_external_integration_admin_grants();

create function public.cp14_keys(j jsonb, required text[], optional text[]) returns boolean language sql security invoker set search_path=pg_catalog as $$ select case when jsonb_typeof(j) is distinct from 'object' then false else not exists(select 1 from unnest(required) k where not j ? k) and not exists(select 1 from jsonb_object_keys(j) k where not k=any(required||optional)) end $$;

revoke all on function public.cp14_keys(jsonb,text[],text[]) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_keys(jsonb,text[],text[]) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_canonical(j jsonb) returns text language plpgsql security invoker set search_path=pg_catalog as $$ declare result text;
begin case jsonb_typeof(j) when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.cp14_canonical(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(j);
 when 'array' then select '['||coalesce(string_agg(public.cp14_canonical(value),',' order by ord),'')||']' into result from jsonb_array_elements(j) with ordinality a(value,ord);
else result:=j::text;
end case;
return result;
end $$;

revoke all on function public.cp14_canonical(jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_canonical(jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_hash(j jsonb) returns text language sql security invoker set search_path=pg_catalog as $$ select encode(extensions.digest(convert_to(public.cp14_canonical(j),'UTF8'),'sha256'),'hex') $$;

revoke all on function public.cp14_hash(jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_hash(jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

grant usage on schema extensions to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

grant execute on function extensions.digest(bytea,text) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_safe_result(j jsonb) returns boolean language sql security invoker set search_path=pg_catalog as $$ select coalesce(public.cp14_keys(j,array['version','state'],array['reservation_id','review_decision_id','confirmation_id','slot_id','operation_key','event_id','result_sha256','safe_reason']) and j->'version'='1'::jsonb and jsonb_typeof(j->'state')='string' and j->>'state' in ('RESERVED','MATERIAL_PENDING','PROCESSING','NEEDS_REVIEW','DEFERRED','UNKNOWN','REJECTED','COMPLETE','PREPARED') and not exists(select 1 from jsonb_each(j) x where key in ('reservation_id','review_decision_id','confirmation_id','slot_id','operation_key','event_id') and (jsonb_typeof(value) is distinct from 'string' or value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') or key='result_sha256' and (jsonb_typeof(value) is distinct from 'string' or value#>>'{}' !~ '^[0-9a-f]{64}$') or key='safe_reason' and (jsonb_typeof(value) is distinct from 'string' or value#>>'{}' not in ('INVALID_PACKAGE','STALE_REVIEW','ACCESS_REVOKED','MATERIAL_UNAVAILABLE','EXACT_RECOVERY_REQUIRED','USER_REJECTED','USER_DEFERRED'))),false) $$;

revoke all on function public.cp14_safe_result(jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_safe_result(jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_request_scope(context jsonb) returns text language sql immutable security invoker set search_path=pg_catalog as $$select public.cp14_hash(context - array['verified_at','expires_at','revoked','request_id','request_sha256','command_kind'])$$;
revoke all on function public.cp14_request_scope(jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp14_request_scope(jsonb) to otr_external_integration_config_writer,otr_external_integration_inbound_writer;
create function public.cp14_bind_request(context jsonb, command jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$declare a public.external_integration_config_audit;kind text:=context->>'command_kind';scope text:=public.cp14_request_scope(context);begin
 if current_user<>'otr_external_integration_config_writer' or session_user::text is distinct from context->>'gateway_identity' or session_user::text not in ('otr_external_integration_admin_gateway','otr_external_integration_call_gateway','otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway','otr_external_integration_reporting_gateway') then raise exception 'CP14_CONTEXT_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('cp14/request/'||(command->>'request_id'),0));
 select * into a from public.external_integration_config_audit where command_id=(command->>'request_id')::uuid;
 if found then
  if a.environment is distinct from context->>'verified_environment' or a.safe_diff->>'request_sha256' is distinct from command->>'request_sha256' or a.safe_diff->>'scope_sha256' is distinct from scope or a.safe_diff->>'command_kind' is distinct from kind then raise exception 'CP14_CHANGED_REQUEST';end if;
  return;
 end if;
 if kind in ('external_integration_configure','external_integration_set_kill','intelligence_provider_config_append','external_integration_price_append','external_client_authorize_grant','external_client_revoke_grant') then return;end if;
 insert into public.external_integration_config_audit(audit_id,integration_id,environment,entity_kind,entity_key,new_version,admin_actor_id,command_id,change_type,after_sha256,safe_diff,reason_code,occurred_at) values((command->>'request_id')::uuid,command->>'integration_id',context->>'verified_environment','request',command->>'request_id',1,(context->>'verified_actor_id')::uuid,(command->>'request_id')::uuid,'REQUEST_BINDING',command->>'request_sha256',jsonb_build_object('request_sha256',command->>'request_sha256','scope_sha256',scope,'command_kind',kind),'EXACT_REQUEST',clock_timestamp());
end$$;
alter function public.cp14_bind_request(jsonb,jsonb) owner to otr_external_integration_config_writer;
revoke all on function public.cp14_bind_request(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp14_bind_request(jsonb,jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_context(context jsonb, command jsonb, kind text, gateways text[], permission text) returns void language plpgsql security invoker set search_path=pg_catalog as $$ begin
 if context is null or command is null or octet_length(context::text)>16384 or octet_length(command::text)>262144 or not public.cp14_keys(context,array['version','principal_kind','verified_actor_id','verified_client_identity','verified_external_subject','verified_account_id','verified_environment','auth_source','auth_config_version','auth_session_reference','verified_at','expires_at','revoked','request_id','request_sha256','command_kind','gateway_identity'],array[]::text[]) or context->'version' is distinct from '1'::jsonb or command->'version' is distinct from '1'::jsonb or jsonb_typeof(context->'verified_actor_id') is distinct from 'string' or jsonb_typeof(context->'verified_environment') is distinct from 'string' or jsonb_typeof(context->'verified_at') is distinct from 'string' or jsonb_typeof(context->'expires_at') is distinct from 'string' or jsonb_typeof(context->'auth_source') is distinct from 'string' or jsonb_typeof(context->'auth_config_version') is distinct from 'number' or jsonb_typeof(context->'request_id') is distinct from 'string' or jsonb_typeof(context->'request_sha256') is distinct from 'string' or coalesce(context->>'principal_kind','') not in ('OTR_USER','OTR_ADMIN','EXTERNAL_CLIENT','TRUSTED_WORKLOAD') or context->>'gateway_identity' is distinct from session_user::text or not session_user::text=any(gateways) or context->>'command_kind' is distinct from kind or context->>'verified_environment' is distinct from command->>'environment' or context->>'request_id' is distinct from command->>'request_id' or context->>'request_sha256' is distinct from command->>'request_sha256' or context->>'request_sha256' is distinct from public.cp14_hash(jsonb_build_object('domain','otr-cp14-command-v1','command',command-'request_sha256')) or context->>'auth_source' !~ '^[A-Za-z0-9._:-]{1,128}$' or (context->>'auth_config_version')::bigint<1 or (context->>'verified_at')::timestamptz>clock_timestamp() or context->>'revoked' is distinct from 'false' or (context->>'expires_at')::timestamptz<=clock_timestamp() then raise exception 'CP14_CONTEXT_FORBIDDEN' using errcode='42501';
end if;

 if exists(select 1 from jsonb_each(command) e where e.key in ('expected_revision','publication_fence','grant_revision','response_version') and (jsonb_typeof(e.value) is distinct from 'number' or e.value::text !~ '^[1-9][0-9]{0,15}$' or (e.value::text)::numeric>9007199254740991)) or exists(select 1 from jsonb_each(command) e where e.key in ('actor_id','account_id','client_identity_id','call_id','invocation_id','review_decision_id','package_id','grant_id') and (e.value='null'::jsonb and e.key not in ('call_id') or e.value<>'null'::jsonb and (jsonb_typeof(e.value) is distinct from 'string' or e.value#>>'{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))) then raise exception 'CP14_INVALID_COMMAND';
end if;

 if (session_user='otr_external_integration_call_gateway' or session_user='otr_external_integration_recovery_gateway' and kind in ('external_integration_usage_append','external_integration_observe_call')) and context->>'principal_kind' is distinct from 'TRUSTED_WORKLOAD' then raise exception 'CP14_CONTEXT_FORBIDDEN';end if;
 if command ? 'actor_id' and command->>'actor_id' is distinct from context->>'verified_actor_id' or command ? 'account_id' and command->>'account_id' is distinct from context->>'verified_account_id' or command ? 'client_identity_id' and command->>'client_identity_id' is distinct from context->>'verified_client_identity' then raise exception 'CP14_SCOPE_FORBIDDEN' using errcode='42501';
end if;

 if permission is not null and (context->>'principal_kind'<>'OTR_ADMIN' or not exists(select 1 from public.external_integration_admin_grants g where g.actor_id=(context->>'verified_actor_id')::uuid and g.environment=context->>'verified_environment' and g.permission=cp14_context.permission and g.revoked_at is null and g.expires_at>clock_timestamp())) then raise exception 'CP14_ADMIN_FORBIDDEN' using errcode='42501';
end if;

 perform public.cp14_bind_request(context,command);
 end $$;

revoke all on function public.cp14_context(jsonb,jsonb,text,text[],text) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_context(jsonb,jsonb,text,text[],text) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_scope_lock(environment text, integration text) returns void language plpgsql security invoker set search_path=pg_catalog as $$ begin perform pg_advisory_xact_lock(hashtextextended('cp14/environment/'||environment,0));
if integration is not null then perform pg_advisory_xact_lock(hashtextextended('cp14/integration/'||integration,0));
end if;
end $$;

revoke all on function public.cp14_scope_lock(text,text) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_scope_lock(text,text) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_audit(context jsonb, command jsonb, integration text, entity text, previous bigint, version bigint, before_hash text, after_hash text, change text) returns void language plpgsql security invoker set search_path=pg_catalog as $$ begin insert into public.external_integration_config_audit(audit_id,integration_id,environment,entity_kind,entity_key,previous_version,new_version,admin_actor_id,command_id,change_type,before_sha256,after_sha256,safe_diff,reason_code,occurred_at) values((command->>'audit_id')::uuid,integration,context->>'verified_environment',entity,coalesce(integration,context->>'verified_environment'),previous,version,(context->>'verified_actor_id')::uuid,(command->>'request_id')::uuid,change,before_hash,after_hash,jsonb_build_object('request_sha256',command->>'request_sha256','scope_sha256',public.cp14_request_scope(context),'command_kind',context->>'command_kind'),command->>'reason_code',clock_timestamp());
end $$;

revoke all on function public.cp14_audit(jsonb,jsonb,text,text,bigint,bigint,text,text,text) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_audit(jsonb,jsonb,text,text,bigint,bigint,text,text,text) to otr_external_integration_config_writer,otr_external_integration_inbound_writer;

create function public.cp14_config_replay(context jsonb, command jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$ declare a public.external_integration_config_audit;
begin select * into a from public.external_integration_config_audit where environment=context->>'verified_environment' and command_id=(command->>'request_id')::uuid;
if found then if a.safe_diff->>'request_sha256' is distinct from command->>'request_sha256' or a.admin_actor_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_CHANGED_REQUEST';
end if;
return jsonb_build_object('version',a.new_version,'audit_id',a.audit_id);
end if;
return null;
end $$;

revoke all on function public.cp14_config_replay(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_config_replay(jsonb,jsonb) to otr_external_integration_config_writer,otr_external_integration_inbound_writer;

create function public.external_integration_configure(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integrations;
old public.external_integrations;
result jsonb;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['integration_id','category','vendor_namespace','environment','admin_label','enabled','kill_switch','config_version','config_sha256','credential_reference','auth_config_reference','capabilities','quota_limit','quota_window_seconds','rate_per_minute','health_state','health_observed_at','health_observation_id','created_at','updated_at','created_by','updated_by'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_integration_configure',array['otr_external_integration_admin_gateway'],'CONFIG_ADMIN');
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
result:=public.cp14_config_replay(context,command);
if result is not null then return result;
end if;
r:=jsonb_populate_record(null::public.external_integrations,command->'row');
if r.integration_id is distinct from command->>'integration_id' or r.environment is distinct from context->>'verified_environment' or r.updated_by is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
select * into old from public.external_integrations where integration_id=r.integration_id;
if found then if r.kill_switch is distinct from old.kill_switch then raise exception 'CP14_SECURITY_OWNED';end if;
if old.config_version is distinct from (command->>'expected_version')::bigint or r.config_version<>old.config_version+1 or r.category<>old.category or r.vendor_namespace<>old.vendor_namespace or r.environment<>old.environment or r.created_at<>old.created_at or r.created_by<>old.created_by or r.health_state<>old.health_state or r.health_observation_id is distinct from old.health_observation_id then raise exception 'CP14_CONFIG_CAS';
end if;
update public.external_integrations set admin_label=r.admin_label,enabled=r.enabled,config_version=r.config_version,config_sha256=r.config_sha256,credential_reference=r.credential_reference,auth_config_reference=r.auth_config_reference,capabilities=r.capabilities,quota_limit=r.quota_limit,quota_window_seconds=r.quota_window_seconds,rate_per_minute=r.rate_per_minute,health_state=r.health_state,health_observed_at=r.health_observed_at,health_observation_id=r.health_observation_id,updated_at=r.updated_at,updated_by=r.updated_by where integration_id=r.integration_id;
else if r.kill_switch is distinct from true then raise exception 'CP14_SECURITY_OWNED';end if;
if command->'expected_version'<>'null' or r.config_version<>1 or r.created_by<>r.updated_by or r.health_observation_id is not null then raise exception 'CP14_CONFIG_CAS';
end if;
insert into public.external_integrations select r.*;
end if;
perform public.cp14_audit(context,command,r.integration_id,'integration',old.config_version,r.config_version,old.config_sha256,r.config_sha256,'CONFIG');
return public.cp14_config_replay(context,command);
 end$$;

alter function public.external_integration_configure(jsonb,jsonb) owner to otr_external_integration_config_writer;

revoke all on function public.external_integration_configure(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_configure(jsonb,jsonb) to otr_external_integration_admin_gateway;

create function public.external_integration_set_kill(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare v bigint;
result jsonb;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','kill_switch'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_integration_set_kill',array['otr_external_integration_admin_gateway'],'SECURITY_ADMIN');
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
result:=public.cp14_config_replay(context,command);
if result is not null then return result;
end if;
if jsonb_typeof(command->'kill_switch')<>'boolean' then raise exception 'CP14_INVALID_COMMAND';
end if;
if command->>'integration_id' is null then select config_version into v from public.external_integration_environment_state where environment=command->>'environment';
if v is distinct from (command->>'expected_version')::bigint then raise exception 'CP14_CONFIG_CAS';
end if;
update public.external_integration_environment_state set kill_switch=(command->>'kill_switch')::boolean,config_version=v+1,updated_at=clock_timestamp(),updated_by=(context->>'verified_actor_id')::uuid where environment=command->>'environment';
else select config_version into v from public.external_integrations where integration_id=command->>'integration_id' and environment=command->>'environment';
if v is distinct from (command->>'expected_version')::bigint then raise exception 'CP14_CONFIG_CAS';
end if;
update public.external_integrations set kill_switch=(command->>'kill_switch')::boolean,config_version=v+1,updated_at=clock_timestamp(),updated_by=(context->>'verified_actor_id')::uuid where integration_id=command->>'integration_id';
end if;
perform public.cp14_audit(context,command,command->>'integration_id','kill',v,v+1,null,public.cp14_hash(command-'request_sha256'),'KILL');
return public.cp14_config_replay(context,command);
 end$$;

alter function public.external_integration_set_kill(jsonb,jsonb) owner to otr_external_integration_config_writer;

revoke all on function public.external_integration_set_kill(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_set_kill(jsonb,jsonb) to otr_external_integration_admin_gateway;

create function public.intelligence_provider_config_append(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.intelligence_provider_configs;
v bigint;
result jsonb;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['provider_config_id','integration_id','provider_id','model_id','model_version','adapter_version','config_version','configuration_sha256','provider_class','capabilities','modalities','schema_contracts','schema_output','privacy_policy','network_required','data_region','routing_class','routing_priority','routing_eligibility','input_byte_limit','output_byte_limit','input_count_limit','max_complexity','max_risk','replay_support','quality_policy_reference','quality_policy_sha256','quality_observation_reference','latency_estimate_ms','expected_completion_cost_nanos','expected_cost_currency','created_at','created_by'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'intelligence_provider_config_append',array['otr_external_integration_admin_gateway'],'CONFIG_ADMIN');
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
result:=public.cp14_config_replay(context,command);
if result is not null then return result;
end if;
r:=jsonb_populate_record(null::public.intelligence_provider_configs,command->'row');
if r.integration_id<>command->>'integration_id' or r.created_by<>(context->>'verified_actor_id')::uuid or not exists(select 1 from public.external_integrations where integration_id=r.integration_id and category='INTELLIGENCE_OUTBOUND' and environment=command->>'environment') then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
select coalesce(max(config_version),0) into v from public.intelligence_provider_configs where integration_id=r.integration_id and provider_id=r.provider_id and model_id=r.model_id;
if v<>coalesce((command->>'expected_version')::bigint,0) or r.config_version<>v+1 then raise exception 'CP14_CONFIG_CAS';
end if;
if jsonb_typeof(r.schema_contracts)<>'array' or jsonb_array_length(r.schema_contracts)>32 or exists(select 1 from jsonb_array_elements(r.schema_contracts) e where not public.cp14_keys(e,array['id','version','dialect'],array[]::text[]) or jsonb_typeof(e->'id') is distinct from 'string' or jsonb_typeof(e->'dialect') is distinct from 'string' or coalesce(e->>'id','') !~ '^[A-Za-z0-9._:-]{1,128}$' or coalesce(e->>'dialect','') !~ '^[A-Za-z0-9._:-]{1,128}$' or jsonb_typeof(e->'version') is distinct from 'number' or coalesce(e->>'version','') !~ '^[1-9][0-9]{0,15}$' or (e->>'version')::numeric>9007199254740991) then raise exception 'CP14_SCHEMA_CONTRACT';
end if;
insert into public.intelligence_provider_configs select r.*;
perform public.cp14_audit(context,command,r.integration_id,'provider',nullif(v,0),r.config_version,null,r.configuration_sha256,'CONFIG');
return public.cp14_config_replay(context,command);
 end$$;

alter function public.intelligence_provider_config_append(jsonb,jsonb) owner to otr_external_integration_config_writer;

revoke all on function public.intelligence_provider_config_append(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.intelligence_provider_config_append(jsonb,jsonb) to otr_external_integration_admin_gateway;

create function public.external_integration_price_append(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_price_schedules;
old public.external_integration_price_schedules;
u public.external_integration_price_schedule_units;
result jsonb;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','expected_version','audit_id','reason_code','row','units'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['price_schedule_id','integration_id','provider_id','model_id','schedule_version','currency','effective_from','effective_until','source_reference','source_version','schedule_sha256','supersedes_schedule_id','rounding_policy','created_at','created_by'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_integration_price_append',array['otr_external_integration_admin_gateway'],'CONFIG_ADMIN');
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
result:=public.cp14_config_replay(context,command);
if result is not null then return result;
end if;
r:=jsonb_populate_record(null::public.external_integration_price_schedules,command->'row');
if r.integration_id<>command->>'integration_id' or r.created_by<>(context->>'verified_actor_id')::uuid or not exists(select 1 from public.external_integrations where integration_id=r.integration_id and environment=command->>'environment') then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
if (select schedule_version from public.external_integration_price_schedules where integration_id=r.integration_id and provider_id is not distinct from r.provider_id and model_id is not distinct from r.model_id and currency=r.currency order by effective_from desc limit 1) is distinct from command->>'expected_version' then raise exception 'CP14_PRICE_CAS';
end if;
if r.supersedes_schedule_id is not null then select * into old from public.external_integration_price_schedules where price_schedule_id=r.supersedes_schedule_id;
if not found or old.integration_id<>r.integration_id or old.provider_id is distinct from r.provider_id or old.model_id is distinct from r.model_id or old.currency<>r.currency or r.effective_from<=old.effective_from or old.effective_until is not null and r.effective_from>=old.effective_until or exists(select 1 from public.external_integration_price_schedules where supersedes_schedule_id=old.price_schedule_id) then raise exception 'CP14_PRICE_SUPERSESSION';
end if;
end if;
if exists(select 1 from public.external_integration_price_schedules s where s.integration_id=r.integration_id and s.provider_id is not distinct from r.provider_id and s.model_id is not distinct from r.model_id and s.currency=r.currency and s.price_schedule_id is distinct from r.supersedes_schedule_id and tstzrange(s.effective_from,least(s.effective_until,(select min(n.effective_from) from public.external_integration_price_schedules n where n.supersedes_schedule_id=s.price_schedule_id)),'[)') && tstzrange(r.effective_from,r.effective_until,'[)')) then raise exception 'CP14_PRICE_OVERLAP';
end if;
if jsonb_typeof(command->'units')<>'array' or jsonb_array_length(command->'units') not between 1 and 32 then raise exception 'CP14_PRICE_UNITS';
end if;
if exists(select 1 from jsonb_array_elements(command->'units') unit where coalesce(unit->>'price_per_quantity','') !~ '^[0-9]{1,42}(\.[0-9]{1,18})?$' or not public.cp14_keys(unit,array['price_schedule_id','unit_key','measurement_unit','unit_quantity','price_per_quantity','unit_definition'],array[]::text[])) then raise exception 'CP14_PRICE_UNIT_GRAMMAR';
end if;
insert into public.external_integration_price_schedules select r.*;
for u in select (jsonb_populate_record(null::public.external_integration_price_schedule_units,e)).* from jsonb_array_elements(command->'units') e loop if u.price_schedule_id<>r.price_schedule_id or u.price_per_quantity::text !~ '^[0-9]+(\.[0-9]{1,18})?$' or not public.cp14_keys(u.unit_definition,array['version','relationship','included_in','billable'],array[]::text[]) or u.unit_definition->'version' is distinct from '1'::jsonb or jsonb_typeof(u.unit_definition->'included_in') not in ('null','string') or u.unit_definition->>'included_in' is not null and u.unit_definition->>'included_in' !~ '^[A-Za-z0-9._:-]{1,128}$' or u.unit_definition->>'relationship'='INCLUDED' and u.unit_definition->>'included_in' is null or u.unit_definition->>'relationship' not in ('DISJOINT','INCLUDED','AMBIGUOUS') or jsonb_typeof(u.unit_definition->'billable')<>'boolean' then raise exception 'CP14_PRICE_UNIT';
end if;
insert into public.external_integration_price_schedule_units select u.*;
end loop;
perform public.cp14_audit(context,command,r.integration_id,'price',null,1,null,r.schedule_sha256,'PRICE');
return public.cp14_config_replay(context,command);
 end$$;

alter function public.external_integration_price_append(jsonb,jsonb) owner to otr_external_integration_config_writer;

revoke all on function public.external_integration_price_append(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_price_append(jsonb,jsonb) to otr_external_integration_admin_gateway;

create function public.external_integration_health_observe(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_health_observations;
old public.external_integration_health_observations;
seq bigint;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','integration_id','expected_version','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['health_observation_id','integration_id','config_version','health_state','safe_reason','provider_observed_at','received_at','observation_sequence','latency_ms','observer_principal_id','observation_sha256'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_integration_health_observe',array['otr_external_integration_call_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
if context->>'principal_kind'<>'TRUSTED_WORKLOAD' then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
r:=jsonb_populate_record(null::public.external_integration_health_observations,command->'row');
select * into old from public.external_integration_health_observations where health_observation_id=r.health_observation_id;
if found then if to_jsonb(old)<>to_jsonb(r) then raise exception 'CP14_CHANGED_REQUEST';
end if;
return to_jsonb(old);
end if;
if r.observer_principal_id<>(context->>'verified_actor_id')::uuid or r.integration_id<>command->>'integration_id' then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
if not exists(select 1 from public.external_integrations where integration_id=r.integration_id and environment=command->>'environment' and config_version=(command->>'expected_version')::bigint) then raise exception 'CP14_HEALTH_CAS';
end if;
select coalesce(max(observation_sequence),0)+1 into seq from public.external_integration_health_observations where integration_id=r.integration_id;
if r.observation_sequence<>seq then raise exception 'CP14_HEALTH_SEQUENCE';
end if;
insert into public.external_integration_health_observations select r.*;
update public.external_integrations set health_state=r.health_state,health_observed_at=r.received_at,health_observation_id=r.health_observation_id where integration_id=r.integration_id and config_version=r.config_version;
return to_jsonb(r);
 end$$;

alter function public.external_integration_health_observe(jsonb,jsonb) owner to otr_external_integration_config_writer;

revoke all on function public.external_integration_health_observe(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_health_observe(jsonb,jsonb) to otr_external_integration_call_gateway;

create function public.cp14_call_admission(r public.external_integration_calls, reserve boolean default true) returns void language plpgsql security invoker set search_path=pg_catalog as $$ declare i public.external_integrations;
p public.intelligence_provider_configs;
n bigint;
begin if not public.cp14_trip_access(r.account_id,r.trip_id) then raise exception 'CP14_TRIP_FORBIDDEN';end if;select * into i from public.external_integrations where integration_id=r.integration_id;
if not found or i.environment<>r.environment or not i.enabled or i.kill_switch or i.config_version<>r.config_version or i.config_sha256<>r.configuration_sha256 or (select kill_switch from public.external_integration_environment_state where environment=r.environment) then raise exception 'CP14_ADMISSION_CLOSED';
end if;
if r.provider_config_id is not null then select * into p from public.intelligence_provider_configs where provider_config_id=r.provider_config_id;
if p.config_version<>(select max(config_version) from public.intelligence_provider_configs where integration_id=p.integration_id and provider_id=p.provider_id and model_id=p.model_id) or p.routing_eligibility='DISABLED' or p.routing_eligibility='SHADOW_ONLY' and not r.shadow or p.provider_id<>r.provider_id or p.model_id<>r.model_id or p.model_version<>r.model_version or p.adapter_version<>r.adapter_version or not r.capability=any(p.capabilities) then raise exception 'CP14_PROVIDER_INELIGIBLE';
end if;
end if;
if r.price_schedule_id is not null and not exists(select 1 from public.external_integration_price_schedules price where price.price_schedule_id=r.price_schedule_id and price.integration_id=r.integration_id and price.provider_id is not distinct from r.provider_id and price.model_id is not distinct from r.model_id and price.effective_from<=case when reserve then clock_timestamp() else r.admitted_at end and (least(price.effective_until,(select min(next.effective_from) from public.external_integration_price_schedules next where next.supersedes_schedule_id=price.price_schedule_id)) is null or least(price.effective_until,(select min(next.effective_from) from public.external_integration_price_schedules next where next.supersedes_schedule_id=price.price_schedule_id))>case when reserve then clock_timestamp() else r.admitted_at end)) then raise exception 'CP14_PRICE_PIN';
end if;
if reserve and i.quota_limit is not null then select count(*) into n from public.external_integration_calls where integration_id=i.integration_id and admitted_at>=to_timestamp(floor(extract(epoch from clock_timestamp())/i.quota_window_seconds)*i.quota_window_seconds);
if n>=i.quota_limit then raise exception 'CP14_QUOTA';
end if;
end if;
if reserve and i.rate_per_minute is not null then select count(*) into n from public.external_integration_calls where integration_id=i.integration_id and admitted_at>=date_trunc('minute',clock_timestamp());
if n>=i.rate_per_minute then raise exception 'CP14_RATE';
end if;
end if;
end $$;

revoke all on function public.cp14_call_admission(public.external_integration_calls,boolean) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_call_admission(public.external_integration_calls,boolean) to otr_external_integration_meter_writer;

create function public.external_integration_reserve_call(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;
old public.external_integration_calls;
s public.external_integration_usage_events;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','row','start'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['call_id','integration_id','environment','provider_config_id','provider_id','model_id','model_version','adapter_version','config_version','configuration_sha256','account_id','user_id','billing_subject_id','trip_id','import_id','task_id','attempt_id','fallback_chain_id','shadow_of_call_id','evaluation_reference','attempt_sequence','invocation_id','request_id','idempotency_key','request_sha256','input_sha256','schema_sha256','capability','task_class','call_kind','shadow','price_schedule_id','admitted_at','admission_sha256','publication_fence','row_revision','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_integration_reserve_call',array['otr_external_integration_call_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
r:=jsonb_populate_record(null::public.external_integration_calls,command->'row');
if r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from r.account_id or r.environment<>context->>'verified_environment' or r.integration_id<>command->>'integration_id' or r.dispatch_state<>'RESERVED' or r.execution_certainty<>'NOT_STARTED' or r.row_revision<>1 or r.request_id<>(command->>'request_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
select * into old from public.external_integration_calls where call_id=r.call_id or integration_id=r.integration_id and attempt_id=r.attempt_id and account_id=r.account_id;
if found then if old.admission_sha256 is distinct from context->>'request_sha256' then raise exception 'CP14_CHANGED_REQUEST';end if;if (to_jsonb(old)-array['row_revision','publication_fence','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason','admitted_at','admission_sha256'])<>(to_jsonb(r)-array['row_revision','publication_fence','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason','admitted_at','admission_sha256']) then raise exception 'CP14_CHANGED_REQUEST';
end if;
return to_jsonb(old);
end if;
perform public.cp14_call_admission(r);
r.admitted_at:=clock_timestamp();r.admission_sha256:=context->>'request_sha256';
insert into public.external_integration_calls select r.*;
if not public.cp14_keys(command->'start',array['observation_id','call_id','observation_key','observation_version','observation_kind','measurement_mode','observed_at','received_at','started_at','ended_at','latency_ms','status','outcome','response_sha256','publication_sha256','input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms','other_units','provider_extension','usage_quality','unit_quality','price_schedule_id','cost_nanos','currency','cost_quality','cost_calculation_version','supersedes_observation_id','observation_sha256'],array[]::text[]) then raise exception 'CP14_START_GRAMMAR';
end if;
s:=jsonb_populate_record(null::public.external_integration_usage_events,command->'start');
if s.call_id<>r.call_id or s.observation_kind<>'START' then raise exception 'CP14_START_REQUIRED';
end if;
insert into public.external_integration_usage_events select s.*;
return to_jsonb(r);
 end$$;

alter function public.external_integration_reserve_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;

revoke all on function public.external_integration_reserve_call(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_reserve_call(jsonb,jsonb) to otr_external_integration_call_gateway;

create function public.external_integration_mark_dispatch(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','integration_id','call_id','expected_revision','publication_fence'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_integration_mark_dispatch',array['otr_external_integration_call_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
select * into r from public.external_integration_calls where call_id=(command->>'call_id')::uuid and integration_id=command->>'integration_id' and account_id=(context->>'verified_account_id')::uuid for update;
if not found or r.row_revision<>(command->>'expected_revision')::bigint or r.publication_fence<>(command->>'publication_fence')::bigint or r.dispatch_state<>'RESERVED' then raise exception 'CP14_DISPATCH_FENCE';
end if;
if r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';end if;
if not coalesce((select runtime_enabled from public.external_integration_environment_state where environment=r.environment),false) then raise exception 'CP14_RUNTIME_CLOSED';
end if;
perform public.cp14_call_admission(r,false);
update public.external_integration_calls set dispatch_state='MAY_HAVE_STARTED',execution_certainty='RUNNING',row_revision=row_revision+1,dispatch_marked_at=clock_timestamp() where call_id=r.call_id returning * into r;
return to_jsonb(r);
 end$$;

alter function public.external_integration_mark_dispatch(jsonb,jsonb) owner to otr_external_integration_meter_writer;

revoke all on function public.external_integration_mark_dispatch(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_mark_dispatch(jsonb,jsonb) to otr_external_integration_call_gateway;

create function public.external_integration_usage_append(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_usage_events;
old public.external_integration_usage_events;
call public.external_integration_calls;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','integration_id','call_id','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['observation_id','call_id','observation_key','observation_version','observation_kind','measurement_mode','observed_at','received_at','started_at','ended_at','latency_ms','status','outcome','response_sha256','publication_sha256','input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms','other_units','provider_extension','usage_quality','unit_quality','price_schedule_id','cost_nanos','currency','cost_quality','cost_calculation_version','supersedes_observation_id','observation_sha256'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_integration_usage_append',array['otr_external_integration_call_gateway','otr_external_integration_recovery_gateway'],null);
select * into call from public.external_integration_calls where call_id=(command->>'call_id')::uuid for update;
if not found or call.integration_id<>command->>'integration_id' or call.environment<>context->>'verified_environment' then raise exception 'CP14_SCOPE_FORBIDDEN';
end if;
if call.account_id is distinct from (context->>'verified_account_id')::uuid or call.user_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';end if;
if command->'row'->>'cost_nanos' is not null and command->'row'->>'cost_nanos' !~ '^[0-9]{1,60}$' then raise exception 'CP14_COST_INTEGER';
end if;
r:=jsonb_populate_record(null::public.external_integration_usage_events,command->'row');
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

alter function public.external_integration_usage_append(jsonb,jsonb) owner to otr_external_integration_meter_writer;

revoke all on function public.external_integration_usage_append(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_usage_append(jsonb,jsonb) to otr_external_integration_call_gateway,otr_external_integration_recovery_gateway;

create function public.external_integration_observe_call(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','integration_id','call_id','expected_revision','publication_fence','dispatch_state','execution_certainty','safe_reason','recovery_sha256'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_integration_observe_call',array['otr_external_integration_call_gateway','otr_external_integration_recovery_gateway'],null);
select * into r from public.external_integration_calls where call_id=(command->>'call_id')::uuid and integration_id=command->>'integration_id' and environment=command->>'environment' for update;
if not found then raise exception 'CP14_NOT_FOUND';
end if;
if r.account_id is distinct from (context->>'verified_account_id')::uuid or r.user_id is distinct from (context->>'verified_actor_id')::uuid then raise exception 'CP14_SCOPE_FORBIDDEN';end if;
if r.dispatch_state=command->>'dispatch_state' and r.execution_certainty=command->>'execution_certainty' and r.safe_reason is not distinct from command->>'safe_reason' then return to_jsonb(r);
end if;
if r.row_revision<>(command->>'expected_revision')::bigint or r.publication_fence<>(command->>'publication_fence')::bigint or r.dispatch_state='TERMINAL' or command->>'dispatch_state' not in ('TERMINAL','UNKNOWN') or r.dispatch_state='UNKNOWN' and (session_user<>'otr_external_integration_recovery_gateway' or coalesce(command->>'recovery_sha256','') !~ '^[0-9a-f]{64}$') or r.dispatch_state='RESERVED' and command->>'execution_certainty'<>'NOT_STARTED' then raise exception 'CP14_OBSERVATION_FENCE';
end if;
update public.external_integration_calls set dispatch_state=command->>'dispatch_state',execution_certainty=command->>'execution_certainty',safe_reason=command->>'safe_reason',row_revision=row_revision+1,publication_fence=publication_fence+case when r.dispatch_state='RESERVED' then 1 else 0 end,terminal_observed_at=case when command->>'dispatch_state'='TERMINAL' then clock_timestamp() else null end where call_id=r.call_id returning * into r;
return to_jsonb(r);
 end$$;

alter function public.external_integration_observe_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;

revoke all on function public.external_integration_observe_call(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_observe_call(jsonb,jsonb) to otr_external_integration_call_gateway,otr_external_integration_recovery_gateway;

create function public.cp14_trip_access(actor uuid, trip uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$ select trip is null or exists(select 1 from public.trips t where t.id=trip and t.created_by=actor) or exists(select 1 from public.journey_members m where m.trip_id=trip and m.user_id=actor and m.status='linked') $$;

revoke all on function public.cp14_trip_access(uuid,uuid) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_trip_access(uuid,uuid) to otr_external_integration_inbound_writer,otr_external_integration_reader,otr_external_integration_meter_writer;

create function public.cp14_inbound_authorize(context jsonb, command jsonb, action text) returns public.external_client_grants language plpgsql security invoker set search_path=pg_catalog as $$ declare g public.external_client_grants;
i public.external_client_identities;
registry public.external_integrations;
begin
 select * into g from public.external_client_grants where grant_id=(command->>'grant_id')::uuid;

 if not found or g.integration_id<>command->>'integration_id' or g.client_identity_id is distinct from (context->>'verified_client_identity')::uuid or g.account_id is distinct from (context->>'verified_account_id')::uuid or g.user_id is distinct from (context->>'verified_actor_id')::uuid or g.account_id<>g.user_id or g.revoked_at is not null or g.expires_at<=clock_timestamp() or not action=any(g.actions) or g.grant_revision<>(command->>'grant_revision')::bigint or g.auth_session_reference is distinct from context->>'auth_session_reference' or g.auth_session_version<>(context->>'auth_config_version')::bigint or g.scope_kind='SINGLE_TRIP' and g.trip_id is distinct from (command->>'trip_id')::uuid or g.scope_kind='ACCOUNT_STAGING' and command->>'trip_id' is not null or not public.cp14_trip_access(g.user_id,(command->>'trip_id')::uuid) or g.package_id is not null and g.package_id is distinct from (command->>'package_id')::uuid then raise exception 'CP14_GRANT_FORBIDDEN' using errcode='42501';
end if;

 select * into i from public.external_client_identities where client_identity_id=g.client_identity_id;

 select * into registry from public.external_integrations where integration_id=g.integration_id;

 if not public.cp14_keys(context->'verified_external_subject',array['issuer_namespace','subject_digest'],array[]::text[]) or i.issuer_namespace is distinct from context->'verified_external_subject'->>'issuer_namespace' or i.subject_digest is distinct from context->'verified_external_subject'->>'subject_digest' or i.auth_config_version is distinct from (context->>'auth_config_version')::bigint or not i.enabled or i.revoked_at is not null or not registry.enabled or registry.kill_switch or registry.category<>'AI_CLIENT_INBOUND' or registry.environment<>context->>'verified_environment' or (select kill_switch from public.external_integration_environment_state where environment=registry.environment) then raise exception 'CP14_INBOUND_CLOSED';
end if;
return g;
end $$;

revoke all on function public.cp14_inbound_authorize(jsonb,jsonb,text) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_inbound_authorize(jsonb,jsonb,text) to otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.cp14_inbound_target(context jsonb, command jsonb, action text, target public.inbound_ai_import_reservations) returns public.external_client_grants language plpgsql security invoker set search_path=pg_catalog as $$begin
 if target.reservation_id is null or target.integration_id is distinct from command->>'integration_id' or target.client_identity_id is distinct from (context->>'verified_client_identity')::uuid or target.account_id is distinct from (context->>'verified_account_id')::uuid or target.user_id is distinct from (context->>'verified_actor_id')::uuid or target.package_id is distinct from (command->>'package_id')::uuid or target.trip_id is distinct from (command->>'trip_id')::uuid then raise exception 'CP14_GRANT_FORBIDDEN';end if;
 return public.cp14_inbound_authorize(context,command || jsonb_build_object('integration_id',target.integration_id,'package_id',target.package_id,'trip_id',target.trip_id),action);
end$$;
revoke all on function public.cp14_inbound_target(jsonb,jsonb,text,public.inbound_ai_import_reservations) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp14_inbound_target(jsonb,jsonb,text,public.inbound_ai_import_reservations) to otr_external_integration_inbound_writer,otr_external_integration_reader;

create function public.external_client_authorize_grant(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_client_grants;
old public.external_client_grants;
i public.external_client_identities;
oldi public.external_client_identities;
result jsonb;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','account_id','client_identity_id','integration_id','expected_version','audit_id','reason_code','identity','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['grant_id','integration_id','client_identity_id','account_id','user_id','scope_kind','trip_id','package_id','actions','quota_limit','quota_window_seconds','auth_session_reference','auth_session_version','expires_at','revoked_at','grant_revision','authorization_sha256','created_at','updated_at','authorized_by'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'external_client_authorize_grant',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
result:=public.cp14_config_replay(context,command);
if result is not null then return result;
end if;
if context->>'principal_kind'<>'OTR_USER' then raise exception 'CP14_DELEGATION_REQUIRED';
end if;
if not public.cp14_keys(command->'identity',array['client_identity_id','integration_id','issuer_namespace','subject_digest','auth_config_reference','auth_config_version','enabled','revoked_at','row_revision','created_at','updated_at'],array[]::text[]) then raise exception 'CP14_INVALID_IDENTITY';
end if;
r:=jsonb_populate_record(null::public.external_client_grants,command->'row');
i:=jsonb_populate_record(null::public.external_client_identities,command->'identity');
if not public.cp14_keys(context->'verified_external_subject',array['issuer_namespace','subject_digest'],array[]::text[]) or i.issuer_namespace is distinct from context->'verified_external_subject'->>'issuer_namespace' or i.subject_digest is distinct from context->'verified_external_subject'->>'subject_digest' or i.auth_config_version is distinct from (context->>'auth_config_version')::bigint or r.user_id<>(context->>'verified_actor_id')::uuid or r.account_id<>(context->>'verified_account_id')::uuid or r.client_identity_id<>(context->>'verified_client_identity')::uuid or r.integration_id<>command->>'integration_id' or i.client_identity_id<>r.client_identity_id or i.integration_id<>r.integration_id or r.auth_session_reference is distinct from context->>'auth_session_reference' or r.auth_session_version<>(context->>'auth_config_version')::bigint or not public.cp14_trip_access(r.user_id,r.trip_id) or r.expires_at> (context->>'expires_at')::timestamptz or r.expires_at<=clock_timestamp() or not exists(select 1 from public.external_integrations where integration_id=r.integration_id and category='AI_CLIENT_INBOUND' and environment=command->>'environment') then raise exception 'CP14_GRANT_SCOPE';
end if;
select * into oldi from public.external_client_identities where client_identity_id=i.client_identity_id;
if found then if oldi.integration_id<>i.integration_id or oldi.issuer_namespace<>i.issuer_namespace or oldi.subject_digest<>i.subject_digest or not oldi.enabled or oldi.revoked_at is not null then raise exception 'CP14_CLIENT_BINDING';
end if;
else insert into public.external_client_identities select i.*;
end if;
select * into old from public.external_client_grants where grant_id=r.grant_id;
if found then if old.grant_revision is distinct from (command->>'expected_version')::bigint or r.grant_revision<>old.grant_revision+1 or old.revoked_at is not null or old.expires_at<=clock_timestamp() or (to_jsonb(old)-array['actions','expires_at','revoked_at','grant_revision','updated_at'])<>(to_jsonb(r)-array['actions','expires_at','revoked_at','grant_revision','updated_at']) then raise exception 'CP14_GRANT_CAS';
end if;
update public.external_client_grants set actions=r.actions,expires_at=r.expires_at,revoked_at=r.revoked_at,grant_revision=r.grant_revision,updated_at=r.updated_at where grant_id=r.grant_id;
else if command->'expected_version'<>'null' or r.grant_revision<>1 then raise exception 'CP14_GRANT_CAS';
end if;
insert into public.external_client_grants select r.*;
end if;
perform public.cp14_audit(context,command,r.integration_id,'grant',old.grant_revision,r.grant_revision,old.authorization_sha256,r.authorization_sha256,'AUTH_CONFIG');
return public.cp14_config_replay(context,command);
 end$$;

alter function public.external_client_authorize_grant(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.external_client_authorize_grant(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_client_authorize_grant(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.external_client_revoke_grant(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_client_grants;
result jsonb;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','account_id','client_identity_id','integration_id','grant_id','expected_version','audit_id','reason_code'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_client_revoke_grant',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
result:=public.cp14_config_replay(context,command);
if result is not null then return result;
end if;
if context->>'principal_kind'='OTR_ADMIN' then perform public.cp14_context(context,command,'external_client_revoke_grant',array['otr_external_integration_inbound_gateway'],'SECURITY_ADMIN');
elsif context->>'principal_kind' is distinct from 'OTR_USER' then raise exception 'CP14_DELEGATION_REQUIRED';
end if;
select * into r from public.external_client_grants where grant_id=(command->>'grant_id')::uuid for update;
if not found or context->>'principal_kind'='OTR_USER' and r.user_id is distinct from (context->>'verified_actor_id')::uuid or r.account_id<>(context->>'verified_account_id')::uuid or r.integration_id<>command->>'integration_id' or r.grant_revision is distinct from (command->>'expected_version')::bigint or r.client_identity_id is distinct from (command->>'client_identity_id')::uuid or not exists(select 1 from public.external_integrations i where i.integration_id=r.integration_id and i.environment=command->>'environment') then raise exception 'CP14_GRANT_CAS';
end if;
update public.external_client_grants set revoked_at=clock_timestamp(),grant_revision=grant_revision+1,updated_at=clock_timestamp() where grant_id=r.grant_id;
perform public.cp14_audit(context,command,r.integration_id,'grant',r.grant_revision,r.grant_revision+1,r.authorization_sha256,r.authorization_sha256,'GRANT_REVOKE');
return public.cp14_config_replay(context,command);
 end$$;

alter function public.external_client_revoke_grant(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.external_client_revoke_grant(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_client_revoke_grant(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.inbound_ai_reserve_package(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_import_reservations;
old public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['reservation_id','integration_id','client_identity_id','account_id','user_id','grant_id','admitted_grant_revision','package_id','package_version','contract_version','idempotency_key','package_sha256','package_bytes','trip_intent_kind','trip_id','package_material_reference','package_material_sha256','material_admission_sha256','import_id','task_id','publication_refs','review_version','state','recovery_disposition','row_revision','publication_fence','result_version','result_sha256','safe_result','safe_reason','created_at','updated_at','completed_at'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
if jsonb_typeof(command->'row'->'safe_reason') not in ('string','null') or command->'row'->>'safe_reason' is not null and command->'row'->>'safe_reason' not in ('INVALID_PACKAGE','STALE_REVIEW','ACCESS_REVOKED','MATERIAL_UNAVAILABLE','EXACT_RECOVERY_REQUIRED','USER_REJECTED','USER_DEFERRED') then raise exception 'CP14_SAFE_REASON';end if;
perform public.cp14_context(context,command,'inbound_ai_reserve_package',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
g:=public.cp14_inbound_authorize(context,command,'SUBMIT');
r:=jsonb_populate_record(null::public.inbound_ai_import_reservations,command->'row');
if r.account_id<>g.account_id or r.user_id<>g.user_id or r.integration_id<>g.integration_id or r.client_identity_id<>g.client_identity_id or r.grant_id<>g.grant_id or r.admitted_grant_revision<>g.grant_revision or r.package_id<>(command->>'package_id')::uuid or r.trip_id is distinct from (command->>'trip_id')::uuid or r.state<>'RESERVED' or r.row_revision<>1 or r.package_material_reference is not null or r.safe_result is not null then raise exception 'CP14_PACKAGE_SCOPE';
end if;
select * into old from public.inbound_ai_import_reservations where integration_id=r.integration_id and account_id=r.account_id and idempotency_key=r.idempotency_key;
if found then if old.package_sha256<>r.package_sha256 or old.package_id<>r.package_id or old.client_identity_id<>r.client_identity_id or old.user_id<>r.user_id or old.package_version<>r.package_version or old.package_bytes<>r.package_bytes or old.trip_id is distinct from r.trip_id then raise exception 'CP14_CHANGED_PACKAGE';
end if;
perform public.cp14_inbound_target(context,command,'SUBMIT',old);
return to_jsonb(old);
end if;
if g.quota_limit is not null and (select count(*) from public.inbound_ai_import_reservations where grant_id=g.grant_id and created_at>=to_timestamp(floor(extract(epoch from clock_timestamp())/g.quota_window_seconds)*g.quota_window_seconds))>=g.quota_limit then raise exception 'CP14_GRANT_QUOTA';
end if;
r.created_at:=clock_timestamp();
r.updated_at:=r.created_at;
insert into public.inbound_ai_import_reservations select r.*;
return to_jsonb(r);
 end$$;

alter function public.inbound_ai_reserve_package(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.inbound_ai_reserve_package(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_reserve_package(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.inbound_ai_attach_material(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','reservation_id','expected_revision','material_reference','material_sha256','material_admission_sha256'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'inbound_ai_attach_material',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
select * into r from public.inbound_ai_import_reservations where reservation_id=(command->>'reservation_id')::uuid for update;
g:=public.cp14_inbound_target(context,command,'SUBMIT',r);
select * into r from public.inbound_ai_import_reservations where reservation_id=(command->>'reservation_id')::uuid and integration_id=g.integration_id and account_id=g.account_id and client_identity_id=g.client_identity_id and package_id=(command->>'package_id')::uuid for update;
if not found or r.package_sha256<>command->>'material_sha256' then raise exception 'CP14_MATERIAL_SCOPE';
end if;
if r.package_material_reference is not null then if r.package_material_reference<>(command->>'material_reference')::uuid or r.package_material_sha256<>command->>'material_sha256' or r.material_admission_sha256<>command->>'material_admission_sha256' then raise exception 'CP14_CHANGED_MATERIAL';
end if;
return to_jsonb(r);
end if;
if r.row_revision<>(command->>'expected_revision')::bigint then raise exception 'CP14_RESERVATION_CAS';
end if;
update public.inbound_ai_import_reservations set package_material_reference=(command->>'material_reference')::uuid,package_material_sha256=command->>'material_sha256',material_admission_sha256=command->>'material_admission_sha256',state='MATERIAL_PENDING',row_revision=row_revision+1,updated_at=clock_timestamp() where reservation_id=r.reservation_id returning * into r;
return to_jsonb(r);
 end$$;

alter function public.inbound_ai_attach_material(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.inbound_ai_attach_material(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_attach_material(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.external_integration_reserve_inbound_call(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r public.external_integration_calls;
s public.external_integration_usage_events;
 begin if current_user<>'otr_external_integration_meter_writer' or session_user<>'otr_external_integration_inbound_gateway' then raise exception 'CP14_BRIDGE_FORBIDDEN';
end if;
if not public.cp14_keys(command->'call',array['call_id','integration_id','environment','provider_config_id','provider_id','model_id','model_version','adapter_version','config_version','configuration_sha256','account_id','user_id','billing_subject_id','trip_id','import_id','task_id','attempt_id','fallback_chain_id','shadow_of_call_id','evaluation_reference','attempt_sequence','invocation_id','request_id','idempotency_key','request_sha256','input_sha256','schema_sha256','capability','task_class','call_kind','shadow','price_schedule_id','admitted_at','admission_sha256','publication_fence','row_revision','dispatch_state','execution_certainty','dispatch_marked_at','terminal_observed_at','safe_reason'],array[]::text[]) then raise exception 'CP14_CALL_GRAMMAR';
end if;
r:=jsonb_populate_record(null::public.external_integration_calls,command->'call');
if r.integration_id is distinct from command->>'integration_id' or r.call_kind<>'INBOUND_TOOL' or r.account_id<>(context->>'verified_account_id')::uuid or r.user_id<>(context->>'verified_actor_id')::uuid or r.environment<>context->>'verified_environment' or r.invocation_id<>(command->>'invocation_id')::uuid or r.dispatch_state<>'RESERVED' then raise exception 'CP14_BRIDGE_SCOPE';
end if;
perform public.cp14_call_admission(r);
r.admitted_at:=clock_timestamp();r.admission_sha256:=context->>'request_sha256';
insert into public.external_integration_calls select r.*;
if not public.cp14_keys(command->'start',array['observation_id','call_id','observation_key','observation_version','observation_kind','measurement_mode','observed_at','received_at','started_at','ended_at','latency_ms','status','outcome','response_sha256','publication_sha256','input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms','other_units','provider_extension','usage_quality','unit_quality','price_schedule_id','cost_nanos','currency','cost_quality','cost_calculation_version','supersedes_observation_id','observation_sha256'],array[]::text[]) then raise exception 'CP14_START_GRAMMAR';
end if;
s:=jsonb_populate_record(null::public.external_integration_usage_events,command->'start');
if s.call_id<>r.call_id or s.observation_kind<>'START' then raise exception 'CP14_START_REQUIRED';
end if;
insert into public.external_integration_usage_events select s.*;
return to_jsonb(r);
 end$$;

alter function public.external_integration_reserve_inbound_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;

revoke all on function public.external_integration_reserve_inbound_call(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_reserve_inbound_call(jsonb,jsonb) to otr_external_integration_inbound_writer;

create function public.inbound_ai_reserve_invocation(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_invocations;
old public.inbound_ai_invocations;
p public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','row','call','start'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['invocation_id','reservation_id','integration_id','client_identity_id','account_id','user_id','grant_id','admitted_grant_revision','action','request_id','request_sha256','call_id','publication_fence','row_revision','state','response_version','response_sha256','safe_response','created_at','updated_at','completed_at'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'inbound_ai_reserve_invocation',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
r:=jsonb_populate_record(null::public.inbound_ai_invocations,command->'row');
select * into p from public.inbound_ai_import_reservations where reservation_id=r.reservation_id for update;
g:=public.cp14_inbound_target(context,command,r.action,p);
if r.call_id is distinct from (command->'call'->>'call_id')::uuid or r.integration_id<>g.integration_id or r.client_identity_id<>g.client_identity_id or r.account_id<>g.account_id or r.user_id<>g.user_id or r.request_id<>(command->>'request_id')::uuid or r.admitted_grant_revision<>g.grant_revision or r.state<>'RESERVED' or not exists(select 1 from public.inbound_ai_import_reservations where reservation_id=r.reservation_id and integration_id=r.integration_id and account_id=r.account_id and client_identity_id=r.client_identity_id and package_id=(command->>'package_id')::uuid) then raise exception 'CP14_INVOCATION_SCOPE';
end if;
select * into old from public.inbound_ai_invocations where integration_id=r.integration_id and account_id=r.account_id and request_id=r.request_id;
if found then if not exists(select 1 from public.external_integration_calls accepted where accepted.call_id=old.call_id and accepted.admission_sha256=context->>'request_sha256') then raise exception 'CP14_CHANGED_REQUEST';end if;if old.request_sha256<>r.request_sha256 or old.action<>r.action or old.client_identity_id<>r.client_identity_id or old.reservation_id<>r.reservation_id then raise exception 'CP14_CHANGED_REQUEST';
end if;
return to_jsonb(old);
end if;
if g.quota_limit is not null and r.action<>'STATUS' and (select count(*) from public.inbound_ai_invocations where grant_id=g.grant_id and action<>'STATUS' and created_at>=to_timestamp(floor(extract(epoch from clock_timestamp())/g.quota_window_seconds)*g.quota_window_seconds))>=g.quota_limit then raise exception 'CP14_GRANT_QUOTA';
end if;
r.created_at:=clock_timestamp();
r.updated_at:=r.created_at;
insert into public.inbound_ai_invocations select r.*;
perform public.external_integration_reserve_inbound_call(context,jsonb_build_object('call',command->'call','start',command->'start','invocation_id',r.invocation_id,'integration_id',g.integration_id));
return to_jsonb(r);
 end$$;

alter function public.inbound_ai_reserve_invocation(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.inbound_ai_reserve_invocation(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_reserve_invocation(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.external_integration_complete_inbound_call(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.external_integration_calls;
r public.external_integration_usage_events;
old public.external_integration_usage_events;

begin
 if current_user<>'otr_external_integration_meter_writer' or session_user::text not in ('otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway') or not public.cp14_keys(command,array['invocation_id','call_id','integration_id','client_identity_id','response_sha256','completion'],array[]::text[]) or not public.cp14_keys(command->'completion',array['observation_id','call_id','observation_key','observation_version','observation_kind','measurement_mode','observed_at','received_at','started_at','ended_at','latency_ms','status','outcome','response_sha256','publication_sha256','input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms','other_units','provider_extension','usage_quality','unit_quality','price_schedule_id','cost_nanos','currency','cost_quality','cost_calculation_version','supersedes_observation_id','observation_sha256'],array[]::text[]) then raise exception 'CP14_BRIDGE_FORBIDDEN';
end if;

 select * into c from public.external_integration_calls where call_id=(command->>'call_id')::uuid for update;

 if c.call_kind is distinct from 'INBOUND_TOOL' or c.integration_id is distinct from command->>'integration_id' or c.invocation_id is distinct from (command->>'invocation_id')::uuid or c.account_id is distinct from (context->>'verified_account_id')::uuid or c.user_id is distinct from (context->>'verified_actor_id')::uuid or c.environment is distinct from context->>'verified_environment' or command->>'client_identity_id' is distinct from context->>'verified_client_identity' then raise exception 'CP14_BRIDGE_SCOPE';
end if;

 r:=jsonb_populate_record(null::public.external_integration_usage_events,command->'completion');

 if r.call_id is distinct from c.call_id or r.price_schedule_id is distinct from c.price_schedule_id or r.observation_kind not in ('COMPLETION','RECOVERY','COST_RECONCILIATION') or r.response_sha256 is not null and r.response_sha256 is distinct from command->>'response_sha256' or not public.cp14_numeric_map(r.other_units) or not public.cp14_numeric_map(r.provider_extension) or command->'completion'->>'cost_nanos' is not null and command->'completion'->>'cost_nanos' !~ '^[0-9]{1,60}$' then raise exception 'CP14_COMPLETION_SCOPE';
end if;

 select * into old from public.external_integration_usage_events where call_id=r.call_id and observation_key=r.observation_key;

 if found then if to_jsonb(old) is distinct from to_jsonb(r) then raise exception 'CP14_CHANGED_OBSERVATION';
end if;
return to_jsonb(old);
end if;

 insert into public.external_integration_usage_events select r.*;
return to_jsonb(r);

end$$;

alter function public.external_integration_complete_inbound_call(jsonb,jsonb) owner to otr_external_integration_meter_writer;

revoke all on function public.external_integration_complete_inbound_call(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_complete_inbound_call(jsonb,jsonb) to otr_external_integration_inbound_writer;

create function public.inbound_ai_complete_invocation(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_invocations;
projection jsonb;
p public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','invocation_id','expected_revision','publication_fence','state','response_version','response_sha256','safe_response'],array['reservation_update','completion']::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'inbound_ai_complete_invocation',array['otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
select * into r from public.inbound_ai_invocations where invocation_id=(command->>'invocation_id')::uuid for update;
select * into p from public.inbound_ai_import_reservations where reservation_id=r.reservation_id for update;
g:=public.cp14_inbound_target(context,command,'STATUS',p);
select * into r from public.inbound_ai_invocations where invocation_id=(command->>'invocation_id')::uuid and account_id=g.account_id and client_identity_id=g.client_identity_id for update;
if not found or r.integration_id is distinct from g.integration_id or not exists(select 1 from public.inbound_ai_import_reservations package where package.reservation_id=r.reservation_id and package.package_id=(command->>'package_id')::uuid and package.trip_id is not distinct from (command->>'trip_id')::uuid) then raise exception 'CP14_INVOCATION_SCOPE';
end if;
if not public.cp14_safe_result(command->'safe_response') or not public.cp14_keys(command->'safe_response',array['version','state','reservation_id'],array['safe_reason','result_sha256']) or command->'safe_response'->>'reservation_id' is distinct from r.reservation_id::text or command->'safe_response'->>'state' is distinct from command->>'state' then raise exception 'CP14_SAFE_RESPONSE';end if;
if command ? 'reservation_update' and (jsonb_typeof(command->'reservation_update'->'safe_reason') is null or jsonb_typeof(command->'reservation_update'->'safe_reason') not in ('string','null') or command->'reservation_update'->>'safe_reason' is not null and command->'reservation_update'->>'safe_reason' not in ('INVALID_PACKAGE','STALE_REVIEW','ACCESS_REVOKED','MATERIAL_UNAVAILABLE','EXACT_RECOVERY_REQUIRED','USER_REJECTED','USER_DEFERRED')) then raise exception 'CP14_SAFE_REASON';end if;
if r.safe_response is not null then if r.response_sha256<>command->>'response_sha256' or r.safe_response<>command->'safe_response' then raise exception 'CP14_SEALED_RESPONSE';
end if;
if command ? 'completion' then perform public.external_integration_complete_inbound_call(context,jsonb_build_object('invocation_id',r.invocation_id,'call_id',r.call_id,'integration_id',r.integration_id,'client_identity_id',r.client_identity_id,'response_sha256',r.response_sha256,'completion',command->'completion'));
end if;
return to_jsonb(r);
end if;
if r.state='UNKNOWN' and session_user<>'otr_external_integration_recovery_gateway' or r.row_revision<>(command->>'expected_revision')::bigint or r.publication_fence<>(command->>'publication_fence')::bigint or not public.cp14_safe_result(command->'safe_response') or command->>'state' not in ('COMPLETE','UNKNOWN','REJECTED') or command->>'response_sha256'<>public.cp14_hash(jsonb_build_object('domain','otr-cp14-safe-response-v1','response',command->'safe_response')) then raise exception 'CP14_RESULT_CAS';
end if;
if command ? 'reservation_update' then
 projection:=command->'reservation_update';

 if not public.cp14_keys(projection,array['expected_revision','publication_fence','state','import_id','task_id','publication_refs','review_version','result_version','result_sha256','safe_result','safe_reason'],array[]::text[]) or not public.cp14_safe_result(projection->'safe_result') or not public.cp14_keys(projection->'safe_result',array['version','state','reservation_id'],array['safe_reason','result_sha256']) or projection->'safe_result'->>'reservation_id' is distinct from r.reservation_id::text or projection->'safe_result'->>'state' is distinct from projection->>'state' or projection->>'result_sha256' is distinct from public.cp14_hash(jsonb_build_object('domain','otr-cp14-reservation-result-v1','result',projection->'safe_result')) then raise exception 'CP14_RESERVATION_RESULT';
end if;

 select * into p from public.inbound_ai_import_reservations where reservation_id=r.reservation_id for update;

 if p.integration_id is distinct from g.integration_id or p.account_id is distinct from g.account_id or p.client_identity_id is distinct from g.client_identity_id or p.package_id is distinct from (command->>'package_id')::uuid or p.trip_id is distinct from (command->>'trip_id')::uuid or p.row_revision is distinct from (projection->>'expected_revision')::bigint or p.publication_fence is distinct from (projection->>'publication_fence')::bigint or coalesce(p.result_version,0)+1 is distinct from (projection->>'result_version')::bigint or p.import_id is not null and p.import_id is distinct from (projection->>'import_id')::uuid or p.task_id is not null and p.task_id is distinct from (projection->>'task_id')::uuid or (projection->>'review_version')::bigint<p.review_version or p.state='UNKNOWN' and session_user<>'otr_external_integration_recovery_gateway' then raise exception 'CP14_RESERVATION_CAS';
end if;

 update public.inbound_ai_import_reservations set state=projection->>'state',import_id=(projection->>'import_id')::uuid,task_id=(projection->>'task_id')::uuid,publication_refs=projection->'publication_refs',review_version=(projection->>'review_version')::bigint,result_version=(projection->>'result_version')::bigint,result_sha256=projection->>'result_sha256',safe_result=projection->'safe_result',safe_reason=projection->>'safe_reason',row_revision=row_revision+1,updated_at=clock_timestamp(),completed_at=case when projection->>'state'='COMPLETE' then clock_timestamp() else null end where reservation_id=p.reservation_id;

 end if;

 update public.inbound_ai_invocations set state=command->>'state',response_version=case when command->>'state'='UNKNOWN' then null else (command->>'response_version')::bigint end,response_sha256=case when command->>'state'='UNKNOWN' then null else command->>'response_sha256' end,safe_response=case when command->>'state'='UNKNOWN' then null else command->'safe_response' end,row_revision=row_revision+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() where invocation_id=r.invocation_id returning * into r;
if command ? 'completion' then perform public.external_integration_complete_inbound_call(context,jsonb_build_object('invocation_id',r.invocation_id,'call_id',r.call_id,'integration_id',r.integration_id,'client_identity_id',r.client_identity_id,'response_sha256',r.response_sha256,'completion',command->'completion'));
end if;
return to_jsonb(r);
 end$$;

alter function public.inbound_ai_complete_invocation(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.inbound_ai_complete_invocation(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_complete_invocation(jsonb,jsonb) to otr_external_integration_inbound_gateway,otr_external_integration_recovery_gateway;

create function public.inbound_ai_reserve_review(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_review_decisions;
old public.inbound_ai_review_decisions;
reservation public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','row'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
if not public.cp14_keys(command->'row',array['review_decision_id','reservation_id','review_key','decision_sha256','package_version','package_sha256','review_version','candidate_id','candidate_sha256','base_revision','disposition','review_material_reference','review_material_sha256','confirmed_user_id','confirmed_at','confirmation_source','confirmation_scope','confirmation_id','slot_id','operation_key','intended_event_id','input_identity_map','preparation_sha256','state','row_revision','publication_fence','safe_result','result_sha256','created_at','updated_at'],array[]::text[]) then raise exception 'CP14_INVALID_ROW';
end if;
perform public.cp14_context(context,command,'inbound_ai_reserve_review',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
if context->>'principal_kind' is distinct from 'OTR_USER' then raise exception 'CP14_CONFIRMATION_REQUIRED';
end if;
r:=jsonb_populate_record(null::public.inbound_ai_review_decisions,command->'row');
select * into reservation from public.inbound_ai_import_reservations where reservation_id=r.reservation_id for update;
g:=public.cp14_inbound_target(context,command,'REVIEW',reservation);
select * into reservation from public.inbound_ai_import_reservations where reservation_id=r.reservation_id and integration_id=g.integration_id and account_id=g.account_id and client_identity_id=g.client_identity_id for update;
if not found or reservation.package_id<>(command->>'package_id')::uuid or r.confirmed_user_id<>g.user_id or r.package_sha256<>reservation.package_sha256 or r.review_version<>reservation.review_version or r.state<>'RESERVED' or r.safe_result is not null then raise exception 'CP14_REVIEW_SCOPE';
end if;
select * into old from public.inbound_ai_review_decisions where reservation_id=r.reservation_id and review_key=r.review_key;
if found then if old.decision_sha256<>r.decision_sha256 or (to_jsonb(old)-array['state','row_revision','publication_fence','safe_result','result_sha256','preparation_sha256','updated_at','confirmation_id','slot_id','operation_key','intended_event_id','input_identity_map'])<>(to_jsonb(r)-array['state','row_revision','publication_fence','safe_result','result_sha256','preparation_sha256','updated_at','confirmation_id','slot_id','operation_key','intended_event_id','input_identity_map']) then raise exception 'CP14_CHANGED_REVIEW';
end if;
return to_jsonb(old);
end if;
if exists(select 1 from public.inbound_ai_review_decisions where reservation_id=r.reservation_id and state='UNKNOWN') then raise exception 'CP14_REVIEW_UNKNOWN';
end if;
insert into public.inbound_ai_review_decisions select r.*;
return to_jsonb(r);
 end$$;

alter function public.inbound_ai_reserve_review(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.inbound_ai_reserve_review(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_reserve_review(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.inbound_ai_observe_review(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_review_decisions;
p public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','review_decision_id','expected_revision','publication_fence','state','preparation_sha256','result_sha256','safe_result'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'inbound_ai_observe_review',array['otr_external_integration_inbound_gateway','otr_external_integration_recovery_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
select * into r from public.inbound_ai_review_decisions where review_decision_id=(command->>'review_decision_id')::uuid for update;
select * into p from public.inbound_ai_import_reservations where reservation_id=r.reservation_id for update;
g:=public.cp14_inbound_target(context,command,'REVIEW',p);
select d.* into r from public.inbound_ai_review_decisions d join public.inbound_ai_import_reservations parent on parent.reservation_id=d.reservation_id where d.review_decision_id=(command->>'review_decision_id')::uuid and parent.account_id=g.account_id and parent.client_identity_id=g.client_identity_id and parent.integration_id=g.integration_id for update of d;
if not found then raise exception 'CP14_REVIEW_SCOPE';
end if;
if not public.cp14_safe_result(command->'safe_result') or command->'safe_result'->>'state' is distinct from command->>'state' or command->'safe_result'->>'review_decision_id' is distinct from r.review_decision_id::text then raise exception 'CP14_SAFE_REVIEW';end if;
if command->>'state'='PREPARED' then
 if r.disposition<>'ACCEPT' or not public.cp14_keys(command->'safe_result',array['version','state','review_decision_id','confirmation_id','slot_id','operation_key','event_id'],array['result_sha256','safe_reason']) or command->'safe_result'->>'confirmation_id' is distinct from r.confirmation_id::text or command->'safe_result'->>'slot_id' is distinct from r.slot_id::text or command->'safe_result'->>'operation_key' is distinct from r.operation_key::text or command->'safe_result'->>'event_id' is distinct from r.intended_event_id::text then raise exception 'CP14_SAFE_REVIEW';end if;
elsif not public.cp14_keys(command->'safe_result',array['version','state','review_decision_id'],array['safe_reason','result_sha256']) or command->>'state'='REJECTED' and r.disposition<>'REJECT' or command->>'state'='DEFERRED' and r.disposition<>'DEFER' then raise exception 'CP14_SAFE_REVIEW';end if;
if r.safe_result is not null then if r.result_sha256<>command->>'result_sha256' or r.safe_result<>command->'safe_result' then raise exception 'CP14_SEALED_RESULT';
end if;
return to_jsonb(r);
end if;
if r.row_revision<>(command->>'expected_revision')::bigint or r.publication_fence<>(command->>'publication_fence')::bigint or r.state='UNKNOWN' and session_user<>'otr_external_integration_recovery_gateway' or command->>'state' not in ('UNKNOWN','PREPARED','REJECTED','DEFERRED') or not public.cp14_safe_result(command->'safe_result') or command->>'result_sha256' is distinct from public.cp14_hash(jsonb_build_object('domain','otr-cp14-safe-review-result-v1','result',command->'safe_result')) then raise exception 'CP14_REVIEW_CAS';
end if;
update public.inbound_ai_review_decisions set state=command->>'state',preparation_sha256=command->>'preparation_sha256',safe_result=case when command->>'state'='UNKNOWN' then null else command->'safe_result' end,result_sha256=case when command->>'state'='UNKNOWN' then null else command->>'result_sha256' end,row_revision=row_revision+1,updated_at=clock_timestamp() where review_decision_id=r.review_decision_id returning * into r;
return to_jsonb(r);
 end$$;

alter function public.inbound_ai_observe_review(jsonb,jsonb) owner to otr_external_integration_inbound_writer;

revoke all on function public.inbound_ai_observe_review(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_observe_review(jsonb,jsonb) to otr_external_integration_inbound_gateway,otr_external_integration_recovery_gateway;

create function public.inbound_ai_status(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare g public.external_client_grants;
r public.inbound_ai_import_reservations;
 begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','account_id','client_identity_id','integration_id','grant_id','grant_revision','trip_id','package_id','reservation_id'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'inbound_ai_status',array['otr_external_integration_inbound_gateway'],null);
perform public.cp14_scope_lock(command->>'environment',command->>'integration_id');
select * into r from public.inbound_ai_import_reservations where reservation_id=(command->>'reservation_id')::uuid;
g:=public.cp14_inbound_target(context,command,'STATUS',r);
select * into r from public.inbound_ai_import_reservations where reservation_id=(command->>'reservation_id')::uuid and integration_id=g.integration_id and client_identity_id=g.client_identity_id and account_id=g.account_id and package_id=(command->>'package_id')::uuid;
if not found then raise exception 'CP14_STATUS_FORBIDDEN';
end if;
return jsonb_build_object('version',1,'state',r.state,'reservation_id',r.reservation_id,'result_version',r.result_version,'result_sha256',r.result_sha256);
 end$$;

alter function public.inbound_ai_status(jsonb,jsonb) owner to otr_external_integration_reader;

revoke all on function public.inbound_ai_status(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.inbound_ai_status(jsonb,jsonb) to otr_external_integration_inbound_gateway;

create function public.cp14_measurement_value(e public.external_integration_usage_events, unit text) returns text language sql immutable security invoker set search_path=pg_catalog as $$
 select case when left(unit,12)='other_units.' then e.other_units->>substr(unit,13) when left(unit,19)='provider_extension.' then e.provider_extension->>substr(unit,20) else to_jsonb(e)->>unit end
$$;
revoke all on function public.cp14_measurement_value(public.external_integration_usage_events,text) from public,anon,authenticated,service_role,authenticator;
grant execute on function public.cp14_measurement_value(public.external_integration_usage_events,text) to otr_external_integration_reader,otr_external_integration_meter_writer;
create function public.cp14_usage_projection(call uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare unit text;
mode text;
quantity numeric;
quality text;
result jsonb:='{}';
cost public.external_integration_usage_events;

begin
 foreach unit in array array['input_tokens','output_tokens','total_tokens','cached_input_tokens','reasoning_tokens','image_units','audio_units','call_count','bytes','wall_ms','cpu_ms','gpu_ms','accelerator_ms'] || array(select distinct 'other_units.'||key from public.external_integration_usage_events e cross join lateral jsonb_object_keys(e.other_units) key where e.call_id=call) || array(select distinct 'provider_extension.'||key from public.external_integration_usage_events e cross join lateral jsonb_object_keys(e.provider_extension) key where e.call_id=call) loop
  select e.measurement_mode into mode from public.external_integration_usage_events e where e.call_id=call and public.cp14_measurement_value(e,unit) is not null and not exists(select 1 from public.external_integration_usage_events correction where correction.supersedes_observation_id=e.observation_id) order by (coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality)='ACTUAL_REPORTED') desc,e.received_at desc,e.observation_id desc limit 1;

  quantity:=null;
quality:='UNKNOWN';

  if mode='DELTA' then
   select sum((public.cp14_measurement_value(e,unit))::numeric),case when bool_and(coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality)='ACTUAL_REPORTED') then 'ACTUAL_REPORTED' else 'ESTIMATED' end into quantity,quality from public.external_integration_usage_events e where e.call_id=call and e.measurement_mode='DELTA' and public.cp14_measurement_value(e,unit) is not null and coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality)<>'UNKNOWN' and not exists(select 1 from public.external_integration_usage_events correction where correction.supersedes_observation_id=e.observation_id);

  elsif mode='CUMULATIVE' then
   select (public.cp14_measurement_value(e,unit))::numeric,coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality) into quantity,quality from public.external_integration_usage_events e where e.call_id=call and e.measurement_mode='CUMULATIVE' and public.cp14_measurement_value(e,unit) is not null and not exists(select 1 from public.external_integration_usage_events correction where correction.supersedes_observation_id=e.observation_id) order by (coalesce(e.unit_quality->>unit,e.unit_quality->>case when left(unit,12)='other_units.' then substr(unit,13) when left(unit,19)='provider_extension.' then substr(unit,20) else unit end,e.usage_quality)='ACTUAL_REPORTED') desc,e.received_at desc,e.observation_id desc limit 1;

  end if;

  if quantity is null or quality='UNKNOWN' then quantity:=null;
quality:='UNKNOWN';
end if;

  result:=result||jsonb_build_object(unit,jsonb_build_object('quantity',quantity,'quality',quality));

 end loop;

 select e.* into cost from public.external_integration_usage_events e where e.call_id=call and e.cost_quality<>'UNKNOWN' and not exists(select 1 from public.external_integration_usage_events correction where correction.supersedes_observation_id=e.observation_id) order by (e.cost_quality='ACTUAL_REPORTED') desc,e.received_at desc,e.observation_id desc limit 1;

 return jsonb_build_object('units',result,'cost_nanos',cost.cost_nanos::text,'currency',cost.currency,'cost_quality',coalesce(cost.cost_quality,'UNKNOWN'));

end$$;

revoke all on function public.cp14_usage_projection(uuid) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_usage_projection(uuid) to otr_external_integration_reader,otr_external_integration_meter_writer;

create function public.external_integration_admin_report(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare  begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_integration_admin_report',array['otr_external_integration_reporting_gateway'],'COST_READER');
return jsonb_build_object('currencies',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select p->>'currency' as currency,p->>'cost_quality' as cost_quality,sum((p->>'cost_nanos')::numeric)::text as cost_nanos,count(*) as calls from public.external_integration_calls c cross join lateral public.cp14_usage_projection(c.call_id) p where c.environment=command->>'environment' and c.integration_id=command->>'integration_id' group by p->>'currency',p->>'cost_quality') x),'usage',(select coalesce(jsonb_agg(jsonb_build_object('call_id',c.call_id,'projection',public.cp14_usage_projection(c.call_id))),'[]') from public.external_integration_calls c where c.environment=command->>'environment' and c.integration_id=command->>'integration_id'));
 end$$;

alter function public.external_integration_admin_report(jsonb,jsonb) owner to otr_external_integration_reader;

revoke all on function public.external_integration_admin_report(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_admin_report(jsonb,jsonb) to otr_external_integration_reporting_gateway;

create function public.external_integration_recover_exact(context jsonb, command jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare  begin if not public.cp14_keys(command,array['version','environment','request_id','request_sha256','actor_id','integration_id','call_id','reservation_id'],array[]::text[]) or command->>'version'<>'1' then raise exception 'CP14_INVALID_COMMAND';
end if;
perform public.cp14_context(context,command,'external_integration_recover_exact',array['otr_external_integration_recovery_gateway'],'SUPPORT_RECOVERY');
return jsonb_build_object('call',(select jsonb_build_object('call_id',c.call_id,'dispatch_state',c.dispatch_state,'execution_certainty',c.execution_certainty,'row_revision',c.row_revision,'publication_fence',c.publication_fence) from public.external_integration_calls c where c.call_id=(command->>'call_id')::uuid and c.integration_id=command->>'integration_id' and c.environment=command->>'environment' and c.account_id=(context->>'verified_account_id')::uuid),'reservation',(select jsonb_build_object('reservation_id',r.reservation_id,'state',r.state,'row_revision',r.row_revision,'result_sha256',r.result_sha256) from public.inbound_ai_import_reservations r join public.external_integrations i using(integration_id) where r.reservation_id=(command->>'reservation_id')::uuid and r.integration_id=command->>'integration_id' and i.environment=command->>'environment' and r.account_id=(context->>'verified_account_id')::uuid));
 end$$;

alter function public.external_integration_recover_exact(jsonb,jsonb) owner to otr_external_integration_reader;

revoke all on function public.external_integration_recover_exact(jsonb,jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.external_integration_recover_exact(jsonb,jsonb) to otr_external_integration_recovery_gateway;

create function public.cp14_relation_integrity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare c public.external_integration_calls;
parent public.external_integration_calls;
v public.inbound_ai_invocations;
p public.inbound_ai_import_reservations;
e public.external_integration_usage_events;

begin
 if tg_table_name='external_integration_calls' then
  c:=new;

  if c.provider_config_id is not null and not exists(select 1 from public.intelligence_provider_configs config where config.provider_config_id=c.provider_config_id and config.integration_id=c.integration_id and config.provider_id=c.provider_id and config.model_id=c.model_id and config.model_version=c.model_version and config.adapter_version=c.adapter_version) then raise exception 'CP14_PROVIDER_PIN';
end if;

  if c.shadow then
   select * into parent from public.external_integration_calls where call_id=c.shadow_of_call_id;

   if not found or parent.account_id is distinct from c.account_id or parent.task_id is distinct from c.task_id or parent.fallback_chain_id is distinct from c.fallback_chain_id or parent.attempt_sequence>=c.attempt_sequence then raise exception 'CP14_SHADOW_SCOPE';
end if;

  end if;

  if c.invocation_id is not null then select * into v from public.inbound_ai_invocations where invocation_id=c.invocation_id;

   if not found or v.call_id<>c.call_id or v.account_id is distinct from c.account_id or v.user_id is distinct from c.user_id or v.integration_id<>c.integration_id or v.request_id<>c.request_id then raise exception 'CP14_INVOCATION_CALL_SCOPE';
end if;

  end if;

 elsif tg_table_name='inbound_ai_invocations' then
  v:=new;
select * into c from public.external_integration_calls where call_id=v.call_id;

  if not found or c.invocation_id is distinct from v.invocation_id or c.integration_id<>v.integration_id or c.account_id is distinct from v.account_id or c.user_id is distinct from v.user_id or c.request_id<>v.request_id then raise exception 'CP14_INVOCATION_CALL_SCOPE';
end if;

  select * into p from public.inbound_ai_import_reservations where reservation_id=v.reservation_id;

  if not found or p.integration_id<>v.integration_id or p.account_id<>v.account_id or p.client_identity_id<>v.client_identity_id then raise exception 'CP14_INVOCATION_RESERVATION_SCOPE';
end if;

 elsif tg_table_name='external_integration_usage_events' then
  e:=new;
select * into c from public.external_integration_calls where call_id=e.call_id;

  if e.price_schedule_id is distinct from c.price_schedule_id then raise exception 'CP14_USAGE_PIN';
end if;

  if c.call_kind='INBOUND_TOOL' and (e.input_tokens is not null or e.output_tokens is not null or e.total_tokens is not null or e.cached_input_tokens is not null or e.reasoning_tokens is not null) then raise exception 'CP14_INBOUND_TOKEN_ATTRIBUTION';
end if;

  if e.supersedes_observation_id is not null and not exists(select 1 from public.external_integration_usage_events previous where previous.observation_id=e.supersedes_observation_id and previous.call_id=e.call_id and previous.received_at<=e.received_at) then raise exception 'CP14_INVALID_CORRECTION';
end if;

 elsif tg_table_name='external_integration_price_schedule_units' then
  if new.unit_definition->>'relationship'='INCLUDED' and not exists(select 1 from public.external_integration_price_schedule_units included_parent where included_parent.price_schedule_id=new.price_schedule_id and included_parent.unit_key=new.unit_definition->>'included_in' and included_parent.unit_key<>new.unit_key and included_parent.unit_definition->>'relationship'='DISJOINT') then raise exception 'CP14_PRICE_INCLUDED_UNIT';
end if;

 elsif tg_table_name='inbound_ai_review_decisions' then
  select * into p from public.inbound_ai_import_reservations where reservation_id=new.reservation_id;

  if new.confirmed_user_id<>p.user_id or new.package_sha256<>p.package_sha256 or new.package_version<>p.package_version then raise exception 'CP14_REVIEW_PACKAGE_SCOPE';
end if;

 end if;

 return null;

end$$;

alter function public.cp14_relation_integrity() owner to otr_external_integration_reader;

revoke all on function public.cp14_relation_integrity() from public,anon,authenticated,service_role,authenticator;

create constraint trigger cp14_relation_integrity after insert or update on public.external_integration_calls deferrable initially deferred for each row execute function public.cp14_relation_integrity();

create constraint trigger cp14_relation_integrity after insert or update on public.inbound_ai_invocations deferrable initially deferred for each row execute function public.cp14_relation_integrity();

create constraint trigger cp14_relation_integrity after insert or update on public.external_integration_usage_events deferrable initially deferred for each row execute function public.cp14_relation_integrity();

create constraint trigger cp14_relation_integrity after insert or update on public.external_integration_price_schedule_units deferrable initially deferred for each row execute function public.cp14_relation_integrity();

create constraint trigger cp14_relation_integrity after insert or update on public.inbound_ai_review_decisions deferrable initially deferred for each row execute function public.cp14_relation_integrity();

create function public.cp14_labels(labels text[]) returns boolean language sql immutable security invoker set search_path=pg_catalog as $$ select labels is not null and cardinality(labels)<=32 and cardinality(labels)=(select count(distinct v) from unnest(labels) v) and not exists(select 1 from unnest(labels) v where v is null or v !~ '^[A-Za-z0-9._:-]{1,128}$') $$;

create function public.cp14_numeric_map(j jsonb) returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$begin if jsonb_typeof(j) is distinct from 'object' then return false;
end if;
return (select count(*) from jsonb_each(j))<=16 and not exists(select 1 from jsonb_each(j) e where e.key !~ '^[A-Za-z0-9._:-]{1,128}$' or jsonb_typeof(e.value) is distinct from 'number' or e.value::text !~ '^[0-9]{1,16}$' or (e.value::text)::numeric>9007199254740991);
end$$;

create function public.cp14_reference_map(j jsonb) returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$begin if jsonb_typeof(j) is distinct from 'object' then return false;
end if;
return (select count(*) from jsonb_each(j))<=64 and not exists(select 1 from jsonb_each(j) e where e.key !~ '^[A-Za-z0-9._:-]{1,128}$' or jsonb_typeof(e.value) is distinct from 'string' or e.value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
end$$;

create function public.cp14_publication_refs(j jsonb) returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$declare ref jsonb;
begin
 if jsonb_typeof(j) is distinct from 'array' or jsonb_array_length(j)>128 then return false;
end if;

 for ref in select value from jsonb_array_elements(j) loop
  if ref->>'kind'='RUN' then
   if not public.cp14_keys(ref,array['kind','run_id','generation','input_sha256','candidate_id','candidate_sha256'],array[]::text[]) or ref->>'generation' !~ '^[1-9][0-9]{0,15}$' or (ref->>'generation')::numeric>9007199254740991 or ref->>'input_sha256' !~ '^[0-9a-f]{64}$' or ref->>'run_id' is null or ref->>'candidate_sha256' is not null and ref->>'candidate_sha256' !~ '^[0-9a-f]{64}$' or (ref->>'candidate_id' is null)<>(ref->>'candidate_sha256' is null) then return false;
end if;

  elsif ref->>'kind'='CONFIRMATION' then
   if not public.cp14_keys(ref,array['kind','confirmation_id','slot_id','operation_key','event_id'],array[]::text[]) then return false;
end if;

  else return false;
end if;

  if exists(select 1 from jsonb_each(ref) e where e.key like '%_id' or e.key='operation_key' having bool_or(e.value<>'null'::jsonb and (jsonb_typeof(e.value) is distinct from 'string' or e.value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))) then return false;
end if;

 end loop;

 return (select count(*) from jsonb_array_elements(j) e where e->>'kind'='RUN')<=64 and (select count(*) from jsonb_array_elements(j) e where e->>'kind'='CONFIRMATION')<=64;

end$$;

revoke all on function public.cp14_labels(text[]) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_labels(text[]) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

revoke all on function public.cp14_numeric_map(jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_numeric_map(jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

revoke all on function public.cp14_reference_map(jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_reference_map(jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

revoke all on function public.cp14_publication_refs(jsonb) from public,anon,authenticated,service_role,authenticator;

grant execute on function public.cp14_publication_refs(jsonb) to otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

alter table public.external_integrations add check(public.cp14_labels(capabilities));

alter table public.intelligence_provider_configs add check(public.cp14_labels(capabilities) and public.cp14_labels(modalities));

alter table public.external_client_grants add check(public.cp14_labels(actions));

alter table public.external_integration_usage_events add check(public.cp14_numeric_map(other_units) and public.cp14_numeric_map(provider_extension));

alter table public.inbound_ai_import_reservations add check(public.cp14_publication_refs(publication_refs));

alter table public.inbound_ai_import_reservations add check(safe_result is null or public.cp14_safe_result(safe_result));

alter table public.inbound_ai_invocations add check(safe_response is null or public.cp14_safe_result(safe_response));

alter table public.inbound_ai_review_decisions add check(public.cp14_reference_map(input_identity_map));

alter table public.inbound_ai_review_decisions add check(safe_result is null or public.cp14_safe_result(safe_result));

alter table public.external_integration_usage_events add check(observation_kind<>'START' or (status='STARTED' and usage_quality='UNKNOWN' and cost_quality='UNKNOWN' and unit_quality='{}'));

alter table public.external_integration_usage_events add check(measurement_mode<>'NONE' or (input_tokens is null and output_tokens is null and total_tokens is null and cached_input_tokens is null and reasoning_tokens is null and image_units is null and audio_units is null and call_count is null and bytes is null and wall_ms is null and cpu_ms is null and gpu_ms is null and accelerator_ms is null and other_units='{}'::jsonb and provider_extension='{}'::jsonb));
revoke create on schema public from otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader;

revoke otr_external_integration_config_writer,otr_external_integration_meter_writer,otr_external_integration_inbound_writer,otr_external_integration_reader from postgres;

commit;

