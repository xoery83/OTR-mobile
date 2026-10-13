import type { Migration } from "../migrations";

// Read-only account projection. Remote Trips do not carry local CREATE_TRIP intent.
export const tripDiscoverySnapshotMigration: Migration = {
  id: 61,
  name: "trip_discovery_snapshot",
  sql: `
CREATE TABLE trip_discovery_snapshots (
 account_id TEXT PRIMARY KEY NOT NULL,
 refreshed_at TEXT NOT NULL
);
CREATE TABLE trip_discovery_summaries (
 account_id TEXT NOT NULL, id TEXT NOT NULL,
 name TEXT NOT NULL, destination TEXT,
 start_date TEXT, end_date TEXT, created_at TEXT,
 PRIMARY KEY(account_id,id),
 FOREIGN KEY(account_id) REFERENCES trip_discovery_snapshots(account_id) ON DELETE CASCADE
);
CREATE INDEX trip_discovery_summaries_account_created
 ON trip_discovery_summaries(account_id,created_at DESC,id);
`,
};
