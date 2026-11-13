// Native owns numbering/registry; future Account purge must also delete server-parent confirmations.
export const serverParentMetadataConfirmationsSql = `
-- Both released branches can already contain this parent-trigger pair.
DROP TRIGGER IF EXISTS local_trip_metadata_confirmation_delete;
DROP TRIGGER IF EXISTS local_trip_metadata_confirmation_parent_identity;
CREATE TABLE local_trip_metadata_confirmations_next (
 account_id TEXT NOT NULL,trip_id TEXT NOT NULL,operation_id TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('CREATE_RECEIPT','METADATA_RECEIPT','SNAPSHOT')),
 metadata_revision INTEGER NOT NULL CHECK(typeof(metadata_revision)='integer' AND metadata_revision BETWEEN 0 AND 9007199254740991),
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 proof_json TEXT NOT NULL CHECK(json_valid(proof_json)),
 PRIMARY KEY(account_id,operation_id,source_kind)
);
INSERT INTO local_trip_metadata_confirmations_next SELECT * FROM local_trip_metadata_confirmations;
DROP TABLE local_trip_metadata_confirmations;
ALTER TABLE local_trip_metadata_confirmations_next RENAME TO local_trip_metadata_confirmations;
CREATE INDEX local_trip_metadata_confirmation_revision ON local_trip_metadata_confirmations(account_id,trip_id,metadata_revision DESC);
CREATE TRIGGER local_trip_metadata_confirmation_delete AFTER DELETE ON local_trip_containers
BEGIN DELETE FROM local_trip_metadata_confirmations WHERE account_id=OLD.account_id AND trip_id=OLD.id; END;
CREATE TRIGGER local_trip_metadata_confirmation_parent_identity BEFORE UPDATE OF account_id,id ON local_trip_containers
WHEN (NEW.account_id<>OLD.account_id OR NEW.id<>OLD.id) AND EXISTS(
 SELECT 1 FROM local_trip_metadata_confirmations WHERE account_id=OLD.account_id AND trip_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'TRIP_METADATA_PARENT_IDENTITY_IMMUTABLE'); END;
`;
