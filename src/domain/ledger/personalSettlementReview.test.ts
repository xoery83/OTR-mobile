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

  it("allows acknowledgement of unresolved FX and fingerprints the unvalued personal source", () => {
    const blocked = preview();
    blocked.state = "PREVIEW_BLOCKED";
    blocked.blockers = [{ expenseId: "pending", reason: "RATE_REQUIRED" }];
    const pending = {
      id: "pending",
      revision: 1,
      occurredAt: "2026-09-23T00:00:00Z",
      businessStatus: "RATE_REQUIRED" as const,
      settlementParticipation: "INCLUDED" as const,
      hasOpenConflict: false,
      payerMemberId: "a",
      original: { minor: 1000, currency: "JPY", scale: 0 },
      participants: [],
      splits: [
        {
          memberId: "b",
          method: "EQUAL_PERSON" as const,
          weightUnits: null,
          percentageUnits: null,
          originalMinor: 1000,
          settlementMinor: null,
          roundingAdjustmentMinor: 0,
        },
      ],
      valuation: null,
    };
    const statement = buildPersonalSettlementStatement(blocked, "a", new Map(), null, [
      pending,
    ]);
    expect(statement.balanceMinor).toBe(500);
    expect(statement.unresolvedSource).toContain("pending");
    expect(
      buildPersonalSettlementStatement(blocked, "a", new Map(), null, [
        { ...pending, revision: 2 },
      ]).unresolvedSource,
    ).not.toBe(statement.unresolvedSource);
    blocked.members.push({ memberId: "unrelated", displayNameSnapshot: "Other" });
    expect(
      buildPersonalSettlementStatement(blocked, "unrelated", new Map(), null, [pending])
        .unresolvedSource,
    ).toBeUndefined();
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
