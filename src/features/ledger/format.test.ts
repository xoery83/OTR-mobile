import { describe, expect, it } from "vitest";

import {
  formatLedgerDate,
  formatLedgerDateFilter,
  ledgerExpenseAttention,
} from "./format";

const base = {
  businessStatus: "ACCEPTED",
  componentMinor: 100,
  hasOpenConflict: false,
  isAuthoritative: true,
  settlementParticipation: "INCLUDED" as const,
};

describe("Ledger product formatting", () => {
  it("keeps calendar dates precise without fabricating a time", () => {
    const now = new Date(2026, 8, 14, 23, 55);
    expect(formatLedgerDate("2026-09-14", now)).toBe("Today");
    expect(formatLedgerDate("2026-09-13T00:00:00.000Z", now)).toBe("Yesterday");
    const singleDay = formatLedgerDateFilter(
      "2026-07-25T00:00:00.000Z",
      "2026-07-26T00:00:00.000Z",
    );
    expect(singleDay).toContain("25");
    expect(singleDay).toContain("2026");
    expect(singleDay).not.toContain("–");
  });

  it("separates the four actionable financial meanings", () => {
    expect(ledgerExpenseAttention({ ...base, componentMinor: null }, "MINE")).toBe(
      "Not in your share",
    );
    expect(
      ledgerExpenseAttention({ ...base, businessStatus: "RATE_REQUIRED" }, "GROUP"),
    ).toBe("Needs exchange rate");
    expect(ledgerExpenseAttention({ ...base, hasOpenConflict: true }, "GROUP")).toBe(
      "Conflict—review required",
    );
    expect(
      ledgerExpenseAttention({ ...base, settlementParticipation: "EXCLUDED" }, "GROUP"),
    ).toBe("Not included in settlement");
  });
});
