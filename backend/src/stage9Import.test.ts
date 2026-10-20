import { describe, expect, test } from "vitest";

import { analyzeReporting, summarizeReporting } from "../../src/domain/ledger/reporting";
import {
  buildSettlementAdjustmentVectors,
  buildSettlementPreview,
} from "../../src/domain/ledger/settlement";
import type { ReportingRecord } from "../../src/domain/ledger/reporting";
import type { SettlementExpenseCandidate } from "../../src/domain/ledger/settlement";
import {
  syntheticLegacyExtract,
  syntheticStage9Config,
} from "../../scripts/stage9/syntheticFixture";
import {
  canonicalStage9Json,
  decimalToMinorExact,
  scanStage9Privacy,
  transformLegacyExtract,
} from "./stage9Import";
import { loadStage9Dataset } from "./stage9Loader";

describe("Stage 9 synthetic transformation", () => {
  test("loader rejects a Production target before any network access", async () => {
    await expect(
      loadStage9Dataset({
        target: "hosted-dev",
        url: "https://bobwhxjxqpehzecwmwqe.supabase.co",
        secretKey: "synthetic",
        actorUserId: "00000000-0000-4000-8000-000000000001",
        dataset: {} as never,
        manifest: {} as never,
      }),
    ).rejects.toThrow("STAGE9_TARGET_REJECTED");
  });

  test("is deterministic, exact, classified, private, and repo-safe", () => {
    const first = transformLegacyExtract(syntheticLegacyExtract(), syntheticStage9Config);
    const second = transformLegacyExtract(
      syntheticLegacyExtract(),
      syntheticStage9Config,
    );

    expect(canonicalStage9Json(first)).toBe(canonicalStage9Json(second));
    expect(decimalToMinorExact("10.01", 2)).toBe(1001);
    expect(() => decimalToMinorExact("1.50", 0)).toThrow("UNSAFE_OR_INEXACT_MONEY");
    expect(first.privateApprovalManifest.classificationCounts).toEqual({
      accepted: 3,
      settlementIncluded: 2,
      settlementExcluded: 1,
      needsReviewLoaded: 1,
      needsReviewUnloaded: 2,
      excluded: 1,
    });
    expect(first.privateApprovalManifest.legacyEqualRoundingNormalizedCount).toBe(1);
    const normalized = first.dataset.expenses.filter(
      (expense) => expense.importProvenance.legacyEqualRoundingNormalization,
    );
    expect(normalized).toHaveLength(1);
    expect(normalized[0]!.businessStatus).toBe("ACCEPTED");
    const normalizedSplits = first.dataset.splits.filter(
      (split) => split.expenseId === normalized[0]!.id,
    );
    const normalizedValuation = first.dataset.valuations.find(
      (valuation) => valuation.expenseId === normalized[0]!.id,
    )!;
    expect(
      normalizedSplits.reduce((sum, split) => sum + split.originalAmountMinor, 0),
    ).toBe(normalized[0]!.originalAmountMinor);
    expect(
      normalizedSplits.reduce((sum, split) => sum + split.settlementAmountMinor, 0),
    ).toBe(normalizedValuation.settlementAmountMinor);
    expect(normalizedSplits.map((split) => split.roundingAdjustmentMinor).sort()).toEqual(
      [-1, 0],
    );
    for (const draft of first.dataset.expenses.filter(
      (expense) => expense.businessStatus === "DRAFT",
    )) {
      expect(first.dataset.splits.some((split) => split.expenseId === draft.id)).toBe(
        false,
      );
      expect(
        first.dataset.valuations.some((valuation) => valuation.expenseId === draft.id),
      ).toBe(false);
    }
    expect(first.privacyReport).toEqual({ passed: true, hits: [] });
    expect(
      scanStage9Privacy({ email: "private@example.com" }).hits.map((hit) => hit.code),
    ).toEqual(["FORBIDDEN_FIELD", "EMAIL"]);
    expect(first.privateApprovalManifest.groupedFinancialTotals.length).toBeGreaterThan(
      0,
    );
    expect(first.privateApprovalManifest.legacySettlementTotals).toHaveLength(1);
    const repoSafe = JSON.stringify(first.repoSafeSummary);
    expect(repoSafe).not.toContain("groupedFinancialTotals");
    expect(repoSafe).not.toContain("amountMinor");
    expect(repoSafe).not.toContain("legacySettlementTotals");
    expect(repoSafe).not.toContain("extractedAt");
  });

  test("v3 eligibility is evidence-bounded and independent of source row order", () => {
    const raw = syntheticLegacyExtract();
    const reordered = structuredClone(raw);
    reordered.journeyMembers.reverse();
    reordered.ledgerEntries.reverse();
    reordered.ledgerEntryParticipants.reverse();
    expect(canonicalStage9Json(transformLegacyExtract(raw, syntheticStage9Config))).toBe(
      canonicalStage9Json(transformLegacyExtract(reordered, syntheticStage9Config)),
    );

    const unexplained = syntheticLegacyExtract();
    unexplained.ledgerEntries[1]!.baseAmount = "20.00";
    unexplained.ledgerEntryParticipants.find(
      (participant) => participant.ledgerEntryId === unexplained.ledgerEntries[1]!.id,
    )!.computedShareBaseAmount = "10.01";
    const unexplainedResult = transformLegacyExtract(unexplained, syntheticStage9Config);
    expect(
      unexplainedResult.privateApprovalManifest.legacyEqualRoundingNormalizedCount,
    ).toBe(0);
    expect(
      unexplainedResult.dataset.reviewFindings.some((finding) =>
        finding.evidenceCodes.includes("SETTLEMENT_SPLIT_MISMATCH"),
      ),
    ).toBe(true);

    const statsOnly = syntheticLegacyExtract();
    const statsEntry = statsOnly.ledgerEntries[2]!;
    statsEntry.baseAmount = "20.01";
    for (const participant of statsOnly.ledgerEntryParticipants.filter(
      (item) => item.ledgerEntryId === statsEntry.id,
    ))
      participant.computedShareBaseAmount = "10.01";
    const statsResult = transformLegacyExtract(statsOnly, syntheticStage9Config);
    const statsExpense = statsResult.dataset.expenses.find(
      (expense) => expense.importProvenance.legacyAccountingMode === "stats_only",
    )!;
    expect(statsExpense.businessStatus).toBe("ACCEPTED");
    expect(statsExpense.settlementParticipation).toBe("EXCLUDED");
    expect(statsExpense.importProvenance.legacyEqualRoundingNormalization).not.toBeNull();
  });

  test("review DRAFT records cannot affect reporting, settlement, or adjustment inputs", () => {
    const accepted: ReportingRecord = {
      id: "accepted",
      title: "Accepted",
      description: null,
      category: "food",
      occurredAt: "2026-06-01T00:00:00.000Z",
      payerMemberId: "member-1",
      payerName: "One",
      originalMinor: 1000,
      originalCurrency: "EUR",
      businessStatus: "ACCEPTED",
      settlementParticipation: "INCLUDED",
      syncStatus: "SYNCED",
      settlementMinor: 2000,
      settlementCurrency: "NZD",
      hasOpenConflict: false,
      hasReceipt: false,
      splits: [{ memberId: "member-2", memberName: "Two", settlementMinor: 2000 }],
    };
    const draft: ReportingRecord = {
      ...accepted,
      id: "imported-draft",
      businessStatus: "DRAFT",
      settlementMinor: 999999,
      splits: [{ memberId: "member-2", memberName: "Two", settlementMinor: 999999 }],
    };
    expect(summarizeReporting([accepted, draft], "GROUP", "member-2")).toMatchObject({
      totalMinor: 2000,
      expenseCount: 1,
      includedExpenseIds: ["accepted"],
    });
    expect(summarizeReporting([accepted, draft], "MINE", "member-2")).toMatchObject({
      totalMinor: 2000,
      expenseCount: 1,
      includedExpenseIds: ["accepted"],
    });
    expect(
      analyzeReporting([accepted, draft], "CATEGORY", "GROUP", "member-2")[0],
    ).toMatchObject({ totalMinor: 2000, includedExpenseIds: ["accepted"] });

    const candidate = (
      id: string,
      businessStatus: "ACCEPTED" | "DRAFT",
    ): SettlementExpenseCandidate => ({
      id,
      revision: 1,
      occurredAt: "2026-06-01T00:00:00.000Z",
      businessStatus,
      settlementParticipation: "INCLUDED",
      hasOpenConflict: false,
      payerMemberId: "member-1",
      original: { minor: 1000, currency: "EUR", scale: 2 },
      participants: [{ memberId: "member-2", displayNameSnapshot: "Two" }],
      splits: [
        {
          memberId: "member-2",
          originalMinor: 1000,
          settlementMinor: businessStatus === "DRAFT" ? 999999 : 2000,
          method: "EQUAL_PERSON",
          weightUnits: null,
          percentageUnits: null,
          roundingAdjustmentMinor: 0,
        },
      ],
      valuation: {
        id: `${id}-valuation`,
        policy: "LEGACY_IMPORTED",
        original: { minor: 1000, currency: "EUR", scale: 2 },
        settlement: {
          minor: businessStatus === "DRAFT" ? 999999 : 2000,
          currency: "NZD",
          scale: 2,
        },
        rateSnapshotId: null,
        paymentRecordId: null,
        reason: null,
      },
    });
    const preview = buildSettlementPreview({
      journeyId: "journey",
      throughTimestamp: "2026-06-30T00:00:00.000Z",
      settlementCurrency: "NZD",
      settlementScale: 2,
      settingsRevision: 1,
      members: [
        { memberId: "member-1", displayNameSnapshot: "One" },
        { memberId: "member-2", displayNameSnapshot: "Two" },
      ],
      expenses: [candidate("accepted", "ACCEPTED"), candidate("imported-draft", "DRAFT")],
    });
    expect(preview.inputs.map((input) => input.expenseId)).toEqual(["accepted"]);
    expect(preview.exclusions).toEqual([
      { expenseId: "imported-draft", reason: "DRAFT" },
    ]);
    expect(preview.balances.map((balance) => balance.netMinor)).toEqual([2000, -2000]);
    const adjustment = buildSettlementAdjustmentVectors({
      currency: "NZD",
      scale: 2,
      rootBalances: preview.balances,
      priorDeltaVectors: [],
      currentBalances: preview.balances,
    });
    expect(adjustment.balances.every((balance) => balance.deltaMinor === 0)).toBe(true);
    expect(adjustment.transfers).toEqual([]);
  });
});
