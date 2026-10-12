import type { Migration } from "../migrations";
export const coreOrdinaryOrderMigration: Migration = {
  id: 56,
  name: "core_ordinary_order",
  sql: `
CREATE TABLE trip_core_trip_person_ordinary_orders (
 cache_account_id TEXT NOT NULL, mirror_key TEXT NOT NULL,
 id TEXT NOT NULL, trip_id TEXT NOT NULL, revision INTEGER NOT NULL,
 owner_account_id TEXT NOT NULL, visibility TEXT NOT NULL, hidden_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, field_state TEXT NOT NULL,
 person_id TEXT NOT NULL, branch_id TEXT NOT NULL, nodes TEXT NOT NULL, gaps TEXT NOT NULL,
 PRIMARY KEY(cache_account_id,trip_id,mirror_key)
);
ALTER TABLE trip_core_read_certificates ADD COLUMN ordinary_order_version INTEGER NOT NULL DEFAULT 0;
`,
};
