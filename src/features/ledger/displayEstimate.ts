import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import { allocateSettlementFromOriginal } from "@/domain/ledger/allocation";
import type { DisplayEstimate } from "@/data/operations/referenceRateEstimate";
export {
  displayEstimate,
  snapshotDisplayEstimate,
} from "@/data/operations/referenceRateEstimate";
export type { DisplayEstimate } from "@/data/operations/referenceRateEstimate";

export function estimatedComponent(
  expense: LedgerExpense,
  estimate: DisplayEstimate,
  memberId: string,
) {
  return (
    allocateSettlementFromOriginal(estimate.money.minor, expense.splits).find(
      (split) => split.memberId === memberId,
    )?.settlementMinor ?? null
  );
}

export function displayTotalProjection(
  rows: LedgerReportListItem[],
  expenses: Map<string, LedgerExpense>,
  estimates: Map<string, DisplayEstimate>,
  scope: "MINE" | "GROUP",
  memberId: string,
) {
  let estimatedMinor = 0;
  let estimatedCount = 0;
  for (const row of rows) {
    if (row.hasOpenConflict || row.businessStatus !== "RATE_REQUIRED") continue;
    const expense = expenses.get(row.id);
    const estimate = estimates.get(row.id);
    if (!expense || !estimate) continue;
    const component =
      scope === "GROUP"
        ? estimate.money.minor
        : estimatedComponent(expense, estimate, memberId);
    if (component === null) continue;
    estimatedMinor += component;
    if (!Number.isSafeInteger(estimatedMinor))
      throw new Error("Display total is unsafe.");
    estimatedCount += 1;
  }
  return { estimatedMinor, estimatedCount };
}
