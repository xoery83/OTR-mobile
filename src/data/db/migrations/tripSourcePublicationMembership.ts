import type { Migration } from "../migrations";

export const tripSourcePublicationMembershipMigration: Migration = {
  id: 53,
  name: "trip_source_publication_membership",
  sql: `
ALTER TABLE trip_source_runs ADD COLUMN publication_membership TEXT
  CHECK(publication_membership IS NULL OR
    (typeof(publication_membership)='text'
     AND length(CAST(publication_membership AS BLOB)) BETWEEN 1 AND 32768
     AND json_valid(publication_membership)
     AND json_type(publication_membership)='object'));

CREATE TRIGGER local_publication_membership_insert
BEFORE INSERT ON trip_source_runs WHEN NEW.publication_membership IS NOT NULL OR EXISTS (
  SELECT 1 FROM trip_source_runs AS victim
  WHERE victim.publication_membership IS NOT NULL AND victim.cache_account_id=NEW.cache_account_id
    AND (victim.id=NEW.id OR
      (victim.trip_id=NEW.trip_id AND victim.actor_account_id=NEW.actor_account_id AND
        (victim.operation_key=NEW.operation_key OR
          (victim.scope_sha256=NEW.scope_sha256 AND victim.generation=NEW.generation))))
)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_INSTALL_REQUIRED'); END;

CREATE TRIGGER local_publication_membership_immutable
BEFORE UPDATE ON trip_source_runs WHEN (OLD.publication_membership IS NOT NULL AND (
  NEW.publication_membership IS NOT OLD.publication_membership OR
  NEW.cache_account_id IS NOT OLD.cache_account_id OR NEW.id IS NOT OLD.id OR
  NEW.trip_id IS NOT OLD.trip_id OR NEW.actor_account_id IS NOT OLD.actor_account_id OR
  NEW.operation_key IS NOT OLD.operation_key OR
  NEW.scope_source_ids IS NOT OLD.scope_source_ids OR
  NEW.scope_sha256 IS NOT OLD.scope_sha256 OR NEW.generation IS NOT OLD.generation OR
  NEW.input_sha256 IS NOT OLD.input_sha256 OR
  NEW.extractor_key IS NOT OLD.extractor_key OR
  NEW.extractor_version IS NOT OLD.extractor_version OR
  NEW.extractor_options_sha256 IS NOT OLD.extractor_options_sha256 OR
  NEW.state IS NOT OLD.state OR NEW.created_at IS NOT OLD.created_at OR
  NEW.completed_at IS NOT OLD.completed_at OR NEW.error_code IS NOT OLD.error_code
)) OR EXISTS (
  SELECT 1 FROM trip_source_runs AS victim
  WHERE victim.publication_membership IS NOT NULL AND victim.cache_account_id=NEW.cache_account_id
    AND (victim.cache_account_id<>OLD.cache_account_id OR victim.id<>OLD.id)
    AND (victim.id=NEW.id OR
      (victim.trip_id=NEW.trip_id AND victim.actor_account_id=NEW.actor_account_id AND
        (victim.operation_key=NEW.operation_key OR
          (victim.scope_sha256=NEW.scope_sha256 AND victim.generation=NEW.generation))))
)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_IMMUTABLE'); END;

CREATE TRIGGER local_publication_membership_install
BEFORE UPDATE OF publication_membership ON trip_source_runs
WHEN OLD.publication_membership IS NULL AND NEW.publication_membership IS NOT NULL
  AND (NEW.registration_state<>'REGISTERED' OR NEW.state<>'READY' OR
    NEW.retention_state<>'RETAINED' OR NEW.cache_account_id<>NEW.actor_account_id OR
    json_extract(NEW.publication_membership,'$.body.version') IS NOT 1 OR
    json_extract(NEW.publication_membership,'$.body.run_id') IS NOT NEW.id OR
    json_extract(NEW.publication_membership,'$.body.actor_account_id') IS NOT NEW.actor_account_id OR
    json_extract(NEW.publication_membership,'$.body.trip_id') IS NOT NEW.trip_id OR
    json_extract(NEW.publication_membership,'$.body.operation_key') IS NOT NEW.operation_key OR
    json_extract(NEW.publication_membership,'$.body.generation') IS NOT NEW.generation OR
    json_extract(NEW.publication_membership,'$.body.scope_source_ids') IS NOT NEW.scope_source_ids OR
    json_extract(NEW.publication_membership,'$.body.scope_sha256') IS NOT NEW.scope_sha256 OR
    json_extract(NEW.publication_membership,'$.body.input_sha256') IS NOT NEW.input_sha256 OR
    json_extract(NEW.publication_membership,'$.body.extractor_key') IS NOT NEW.extractor_key OR
    json_extract(NEW.publication_membership,'$.body.extractor_version') IS NOT NEW.extractor_version OR
    json_extract(NEW.publication_membership,'$.body.extractor_options_sha256') IS NOT NEW.extractor_options_sha256)
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_INVALID_INSTALL'); END;

CREATE TRIGGER local_publication_membership_retained
BEFORE DELETE ON trip_source_runs WHEN OLD.publication_membership IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PUBLICATION_MEMBERSHIP_RETAINED'); END;
`,
};
