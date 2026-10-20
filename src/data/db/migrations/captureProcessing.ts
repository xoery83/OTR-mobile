import type { Migration } from "../migrations";

export const captureProcessingMigration: Migration = {
  id: 66,
  name: "capture_processing_validation",
  sql: `
CREATE TABLE capture_processing_events (
  account_id TEXT NOT NULL,
  input_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL CHECK(state IN ('PENDING','PROCESSING','RETRYABLE','FAILED','INPUT_VALIDATED')),
  recorded_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  FOREIGN KEY(account_id,input_id) REFERENCES capture_submission_inputs(account_id,input_id) ON DELETE RESTRICT,
  FOREIGN KEY(operation_id) REFERENCES sync_operations(id) ON DELETE RESTRICT
);
CREATE INDEX capture_processing_events_input ON capture_processing_events(account_id,input_id,sequence);
CREATE TRIGGER capture_processing_events_immutable BEFORE UPDATE ON capture_processing_events BEGIN SELECT RAISE(ABORT,'CAPTURE_PROCESSING_EVENT_IMMUTABLE'); END;
CREATE TRIGGER capture_processing_events_retain BEFORE DELETE ON capture_processing_events BEGIN SELECT RAISE(ABORT,'CAPTURE_PROCESSING_EVENT_RETAINED'); END;
CREATE TRIGGER capture_processing_queue_insert AFTER INSERT ON sync_operations
WHEN NEW.operation_type='CAPTURE_PROCESSING_VALIDATE'
BEGIN
  SELECT CASE WHEN NEW.entity_type!='CAPTURE_SUBMISSION_INPUT' OR NEW.trip_id IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM capture_submission_inputs i WHERE i.account_id=NEW.owner_user_id AND i.input_id=NEW.entity_id AND i.acceptance_state='ACCEPTED'
  ) THEN RAISE(ABORT,'CAPTURE_PROCESSING_SCOPE') END;
  INSERT INTO capture_processing_events(account_id,input_id,operation_id,state,recorded_at,attempt_count)
  VALUES(NEW.owner_user_id,NEW.entity_id,NEW.id,NEW.status,NEW.updated_at,NEW.attempt_count);
END;
CREATE TRIGGER capture_processing_queue_update AFTER UPDATE ON sync_operations
WHEN OLD.operation_type='CAPTURE_PROCESSING_VALIDATE' OR NEW.operation_type='CAPTURE_PROCESSING_VALIDATE'
BEGIN
  SELECT CASE WHEN NEW.owner_user_id IS NOT OLD.owner_user_id OR NEW.entity_id IS NOT OLD.entity_id OR NEW.entity_type IS NOT OLD.entity_type OR NEW.operation_type IS NOT OLD.operation_type OR NEW.payload_json IS NOT OLD.payload_json OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.trip_id IS NOT OLD.trip_id THEN RAISE(ABORT,'CAPTURE_PROCESSING_BINDING_IMMUTABLE') END;
  INSERT INTO capture_processing_events(account_id,input_id,operation_id,state,recorded_at,attempt_count)
  SELECT NEW.owner_user_id,NEW.entity_id,NEW.id,
    CASE WHEN NEW.status='COMPLETED' THEN 'INPUT_VALIDATED' ELSE NEW.status END,
    NEW.updated_at,NEW.attempt_count WHERE NEW.status IS NOT OLD.status;
END;
CREATE TRIGGER capture_processing_queue_retain BEFORE DELETE ON sync_operations
WHEN OLD.operation_type='CAPTURE_PROCESSING_VALIDATE' BEGIN SELECT RAISE(ABORT,'CAPTURE_PROCESSING_RETAINED'); END;
`,
};
