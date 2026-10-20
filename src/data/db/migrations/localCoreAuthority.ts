import type { Migration } from "../migrations";

// SQLite69 exact DDL: docs/ops/local-reviewed-import-v1-20261019/TECHNICAL_FREEZE.md
export const localCoreAuthorityMigration: Migration = {
  id: 69,
  name: "local_core_authority_v1",
  sql: `
CREATE TABLE local_core_review_decisions (
 account_id TEXT NOT NULL,
 trip_id TEXT NOT NULL,
 confirmation_id TEXT NOT NULL,
 confirmation_key TEXT NOT NULL CHECK(length(confirmation_key) BETWEEN 1 AND 128 AND confirmation_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
 decision_revision INTEGER NOT NULL CHECK(typeof(decision_revision)='integer' AND decision_revision BETWEEN 1 AND 9007199254740991),
 actor_account_id TEXT NOT NULL,
 reviewed_run_id TEXT NOT NULL,
 reviewed_run_revision INTEGER NOT NULL CHECK(typeof(reviewed_run_revision)='integer' AND reviewed_run_revision BETWEEN 1 AND 9007199254740991),
 input_digest TEXT NOT NULL CHECK(length(input_digest)=64 AND input_digest NOT GLOB '*[^0-9a-f]*'),
 candidate_set_digest TEXT NOT NULL CHECK(length(candidate_set_digest)=64 AND candidate_set_digest NOT GLOB '*[^0-9a-f]*'),
 selections_digest TEXT NOT NULL CHECK(length(selections_digest)=64 AND selections_digest NOT GLOB '*[^0-9a-f]*'),
 decision_sha256 TEXT NOT NULL CHECK(length(decision_sha256)=64 AND decision_sha256 NOT GLOB '*[^0-9a-f]*'),
 decision_json TEXT NOT NULL CHECK(json_valid(decision_json) AND json_type(decision_json)='object' AND length(CAST(decision_json AS BLOB)) BETWEEN 2 AND 262144),
 selections_json TEXT NOT NULL CHECK(json_valid(selections_json) AND json_type(selections_json)='array' AND json_array_length(selections_json) BETWEEN 1 AND 64 AND length(CAST(selections_json AS BLOB))<=1048576),
 candidate_refs_json TEXT NOT NULL CHECK(json_valid(candidate_refs_json) AND json_type(candidate_refs_json)='array' AND json_array_length(candidate_refs_json) BETWEEN 1 AND 64 AND length(CAST(candidate_refs_json AS BLOB))<=4096),
 material_pins_json TEXT NOT NULL CHECK(json_valid(material_pins_json) AND json_type(material_pins_json)='array' AND json_array_length(material_pins_json) BETWEEN 1 AND 64 AND length(CAST(material_pins_json AS BLOB))<=65536),
 saved_at TEXT NOT NULL CHECK(length(saved_at)=27 AND saved_at GLOB '????-??-??T??:??:??.??????Z'),
 PRIMARY KEY(account_id,trip_id,confirmation_id,decision_revision),
 UNIQUE(account_id,trip_id,confirmation_key,decision_revision),
 FOREIGN KEY(account_id,reviewed_run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 CHECK(account_id=actor_account_id),
 CHECK(length(account_id)=36 AND account_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(trip_id)=36 AND trip_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(confirmation_id)=36 AND confirmation_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(reviewed_run_id)=36 AND reviewed_run_id NOT GLOB '*[^0-9a-f-]*')
);
CREATE TABLE local_core_authority_commits (
 account_id TEXT NOT NULL,
 trip_id TEXT NOT NULL,
 commit_id TEXT NOT NULL,
 authority_version INTEGER NOT NULL CHECK(typeof(authority_version)='integer' AND authority_version=1),
 authority_kind TEXT NOT NULL CHECK(authority_kind IN ('LOCAL_MANUAL','LOCAL_REVIEWED_SOURCE')),
 envelope_schema_id TEXT NOT NULL,
 actor_person_id TEXT,
 reviewed_run_id TEXT,
 run_revision INTEGER,
 input_digest TEXT,
 candidate_set_digest TEXT,
 confirmation_id TEXT,
 confirmation_key TEXT,
 decision_revision INTEGER,
 decision_sha256 TEXT,
 envelope_sha256 TEXT NOT NULL CHECK(length(envelope_sha256)=64 AND envelope_sha256 NOT GLOB '*[^0-9a-f]*'),
 envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json) AND json_type(envelope_json)='object' AND length(CAST(envelope_json AS BLOB)) BETWEEN 2 AND 1048576),
 created_at TEXT NOT NULL CHECK(length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z'),
 PRIMARY KEY(account_id,trip_id,commit_id),
 UNIQUE(account_id,commit_id),
 FOREIGN KEY(account_id,reviewed_run_id) REFERENCES trip_source_runs(cache_account_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 CHECK(length(account_id)=36 AND account_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(trip_id)=36 AND trip_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(commit_id)=36 AND commit_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(actor_person_id IS NULL OR (length(actor_person_id)=36 AND actor_person_id NOT GLOB '*[^0-9a-f-]*')),
 CHECK(reviewed_run_id IS NULL OR (length(reviewed_run_id)=36 AND reviewed_run_id NOT GLOB '*[^0-9a-f-]*')),
 CHECK(confirmation_id IS NULL OR (length(confirmation_id)=36 AND confirmation_id NOT GLOB '*[^0-9a-f-]*')),
 CHECK(input_digest IS NULL OR (length(input_digest)=64 AND input_digest NOT GLOB '*[^0-9a-f]*')),
 CHECK(candidate_set_digest IS NULL OR (length(candidate_set_digest)=64 AND candidate_set_digest NOT GLOB '*[^0-9a-f]*')),
 CHECK(decision_sha256 IS NULL OR (length(decision_sha256)=64 AND decision_sha256 NOT GLOB '*[^0-9a-f]*')),
 CHECK(run_revision IS NULL OR (typeof(run_revision)='integer' AND run_revision BETWEEN 1 AND 9007199254740991)),
 CHECK(decision_revision IS NULL OR (typeof(decision_revision)='integer' AND decision_revision BETWEEN 1 AND 9007199254740991)),
 CHECK(confirmation_key IS NULL OR (length(confirmation_key) BETWEEN 1 AND 128 AND confirmation_key NOT GLOB '*[^A-Za-z0-9._:-]*')),
 CHECK((authority_kind='LOCAL_MANUAL' AND envelope_schema_id='otr.trip.local-manual-commit/1' AND actor_person_id IS NOT NULL AND reviewed_run_id IS NULL AND run_revision IS NULL AND input_digest IS NULL AND candidate_set_digest IS NULL AND confirmation_id IS NULL AND confirmation_key IS NULL AND decision_revision IS NULL AND decision_sha256 IS NULL)
    OR (authority_kind='LOCAL_REVIEWED_SOURCE' AND envelope_schema_id='otr.trip.local-reviewed-import/1' AND actor_person_id IS NULL AND reviewed_run_id IS NOT NULL AND run_revision IS NOT NULL AND input_digest IS NOT NULL AND candidate_set_digest IS NOT NULL AND confirmation_id IS NOT NULL AND confirmation_key IS NOT NULL AND decision_revision IS NOT NULL AND decision_sha256 IS NOT NULL))
);
CREATE TABLE local_core_authority_materials (
 account_id TEXT NOT NULL,
 trip_id TEXT NOT NULL,
 commit_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 material_revision INTEGER NOT NULL CHECK(typeof(material_revision)='integer' AND material_revision BETWEEN 1 AND 9007199254740991),
 representation_id TEXT NOT NULL,
 source_local_revision INTEGER NOT NULL CHECK(typeof(source_local_revision)='integer' AND source_local_revision BETWEEN 1 AND 9007199254740991),
 capture_id TEXT NOT NULL,
 capture_revision INTEGER NOT NULL CHECK(typeof(capture_revision)='integer' AND capture_revision BETWEEN 1 AND 9007199254740991),
 batch_id TEXT NOT NULL,
 input_id TEXT NOT NULL,
 original_sha256 TEXT NOT NULL CHECK(length(original_sha256)=64 AND original_sha256 NOT GLOB '*[^0-9a-f]*'),
 original_byte_count INTEGER NOT NULL CHECK(typeof(original_byte_count)='integer' AND original_byte_count BETWEEN 1 AND 10485760),
 extraction_result_digest TEXT NOT NULL CHECK(length(extraction_result_digest)=64 AND extraction_result_digest NOT GLOB '*[^0-9a-f]*'),
 evidence_catalog_digest TEXT NOT NULL CHECK(length(evidence_catalog_digest)=64 AND evidence_catalog_digest NOT GLOB '*[^0-9a-f]*'),
 PRIMARY KEY(account_id,trip_id,commit_id,source_id,material_revision,representation_id,input_id),
 FOREIGN KEY(account_id,trip_id,commit_id) REFERENCES local_core_authority_commits(account_id,trip_id,commit_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account_id,source_id,material_revision) REFERENCES trip_source_revisions(cache_account_id,source_id,material_revision) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account_id,source_id,representation_id) REFERENCES trip_source_representations(cache_account_id,source_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account_id,input_id) REFERENCES capture_submission_inputs(account_id,input_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE local_core_authority_slots (
 account_id TEXT NOT NULL,
 trip_id TEXT NOT NULL,
 commit_id TEXT NOT NULL,
 slot_id TEXT NOT NULL,
 slot_key TEXT NOT NULL CHECK(length(slot_key) BETWEEN 1 AND 128 AND slot_key NOT GLOB '*[^A-Za-z0-9._:-]*'),
 disposition TEXT NOT NULL CHECK(disposition IN ('CREATE','UPDATE')),
 target_kind TEXT NOT NULL CHECK(target_kind IN ('ITEM','BOOKING')),
 target_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 queue_operation_id TEXT NOT NULL,
 candidate_id TEXT,
 candidate_sha256 TEXT,
 reviewed_run_id TEXT,
 output_purpose_digest TEXT,
 intent_sha256 TEXT NOT NULL CHECK(length(intent_sha256)=64 AND intent_sha256 NOT GLOB '*[^0-9a-f]*'),
 proof_sha256 TEXT,
 local_revision INTEGER NOT NULL CHECK(typeof(local_revision)='integer' AND local_revision BETWEEN 1 AND 9007199254740991),
 result_digest TEXT NOT NULL CHECK(length(result_digest)=64 AND result_digest NOT GLOB '*[^0-9a-f]*'),
 receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
 command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json)='object' AND length(CAST(command_json AS BLOB)) BETWEEN 2 AND 262144),
 proof_json TEXT CHECK(proof_json IS NULL OR (json_valid(proof_json) AND json_type(proof_json)='object' AND length(CAST(proof_json AS BLOB)) BETWEEN 2 AND 262144)),
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json) AND json_type(receipt_json)='object' AND length(CAST(receipt_json AS BLOB)) BETWEEN 2 AND 262144),
 depends_on_json TEXT NOT NULL CHECK(json_valid(depends_on_json) AND json_type(depends_on_json)='array' AND json_array_length(depends_on_json) BETWEEN 0 AND 64 AND length(CAST(depends_on_json AS BLOB))<=262144),
 claim_identity TEXT CHECK(claim_identity IS NULL OR (length(claim_identity)=64 AND claim_identity NOT GLOB '*[^0-9a-f]*')),
 created_at TEXT NOT NULL CHECK(length(created_at)=27 AND created_at GLOB '????-??-??T??:??:??.??????Z'),
 PRIMARY KEY(account_id,trip_id,commit_id,slot_id),
 UNIQUE(account_id,slot_id),
 UNIQUE(account_id,operation_id),
 UNIQUE(account_id,queue_operation_id),
 UNIQUE(account_id,trip_id,commit_id,slot_key),
 FOREIGN KEY(account_id,trip_id,commit_id) REFERENCES local_core_authority_commits(account_id,trip_id,commit_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account_id,reviewed_run_id,candidate_id) REFERENCES trip_source_candidates(cache_account_id,run_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(account_id,queue_operation_id) REFERENCES sync_operations(owner_user_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 CHECK(length(slot_id)=36 AND slot_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(target_id)=36 AND target_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(operation_id)=36 AND operation_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(length(queue_operation_id)=36 AND queue_operation_id NOT GLOB '*[^0-9a-f-]*'),
 CHECK(candidate_sha256 IS NULL OR (length(candidate_sha256)=64 AND candidate_sha256 NOT GLOB '*[^0-9a-f]*')),
 CHECK(output_purpose_digest IS NULL OR (length(output_purpose_digest)=64 AND output_purpose_digest NOT GLOB '*[^0-9a-f]*')),
 CHECK(proof_sha256 IS NULL OR (length(proof_sha256)=64 AND proof_sha256 NOT GLOB '*[^0-9a-f]*')),
 CHECK(queue_operation_id=operation_id),
 CHECK((disposition='CREATE' AND claim_identity IS NOT NULL) OR (disposition='UPDATE' AND claim_identity IS NULL)),
 CHECK((candidate_id IS NULL AND candidate_sha256 IS NULL AND reviewed_run_id IS NULL AND output_purpose_digest IS NULL AND proof_sha256 IS NULL AND proof_json IS NULL)
    OR (candidate_id IS NOT NULL AND candidate_sha256 IS NOT NULL AND reviewed_run_id IS NOT NULL AND output_purpose_digest IS NOT NULL AND proof_sha256 IS NOT NULL AND proof_json IS NOT NULL))
);
CREATE UNIQUE INDEX local_core_authority_create_claim ON local_core_authority_slots(account_id,trip_id,claim_identity) WHERE claim_identity IS NOT NULL;
CREATE INDEX local_core_authority_target ON local_core_authority_slots(account_id,trip_id,target_kind,target_id,local_revision);
CREATE INDEX local_core_authority_candidate ON local_core_authority_slots(account_id,reviewed_run_id,candidate_id) WHERE candidate_id IS NOT NULL;
CREATE TRIGGER local_core_review_immutable BEFORE UPDATE ON local_core_review_decisions BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER local_core_review_retained BEFORE DELETE ON local_core_review_decisions BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_RETAINED'); END;
CREATE TRIGGER local_core_review_run_scope BEFORE INSERT ON local_core_review_decisions WHEN NOT EXISTS(SELECT 1 FROM trip_source_runs r WHERE r.cache_account_id=NEW.account_id AND r.id=NEW.reviewed_run_id AND r.trip_id=NEW.trip_id AND r.actor_account_id=NEW.actor_account_id AND r.row_revision=NEW.reviewed_run_revision AND r.input_sha256=NEW.input_digest AND r.state='READY' AND r.retention_state='RETAINED') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_RUN_SCOPE'); END;
CREATE TRIGGER local_core_review_candidate_scope BEFORE INSERT ON local_core_review_decisions WHEN EXISTS(SELECT 1 FROM json_each(NEW.candidate_refs_json) j WHERE j.type<>'text' OR NOT EXISTS(SELECT 1 FROM trip_source_candidates c WHERE c.cache_account_id=NEW.account_id AND c.run_id=NEW.reviewed_run_id AND c.id=j.value AND c.proposal IS NOT NULL AND c.retention_state='RETAINED')) OR (SELECT count(DISTINCT value) FROM json_each(NEW.candidate_refs_json))<>json_array_length(NEW.candidate_refs_json) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_CANDIDATE_SCOPE'); END;
CREATE TRIGGER local_core_review_material_scope BEFORE INSERT ON local_core_review_decisions WHEN EXISTS(SELECT 1 FROM json_each(NEW.material_pins_json) j WHERE j.type<>'object' OR NOT EXISTS(SELECT 1 FROM trip_sources s JOIN trip_source_revisions v ON v.cache_account_id=s.cache_account_id AND v.source_id=s.id JOIN trip_source_representations p ON p.cache_account_id=s.cache_account_id AND p.source_id=s.id JOIN local_capture_source_bindings b ON b.account_id=s.cache_account_id AND b.trip_id=s.trip_id AND b.source_id=s.id AND b.representation_id=p.id AND b.material_revision=v.material_revision JOIN capture_submission_inputs ci ON ci.account_id=b.account_id AND ci.capture_id=b.capture_id JOIN local_capture_inbox inbox ON inbox.account_id=b.account_id AND inbox.id=b.capture_id AND inbox.payload_id=b.capture_payload_id AND inbox.trip_id=b.trip_id AND inbox.revision=b.capture_revision AND inbox.state='ASSIGNED' WHERE s.cache_account_id=NEW.account_id AND s.trip_id=NEW.trip_id AND s.id=json_extract(j.value,'$.sourceId') AND s.row_revision=json_extract(j.value,'$.sourceLocalRevision') AND s.lifecycle='ACTIVE' AND s.retention_state='RETAINED' AND v.material_revision=json_extract(j.value,'$.materialRevision') AND v.retention_state='RETAINED' AND p.id=json_extract(j.value,'$.representationId') AND p.retention_state='RETAINED' AND ci.accepted_capture_revision=json_extract(j.value,'$.captureRevision') AND ci.accepted_payload_id=b.capture_payload_id AND ci.content_sha256=b.material_sha256 AND ci.content_byte_count=b.byte_count AND b.material_sha256=json_extract(j.value,'$.originalSha256') AND b.byte_count=json_extract(j.value,'$.originalByteCount') AND ci.input_id=json_extract(j.value,'$.inputId') AND ci.batch_id=json_extract(j.value,'$.batchId') AND ci.acceptance_state='ACCEPTED')) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_MATERIAL_SCOPE'); END;
CREATE TRIGGER local_core_review_commit_scope BEFORE INSERT ON local_core_authority_commits WHEN NEW.authority_kind='LOCAL_REVIEWED_SOURCE' AND NOT EXISTS(SELECT 1 FROM local_core_review_decisions d WHERE d.account_id=NEW.account_id AND d.trip_id=NEW.trip_id AND d.confirmation_id=NEW.confirmation_id AND d.confirmation_key=NEW.confirmation_key AND d.decision_revision=NEW.decision_revision AND d.reviewed_run_id=NEW.reviewed_run_id AND d.reviewed_run_revision=NEW.run_revision AND d.input_digest=NEW.input_digest AND d.candidate_set_digest=NEW.candidate_set_digest AND d.decision_sha256=NEW.decision_sha256) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_REQUIRED'); END;
CREATE TRIGGER local_core_authority_commit_immutable BEFORE UPDATE ON local_core_authority_commits BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_AUTHORITY_IMMUTABLE'); END;
CREATE TRIGGER local_core_authority_commit_retained BEFORE DELETE ON local_core_authority_commits BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_AUTHORITY_RETAINED'); END;
CREATE TRIGGER local_core_authority_material_immutable BEFORE UPDATE ON local_core_authority_materials BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_MATERIAL_IMMUTABLE'); END;
CREATE TRIGGER local_core_authority_material_retained BEFORE DELETE ON local_core_authority_materials BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_MATERIAL_RETAINED'); END;
CREATE TRIGGER local_core_authority_slot_immutable BEFORE UPDATE ON local_core_authority_slots BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_SLOT_IMMUTABLE'); END;
CREATE TRIGGER local_core_authority_slot_retained BEFORE DELETE ON local_core_authority_slots BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_SLOT_RETAINED'); END;
CREATE TRIGGER local_core_authority_material_limit BEFORE INSERT ON local_core_authority_materials WHEN (SELECT count(*) FROM local_core_authority_materials WHERE account_id=NEW.account_id AND trip_id=NEW.trip_id AND commit_id=NEW.commit_id)>=64 BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_MATERIAL_LIMIT'); END;
CREATE TRIGGER local_core_authority_slot_limit BEFORE INSERT ON local_core_authority_slots WHEN (SELECT count(*) FROM local_core_authority_slots WHERE account_id=NEW.account_id AND trip_id=NEW.trip_id AND commit_id=NEW.commit_id)>=64 BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_SLOT_LIMIT'); END;
CREATE TRIGGER local_core_authority_material_scope BEFORE INSERT ON local_core_authority_materials WHEN NOT EXISTS(SELECT 1 FROM local_core_authority_commits c WHERE c.account_id=NEW.account_id AND c.trip_id=NEW.trip_id AND c.commit_id=NEW.commit_id AND c.authority_kind='LOCAL_REVIEWED_SOURCE') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_MATERIAL_AUTHORITY'); END;
CREATE TRIGGER local_core_authority_slot_scope BEFORE INSERT ON local_core_authority_slots WHEN NOT EXISTS(SELECT 1 FROM local_core_authority_commits c WHERE c.account_id=NEW.account_id AND c.trip_id=NEW.trip_id AND c.commit_id=NEW.commit_id AND ((c.authority_kind='LOCAL_MANUAL' AND NEW.slot_key=NEW.slot_id AND NEW.candidate_id IS NULL AND NEW.candidate_sha256 IS NULL AND NEW.reviewed_run_id IS NULL AND NEW.output_purpose_digest IS NULL AND NEW.proof_sha256 IS NULL AND NEW.proof_json IS NULL) OR (c.authority_kind='LOCAL_REVIEWED_SOURCE' AND NEW.candidate_id IS NOT NULL AND NEW.candidate_sha256 IS NOT NULL AND NEW.reviewed_run_id=c.reviewed_run_id AND NEW.output_purpose_digest IS NOT NULL AND NEW.proof_sha256 IS NOT NULL AND NEW.proof_json IS NOT NULL))) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_SLOT_AUTHORITY'); END;
CREATE TRIGGER local_core_authority_slot_queue BEFORE INSERT ON local_core_authority_slots WHEN NOT EXISTS(SELECT 1 FROM sync_operations q WHERE q.id=NEW.queue_operation_id AND q.owner_user_id=NEW.account_id AND q.trip_id=NEW.trip_id AND q.entity_type='TRIP_CORE_LOCAL' AND q.entity_id=NEW.target_id AND q.operation_type='LOCAL_CORE_COMMIT' AND q.status='DEPENDENCY_BLOCKED' AND q.next_attempt_at IS NULL AND json_valid(q.payload_json) AND json_extract(q.payload_json,'$.schemaId')='otr.trip.local-core-queue/1' AND json_extract(q.payload_json,'$.commitId')=NEW.commit_id AND json_extract(q.payload_json,'$.slotId')=NEW.slot_id AND json_extract(q.payload_json,'$.receiptSha256')=NEW.receipt_sha256) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_QUEUE_SCOPE'); END;
CREATE TRIGGER local_core_authority_run_retained BEFORE DELETE ON trip_source_runs WHEN EXISTS(SELECT 1 FROM local_core_authority_commits WHERE account_id=OLD.cache_account_id AND reviewed_run_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions WHERE account_id=OLD.cache_account_id AND reviewed_run_id=OLD.id) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_RUN_RETAINED'); END;
CREATE TRIGGER local_core_authority_candidate_retained BEFORE DELETE ON trip_source_candidates WHEN EXISTS(SELECT 1 FROM local_core_authority_slots WHERE account_id=OLD.cache_account_id AND reviewed_run_id=OLD.run_id AND candidate_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.candidate_refs_json) j WHERE d.account_id=OLD.cache_account_id AND d.reviewed_run_id=OLD.run_id AND j.value=OLD.id) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_CANDIDATE_RETAINED'); END;
CREATE TRIGGER local_core_review_input_retained BEFORE DELETE ON trip_source_inputs WHEN EXISTS(SELECT 1 FROM local_core_review_decisions d WHERE d.account_id=OLD.cache_account_id AND d.reviewed_run_id=OLD.run_id) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_INPUT_RETAINED'); END;
CREATE TRIGGER local_core_review_input_material_guard BEFORE UPDATE ON trip_source_inputs WHEN EXISTS(SELECT 1 FROM local_core_review_decisions d WHERE d.account_id=OLD.cache_account_id AND d.reviewed_run_id=OLD.run_id) AND (NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.id IS NOT OLD.id OR NEW.run_id IS NOT OLD.run_id OR NEW.source_id IS NOT OLD.source_id OR NEW.material_revision IS NOT OLD.material_revision OR NEW.representation_id IS NOT OLD.representation_id OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.byte_count IS NOT OLD.byte_count OR NEW.observed_source_row_revision IS NOT OLD.observed_source_row_revision OR NEW.historical_selection IS NOT OLD.historical_selection) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVIEW_INPUT_RETAINED'); END;
CREATE TRIGGER local_core_authority_queue_retained BEFORE DELETE ON sync_operations WHEN EXISTS(SELECT 1 FROM local_core_authority_slots WHERE queue_operation_id=OLD.id) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_QUEUE_RETAINED'); END;
CREATE TRIGGER local_core_authority_source_retained BEFORE DELETE ON trip_sources WHEN EXISTS(SELECT 1 FROM local_core_authority_materials WHERE account_id=OLD.cache_account_id AND source_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.material_pins_json) j WHERE d.account_id=OLD.cache_account_id AND json_extract(j.value,'$.sourceId')=OLD.id) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_SOURCE_RETAINED'); END;
CREATE TRIGGER local_core_authority_revision_retained BEFORE DELETE ON trip_source_revisions WHEN EXISTS(SELECT 1 FROM local_core_authority_materials WHERE account_id=OLD.cache_account_id AND source_id=OLD.source_id AND material_revision=OLD.material_revision) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.material_pins_json) j WHERE d.account_id=OLD.cache_account_id AND json_extract(j.value,'$.sourceId')=OLD.source_id AND json_extract(j.value,'$.materialRevision')=OLD.material_revision) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVISION_RETAINED'); END;
CREATE TRIGGER local_core_authority_representation_retained BEFORE DELETE ON trip_source_representations WHEN EXISTS(SELECT 1 FROM local_core_authority_materials WHERE account_id=OLD.cache_account_id AND source_id=OLD.source_id AND representation_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.material_pins_json) j WHERE d.account_id=OLD.cache_account_id AND json_extract(j.value,'$.sourceId')=OLD.source_id AND json_extract(j.value,'$.representationId')=OLD.id) BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REPRESENTATION_RETAINED'); END;
CREATE TRIGGER local_core_authority_source_material_guard BEFORE UPDATE ON trip_sources WHEN (EXISTS(SELECT 1 FROM local_core_authority_materials WHERE account_id=OLD.cache_account_id AND source_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.material_pins_json) j WHERE d.account_id=OLD.cache_account_id AND json_extract(j.value,'$.sourceId')=OLD.id)) AND (NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.id IS NOT OLD.id OR NEW.trip_id IS NOT OLD.trip_id OR NEW.row_revision IS NOT OLD.row_revision OR NEW.acquisition_sha256 IS NOT OLD.acquisition_sha256 OR NEW.retention_state<>'RETAINED' OR NEW.lifecycle<>'ACTIVE') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_SOURCE_MATERIAL_RETAINED'); END;
CREATE TRIGGER local_core_authority_revision_material_guard BEFORE UPDATE ON trip_source_revisions WHEN (EXISTS(SELECT 1 FROM local_core_authority_materials WHERE account_id=OLD.cache_account_id AND source_id=OLD.source_id AND material_revision=OLD.material_revision) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.material_pins_json) j WHERE d.account_id=OLD.cache_account_id AND json_extract(j.value,'$.sourceId')=OLD.source_id AND json_extract(j.value,'$.materialRevision')=OLD.material_revision)) AND (NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.source_id IS NOT OLD.source_id OR NEW.material_revision IS NOT OLD.material_revision OR NEW.capture_sha256 IS NOT OLD.capture_sha256 OR NEW.original_representation_ids IS NOT OLD.original_representation_ids OR NEW.retention_state<>'RETAINED') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REVISION_MATERIAL_RETAINED'); END;
CREATE TRIGGER local_core_authority_representation_material_guard BEFORE UPDATE ON trip_source_representations WHEN (EXISTS(SELECT 1 FROM local_core_authority_materials WHERE account_id=OLD.cache_account_id AND source_id=OLD.source_id AND representation_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.material_pins_json) j WHERE d.account_id=OLD.cache_account_id AND json_extract(j.value,'$.sourceId')=OLD.source_id AND json_extract(j.value,'$.representationId')=OLD.id)) AND (NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.source_id IS NOT OLD.source_id OR NEW.id IS NOT OLD.id OR NEW.introduced_revision IS NOT OLD.introduced_revision OR NEW.role IS NOT OLD.role OR NEW.material_kind IS NOT OLD.material_kind OR NEW.original_filename IS NOT OLD.original_filename OR NEW.part_key IS NOT OLD.part_key OR NEW.mime_type IS NOT OLD.mime_type OR NEW.encoding IS NOT OLD.encoding OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.byte_count IS NOT OLD.byte_count OR NEW.text_content IS NOT OLD.text_content OR NEW.locator_uri IS NOT OLD.locator_uri OR NEW.parent_ids IS NOT OLD.parent_ids OR NEW.transform_key IS NOT OLD.transform_key OR NEW.transform_version IS NOT OLD.transform_version OR NEW.transform_options_sha256 IS NOT OLD.transform_options_sha256 OR NEW.retention_state<>'RETAINED') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_REPRESENTATION_MATERIAL_RETAINED'); END;
CREATE TRIGGER local_core_authority_run_material_guard BEFORE UPDATE ON trip_source_runs WHEN (EXISTS(SELECT 1 FROM local_core_authority_commits WHERE account_id=OLD.cache_account_id AND reviewed_run_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions WHERE account_id=OLD.cache_account_id AND reviewed_run_id=OLD.id)) AND (NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.id IS NOT OLD.id OR NEW.trip_id IS NOT OLD.trip_id OR NEW.actor_account_id IS NOT OLD.actor_account_id OR NEW.row_revision IS NOT OLD.row_revision OR NEW.scope_source_ids IS NOT OLD.scope_source_ids OR NEW.scope_sha256 IS NOT OLD.scope_sha256 OR NEW.generation IS NOT OLD.generation OR NEW.input_sha256 IS NOT OLD.input_sha256 OR NEW.extractor_key IS NOT OLD.extractor_key OR NEW.extractor_version IS NOT OLD.extractor_version OR NEW.extractor_options_sha256 IS NOT OLD.extractor_options_sha256 OR NEW.retention_state<>'RETAINED') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_RUN_MATERIAL_RETAINED'); END;
CREATE TRIGGER local_core_authority_candidate_material_guard BEFORE UPDATE ON trip_source_candidates WHEN (EXISTS(SELECT 1 FROM local_core_authority_slots WHERE account_id=OLD.cache_account_id AND reviewed_run_id=OLD.run_id AND candidate_id=OLD.id) OR EXISTS(SELECT 1 FROM local_core_review_decisions d,json_each(d.candidate_refs_json) j WHERE d.account_id=OLD.cache_account_id AND d.reviewed_run_id=OLD.run_id AND j.value=OLD.id)) AND (NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.id IS NOT OLD.id OR NEW.run_id IS NOT OLD.run_id OR NEW.proposal_sha256 IS NOT OLD.proposal_sha256 OR NEW.proposal IS NOT OLD.proposal OR NEW.retention_state<>'RETAINED') BEGIN SELECT RAISE(ABORT,'LOCAL_CORE_CANDIDATE_MATERIAL_RETAINED'); END;
`,
};
