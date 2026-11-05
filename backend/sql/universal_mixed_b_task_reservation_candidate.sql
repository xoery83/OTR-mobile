-- Offline Task database candidate. Apply in one local SQLite migration transaction.
CREATE TABLE universal_mixed_b_task_reservations (
  task_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  submission_sha256 TEXT NOT NULL CHECK(length(submission_sha256)=64 AND submission_sha256 NOT GLOB '*[^0-9a-f]*'),
  initial_manifest_sha256 TEXT NOT NULL CHECK(length(initial_manifest_sha256)=64 AND initial_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  run_begin_material_sha256 TEXT CHECK(run_begin_material_sha256 IS NULL OR
    (length(run_begin_material_sha256)=64 AND run_begin_material_sha256 NOT GLOB '*[^0-9a-f]*')),
  phase TEXT NOT NULL CHECK(phase IN ('RESERVED','INSERTING','CONSUMED')),
  -- INSERTING cannot commit without its exact Task. The AFTER INSERT trigger consumes it.
  inserting_account_id TEXT GENERATED ALWAYS AS (CASE WHEN phase='INSERTING' THEN account_id END) VIRTUAL,
  inserting_task_id TEXT GENERATED ALWAYS AS (CASE WHEN phase='INSERTING' THEN task_id END) VIRTUAL,
  FOREIGN KEY(inserting_account_id,inserting_task_id)
    REFERENCES intelligence_continuations(account_id,task_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TRIGGER universal_mixed_b_reservation_insert
BEFORE INSERT ON universal_mixed_b_task_reservations
WHEN NEW.phase <> 'RESERVED'
 OR NEW.run_begin_material_sha256 IS NOT NULL
 OR EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations WHERE task_id=NEW.task_id)
 OR EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=NEW.task_id)
BEGIN
  SELECT RAISE(ABORT,'MIXED_B_TASK_COLLISION');
END;

CREATE TRIGGER universal_mixed_b_reservation_retain
BEFORE DELETE ON universal_mixed_b_task_reservations
BEGIN
  SELECT RAISE(ABORT,'MIXED_B_RESERVATION_RETAINED');
END;

CREATE TRIGGER universal_mixed_b_reservation_update
BEFORE UPDATE ON universal_mixed_b_task_reservations
WHEN OLD.task_id IS NOT NEW.task_id OR OLD.account_id IS NOT NEW.account_id
 OR OLD.trip_id IS NOT NEW.trip_id OR OLD.batch_id IS NOT NEW.batch_id
 OR OLD.run_id IS NOT NEW.run_id OR OLD.submission_sha256 IS NOT NEW.submission_sha256
 OR OLD.initial_manifest_sha256 IS NOT NEW.initial_manifest_sha256
 OR NOT (
   (OLD.run_begin_material_sha256 IS NEW.run_begin_material_sha256 AND (
    (OLD.phase='RESERVED' AND NEW.phase='INSERTING'
     AND NOT EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=OLD.task_id))
    OR
    (OLD.phase='INSERTING' AND NEW.phase='CONSUMED'
     AND EXISTS(SELECT 1 FROM intelligence_continuations t WHERE t.task_id=OLD.task_id
      AND t.account_id=OLD.account_id AND t.trip_id=OLD.trip_id AND t.import_id=OLD.batch_id
      AND t.run_id=OLD.run_id AND t.manifest_sha256=OLD.submission_sha256))
   ))
   OR (OLD.phase='RESERVED' AND NEW.phase='RESERVED'
    AND OLD.run_begin_material_sha256 IS NULL AND NEW.run_begin_material_sha256 IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations r WHERE r.batch_id=OLD.batch_id AND r.task_id<>OLD.task_id)
    AND NOT EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=OLD.task_id OR import_id=OLD.batch_id)
    AND NOT EXISTS(SELECT 1 FROM intelligence_continuation_attempts WHERE task_id=OLD.task_id)
    AND NOT EXISTS(SELECT 1 FROM sync_operations WHERE entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=OLD.task_id))
 )
BEGIN
  SELECT RAISE(ABORT,'MIXED_B_RESERVATION_TRANSITION_DENIED');
END;

-- BEFORE INSERT also fires for REPLACE and UPSERT with recursive_triggers off.
CREATE TRIGGER universal_mixed_b_task_insert
BEFORE INSERT ON intelligence_continuations
WHEN EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations WHERE task_id=NEW.task_id)
 AND NOT EXISTS(
   SELECT 1 FROM universal_mixed_b_task_reservations r WHERE r.task_id=NEW.task_id
    AND r.phase='INSERTING' AND r.account_id=NEW.account_id AND r.trip_id=NEW.trip_id
    AND r.batch_id=NEW.import_id AND r.run_id=NEW.run_id AND r.submission_sha256=NEW.manifest_sha256
 )
BEGIN
  SELECT RAISE(ABORT,'MIXED_B_TASK_RESERVED');
END;

CREATE TRIGGER universal_mixed_b_task_identity_update
BEFORE UPDATE OF task_id,account_id,trip_id,import_id,run_id,manifest_sha256 ON intelligence_continuations
WHEN EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations WHERE task_id IN (OLD.task_id,NEW.task_id))
 AND (OLD.task_id IS NOT NEW.task_id OR OLD.account_id IS NOT NEW.account_id
  OR OLD.trip_id IS NOT NEW.trip_id OR OLD.import_id IS NOT NEW.import_id
  OR OLD.run_id IS NOT NEW.run_id OR OLD.manifest_sha256 IS NOT NEW.manifest_sha256)
BEGIN
  SELECT RAISE(ABORT,'MIXED_B_TASK_IDENTITY_RESERVED');
END;

CREATE TRIGGER universal_mixed_b_task_consumed
AFTER INSERT ON intelligence_continuations
WHEN EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations WHERE task_id=NEW.task_id AND phase='INSERTING')
BEGIN
  UPDATE universal_mixed_b_task_reservations SET phase='CONSUMED' WHERE task_id=NEW.task_id;
END;
