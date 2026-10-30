import type { MigrationDatabase } from "../db/migrationRunner";

// Layout compatibility only. Callers still require their existing row/file inventory.
export async function isKnownGuestSqliteSchema(
  database: Pick<MigrationDatabase, "getFirstAsync">,
  version: number,
) {
  if (version === 74) return true;
  if (version !== 75) return false;
  return (
    (
      await database.getFirstAsync<{ name: string }>(
        "SELECT name FROM schema_migrations WHERE id=75",
      )
    )?.name === "capture_photo_import_decisions" &&
    (
      await database.getFirstAsync<{ present: number }>(
        "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='capture_photo_import_decisions'",
      )
    )?.present === 1
  );
}
