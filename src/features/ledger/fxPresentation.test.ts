import { describe, expect, it } from "vitest";

import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote } from "@/domain/ledger/types";
import { previewValuation } from "@/domain/ledger/valuation";

import { eligibleExpenseQuote, fxStatus } from "./fxPresentation";

const expense = {
  original: { minor: 10000, currency: "EUR", scale: 2 },
  occurredAt: "2026-07-12T00:00:00Z",
  economicDate: "2026-07-12",
  status: "RATE_REQUIRED",
  valuation: null,
} as LedgerExpense;
const quote = {
  id: "quote",
  journeyId: "journey",
  quoteCurrency: "EUR",
  baseCurrency: "NZD",
  decimalRate: "1.9808",
  economicDate: "2026-07-12",
  referenceDate: "2026-07-10",
  effectiveDate: "2026-07-10",
  observedAt: "2026-07-11T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  provider: "ECB",
  policyVersion: "ECB_DAILY_V1",
  sourceReference:
    "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  providerReference:
    "https://api.frankfurter.dev/v2/providers/ecb/rate/EUR/NZD?date=2026-07-12",
} satisfies RateQuote;

describe("Expense FX exceptions", () => {
  it("distinguishes unknown economic date, pending reference and accepted valuation in both languages", () => {
    expect(fxStatus({ ...expense, economicDate: null }, false)).toBe(
      "Save Expense date to update Journey value",
    );
    expect(
      fxStatus({ ...expense, economicDate: null, occurredAt: "" }, false),
    ).toBeNull();
    expect(fxStatus(expense, false)).toBe("Updating…");
    expect(fxStatus(expense, true)).toBe("更新中…");
    expect(fxStatus(expense, false, "MANUAL_AGREED")).toBe("Rate needs review");
    expect(fxStatus(expense, false, "ACTUAL_PAYER_COST")).toBe("Review payment value");
    expect(fxStatus(expense, false, "REFERENCE_RATE", true)).toBe(
      "Resolve expense conflict",
    );
    expect(fxStatus({ ...expense, economicDate: null }, false, "MANUAL_AGREED")).toBe(
      "Save Expense date to update Journey value",
    );
    expect(
      fxStatus({ ...expense, valuation: { policy: "REFERENCE_RATE" } as never }, false),
    ).toBeNull();
  });

  it("allows only current historical ECB evidence in the original-to-Journey direction", () => {
    expect(eligibleExpenseQuote(expense, [quote], "NZD")).toEqual(quote);
    for (const bad of [
      { provider: "Frankfurter" },
      { baseCurrency: "EUR" },
      { referenceDate: "2026-07-13" },
      { referenceDate: "2026-07-01" },
      { expiresAt: "2020-01-01T00:00:00Z" },
      { sourceReference: "Frankfurter" },
    ])
      expect(eligibleExpenseQuote(expense, [{ ...quote, ...bad }], "NZD")).toBeNull();
  });

  it("previews agreed money exactly and requires a reason", () => {
    const input = {
      policy: "MANUAL_AGREED" as const,
      original: expense.original,
      settlementCurrency: "NZD",
      settlementScale: 2,
      manualRate: "1.90",
      reason: "Group agreed",
    };
    expect(previewValuation(input).settlement.minor).toBe(19000);
    expect(() => previewValuation({ ...input, reason: " " })).toThrow("reason");
  });

  it("uses eligible posted payer evidence without deriving a market rate", () => {
    const result = previewValuation({
      policy: "ACTUAL_PAYER_COST",
      original: expense.original,
      settlementCurrency: "NZD",
      settlementScale: 2,
      paymentRecord: {
        id: "payment",
        instrumentLabel: null,
        authorization: null,
        posted: { minor: 12450, currency: "NZD", scale: 2 },
        postedAt: null,
        fee: null,
        supersedesPaymentRecordId: null,
      },
    });
    expect(result).toMatchObject({
      settlement: { minor: 12450 },
      decimalRate: null,
      paymentRecordId: "payment",
    });
  });
});
