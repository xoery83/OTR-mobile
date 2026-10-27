import type { Migration } from "../migrations";
export const tripMetadataConfirmationsMigration: Migration = {
  id: 72,
  name: "trip_metadata_confirmations",
  sql: `
 CREATE TABLE local_trip_metadata_confirmations (
 account_id TEXT NOT NULL,trip_id TEXT NOT NULL,operation_id TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('CREATE_RECEIPT','METADATA_RECEIPT','SNAPSHOT')),
 metadata_revision INTEGER NOT NULL CHECK(typeof(metadata_revision)='integer' AND metadata_revision BETWEEN 0 AND 9007199254740991),
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 proof_json TEXT NOT NULL CHECK(json_valid(proof_json)),
 PRIMARY KEY(account_id,operation_id,source_kind),
 FOREIGN KEY(account_id,trip_id) REFERENCES local_trip_containers(account_id,id) ON DELETE CASCADE
 );
 CREATE INDEX local_trip_metadata_confirmation_revision ON local_trip_metadata_confirmations(account_id,trip_id,metadata_revision DESC);
 `,
};
