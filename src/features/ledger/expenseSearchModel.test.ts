import { describe, expect, it } from "vitest";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import { expenseSearchAmounts, expenseSearchView } from "./expenseSearchModel";

const row = {
  originalMinor: 20000,
  originalComponentMinor: 5000,
  originalCurrency: "EUR",
  originalScale: 2,
  settlementMinor: 40000,
  componentMinor: 10000,
  settlementCurrency: "NZD",
  settlementScale: 2,
} as LedgerReportListItem;

describe("Expense Search route and amounts", () => {
  it("normalizes existing Ledger, Analysis, Shares, and Paid entry parameters", () => {
    expect(expenseSearchView({ memberId: "a" })).toEqual({ type: "mine", memberId: "a" });
    expect(expenseSearchView({ memberId: "a", scope: "GROUP" })).toEqual({
      type: "group",
      memberId: "a",
    });
    expect(
      expenseSearchView({ memberId: "a", selectedMemberId: "b", scope: "GROUP" }),
    ).toEqual({ type: "person", memberId: "b" });
    expect(expenseSearchView({ memberId: "a", selectedMemberId: "a" })).toEqual({
      type: "mine",
      memberId: "a",
    });
    expect(expenseSearchView({ memberId: "a", paidMemberId: "b" })).toEqual({
      type: "group",
      memberId: "a",
      paidMemberId: "b",
    });
  });

  it("shows a person's share and Group's total in Journey currency", () => {
    expect(expenseSearchAmounts(row, { type: "mine", memberId: "a" })).toEqual({
      primary: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "NZD",
      }).format(100),
      secondary: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "EUR",
      }).format(50),
    });
    expect(expenseSearchAmounts(row, { type: "person", memberId: "b" }).primary).toBe(
      expenseSearchAmounts(row, { type: "mine", memberId: "a" }).primary,
    );
    expect(expenseSearchAmounts(row, { type: "group", memberId: "a" })).toEqual({
      primary: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "NZD",
      }).format(400),
      secondary: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "EUR",
      }).format(200),
    });
    expect(
      expenseSearchAmounts(
        { ...row, originalCurrency: "NZD" },
        { type: "mine", memberId: "a" },
      ).secondary,
    ).toBeNull();
    expect(
      expenseSearchAmounts(
        { ...row, componentMinor: null },
        { type: "mine", memberId: "a" },
      ),
    ).toEqual({
      primary: "Journey value unavailable",
      secondary: new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "EUR",
      }).format(50),
    });
  });
});
