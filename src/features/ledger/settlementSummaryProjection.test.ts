import { describe, expect, it } from "vitest";

import { createLatestRequest } from "./latestRequest";
import {
  currentSettlementSummaryProjection,
  savedSettlementSummaryProjection,
} from "./settlementSummaryProjection";

const actor = "00000000-0000-4000-8000-000000000001";

function preview(
  balanceMinor: number,
): Parameters<typeof currentSettlementSummaryProjection>[0] {
  return {
    state: "PREVIEW_READY",
    journeyId: "00000000-0000-4000-8000-000000000002",
    throughTimestamp: "2026-09-25T00:00:00.000Z",
    settlementCurrency: "JPY",
    settlementScale: 2,
    settingsRevision: 1,
    algorithmVersion: "ledger-settlement-greedy-v1",
    members: [{ memberId: actor, displayNameSnapshot: "Actor" }],
    inputs: [],
    blockers: [],
    exclusions: [],
    balances: [
      {
        memberId: actor,
        displayNameSnapshot: "Actor",
        currency: "JPY",
        scale: 2,
        paidMinor: balanceMinor + 100,
        owedMinor: 100,
        transferredMinor: 0,
        netMinor: balanceMinor,
      },
    ],
    transfers: [],
    inputDigest: "a".repeat(64),
    sourceAsOf: "2026-09-25T00:00:00.000Z",
    sourceFingerprintPolicy: "SETTLEMENT_SOURCE_V1",
    sourceFingerprint: "b".repeat(64),
    confirmedSettlement: {
      id: "00000000-0000-4000-8000-000000000003",
      inputDigest: "c".repeat(64),
      finalizedAt: "2026-09-15T00:00:00.000Z",
      lineageSequence: 0,
      balances: [
        {
          memberId: actor,
          displayNameSnapshot: "Actor",
          currency: "JPY",
          scale: 2,
          paidMinor: 200,
          owedMinor: 100,
          transferredMinor: 0,
          netMinor: 100,
        },
      ],
    },
    confirmationDiff: [
      {
        expenseId: "00000000-0000-4000-8000-000000000004",
        change: "REMOVED",
      },
    ],
  };
}

describe("Settlement Summary projection", () => {
  it("keeps a saved offline projection internally coherent", () => {
    const value = savedSettlementSummaryProjection(
      {
        balances: [
          {
            memberId: actor,
            minor: 517,
            paidMinor: 617,
            owedMinor: 100,
            currency: "JPY",
            scale: 2,
          },
        ],
        inputs: [
          {
            expense: {
              id: "local-expense",
              serverId: null,
              serverRevision: 0,
              journeyId: "journey",
              creatorMemberId: null,
              payerMemberId: actor,
              title: "Offline",
              description: null,
              category: "food",
              occurredAt: "2026-09-25T00:00:00.000Z",
              economicDate: null,
              original: { minor: 617, currency: "JPY", scale: 2 },
              participants: [
                {
                  memberId: actor,
                  displayNameSnapshot: "Actor",
                  householdIdSnapshot: null,
                },
              ],
              splits: [
                {
                  memberId: actor,
                  method: "EXACT",
                  originalMinor: 100,
                  settlementMinor: 100,
                  weightUnits: null,
                  percentageUnits: null,
                  roundingAdjustmentMinor: 0,
                },
              ],
              valuation: null,
              paymentRecords: [],
              status: "ACCEPTED",
              settlementParticipation: "INCLUDED",
              revision: 1,
              deletedAt: null,
              syncStatus: "PENDING_CREATE",
              createdAt: "2026-09-25T00:00:00.000Z",
              updatedAt: "2026-09-25T00:00:00.000Z",
            },
          },
        ],
      },
      null,
      actor,
      true,
    );
    expect(value).toMatchObject({
      freshness: "LOCAL_PENDING",
      balanceMinor: 517,
      paidMinor: 617,
      shareMinor: 100,
      sourceFingerprint: null,
    });
  });

  it("publishes balance, paid/share and confirmation diff from one generation", () => {
    const value = currentSettlementSummaryProjection(preview(517), actor);
    expect(value).toMatchObject({
      freshness: "CURRENT",
      balanceMinor: 517,
      paidMinor: 617,
      shareMinor: 100,
      sourceFingerprint: "b".repeat(64),
      confirmationDiff: [{ change: "REMOVED" }],
      confirmedSettlement: { balanceMinor: 100 },
    });
  });

  it("cannot mix a delayed response with independently refreshed review state", () => {
    const saved = currentSettlementSummaryProjection(preview(-1783), actor)!;
    const delayedReview = { balanceMinor: 999_999, changedExpenses: [] };
    expect(saved.balanceMinor).toBe(-1783);
    expect(saved.confirmationDiff).toHaveLength(1);
    expect(delayedReview.balanceMinor).not.toBe(saved.balanceMinor);

    const refreshed = currentSettlementSummaryProjection(preview(517), actor)!;
    expect(refreshed).toMatchObject({ balanceMinor: 517 });
    expect(refreshed.confirmationDiff).toEqual(saved.confirmationDiff);
  });

  it("switches atomically when pull, valuation, preview and review resolve out of order", async () => {
    const latest = createLatestRequest();
    const published = [currentSettlementSummaryProjection(preview(-1783), actor)!];
    const publish = async (
      response: Promise<Parameters<typeof currentSettlementSummaryProjection>[0]>,
    ) => {
      const request = latest.begin();
      const value = currentSettlementSummaryProjection(await response, actor);
      if (value && latest.isCurrent(request)) published.push(value);
    };
    let finishOld!: (
      value: Parameters<typeof currentSettlementSummaryProjection>[0],
    ) => void;
    let finishCurrent!: (
      value: Parameters<typeof currentSettlementSummaryProjection>[0],
    ) => void;
    const delayedPullAndPreview = publish(
      new Promise((resolve) => (finishOld = resolve)),
    );
    const refreshedValuationAndPreview = publish(
      new Promise((resolve) => (finishCurrent = resolve)),
    );
    const independentlyDelayedReview = Promise.resolve({ attentionCount: 9 });

    await independentlyDelayedReview;
    expect(published).toHaveLength(1);
    finishCurrent(preview(517));
    await refreshedValuationAndPreview;
    finishOld(preview(-999));
    await delayedPullAndPreview;

    expect(published.map(({ balanceMinor }) => balanceMinor)).toEqual([-1783, 517]);
    expect(published.at(-1)).toMatchObject({
      paidMinor: 617,
      shareMinor: 100,
      confirmationDiff: [{ change: "REMOVED" }],
    });
  });
});
