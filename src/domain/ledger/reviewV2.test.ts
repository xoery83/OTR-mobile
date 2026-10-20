import { describe, expect, it } from "vitest";

import type { ExpenseAggregate } from "./types";
import { reviewExpensesV2 } from "./reviewV2";

type Dated = ExpenseAggregate & { occurredAt: string };
const expense = (
  id: string,
  minor: number,
  currency = "NZD",
  date = "2026-09-16",
): Dated => ({
  id,
  journeyId: "journey",
  revision: 1,
  title: "Lunch",
  category: "food",
  occurredAt: date,
  payerMemberId: "payer",
  original: { minor, currency, scale: 2 },
  participants: [
    { memberId: "payer", displayNameSnapshot: "Payer", householdIdSnapshot: null },
  ],
  splits: [
    {
      memberId: "payer",
      originalMinor: minor,
      settlementMinor: minor,
      method: "EXACT",
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: null,
  paymentRecords: [],
  status: "ACCEPTED",
  settlementParticipation: "INCLUDED",
});

describe("Review v2 rules and normalized dependencies", () => {
  it("uses a same-currency/scale cohort of at least five with the 10x upper median", () => {
    const values = [100, 100, 100, 100, 1000].map((n, i) => expense(String(i), n));
    const finding = reviewExpensesV2(values).find(
      (item) => item.ruleId === "AMOUNT_OUTLIER",
    );
    expect(finding?.context).toMatchObject({
      medianMinor: 100,
      cohortSampleSize: 5,
      thresholdMultiplier: 10,
      observedMoney: { minor: 1000, currency: "NZD" },
    });
    expect(
      reviewExpensesV2(values.slice(1, 5)).some(
        (item) => item.ruleId === "AMOUNT_OUTLIER",
      ),
    ).toBe(false);
    const crossCurrency = [...values.slice(0, 4), expense("j", 100000, "JPY")];
    expect(
      reviewExpensesV2(crossCurrency).some((item) => item.ruleId === "AMOUNT_OUTLIER"),
    ).toBe(false);
  });

  it("matches only the same calendar date, recording the chosen counterpart", () => {
    const values = [
      expense("a", 100),
      expense("b", 100),
      expense("c", 100, "NZD", "2026-09-17"),
    ];
    const duplicates = reviewExpensesV2(values).filter(
      (item) => item.ruleId === "POSSIBLE_DUPLICATE",
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].context).toMatchObject({
      matchedExpenseId: "a",
      matchedExpenseRevision: 1,
    });
    expect(
      reviewExpensesV2([values[1], values[2]]).some(
        (item) => item.ruleId === "POSSIBLE_DUPLICATE",
      ),
    ).toBe(false);
  });

  it("records bounds, deterministic posted evidence, and participant identity", () => {
    const a = expense("a", 100);
    a.valuation = {
      id: "v",
      policy: "MANUAL_AGREED",
      original: a.original,
      settlement: a.original,
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
      decimalRate: "1001",
    };
    a.paymentRecords = [
      {
        id: "later",
        instrumentLabel: null,
        authorization: null,
        posted: { ...a.original, minor: 150 },
        postedAt: "2026-09-17",
        fee: null,
        supersedesPaymentRecordId: null,
      },
      {
        id: "earlier",
        instrumentLabel: null,
        authorization: null,
        posted: { ...a.original, minor: 120 },
        postedAt: "2026-09-16",
        fee: null,
        supersedesPaymentRecordId: null,
      },
    ];
    a.participants = [];
    const findings = reviewExpensesV2([a]);
    expect(
      findings.find((item) => item.ruleId === "RATE_OUTLIER")?.context,
    ).toMatchObject({ rateValue: "1001", upperInclusive: 1000, direction: "HIGH" });
    expect(
      findings.find((item) => item.ruleId === "EVIDENCE_MISMATCH")?.context,
    ).toMatchObject({ paymentRecordId: "earlier", differenceMinor: 20 });
    expect(
      findings.find((item) => item.ruleId === "PARTICIPANT_ANOMALY")?.context,
    ).toMatchObject({ payerMemberId: "payer", participantMemberIds: [] });
    a.valuation.decimalRate = "0";
    expect(
      reviewExpensesV2([a]).find((item) => item.ruleId === "RATE_OUTLIER")?.context,
    ).toMatchObject({ direction: "LOW" });
  });

  it("ignores cosmetic edits and ordering, but changes relevant comparison inputs", () => {
    const a = expense("a", 1000);
    const cohort = [a, ...[100, 100, 100, 100].map((n, i) => expense(`b${i}`, n))];
    const observed = () =>
      reviewExpensesV2(cohort).find(
        (item) => item.ruleId === "AMOUNT_OUTLIER" && item.expenseId === "a",
      )!;
    const first = observed();
    a.revision += 1;
    a.category = "lodging";
    expect(observed().input).toBe(first.input);
    expect(observed().comparison).toBe(first.comparison);
    expect(
      reviewExpensesV2([...cohort].reverse()).find(
        (item) => item.ruleId === "AMOUNT_OUTLIER" && item.expenseId === "a",
      )?.comparison,
    ).toBe(first.comparison);
    a.original.minor = 1200;
    expect(observed().input).not.toBe(first.input);
    cohort[1].original.minor = 200;
    expect(observed().comparison).not.toBe(first.comparison);
    a.original.minor = 100;
    expect(
      reviewExpensesV2(cohort).some(
        (item) => item.ruleId === "AMOUNT_OUTLIER" && item.expenseId === "a",
      ),
    ).toBe(false);
  });
});
