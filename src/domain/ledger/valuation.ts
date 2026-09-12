import { convertMoney, parseDecimalRatio } from "./money";
import type { Money, PaymentRecord, RateQuote, ValuationPolicy } from "./types";

type ValuationInput = {
  policy: Exclude<ValuationPolicy, "LEGACY_IMPORTED">;
  original: Money;
  settlementCurrency: string;
  settlementScale: number;
  rateQuote?: RateQuote;
  paymentRecord?: PaymentRecord;
  manualRate?: string;
  reason?: string;
};

export type ValuationPreview = {
  settlement: Money;
  decimalRate: string | null;
  rateQuoteId: string | null;
  paymentRecordId: string | null;
  reason: string | null;
};

export function previewValuation(input: ValuationInput): ValuationPreview {
  const reason = input.reason?.trim() || null;
  if (input.policy === "SAME_CURRENCY") {
    if (
      input.original.currency !== input.settlementCurrency ||
      input.original.scale !== input.settlementScale
    ) {
      throw new Error("SAME_CURRENCY requires matching currencies and scales.");
    }
    return {
      settlement: { ...input.original },
      decimalRate: "1",
      rateQuoteId: null,
      paymentRecordId: null,
      reason,
    };
  }
  if (input.policy === "ACTUAL_PAYER_COST") {
    const posted = input.paymentRecord?.posted;
    if (
      !posted ||
      posted.currency !== input.settlementCurrency ||
      posted.scale !== input.settlementScale
    ) {
      throw new Error("ACTUAL_PAYER_COST requires a posted cost in settlement money.");
    }
    return {
      settlement: { ...posted },
      decimalRate: null,
      rateQuoteId: null,
      paymentRecordId: input.paymentRecord!.id,
      reason,
    };
  }
  if (input.policy === "MANUAL_AGREED") {
    if (!reason) throw new Error("MANUAL_AGREED requires a reason.");
    if (!input.manualRate) throw new Error("MANUAL_AGREED requires a rate.");
    parseDecimalRatio(input.manualRate);
    return {
      settlement: convertMoney(
        input.original,
        input.settlementCurrency,
        input.settlementScale,
        input.manualRate,
      ),
      decimalRate: input.manualRate,
      rateQuoteId: null,
      paymentRecordId: null,
      reason,
    };
  }
  const quote = input.rateQuote;
  if (
    !quote ||
    quote.quoteCurrency !== input.original.currency ||
    quote.baseCurrency !== input.settlementCurrency
  ) {
    throw new Error("REFERENCE_RATE requires a trusted matching rate quote.");
  }
  return {
    settlement: convertMoney(
      input.original,
      input.settlementCurrency,
      input.settlementScale,
      quote.decimalRate,
    ),
    decimalRate: quote.decimalRate,
    rateQuoteId: quote.id,
    paymentRecordId: null,
    reason,
  };
}
