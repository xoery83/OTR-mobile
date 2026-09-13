import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildOutstandingBalanceVector,
  buildSettlementAdjustmentVectors,
  canonicalAdjustmentInputJson,
  type SettlementInputSnapshot,
} from "./settlement";

const money = { minor: 100, currency: "NZD", scale: 2 } as const;

function normalizedInput(overrides: Partial<SettlementInputSnapshot> = {}) {
  return {
    expenseId: "expense",
    expenseRevision: 1,
    settlementParticipation: "INCLUDED" as const,
    payer: { memberId: "a", displayNameSnapshot: "A" },
    original: money,
    settlement: money,
    valuation: {
      id: "valuation",
      policy: "SAME_CURRENCY" as const,
      rateSnapshotId: null,
      paymentRecordId: null,
      decimalRate: null,
      roundingMode: "HALF_UP" as const,
    },
    splits: [
      {
        member: { memberId: "b", displayNameSnapshot: "B" },
        originalMinor: 100,
        settlementMinor: 100,
        roundingAdjustmentMinor: 0,
      },
    ],
    ...overrides,
  };
}

function digest(inputs: SettlementInputSnapshot[]) {
  return createHash("sha256")
    .update(
      canonicalAdjustmentInputJson({
        rootSettlementId: "root",
        journeyId: "journey",
        throughTimestamp: "2026-09-12T00:00:00.000Z",
        settlementCurrency: "NZD",
        settlementScale: 2,
        eligibilityVersion: "ledger-settlement-eligibility-v1",
        algorithmVersion: "ledger-settlement-greedy-v1",
        inputs,
      }),
    )
    .digest("hex");
}

describe("Stage 7.2B settlement adjustment", () => {
  it("keeps all root, prior, sealed, current, and delta vectors zero-sum", () => {
    for (let value = 0; value < 100; value += 7) {
      const result = buildSettlementAdjustmentVectors({
        currency: "NZD",
        scale: 2,
        rootBalances: [
          { memberId: "a", displayNameSnapshot: "A", netMinor: value },
          { memberId: "b", displayNameSnapshot: "B", netMinor: -value },
        ],
        priorDeltaVectors: [
          [
            { memberId: "b", displayNameSnapshot: "B", deltaMinor: 3 },
            { memberId: "c", displayNameSnapshot: "C", deltaMinor: -3 },
          ],
        ],
        currentBalances: [
          { memberId: "a", displayNameSnapshot: "A", netMinor: value - 2 },
          { memberId: "b", displayNameSnapshot: "B", netMinor: -value + 5 },
          { memberId: "c", displayNameSnapshot: "C", netMinor: -3 },
        ],
      });
      for (const field of ["sealedMinor", "currentMinor", "deltaMinor"] as const) {
        expect(result.balances.reduce((sum, row) => sum + row[field], 0)).toBe(0);
      }
      expect(result.transfers.reduce((sum, row) => sum + row.amount.minor, 0)).toBe(2);
    }
  });

  it("handles new, changed, deleted/restored and member-union vectors deterministically", () => {
    const root = [
      { memberId: "a", displayNameSnapshot: "A", netMinor: 100 },
      { memberId: "b", displayNameSnapshot: "B", netMinor: -100 },
    ];
    const changed = buildSettlementAdjustmentVectors({
      currency: "NZD",
      scale: 2,
      rootBalances: root,
      priorDeltaVectors: [],
      currentBalances: [
        { memberId: "a", displayNameSnapshot: "A", netMinor: 70 },
        { memberId: "b", displayNameSnapshot: "B", netMinor: -100 },
        { memberId: "c", displayNameSnapshot: "C", netMinor: 30 },
      ],
    });
    expect(
      changed.balances.map(({ memberId, deltaMinor }) => [memberId, deltaMinor]),
    ).toEqual([
      ["a", -30],
      ["b", 0],
      ["c", 30],
    ]);
    expect(changed.transfers).toEqual([
      {
        fromMemberId: "a",
        toMemberId: "c",
        amount: { minor: 30, currency: "NZD", scale: 2 },
      },
    ]);

    const deleted = buildSettlementAdjustmentVectors({
      currency: "NZD",
      scale: 2,
      rootBalances: root,
      priorDeltaVectors: [],
      currentBalances: [],
    });
    expect(deleted.balances.map((row) => row.deltaMinor)).toEqual([-100, 100]);

    const restored = buildSettlementAdjustmentVectors({
      currency: "NZD",
      scale: 2,
      rootBalances: root,
      priorDeltaVectors: [deleted.balances],
      currentBalances: root,
    });
    expect(restored.balances.map((row) => row.deltaMinor)).toEqual([100, -100]);
  });

  it("creates the full reversing delta when a finalized expense becomes excluded", () => {
    const result = buildSettlementAdjustmentVectors({
      currency: "NZD",
      scale: 2,
      rootBalances: [
        { memberId: "a", displayNameSnapshot: "A", netMinor: 100 },
        { memberId: "b", displayNameSnapshot: "B", netMinor: -100 },
      ],
      priorDeltaVectors: [],
      currentBalances: [],
    });
    expect(
      result.balances.map(({ memberId, deltaMinor }) => [memberId, deltaMinor]),
    ).toEqual([
      ["a", -100],
      ["b", 100],
    ]);
  });

  it("ignores descriptive revision/display changes but hashes financial changes", () => {
    const original = normalizedInput();
    expect(
      digest([
        normalizedInput({
          expenseRevision: 9,
          payer: { memberId: "a", displayNameSnapshot: "Renamed" },
        }),
      ]),
    ).toBe(digest([original]));
    expect(
      digest([
        normalizedInput({
          valuation: { ...original.valuation, id: "replacement-valuation" },
        }),
      ]),
    ).toBe(digest([original]));
    expect(
      digest([
        normalizedInput({
          valuation: {
            ...original.valuation,
            policy: "MANUAL_AGREED",
            decimalRate: "1.00",
          },
        }),
      ]),
    ).not.toBe(digest([original]));
  });

  it("subtracts only confirmed discharge facts from outstanding", () => {
    expect(
      buildOutstandingBalanceVector(
        [
          { memberId: "a", sealedMinor: -70 },
          { memberId: "b", sealedMinor: 100 },
          { memberId: "c", sealedMinor: -30 },
        ],
        [{ fromMemberId: "a", toMemberId: "b", amountMinor: 40 }],
      ),
    ).toEqual([
      { memberId: "a", minor: -30 },
      { memberId: "b", minor: 60 },
      { memberId: "c", minor: -30 },
    ]);
  });
});
