import type { Migration } from "../migrations";

export const localTripLedgerMigration: Migration = {
  id: 68,
  name: "local_trip_ledger_initialization",
  sql: `
CREATE TABLE local_trip_ledger_bindings (
 account_id TEXT NOT NULL, trip_id TEXT NOT NULL, person_id TEXT NOT NULL UNIQUE,
 create_operation_id TEXT NOT NULL, initialized_at TEXT NOT NULL,
 authority TEXT NOT NULL DEFAULT 'LOCAL_CREATOR' CHECK(authority='LOCAL_CREATOR'),
 PRIMARY KEY(account_id,trip_id),
 FOREIGN KEY(account_id,trip_id) REFERENCES local_trip_containers(account_id,id)
);
`,
};
