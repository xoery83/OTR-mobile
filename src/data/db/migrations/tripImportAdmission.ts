import type { Migration } from "../migrations";

// CP13A.1 exact device catalogs; server authority is represented by registration state.
export const tripImportAdmissionMigration: Migration = {
  id: 49,
  name: "trip_import_flight_admission",
  sql: `
CREATE TABLE trip_sources (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  trip_id TEXT NOT NULL CHECK(length(trip_id)=36 AND trip_id NOT GLOB '*[^0-9a-f-]*' AND substr(trip_id,9,1)='-' AND substr(trip_id,14,1)='-' AND substr(trip_id,19,1)='-' AND substr(trip_id,24,1)='-'),
  acquired_by TEXT NOT NULL CHECK(length(acquired_by)=36 AND acquired_by NOT GLOB '*[^0-9a-f-]*' AND substr(acquired_by,9,1)='-' AND substr(acquired_by,14,1)='-' AND substr(acquired_by,19,1)='-' AND substr(acquired_by,24,1)='-'),
  acquisition_key TEXT NOT NULL CHECK(instr(acquisition_key,char(0))=0 AND length(acquisition_key) BETWEEN 1 AND 128 AND acquisition_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  acquisition_sha256 TEXT CHECK(acquisition_sha256 IS NULL OR (instr(acquisition_sha256,char(0))=0 AND length(acquisition_sha256)=64 AND acquisition_sha256 NOT GLOB '*[^0-9a-f]*')),
  source_kind TEXT NOT NULL CHECK(instr(source_kind,char(0))=0 AND source_kind IN ('FILE','IMAGE','TEXT','URL','EMAIL')),
  acquisition_channel TEXT NOT NULL CHECK(instr(acquisition_channel,char(0))=0),
  captured_at TEXT CHECK(captured_at IS NULL OR (length(captured_at)=27 AND captured_at GLOB '????-??-??T??:??:??.??????Z')),
  capture_time_basis TEXT NOT NULL CHECK(instr(capture_time_basis,char(0))=0 AND capture_time_basis IN ('OBSERVED','SUPPLIED','UNKNOWN')),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  access_mode TEXT NOT NULL DEFAULT 'OWNER_PRIVATE' CHECK(instr(access_mode,char(0))=0 AND access_mode='OWNER_PRIVATE'),
  lifecycle TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(instr(lifecycle,char(0))=0 AND lifecycle IN ('ACTIVE','DELETED')),
  current_material_revision INTEGER NOT NULL CHECK(typeof(current_material_revision)='integer' AND current_material_revision BETWEEN 1 AND 9007199254740991),
  row_revision INTEGER NOT NULL CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','IDENTITY_ONLY')),
  deleted_at TEXT CHECK(deleted_at IS NULL OR (length(deleted_at)=27 AND deleted_at GLOB '????-??-??T??:??:??.??????Z')),
  deleted_by TEXT CHECK(deleted_by IS NULL OR (length(deleted_by)=36 AND deleted_by NOT GLOB '*[^0-9a-f-]*' AND substr(deleted_by,9,1)='-' AND substr(deleted_by,14,1)='-' AND substr(deleted_by,19,1)='-' AND substr(deleted_by,24,1)='-')),
  FOREIGN KEY(cache_account_id,id,current_material_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,id),
  UNIQUE(cache_account_id,trip_id,acquired_by,acquisition_key),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL),
  CHECK(cache_account_id=acquired_by),
  CHECK((capture_time_basis='UNKNOWN')=(captured_at IS NULL)),
  CHECK((lifecycle='DELETED')=(deleted_at IS NOT NULL) AND (lifecycle='DELETED')=(deleted_by IS NOT NULL)),
  CHECK(acquisition_sha256 IS NOT NULL OR retention_state='IDENTITY_ONLY')
);

CREATE TABLE trip_source_revisions (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  source_id TEXT NOT NULL CHECK(length(source_id)=36 AND source_id NOT GLOB '*[^0-9a-f-]*' AND substr(source_id,9,1)='-' AND substr(source_id,14,1)='-' AND substr(source_id,19,1)='-' AND substr(source_id,24,1)='-'),
  material_revision INTEGER NOT NULL CHECK(typeof(material_revision)='integer' AND material_revision BETWEEN 1 AND 9007199254740991),
  previous_revision INTEGER CHECK(previous_revision IS NULL OR (typeof(previous_revision)='integer' AND previous_revision BETWEEN 1 AND 9007199254740991 AND previous_revision<material_revision)),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  created_by TEXT NOT NULL CHECK(length(created_by)=36 AND created_by NOT GLOB '*[^0-9a-f-]*' AND substr(created_by,9,1)='-' AND substr(created_by,14,1)='-' AND substr(created_by,19,1)='-' AND substr(created_by,24,1)='-'),
  operation_key TEXT NOT NULL CHECK(instr(operation_key,char(0))=0 AND length(operation_key) BETWEEN 1 AND 128 AND operation_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  capture_sha256 TEXT CHECK(capture_sha256 IS NULL OR (instr(capture_sha256,char(0))=0 AND length(capture_sha256)=64 AND capture_sha256 NOT GLOB '*[^0-9a-f]*')),
  original_representation_ids TEXT NOT NULL CHECK(json_valid(original_representation_ids) AND json_type(original_representation_ids)='array' AND json_array_length(original_representation_ids) BETWEEN 1 AND 64),
  completeness TEXT NOT NULL CHECK(instr(completeness,char(0))=0 AND completeness IN ('AS_SUPPLIED','PARTIAL_CAPTURE')),
  reason TEXT NOT NULL CHECK(instr(reason,char(0))=0 AND reason IN ('ACQUISITION','REPLACEMENT','REFRESH','ADD_PART','SAVED_TEXT_EDIT','AUTHORIZED_COPY')),
  origin_source_id TEXT CHECK(origin_source_id IS NULL OR (length(origin_source_id)=36 AND origin_source_id NOT GLOB '*[^0-9a-f-]*' AND substr(origin_source_id,9,1)='-' AND substr(origin_source_id,14,1)='-' AND substr(origin_source_id,19,1)='-' AND substr(origin_source_id,24,1)='-')),
  origin_material_revision INTEGER CHECK(origin_material_revision IS NULL OR (typeof(origin_material_revision)='integer')),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','IDENTITY_ONLY')),
  FOREIGN KEY(cache_account_id,source_id) REFERENCES trip_sources(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id,previous_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,origin_source_id,origin_material_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,source_id,material_revision),
  UNIQUE(cache_account_id,source_id,operation_key),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL)
);

CREATE TABLE trip_source_representations (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  row_revision INTEGER NOT NULL CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
  source_id TEXT NOT NULL CHECK(length(source_id)=36 AND source_id NOT GLOB '*[^0-9a-f-]*' AND substr(source_id,9,1)='-' AND substr(source_id,14,1)='-' AND substr(source_id,19,1)='-' AND substr(source_id,24,1)='-'),
  introduced_revision INTEGER NOT NULL CHECK(typeof(introduced_revision)='integer'),
  role TEXT NOT NULL CHECK(instr(role,char(0))=0 AND role IN ('ORIGINAL','DERIVED')),
  material_kind TEXT NOT NULL CHECK(instr(material_kind,char(0))=0 AND material_kind IN ('BINARY','TEXT','LOCATOR')),
  original_filename TEXT CHECK(original_filename IS NULL OR (instr(original_filename,char(0))=0 AND length(original_filename) BETWEEN 1 AND 255)),
  part_key TEXT CHECK(part_key IS NULL OR (instr(part_key,char(0))=0 AND length(part_key) BETWEEN 1 AND 128)),
  mime_type TEXT CHECK(mime_type IS NULL OR (instr(mime_type,char(0))=0)),
  encoding TEXT CHECK(encoding IS NULL OR (instr(encoding,char(0))=0)),
  payload_sha256 TEXT CHECK(payload_sha256 IS NULL OR (instr(payload_sha256,char(0))=0 AND length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*')),
  byte_count INTEGER CHECK(byte_count IS NULL OR (typeof(byte_count)='integer')),
  text_content TEXT CHECK(text_content IS NULL OR (instr(text_content,char(0))=0 AND length(CAST(text_content AS BLOB))<=262144)),
  locator_uri TEXT CHECK(locator_uri IS NULL OR (instr(locator_uri,char(0))=0 AND length(locator_uri)<=4096 AND length(CAST(locator_uri AS BLOB))<=16384)),
  parent_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(parent_ids) AND json_type(parent_ids)='array' AND json_array_length(parent_ids) BETWEEN 0 AND 16),
  transform_key TEXT CHECK(transform_key IS NULL OR (instr(transform_key,char(0))=0 AND length(transform_key) BETWEEN 1 AND 128)),
  transform_version TEXT CHECK(transform_version IS NULL OR (instr(transform_version,char(0))=0 AND length(transform_version) BETWEEN 1 AND 128)),
  transform_options_sha256 TEXT CHECK(transform_options_sha256 IS NULL OR (instr(transform_options_sha256,char(0))=0 AND length(transform_options_sha256)=64 AND transform_options_sha256 NOT GLOB '*[^0-9a-f]*')),
  regenerability TEXT NOT NULL CHECK(instr(regenerability,char(0))=0 AND regenerability IN ('NOT_APPLICABLE','POSSIBLE','IMPOSSIBLE')),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  storage_provider TEXT CHECK(storage_provider IS NULL OR (instr(storage_provider,char(0))=0)),
  storage_bucket TEXT CHECK(storage_bucket IS NULL OR (instr(storage_bucket,char(0))=0)),
  object_key TEXT CHECK(object_key IS NULL OR (instr(object_key,char(0))=0)),
  remote_state TEXT NOT NULL CHECK(instr(remote_state,char(0))=0 AND remote_state IN ('PENDING','VERIFIED','LOST','PURGED','NOT_APPLICABLE')),
  verified_at TEXT CHECK(verified_at IS NULL OR (length(verified_at)=27 AND verified_at GLOB '????-??-??T??:??:??.??????Z')),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','PURGE_PENDING','PAYLOAD_PURGED','IDENTITY_ONLY')),
  local_uri TEXT CHECK(local_uri IS NULL OR length(local_uri)<=4096),
  local_state TEXT NOT NULL DEFAULT 'ABSENT' CHECK(local_state IN ('ABSENT','PRESENT_UNVERIFIED','VERIFIED','LOST','PURGED')),
  local_verified_at TEXT,
  transfer_state TEXT NOT NULL CHECK(transfer_state IN ('NOT_REQUIRED','PENDING','IN_PROGRESS','RETRYABLE','COMPLETE','BLOCKED')),
  FOREIGN KEY(cache_account_id,source_id) REFERENCES trip_sources(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id,introduced_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK(local_state<>'VERIFIED' OR local_verified_at IS NOT NULL),
  PRIMARY KEY(cache_account_id,id),
  UNIQUE(cache_account_id,source_id,id),
  UNIQUE(cache_account_id,storage_bucket,object_key),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL)
);

CREATE TABLE trip_source_runs (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  row_revision INTEGER NOT NULL CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
  trip_id TEXT NOT NULL CHECK(length(trip_id)=36 AND trip_id NOT GLOB '*[^0-9a-f-]*' AND substr(trip_id,9,1)='-' AND substr(trip_id,14,1)='-' AND substr(trip_id,19,1)='-' AND substr(trip_id,24,1)='-'),
  actor_account_id TEXT NOT NULL CHECK(length(actor_account_id)=36 AND actor_account_id NOT GLOB '*[^0-9a-f-]*' AND substr(actor_account_id,9,1)='-' AND substr(actor_account_id,14,1)='-' AND substr(actor_account_id,19,1)='-' AND substr(actor_account_id,24,1)='-'),
  operation_key TEXT NOT NULL CHECK(instr(operation_key,char(0))=0 AND length(operation_key) BETWEEN 1 AND 128 AND operation_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  scope_source_ids TEXT NOT NULL CHECK(json_valid(scope_source_ids) AND json_type(scope_source_ids)='array' AND json_array_length(scope_source_ids) BETWEEN 1 AND 64),
  scope_sha256 TEXT NOT NULL CHECK(instr(scope_sha256,char(0))=0 AND length(scope_sha256)=64 AND scope_sha256 NOT GLOB '*[^0-9a-f]*'),
  generation INTEGER NOT NULL CHECK(typeof(generation)='integer' AND generation BETWEEN 1 AND 9007199254740991),
  input_sha256 TEXT NOT NULL CHECK(instr(input_sha256,char(0))=0 AND length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
  extractor_key TEXT NOT NULL CHECK(instr(extractor_key,char(0))=0 AND length(extractor_key) BETWEEN 1 AND 128),
  extractor_version TEXT NOT NULL CHECK(instr(extractor_version,char(0))=0 AND length(extractor_version) BETWEEN 1 AND 128),
  extractor_options_sha256 TEXT NOT NULL CHECK(instr(extractor_options_sha256,char(0))=0 AND length(extractor_options_sha256)=64 AND extractor_options_sha256 NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(instr(state,char(0))=0 AND state IN ('PENDING','RUNNING','READY','FAILED')),
  superseded_by TEXT CHECK(superseded_by IS NULL OR (length(superseded_by)=36 AND superseded_by NOT GLOB '*[^0-9a-f-]*' AND substr(superseded_by,9,1)='-' AND substr(superseded_by,14,1)='-' AND substr(superseded_by,19,1)='-' AND substr(superseded_by,24,1)='-')),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  completed_at TEXT CHECK(completed_at IS NULL OR (length(completed_at)=27 AND completed_at GLOB '????-??-??T??:??:??.??????Z')),
  error_code TEXT CHECK(error_code IS NULL OR (instr(error_code,char(0))=0 AND error_code IN ('SOURCE_FAILURE','UNSUPPORTED_INPUT','EXTRACTOR_FAILURE','CANCELED'))),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','IDENTITY_ONLY')),
  FOREIGN KEY(cache_account_id,superseded_by) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,id),
  UNIQUE(cache_account_id,trip_id,actor_account_id,operation_key),
  UNIQUE(cache_account_id,trip_id,actor_account_id,scope_sha256,generation),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL),
  CHECK(cache_account_id=actor_account_id),
  CHECK((state='FAILED')=(error_code IS NOT NULL)),
  CHECK((state IN ('READY','FAILED'))=(completed_at IS NOT NULL))
);

CREATE TABLE trip_source_inputs (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  run_id TEXT DEFAULT null CHECK(run_id IS NULL OR (length(run_id)=36 AND run_id NOT GLOB '*[^0-9a-f-]*' AND substr(run_id,9,1)='-' AND substr(run_id,14,1)='-' AND substr(run_id,19,1)='-' AND substr(run_id,24,1)='-')),
  confirmation_id TEXT DEFAULT null CHECK(confirmation_id IS NULL OR (length(confirmation_id)=36 AND confirmation_id NOT GLOB '*[^0-9a-f-]*' AND substr(confirmation_id,9,1)='-' AND substr(confirmation_id,14,1)='-' AND substr(confirmation_id,19,1)='-' AND substr(confirmation_id,24,1)='-')),
  source_id TEXT NOT NULL CHECK(length(source_id)=36 AND source_id NOT GLOB '*[^0-9a-f-]*' AND substr(source_id,9,1)='-' AND substr(source_id,14,1)='-' AND substr(source_id,19,1)='-' AND substr(source_id,24,1)='-'),
  material_revision INTEGER NOT NULL CHECK(typeof(material_revision)='integer' AND material_revision BETWEEN 1 AND 9007199254740991),
  representation_id TEXT NOT NULL CHECK(length(representation_id)=36 AND representation_id NOT GLOB '*[^0-9a-f-]*' AND substr(representation_id,9,1)='-' AND substr(representation_id,14,1)='-' AND substr(representation_id,19,1)='-' AND substr(representation_id,24,1)='-'),
  payload_sha256 TEXT CHECK(payload_sha256 IS NULL OR (instr(payload_sha256,char(0))=0 AND length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*')),
  byte_count INTEGER CHECK(byte_count IS NULL OR (typeof(byte_count)='integer' AND byte_count BETWEEN 0 AND 9007199254740991)),
  observed_source_row_revision INTEGER NOT NULL CHECK(typeof(observed_source_row_revision)='integer' AND observed_source_row_revision BETWEEN 1 AND 9007199254740991),
  historical_selection INTEGER NOT NULL DEFAULT 0 CHECK(typeof(historical_selection)='integer' AND historical_selection IN (0,1)),
  FOREIGN KEY(cache_account_id,run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,confirmation_id) REFERENCES trip_source_confirmations(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id) REFERENCES trip_sources(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id,material_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id,representation_id) REFERENCES trip_source_representations(cache_account_id,source_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,id),
  CHECK((run_id IS NULL)<>(confirmation_id IS NULL)),
  CHECK((payload_sha256 IS NULL)=(byte_count IS NULL))
);

CREATE TABLE trip_source_candidates (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  run_id TEXT NOT NULL CHECK(length(run_id)=36 AND run_id NOT GLOB '*[^0-9a-f-]*' AND substr(run_id,9,1)='-' AND substr(run_id,14,1)='-' AND substr(run_id,19,1)='-' AND substr(run_id,24,1)='-'),
  candidate_key TEXT NOT NULL CHECK(instr(candidate_key,char(0))=0 AND length(candidate_key) BETWEEN 1 AND 128 AND candidate_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  candidate_kind TEXT NOT NULL CHECK(instr(candidate_kind,char(0))=0 AND candidate_kind IN ('TRANSPORT','STAY','ACTIVITY','NOTE','OPTIONAL_POI','UNCLASSIFIED')),
  proposal_version INTEGER NOT NULL CHECK(typeof(proposal_version)='integer' AND proposal_version=1),
  proposal_sha256 TEXT NOT NULL CHECK(instr(proposal_sha256,char(0))=0 AND length(proposal_sha256)=64 AND proposal_sha256 NOT GLOB '*[^0-9a-f]*'),
  proposal TEXT CHECK(proposal IS NULL OR (json_valid(proposal) AND json_type(proposal)='object' AND length(CAST(proposal AS BLOB))<=262144)),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','IDENTITY_ONLY')),
  FOREIGN KEY(cache_account_id,run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,id),
  UNIQUE(cache_account_id,run_id,candidate_key),
  UNIQUE(cache_account_id,run_id,id),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL),
  CHECK(proposal IS NOT NULL OR retention_state='IDENTITY_ONLY')
);

CREATE TABLE trip_source_confirmations (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  trip_id TEXT NOT NULL CHECK(length(trip_id)=36 AND trip_id NOT GLOB '*[^0-9a-f-]*' AND substr(trip_id,9,1)='-' AND substr(trip_id,14,1)='-' AND substr(trip_id,19,1)='-' AND substr(trip_id,24,1)='-'),
  actor_account_id TEXT NOT NULL CHECK(length(actor_account_id)=36 AND actor_account_id NOT GLOB '*[^0-9a-f-]*' AND substr(actor_account_id,9,1)='-' AND substr(actor_account_id,14,1)='-' AND substr(actor_account_id,19,1)='-' AND substr(actor_account_id,24,1)='-'),
  confirmation_key TEXT NOT NULL CHECK(instr(confirmation_key,char(0))=0 AND length(confirmation_key) BETWEEN 1 AND 128 AND confirmation_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  intent_version INTEGER NOT NULL CHECK(typeof(intent_version)='integer' AND intent_version=1),
  intent_sha256 TEXT NOT NULL CHECK(instr(intent_sha256,char(0))=0 AND length(intent_sha256)=64 AND intent_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  state TEXT NOT NULL DEFAULT 'PREPARED' CHECK(instr(state,char(0))=0 AND state IN ('PREPARED','PROCESSING','PARTIAL','COMPLETE','STOPPED')),
  row_revision INTEGER NOT NULL CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','IDENTITY_ONLY')),
  PRIMARY KEY(cache_account_id,id),
  UNIQUE(cache_account_id,trip_id,actor_account_id,confirmation_key),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL),
  CHECK(cache_account_id=actor_account_id)
);

CREATE TABLE trip_source_output_slots (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  confirmation_id TEXT NOT NULL CHECK(length(confirmation_id)=36 AND confirmation_id NOT GLOB '*[^0-9a-f-]*' AND substr(confirmation_id,9,1)='-' AND substr(confirmation_id,14,1)='-' AND substr(confirmation_id,19,1)='-' AND substr(confirmation_id,24,1)='-'),
  slot_id TEXT NOT NULL CHECK(slot_id IS NULL OR (length(slot_id)=36 AND slot_id NOT GLOB '*[^0-9a-f-]*' AND substr(slot_id,9,1)='-' AND substr(slot_id,14,1)='-' AND substr(slot_id,19,1)='-' AND substr(slot_id,24,1)='-')),
  slot_key TEXT NOT NULL CHECK(instr(slot_key,char(0))=0 AND length(slot_key) BETWEEN 1 AND 128 AND slot_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  disposition TEXT NOT NULL CHECK(instr(disposition,char(0))=0 AND disposition IN ('CREATE','UPDATE','LINK_ONLY','REJECT','DEFER')),
  reviewed_run_id TEXT CHECK(reviewed_run_id IS NULL OR (length(reviewed_run_id)=36 AND reviewed_run_id NOT GLOB '*[^0-9a-f-]*' AND substr(reviewed_run_id,9,1)='-' AND substr(reviewed_run_id,14,1)='-' AND substr(reviewed_run_id,19,1)='-' AND substr(reviewed_run_id,24,1)='-')),
  candidate_id TEXT CHECK(candidate_id IS NULL OR (length(candidate_id)=36 AND candidate_id NOT GLOB '*[^0-9a-f-]*' AND substr(candidate_id,9,1)='-' AND substr(candidate_id,14,1)='-' AND substr(candidate_id,19,1)='-' AND substr(candidate_id,24,1)='-')),
  intended_target_kind TEXT CHECK(intended_target_kind IS NULL OR (instr(intended_target_kind,char(0))=0 AND intended_target_kind IN ('ITINERARY_EVENT','ITINERARY_RESERVATION'))),
  intended_target_id TEXT CHECK(intended_target_id IS NULL OR (length(intended_target_id)=36 AND intended_target_id NOT GLOB '*[^0-9a-f-]*' AND substr(intended_target_id,9,1)='-' AND substr(intended_target_id,14,1)='-' AND substr(intended_target_id,19,1)='-' AND substr(intended_target_id,24,1)='-')),
  base_revision INTEGER CHECK(base_revision IS NULL OR (typeof(base_revision)='integer' AND base_revision BETWEEN 1 AND 9007199254740991)),
  adapter_key TEXT CHECK(adapter_key IS NULL OR (instr(adapter_key,char(0))=0 AND adapter_key IN ('itinerary-event-v1','itinerary-reservation-evidence-v1'))),
  adapter_version INTEGER CHECK(adapter_version IS NULL OR (typeof(adapter_version)='integer' AND adapter_version=1)),
  domain_operation_key TEXT CHECK(domain_operation_key IS NULL OR (instr(domain_operation_key,char(0))=0 AND length(domain_operation_key) BETWEEN 1 AND 128 AND domain_operation_key NOT GLOB '*[^A-Za-z0-9._:-]*')),
  domain_intent_sha256 TEXT CHECK(domain_intent_sha256 IS NULL OR (instr(domain_intent_sha256,char(0))=0 AND length(domain_intent_sha256)=64 AND domain_intent_sha256 NOT GLOB '*[^0-9a-f]*')),
  reviewed_payload TEXT CHECK(reviewed_payload IS NULL OR (json_valid(reviewed_payload) AND json_type(reviewed_payload)='object' AND length(CAST(reviewed_payload AS BLOB))<=262144)),
  support_version INTEGER NOT NULL CHECK(typeof(support_version)='integer' AND support_version=1),
  support_payload TEXT CHECK(support_payload IS NULL OR (json_valid(support_payload) AND json_type(support_payload)='object' AND length(CAST(support_payload AS BLOB))<=262144)),
  state TEXT NOT NULL CHECK(instr(state,char(0))=0 AND state IN ('PREPARED','OUTCOME_UNKNOWN','DOMAIN_SUCCEEDED','EVIDENCE_PENDING','FINALIZED','REJECTED','DEFERRED','CONFLICTED','FAILED','CANCELED')),
  dispatched_at TEXT DEFAULT null CHECK(dispatched_at IS NULL OR (length(dispatched_at)=27 AND dispatched_at GLOB '????-??-??T??:??:??.??????Z')),
  receipt_ref TEXT DEFAULT null CHECK(receipt_ref IS NULL OR (instr(receipt_ref,char(0))=0 AND length(receipt_ref) BETWEEN 1 AND 512)),
  result_target_kind TEXT DEFAULT null CHECK(result_target_kind IS NULL OR (instr(result_target_kind,char(0))=0 AND result_target_kind IN ('ITINERARY_EVENT','ITINERARY_RESERVATION'))),
  result_target_id TEXT DEFAULT null CHECK(result_target_id IS NULL OR (length(result_target_id)=36 AND result_target_id NOT GLOB '*[^0-9a-f-]*' AND substr(result_target_id,9,1)='-' AND substr(result_target_id,14,1)='-' AND substr(result_target_id,19,1)='-' AND substr(result_target_id,24,1)='-')),
  result_revision INTEGER DEFAULT null CHECK(result_revision IS NULL OR (typeof(result_revision)='integer' AND result_revision BETWEEN 1 AND 9007199254740991)),
  receipt_sha256 TEXT DEFAULT null CHECK(receipt_sha256 IS NULL OR (instr(receipt_sha256,char(0))=0 AND length(receipt_sha256)=64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*')),
  finalization_state TEXT NOT NULL DEFAULT 'NONE' CHECK(instr(finalization_state,char(0))=0 AND finalization_state IN ('NONE','PENDING','COMPLETE','BLOCKED')),
  failure_code TEXT DEFAULT null CHECK(failure_code IS NULL OR (instr(failure_code,char(0))=0 AND failure_code IN ('INPUT_STALE','FORBIDDEN','DOMAIN_CONFLICT','DOMAIN_REJECTED','RECEIPT_UNAVAILABLE','EVIDENCE_FINALIZE_FAILED','OUTCOME_UNKNOWN'))),
  retention_state TEXT NOT NULL DEFAULT 'RETAINED' CHECK(instr(retention_state,char(0))=0 AND retention_state IN ('RETAINED','IDENTITY_ONLY')),
  create_claim_active INTEGER NOT NULL DEFAULT 0 CHECK(typeof(create_claim_active)='integer' AND create_claim_active IN (0,1)),
  no_commit_basis TEXT DEFAULT null CHECK(no_commit_basis IS NULL OR (instr(no_commit_basis,char(0))=0 AND no_commit_basis IN ('UNDISPATCHED_REVOKED','VERIFIED_TERMINAL_RECEIPT'))),
  no_commit_receipt_ref TEXT DEFAULT null CHECK(no_commit_receipt_ref IS NULL OR (instr(no_commit_receipt_ref,char(0))=0 AND length(no_commit_receipt_ref) BETWEEN 1 AND 512)),
  no_commit_receipt_sha256 TEXT DEFAULT null CHECK(no_commit_receipt_sha256 IS NULL OR (instr(no_commit_receipt_sha256,char(0))=0 AND length(no_commit_receipt_sha256)=64 AND no_commit_receipt_sha256 NOT GLOB '*[^0-9a-f]*')),
  no_commit_at TEXT DEFAULT null CHECK(no_commit_at IS NULL OR (length(no_commit_at)=27 AND no_commit_at GLOB '????-??-??T??:??:??.??????Z')),
  FOREIGN KEY(cache_account_id,confirmation_id) REFERENCES trip_source_confirmations(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,reviewed_run_id,candidate_id) REFERENCES trip_source_candidates(cache_account_id,run_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,slot_id),
  UNIQUE(cache_account_id,confirmation_id,slot_key),
  CHECK((reviewed_run_id IS NULL)=(candidate_id IS NULL)),
  CHECK(disposition='CREATE' OR create_claim_active=0),
  CHECK((receipt_ref IS NULL)=(result_target_kind IS NULL) AND (receipt_ref IS NULL)=(result_target_id IS NULL) AND (receipt_ref IS NULL)=(result_revision IS NULL) AND (receipt_ref IS NULL)=(receipt_sha256 IS NULL)),
  CHECK((no_commit_basis IS NULL)=(no_commit_at IS NULL)),
  CHECK(receipt_ref IS NULL OR result_target_kind=intended_target_kind AND result_target_id=intended_target_id),
  CHECK((state IN ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','FINALIZED'))=(receipt_ref IS NOT NULL)),
  CHECK(state NOT IN ('DOMAIN_SUCCEEDED','EVIDENCE_PENDING','FINALIZED') AND finalization_state='NONE' OR state='DOMAIN_SUCCEEDED' AND finalization_state='PENDING' OR state='EVIDENCE_PENDING' AND finalization_state IN ('PENDING','BLOCKED') OR state='FINALIZED' AND finalization_state='COMPLETE'),
  CHECK(state<>'OUTCOME_UNKNOWN' OR dispatched_at IS NOT NULL),
  CHECK(no_commit_basis IS NULL AND no_commit_receipt_ref IS NULL AND no_commit_receipt_sha256 IS NULL OR no_commit_basis='UNDISPATCHED_REVOKED' AND state='CANCELED' AND dispatched_at IS NULL AND no_commit_receipt_ref IS NULL AND no_commit_receipt_sha256 IS NULL AND create_claim_active=0 OR no_commit_basis='VERIFIED_TERMINAL_RECEIPT' AND state IN ('FAILED','CONFLICTED') AND no_commit_receipt_ref IS NOT NULL AND no_commit_receipt_sha256 IS NOT NULL AND create_claim_active=0),
  CHECK(disposition IN ('CREATE','UPDATE','LINK_ONLY') AND intended_target_kind IS NOT NULL AND intended_target_id IS NOT NULL AND adapter_key IS NOT NULL AND adapter_version IS NOT NULL AND domain_operation_key IS NOT NULL AND domain_intent_sha256 IS NOT NULL AND reviewed_payload IS NOT NULL OR disposition IN ('REJECT','DEFER') AND intended_target_kind IS NULL AND intended_target_id IS NULL AND base_revision IS NULL AND adapter_key IS NULL AND adapter_version IS NULL AND domain_operation_key IS NULL AND domain_intent_sha256 IS NULL AND receipt_ref IS NULL AND support_payload='{}' AND state=CASE disposition WHEN 'REJECT' THEN 'REJECTED' ELSE 'DEFERRED' END),
  CHECK(disposition NOT IN ('CREATE','REJECT','DEFER') OR base_revision IS NULL),
  CHECK(disposition<>'UPDATE' OR base_revision IS NOT NULL)
);

CREATE TABLE trip_source_associations (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  id TEXT NOT NULL CHECK(id IS NULL OR (length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*' AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-')),
  source_id TEXT NOT NULL CHECK(length(source_id)=36 AND source_id NOT GLOB '*[^0-9a-f-]*' AND substr(source_id,9,1)='-' AND substr(source_id,14,1)='-' AND substr(source_id,19,1)='-' AND substr(source_id,24,1)='-'),
  target_kind TEXT NOT NULL CHECK(instr(target_kind,char(0))=0 AND target_kind IN ('ITINERARY_EVENT','ITINERARY_RESERVATION')),
  target_id TEXT NOT NULL CHECK(length(target_id)=36 AND target_id NOT GLOB '*[^0-9a-f-]*' AND substr(target_id,9,1)='-' AND substr(target_id,14,1)='-' AND substr(target_id,19,1)='-' AND substr(target_id,24,1)='-'),
  purpose TEXT NOT NULL CHECK(instr(purpose,char(0))=0 AND purpose IN ('ATTACHED_EVIDENCE','CONFIRMED_SUPPORT')),
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(instr(state,char(0))=0 AND state IN ('ACTIVE','INACTIVE')),
  row_revision INTEGER NOT NULL CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
  created_by TEXT NOT NULL CHECK(length(created_by)=36 AND created_by NOT GLOB '*[^0-9a-f-]*' AND substr(created_by,9,1)='-' AND substr(created_by,14,1)='-' AND substr(created_by,19,1)='-' AND substr(created_by,24,1)='-'),
  created_at TEXT CHECK(created_at IS NULL OR (length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z')),
  confirmation_id TEXT DEFAULT null CHECK(confirmation_id IS NULL OR (length(confirmation_id)=36 AND confirmation_id NOT GLOB '*[^0-9a-f-]*' AND substr(confirmation_id,9,1)='-' AND substr(confirmation_id,14,1)='-' AND substr(confirmation_id,19,1)='-' AND substr(confirmation_id,24,1)='-')),
  preview_input_id TEXT DEFAULT null CHECK(preview_input_id IS NULL OR (length(preview_input_id)=36 AND preview_input_id NOT GLOB '*[^0-9a-f-]*' AND substr(preview_input_id,9,1)='-' AND substr(preview_input_id,14,1)='-' AND substr(preview_input_id,19,1)='-' AND substr(preview_input_id,24,1)='-')),
  preview_source_revision INTEGER DEFAULT null CHECK(preview_source_revision IS NULL OR (typeof(preview_source_revision)='integer')),
  preview_representation_id TEXT DEFAULT null CHECK(preview_representation_id IS NULL OR (length(preview_representation_id)=36 AND preview_representation_id NOT GLOB '*[^0-9a-f-]*' AND substr(preview_representation_id,9,1)='-' AND substr(preview_representation_id,14,1)='-' AND substr(preview_representation_id,19,1)='-' AND substr(preview_representation_id,24,1)='-')),
  inactive_reason TEXT DEFAULT null CHECK(inactive_reason IS NULL OR (instr(inactive_reason,char(0))=0 AND inactive_reason IN ('UNLINK','SOURCE_DELETE','TARGET_DELETE'))),
  inactive_at TEXT DEFAULT null CHECK(inactive_at IS NULL OR (length(inactive_at)=27 AND inactive_at GLOB '????-??-??T??:??:??.??????Z')),
  inactive_by TEXT DEFAULT null CHECK(inactive_by IS NULL OR (length(inactive_by)=36 AND inactive_by NOT GLOB '*[^0-9a-f-]*' AND substr(inactive_by,9,1)='-' AND substr(inactive_by,14,1)='-' AND substr(inactive_by,19,1)='-' AND substr(inactive_by,24,1)='-')),
  FOREIGN KEY(cache_account_id,source_id) REFERENCES trip_sources(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,confirmation_id) REFERENCES trip_source_confirmations(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,preview_input_id) REFERENCES trip_source_inputs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id,preview_source_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,source_id,preview_representation_id) REFERENCES trip_source_representations(cache_account_id,source_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,id),
  CHECK(registration_state<>'REGISTERED' OR created_at IS NOT NULL)
);

CREATE TABLE trip_source_run_predecessors (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  child_run_id TEXT NOT NULL CHECK(length(child_run_id)=36 AND child_run_id NOT GLOB '*[^0-9a-f-]*' AND substr(child_run_id,9,1)='-' AND substr(child_run_id,14,1)='-' AND substr(child_run_id,19,1)='-' AND substr(child_run_id,24,1)='-'),
  parent_run_id TEXT NOT NULL CHECK(length(parent_run_id)=36 AND parent_run_id NOT GLOB '*[^0-9a-f-]*' AND substr(parent_run_id,9,1)='-' AND substr(parent_run_id,14,1)='-' AND substr(parent_run_id,19,1)='-' AND substr(parent_run_id,24,1)='-'),
  relation TEXT NOT NULL CHECK(instr(relation,char(0))=0 AND relation IN ('REPROCESS','CONSOLIDATE')),
  FOREIGN KEY(cache_account_id,child_run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,parent_run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,child_run_id,parent_run_id)
);

CREATE TABLE trip_source_candidate_lineage (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  child_candidate_id TEXT NOT NULL CHECK(length(child_candidate_id)=36 AND child_candidate_id NOT GLOB '*[^0-9a-f-]*' AND substr(child_candidate_id,9,1)='-' AND substr(child_candidate_id,14,1)='-' AND substr(child_candidate_id,19,1)='-' AND substr(child_candidate_id,24,1)='-'),
  parent_candidate_id TEXT NOT NULL CHECK(length(parent_candidate_id)=36 AND parent_candidate_id NOT GLOB '*[^0-9a-f-]*' AND substr(parent_candidate_id,9,1)='-' AND substr(parent_candidate_id,14,1)='-' AND substr(parent_candidate_id,19,1)='-' AND substr(parent_candidate_id,24,1)='-'),
  relation TEXT NOT NULL CHECK(instr(relation,char(0))=0 AND relation IN ('REPROCESS','CONSOLIDATE')),
  FOREIGN KEY(cache_account_id,child_candidate_id) REFERENCES trip_source_candidates(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,parent_candidate_id) REFERENCES trip_source_candidates(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,child_candidate_id,parent_candidate_id)
);

CREATE TABLE trip_source_slot_lineage_dispositions (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  slot_id TEXT NOT NULL CHECK(length(slot_id)=36 AND slot_id NOT GLOB '*[^0-9a-f-]*' AND substr(slot_id,9,1)='-' AND substr(slot_id,14,1)='-' AND substr(slot_id,19,1)='-' AND substr(slot_id,24,1)='-'),
  ancestor_candidate_id TEXT NOT NULL CHECK(length(ancestor_candidate_id)=36 AND ancestor_candidate_id NOT GLOB '*[^0-9a-f-]*' AND substr(ancestor_candidate_id,9,1)='-' AND substr(ancestor_candidate_id,14,1)='-' AND substr(ancestor_candidate_id,19,1)='-' AND substr(ancestor_candidate_id,24,1)='-'),
  ancestor_slot_key TEXT NOT NULL CHECK(instr(ancestor_slot_key,char(0))=0 AND length(ancestor_slot_key) BETWEEN 1 AND 128 AND ancestor_slot_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
  relation TEXT NOT NULL CHECK(instr(relation,char(0))=0 AND relation IN ('CONTINUE','MERGE_CONTINUE','DISTINCT_OUTPUT')),
  review_reason TEXT NOT NULL CHECK(instr(review_reason,char(0))=0 AND length(review_reason) BETWEEN 1 AND 500),
  reviewed_by TEXT NOT NULL CHECK(length(reviewed_by)=36 AND reviewed_by NOT GLOB '*[^0-9a-f-]*' AND substr(reviewed_by,9,1)='-' AND substr(reviewed_by,14,1)='-' AND substr(reviewed_by,19,1)='-' AND substr(reviewed_by,24,1)='-'),
  reviewed_at TEXT CHECK(reviewed_at IS NULL OR (length(reviewed_at)=27 AND reviewed_at GLOB '????-??-??T??:??:??.??????Z')),
  CHECK(registration_state<>'REGISTERED' OR reviewed_at IS NOT NULL),
  FOREIGN KEY(cache_account_id,slot_id) REFERENCES trip_source_output_slots(cache_account_id,slot_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,ancestor_candidate_id) REFERENCES trip_source_candidates(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,slot_id,ancestor_candidate_id,ancestor_slot_key)
);

CREATE TABLE trip_source_slot_dependencies (
  cache_account_id TEXT NOT NULL,
  registration_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(registration_state IN ('PENDING','REGISTERED','CONFLICT','BLOCKED')),
  slot_id TEXT NOT NULL CHECK(length(slot_id)=36 AND slot_id NOT GLOB '*[^0-9a-f-]*' AND substr(slot_id,9,1)='-' AND substr(slot_id,14,1)='-' AND substr(slot_id,19,1)='-' AND substr(slot_id,24,1)='-'),
  predecessor_slot_id TEXT NOT NULL CHECK(length(predecessor_slot_id)=36 AND predecessor_slot_id NOT GLOB '*[^0-9a-f-]*' AND substr(predecessor_slot_id,9,1)='-' AND substr(predecessor_slot_id,14,1)='-' AND substr(predecessor_slot_id,19,1)='-' AND substr(predecessor_slot_id,24,1)='-'),
  dependency_kind TEXT NOT NULL CHECK(instr(dependency_kind,char(0))=0 AND dependency_kind='RECEIPT_SUCCESS'),
  expected_receipt_sha256 TEXT NOT NULL CHECK(instr(expected_receipt_sha256,char(0))=0 AND length(expected_receipt_sha256)=64 AND expected_receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
  expected_target_id TEXT NOT NULL CHECK(length(expected_target_id)=36 AND expected_target_id NOT GLOB '*[^0-9a-f-]*' AND substr(expected_target_id,9,1)='-' AND substr(expected_target_id,14,1)='-' AND substr(expected_target_id,19,1)='-' AND substr(expected_target_id,24,1)='-'),
  expected_result_revision INTEGER NOT NULL CHECK(typeof(expected_result_revision)='integer' AND expected_result_revision BETWEEN 1 AND 9007199254740991),
  FOREIGN KEY(cache_account_id,slot_id) REFERENCES trip_source_output_slots(cache_account_id,slot_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(cache_account_id,predecessor_slot_id) REFERENCES trip_source_output_slots(cache_account_id,slot_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(cache_account_id,slot_id,predecessor_slot_id)
);

CREATE INDEX local_trip_source_runs_scope ON trip_source_runs(cache_account_id,trip_id,actor_account_id,scope_sha256,generation desc);

CREATE INDEX local_trip_source_runs_superseded ON trip_source_runs(cache_account_id,superseded_by);

CREATE INDEX local_trip_source_confirmations_scope ON trip_source_confirmations(cache_account_id,trip_id,actor_account_id,state,id);

CREATE INDEX local_trip_source_inputs_run ON trip_source_inputs(cache_account_id,run_id,id);

CREATE INDEX local_trip_source_inputs_confirmation ON trip_source_inputs(cache_account_id,confirmation_id,id);

CREATE INDEX local_trip_source_inputs_material ON trip_source_inputs(cache_account_id,source_id,material_revision,representation_id);

CREATE INDEX local_trip_source_candidates_run ON trip_source_candidates(cache_account_id,run_id,id);

CREATE UNIQUE INDEX local_trip_source_slot_create_claim ON trip_source_output_slots(cache_account_id,candidate_id,slot_key,intended_target_kind) where disposition='CREATE' and create_claim_active=1;

CREATE INDEX local_trip_source_slot_domain_operation ON trip_source_output_slots(cache_account_id,adapter_key,domain_operation_key) where domain_operation_key is not null;

CREATE INDEX local_trip_source_slot_candidate ON trip_source_output_slots(cache_account_id,candidate_id,slot_key,intended_target_kind);

CREATE INDEX local_trip_source_slot_confirmation ON trip_source_output_slots(cache_account_id,confirmation_id,slot_id);

CREATE INDEX local_trip_source_slot_intended ON trip_source_output_slots(cache_account_id,intended_target_id);

CREATE INDEX local_trip_source_slot_result ON trip_source_output_slots(cache_account_id,result_target_id);

CREATE INDEX local_trip_source_associations_source ON trip_source_associations(cache_account_id,source_id,state);

CREATE INDEX local_trip_source_associations_target ON trip_source_associations(cache_account_id,target_kind,target_id,state);

CREATE INDEX local_trip_source_associations_confirmation ON trip_source_associations(cache_account_id,confirmation_id);

CREATE UNIQUE INDEX local_trip_source_associations_active ON trip_source_associations(cache_account_id,source_id,target_kind,target_id,purpose) where state='ACTIVE';

CREATE INDEX local_trip_source_run_predecessors_parent ON trip_source_run_predecessors(cache_account_id,parent_run_id,child_run_id);

CREATE INDEX local_trip_source_candidate_lineage_parent ON trip_source_candidate_lineage(cache_account_id,parent_candidate_id,child_candidate_id);

CREATE INDEX local_trip_source_slot_lineage_ancestor ON trip_source_slot_lineage_dispositions(cache_account_id,ancestor_candidate_id,ancestor_slot_key,slot_id);

CREATE INDEX local_trip_source_slot_dependencies_predecessor ON trip_source_slot_dependencies(cache_account_id,predecessor_slot_id,slot_id);

CREATE UNIQUE INDEX local_source_storage_identity ON trip_source_representations(cache_account_id,storage_bucket,object_key) WHERE storage_bucket IS NOT NULL AND object_key IS NOT NULL;


CREATE TABLE trip_source_review_drafts (
 account_id TEXT NOT NULL, draft_key TEXT NOT NULL CHECK(length(draft_key) BETWEEN 1 AND 128 AND draft_key NOT GLOB '*[^A-Za-z0-9._:-]*'), trip_id TEXT NOT NULL, run_id TEXT NOT NULL,
 row_revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),
 review_version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(review_version)='integer' AND review_version=1),
 review_payload TEXT NOT NULL CHECK(json_valid(review_payload) AND json_type(review_payload)='object' AND length(CAST(review_payload AS BLOB))<=262144),
 observed_input_sha256 TEXT NOT NULL CHECK(length(observed_input_sha256)=64 AND observed_input_sha256 NOT GLOB '*[^0-9a-f]*'), updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,draft_key), FOREIGN KEY(account_id,run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT
);
CREATE INDEX local_source_review_drafts_scope ON trip_source_review_drafts(account_id,trip_id,updated_at);
CREATE TABLE trip_event_receipt_cache (
 cache_account_id TEXT NOT NULL,trip_id TEXT NOT NULL,actor_account_id TEXT NOT NULL,
 operation_key TEXT NOT NULL,intent_sha256 TEXT NOT NULL CHECK(length(intent_sha256)=64 AND intent_sha256 NOT GLOB '*[^0-9a-f]*'),
 receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
 receipt_version INTEGER NOT NULL CHECK(typeof(receipt_version)='integer' AND receipt_version=1),
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json) AND json_type(receipt_json)='object' AND length(CAST(receipt_json AS BLOB))<=262144),
 PRIMARY KEY(cache_account_id,trip_id,actor_account_id,operation_key), CHECK(cache_account_id=actor_account_id)
);
CREATE INDEX local_event_receipt_scope ON trip_event_receipt_cache(cache_account_id,trip_id);
CREATE TRIGGER local_event_receipt_immutable BEFORE UPDATE ON trip_event_receipt_cache BEGIN SELECT RAISE(ABORT,'IMPORT_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER local_event_receipt_retained BEFORE DELETE ON trip_event_receipt_cache BEGIN SELECT RAISE(ABORT,'IMPORT_RECEIPT_IMMUTABLE'); END;
CREATE TABLE local_capture_source_bindings (
 account_id TEXT NOT NULL,id TEXT NOT NULL,admission_key TEXT NOT NULL CHECK(length(admission_key) BETWEEN 1 AND 128 AND admission_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
 capture_id TEXT NOT NULL CHECK(length(capture_id) BETWEEN 1 AND 128),capture_revision INTEGER NOT NULL CHECK(typeof(capture_revision)='integer' AND capture_revision BETWEEN 1 AND 9007199254740991),
 capture_payload_id TEXT NOT NULL CHECK(length(capture_payload_id) BETWEEN 1 AND 128),material_sha256 TEXT NOT NULL CHECK(length(material_sha256)=64 AND material_sha256 NOT GLOB '*[^0-9a-f]*'),
 byte_count INTEGER NOT NULL CHECK(typeof(byte_count)='integer' AND byte_count BETWEEN 1 AND 10485760),trip_id TEXT NOT NULL,
 intent_kind TEXT NOT NULL CHECK(intent_kind IN ('NEW','REUSE','REPLACEMENT')),source_id TEXT NOT NULL,representation_id TEXT NOT NULL,
 material_revision INTEGER NOT NULL CHECK(typeof(material_revision)='integer' AND material_revision BETWEEN 1 AND 9007199254740991),
 expected_source_revision INTEGER CHECK(expected_source_revision IS NULL OR typeof(expected_source_revision)='integer' AND expected_source_revision BETWEEN 1 AND 9007199254740991),
 source_operation_id TEXT,source_operation_key TEXT,source_operation_sha256 TEXT,source_receipt_sha256 TEXT,
 state TEXT NOT NULL DEFAULT 'PREPARED' CHECK(state IN ('PREPARED','OUTCOME_UNKNOWN','ADMITTED','CONFLICTED','BLOCKED')),
 row_revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(row_revision)='integer' AND row_revision BETWEEN 1 AND 9007199254740991),created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,id),UNIQUE(account_id,trip_id,admission_key),
 FOREIGN KEY(account_id,capture_id) REFERENCES local_capture_inbox(account_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(account_id,capture_payload_id) REFERENCES local_capture_payloads(account_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(account_id,source_id) REFERENCES trip_sources(cache_account_id,id) ON DELETE RESTRICT,
 CHECK((intent_kind='NEW')=(expected_source_revision IS NULL)),
 CHECK((intent_kind='REUSE')=(source_operation_id IS NULL) AND (source_operation_id IS NULL)=(source_operation_key IS NULL) AND (source_operation_id IS NULL)=(source_operation_sha256 IS NULL)),
 CHECK(intent_kind<>'REUSE' OR source_receipt_sha256 IS NULL AND state<>'OUTCOME_UNKNOWN'),
 CHECK(state<>'ADMITTED' OR intent_kind='REUSE' OR source_receipt_sha256 IS NOT NULL)
);
CREATE TRIGGER local_capture_source_binding_immutable BEFORE UPDATE ON local_capture_source_bindings
 WHEN OLD.account_id IS NOT NEW.account_id OR OLD.id IS NOT NEW.id OR OLD.admission_key IS NOT NEW.admission_key OR OLD.capture_id IS NOT NEW.capture_id OR OLD.capture_revision IS NOT NEW.capture_revision OR OLD.capture_payload_id IS NOT NEW.capture_payload_id OR OLD.material_sha256 IS NOT NEW.material_sha256 OR OLD.byte_count IS NOT NEW.byte_count OR OLD.trip_id IS NOT NEW.trip_id OR OLD.intent_kind IS NOT NEW.intent_kind OR OLD.source_id IS NOT NEW.source_id OR OLD.representation_id IS NOT NEW.representation_id OR OLD.material_revision IS NOT NEW.material_revision OR OLD.expected_source_revision IS NOT NEW.expected_source_revision OR OLD.source_operation_id IS NOT NEW.source_operation_id OR OLD.source_operation_key IS NOT NEW.source_operation_key OR OLD.source_operation_sha256 IS NOT NEW.source_operation_sha256 OR OLD.created_at IS NOT NEW.created_at OR OLD.source_receipt_sha256 IS NOT NULL AND OLD.source_receipt_sha256 IS NOT NEW.source_receipt_sha256 OR NEW.row_revision<>OLD.row_revision+1
 BEGIN SELECT RAISE(ABORT,'CAPTURE_SOURCE_BINDING_IMMUTABLE'); END;
CREATE TRIGGER local_capture_source_binding_retained BEFORE DELETE ON local_capture_source_bindings BEGIN SELECT RAISE(ABORT,'CAPTURE_SOURCE_BINDING_RETAINED');END;
CREATE UNIQUE INDEX local_capture_source_operation ON local_capture_source_bindings(account_id,source_operation_id) WHERE source_operation_id IS NOT NULL;
CREATE INDEX local_capture_source_binding_capture ON local_capture_source_bindings(account_id,capture_id,capture_revision);
CREATE INDEX local_capture_source_binding_state ON local_capture_source_bindings(account_id,state);
CREATE TRIGGER local_capture_bound_delete BEFORE DELETE ON local_capture_inbox
 WHEN EXISTS(SELECT 1 FROM local_capture_source_bindings b WHERE b.account_id=OLD.account_id AND b.capture_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'CAPTURE_SOURCE_BINDING_RETAINED'); END;
CREATE TRIGGER local_capture_bound_payload_delete BEFORE DELETE ON local_capture_payloads
 WHEN EXISTS(SELECT 1 FROM local_capture_source_bindings b WHERE b.account_id=OLD.account_id AND b.capture_payload_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'CAPTURE_SOURCE_BINDING_RETAINED'); END;


CREATE TABLE trip_transport_service_mirrors (
 cache_account_id TEXT NOT NULL,trip_id TEXT NOT NULL,event_id TEXT NOT NULL,semantic_revision INTEGER NOT NULL CHECK(typeof(semantic_revision)='integer' AND semantic_revision BETWEEN 1 AND 9007199254740991),
 service_key TEXT NOT NULL CHECK(length(service_key) BETWEEN 1 AND 32 AND service_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
 transport_subtype TEXT NOT NULL CHECK(transport_subtype IN ('FLIGHT','TRAIN','BUS','FERRY')),
 attribution TEXT NOT NULL CHECK(attribution IN ('MARKETING','OPERATING','UNSPECIFIED')),
 operator_namespace TEXT NOT NULL CHECK(operator_namespace IN ('IATA_AIRLINE','ICAO_AIRLINE','AUTHORITY','NAME')),
 operator_issuer TEXT NOT NULL CHECK(length(operator_issuer) BETWEEN 1 AND 128),operator_value TEXT NOT NULL CHECK(length(operator_value) BETWEEN 1 AND 128),
 operator_literal TEXT NOT NULL CHECK(length(operator_literal) BETWEEN 1 AND 255),service_number TEXT NOT NULL CHECK(length(service_number) BETWEEN 1 AND 64),service_literal TEXT NOT NULL CHECK(length(service_literal) BETWEEN 1 AND 255),
 codeshare_operating_key TEXT,provenance_refs TEXT NOT NULL CHECK(json_valid(provenance_refs) AND json_type(provenance_refs)='object' AND length(CAST(provenance_refs AS BLOB))<=16384),
 PRIMARY KEY(cache_account_id,trip_id,event_id,service_key),
 FOREIGN KEY(cache_account_id,trip_id,event_id) REFERENCES trip_canonical_events(account_id,trip_id,event_id) ON DELETE RESTRICT
);
CREATE INDEX local_transport_service_revision ON trip_transport_service_mirrors(cache_account_id,trip_id,event_id,semantic_revision);
  `,
};
