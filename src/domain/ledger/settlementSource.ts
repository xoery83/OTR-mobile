import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import {
  canonicalSettlementSourceJson,
  type SettlementPreviewInput,
} from "@/domain/ledger/settlement";
import type { SyncStatus } from "@/domain/sync/syncStatus";

export function currentSettlementExpenses<
  T extends { serverId: string | null; syncStatus: SyncStatus },
>(expenses: T[]) {
  return expenses.filter(
    (expense) =>
      (expense.serverId !== null && expense.syncStatus === "SYNCED") ||
      expense.syncStatus === "PENDING_CREATE" ||
      expense.syncStatus === "PENDING_UPDATE" ||
      expense.syncStatus === "PENDING_DELETE" ||
      expense.syncStatus === "SYNCING",
  );
}

export function canonicalLocalSettlementSourceJson(
  journeyId: string,
  throughTimestamp: string,
  expenses: LedgerExpense[],
  conflictedExpenseIds: ReadonlySet<string>,
) {
  const canonical = expenses
    .filter((expense) => expense.serverId !== null && expense.syncStatus === "SYNCED")
    .map((expense) => ({
      id: expense.serverId!,
      revision: expense.serverRevision,
      occurredAt: expense.occurredAt,
      businessStatus: expense.status,
      settlementParticipation: expense.settlementParticipation,
      hasOpenConflict: conflictedExpenseIds.has(expense.id),
      payerMemberId: expense.payerMemberId,
      original: expense.original,
      participants: expense.participants,
      splits: expense.splits,
      valuation: expense.valuation,
    }));
  return canonicalSettlementSourceJson({
    journeyId,
    throughTimestamp,
    settlementCurrency: "XXX",
    settlementScale: 0,
    settingsRevision: 1,
    members: [],
    expenses: canonical,
  } satisfies SettlementPreviewInput);
}
