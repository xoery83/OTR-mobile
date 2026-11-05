import type { CoreDatabase } from "./tripCoreV2Repository";

export type CorePendingIntentCensus = Readonly<{
  coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES";
  total: number;
  groups: readonly Readonly<{
    state: "PENDING" | "IN_FLIGHT" | "APPLIED" | "CONFLICT" | "REVIEW" | "BLOCKED";
    reconciledRevision: number | null;
    count: number;
  }>[];
}>;

/** Observed table metadata only; zero is not NoCommit or adoption clearance.
 * The caller owns the initialized connection; no Account/session is required.
 * No Queue/receipt joins: all local namespaces, Trips and orphan intents count.
 */
export async function readCorePendingIntentCensus(
  database: Pick<CoreDatabase, "getAllAsync">,
): Promise<CorePendingIntentCensus> {
  const rows = await database.getAllAsync<{
    state: CorePendingIntentCensus["groups"][number]["state"];
    reconciled_revision: number | null;
    count: number;
  }>(
    `SELECT state,reconciled_revision,COUNT(*) AS count
     FROM trip_core_pending_intents
     GROUP BY state,reconciled_revision ORDER BY state,reconciled_revision`,
  );
  let total = 0;
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.count) ||
      row.count < 1 ||
      !Number.isSafeInteger(total + row.count)
    )
      throw new Error("CORE_INTENT_CENSUS_INVALID_COUNT");
    total += row.count;
  }
  return {
    coverage: "ALL_LOCAL_ACCOUNT_NAMESPACES",
    total,
    groups: rows.map((row) => ({
      state: row.state,
      reconciledRevision: row.reconciled_revision,
      count: row.count,
    })),
  };
}
