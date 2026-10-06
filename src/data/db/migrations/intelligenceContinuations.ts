import type { Migration } from "../migrations";
export const intelligenceContinuationsMigration: Migration = {
  id: 50,
  name: "intelligence_continuations",
  sql: `
CREATE UNIQUE INDEX intelligence_queue_scope ON sync_operations(owner_user_id,id);
CREATE TABLE intelligence_continuations (
account_id TEXT NOT NULL CHECK(account_id IS NULL OR (length(account_id)=36 AND account_id NOT GLOB '*[^a-f0-9-]*' AND substr(account_id,9,1)='-' AND substr(account_id,14,1)='-' AND substr(account_id,19,1)='-' AND substr(account_id,24,1)='-')),
task_id TEXT NOT NULL CHECK(task_id IS NULL OR (length(task_id)=36 AND task_id NOT GLOB '*[^a-f0-9-]*' AND substr(task_id,9,1)='-' AND substr(task_id,14,1)='-' AND substr(task_id,19,1)='-' AND substr(task_id,24,1)='-')),
format_version BLOB NOT NULL DEFAULT 1 CHECK(format_version IS NULL OR (typeof(format_version)='integer' AND format_version BETWEEN 1 AND 9007199254740991)),
import_id TEXT NOT NULL CHECK(import_id IS NULL OR (length(import_id)=36 AND import_id NOT GLOB '*[^a-f0-9-]*' AND substr(import_id,9,1)='-' AND substr(import_id,14,1)='-' AND substr(import_id,19,1)='-' AND substr(import_id,24,1)='-')),
manifest_version BLOB NOT NULL CHECK(manifest_version IS NULL OR (typeof(manifest_version)='integer' AND manifest_version BETWEEN 1 AND 9007199254740991)),
manifest_sha256 TEXT NOT NULL CHECK(manifest_sha256 IS NULL OR (length(manifest_sha256)=64 AND manifest_sha256 NOT GLOB '*[^a-f0-9]*')),
trip_id TEXT CHECK(trip_id IS NULL OR (length(trip_id)=36 AND trip_id NOT GLOB '*[^a-f0-9-]*' AND substr(trip_id,9,1)='-' AND substr(trip_id,14,1)='-' AND substr(trip_id,19,1)='-' AND substr(trip_id,24,1)='-')),
stage TEXT NOT NULL CHECK(stage IS NULL OR (length(stage) BETWEEN 1 AND 128 AND stage NOT GLOB '*[^A-Za-z0-9._:-]*')),
logical_request_id TEXT NOT NULL CHECK(logical_request_id IS NULL OR (length(logical_request_id)=36 AND logical_request_id NOT GLOB '*[^a-f0-9-]*' AND substr(logical_request_id,9,1)='-' AND substr(logical_request_id,14,1)='-' AND substr(logical_request_id,19,1)='-' AND substr(logical_request_id,24,1)='-')),
logical_idempotency_key TEXT NOT NULL CHECK(logical_idempotency_key IS NULL OR (length(logical_idempotency_key)=36 AND logical_idempotency_key NOT GLOB '*[^a-f0-9-]*' AND substr(logical_idempotency_key,9,1)='-' AND substr(logical_idempotency_key,14,1)='-' AND substr(logical_idempotency_key,19,1)='-' AND substr(logical_idempotency_key,24,1)='-')),
input_pins TEXT NOT NULL CHECK(input_pins IS NULL OR (json_valid(input_pins) AND length(CAST(input_pins AS BLOB))<=65536)),
input_sha256 TEXT NOT NULL CHECK(input_sha256 IS NULL OR (length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^a-f0-9]*')),
consumer_id TEXT NOT NULL CHECK(consumer_id IS NULL OR (length(consumer_id) BETWEEN 1 AND 128 AND consumer_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
schema_id TEXT NOT NULL CHECK(schema_id IS NULL OR (length(schema_id) BETWEEN 1 AND 128 AND schema_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
schema_dialect TEXT NOT NULL CHECK(schema_dialect IS NULL OR (length(schema_dialect) BETWEEN 1 AND 128 AND schema_dialect NOT GLOB '*[^A-Za-z0-9._:-]*')),
consumer_version BLOB NOT NULL CHECK(consumer_version IS NULL OR (typeof(consumer_version)='integer' AND consumer_version BETWEEN 1 AND 9007199254740991)),
schema_version BLOB NOT NULL CHECK(schema_version IS NULL OR (typeof(schema_version)='integer' AND schema_version BETWEEN 1 AND 9007199254740991)),
schema_sha256 TEXT NOT NULL CHECK(schema_sha256 IS NULL OR (length(schema_sha256)=64 AND schema_sha256 NOT GLOB '*[^a-f0-9]*')),
capability_requirements TEXT NOT NULL CHECK(capability_requirements IS NULL OR (json_valid(capability_requirements) AND length(CAST(capability_requirements AS BLOB))<=16384)),
policy_snapshot TEXT NOT NULL CHECK(policy_snapshot IS NULL OR (json_valid(policy_snapshot) AND length(CAST(policy_snapshot AS BLOB))<=65536)),
policy_sha256 TEXT NOT NULL CHECK(policy_sha256 IS NULL OR (length(policy_sha256)=64 AND policy_sha256 NOT GLOB '*[^a-f0-9]*')),
run_id TEXT CHECK(run_id IS NULL OR (length(run_id)=36 AND run_id NOT GLOB '*[^a-f0-9-]*' AND substr(run_id,9,1)='-' AND substr(run_id,14,1)='-' AND substr(run_id,19,1)='-' AND substr(run_id,24,1)='-')),
expected_run_generation BLOB CHECK(expected_run_generation IS NULL OR (typeof(expected_run_generation)='integer' AND expected_run_generation BETWEEN 1 AND 9007199254740991)),
candidate_id TEXT CHECK(candidate_id IS NULL OR (length(candidate_id)=36 AND candidate_id NOT GLOB '*[^a-f0-9-]*' AND substr(candidate_id,9,1)='-' AND substr(candidate_id,14,1)='-' AND substr(candidate_id,19,1)='-' AND substr(candidate_id,24,1)='-')),
expected_candidate_sha256 TEXT CHECK(expected_candidate_sha256 IS NULL OR (length(expected_candidate_sha256)=64 AND expected_candidate_sha256 NOT GLOB '*[^a-f0-9]*')),
event_id TEXT CHECK(event_id IS NULL OR (length(event_id)=36 AND event_id NOT GLOB '*[^a-f0-9-]*' AND substr(event_id,9,1)='-' AND substr(event_id,14,1)='-' AND substr(event_id,19,1)='-' AND substr(event_id,24,1)='-')),
expected_event_revision BLOB CHECK(expected_event_revision IS NULL OR (typeof(expected_event_revision)='integer' AND expected_event_revision BETWEEN 1 AND 9007199254740991)),
created_at TEXT NOT NULL CHECK(created_at IS NULL OR (length(created_at) BETWEEN 20 AND 27 AND created_at GLOB '????-??-??T??:??:??*Z')),
creation_clock TEXT NOT NULL CHECK(creation_clock IS NULL OR (length(creation_clock) BETWEEN 1 AND 128 AND creation_clock NOT GLOB '*[^A-Za-z0-9._:-]*')),
row_revision BLOB NOT NULL DEFAULT 1 CHECK(row_revision IS NULL OR (typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991)),
publication_fence BLOB NOT NULL DEFAULT 1 CHECK(publication_fence IS NULL OR (typeof(publication_fence)='integer' AND publication_fence BETWEEN 1 AND 9007199254740991)),
current_pass_complete INTEGER NOT NULL DEFAULT 0 CHECK(current_pass_complete IS NULL OR (typeof(current_pass_complete)='integer' AND current_pass_complete IN (0,1))),
work_disposition TEXT NOT NULL DEFAULT 'PENDING' CHECK(work_disposition IS NULL OR (length(work_disposition) BETWEEN 1 AND 128 AND work_disposition NOT GLOB '*[^A-Za-z0-9._:-]*')),
wait_reason TEXT CHECK(wait_reason IS NULL OR (length(wait_reason) BETWEEN 1 AND 128 AND wait_reason NOT GLOB '*[^A-Za-z0-9._:-]*')),
wait_reasons TEXT NOT NULL CHECK(wait_reasons IS NULL OR (json_valid(wait_reasons) AND length(CAST(wait_reasons AS BLOB))<=16384)),
sync_operation_id TEXT CHECK(sync_operation_id IS NULL OR (length(sync_operation_id) BETWEEN 1 AND 128 AND sync_operation_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
dependencies TEXT NOT NULL CHECK(dependencies IS NULL OR (json_valid(dependencies) AND length(CAST(dependencies AS BLOB))<=16384)),
current_attempt_id TEXT CHECK(current_attempt_id IS NULL OR (length(current_attempt_id)=36 AND current_attempt_id NOT GLOB '*[^a-f0-9-]*' AND substr(current_attempt_id,9,1)='-' AND substr(current_attempt_id,14,1)='-' AND substr(current_attempt_id,19,1)='-' AND substr(current_attempt_id,24,1)='-')),
cancellation_disposition TEXT NOT NULL DEFAULT 'NONE' CHECK(cancellation_disposition IS NULL OR (length(cancellation_disposition) BETWEEN 1 AND 128 AND cancellation_disposition NOT GLOB '*[^A-Za-z0-9._:-]*')),
safe_reason TEXT CHECK(safe_reason IS NULL OR (length(safe_reason) BETWEEN 1 AND 128 AND safe_reason NOT GLOB '*[^A-Za-z0-9._:-]*')),
publication_id TEXT CHECK(publication_id IS NULL OR (length(publication_id)=36 AND publication_id NOT GLOB '*[^a-f0-9-]*' AND substr(publication_id,9,1)='-' AND substr(publication_id,14,1)='-' AND substr(publication_id,19,1)='-' AND substr(publication_id,24,1)='-')),
publication_sha256 TEXT CHECK(publication_sha256 IS NULL OR (length(publication_sha256)=64 AND publication_sha256 NOT GLOB '*[^a-f0-9]*')),
result_sha256 TEXT CHECK(result_sha256 IS NULL OR (length(result_sha256)=64 AND result_sha256 NOT GLOB '*[^a-f0-9]*')),
updated_at TEXT NOT NULL CHECK(updated_at IS NULL OR (length(updated_at) BETWEEN 20 AND 27 AND updated_at GLOB '????-??-??T??:??:??*Z')),
update_clock TEXT NOT NULL CHECK(update_clock IS NULL OR (length(update_clock) BETWEEN 1 AND 128 AND update_clock NOT GLOB '*[^A-Za-z0-9._:-]*')),
completed_at TEXT CHECK(completed_at IS NULL OR (length(completed_at) BETWEEN 20 AND 27 AND completed_at GLOB '????-??-??T??:??:??*Z')),
PRIMARY KEY(account_id,task_id),
CHECK(format_version=1),
FOREIGN KEY(account_id,sync_operation_id) REFERENCES sync_operations(owner_user_id,id) ON DELETE RESTRICT,
CHECK(creation_clock IN ('CALLER_OBSERVED','DEVICE_WALL','SERVER_OBSERVED')),
CHECK(update_clock IN ('CALLER_OBSERVED','DEVICE_WALL','SERVER_OBSERVED')),
UNIQUE(account_id,logical_request_id),
UNIQUE(account_id,logical_idempotency_key),
FOREIGN KEY(account_id,run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT,
FOREIGN KEY(account_id,candidate_id) REFERENCES trip_source_candidates(cache_account_id,id) ON DELETE RESTRICT,
FOREIGN KEY(account_id,task_id,current_attempt_id) REFERENCES intelligence_continuation_attempts(account_id,task_id,attempt_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
CHECK(stage IN ('EXTRACTION','INTERPRETATION','ENRICHMENT','CLOSURE')),
CHECK(work_disposition IN ('PENDING','WAITING','RUNNING','RESULT_PENDING','PUBLISHED','FAILED','CANCELED','STALE','UNKNOWN')),
CHECK(cancellation_disposition IN ('NONE','REQUESTED','FENCED')),
CHECK(wait_reason IN ('WAITING_FOR_NETWORK','WAITING_FOR_REMOTE_INTELLIGENCE','WAITING_FOR_ENRICHMENT','WAITING_FOR_AUTH','POLICY_BLOCKED')),
CHECK(work_disposition<>'WAITING' OR (wait_reason IS NOT NULL AND json_array_length(wait_reasons)>0)),
CHECK(work_disposition<>'PUBLISHED' OR (publication_id IS NOT NULL AND publication_sha256 IS NOT NULL AND result_sha256 IS NOT NULL)),
CHECK((run_id IS NULL)=(expected_run_generation IS NULL)),
CHECK((candidate_id IS NULL)=(expected_candidate_sha256 IS NULL)),
CHECK(candidate_id IS NULL OR run_id IS NOT NULL),
CHECK((event_id IS NULL)=(expected_event_revision IS NULL))
);
CREATE TRIGGER intelligence_continuations_immutable BEFORE UPDATE ON intelligence_continuations WHEN NEW.account_id IS NOT OLD.account_id OR NEW.task_id IS NOT OLD.task_id OR NEW.format_version IS NOT OLD.format_version OR NEW.import_id IS NOT OLD.import_id OR NEW.manifest_version IS NOT OLD.manifest_version OR NEW.manifest_sha256 IS NOT OLD.manifest_sha256 OR NEW.trip_id IS NOT OLD.trip_id OR NEW.stage IS NOT OLD.stage OR NEW.logical_request_id IS NOT OLD.logical_request_id OR NEW.logical_idempotency_key IS NOT OLD.logical_idempotency_key OR NEW.input_pins IS NOT OLD.input_pins OR NEW.input_sha256 IS NOT OLD.input_sha256 OR NEW.consumer_id IS NOT OLD.consumer_id OR NEW.schema_id IS NOT OLD.schema_id OR NEW.schema_dialect IS NOT OLD.schema_dialect OR NEW.consumer_version IS NOT OLD.consumer_version OR NEW.schema_version IS NOT OLD.schema_version OR NEW.schema_sha256 IS NOT OLD.schema_sha256 OR NEW.capability_requirements IS NOT OLD.capability_requirements OR NEW.policy_snapshot IS NOT OLD.policy_snapshot OR NEW.policy_sha256 IS NOT OLD.policy_sha256 OR NEW.run_id IS NOT OLD.run_id OR NEW.expected_run_generation IS NOT OLD.expected_run_generation OR NEW.candidate_id IS NOT OLD.candidate_id OR NEW.expected_candidate_sha256 IS NOT OLD.expected_candidate_sha256 OR NEW.event_id IS NOT OLD.event_id OR NEW.expected_event_revision IS NOT OLD.expected_event_revision OR NEW.created_at IS NOT OLD.created_at OR NEW.creation_clock IS NOT OLD.creation_clock OR NEW.row_revision<>OLD.row_revision+1 BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_IMMUTABLE_CAS');END;
CREATE TRIGGER intelligence_continuations_retain BEFORE DELETE ON intelligence_continuations BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_RESPONSIBILITY_RETAINED');END;
CREATE INDEX intelligence_continuations_4 ON intelligence_continuations(account_id,import_id,manifest_version);
CREATE INDEX intelligence_continuations_5 ON intelligence_continuations(account_id,trip_id);
CREATE INDEX intelligence_continuations_6 ON intelligence_continuations(account_id,sync_operation_id);
CREATE INDEX intelligence_continuations_7 ON intelligence_continuations(account_id,current_attempt_id);
CREATE TABLE intelligence_continuation_attempts (
account_id TEXT NOT NULL CHECK(account_id IS NULL OR (length(account_id)=36 AND account_id NOT GLOB '*[^a-f0-9-]*' AND substr(account_id,9,1)='-' AND substr(account_id,14,1)='-' AND substr(account_id,19,1)='-' AND substr(account_id,24,1)='-')),
attempt_id TEXT NOT NULL CHECK(attempt_id IS NULL OR (length(attempt_id)=36 AND attempt_id NOT GLOB '*[^a-f0-9-]*' AND substr(attempt_id,9,1)='-' AND substr(attempt_id,14,1)='-' AND substr(attempt_id,19,1)='-' AND substr(attempt_id,24,1)='-')),
task_id TEXT NOT NULL CHECK(task_id IS NULL OR (length(task_id)=36 AND task_id NOT GLOB '*[^a-f0-9-]*' AND substr(task_id,9,1)='-' AND substr(task_id,14,1)='-' AND substr(task_id,19,1)='-' AND substr(task_id,24,1)='-')),
attempt_sequence BLOB NOT NULL CHECK(attempt_sequence IS NULL OR (typeof(attempt_sequence)='integer' AND attempt_sequence BETWEEN 1 AND 9007199254740991)),
format_version BLOB NOT NULL DEFAULT 1 CHECK(format_version IS NULL OR (typeof(format_version)='integer' AND format_version BETWEEN 1 AND 9007199254740991)),
request_id TEXT NOT NULL CHECK(request_id IS NULL OR (length(request_id)=36 AND request_id NOT GLOB '*[^a-f0-9-]*' AND substr(request_id,9,1)='-' AND substr(request_id,14,1)='-' AND substr(request_id,19,1)='-' AND substr(request_id,24,1)='-')),
idempotency_key TEXT NOT NULL CHECK(idempotency_key IS NULL OR (length(idempotency_key)=36 AND idempotency_key NOT GLOB '*[^a-f0-9-]*' AND substr(idempotency_key,9,1)='-' AND substr(idempotency_key,14,1)='-' AND substr(idempotency_key,19,1)='-' AND substr(idempotency_key,24,1)='-')),
request_sha256 TEXT NOT NULL CHECK(request_sha256 IS NULL OR (length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^a-f0-9]*')),
request_material_reference TEXT CHECK(request_material_reference IS NULL OR (length(request_material_reference)=36 AND request_material_reference NOT GLOB '*[^a-f0-9-]*' AND substr(request_material_reference,9,1)='-' AND substr(request_material_reference,14,1)='-' AND substr(request_material_reference,19,1)='-' AND substr(request_material_reference,24,1)='-')),
request_material_sha256 TEXT CHECK(request_material_sha256 IS NULL OR (length(request_material_sha256)=64 AND request_material_sha256 NOT GLOB '*[^a-f0-9]*')),
predecessor_attempt_id TEXT CHECK(predecessor_attempt_id IS NULL OR (length(predecessor_attempt_id)=36 AND predecessor_attempt_id NOT GLOB '*[^a-f0-9-]*' AND substr(predecessor_attempt_id,9,1)='-' AND substr(predecessor_attempt_id,14,1)='-' AND substr(predecessor_attempt_id,19,1)='-' AND substr(predecessor_attempt_id,24,1)='-')),
predecessor_request_id TEXT CHECK(predecessor_request_id IS NULL OR (length(predecessor_request_id)=36 AND predecessor_request_id NOT GLOB '*[^a-f0-9-]*' AND substr(predecessor_request_id,9,1)='-' AND substr(predecessor_request_id,14,1)='-' AND substr(predecessor_request_id,19,1)='-' AND substr(predecessor_request_id,24,1)='-')),
integration_id TEXT CHECK(integration_id IS NULL OR (length(integration_id) BETWEEN 1 AND 128 AND integration_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
provider_id TEXT CHECK(provider_id IS NULL OR (length(provider_id) BETWEEN 1 AND 128 AND provider_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
model_id TEXT CHECK(model_id IS NULL OR (length(model_id) BETWEEN 1 AND 128 AND model_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
model_version TEXT CHECK(model_version IS NULL OR (length(model_version) BETWEEN 1 AND 128 AND model_version NOT GLOB '*[^A-Za-z0-9._:-]*')),
adapter_version TEXT CHECK(adapter_version IS NULL OR (length(adapter_version) BETWEEN 1 AND 128 AND adapter_version NOT GLOB '*[^A-Za-z0-9._:-]*')),
provider_config_id TEXT CHECK(provider_config_id IS NULL OR (length(provider_config_id)=36 AND provider_config_id NOT GLOB '*[^a-f0-9-]*' AND substr(provider_config_id,9,1)='-' AND substr(provider_config_id,14,1)='-' AND substr(provider_config_id,19,1)='-' AND substr(provider_config_id,24,1)='-')),
config_version TEXT CHECK(config_version IS NULL OR (length(config_version) BETWEEN 1 AND 128 AND config_version NOT GLOB '*[^A-Za-z0-9._:-]*')),
configuration_sha256 TEXT CHECK(configuration_sha256 IS NULL OR (length(configuration_sha256)=64 AND configuration_sha256 NOT GLOB '*[^a-f0-9]*')),
descriptor_snapshot TEXT NOT NULL CHECK(descriptor_snapshot IS NULL OR (json_valid(descriptor_snapshot) AND length(CAST(descriptor_snapshot AS BLOB))<=16384)),
policy_admission TEXT NOT NULL CHECK(policy_admission IS NULL OR (json_valid(policy_admission) AND length(CAST(policy_admission AS BLOB))<=16384)),
policy_admission_sha256 TEXT NOT NULL CHECK(policy_admission_sha256 IS NULL OR (length(policy_admission_sha256)=64 AND policy_admission_sha256 NOT GLOB '*[^a-f0-9]*')),
task_publication_fence BLOB NOT NULL CHECK(task_publication_fence IS NULL OR (typeof(task_publication_fence)='integer' AND task_publication_fence BETWEEN 1 AND 9007199254740991)),
sync_operation_id TEXT NOT NULL CHECK(sync_operation_id IS NULL OR (length(sync_operation_id) BETWEEN 1 AND 128 AND sync_operation_id NOT GLOB '*[^A-Za-z0-9._:-]*')),
usage_correlation_id TEXT CHECK(usage_correlation_id IS NULL OR (length(usage_correlation_id)=36 AND usage_correlation_id NOT GLOB '*[^a-f0-9-]*' AND substr(usage_correlation_id,9,1)='-' AND substr(usage_correlation_id,14,1)='-' AND substr(usage_correlation_id,19,1)='-' AND substr(usage_correlation_id,24,1)='-')),
fallback_chain_id TEXT NOT NULL CHECK(fallback_chain_id IS NULL OR (length(fallback_chain_id)=36 AND fallback_chain_id NOT GLOB '*[^a-f0-9-]*' AND substr(fallback_chain_id,9,1)='-' AND substr(fallback_chain_id,14,1)='-' AND substr(fallback_chain_id,19,1)='-' AND substr(fallback_chain_id,24,1)='-')),
shadow INTEGER NOT NULL DEFAULT 0 CHECK(shadow IS NULL OR (typeof(shadow)='integer' AND shadow IN (0,1))),
shadow_of_attempt_id TEXT CHECK(shadow_of_attempt_id IS NULL OR (length(shadow_of_attempt_id)=36 AND shadow_of_attempt_id NOT GLOB '*[^a-f0-9-]*' AND substr(shadow_of_attempt_id,9,1)='-' AND substr(shadow_of_attempt_id,14,1)='-' AND substr(shadow_of_attempt_id,19,1)='-' AND substr(shadow_of_attempt_id,24,1)='-')),
created_at TEXT NOT NULL CHECK(created_at IS NULL OR (length(created_at) BETWEEN 20 AND 27 AND created_at GLOB '????-??-??T??:??:??*Z')),
creation_clock TEXT NOT NULL CHECK(creation_clock IS NULL OR (length(creation_clock) BETWEEN 1 AND 128 AND creation_clock NOT GLOB '*[^A-Za-z0-9._:-]*')),
row_revision BLOB NOT NULL DEFAULT 1 CHECK(row_revision IS NULL OR (typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991)),
execution_observation TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(execution_observation IS NULL OR (length(execution_observation) BETWEEN 1 AND 128 AND execution_observation NOT GLOB '*[^A-Za-z0-9._:-]*')),
execution_outcome TEXT CHECK(execution_outcome IS NULL OR (length(execution_outcome) BETWEEN 1 AND 128 AND execution_outcome NOT GLOB '*[^A-Za-z0-9._:-]*')),
result_install_disposition TEXT NOT NULL DEFAULT 'NONE' CHECK(result_install_disposition IS NULL OR (length(result_install_disposition) BETWEEN 1 AND 128 AND result_install_disposition NOT GLOB '*[^A-Za-z0-9._:-]*')),
metering_disposition TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(metering_disposition IS NULL OR (length(metering_disposition) BETWEEN 1 AND 128 AND metering_disposition NOT GLOB '*[^A-Za-z0-9._:-]*')),
safe_failure_code TEXT CHECK(safe_failure_code IS NULL OR (length(safe_failure_code) BETWEEN 1 AND 128 AND safe_failure_code NOT GLOB '*[^A-Za-z0-9._:-]*')),
response_material_reference TEXT CHECK(response_material_reference IS NULL OR (length(response_material_reference)=36 AND response_material_reference NOT GLOB '*[^a-f0-9-]*' AND substr(response_material_reference,9,1)='-' AND substr(response_material_reference,14,1)='-' AND substr(response_material_reference,19,1)='-' AND substr(response_material_reference,24,1)='-')),
response_material_sha256 TEXT CHECK(response_material_sha256 IS NULL OR (length(response_material_sha256)=64 AND response_material_sha256 NOT GLOB '*[^a-f0-9]*')),
response_sha256 TEXT CHECK(response_sha256 IS NULL OR (length(response_sha256)=64 AND response_sha256 NOT GLOB '*[^a-f0-9]*')),
publication_sha256 TEXT CHECK(publication_sha256 IS NULL OR (length(publication_sha256)=64 AND publication_sha256 NOT GLOB '*[^a-f0-9]*')),
started_at TEXT CHECK(started_at IS NULL OR (length(started_at) BETWEEN 20 AND 27 AND started_at GLOB '????-??-??T??:??:??*Z')),
ended_at TEXT CHECK(ended_at IS NULL OR (length(ended_at) BETWEEN 20 AND 27 AND ended_at GLOB '????-??-??T??:??:??*Z')),
latency_ms BLOB CHECK(latency_ms IS NULL OR (typeof(latency_ms)='integer' AND latency_ms BETWEEN 0 AND 9007199254740991)),
reported_usage_summary TEXT CHECK(reported_usage_summary IS NULL OR (json_valid(reported_usage_summary) AND length(CAST(reported_usage_summary AS BLOB))<=4096)),
updated_at TEXT NOT NULL CHECK(updated_at IS NULL OR (length(updated_at) BETWEEN 20 AND 27 AND updated_at GLOB '????-??-??T??:??:??*Z')),
update_clock TEXT NOT NULL CHECK(update_clock IS NULL OR (length(update_clock) BETWEEN 1 AND 128 AND update_clock NOT GLOB '*[^A-Za-z0-9._:-]*')),
PRIMARY KEY(account_id,attempt_id),
CHECK(format_version=1),
FOREIGN KEY(account_id,sync_operation_id) REFERENCES sync_operations(owner_user_id,id) ON DELETE RESTRICT,
CHECK(creation_clock IN ('CALLER_OBSERVED','DEVICE_WALL','SERVER_OBSERVED')),
CHECK(update_clock IN ('CALLER_OBSERVED','DEVICE_WALL','SERVER_OBSERVED')),
UNIQUE(account_id,task_id,attempt_sequence),
UNIQUE(account_id,task_id,attempt_id),
FOREIGN KEY(account_id,task_id) REFERENCES intelligence_continuations(account_id,task_id) ON DELETE RESTRICT,
FOREIGN KEY(account_id,predecessor_attempt_id) REFERENCES intelligence_continuation_attempts(account_id,attempt_id) ON DELETE RESTRICT,
FOREIGN KEY(account_id,shadow_of_attempt_id) REFERENCES intelligence_continuation_attempts(account_id,attempt_id) ON DELETE RESTRICT,
CHECK(execution_observation IN ('NOT_STARTED','RUNNING','TERMINAL','UNKNOWN')),
CHECK(execution_outcome IN ('SUCCEEDED','PARTIAL','FAILED','CANCELED')),
CHECK(result_install_disposition IN ('NONE','PENDING','INSTALLED','REJECTED_STALE','REJECTED_CANCELED','FAILED','SHADOW_ONLY')),
CHECK(metering_disposition IN ('NOT_REQUIRED','START_PENDING','START_DURABLE','COMPLETION_PENDING','COMPLETE','UNKNOWN')),
CHECK((execution_observation='TERMINAL')=(execution_outcome IS NOT NULL)),
CHECK(shadow=0 OR result_install_disposition IN ('NONE','SHADOW_ONLY')),
CHECK((shadow=1)=(shadow_of_attempt_id IS NOT NULL)),
CHECK(attempt_id IS NOT predecessor_attempt_id AND attempt_id IS NOT shadow_of_attempt_id),
CHECK((request_material_reference IS NULL)=(request_material_sha256 IS NULL)),
CHECK((response_material_reference IS NULL)=(response_material_sha256 IS NULL)),
CHECK(integration_id IS NULL OR usage_correlation_id IS NOT NULL)
);
CREATE TRIGGER intelligence_continuation_attempts_immutable BEFORE UPDATE ON intelligence_continuation_attempts WHEN NEW.account_id IS NOT OLD.account_id OR NEW.attempt_id IS NOT OLD.attempt_id OR NEW.task_id IS NOT OLD.task_id OR NEW.attempt_sequence IS NOT OLD.attempt_sequence OR NEW.format_version IS NOT OLD.format_version OR NEW.request_id IS NOT OLD.request_id OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.request_sha256 IS NOT OLD.request_sha256 OR NEW.request_material_reference IS NOT OLD.request_material_reference OR NEW.request_material_sha256 IS NOT OLD.request_material_sha256 OR NEW.predecessor_attempt_id IS NOT OLD.predecessor_attempt_id OR NEW.predecessor_request_id IS NOT OLD.predecessor_request_id OR NEW.integration_id IS NOT OLD.integration_id OR NEW.provider_id IS NOT OLD.provider_id OR NEW.model_id IS NOT OLD.model_id OR NEW.model_version IS NOT OLD.model_version OR NEW.adapter_version IS NOT OLD.adapter_version OR NEW.provider_config_id IS NOT OLD.provider_config_id OR NEW.config_version IS NOT OLD.config_version OR NEW.configuration_sha256 IS NOT OLD.configuration_sha256 OR NEW.descriptor_snapshot IS NOT OLD.descriptor_snapshot OR NEW.policy_admission IS NOT OLD.policy_admission OR NEW.policy_admission_sha256 IS NOT OLD.policy_admission_sha256 OR NEW.task_publication_fence IS NOT OLD.task_publication_fence OR NEW.sync_operation_id IS NOT OLD.sync_operation_id OR NEW.usage_correlation_id IS NOT OLD.usage_correlation_id OR NEW.fallback_chain_id IS NOT OLD.fallback_chain_id OR NEW.shadow IS NOT OLD.shadow OR NEW.shadow_of_attempt_id IS NOT OLD.shadow_of_attempt_id OR NEW.created_at IS NOT OLD.created_at OR NEW.creation_clock IS NOT OLD.creation_clock OR NEW.row_revision<>OLD.row_revision+1 BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_IMMUTABLE_CAS');END;
CREATE TRIGGER intelligence_continuation_attempts_retain BEFORE DELETE ON intelligence_continuation_attempts BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_RESPONSIBILITY_RETAINED');END;
CREATE INDEX intelligence_continuation_attempts_11 ON intelligence_continuation_attempts(account_id,task_id,attempt_sequence);
CREATE INDEX intelligence_continuation_attempts_12 ON intelligence_continuation_attempts(account_id,sync_operation_id);
CREATE INDEX intelligence_continuation_attempts_13 ON intelligence_continuation_attempts(account_id,execution_observation);
CREATE UNIQUE INDEX intelligence_publication_identity ON intelligence_continuations(account_id,publication_id) WHERE publication_id IS NOT NULL;
CREATE UNIQUE INDEX intelligence_usage_identity ON intelligence_continuation_attempts(account_id,usage_correlation_id) WHERE usage_correlation_id IS NOT NULL;
CREATE TRIGGER intelligence_continuations_insert_scope BEFORE INSERT ON intelligence_continuations WHEN (NEW.sync_operation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sync_operations q WHERE q.id=NEW.sync_operation_id AND q.owner_user_id=NEW.account_id AND q.entity_id=NEW.task_id AND q.entity_type='INTELLIGENCE_CONTINUATION' AND (NEW.trip_id IS NULL OR q.trip_id=NEW.trip_id)) OR (NEW.current_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a WHERE a.account_id=NEW.account_id AND a.task_id=NEW.task_id AND a.attempt_id=NEW.current_attempt_id AND a.shadow=0)) OR (NEW.run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trip_source_runs r WHERE r.cache_account_id=NEW.account_id AND r.id=NEW.run_id)) OR (NEW.candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trip_source_candidates c WHERE c.cache_account_id=NEW.account_id AND c.id=NEW.candidate_id AND c.run_id=NEW.run_id))) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_SCOPE');END;
CREATE TRIGGER intelligence_continuations_update_scope BEFORE UPDATE ON intelligence_continuations WHEN (NEW.sync_operation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sync_operations q WHERE q.id=NEW.sync_operation_id AND q.owner_user_id=NEW.account_id AND q.entity_id=NEW.task_id AND q.entity_type='INTELLIGENCE_CONTINUATION' AND (NEW.trip_id IS NULL OR q.trip_id=NEW.trip_id)) OR (NEW.current_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a WHERE a.account_id=NEW.account_id AND a.task_id=NEW.task_id AND a.attempt_id=NEW.current_attempt_id AND a.shadow=0)) OR (NEW.run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trip_source_runs r WHERE r.cache_account_id=NEW.account_id AND r.id=NEW.run_id)) OR (NEW.candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM trip_source_candidates c WHERE c.cache_account_id=NEW.account_id AND c.id=NEW.candidate_id AND c.run_id=NEW.run_id))) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_SCOPE');END;
CREATE TRIGGER intelligence_continuation_attempts_insert_scope BEFORE INSERT ON intelligence_continuation_attempts WHEN (NEW.sync_operation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sync_operations q WHERE q.id=NEW.sync_operation_id AND q.owner_user_id=NEW.account_id AND q.entity_id=NEW.task_id AND q.entity_type='INTELLIGENCE_CONTINUATION') OR NOT EXISTS(SELECT 1 FROM intelligence_continuations t WHERE t.account_id=NEW.account_id AND t.task_id=NEW.task_id AND t.publication_fence=NEW.task_publication_fence) OR NEW.attempt_sequence<>(SELECT COALESCE(MAX(attempt_sequence),0)+1 FROM intelligence_continuation_attempts WHERE account_id=NEW.account_id AND task_id=NEW.task_id) OR NOT EXISTS(SELECT 1 FROM sync_operations WHERE id=NEW.sync_operation_id AND owner_user_id=NEW.account_id AND status='PROCESSING') OR (NEW.predecessor_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a WHERE a.account_id=NEW.account_id AND a.attempt_id=NEW.predecessor_attempt_id AND a.task_id=NEW.task_id AND a.attempt_sequence<NEW.attempt_sequence AND a.fallback_chain_id=NEW.fallback_chain_id)) OR (NEW.shadow_of_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a WHERE a.account_id=NEW.account_id AND a.attempt_id=NEW.shadow_of_attempt_id AND a.task_id=NEW.task_id AND a.attempt_sequence<NEW.attempt_sequence AND a.fallback_chain_id=NEW.fallback_chain_id))) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_SCOPE');END;
CREATE TRIGGER intelligence_continuation_attempts_update_scope BEFORE UPDATE ON intelligence_continuation_attempts WHEN (NEW.sync_operation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sync_operations q WHERE q.id=NEW.sync_operation_id AND q.owner_user_id=NEW.account_id AND q.entity_id=NEW.task_id AND q.entity_type='INTELLIGENCE_CONTINUATION') OR NOT EXISTS(SELECT 1 FROM intelligence_continuations t WHERE t.account_id=NEW.account_id AND t.task_id=NEW.task_id) OR (NEW.predecessor_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a WHERE a.account_id=NEW.account_id AND a.attempt_id=NEW.predecessor_attempt_id AND a.task_id=NEW.task_id AND a.attempt_sequence<NEW.attempt_sequence AND a.fallback_chain_id=NEW.fallback_chain_id)) OR (NEW.shadow_of_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts a WHERE a.account_id=NEW.account_id AND a.attempt_id=NEW.shadow_of_attempt_id AND a.task_id=NEW.task_id AND a.attempt_sequence<NEW.attempt_sequence AND a.fallback_chain_id=NEW.fallback_chain_id))) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_SCOPE');END;
CREATE TRIGGER intelligence_queue_retain BEFORE DELETE ON sync_operations WHEN EXISTS(SELECT 1 FROM intelligence_continuations WHERE account_id=OLD.owner_user_id AND sync_operation_id=OLD.id) OR EXISTS(SELECT 1 FROM intelligence_continuation_attempts WHERE account_id=OLD.owner_user_id AND sync_operation_id=OLD.id) OR EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.dependencies) d WHERE t.account_id=OLD.owner_user_id AND json_extract(d.value,'$.kind')='QUEUE_OPERATION' AND json_extract(d.value,'$.id')=OLD.id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_QUEUE_RETAINED');END;
CREATE TRIGGER intelligence_local_capture_inbox_retain BEFORE DELETE ON local_capture_inbox WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.account_id AND json_extract(pin.value,'$.kind')='CAPTURE' AND json_extract(pin.value,'$.capture_id')=OLD.id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_MATERIAL_RETAINED');END;
CREATE TRIGGER intelligence_local_capture_payloads_retain BEFORE DELETE ON local_capture_payloads WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.account_id AND json_extract(pin.value,'$.kind')='CAPTURE' AND json_extract(pin.value,'$.payload_id')=OLD.id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_MATERIAL_RETAINED');END;
CREATE TRIGGER intelligence_trip_sources_retain BEFORE DELETE ON trip_sources WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.cache_account_id AND json_extract(pin.value,'$.kind')='SOURCE' AND json_extract(pin.value,'$.source_id')=OLD.id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_MATERIAL_RETAINED');END;
CREATE TRIGGER intelligence_trip_source_representations_retain BEFORE DELETE ON trip_source_representations WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.cache_account_id AND json_extract(pin.value,'$.kind')='SOURCE' AND json_extract(pin.value,'$.source_id')=OLD.source_id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_MATERIAL_RETAINED');END;
CREATE TRIGGER intelligence_trip_source_revisions_retain BEFORE DELETE ON trip_source_revisions
WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.cache_account_id AND json_extract(pin.value,'$.kind')='SOURCE' AND json_extract(pin.value,'$.source_id')=OLD.source_id)
BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_MATERIAL_RETAINED');END;
CREATE TRIGGER intelligence_trip_source_inputs_retain BEFORE DELETE ON trip_source_inputs
WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.cache_account_id AND json_extract(pin.value,'$.input_id')=OLD.id)
BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_PIN_RETAINED');END;
CREATE TRIGGER intelligence_pinned_input_immutable BEFORE UPDATE ON trip_source_inputs
WHEN EXISTS(SELECT 1 FROM intelligence_continuations t,json_each(t.input_pins) pin WHERE t.account_id=OLD.cache_account_id AND json_extract(pin.value,'$.input_id')=OLD.id)
 AND (NEW.id IS NOT OLD.id OR NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.source_id IS NOT OLD.source_id OR NEW.material_revision IS NOT OLD.material_revision OR NEW.representation_id IS NOT OLD.representation_id OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.byte_count IS NOT OLD.byte_count OR NEW.run_id IS NOT OLD.run_id OR NEW.confirmation_id IS NOT OLD.confirmation_id)
BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_PIN_IMMUTABLE');END;
CREATE TRIGGER intelligence_trip_source_runs_retain BEFORE DELETE ON trip_source_runs WHEN EXISTS(SELECT 1 FROM intelligence_continuations WHERE account_id=OLD.cache_account_id AND run_id=OLD.id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_PIN_RETAINED');END;
CREATE TRIGGER intelligence_trip_source_candidates_retain BEFORE DELETE ON trip_source_candidates WHEN EXISTS(SELECT 1 FROM intelligence_continuations WHERE account_id=OLD.cache_account_id AND candidate_id=OLD.id) BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_PIN_RETAINED');END;
CREATE TRIGGER intelligence_queue_binding_immutable BEFORE UPDATE ON sync_operations
WHEN (NEW.id IS NOT OLD.id OR NEW.owner_user_id IS NOT OLD.owner_user_id OR NEW.entity_id IS NOT OLD.entity_id OR NEW.entity_type IS NOT OLD.entity_type OR NEW.trip_id IS NOT OLD.trip_id)
 AND (EXISTS(SELECT 1 FROM intelligence_continuations WHERE sync_operation_id=OLD.id) OR EXISTS(SELECT 1 FROM intelligence_continuation_attempts WHERE sync_operation_id=OLD.id))
BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_QUEUE_BINDING_IMMUTABLE');END;
CREATE TRIGGER intelligence_publication_once BEFORE UPDATE ON intelligence_continuations
WHEN OLD.publication_id IS NOT NULL AND (NEW.publication_id IS NOT OLD.publication_id OR NEW.publication_sha256 IS NOT OLD.publication_sha256 OR NEW.result_sha256 IS NOT OLD.result_sha256 OR NEW.work_disposition<>'PUBLISHED')
BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_PUBLICATION_IMMUTABLE');END;
CREATE TRIGGER intelligence_response_once BEFORE UPDATE ON intelligence_continuation_attempts
WHEN (OLD.response_sha256 IS NOT NULL AND NEW.response_sha256 IS NOT OLD.response_sha256)
 OR (OLD.response_material_reference IS NOT NULL AND (NEW.response_material_reference IS NOT OLD.response_material_reference OR NEW.response_material_sha256 IS NOT OLD.response_material_sha256))
 OR (OLD.execution_observation='TERMINAL' AND (NEW.execution_observation<>'TERMINAL' OR NEW.execution_outcome IS NOT OLD.execution_outcome))
BEGIN SELECT RAISE(ABORT,'INTELLIGENCE_RESPONSE_IMMUTABLE');END;

`,
};
