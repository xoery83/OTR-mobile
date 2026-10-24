// Registry is Coordinator-owned; register after Source 73, never renumber an installed schema.
export const tripPersonCloudCreateMigration = {
  id: 74,
  name: "trip_person_cloud_create_receipts",
  sql: `
CREATE TABLE trip_person_cloud_create_receipts (
 account_id TEXT NOT NULL,operation_id TEXT NOT NULL,trip_id TEXT NOT NULL,person_id TEXT NOT NULL,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
 accepted_at TEXT NOT NULL,PRIMARY KEY(account_id,operation_id),UNIQUE(account_id,person_id)
);
`,
};
