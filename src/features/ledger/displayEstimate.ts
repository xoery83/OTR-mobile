import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import { allocateSettlementFromOriginal } from "@/domain/ledger/allocation";
import { convertMoney } from "@/domain/ledger/money";
import type { Money, RateQuote } from "@/domain/ledger/types";

import { eligibleExpenseQuote } from "./fxPresentation";

export type DisplayEstimate = { money: Money; quoteId: string; exactDate: boolean };

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

export function displayEstimate(
  expense: LedgerExpense,
  quotes: RateQuote[],
  currency: string,
  scale: number,
  now = new Date(),
): DisplayEstimate | null {
  if (
    expense.valuation ||
    expense.status !== "RATE_REQUIRED" ||
    !expense.economicDate ||
    expense.original.currency === currency
  )
    return null;
  const day = expense.economicDate;
  const trusted = (quote: RateQuote) => {
    const reference = quote.referenceDate;
    const age = reference
      ? (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${reference}T00:00:00Z`)) /
        86_400_000
      : NaN;
    return (
      quote.journeyId === expense.journeyId &&
      quote.quoteCurrency === expense.original.currency &&
      quote.baseCurrency === currency &&
      quote.provider === "ECB" &&
      quote.policyVersion === "ECB_DAILY_V1" &&
      quote.sourceReference ===
        "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" &&
      quote.providerReference ===
        `https://api.frankfurter.dev/v2/providers/ecb/rate/${quote.quoteCurrency}/${quote.baseCurrency}?date=${quote.economicDate}` &&
      Date.parse(quote.expiresAt) > now.getTime() &&
      Number.isInteger(age) &&
      age >= 0 &&
      age <= 30
    );
  };
  const exact = eligibleExpenseQuote(expense, quotes, currency);
  const quote =
    (exact && trusted(exact) ? exact : null) ??
    quotes
      .filter(trusted)
      .sort((a, b) => b.referenceDate!.localeCompare(a.referenceDate!))[0];
  if (!quote) return null;
  try {
    return {
      money: convertMoney(expense.original, currency, scale, quote.decimalRate),
      quoteId: quote.id,
      exactDate: quote === exact,
    };
  } catch {
    return null;
  }
}
