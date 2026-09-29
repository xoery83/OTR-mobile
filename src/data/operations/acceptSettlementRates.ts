import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerFxSnapshotRepository } from "@/data/repositories/defaultLedgerFxSnapshotRepository";
import { runLedgerOperationalSync } from "@/data/sync/ledgerOperationalSync";
import { revalidateJourneyLedger } from "@/data/sync/ledgerReportingCoordinator";
import { refreshLedgerFxSnapshotCache } from "@/data/sync/ledgerFxSnapshotCoordinator";
import { ApiClientError } from "@/data/api/client";
import type { ExpenseOperationResult } from "@/data/api/ledgerMutationContracts";
import { sameExpenseValue } from "@/domain/ledger/expenseIntent";
import {
  rateBindingMatches,
  compatibleReferenceValue,
  sameRate,
  type DisplayedRateBinding,
} from "@/domain/ledger/rateAcceptance";
import { displayEstimate, snapshotDisplayEstimate } from "./referenceRateEstimate";

export type SettlementRateAcceptance = DisplayedRateBinding & {
  expenseId: string;
  journeyId: string;
  title: string;
};
export type RateAcceptanceResult = {
  expenseId: string;
  title: string;
  operationId: string | null;
  state: ExpenseOperationResult["state"];
  operationResult: ExpenseOperationResult | null;
  alreadyAgreed?: boolean;
};
const changed = () =>
  new Error("Review the latest amount and exchange rate before accepting again.");
export async function readSettlementRateResults(results: RateAcceptanceResult[]) {
  const generation = getAccountGeneration();
  const repository = await getDefaultLedgerExpenseRepository();
  const updated = await Promise.all(
    results.map(async (item) => {
      if (!item.operationId) return item;
      const result = await repository.getOperationResult(item.operationId);
      return result ? { ...item, state: result.state, operationResult: result } : item;
    }),
  );
  if (generation !== getAccountGeneration())
    throw new Error("Account changed. Reopen Settlement.");
  return updated;
}
export async function acceptSettlementRates(items: SettlementRateAcceptance[]) {
  const generation = getAccountGeneration();
  const repository = await getDefaultLedgerExpenseRepository();
  const reports = await getDefaultLedgerReportingRepository();
  const scopes = new Map<string, "online" | "offline" | "retryable" | "terminal">();
  for (const journeyId of new Set(items.map((item) => item.journeyId))) {
    try {
      await revalidateJourneyLedger(journeyId);
      await refreshLedgerFxSnapshotCache(true);
      scopes.set(journeyId, "online");
    } catch (error) {
      if (!(error instanceof ApiClientError)) throw error;
      scopes.set(
        journeyId,
        error.kind === "network" || error.kind === "timeout"
          ? "offline"
          : error.status && error.status >= 500
            ? "retryable"
            : "terminal",
      );
    }
    if (generation !== getAccountGeneration())
      throw new Error("Account changed. Reopen Settlement.");
  }
  const results: RateAcceptanceResult[] = [];
  for (const item of items) {
    if (generation !== getAccountGeneration())
      throw new Error("Account changed. Reopen Settlement.");
    const result: RateAcceptanceResult = {
      expenseId: item.expenseId,
      title: item.title,
      operationId: null,
      state: "CONFLICT_REQUIRES_ACTION",
      operationResult: null,
    };
    try {
      const scope = scopes.get(item.journeyId);
      if (scope === "terminal" || scope === "retryable") {
        results.push({
          ...result,
          state: scope === "terminal" ? "TERMINAL_FAILURE" : "RETRYABLE_FAILURE",
        });
        continue;
      }
      const current = await repository.getExpense(item.expenseId);
      const journey = (await reports.listJourneys()).find(
        (row) => row.journeyId === item.journeyId,
      );
      if (
        !current ||
        current.journeyId !== item.journeyId ||
        !journey ||
        current.status === "DELETED" ||
        current.settlementParticipation === "EXCLUDED" ||
        !rateBindingMatches(
          item,
          current,
          journey.settlementCurrency,
          journey.settlementScale,
        )
      )
        throw changed();
      if (scope !== "online" && current.revision !== item.revision) throw changed();
      if (
        current.valuation?.policy === "MANUAL_AGREED" &&
        sameRate(current.valuation.decimalRate, item.decimalRate) &&
        sameExpenseValue(current.valuation.settlement, item.settlement) &&
        current.syncStatus === "SYNCED"
      ) {
        results.push({ ...result, state: "SERVER_CONFIRMED", alreadyAgreed: true });
        continue;
      }
      if (current.valuation) {
        if (!compatibleReferenceValue(item, current.valuation)) throw changed();
      } else {
        const quotes = await repository.listRateQuotes(
          item.journeyId,
          current.original.currency,
          journey.settlementCurrency,
        );
        const snapshots = await (await getDefaultLedgerFxSnapshotRepository()).list();
        const latest =
          displayEstimate(
            current,
            quotes,
            journey.settlementCurrency,
            journey.settlementScale,
          ) ??
          snapshotDisplayEstimate(
            current,
            snapshots,
            journey.settlementCurrency,
            journey.settlementScale,
          );
        if (
          !latest?.decimalRate ||
          !sameRate(latest.decimalRate, item.decimalRate) ||
          !sameExpenseValue(latest.money, item.settlement)
        )
          throw changed();
      }
      if (generation !== getAccountGeneration())
        throw new Error("Account changed. Reopen Settlement.");
      const {
        expenseId: _expenseId,
        journeyId: _journeyId,
        title: _title,
        ...binding
      } = item;
      const saved = await repository.applyValuation(item.expenseId, {
        policy: "MANUAL_AGREED",
        manualRate: item.decimalRate,
        reason: `Accepted displayed ECB reference rate dated ${item.referenceDate} for transaction ${item.economicDate}. 1 ${item.original.currency} = ${item.decimalRate} ${item.settlement.currency}. Source: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html`,
        expectedRevision: current.revision,
        expectedSettlement: item.settlement,
        rateAcceptance: binding,
      });
      if (!saved.operationResult?.operationId)
        throw new Error("Rate decision has no durable result.");
      results.push({
        ...result,
        operationId: saved.operationResult.operationId,
        state: saved.operationResult.state,
        operationResult: saved.operationResult,
      });
    } catch (error) {
      if (generation !== getAccountGeneration()) throw error;
      results.push({
        ...result,
        state:
          error instanceof ApiClientError && error.status === 403
            ? "TERMINAL_FAILURE"
            : "CONFLICT_REQUIRES_ACTION",
      });
    }
  }
  if (generation !== getAccountGeneration())
    throw new Error("Account changed. Reopen Settlement.");
  await runLedgerOperationalSync().catch(() => undefined);
  return { results: await readSettlementRateResults(results) };
}

export async function loadPendingSettlementRates(
  journeyId: string,
): Promise<RateAcceptanceResult[]> {
  const rows = await (
    await getDefaultLedgerExpenseRepository()
  ).listRateAcceptanceOperations(journeyId);
  return rows.map(({ title, result }) => ({
    title,
    expenseId: result.expenseId,
    operationId: result.operationId,
    state: result.state,
    operationResult: result,
  }));
}
