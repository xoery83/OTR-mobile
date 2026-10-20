import type { Migration } from "../migrations";
export const requiredDateDecisionsMigration: Migration = {
  id: 65,
  name: "source_required_date_decisions",
  sql: `
CREATE TABLE source_required_date_decisions (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, batch_id TEXT NOT NULL,
 job_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
 field_key TEXT NOT NULL CHECK(field_key='ORIGIN.local_date'),
 decision_id TEXT NOT NULL, decision_version INTEGER NOT NULL CHECK(typeof(decision_version)='integer' AND decision_version BETWEEN 1 AND 9007199254740991),
 provenance TEXT NOT NULL CHECK(provenance='USER_ENTERED'),
 local_date TEXT NOT NULL CHECK(length(local_date)=10), pins_json TEXT NOT NULL CHECK(json_valid(pins_json) AND length(CAST(pins_json AS BLOB))<=65536),
 request_json TEXT NOT NULL CHECK(json_valid(request_json) AND length(CAST(request_json AS BLOB))<=65536), recorded_at TEXT NOT NULL,
 PRIMARY KEY(account_id,trip_id,batch_id,candidate_id,field_key,decision_version),
 UNIQUE(account_id,decision_id)
);
CREATE TRIGGER source_required_date_no_update BEFORE UPDATE ON source_required_date_decisions BEGIN SELECT RAISE(ABORT,'REQUIRED_DATE_IMMUTABLE'); END;
CREATE TRIGGER source_required_date_no_delete BEFORE DELETE ON source_required_date_decisions BEGIN SELECT RAISE(ABORT,'REQUIRED_DATE_RETAINED'); END;
`,
};
