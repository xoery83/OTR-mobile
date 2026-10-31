// Native reserved 77; registry registration remains with the unique Native Writer.
export const privateAccountProfileMigration = {
  id: 77,
  name: "account_private_profile_local",
  sql: `
CREATE TABLE account_private_profile_local (
 account_id TEXT PRIMARY KEY NOT NULL,
 accepted_snapshot_json TEXT CHECK(accepted_snapshot_json IS NULL OR json_valid(accepted_snapshot_json)),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 updated_at TEXT NOT NULL
);
`,
};
