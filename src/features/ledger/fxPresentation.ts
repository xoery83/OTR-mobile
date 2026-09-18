import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type {
  Money,
  RateQuote,
  SettlementValuationSnapshot,
} from "@/domain/ledger/types";

import { proposedExpenseDate } from "./expenseDraft";
import { formatLedgerMoney } from "./format";

export function expenseValuationMethod(expense: Pick<LedgerExpense, "valuation">) {
  return expense.valuation?.policy ?? "REFERENCE_RATE";
}

export function valuationHistoryPresentation(
  snapshot: SettlementValuationSnapshot,
  currentOriginal: Money,
  currentJourneyCurrency: string,
  chinese: boolean,
) {
  const titles = {
    REFERENCE_RATE: chinese ? "之前的参考汇率估值" : "Previous reference value",
    MANUAL_AGREED: chinese ? "之前的约定汇率估值" : "Previous agreed value",
    ACTUAL_PAYER_COST: chinese ? "之前的实际付款估值" : "Previous payer-cost value",
    SAME_CURRENCY: chinese ? "之前的同币种估值" : "Previous same-currency value",
    LEGACY_IMPORTED: chinese ? "之前的估值" : "Previous value",
  };
  const context = [
    snapshot.original.currency !== currentOriginal.currency
      ? chinese
        ? `当时的原始货币：${snapshot.original.currency}`
        : `Original currency then: ${snapshot.original.currency}`
      : null,
    snapshot.settlement.currency !== currentJourneyCurrency
      ? chinese
        ? `当时的旅行货币：${snapshot.settlement.currency}`
        : `Journey currency then: ${snapshot.settlement.currency}`
      : null,
    snapshot.policy === "MANUAL_AGREED" && snapshot.reason ? snapshot.reason : null,
  ].filter((item): item is string => Boolean(item));
  return {
    title: titles[snapshot.policy],
    pair:
      snapshot.original.currency !== snapshot.settlement.currency ||
      snapshot.policy === "SAME_CURRENCY"
        ? `${snapshot.original.currency} → ${snapshot.settlement.currency}`
        : null,
    value: `${formatLedgerMoney(snapshot.original.minor, snapshot.original.currency, snapshot.original.scale)} → ${formatLedgerMoney(snapshot.settlement.minor, snapshot.settlement.currency, snapshot.settlement.scale)}`,
    context,
  };
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
  expense: Pick<
    LedgerExpense,
    "status" | "economicDate" | "occurredAt" | "valuation" | "syncStatus"
  >,
  chinese: boolean,
  policy: string | null = "REFERENCE_RATE",
  blocked = false,
  estimated = false,
  today = new Date().toISOString().slice(0, 10),
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
  if (policy !== "REFERENCE_RATE")
    return chinese ? "旅行估值待处理" : "Journey value pending";
  if (expense.syncStatus !== "SYNCED") return chinese ? "更新中…" : "Updating…";
  if (estimated) return chinese ? "预估" : "Estimated";
  return expense.economicDate >= today
    ? chinese
      ? "等待当日参考汇率发布"
      : "Waiting for today's reference rate"
    : chinese
      ? "参考汇率待获取"
      : "Reference rate pending";
}
