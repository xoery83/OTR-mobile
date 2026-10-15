import type { Migration } from "../migrations";

// Account-scoped local observations. These rows confer no Trip or Source authority.
export const captureLocalInterpretationMigration: Migration = {
  id: 67,
  name: "capture_local_interpretation",
  sql: `
CREATE TABLE capture_local_interpretation_results (
  account_id TEXT NOT NULL,
  input_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  original_sha256 TEXT NOT NULL CHECK(length(original_sha256)=64),
  original_byte_count INTEGER NOT NULL CHECK(original_byte_count BETWEEN 1 AND 10485760),
  result_json TEXT NOT NULL CHECK(json_valid(result_json) AND length(CAST(result_json AS BLOB))<=2097152),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(account_id,input_id),
  FOREIGN KEY(account_id,input_id) REFERENCES capture_submission_inputs(account_id,input_id) ON DELETE RESTRICT,
  FOREIGN KEY(operation_id) REFERENCES sync_operations(id) ON DELETE RESTRICT
);
CREATE TRIGGER capture_local_result_immutable BEFORE UPDATE ON capture_local_interpretation_results BEGIN SELECT RAISE(ABORT,'CAPTURE_LOCAL_RESULT_IMMUTABLE'); END;
CREATE TRIGGER capture_local_result_retain BEFORE DELETE ON capture_local_interpretation_results BEGIN SELECT RAISE(ABORT,'CAPTURE_LOCAL_RESULT_RETAINED'); END;
CREATE TRIGGER capture_local_result_scope BEFORE INSERT ON capture_local_interpretation_results
WHEN NOT EXISTS (SELECT 1 FROM sync_operations o WHERE o.id=NEW.operation_id AND o.owner_user_id=NEW.account_id AND o.entity_id=NEW.input_id AND o.operation_type='CAPTURE_LOCAL_INTERPRET' AND o.status='PROCESSING')
BEGIN SELECT RAISE(ABORT,'CAPTURE_LOCAL_RESULT_SCOPE'); END;
CREATE TABLE capture_local_interpretation_events (
  account_id TEXT NOT NULL,
  input_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL CHECK(state IN ('PENDING','PROCESSING','RETRYABLE','FAILED','LOCAL_RESULT_RECORDED')),
  recorded_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  FOREIGN KEY(account_id,input_id) REFERENCES capture_submission_inputs(account_id,input_id) ON DELETE RESTRICT,
  FOREIGN KEY(operation_id) REFERENCES sync_operations(id) ON DELETE RESTRICT
);
CREATE INDEX capture_local_events_input ON capture_local_interpretation_events(account_id,input_id,sequence);
CREATE TRIGGER capture_local_event_immutable BEFORE UPDATE ON capture_local_interpretation_events BEGIN SELECT RAISE(ABORT,'CAPTURE_LOCAL_EVENT_IMMUTABLE'); END;
CREATE TRIGGER capture_local_event_retain BEFORE DELETE ON capture_local_interpretation_events BEGIN SELECT RAISE(ABORT,'CAPTURE_LOCAL_EVENT_RETAINED'); END;
CREATE TRIGGER capture_local_queue_insert AFTER INSERT ON sync_operations
WHEN NEW.operation_type='CAPTURE_LOCAL_INTERPRET'
BEGIN
  SELECT CASE WHEN NEW.entity_type!='CAPTURE_SUBMISSION_INPUT' OR NEW.trip_id IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM sync_operations c WHERE c.id='capture-processing:'||NEW.entity_id AND c.owner_user_id=NEW.owner_user_id AND c.status='COMPLETED' AND c.operation_type='CAPTURE_PROCESSING_VALIDATE'
  ) THEN RAISE(ABORT,'CAPTURE_LOCAL_PREREQUISITE') END;
  INSERT INTO capture_local_interpretation_events(account_id,input_id,operation_id,state,recorded_at,attempt_count)
  VALUES(NEW.owner_user_id,NEW.entity_id,NEW.id,NEW.status,NEW.updated_at,NEW.attempt_count);
END;
CREATE TRIGGER capture_local_queue_update AFTER UPDATE ON sync_operations
WHEN OLD.operation_type='CAPTURE_LOCAL_INTERPRET' OR NEW.operation_type='CAPTURE_LOCAL_INTERPRET'
BEGIN
  SELECT CASE WHEN NEW.owner_user_id IS NOT OLD.owner_user_id OR NEW.entity_id IS NOT OLD.entity_id OR NEW.entity_type IS NOT OLD.entity_type OR NEW.operation_type IS NOT OLD.operation_type OR NEW.payload_json IS NOT OLD.payload_json OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.trip_id IS NOT OLD.trip_id THEN RAISE(ABORT,'CAPTURE_LOCAL_BINDING_IMMUTABLE') END;
  SELECT CASE WHEN NEW.status='COMPLETED' AND NOT EXISTS (SELECT 1 FROM capture_local_interpretation_results r WHERE r.account_id=NEW.owner_user_id AND r.input_id=NEW.entity_id AND r.operation_id=NEW.id) THEN RAISE(ABORT,'CAPTURE_LOCAL_RESULT_REQUIRED') END;
  INSERT INTO capture_local_interpretation_events(account_id,input_id,operation_id,state,recorded_at,attempt_count)
  SELECT NEW.owner_user_id,NEW.entity_id,NEW.id,
    CASE WHEN NEW.status='COMPLETED' THEN 'LOCAL_RESULT_RECORDED' ELSE NEW.status END,
    NEW.updated_at,NEW.attempt_count WHERE NEW.status IS NOT OLD.status;
END;
CREATE TRIGGER capture_local_queue_retain BEFORE DELETE ON sync_operations
WHEN OLD.operation_type='CAPTURE_LOCAL_INTERPRET' BEGIN SELECT RAISE(ABORT,'CAPTURE_LOCAL_RETAINED'); END;
`,
};
