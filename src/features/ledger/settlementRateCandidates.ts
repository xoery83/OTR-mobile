import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type {
  SettlementRateAcceptance,
  RateAcceptanceResult,
} from "@/data/operations/acceptSettlementRates";
import { convertMoney } from "@/domain/ledger/money";
import type { DisplayEstimate } from "./displayEstimate";

export function settlementRateCandidates(
  expenses: LedgerExpense[],
  estimates: Map<string, DisplayEstimate>,
): SettlementRateAcceptance[] {
  return expenses.flatMap((expense) => {
    const estimate = estimates.get(expense.id);
    if (
      expense.status !== "RATE_REQUIRED" ||
      expense.valuation ||
      expense.syncStatus !== "SYNCED" ||
      expense.settlementParticipation === "EXCLUDED" ||
      !expense.economicDate ||
      !estimate?.decimalRate ||
      !estimate.referenceDate ||
      estimate.referenceDate >= expense.economicDate
    )
      return [];
    try {
      if (
        convertMoney(
          expense.original,
          estimate.money.currency,
          estimate.money.scale,
          estimate.decimalRate,
        ).minor !== estimate.money.minor
      )
        return [];
    } catch {
      return [];
    }
    return [
      {
        expenseId: expense.id,
        journeyId: expense.journeyId,
        revision: expense.revision,
        serverRevision: expense.serverRevision,
        economicDate: expense.economicDate,
        title: expense.title,
        original: expense.original,
        settlement: estimate.money,
        decimalRate: estimate.decimalRate,
        referenceDate: estimate.referenceDate,
      },
    ];
  });
}

export function rateAcceptanceMessage(result: RateAcceptanceResult) {
  if (result.operationResult?.error?.code === "SETTLEMENT_INPUT_STALE")
    return "This expense is part of a confirmed Settlement. Review a correction with your organizer.";
  switch (result.state) {
    case "SERVER_CONFIRMED":
      if (result.operationResult?.disposition === "KEPT_SERVER")
        return "Using the latest value.";
      if (result.operationResult?.disposition === "SUPERSEDED")
        return "This earlier rate choice was replaced.";
      return result.alreadyAgreed
        ? "Already uses this agreed rate."
        : "Agreed rate saved.";
    case "LOCAL_SAVED":
    case "PENDING_SYNC":
      return "Rate saved here. Waiting to finish…";
    case "RETRYABLE_FAILURE":
      return result.operationId
        ? "Rate saved here. Waiting for a connection."
        : "Could not check this rate. Please check again when connected.";
    case "CONFLICT_REQUIRES_ACTION":
      return "The amount or rate changed. Review before accepting again.";
    case "TERMINAL_FAILURE":
      return "This rate could not be accepted. Review with your Journey organizer.";
  }
}
