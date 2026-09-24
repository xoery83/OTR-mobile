import { describe, expect, it } from "vitest";

import type { SettlementPreview } from "./settlement";
import {
  buildPersonalSettlementStatement,
  comparePersonalSettlementStatements,
  projectPersonalSettlementReviewState,
} from "./personalSettlementReview";

function preview(): SettlementPreview {
  return {
    state: "PREVIEW_READY",
    journeyId: "10000000-0000-4000-8000-000000000001",
    throughTimestamp: "2026-09-23T00:00:00.000Z",
    settlementCurrency: "NZD",
    settlementScale: 2,
    settingsRevision: 1,
    algorithmVersion: "ledger-settlement-greedy-v1",
    members: [
      { memberId: "a", displayNameSnapshot: "A" },
      { memberId: "b", displayNameSnapshot: "B" },
    ],
    inputs: [
      {
        expenseId: "e1",
        expenseRevision: 1,
        settlementParticipation: "INCLUDED",
        payer: { memberId: "a", displayNameSnapshot: "A" },
        original: { minor: 1000, currency: "NZD", scale: 2 },
        settlement: { minor: 1000, currency: "NZD", scale: 2 },
        valuation: {
          id: "v1",
          policy: "SAME_CURRENCY",
          rateSnapshotId: null,
          paymentRecordId: null,
          decimalRate: null,
          roundingMode: "HALF_UP",
        },
        splits: [
          {
            member: { memberId: "a", displayNameSnapshot: "A" },
            originalMinor: 500,
            settlementMinor: 500,
            roundingAdjustmentMinor: 0,
          },
          {
            member: { memberId: "b", displayNameSnapshot: "B" },
            originalMinor: 500,
            settlementMinor: 500,
            roundingAdjustmentMinor: 0,
          },
        ],
      },
    ],
    blockers: [],
    exclusions: [],
    balances: [
      {
        memberId: "a",
        currency: "NZD",
        scale: 2,
        displayNameSnapshot: "A",
        paidMinor: 1000,
        owedMinor: 500,
        transferredMinor: 0,
        netMinor: 500,
      },
      {
        memberId: "b",
        currency: "NZD",
        scale: 2,
        displayNameSnapshot: "B",
        paidMinor: 0,
        owedMinor: 500,
        transferredMinor: 0,
        netMinor: -500,
      },
    ],
    transfers: [],
  };
}

describe("personal Settlement review", () => {
  it("projects not reviewed, explicit checking and stale looks-good states", () => {
    expect(projectPersonalSettlementReviewState(null, "current")).toBe("NOT_REVIEWED");
    expect(
      projectPersonalSettlementReviewState(
        { reviewState: "LOOKS_GOOD", statementFingerprint: "current" },
        "current",
      ),
    ).toBe("LOOKS_GOOD");
    expect(
      projectPersonalSettlementReviewState(
        { reviewState: "LOOKS_GOOD", statementFingerprint: "old" },
        "current",
      ),
    ).toBe("STILL_CHECKING");
    expect(
      projectPersonalSettlementReviewState(
        { reviewState: "STILL_CHECKING", statementFingerprint: "current" },
        "current",
      ),
    ).toBe("STILL_CHECKING");
  });

  it("detects material net-zero contribution changes and ignores snapshots alone", () => {
    const original = buildPersonalSettlementStatement(
      preview(),
      "a",
      new Map([["e1", "Hotel"]]),
      null,
    );
    const changedPreview = preview();
    changedPreview.inputs[0] = {
      ...changedPreview.inputs[0],
      expenseRevision: 2,
      settlement: { minor: 1200, currency: "NZD", scale: 2 },
      valuation: { ...changedPreview.inputs[0].valuation, id: "v2" },
      splits: changedPreview.inputs[0].splits.map((split) => ({
        ...split,
        settlementMinor: split.member.memberId === "a" ? 700 : 500,
      })),
    };
    changedPreview.balances[0] = {
      ...changedPreview.balances[0],
      paidMinor: 1200,
      owedMinor: 700,
    };
    const changed = buildPersonalSettlementStatement(
      changedPreview,
      "a",
      new Map([["e1", "Renamed"]]),
      null,
    );
    const delta = comparePersonalSettlementStatements(original, changed);
    expect(delta?.netDeltaMinor).toBe(0);
    expect(delta?.changedExpenses[0].changeGroups).toEqual([
      "VALUATION_OR_AMOUNT",
      "SHARE",
    ]);
    expect(
      comparePersonalSettlementStatements(original, {
        ...original,
        contributions: original.contributions.map((item) => ({
          ...item,
          sourceRevision: 2,
          expenseTitleSnapshot: "Description-only edit",
        })),
      }),
    ).toBeNull();
    expect(
      comparePersonalSettlementStatements(original, {
        ...original,
        balanceMinor: 0,
        paidMinor: 0,
        shareMinor: 0,
        contributions: [],
      })?.changedExpenses[0].changeGroups,
    ).toEqual(["INCLUSION"]);
  });
});
