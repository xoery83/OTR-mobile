import { describe, expect, it } from "vitest";

import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";

import {
  buildSettlementCategories,
  currentSettlementTransfers,
  splitLabel,
  visiblePersonalPayments,
  visibleSettlementTransfers,
} from "./settlementSections";

describe("Settlement section selectors", () => {
  it("groups authoritative rows once and retains selected-member split context", () => {
    const rows = [row("hotel", 900, "a"), row("food", 300, "b"), row("hotel", 100, "c")];
    const expenses = rows.map(
      (item, index) =>
        ({
          id: item.id,
          splits: [
            {
              memberId: "member-a",
              method: index === 0 ? "EQUAL_PERSON" : "EXACT",
            },
          ],
        }) as LedgerExpense,
    );

    const categories = buildSettlementCategories(rows, expenses, "member-a");

    expect(categories.map((item) => [item.key, item.totalMinor])).toEqual([
      ["hotel", 1_000],
      ["food", 300],
    ]);
    expect(splitLabel(categories[0].rows[0].splitMethod)).toBe("Equal split");
    expect(splitLabel(categories[0].rows[1].splitMethod)).toBe("Custom split");
  });

  it("keeps Mine scoped while allowing organizer-only Everyone", () => {
    const transfers = [
      { fromMemberId: "member-a", toMemberId: "member-b" },
      { fromMemberId: "member-b", toMemberId: "member-c" },
    ];
    expect(visibleSettlementTransfers(transfers, "member-a", false, false)).toEqual([
      transfers[0],
    ]);
    expect(visibleSettlementTransfers(transfers, "member-a", true, false)).toEqual([
      transfers[0],
    ]);
    expect(visibleSettlementTransfers(transfers, "member-a", true, true)).toEqual(
      transfers,
    );

    const records = [payment("member-a", "member-b"), payment("member-b", "member-c")];
    expect(visiblePersonalPayments(records, "member-a", false, false)).toEqual([
      records[0],
    ]);
    expect(visiblePersonalPayments(records, "member-a", true, true)).toEqual(records);
  });

  it("uses the cached canonical preview without consulting personal records", () => {
    const transfers = currentSettlementTransfers(null, null, {
      transfers: [
        {
          fromMemberId: "member-a",
          toMemberId: "member-b",
          amount: { minor: 1_234, currency: "NZD", scale: 2 },
        },
      ],
    });

    expect(transfers).toEqual([
      expect.objectContaining({
        id: null,
        amount: { minor: 1_234, currency: "NZD", scale: 2 },
        legacyPaymentCount: 0,
      }),
    ]);
  });
});

function row(category: string, componentMinor: number, id: string) {
  return {
    id,
    category,
    componentMinor,
    settlementCurrency: "NZD",
    settlementScale: 2,
  } as LedgerReportListItem;
}

function payment(ownerMemberId: string, counterpartyMemberId: string) {
  return { ownerMemberId, counterpartyMemberId } as LocalPersonalPayment;
}
