import type { Migration } from "../migrations";

// Private local preparation only; accepted Core collections remain SQLite54-owned.
export const captureFlightNativeMigration: Migration = {
  id: 55,
  name: "capture_flight_native_preparation",
  sql: `
CREATE TABLE capture_flight_native_preparations (
  account_id TEXT NOT NULL, trip_id TEXT NOT NULL, capture_id TEXT NOT NULL,
  capture_revision INTEGER NOT NULL CHECK(capture_revision>0),
  payload_id TEXT NOT NULL, original_sha256 TEXT NOT NULL,
  identities_json TEXT NOT NULL CHECK(json_valid(identities_json) AND length(CAST(identities_json AS BLOB))<=8192),
  extraction_json TEXT CHECK(extraction_json IS NULL OR (json_valid(extraction_json) AND length(CAST(extraction_json AS BLOB))<=2097152)),
  adapter_json TEXT CHECK(adapter_json IS NULL OR (json_valid(adapter_json) AND length(CAST(adapter_json AS BLOB))<=8388608)),
  PRIMARY KEY(account_id,trip_id,capture_id),
  FOREIGN KEY(account_id,capture_id) REFERENCES local_capture_inbox(account_id,id) ON DELETE CASCADE
);
CREATE TRIGGER capture_flight_native_identity_immutable BEFORE UPDATE ON capture_flight_native_preparations
WHEN NEW.account_id IS NOT OLD.account_id OR NEW.trip_id IS NOT OLD.trip_id
 OR NEW.capture_id IS NOT OLD.capture_id OR NEW.capture_revision IS NOT OLD.capture_revision
 OR NEW.payload_id IS NOT OLD.payload_id OR NEW.original_sha256 IS NOT OLD.original_sha256
 OR NEW.identities_json IS NOT OLD.identities_json
 OR (OLD.extraction_json IS NOT NULL AND NEW.extraction_json IS NOT OLD.extraction_json)
 OR (OLD.adapter_json IS NOT NULL AND NEW.adapter_json IS NOT OLD.adapter_json)
BEGIN SELECT RAISE(ABORT,'NATIVE_FLIGHT_PREPARATION_IMMUTABLE'); END;
`,
};
