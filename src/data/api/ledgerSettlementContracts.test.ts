import { describe, expect, it } from "vitest";

import {
  createPersonalSettlementPaymentRequestSchema,
  personalSettlementPaymentSchema,
  updatePersonalSettlementPaymentRequestSchema,
} from "./ledgerSettlementContracts";

const payment = {
  id: "74000000-0000-4000-8000-000000000001",
  counterpartyMemberId: "30000000-0000-4000-8000-000000000002",
  direction: "PAID" as const,
  amountMinor: 30_000,
  currency: "NZD",
  scale: 2,
  occurredAt: "2026-09-22T10:00:00+12:00",
};

describe("Settlement 2.0 Personal Payment contracts", () => {
  it.each(["PAID", "RECEIVED"] as const)(
    "accepts %s with optional equivalent and reference provenance",
    (direction) => {
      expect(
        createPersonalSettlementPaymentRequestSchema.parse({
          ...payment,
          direction,
          recordedEquivalentMinor: 17_250,
          recordedEquivalentCurrency: "AUD",
          recordedEquivalentScale: 2,
          referenceRateDecimal: "0.575",
          referenceRateDate: "2026-09-21",
          referenceSource: "ECB",
          referenceProvenance: { observedAt: "2026-09-22T00:00:00Z" },
        }),
      ).toMatchObject({ recordedEquivalentMinor: 17_250, referenceRateDecimal: "0.575" });
    },
  );

  it("accepts no FX metadata and preserves response owner identity", () => {
    expect(createPersonalSettlementPaymentRequestSchema.safeParse(payment).success).toBe(
      true,
    );
    expect(
      personalSettlementPaymentSchema.parse({
        ...payment,
        journeyId: "10000000-0000-4000-8000-000000000001",
        ownerUserId: "20000000-0000-4000-8000-000000000001",
        ownerMemberId: "30000000-0000-4000-8000-000000000001",
        revision: 1,
        createdAt: "2026-09-22T00:00:00Z",
        updatedAt: "2026-09-22T00:00:00Z",
        deletedAt: null,
      }),
    ).toMatchObject({ ownerMemberId: "30000000-0000-4000-8000-000000000001" });
  });

  it.each([
    [{ ...payment, amountMinor: 0 }, "amount"],
    [{ ...payment, currency: "nzd" }, "currency"],
    [{ ...payment, scale: 3 }, "ISO scale"],
    [{ ...payment, recordedEquivalentMinor: 100 }, "partial equivalent"],
    [{ ...payment, ownerUserId: "20000000-0000-4000-8000-000000000099" }, "owner"],
  ])("rejects malformed or authoritative client input (%s)", (value, _label) => {
    expect(createPersonalSettlementPaymentRequestSchema.safeParse(value).success).toBe(
      false,
    );
  });

  it("requires a base revision for update without accepting owner changes", () => {
    const { id: _id, ...update } = payment;
    expect(
      updatePersonalSettlementPaymentRequestSchema.safeParse({
        ...update,
        baseRevision: 1,
      }).success,
    ).toBe(true);
    expect(
      updatePersonalSettlementPaymentRequestSchema.safeParse({
        ...update,
        baseRevision: 1,
        ownerMemberId: "30000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
  });
});

it("preserves legitimate empty response labels without changing identities, amounts or source digests", async () => {
  const { settlementPreviewSchema, personalSettlementReviewResponseSchema } =
    await import("./ledgerSettlementContracts");
  const memberId = payment.counterpartyMemberId;
  const preview = {
    state: "PREVIEW_READY",
    journeyId: payment.id,
    throughTimestamp: payment.occurredAt,
    settlementCurrency: "NZD",
    settlementScale: 2,
    settingsRevision: 1,
    algorithmVersion: "ledger-settlement-greedy-v1",
    members: [{ memberId, displayNameSnapshot: "" }],
    inputs: [],
    blockers: [],
    exclusions: [],
    balances: [
      {
        memberId,
        displayNameSnapshot: "",
        currency: "NZD",
        scale: 2,
        paidMinor: 30,
        owedMinor: 20,
        transferredMinor: 0,
        netMinor: 10,
      },
    ],
    transfers: [
      {
        fromMemberId: memberId,
        toMemberId: payment.id,
        amount: { minor: 10, currency: "NZD", scale: 2 },
      },
    ],
    inputDigest: "a".repeat(64),
    sourceAsOf: payment.occurredAt,
    sourceFingerprintPolicy: "SETTLEMENT_SOURCE_V1",
    sourceFingerprint: "b".repeat(64),
    confirmedSettlement: null,
    confirmationDiff: [],
  };
  const before = JSON.stringify(preview);
  expect(settlementPreviewSchema.parse(preview)).toEqual(preview);
  expect(JSON.stringify(preview)).toBe(before);
  expect(
    settlementPreviewSchema.safeParse({
      ...preview,
      members: [{ memberId: "invalid", displayNameSnapshot: "" }],
    }).success,
  ).toBe(false);
  expect(
    settlementPreviewSchema.safeParse({
      ...preview,
      balances: [{ ...preview.balances[0], paidMinor: -1 }],
    }).success,
  ).toBe(false);
  expect(
    settlementPreviewSchema.safeParse({
      ...preview,
      transfers: [
        { ...preview.transfers[0], amount: { minor: 0.5, currency: "NZD", scale: 2 } },
      ],
    }).success,
  ).toBe(false);
  expect(
    settlementPreviewSchema.safeParse({
      ...preview,
      transfers: [
        { ...preview.transfers[0], amount: { minor: 10, currency: "NZD", scale: 3 } },
      ],
    }).success,
  ).toBe(false);
  const review = {
    statement: {
      journeyId: payment.id,
      memberId,
      currency: "NZD",
      scale: 2,
      settingsRevision: 1,
      algorithmVersion: "ledger-settlement-greedy-v1",
      settlementId: null,
      settlementRevision: null,
      settlementInputDigest: null,
      paidMinor: 30,
      shareMinor: 20,
      balanceMinor: 10,
      contributions: [],
    },
    statementFingerprint: "c".repeat(64),
    checkpoint: null,
    delta: null,
    coverage: [
      { memberId, displayName: "", reviewedAt: null, reviewState: "NOT_REVIEWED" },
    ],
  };
  expect(personalSettlementReviewResponseSchema.parse(review)).toEqual(review);
  expect(
    personalSettlementReviewResponseSchema.safeParse({
      ...review,
      coverage: [{ ...review.coverage[0], memberId: "invalid" }],
    }).success,
  ).toBe(false);
});

it("round-trips empty finalized and adjustment labels without weakening financial or identity fields", async () => {
  const { settlementFinalizeResponseSchema, settlementAdjustmentPreviewSchema } =
    await import("./ledgerSettlementContracts");
  const memberId = payment.counterpartyMemberId;
  const entity = {
    id: payment.id,
    journeyId: payment.id,
    status: "FINALIZED",
    throughTimestamp: payment.occurredAt,
    settlementCurrency: "NZD",
    settlementScale: 2,
    settingsRevision: 1,
    algorithmVersion: "ledger-settlement-greedy-v1",
    inputDigest: "a".repeat(64),
    revision: 1,
    finalizedBy: memberId,
    finalizedAt: payment.occurredAt,
    inputs: [],
    balances: [],
    adjustmentDeltas: [
      { memberId, displayNameSnapshot: "", deltaMinor: 10, currency: "NZD", scale: 2 },
    ],
    outstandingBalances: [
      {
        memberId,
        displayNameSnapshot: "",
        amount: { minor: 10, currency: "NZD", scale: 2 },
      },
    ],
    transfers: [],
    auditEvents: [],
  };
  const finalized = { entity, idempotentReplay: false };
  const raw = JSON.stringify(finalized);
  expect(settlementFinalizeResponseSchema.parse(finalized)).toEqual(finalized);
  expect(JSON.stringify(finalized)).toBe(raw);
  for (const changed of [
    {
      ...entity,
      adjustmentDeltas: [{ ...entity.adjustmentDeltas[0], memberId: "invalid" }],
    },
    { ...entity, adjustmentDeltas: [{ ...entity.adjustmentDeltas[0], deltaMinor: 0.5 }] },
    {
      ...entity,
      outstandingBalances: [{ ...entity.outstandingBalances[0], memberId: "invalid" }],
    },
    {
      ...entity,
      outstandingBalances: [
        {
          ...entity.outstandingBalances[0],
          amount: { minor: 10.5, currency: "NZD", scale: 2 },
        },
      ],
    },
    {
      ...entity,
      outstandingBalances: [
        {
          ...entity.outstandingBalances[0],
          amount: { minor: 10, currency: "NZD", scale: 3 },
        },
      ],
    },
  ])
    expect(
      settlementFinalizeResponseSchema.safeParse({ ...finalized, entity: changed })
        .success,
    ).toBe(false);
  const adjustment = {
    state: "PREVIEW_READY",
    rootSettlementId: payment.id,
    throughTimestamp: payment.occurredAt,
    expectedHeadId: payment.id,
    priorInputDigest: "a".repeat(64),
    inputDigest: "b".repeat(64),
    zeroTransfer: false,
    inputs: [],
    balances: [
      {
        memberId,
        displayNameSnapshot: "",
        currency: "NZD",
        scale: 2,
        sealedMinor: 0,
        currentMinor: 10,
        deltaMinor: 10,
      },
    ],
    transfers: [],
    blockers: [],
    exclusions: [],
    changedExpenses: [],
  };
  const adjustmentRaw = JSON.stringify(adjustment);
  expect(settlementAdjustmentPreviewSchema.parse(adjustment)).toEqual(adjustment);
  expect(JSON.stringify(adjustment)).toBe(adjustmentRaw);
  for (const balance of [
    { ...adjustment.balances[0], memberId: "invalid" },
    { ...adjustment.balances[0], currentMinor: 0.5 },
  ])
    expect(
      settlementAdjustmentPreviewSchema.safeParse({ ...adjustment, balances: [balance] })
        .success,
    ).toBe(false);
  expect(
    settlementAdjustmentPreviewSchema.safeParse({ ...adjustment, inputDigest: "invalid" })
      .success,
  ).toBe(false);
});
