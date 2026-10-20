import type { Migration } from "../migrations";
// Private pending client operations, never Source/accepted read authority.
export const capturePdfSourceHandoffMigration: Migration = {
  id: 56,
  name: "capture_pdf_source_handoff",
  sql: `
CREATE TABLE capture_pdf_source_handoffs (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, capture_id TEXT NOT NULL,
 capture_revision INTEGER NOT NULL CHECK(capture_revision>0),
 request_json TEXT NOT NULL CHECK(json_valid(request_json) AND length(CAST(request_json AS BLOB))<=16384),
 state TEXT NOT NULL CHECK(state IN ('PENDING','UNKNOWN','REVIEW','PREPARED')),
 adapter_json TEXT CHECK(adapter_json IS NULL OR (json_valid(adapter_json) AND length(CAST(adapter_json AS BLOB))<=8388608)),
 PRIMARY KEY(account_id,trip_id,capture_id),
 FOREIGN KEY(account_id,capture_id) REFERENCES local_capture_inbox(account_id,id) ON DELETE CASCADE
);
CREATE TRIGGER capture_pdf_handoff_immutable BEFORE UPDATE ON capture_pdf_source_handoffs
WHEN NEW.account_id IS NOT OLD.account_id OR NEW.trip_id IS NOT OLD.trip_id OR NEW.capture_id IS NOT OLD.capture_id
 OR NEW.capture_revision IS NOT OLD.capture_revision OR NEW.request_json IS NOT OLD.request_json
 OR (OLD.adapter_json IS NOT NULL AND NEW.adapter_json IS NOT OLD.adapter_json)
BEGIN SELECT RAISE(ABORT,'PDF_HANDOFF_IMMUTABLE'); END;
`,
};
