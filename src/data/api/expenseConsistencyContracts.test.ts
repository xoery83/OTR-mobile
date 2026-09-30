import { describe, expect, it } from "vitest";
import type { Stage4EditableExpense } from "@/domain/ledger/conflict";
import {
  buildExpenseUserPatch,
  expensePatchEligibility,
  legacyExpenseIntentCandidate,
  utcInstant,
} from "@/domain/ledger/expenseIntent";
import {
  expenseOperationResultSchema,
  expenseTypedIntentSchema,
  expenseUserPatchSchema,
  expenseConflictChainResolutionRequestSchema,
} from "@/data/api/ledgerMutationContracts";

const memberId = "30000000-0000-4000-8000-000000000001";
const base: Stage4EditableExpense = {
  title: "Meal",
  description: null,
  category: "food",
  occurredAt: "2026-09-24T10:00:00Z",
  economicDate: "2026-09-24",
  payerMemberId: memberId,
  original: { minor: 2300, currency: "USD", scale: 2 },
  businessStatus: "RATE_REQUIRED",
  participants: [{ memberId, displayNameSnapshot: "A", householdIdSnapshot: null }],
  splits: [
    {
      memberId,
      method: "EQUAL_PERSON",
      originalMinor: 2300,
      settlementMinor: null,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: null,
};
const current: Stage4EditableExpense = {
  ...base,
  businessStatus: "ACCEPTED",
  splits: base.splits.map((split) => ({ ...split, settlementMinor: 4056 })),
  valuation: {
    policy: "REFERENCE_RATE",
    original: base.original,
    settlement: { minor: 4056, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
    referenceEvidence: {
      economicDate: "2026-09-24",
      referenceDate: "2026-09-24",
      source: "ECB",
      sourceReference: "ECB",
      deliveryProvider: "ECB",
      providerReference: "ECB",
      observedAt: base.occurredAt,
      acceptedAt: base.occurredAt,
      automatic: true,
    },
  },
};
const eligibility = (
  patch = buildExpenseUserPatch(base, { ...base, title: "New title" }),
  canonical = current,
  verifiedHistoricalBase = true,
) => expensePatchEligibility({ base, current: canonical, patch, verifiedHistoricalBase });

describe("Expense user intent", () => {
  it("normalizes UTC encoding and excludes derived splits and valuation from user patch", () => {
    expect(
      buildExpenseUserPatch(base, {
        ...current,
        occurredAt: "2026-09-24T22:00:00+12:00",
      }),
    ).toEqual({});
    expect(buildExpenseUserPatch(base, { ...base, economicDate: "2026-09-25" })).toEqual({
      financial: { economicDate: "2026-09-25" },
    });
    expect(buildExpenseUserPatch(base, { ...base, economicDate: null })).toEqual({
      financial: { economicDate: null },
    });
  });
  it("rejects invalid timestamps and retains historical date-only UTC", () => {
    expect(utcInstant("2026-09-24")).toBe("2026-09-24T00:00:00.000Z");
    for (const invalid of ["bad", "2026-02-30T00:00:00Z", "2026-09-24T10:00:00"])
      expect(() => utcInstant(invalid)).toThrow();
  });
  it("allows only verified compatible descriptive rebase and equivalent closure", () => {
    expect(eligibility()).toBe("DESCRIPTIVE_REBASE");
    expect(eligibility({}, current)).toBe("EQUIVALENT");
    expect(eligibility(undefined, current, false)).toBe("UNVERIFIED_BASE");
    expect(eligibility(undefined, { ...current, title: "Another choice" })).toBe(
      "CONFLICT",
    );
    expect(eligibility(undefined, { ...current, title: "New title" })).toBe("EQUIVALENT");
    expect(
      expensePatchEligibility({
        base,
        current,
        patch: {},
        verifiedHistoricalBase: true,
        deleted: true,
      }),
    ).toBe("CONFLICT");
  });
  it("rebases only an unchanged participation field across automatic valuation", () => {
    const excluded = { ...base, settlementParticipation: "EXCLUDED" as const };
    const patch = buildExpenseUserPatch(excluded, {
      ...excluded,
      settlementParticipation: "INCLUDED",
    });
    expect(
      expensePatchEligibility({
        base: excluded,
        current: { ...current, settlementParticipation: "EXCLUDED" },
        patch,
        verifiedHistoricalBase: true,
      }),
    ).toBe("DESCRIPTIVE_REBASE");
    expect(
      expensePatchEligibility({
        base: excluded,
        current: { ...current, settlementParticipation: "INCLUDED" },
        patch,
        verifiedHistoricalBase: true,
      }),
    ).toBe("CONFLICT");
    expect(
      expensePatchEligibility({
        base: excluded,
        current: {
          ...current,
          settlementParticipation: "EXCLUDED",
          original: { ...current.original, minor: 2400 },
        },
        patch,
        verifiedHistoricalBase: true,
      }),
    ).toBe("CONFLICT");
  });
  it("keeps Money/date/payer/split and explicit valuation divergence guarded", () => {
    for (const changed of [
      { ...base, original: { ...base.original, minor: 2400 } },
      { ...base, economicDate: "2026-09-25" },
      { ...base, payerMemberId: "other" },
      { ...base, splits: base.splits.map((split) => ({ ...split, weightUnits: 2 })) },
    ]) {
      expect(eligibility(buildExpenseUserPatch(base, changed))).toBe("CONFLICT");
      expect(eligibility({}, changed)).toBe("CONFLICT");
    }
    expect(
      eligibility(undefined, {
        ...current,
        valuation: { ...current.valuation!, policy: "MANUAL_AGREED" },
      }),
    ).toBe("CONFLICT");
  });
  it("adapts old UPDATE evidence and preserves DELETE command semantics without guessing missing evidence", () => {
    expect(
      legacyExpenseIntentCandidate({
        operationType: "LEDGER_DELETE_EXPENSE",
        submitted: base,
      }),
    ).toEqual({ type: "DELETE" });
    expect(
      legacyExpenseIntentCandidate({
        operationType: "LEDGER_UPDATE_EXPENSE",
        base,
        submitted: base,
      }),
    ).toEqual({ type: "UPDATE", patch: {} });
    expect(
      legacyExpenseIntentCandidate({
        operationType: "LEDGER_UPDATE_EXPENSE",
        submitted: base,
      }),
    ).toBeNull();
    expect(
      legacyExpenseIntentCandidate({
        operationType: "LEDGER_UPDATE_EXPENSE",
        base,
        submitted: current,
      }),
    ).toBeNull();
  });
  it("validates omitted versus explicit null fields and rejects derived split input", () => {
    expect(expenseUserPatchSchema.parse({ descriptive: { description: null } })).toEqual({
      descriptive: { description: null },
    });
    expect(expenseUserPatchSchema.safeParse({ descriptive: {} }).success).toBe(false);
    expect(
      expenseUserPatchSchema.safeParse({ participantSplit: { splits: base.splits } })
        .success,
    ).toBe(false);
    expect(
      expenseTypedIntentSchema.safeParse({ type: "DELETE", expense: base }).success,
    ).toBe(false);
  });
  it("requires operation identity, sequence, revision and disposition for confirmation", () => {
    const result = {
      expenseId: "expense-local",
      commandType: "UPDATE",
      state: "SERVER_CONFIRMED",
      operationId: "op",
      intentSequence: 1,
      changed: true,
      disposition: "APPLIED",
      confirmedServerRevision: 2,
    };
    expect(expenseOperationResultSchema.safeParse(result).success).toBe(true);
    expect(
      expenseOperationResultSchema.safeParse({
        ...result,
        confirmedServerRevision: undefined,
      }).success,
    ).toBe(false);
    expect(
      expenseOperationResultSchema.safeParse({ ...result, disposition: null }).success,
    ).toBe(false);
    expect(
      expenseOperationResultSchema.safeParse({
        expenseId: "expense-local",
        commandType: "UPDATE",
        state: "LOCAL_SAVED",
        operationId: null,
        intentSequence: null,
        disposition: null,
        changed: false,
      }).success,
    ).toBe(true);
  });
  it("cannot resolve DELETE by applying an UPDATE patch or duplicate covered IDs", () => {
    const request = {
      contractVersion: 2,
      commandId: "op",
      intentType: "DELETE",
      submittedIntent: { type: "DELETE" },
      observedBaseRevision: 1,
      currentServerRevision: 2,
      coveredConflictIds: [memberId],
      expectedChainDigest: "a".repeat(64),
      choice: "CONFIRM_DELETE",
      reason: "User confirmed deletion",
    };
    expect(expenseConflictChainResolutionRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(
      expenseConflictChainResolutionRequestSchema.safeParse({
        ...request,
        choice: "APPLY_PATCH",
      }).success,
    ).toBe(false);
    expect(
      expenseConflictChainResolutionRequestSchema.safeParse({
        ...request,
        coveredConflictIds: [memberId, memberId],
      }).success,
    ).toBe(false);
  });
});
