import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";

// Reuse the owning connector's mandatory transaction lifecycle. Scope reads take
// FOR SHARE locks in their owning SQL and therefore cannot use READ ONLY.
export function universalPgTransaction<T>(
  connection: CorePgConnection,
  work: (lease: CorePgLease) => Promise<T>,
  readOnly = false,
) {
  return connection.withLease(async (lease) => {
    let began = false;
    try {
      await lease.query(
        `BEGIN ISOLATION LEVEL READ COMMITTED${readOnly ? " READ ONLY" : ""}`,
      );
      began = true;
      const value = await work(lease);
      await lease.query("COMMIT");
      began = false;
      return value;
    } catch (error) {
      if (began)
        try {
          await lease.query("ROLLBACK");
        } catch {
          lease.retire();
        }
      throw error;
    }
  });
}
