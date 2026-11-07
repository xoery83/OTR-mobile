import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";

export function isAiCostGuardEnabled(environment: (key: string) => string | undefined) {
  return (
    environment("AI_COST_GUARD_ENABLED") !== "false" ||
    environment("OTR_DEV_SUPABASE_URL") !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
  );
}

// The setting is transaction-local and only set by the trusted DEV provider process.
export function universalProviderPgTransaction<T>(
  connection: CorePgConnection,
  costGuardEnabled: boolean,
  work: (lease: CorePgLease) => Promise<T>,
) {
  return universalPgTransaction(connection, async (lease) => {
    if (!costGuardEnabled)
      await lease.query(
        "SELECT pg_catalog.set_config('otr.ai_cost_guard', 'off', true)",
        [],
      );
    return work(lease);
  });
}

// Reuse the owning connector's mandatory transaction lifecycle. Scope reads take
// FOR SHARE locks in their owning SQL and therefore cannot use READ ONLY.
export function universalPgTransaction<T>(
  connection: CorePgConnection,
  work: (lease: CorePgLease) => Promise<T>,
  readOnly = false,
  assertCurrent?: () => void,
) {
  return connection.withLease(async (lease) => {
    let began = false;
    try {
      assertCurrent?.();
      await lease.query(
        `BEGIN ISOLATION LEVEL READ COMMITTED${readOnly ? " READ ONLY" : ""}`,
      );
      began = true;
      const value = await work(lease);
      assertCurrent?.();
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
