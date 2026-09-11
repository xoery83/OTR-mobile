import { describe, expect, it } from "vitest";

import {
  prototypeBalances,
  prototypeExpenses,
  prototypeJourneys,
  prototypeMembers,
  prototypeTransfers,
} from "./fixtures";

describe("Ledger prototype fixtures", () => {
  it("keeps every financial allocation exact to the minor unit", () => {
    for (const expense of prototypeExpenses) {
      expect(expense.splits.reduce((sum, split) => sum + split.merchantMinor, 0)).toBe(
        expense.merchant.minor,
      );
      expect(expense.splits.reduce((sum, split) => sum + split.settlementMinor, 0)).toBe(
        expense.settlement.minor,
      );
    }
  });

  it("references only fixture Journey members", () => {
    const memberIds = new Set(prototypeMembers.map((member) => member.id));
    for (const expense of prototypeExpenses) {
      expect(memberIds.has(expense.payerMemberId)).toBe(true);
      expect(expense.splits.every((split) => memberIds.has(split.memberId))).toBe(true);
    }
  });

  it("covers the required review states and scenarios", () => {
    expect(prototypeExpenses.some((expense) => expense.status === "PENDING")).toBe(true);
    expect(prototypeExpenses.some((expense) => expense.status === "CONFLICT")).toBe(true);
    expect(prototypeExpenses.some((expense) => expense.paymentRecord)).toBe(true);
    expect(prototypeExpenses.some((expense) => expense.receiptAttached)).toBe(true);
    expect(prototypeExpenses.some((expense) => expense.excludedMemberNames?.length)).toBe(
      true,
    );
    expect(
      prototypeExpenses.some((expense) => expense.splitLabel.includes("child")),
    ).toBe(true);
    expect(prototypeTransfers.length).toBeGreaterThanOrEqual(3);
  });

  it("models overlapping active Journeys without netting their ledgers together", () => {
    expect(
      prototypeJourneys.filter((journey) => journey.status === "ACTIVE"),
    ).toHaveLength(2);
    expect(
      prototypeJourneys.every((journey) => journey.settlementCurrency === "NZD"),
    ).toBe(true);
    expect(prototypeJourneys.some((journey) => journey.status === "PAST")).toBe(true);
    expect(prototypeJourneys.some((journey) => journey.status === "UPCOMING")).toBe(true);
  });

  it("keeps the Journey settlement balance sheet net zero", () => {
    expect(prototypeBalances.reduce((sum, balance) => sum + balance.amountMinor, 0)).toBe(
      0,
    );
  });

  it("supports partial payments and bilateral receipt confirmation", () => {
    const awaiting = prototypeTransfers.find(
      (transfer) => transfer.status === "AWAITING_CONFIRMATION",
    );
    expect(awaiting).toBeDefined();
    expect(
      awaiting?.payments.filter((payment) => payment.status === "CONFIRMED"),
    ).toHaveLength(2);
    expect(
      awaiting?.payments.some((payment) => payment.status === "AWAITING_CONFIRMATION"),
    ).toBe(true);

    for (const transfer of prototypeTransfers) {
      const confirmedMinor = transfer.payments
        .filter((payment) => payment.status === "CONFIRMED")
        .reduce((sum, payment) => sum + payment.dischargedAmount.minor, 0);
      expect(confirmedMinor).toBeLessThanOrEqual(transfer.amount.minor);
      if (transfer.status === "SETTLED") {
        expect(confirmedMinor).toBe(transfer.amount.minor);
      }
    }
  });
});
