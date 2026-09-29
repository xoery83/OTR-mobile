import { describe, expect, it } from "vitest";

import {
  countLedgerFilters,
  formatExpenseCount,
  ledgerDateFilter,
} from "./searchFilters";

describe("Ledger Search filters", () => {
  it("counts Analysis category union and completeness filters visibly", () => {
    expect(
      countLedgerFilters({ categories: ["food", "hotel"], analysisState: "INCLUDED" }),
    ).toBe(2);
    expect(countLedgerFilters({ categories: [] })).toBe(0);
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
