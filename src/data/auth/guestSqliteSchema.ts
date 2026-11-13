import type { MigrationDatabase } from "../db/migrationRunner";

// Layout compatibility only. Callers still require their existing row/file inventory.
export async function isKnownGuestSqliteSchema(
  database: Pick<MigrationDatabase, "getFirstAsync">,
  version: number,
) {
  if (version === 74) return true;
  if (version === 79) {
    const registered = await database.getFirstAsync<{ n: number }>(`
      SELECT COUNT(*) AS n FROM schema_migrations WHERE
      (id=75 AND name='capture_photo_import_decisions') OR
      (id=76 AND name IN ('capture_file_png_photo_decisions','server_parent_metadata_confirmations')) OR
      (id=77 AND name='trip_core_local_document_metadata') OR
      (id=78 AND name='capture_v3_photo_decisions') OR
      (id=79 AND name='server_parent_metadata_confirmations')`);
    const tables = await database.getFirstAsync<{ n: number }>(`
      SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN
      ('capture_photo_import_decisions','local_trip_metadata_confirmations','trip_core_trip_operational_documents')`);
    return registered?.n === 5 && tables?.n === 3;
  }
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
