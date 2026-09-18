import { describe, expect, it } from "vitest";

import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { RateQuote } from "@/domain/ledger/types";

import { displayEstimate, displayTotalProjection } from "./displayEstimate";

const now = new Date("2026-09-18T00:00:00Z");
const expense = {
  id: "expense",
  journeyId: "journey",
  economicDate: "2026-09-16",
  status: "RATE_REQUIRED",
  original: { minor: 1_222, currency: "ISK", scale: 0 },
  valuation: null,
} as LedgerExpense;
const quote = {
  id: "quote",
  journeyId: "journey",
  quoteCurrency: "ISK",
  baseCurrency: "CNY",
  decimalRate: "0.05535",
  economicDate: "2026-09-16",
  referenceDate: "2026-09-16",
  effectiveDate: "2026-09-16",
  provider: "ECB",
  policyVersion: "ECB_DAILY_V1",
  sourceReference:
    "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  providerReference:
    "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-09-16",
  observedAt: "2026-09-17T00:00:00Z",
  expiresAt: "2026-10-17T00:00:00Z",
} as RateQuote;

describe("display-only FX estimate", () => {
  it("uses exact candidate, then a recent same-pair candidate, without modifying Expense", () => {
    const before = JSON.stringify(expense);
    expect(displayEstimate(expense, [quote], "CNY", 2, now)).toMatchObject({
      money: { minor: 6_764, currency: "CNY", scale: 2 },
      exactDate: true,
    });
    const recent = {
      ...quote,
      id: "recent",
      economicDate: "2026-09-10",
      referenceDate: "2026-09-10",
      providerReference:
        "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-09-10",
    };
    expect(displayEstimate(expense, [recent], "CNY", 2, now)?.exactDate).toBe(false);
    expect(JSON.stringify(expense)).toBe(before);
  });

  it("rejects old, future, wrong-Journey and untrusted quotes", () => {
    const old = {
      ...quote,
      referenceDate: "2026-08-16",
      economicDate: "2026-08-16",
      providerReference:
        "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-08-16",
    };
    for (const bad of [
      old,
      { ...quote, journeyId: "other" },
      { ...quote, provider: "other" },
    ])
      expect(displayEstimate(expense, [bad], "CNY", 2, now)).toBeNull();
    expect(
      displayEstimate(
        { ...expense, economicDate: null } as LedgerExpense,
        [quote],
        "CNY",
        2,
        now,
      ),
    ).toBeNull();
    expect(
      displayEstimate(
        { ...expense, valuation: { id: "accepted" } } as LedgerExpense,
        [quote],
        "CNY",
        2,
        now,
      ),
    ).toBeNull();
  });

  it("respects target ISO precision without floating-point conversion", () => {
    expect(displayEstimate(expense, [quote], "CNY", 2, now)?.money.minor).toBe(6_764);
    const kwd = {
      ...quote,
      baseCurrency: "KWD",
      providerReference:
        "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/KWD?date=2026-09-16",
    };
    expect(displayEstimate(expense, [kwd], "KWD", 3, now)?.money.minor).toBe(67_638);
    const jpy = {
      ...quote,
      baseCurrency: "JPY",
      providerReference:
        "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/JPY?date=2026-09-16",
    };
    expect(displayEstimate(expense, [jpy], "JPY", 0, now)?.money.minor).toBe(68);
  });

  it("projects GROUP and MINE totals without changing canonical reporting", () => {
    const raw = {
      ...expense,
      splits: [
        { memberId: "leo", originalMinor: 611, settlementMinor: null },
        { memberId: "mary", originalMinor: 611, settlementMinor: null },
      ],
    } as LedgerExpense;
    const estimate = displayEstimate(raw, [quote], "CNY", 2, now)!;
    const row = {
      id: raw.id,
      businessStatus: "RATE_REQUIRED",
      hasOpenConflict: false,
    } as Parameters<typeof displayTotalProjection>[0][number];
    const rawMap = new Map([[raw.id, raw]]);
    const estimateMap = new Map([[raw.id, estimate]]);
    expect(displayTotalProjection([row], rawMap, estimateMap, "GROUP", "leo")).toEqual({
      estimatedMinor: 6_764,
      estimatedCount: 1,
    });
    expect(displayTotalProjection([row], rawMap, estimateMap, "MINE", "leo")).toEqual({
      estimatedMinor: 3_382,
      estimatedCount: 1,
    });
    expect(
      displayTotalProjection(
        [{ ...row, hasOpenConflict: true }],
        rawMap,
        estimateMap,
        "GROUP",
        "leo",
      ).estimatedCount,
    ).toBe(0);
  });
});
