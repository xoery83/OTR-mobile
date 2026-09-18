import { describe, expect, it } from "vitest";

import {
  buildDraftSplits,
  correctedCurrencyDraft,
  currencyAmountHint,
  currencyAmountInput,
  parseCurrencyAmount,
  parsePercentageUnits,
  preservesExpenseValuation,
  proposedExpenseDate,
} from "./expenseDraft";

const members = [
  { id: "a", displayName: "A", householdId: "home-a", shareUnits: 1000 },
  { id: "b", displayName: "B", householdId: "home-a", shareUnits: 1000 },
  { id: "c", displayName: "C", householdId: "home-b", shareUnits: 1000 },
];

describe("Expense draft allocation", () => {
  it("uses existing deterministic Household allocation", () => {
    const splits = buildDraftSplits({
      mode: "EQUAL_HOUSEHOLD",
      originalMinor: 1200,
      settlementMinor: 1200,
      members,
    });
    expect(splits.map((split) => split.originalMinor)).toEqual([300, 300, 600]);
    expect(
      buildDraftSplits({
        mode: "EQUAL_HOUSEHOLD",
        originalMinor: 5,
        settlementMinor: 5,
        members: members.slice(1),
      }).map((split) => split.originalMinor),
    ).toEqual([3, 2]);
    expect(() =>
      buildDraftSplits({
        mode: "EQUAL_HOUSEHOLD",
        originalMinor: 100,
        settlementMinor: 100,
        members: [{ ...members[0], householdId: null }],
      }),
    ).toThrow(/needs a Household/);
  });

  it("validates exact and percentage totals", () => {
    expect(
      buildDraftSplits({
        mode: "EXACT",
        originalMinor: 100,
        settlementMinor: null,
        members: members.slice(0, 2),
        exactMinor: { a: 40, b: 60 },
      }).map((split) => split.originalMinor),
    ).toEqual([40, 60]);
    expect(parsePercentageUnits("33.3333")).toBe(333_333);
    expect(parsePercentageUnits("100.0001")).toBeNull();
  });
});

describe("Expense currency and date correction", () => {
  it("proposes a valid legacy day without treating it as confirmed", () => {
    expect(
      proposedExpenseDate({ occurredAt: "2026-09-16T23:00:00Z", economicDate: null }),
    ).toBe("2026-09-16");
    expect(proposedExpenseDate({ occurredAt: "", economicDate: null })).toBeNull();
    expect(
      proposedExpenseDate({ occurredAt: "2026-02-30", economicDate: null }),
    ).toBeNull();
  });
  it("keeps the visible number, never converts it, and reparses at the new ISO scale", () => {
    const draft = correctedCurrencyDraft({ amount: "100.00", currency: "NZD" }, "EUR");
    expect(draft).toEqual({ amount: "100.00", currency: "EUR" });
    expect(parseCurrencyAmount(draft.amount, 2)).toBe(10_000);
    expect(parseCurrencyAmount("100.00", 0)).toBe(100);
    expect(parseCurrencyAmount("100.01", 0)).toBeNull();
    expect(parseCurrencyAmount("100.12", 3)).toBe(100_120);
    expect(parseCurrencyAmount("100.120", 2)).toBe(10_012);
    expect(parseCurrencyAmount("100.121", 2)).toBeNull();
    expect(
      correctedCurrencyDraft({ amount: "2.00", currency: "NZD" }, "ISK").amount,
    ).toBe("2");
    expect(
      correctedCurrencyDraft({ amount: "2.50", currency: "NZD" }, "ISK").amount,
    ).toBe("2.50");
    expect(correctedCurrencyDraft({ amount: "2", currency: "ISK" }, "KWD").amount).toBe(
      "2.000",
    );
  });

  it("limits typed precision without trapping an invalid amount after a currency change", () => {
    expect(currencyAmountInput("2", "2.", 0)).toBe("2");
    expect(currencyAmountInput("2", "2.5", 0)).toBe("2");
    expect(currencyAmountInput("2.50", "2.5", 0)).toBe("2.5");
    expect(currencyAmountInput("12.3", "12.345", 2)).toBe("12.3");
    expect(currencyAmountInput("12.34", "12.345", 3)).toBe("12.345");
    expect(currencyAmountInput("12", "12,5", 2)).toBe("12.5");
    expect(currencyAmountHint("ISK", 0)).toBe("ISK uses whole amounts.");
    expect(currencyAmountHint("KWD", 3)).toBe("KWD uses up to 3 decimal places.");
  });

  it("reparses exact splits under target scale, including zero shares", () => {
    expect(parseCurrencyAmount("40.00", 0, true)).toBe(40);
    expect(parseCurrencyAmount("60.00", 0, true)).toBe(60);
    expect(parseCurrencyAmount("0.00", 0, true)).toBe(0);
    expect(parseCurrencyAmount("40.50", 0, true)).toBeNull();
    expect(
      buildDraftSplits({
        mode: "EXACT",
        originalMinor: 100,
        settlementMinor: null,
        members: members.slice(0, 2),
        exactMinor: { a: 40, b: 60 },
      }).map((split) => split.originalMinor),
    ).toEqual([40, 60]);
  });

  it("invalidates an incompatible original or provably changed stored date label", () => {
    const existing = {
      original: { minor: 10_000, currency: "NZD", scale: 2 },
      occurredAt: "2026-07-15T00:30:00Z",
    };
    expect(preservesExpenseValuation(existing, existing.original, "2026-07-15")).toBe(
      true,
    );
    expect(
      preservesExpenseValuation(
        existing,
        { ...existing.original, minor: 10_001 },
        "2026-07-15",
      ),
    ).toBe(false);
    expect(
      preservesExpenseValuation(
        existing,
        { minor: 10_000, currency: "EUR", scale: 2 },
        "2026-07-15",
      ),
    ).toBe(false);
    expect(preservesExpenseValuation(existing, existing.original, "2026-07-16")).toBe(
      false,
    );
  });

  it("supports same-currency identity after a correction without reusing FX evidence", () => {
    const existing = {
      original: { minor: 10_000, currency: "EUR", scale: 2 },
      occurredAt: "2026-07-15",
    };
    const corrected = {
      minor: parseCurrencyAmount("100.00", 2)!,
      currency: "NZD",
      scale: 2,
    };
    expect(preservesExpenseValuation(existing, corrected, "2026-07-15")).toBe(false);
    expect(corrected.minor).toBe(10_000);
    expect(corrected.currency).toBe("NZD");
  });

  it("uses an explicit date independently of UTC and invalidates confirmation", () => {
    const existing = {
      original: { minor: 100, currency: "EUR", scale: 2 },
      occurredAt: "2026-07-14T23:30:00Z",
      economicDate: "2026-07-15",
    };
    expect(
      preservesExpenseValuation(existing, existing.original, "2026-07-15", "2026-07-15"),
    ).toBe(true);
    expect(
      preservesExpenseValuation(existing, existing.original, "2026-07-16", "2026-07-16"),
    ).toBe(false);
    expect(
      preservesExpenseValuation(
        { ...existing, economicDate: null },
        existing.original,
        "2026-07-14",
        "2026-07-14",
      ),
    ).toBe(false);
  });
});
