import { describe, expect, it } from "vitest";

import {
  countLedgerFilters,
  formatExpenseCount,
  ledgerDateFilter,
  searchDateLabel,
} from "./searchFilters";

describe("Ledger Search filters", () => {
  it("counts Analysis category union and completeness filters visibly", () => {
    expect(
      countLedgerFilters({ categories: ["food", "hotel"], analysisState: "INCLUDED" }),
    ).toBe(2);
    expect(countLedgerFilters({ categories: [] })).toBe(0);
  });

  it("labels active time presets without treating All as a filter", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const last30 = ledgerDateFilter("LAST_30", null, "", "", "", now)!;
    expect(searchDateLabel(last30.from!, last30.to, now)).toBe("Last 30 days");
    expect(countLedgerFilters({})).toBe(0);
    expect(countLedgerFilters(last30)).toBe(1);
  });
  it("turns exact and inclusive ranges into repository half-open bounds", () => {
    expect(ledgerDateFilter("EXACT", null, "2026-07-25", "", "")).toEqual({
      from: "2026-07-25T00:00:00.000Z",
      to: "2026-07-26T00:00:00.000Z",
    });
    expect(ledgerDateFilter("RANGE", null, "", "2026-07-25", "2026-07-27")).toEqual({
      from: "2026-07-25T00:00:00.000Z",
      to: "2026-07-28T00:00:00.000Z",
    });
    expect(ledgerDateFilter("RANGE", null, "", "2026-07-28", "2026-07-27")).toBeNull();
  });

  it("uses correct singular and plural wording", () => {
    expect(formatExpenseCount(1)).toBe("1 Expense");
    expect(formatExpenseCount(0)).toBe("0 Expenses");
    expect(formatExpenseCount(2)).toBe("2 Expenses");
  });
});
