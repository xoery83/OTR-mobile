import { translate } from "@/ui/locale";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { Money, SettlementValuationSnapshot } from "@/domain/ledger/types";

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
  const language = chinese ? "zh-Hans" : "en";
  const titles = {
    REFERENCE_RATE: translate("fx.presentation0", {}, language),
    MANUAL_AGREED: translate("fx.presentation1", {}, language),
    ACTUAL_PAYER_COST: translate("fx.presentation2", {}, language),
    SAME_CURRENCY: translate("fx.presentation3", {}, language),
    LEGACY_IMPORTED: translate("fx.presentation4", {}, language),
  };
  const context = [
    snapshot.original.currency !== currentOriginal.currency
      ? translate(
          "fx.originalCurrencyThen",
          { currency: snapshot.original.currency },
          language,
        )
      : null,
    snapshot.settlement.currency !== currentJourneyCurrency
      ? translate(
          "fx.journeyCurrencyThen",
          { currency: snapshot.settlement.currency },
          language,
        )
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

export { eligibleExpenseQuote } from "@/data/operations/referenceRateEstimate";

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
  const language = chinese ? "zh-Hans" : "en";
  if (expense.valuation || expense.status !== "RATE_REQUIRED") return null;
  if (blocked) return translate("fx.presentation5", {}, language);
  if (!expense.economicDate)
    return proposedExpenseDate(expense)
      ? translate("fx.presentation6", {}, language)
      : null;
  if (policy === "MANUAL_AGREED") return translate("fx.presentation7", {}, language);
  if (policy === "ACTUAL_PAYER_COST") return translate("fx.presentation8", {}, language);
  if (policy !== "REFERENCE_RATE") return translate("fx.presentation9", {}, language);
  if (expense.syncStatus !== "SYNCED")
    return translate("fx.presentation10", {}, language);
  if (estimated) return translate("fx.presentation11", {}, language);
  return expense.economicDate >= today
    ? translate("fx.presentation12", {}, language)
    : translate("fx.presentation13", {}, language);
}
