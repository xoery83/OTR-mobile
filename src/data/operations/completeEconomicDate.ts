import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { ExpenseEconomicDateSnapshot, LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { refreshJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { preflightSettlementFx } from "@/data/sync/ledgerSettlementCoordinator";

export async function confirmExpenseEconomicDate(
  expenseId: string,
  date: string,
  expected: ExpenseEconomicDateSnapshot,
) {
  const repository = await getDefaultLedgerExpenseRepository();
  const saved = await repository.completeEconomicDate(
    expenseId,
    date,
    "USER_CONFIRMED_V1",
    expected,
  );
  return {
    followUp: resolveExpenseDate(saved, expected.accountGeneration)
      .catch(() => ({ state: "SAVED_WAITING" as const })),
  };
}

async function resolveExpenseDate(saved: LedgerExpense, accountGeneration: number) {
  const accountIsCurrent = () => accountGeneration === getAccountGeneration();
  if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
  const repository = await getDefaultLedgerExpenseRepository();
  const expenseId = saved.id;
  if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
  await runLedgerOperationalSync();
  if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
  let synced = await repository.getExpense(expenseId);
  // A concurrent cycle may have begun before this operation was queued.
  if (synced?.syncStatus === "PENDING_UPDATE") {
    if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
    await runLedgerOperationalSync();
    if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
    synced = await repository.getExpense(expenseId);
  }
  if (!accountIsCurrent() || synced?.syncStatus !== "SYNCED") return { state: "SAVED_WAITING" as const };
  try {
    await preflightSettlementFx(saved.journeyId, true);
    if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
    await refreshJourneyLedger(saved.journeyId);
  } catch {
    return { state: "RATE_WAITING" as const };
  }
  if (!accountIsCurrent()) return { state: "SAVED_WAITING" as const };
  const current = await repository.getExpense(expenseId);
  return {
    state:
      accountIsCurrent() && current?.status === "ACCEPTED" && current.valuation
        ? ("VALUED" as const)
        : ("RATE_WAITING" as const),
  };
}
