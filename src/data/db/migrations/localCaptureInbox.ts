import type { Migration } from "../migrations";

// Integration registers this only after Builder A's real SQLite47.
export const localCaptureInboxMigration: Migration = {
  id: 48,
  name: "local_capture_inbox",
  sql: `
    CREATE TABLE local_capture_payloads (
      account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 128),
      id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
      byte_count BLOB NOT NULL CHECK(typeof(byte_count) = 'integer' AND byte_count BETWEEN 1 AND 10485760),
      sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^a-f0-9]*'),
      bytes BLOB NOT NULL CHECK(typeof(bytes) = 'blob' AND length(bytes) = byte_count),
      PRIMARY KEY(account_id, id)
    );
    CREATE INDEX local_capture_payload_candidates
      ON local_capture_payloads(account_id, sha256, byte_count);
    CREATE TABLE local_capture_inbox (
      account_id TEXT NOT NULL CHECK(length(account_id) BETWEEN 1 AND 128),
      id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
      payload_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('FILE', 'IMAGE', 'TEXT')),
      original_filename TEXT CHECK(original_filename IS NULL OR length(original_filename) <= 1024),
      declared_content_type TEXT CHECK(declared_content_type IS NULL OR length(declared_content_type) <= 255),
      created_at TEXT NOT NULL,
      trip_id TEXT CHECK(trip_id IS NULL OR length(trip_id) BETWEEN 1 AND 128),
      state TEXT NOT NULL CHECK(state IN ('INBOX', 'ASSIGNED')),
      revision BLOB NOT NULL CHECK(typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991),
      CHECK((trip_id IS NULL AND state = 'INBOX') OR (trip_id IS NOT NULL AND state = 'ASSIGNED')),
      PRIMARY KEY(account_id, id),
      FOREIGN KEY(account_id, payload_id) REFERENCES local_capture_payloads(account_id, id) ON DELETE RESTRICT
    );
    CREATE INDEX local_capture_inbox_listing ON local_capture_inbox(account_id, created_at DESC, id DESC);
    CREATE INDEX local_capture_inbox_references ON local_capture_inbox(account_id, payload_id);
    CREATE TRIGGER local_capture_payload_immutable BEFORE UPDATE ON local_capture_payloads
    BEGIN SELECT RAISE(ABORT, 'LOCAL_CAPTURE_PAYLOAD_IMMUTABLE'); END;
    CREATE TRIGGER local_capture_payload_referenced BEFORE DELETE ON local_capture_payloads
    WHEN EXISTS(SELECT 1 FROM local_capture_inbox WHERE account_id = OLD.account_id AND payload_id = OLD.id)
    BEGIN SELECT RAISE(ABORT, 'LOCAL_CAPTURE_PAYLOAD_REFERENCED'); END;
    CREATE TRIGGER local_capture_insert_guard BEFORE INSERT ON local_capture_inbox
    WHEN NEW.revision != 1 OR NOT EXISTS(SELECT 1 FROM local_capture_payloads p
      WHERE p.account_id = NEW.account_id AND p.id = NEW.payload_id
      AND (NEW.kind != 'TEXT' OR p.byte_count <= 1048576))
    BEGIN SELECT RAISE(ABORT, 'LOCAL_CAPTURE_REFERENCE_INVALID'); END;
    CREATE TRIGGER local_capture_identity_immutable BEFORE UPDATE ON local_capture_inbox
    WHEN NEW.account_id IS NOT OLD.account_id OR NEW.id IS NOT OLD.id
      OR NEW.payload_id IS NOT OLD.payload_id OR NEW.kind IS NOT OLD.kind
      OR NEW.original_filename IS NOT OLD.original_filename
      OR NEW.declared_content_type IS NOT OLD.declared_content_type
      OR NEW.created_at IS NOT OLD.created_at OR NEW.revision != OLD.revision + 1
      OR (NEW.trip_id IS OLD.trip_id AND NEW.state IS OLD.state)
    BEGIN SELECT RAISE(ABORT, 'LOCAL_CAPTURE_IDENTITY_IMMUTABLE'); END;
  `,
};
