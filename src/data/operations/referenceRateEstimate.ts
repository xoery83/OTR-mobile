import {
  ledgerFxReferenceSnapshotBundleSchema,
  type LedgerFxReferenceSnapshotBundle,
} from "@/data/api/ledgerFxContracts";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import {
  convertMoney,
  convertMoneyWithCrossRate,
  parseDecimalRatio,
} from "@/domain/ledger/money";
import type { Money, RateQuote } from "@/domain/ledger/types";
export type DisplayEstimate = {
  money: Money;
  quoteId: string | null;
  exactDate: boolean;
  referenceDate?: string;
  observedAt?: string;
  decimalRate?: string;
};
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
      decimalRate: quote.decimalRate,
      exactDate: quote === exact,
      referenceDate: quote.referenceDate!,
      observedAt: quote.observedAt,
    };
  } catch {
    return null;
  }
}

export function snapshotDisplayEstimate(
  expense: LedgerExpense,
  bundle: LedgerFxReferenceSnapshotBundle | null,
  currency: string,
  scale: number,
  now = new Date(),
): DisplayEstimate | null {
  if (
    expense.valuation ||
    expense.status !== "RATE_REQUIRED" ||
    !expense.economicDate ||
    expense.original.currency === currency ||
    !bundle
  )
    return null;
  const parsed = ledgerFxReferenceSnapshotBundleSchema.safeParse(bundle);
  if (
    !parsed.success ||
    bundle.sourceReference !==
      "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
  )
    return null;
  const source = new URL(bundle.providerReference);
  if (
    source.origin !== "https://api.frankfurter.dev" ||
    source.pathname !== "/v2/providers/ecb/rates"
  )
    return null;
  const day = expense.economicDate;
  const today = now.toISOString().slice(0, 10);
  const snapshot = bundle.snapshots.find((item) => {
    const age =
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${item.referenceDate}T00:00:00Z`)) /
      86_400_000;
    return (
      item.referenceDate <= today &&
      Number.isInteger(age) &&
      age >= 0 &&
      age <= 30 &&
      Date.parse(item.expiresAt) > now.getTime() &&
      item.rates[expense.original.currency] &&
      item.rates[currency]
    );
  });
  if (!snapshot) return null;
  try {
    const sourceRate = parseDecimalRatio(snapshot.rates[expense.original.currency]);
    const targetRate = parseDecimalRatio(snapshot.rates[currency]);
    const numerator = targetRate.numerator * sourceRate.denominator;
    const denominator = targetRate.denominator * sourceRate.numerator;
    const units = (numerator * 10n ** 18n * 2n + denominator) / (2n * denominator);
    const decimalRate = `${units / 10n ** 18n}.${(units % 10n ** 18n).toString().padStart(18, "0")}`;
    return {
      decimalRate,
      money: convertMoneyWithCrossRate(
        expense.original,
        currency,
        scale,
        snapshot.rates[expense.original.currency],
        snapshot.rates[currency],
      ),
      quoteId: null,
      exactDate: false,
      referenceDate: snapshot.referenceDate,
      observedAt: snapshot.observedAt,
    };
  } catch {
    return null;
  }
}
