import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { preflightSettlementFx } from "@/data/sync/ledgerSettlementCoordinator";

export async function confirmExpenseEconomicDate(expenseId: string, date: string) {
  const repository = await getDefaultLedgerExpenseRepository();
  const saved = await repository.completeEconomicDate(
    expenseId,
    date,
    "USER_CONFIRMED_V1",
  );
  await runLedgerOperationalSync();
  let synced = await repository.getExpense(expenseId);
  // A concurrent cycle may have begun before this operation was queued.
  if (synced?.syncStatus === "PENDING_UPDATE") {
    await runLedgerOperationalSync();
    synced = await repository.getExpense(expenseId);
  }
  if (synced?.syncStatus !== "SYNCED") return { state: "SAVED_WAITING" as const };
  try {
    await preflightSettlementFx(saved.journeyId, true);
    await refreshJourneyLedger(saved.journeyId);
  } catch {
    return { state: "RATE_WAITING" as const };
  }
  const current = await repository.getExpense(expenseId);
  return {
    state:
      current?.status === "ACCEPTED" && current.valuation
        ? ("VALUED" as const)
        : ("RATE_WAITING" as const),
  };
}
