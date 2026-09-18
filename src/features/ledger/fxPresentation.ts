import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote } from "@/domain/ledger/types";

import { proposedExpenseDate } from "./expenseDraft";

export function expenseValuationMethod(expense: Pick<LedgerExpense, "valuation">) {
  return expense.valuation?.policy ?? "REFERENCE_RATE";
}

export function eligibleExpenseQuote(
  expense: LedgerExpense,
  quotes: RateQuote[],
  currency: string,
) {
  return (
    quotes.find(
      (quote) =>
        Boolean(quote.economicDate) &&
        quote.economicDate === expense.economicDate &&
        quote.referenceDate &&
        quote.referenceDate <= quote.economicDate! &&
        (Date.parse(`${quote.economicDate!}T00:00:00Z`) -
          Date.parse(`${quote.referenceDate}T00:00:00Z`)) /
          86_400_000 <=
          7 &&
        quote.quoteCurrency === expense.original.currency &&
        quote.baseCurrency === currency &&
        quote.policyVersion === "ECB_DAILY_V1" &&
        quote.provider === "ECB" &&
        quote.sourceReference ===
          "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" &&
        quote.providerReference ===
          `https://api.frankfurter.dev/v2/providers/ecb/rate/${quote.quoteCurrency}/${quote.baseCurrency}?date=${quote.economicDate}` &&
        Date.parse(quote.expiresAt) > Date.now(),
    ) ?? null
  );
}

export function fxStatus(
  expense: Pick<LedgerExpense, "status" | "economicDate" | "occurredAt" | "valuation">,
  chinese: boolean,
  policy: string | null = "REFERENCE_RATE",
  blocked = false,
) {
  if (expense.valuation || expense.status !== "RATE_REQUIRED") return null;
  if (blocked) return chinese ? "需处理账目冲突" : "Resolve expense conflict";
  if (!expense.economicDate)
    return proposedExpenseDate(expense)
      ? chinese
        ? "保存消费日期后更新旅行估值"
        : "Save Expense date to update Journey value"
      : null;
  if (policy === "MANUAL_AGREED") return chinese ? "汇率待确认" : "Rate needs review";
  if (policy === "ACTUAL_PAYER_COST")
    return chinese ? "付款金额待确认" : "Review payment value";
  return policy === "REFERENCE_RATE"
    ? chinese
      ? "更新中…"
      : "Updating…"
    : chinese
      ? "旅行估值待处理"
      : "Journey value pending";
}
