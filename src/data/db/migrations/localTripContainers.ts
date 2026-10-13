import type { Migration } from "../migrations";
export const localTripContainersMigration: Migration = {
  id: 58,
  name: "local_trip_containers",
  sql: `
CREATE TABLE local_trip_containers (
 account_id TEXT NOT NULL, id TEXT NOT NULL, create_operation_id TEXT NOT NULL,
 name TEXT NOT NULL, destination TEXT, start_date TEXT, end_date TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,id), UNIQUE(account_id,create_operation_id)
);
CREATE INDEX local_trip_containers_account_created
 ON local_trip_containers(account_id,created_at DESC,id);
`,
};
