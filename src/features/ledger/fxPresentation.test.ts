import { describe, expect, it } from "vitest";

import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote, SettlementValuationSnapshot } from "@/domain/ledger/types";
import { previewValuation } from "@/domain/ledger/valuation";

import {
  eligibleExpenseQuote,
  expenseValuationMethod,
  fxStatus,
  valuationHistoryPresentation,
} from "./fxPresentation";

const expense = {
  original: { minor: 10000, currency: "EUR", scale: 2 },
  occurredAt: "2026-07-12T00:00:00Z",
  economicDate: "2026-07-12",
  status: "RATE_REQUIRED",
  valuation: null,
  syncStatus: "PENDING_CREATE",
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
  it("presents historical snapshot currencies and evidence, not today's Journey pair", () => {
    const current = { minor: 1200, currency: "NZD", scale: 2 };
    const snapshot = {
      id: "previous",
      policy: "REFERENCE_RATE",
      original: current,
      settlement: { minor: 1235, currency: "CNY", scale: 2 },
      rateSnapshotId: "rate",
      paymentRecordId: null,
      reason: null,
    } satisfies SettlementValuationSnapshot;
    const currentReference = {
      ...snapshot,
      id: "current",
      settlement: { minor: 4638, currency: "CNY", scale: 2 },
    };
    expect(expenseValuationMethod({ valuation: currentReference })).toBe(
      "REFERENCE_RATE",
    );
    expect(currentReference.original.currency).toBe("NZD");
    expect(currentReference.settlement.currency).toBe("CNY");
    expect(currentReference.settlement.minor).toBe(4638);
    const reference = valuationHistoryPresentation(snapshot, current, "CNY", false);
    expect(reference).toMatchObject({
      title: "Previous reference value",
      pair: "NZD → CNY",
      context: [],
    });
    expect(reference.value).toContain("12.00");
    expect(reference.value).toContain("12.35");

    const oldSameCurrency = valuationHistoryPresentation(
      {
        ...snapshot,
        policy: "SAME_CURRENCY",
        original: { minor: 1235, currency: "CNY", scale: 2 },
      },
      current,
      "CNY",
      false,
    );
    expect(oldSameCurrency.pair).toBe("CNY → CNY");
    expect(oldSameCurrency.context).toContain("Original currency then: CNY");

    const oldJourneyCurrency = valuationHistoryPresentation(
      {
        ...snapshot,
        policy: "SAME_CURRENCY",
        settlement: { minor: 1200, currency: "NZD", scale: 2 },
      },
      current,
      "CNY",
      false,
    );
    expect(oldJourneyCurrency.pair).toBe("NZD → NZD");
    expect(oldJourneyCurrency.context).toContain("Journey currency then: NZD");

    expect(
      valuationHistoryPresentation(
        { ...snapshot, policy: "MANUAL_AGREED", reason: "Group agreed" },
        current,
        "CNY",
        false,
      ),
    ).toMatchObject({ title: "Previous agreed value", context: ["Group agreed"] });
    expect(
      valuationHistoryPresentation(
        { ...snapshot, policy: "ACTUAL_PAYER_COST" },
        current,
        "CNY",
        false,
      ).title,
    ).toBe("Previous payer-cost value");
  });
  it("defaults each unresolved Expense to reference independently of other manual/cost evidence", () => {
    const unresolved = { valuation: null };
    const manual = { valuation: { policy: "MANUAL_AGREED" } };
    const cost = { valuation: { policy: "ACTUAL_PAYER_COST" } };
    expect(expenseValuationMethod(unresolved)).toBe("REFERENCE_RATE");
    expect(expenseValuationMethod(manual as never)).toBe("MANUAL_AGREED");
    expect(expenseValuationMethod(cost as never)).toBe("ACTUAL_PAYER_COST");
    expect(expenseValuationMethod(unresolved)).toBe("REFERENCE_RATE");
  });
  it("distinguishes unknown economic date, pending reference and accepted valuation in both languages", () => {
    expect(fxStatus({ ...expense, economicDate: null }, false)).toBe(
      "Save Expense date to update Journey value",
    );
    expect(
      fxStatus({ ...expense, economicDate: null, occurredAt: "" }, false),
    ).toBeNull();
    expect(fxStatus(expense, false)).toBe("Updating…");
    expect(fxStatus(expense, true)).toBe("更新中…");
    const syncedToday = {
      ...expense,
      economicDate: "2026-09-18",
      syncStatus: "SYNCED" as const,
    };
    expect(
      fxStatus(syncedToday, false, "REFERENCE_RATE", false, true, "2026-09-18"),
    ).toBe("Estimated");
    expect(
      fxStatus(syncedToday, false, "REFERENCE_RATE", false, false, "2026-09-18"),
    ).toBe("Waiting for today's reference rate");
    expect(
      fxStatus(
        { ...syncedToday, economicDate: "2026-09-16" },
        false,
        "REFERENCE_RATE",
        false,
        false,
        "2026-09-18",
      ),
    ).toBe("Reference rate pending");
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
