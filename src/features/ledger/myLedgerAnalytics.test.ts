import { describe, expect, it } from "vitest";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import type { LedgerJourneyOption } from "@/data/repositories/ledgerReportingRepository";
import type { RateQuote } from "@/domain/ledger/types";
import {
  analyticalSpending,
  displayCurrencies,
  journeyInPeriod,
  type PersonalExpense,
} from "./myLedgerAnalytics";

function journey(currency: string, startDate = "2026-07-01"): LedgerJourneyOption {
  return {
    journeyId: currency,
    title: currency,
    startDate,
    endDate: `${startDate.slice(0, 4)}-07-31`,
    settlementCurrency: currency,
    settlementScale: currency === "ISK" ? 0 : 2,
    hasActor: true,
    memberCount: 2,
  };
}

function expense(
  id: string,
  amount: number,
  currency: string,
  date = "2026-07-08",
  category = "Food",
  status: LedgerExpense["status"] = "ACCEPTED",
): PersonalExpense {
  return {
    memberId: "me",
    expense: {
      id,
      journeyId: currency,
      category,
      occurredAt: `${date}T12:00:00Z`,
      economicDate: date,
      original: { minor: amount, currency, scale: currency === "ISK" ? 0 : 2 },
      splits: [{ memberId: "me", originalMinor: amount / 4 }],
      status,
      deletedAt: status === "DELETED" ? date : null,
    } as unknown as LedgerExpense,
  };
}

const snapshot = {
  referenceDate: "2026-07-08",
  rates: { EUR: "1", NZD: "2", ISK: "100" },
  observedAt: "2026-07-09T00:00:00Z",
  expiresAt: "2026-07-10T00:00:00Z",
};

describe("My Ledger local analytics", () => {
  it("filters Journey dates, deduplicates currencies and uses allocated shares", () => {
    expect(journeyInPeriod(journey("ISK"), "YEAR", 2026)).toBe(true);
    expect(journeyInPeriod(journey("ISK", "2025-01-01"), "YEAR", 2026)).toBe(false);
    expect(journeyInPeriod(journey("ISK", "2025-01-01"), "ALL", 2026)).toBe(true);
    expect(displayCurrencies([journey("NZD"), journey("ISK"), journey("NZD")])).toEqual([
      "ISK",
      "NZD",
    ]);
    const rows = [expense("a", 40000, "NZD"), expense("old", 8000, "NZD", "2025-07-08")];
    expect(analyticalSpending(rows, "YEAR", 2026, "NZD", [], new Map()).totalMinor).toBe(
      10000,
    );
    expect(analyticalSpending(rows, "ALL", 2026, "NZD", [], new Map()).totalMinor).toBe(
      12000,
    );
  });

  it("uses local cross rates and direct quotes, and isolates missing rates", () => {
    const rows = [
      expense("nzd", 400, "NZD"),
      expense("isk", 400, "ISK"),
      expense("usd", 400, "USD"),
    ];
    const cross = analyticalSpending(rows, "YEAR", 2026, "NZD", [snapshot], new Map());
    expect(cross.totalMinor).toBe(300);
    expect(cross.unconverted).toBe(1);
    const quote = {
      journeyId: "USD",
      quoteCurrency: "USD",
      baseCurrency: "NZD",
      provider: "ECB",
      policyVersion: "ECB_DAILY_V1",
      decimalRate: "2",
    } as RateQuote;
    const direct = analyticalSpending(
      rows,
      "YEAR",
      2026,
      "NZD",
      [snapshot],
      new Map([["USD:USD:NZD", [quote]]]),
    );
    expect(direct.totalMinor).toBe(500);
    expect(direct.unconverted).toBe(0);
    expect(direct.categories.reduce((sum, [, minor]) => sum + minor, 0)).toBe(
      direct.totalMinor,
    );
  });

  it("groups top categories and fills zero-spend months", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((category, i) =>
      expense(`${i}`, 400, "NZD", i === 6 ? "2026-09-01" : "2026-07-01", category),
    );
    const year = analyticalSpending(rows, "YEAR", 2026, "NZD", [], new Map());
    expect(year.categories).toHaveLength(6);
    expect(year.categories.at(-1)).toEqual(["Other", 200]);
    expect(year.months).toHaveLength(12);
    expect(year.months[7]).toEqual(["2026-08", 0]);
    const all = analyticalSpending(rows, "ALL", 2026, "NZD", [], new Map());
    expect(all.months).toEqual([
      ["2026-07", 600],
      ["2026-08", 0],
      ["2026-09", 100],
    ]);
    expect(all.months.reduce((sum, [, minor]) => sum + minor, 0)).toBe(all.totalMinor);
  });

  it("omits deleted and draft expenses without blocking other spending", () => {
    const rows = [
      expense("saved", 400, "NZD"),
      expense("deleted", 400, "NZD", "2026-07-08", "Food", "DELETED"),
      expense("draft", 400, "NZD", "2026-07-08", "Food", "DRAFT"),
    ];
    expect(analyticalSpending(rows, "YEAR", 2026, "NZD", [], new Map()).totalMinor).toBe(
      100,
    );
  });
});
