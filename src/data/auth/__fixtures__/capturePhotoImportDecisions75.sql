
CREATE TABLE capture_photo_import_decisions (
 account_id TEXT NOT NULL,
 input_id TEXT NOT NULL,
 decision_revision BLOB NOT NULL CHECK(typeof(decision_revision)='integer' AND decision_revision BETWEEN 1 AND 9007199254740991),
 body_json TEXT NOT NULL CHECK(typeof(body_json)='text' AND json_valid(body_json) AND length(CAST(body_json AS BLOB))<=4096)
  CHECK(json_type(body_json,'$.version') IS 'integer' AND json_extract(body_json,'$.version')=1),
 recorded_at TEXT NOT NULL CHECK(typeof(recorded_at)='text' AND length(recorded_at) BETWEEN 20 AND 64),
 PRIMARY KEY(account_id,input_id),
 FOREIGN KEY(account_id,input_id) REFERENCES capture_submission_inputs(account_id,input_id) ON DELETE RESTRICT
);
CREATE TRIGGER capture_photo_decision_initial BEFORE INSERT ON capture_photo_import_decisions
 WHEN NEW.decision_revision!=1 BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_INITIAL'); END;
CREATE TRIGGER capture_photo_decision_scope_insert BEFORE INSERT ON capture_photo_import_decisions
 WHEN NOT EXISTS(SELECT 1 FROM capture_submission_inputs i
 JOIN local_capture_inbox c ON c.account_id=i.account_id AND c.id=i.capture_id
 JOIN local_capture_payloads p ON p.account_id=c.account_id AND p.id=c.payload_id
 WHERE i.account_id=NEW.account_id AND i.input_id=NEW.input_id
 AND i.acceptance_state='ACCEPTED' AND i.kind='IMAGE' AND c.kind='IMAGE'
 AND json_extract(NEW.body_json,'$.pin.accountId')=i.account_id
 AND json_extract(NEW.body_json,'$.pin.batchId')=i.batch_id
 AND json_extract(NEW.body_json,'$.pin.inputId')=i.input_id
 AND json_extract(NEW.body_json,'$.pin.ordinal')=i.ordinal
 AND json_extract(NEW.body_json,'$.pin.captureId')=c.id
 AND json_extract(NEW.body_json,'$.pin.captureRevision')=c.revision
 AND json_extract(NEW.body_json,'$.pin.payloadId')=i.accepted_payload_id
 AND c.payload_id=i.accepted_payload_id
 AND json_extract(NEW.body_json,'$.pin.sha256')=i.content_sha256
 AND p.sha256=i.content_sha256
 AND json_extract(NEW.body_json,'$.pin.byteCount')=i.content_byte_count
 AND p.byte_count=i.content_byte_count
 AND json_extract(NEW.body_json,'$.pin.mediaType')=i.declared_content_type
 AND c.declared_content_type=i.declared_content_type) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
CREATE TRIGGER capture_photo_decision_scope_update BEFORE UPDATE ON capture_photo_import_decisions
 WHEN NOT EXISTS(SELECT 1 FROM capture_submission_inputs i
 JOIN local_capture_inbox c ON c.account_id=i.account_id AND c.id=i.capture_id
 JOIN local_capture_payloads p ON p.account_id=c.account_id AND p.id=c.payload_id
 WHERE i.account_id=NEW.account_id AND i.input_id=NEW.input_id
 AND i.acceptance_state='ACCEPTED' AND i.kind='IMAGE' AND c.kind='IMAGE'
 AND json_extract(NEW.body_json,'$.pin.accountId')=i.account_id
 AND json_extract(NEW.body_json,'$.pin.batchId')=i.batch_id
 AND json_extract(NEW.body_json,'$.pin.inputId')=i.input_id
 AND json_extract(NEW.body_json,'$.pin.ordinal')=i.ordinal
 AND json_extract(NEW.body_json,'$.pin.captureId')=c.id
 AND json_extract(NEW.body_json,'$.pin.captureRevision')=c.revision
 AND json_extract(NEW.body_json,'$.pin.payloadId')=i.accepted_payload_id
 AND c.payload_id=i.accepted_payload_id
 AND json_extract(NEW.body_json,'$.pin.sha256')=i.content_sha256
 AND p.sha256=i.content_sha256
 AND json_extract(NEW.body_json,'$.pin.byteCount')=i.content_byte_count
 AND p.byte_count=i.content_byte_count
 AND json_extract(NEW.body_json,'$.pin.mediaType')=i.declared_content_type
 AND c.declared_content_type=i.declared_content_type) BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_ORIGINAL_CHANGED'); END;
CREATE TRIGGER capture_photo_decision_update BEFORE UPDATE ON capture_photo_import_decisions
 WHEN NEW.account_id IS NOT OLD.account_id OR NEW.input_id IS NOT OLD.input_id
 OR NEW.decision_revision!=OLD.decision_revision+1 OR NEW.body_json IS OLD.body_json
 BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_CAS_REQUIRED'); END;
CREATE TRIGGER capture_photo_decision_retain BEFORE DELETE ON capture_photo_import_decisions
 BEGIN SELECT RAISE(ABORT,'PHOTO_DECISION_RETAINED'); END;
