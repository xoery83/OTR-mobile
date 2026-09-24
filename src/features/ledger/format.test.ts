import { describe, expect, it } from "vitest";

import {
  formatLedgerDate,
  formatLedgerDateFilter,
  formatLedgerRate,
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
  it("keeps exchange rates readable without losing small values", () => {
    expect(formatLedgerRate("1.706900000000000000")).toBe("1.7069");
    expect(formatLedgerRate("0.000060230000000000")).toBe("0.00006023");
    expect(formatLedgerRate("0.000000123456789")).toBe("0.000000123457");
    expect(formatLedgerRate("123456789.123")).toBe("123,457,000");
  });

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

  it("shows actionable financial states and keeps settlement exclusion silent", () => {
    expect(ledgerExpenseAttention({ ...base, componentMinor: null }, "MINE")).toBe(
      "Not in your share",
    );
    expect(
      ledgerExpenseAttention({ ...base, businessStatus: "RATE_REQUIRED" }, "GROUP"),
    ).toBeNull();
    expect(ledgerExpenseAttention({ ...base, hasOpenConflict: true }, "GROUP")).toBe(
      "Conflict—review required",
    );
    const excluded = { ...base, settlementParticipation: "EXCLUDED" as const };
    expect(ledgerExpenseAttention(excluded, "GROUP")).toBeNull();
  });
});
