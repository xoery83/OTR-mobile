import { describe, expect, it } from "vitest";

import { createLatestRequest } from "./latestRequest";
import {
  adjustmentMatchesCurrentProjection,
  clearSharedSettlementProjection,
  countSettlementChanges,
  currentSettlementSummaryProjection,
  isSettlementConfirmationRefreshing,
  markSettlementConfirmedHead,
  readSavedSettlementProjection,
  readSharedSettlementProjection,
  rememberSettlementExpenseTitles,
  rememberSettlementProjection,
  savedSettlementSummaryProjection,
  settlementExpenseIdentity,
  settlementProjectionAfterConfirmation,
  settlementReviewBlockers,
  shouldPublishSavedSettlementProjection,
} from "./settlementSummaryProjection";

const actor = "00000000-0000-4000-8000-000000000001";

function preview(
  balanceMinor: number,
): NonNullable<Parameters<typeof rememberSettlementProjection>[4]> {
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

  it("reconstructs the latest Adjustment balance from its frozen inputs", () => {
    const expenseId = "00000000-0000-4000-8000-000000000005";
    const other = "00000000-0000-4000-8000-000000000006";
    const valuationId = "00000000-0000-4000-8000-000000000007";
    const money = { minor: 617, currency: "CNY", scale: 2 };
    const splits = [
      { memberId: actor, originalMinor: 100, settlementMinor: 100 },
      { memberId: other, originalMinor: 517, settlementMinor: 517 },
    ];
    const confirmed = {
      id: "00000000-0000-4000-8000-000000000008",
      inputDigest: "c".repeat(64),
      finalizedAt: "2026-09-25T00:00:00.000Z",
      lineageSequence: 1,
      settlementCurrency: "CNY",
      settlementScale: 2,
      balances: [],
      inputs: [
        {
          expenseId,
          expenseRevision: 2,
          payer: { memberId: actor, displayNameSnapshot: "Actor" },
          original: money,
          settlement: money,
          valuation: { id: valuationId },
          splits: splits.map((split) => ({
            member: {
              memberId: split.memberId,
              displayNameSnapshot: split.memberId === actor ? "Actor" : "Other",
            },
            originalMinor: split.originalMinor,
            settlementMinor: split.settlementMinor,
          })),
        },
      ],
    } as unknown as NonNullable<Parameters<typeof savedSettlementSummaryProjection>[1]>;
    const expense = {
      id: expenseId,
      serverId: expenseId,
      revision: 2,
      payerMemberId: actor,
      original: money,
      valuation: { id: valuationId, settlement: money },
      splits,
      status: "ACCEPTED",
      settlementParticipation: "INCLUDED",
    } as Parameters<
      typeof savedSettlementSummaryProjection
    >[0]["inputs"][number]["expense"];
    const saved = savedSettlementSummaryProjection(
      {
        balances: [
          {
            memberId: actor,
            minor: 517,
            paidMinor: 617,
            owedMinor: 100,
            currency: "CNY",
            scale: 2,
          },
        ],
        inputs: [{ expense }],
      },
      confirmed,
      actor,
      false,
    );
    expect(saved).toMatchObject({
      freshness: "SAVED",
      balanceMinor: 517,
      confirmedSettlement: { id: confirmed.id, balanceMinor: 517 },
      confirmationDiff: [],
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

  it("hands the exact coherent projection and titles to Review without a time expiry", () => {
    const source = preview(517);
    const projection = currentSettlementSummaryProjection(source, actor)!;
    rememberSettlementProjection(source.journeyId, actor, true, projection, source);
    rememberSettlementExpenseTitles(source.journeyId, [
      {
        id: "local-bakery",
        serverId: source.confirmationDiff[0].expenseId,
        title: "Bakery receipt ready 📎",
      },
    ]);
    const shared = readSharedSettlementProjection(source.journeyId)!;
    expect(shared.projection).toBe(projection);
    expect(shared.preview).toBe(source);
    expect(
      settlementExpenseIdentity(source.confirmationDiff[0].expenseId, [], shared.titles),
    ).toEqual({ title: "Bakery receipt ready 📎", localId: "local-bakery" });
    expect(readSharedSettlementProjection("another-journey")).toBeNull();
    clearSharedSettlementProjection(source.journeyId);
  });

  it("shows the same Journey balance immediately on Summary re-entry without claiming it is current", () => {
    const source = preview(517);
    const current = currentSettlementSummaryProjection(source, actor)!;
    rememberSettlementProjection(source.journeyId, actor, true, current, source);
    expect(readSavedSettlementProjection(source.journeyId)).toMatchObject({
      freshness: "SAVED",
      balanceMinor: 517,
      confirmedSettlement: { id: source.confirmedSettlement!.id },
      confirmationDiff: source.confirmationDiff,
    });
    expect(readSharedSettlementProjection(source.journeyId)?.projection).toBe(current);
    expect(readSavedSettlementProjection("another-journey")).toBeNull();
    clearSharedSettlementProjection(source.journeyId);
  });

  it("reuses unchanged current and saved generations and hands saved values to Review", () => {
    const source = preview(517);
    const current = currentSettlementSummaryProjection(source, actor)!;
    const saved = {
      ...current,
      freshness: "SAVED" as const,
      projectionId: "LOCAL:source-1",
      sourceFingerprint: null,
    };
    expect(
      shouldPublishSavedSettlementProjection(current, saved, source.sourceFingerprint),
    ).toBe(false);
    const newHead = {
      ...saved,
      confirmedSettlement: { ...saved.confirmedSettlement!, id: "new-head" },
    };
    expect(
      shouldPublishSavedSettlementProjection(current, newHead, source.sourceFingerprint),
    ).toBe(true);
    expect(shouldPublishSavedSettlementProjection(saved, newHead, null)).toBe(true);
    expect(
      shouldPublishSavedSettlementProjection(current, saved, "new-fingerprint"),
    ).toBe(true);
    expect(shouldPublishSavedSettlementProjection(saved, saved, null)).toBe(false);
    rememberSettlementProjection(source.journeyId, actor, true, saved, null);
    expect(readSharedSettlementProjection(source.journeyId)?.projection).toBe(saved);
    expect(readSharedSettlementProjection(source.journeyId)?.preview).toBeNull();
    clearSharedSettlementProjection(source.journeyId);
  });

  it("hides the old diff until a current Preview names the confirmed new head", () => {
    const journeyId = "confirmed-head-journey";
    const old = currentSettlementSummaryProjection(preview(517), actor)!;
    rememberSettlementProjection(journeyId, actor, true, old, null);
    markSettlementConfirmedHead(journeyId, "new-head");
    expect(isSettlementConfirmationRefreshing(journeyId, old)).toBe(true);
    expect(readSharedSettlementProjection(journeyId)).toBeNull();
    const stale = settlementProjectionAfterConfirmation(journeyId, old)!;
    expect(stale).toMatchObject({ freshness: "SAVED", confirmedSettlement: null });
    expect(stale.confirmationDiff).toEqual([]);
    rememberSettlementProjection(journeyId, actor, true, old, null);
    expect(
      readSharedSettlementProjection(journeyId)?.projection.confirmationDiff,
    ).toEqual([]);

    const newHead = {
      ...old,
      confirmedSettlement: { ...old.confirmedSettlement!, id: "new-head" },
      confirmationDiff: [],
    };
    expect(settlementProjectionAfterConfirmation(journeyId, newHead)).toBe(newHead);
    expect(isSettlementConfirmationRefreshing(journeyId, newHead)).toBe(false);
    expect(
      settlementProjectionAfterConfirmation(journeyId, old)?.confirmationDiff,
    ).toEqual([]);
    clearSharedSettlementProjection(journeyId);
  });

  it("counts a long diff compactly and never uses IDs as title fallback", () => {
    const changes = Array.from({ length: 8 }, (_, index) => ({
      expenseId: `expense-${index}`,
      change: "ADDED" as const,
    }));
    expect(
      countSettlementChanges([...changes, { expenseId: "removed", change: "REMOVED" }]),
    ).toEqual({ ADDED: 8, CHANGED: 0, REMOVED: 1 });
    expect(settlementExpenseIdentity("7b942bc5-unknown", [], {})).toEqual({
      title: "Expense",
      localId: undefined,
    });
  });

  it("keeps a known removed rate blocker actionable while fresh preview is unavailable", () => {
    const removed = preview(517).confirmationDiff;
    const blockers = settlementReviewBlockers(removed, [
      { id: "local-bakery", serverId: removed[0].expenseId, status: "RATE_REQUIRED" },
    ]);
    expect(blockers).toEqual([
      { expenseId: removed[0].expenseId, reason: "RATE_REQUIRED" },
    ]);
    expect(settlementReviewBlockers(removed, [], blockers)).toEqual(blockers);
  });

  it("enables confirmation only when head, diff and blockers match the displayed generation", () => {
    const source = preview(517);
    const adjustment = {
      rootSettlementId: source.confirmedSettlement!.id,
      expectedHeadId: null,
      changedExpenses: [
        { expenseId: source.confirmationDiff[0].expenseId, change: "DELETED" as const },
      ],
      blockers: [],
    };
    expect(adjustmentMatchesCurrentProjection(source, adjustment)).toBe(true);
    expect(
      adjustmentMatchesCurrentProjection(source, {
        ...adjustment,
        blockers: [
          { expenseId: source.confirmationDiff[0].expenseId, reason: "RATE_REQUIRED" },
        ],
      }),
    ).toBe(false);
    expect(
      adjustmentMatchesCurrentProjection(source, {
        ...adjustment,
        expectedHeadId: "different-head",
      }),
    ).toBe(false);
    expect(
      adjustmentMatchesCurrentProjection(source, {
        ...adjustment,
        changedExpenses: [],
      }),
    ).toBe(false);
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
