import { describe, expect, it } from "vitest";

import {
  analyzeReporting,
  matchesReportingFilters,
  summarizeReporting,
  type ReportingRecord,
} from "./reporting";

const records: ReportingRecord[] = [
  {
    id: "valued",
    title: "Dinner",
    description: null,
    category: "food",
    occurredAt: "2026-09-10T08:00:00.000Z",
    payerMemberId: "a",
    payerName: "Alex",
    originalMinor: 1000,
    originalCurrency: "EUR",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    syncStatus: "PENDING_CREATE",
    settlementMinor: 2000,
    settlementCurrency: "NZD",
    hasOpenConflict: false,
    hasReceipt: true,
    splits: [
      { memberId: "a", memberName: "Alex", settlementMinor: 1200 },
      { memberId: "b", memberName: "Bea", settlementMinor: 800 },
    ],
  },
  {
    id: "rate",
    title: "Taxi",
    description: null,
    category: "transport",
    occurredAt: "2026-09-11T08:00:00.000Z",
    payerMemberId: "b",
    payerName: "Bea",
    originalMinor: 500,
    originalCurrency: "EUR",
    businessStatus: "RATE_REQUIRED",
    settlementParticipation: "INCLUDED",
    syncStatus: "SYNCED",
    settlementMinor: null,
    settlementCurrency: "NZD",
    hasOpenConflict: false,
    hasReceipt: false,
    splits: [{ memberId: "a", memberName: "Alex", settlementMinor: null }],
  },
  {
    id: "conflict",
    title: "Hotel",
    description: null,
    category: "hotel",
    occurredAt: "2026-09-12T08:00:00.000Z",
    payerMemberId: "a",
    payerName: "Alex",
    originalMinor: 4000,
    originalCurrency: "NZD",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    syncStatus: "CONFLICT",
    settlementMinor: 4000,
    settlementCurrency: "NZD",
    hasOpenConflict: true,
    hasReceipt: false,
    splits: [{ memberId: "a", memberName: "Alex", settlementMinor: 4000 }],
  },
];

describe("Stage 6 reporting semantics", () => {
  it("excludes unresolved valuations and conflicts while retaining their counts", () => {
    expect(summarizeReporting(records, "GROUP", "a")).toEqual({
      totalMinor: 2000,
      expenseCount: 1,
      includedExpenseIds: ["valued"],
      unresolvedRateCount: 1,
      openConflictCount: 1,
    });
    expect(summarizeReporting(records, "MINE", "a").totalMinor).toBe(1200);
  });

  it("uses the exact component identities for every bucket", () => {
    const [bucket] = analyzeReporting(records, "CATEGORY", "GROUP", "a");
    expect(bucket.totalMinor).toBe(2000);
    expect(bucket.includedExpenseIds).toEqual(["valued"]);
  });

  it("keeps settlement-excluded ACCEPTED expenses in Spending and consumption analysis", () => {
    const excluded: ReportingRecord = {
      ...records[0]!,
      id: "excluded",
      settlementParticipation: "EXCLUDED",
    };
    expect(summarizeReporting([excluded], "GROUP", "a")).toMatchObject({
      totalMinor: 2000,
      expenseCount: 1,
      includedExpenseIds: ["excluded"],
    });
    expect(summarizeReporting([excluded], "MINE", "a").totalMinor).toBe(1200);
    expect(analyzeReporting([excluded], "CATEGORY", "GROUP", "a")[0]).toMatchObject({
      totalMinor: 2000,
      includedExpenseIds: ["excluded"],
    });
  });

  it("matches SQLite's ASCII-only case folding for text search", () => {
    expect(matchesReportingFilters(records[0]!, { query: "DINNER" })).toBe(true);
    expect(
      matchesReportingFilters({ ...records[0]!, title: "ÄBC" }, { query: "äb" }),
    ).toBe(false);
  });
});
