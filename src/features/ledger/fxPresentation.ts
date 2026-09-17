import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote } from "@/domain/ledger/types";

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
  expense: Pick<LedgerExpense, "status" | "economicDate" | "valuation">,
  chinese: boolean,
) {
  if (expense.valuation || expense.status !== "RATE_REQUIRED") return null;
  if (!expense.economicDate)
    return chinese
      ? "确认消费日期以计算旅行估值"
      : "Confirm the expense date to calculate the Journey value";
  return chinese ? "参考汇率待获取" : "Reference rate pending";
}
