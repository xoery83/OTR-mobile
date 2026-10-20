import { describe, expect, it } from "vitest";

import {
  buildSettlementPreview,
  replaceSettlementExpenseSource,
  type SettlementExpenseCandidate,
  type SettlementPreviewInput,
} from "./settlement";

const owner = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";

function expense(overrides: Partial<SettlementExpenseCandidate> = {}) {
  const amount = overrides.original?.minor ?? 100;
  return {
    id: "10000000-0000-4000-8000-000000000001",
    revision: 1,
    occurredAt: "2026-09-01T00:00:00.000Z",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    hasOpenConflict: false,
    payerMemberId: owner,
    original: { minor: amount, currency: "NZD", scale: 2 },
    participants: [
      { memberId: owner, displayNameSnapshot: "Owner" },
      { memberId: member, displayNameSnapshot: "Member" },
    ],
    splits: [
      {
        memberId: owner,
        method: "EXACT",
        originalMinor: Math.floor(amount / 2),
        settlementMinor: Math.floor(amount / 2),
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
      {
        memberId: member,
        method: "EXACT",
        originalMinor: Math.ceil(amount / 2),
        settlementMinor: Math.ceil(amount / 2),
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      id: "20000000-0000-4000-8000-000000000001",
      policy: "SAME_CURRENCY",
      original: { minor: amount, currency: "NZD", scale: 2 },
      settlement: { minor: amount, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
      decimalRate: "1",
      roundingMode: "HALF_UP",
    },
    ...overrides,
  } satisfies SettlementExpenseCandidate;
}

function source(): SettlementPreviewInput {
  return {
    journeyId: "30000000-0000-4000-8000-000000000001",
    throughTimestamp: "2026-09-30T00:00:00.000Z",
    settlementCurrency: "NZD",
    settlementScale: 2,
    settingsRevision: 1,
    members: [
      { memberId: owner, displayNameSnapshot: "Owner" },
      { memberId: member, displayNameSnapshot: "Member" },
    ],
    expenses: [expense()],
  };
}

function corrected(overrides: Partial<SettlementExpenseCandidate> = {}) {
  const value = expense({
    id: "10000000-0000-4000-8000-000000000002",
    ...overrides,
  });
  return {
    ...value,
    valuation: value.valuation
      ? {
          ...value.valuation,
          id: overrides.valuation?.id ?? "20000000-0000-4000-8000-000000000002",
        }
      : null,
  };
}

describe("Settlement correction source replacement", () => {
  it("replaces instead of double counting and preserves exact zero-sum math", () => {
    const preview = buildSettlementPreview(
      replaceSettlementExpenseSource(source(), expense().id, corrected()),
    );
    expect(preview.inputs.map((input) => input.expenseId)).toEqual([
      "10000000-0000-4000-8000-000000000002",
    ]);
    expect(preview.balances.reduce((sum, balance) => sum + balance.netMinor, 0)).toBe(0);
  });

  it.each([
    [
      "amount increase",
      corrected({ original: { minor: 140, currency: "NZD", scale: 2 } }),
    ],
    [
      "amount decrease",
      corrected({ original: { minor: 80, currency: "NZD", scale: 2 } }),
    ],
    ["payer change", corrected({ payerMemberId: member })],
    [
      "participant/split change",
      corrected({
        participants: [{ memberId: member, displayNameSnapshot: "Member" }],
        splits: [
          {
            memberId: member,
            method: "EXACT",
            originalMinor: 100,
            settlementMinor: 100,
            weightUnits: null,
            percentageUnits: null,
            roundingAdjustmentMinor: 0,
          },
        ],
      }),
    ],
    [
      "valuation change",
      corrected({
        valuation: {
          ...corrected().valuation!,
          settlement: { minor: 120, currency: "NZD", scale: 2 },
        },
        splits: [
          { ...corrected().splits[0], settlementMinor: 60 },
          { ...corrected().splits[1], settlementMinor: 60 },
        ],
      }),
    ],
  ])("supports %s", (_label, successor) => {
    expect(() =>
      buildSettlementPreview(
        replaceSettlementExpenseSource(source(), expense().id, successor),
      ),
    ).not.toThrow();
  });

  it("represents removal with an excluded successor", () => {
    const preview = buildSettlementPreview(
      replaceSettlementExpenseSource(
        source(),
        expense().id,
        corrected({ settlementParticipation: "EXCLUDED" }),
      ),
    );
    expect(preview.inputs).toEqual([]);
    expect(preview.exclusions[0]).toMatchObject({
      expenseId: "10000000-0000-4000-8000-000000000002",
      reason: "EXCLUDED_FROM_SETTLEMENT",
    });
  });

  it("rejects stale and same-identity successors", () => {
    expect(() =>
      replaceSettlementExpenseSource(source(), "missing", corrected()),
    ).toThrow("stale");
    expect(() =>
      replaceSettlementExpenseSource(source(), expense().id, expense()),
    ).toThrow("new identity");
  });
});
