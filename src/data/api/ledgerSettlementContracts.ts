import { z } from "zod";

import { isIso4217Money } from "@/domain/ledger/currency";

const uuid = z.uuid();
export const settlementMoneySchema = z
  .object({
    minor: z.number().int(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    scale: z.number().int().min(0).max(4),
  })
  .refine((value) => isIso4217Money(value.currency, value.scale));
const member = z.object({
  memberId: uuid,
  displayNameSnapshot: z.string().min(1).max(200),
});
const balance = z.object({
  memberId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  scale: z.number().int().min(0).max(4),
  displayNameSnapshot: z.string().min(1).max(200),
  paidMinor: z.number().int().nonnegative(),
  owedMinor: z.number().int().nonnegative(),
  transferredMinor: z.literal(0),
  netMinor: z.number().int(),
});
const transfer = z.object({
  fromMemberId: uuid,
  toMemberId: uuid,
  amount: settlementMoneySchema,
});
const input = z.object({
  expenseId: uuid,
  expenseRevision: z.number().int().positive(),
  settlementParticipation: z.literal("INCLUDED").default("INCLUDED"),
  payer: member,
  original: settlementMoneySchema,
  settlement: settlementMoneySchema,
  valuation: z.object({
    id: uuid,
    policy: z.enum([
      "REFERENCE_RATE",
      "ACTUAL_PAYER_COST",
      "MANUAL_AGREED",
      "SAME_CURRENCY",
      "LEGACY_IMPORTED",
    ]),
    rateSnapshotId: uuid.nullable(),
    paymentRecordId: uuid.nullable(),
    decimalRate: z.string().nullable(),
    roundingMode: z.literal("HALF_UP"),
  }),
  splits: z.array(
    z.object({
      member,
      originalMinor: z.number().int().nonnegative(),
      settlementMinor: z.number().int().nonnegative(),
      roundingAdjustmentMinor: z.number().int().min(-1).max(1),
    }),
  ),
});

export const settlementPreviewRequestSchema = z.object({
  throughTimestamp: z.iso.datetime({ offset: true }),
});

export const settlementFinalizeRequestSchema = settlementPreviewRequestSchema.extend({
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const settlementPreviewSchema = z.object({
  state: z.enum(["PREVIEW_BLOCKED", "PREVIEW_READY"]),
  journeyId: uuid,
  throughTimestamp: z.string(),
  settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
  settlementScale: z.number().int().min(0).max(4),
  settingsRevision: z.number().int().positive(),
  algorithmVersion: z.literal("ledger-settlement-greedy-v1"),
  members: z.array(member),
  inputs: z.array(input),
  blockers: z.array(
    z.object({
      expenseId: uuid,
      reason: z.enum(["OPEN_CONFLICT", "RATE_REQUIRED"]),
    }),
  ),
  exclusions: z.array(
    z.object({
      expenseId: uuid,
      reason: z.enum(["DELETED", "DRAFT", "EXCLUDED_FROM_SETTLEMENT"]),
    }),
  ),
  balances: z.array(balance),
  transfers: z.array(transfer),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceAsOf: z.iso.datetime({ offset: true }),
  sourceFingerprintPolicy: z.literal("SETTLEMENT_SOURCE_V1"),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  confirmedSettlement: z
    .object({
      id: uuid,
      inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
      finalizedAt: z.string(),
      lineageSequence: z.number().int().nonnegative(),
      balances: z.array(balance),
    })
    .nullable(),
  confirmationDiff: z.array(
    z.object({
      expenseId: uuid,
      change: z.enum(["ADDED", "CHANGED", "REMOVED"]),
    }),
  ),
});

export const personalSettlementContributionSchema = z.object({
  expenseId: uuid,
  expenseTitleSnapshot: z.string().min(1).max(200),
  sourceRevision: z.number().int().positive(),
  valuationSnapshotId: uuid,
  valuationFingerprint: z.string().min(1),
  payerMemberId: uuid,
  expenseSettlementMinor: z.number().int().nonnegative(),
  payerCreditMinor: z.number().int().nonnegative(),
  shareMinor: z.number().int().nonnegative(),
  netMinor: z.number().int(),
  inclusion: z.literal("INCLUDED"),
});

export const personalSettlementStatementSchema = z.object({
  journeyId: uuid,
  memberId: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/),
  scale: z.number().int().min(0).max(4),
  settingsRevision: z.number().int().positive(),
  algorithmVersion: z.string().min(1),
  settlementId: uuid.nullable(),
  settlementRevision: z.number().int().positive().nullable(),
  settlementInputDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  paidMinor: z.number().int().nonnegative(),
  shareMinor: z.number().int().nonnegative(),
  balanceMinor: z.number().int(),
  contributions: z.array(personalSettlementContributionSchema),
});

export const personalSettlementReviewStateSchema = z.enum([
  "LOOKS_GOOD",
  "STILL_CHECKING",
]);

export const personalSettlementCoverageStateSchema = z.enum([
  "NOT_REVIEWED",
  "STILL_CHECKING",
  "LOOKS_GOOD",
]);

export const personalSettlementCheckpointSchema = z.object({
  id: uuid,
  journeyId: uuid,
  reviewerUserId: uuid,
  reviewerMemberId: uuid,
  statementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedStatement: personalSettlementStatementSchema,
  revision: z.number().int().positive(),
  reviewedAt: z.string(),
  reviewState: personalSettlementReviewStateSchema,
});

export const personalSettlementDeltaSchema = z.object({
  previousBalanceMinor: z.number().int(),
  currentBalanceMinor: z.number().int(),
  netDeltaMinor: z.number().int(),
  changedExpenses: z.array(
    z.object({
      expenseId: uuid,
      expenseTitleSnapshot: z.string().min(1).max(200),
      oldContribution: personalSettlementContributionSchema.nullable(),
      newContribution: personalSettlementContributionSchema.nullable(),
      changeGroups: z.array(
        z.enum(["INCLUSION", "PAYER", "VALUATION_OR_AMOUNT", "SHARE"]),
      ),
    }),
  ),
});

export const personalSettlementReviewResponseSchema = z.object({
  statement: personalSettlementStatementSchema,
  statementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  checkpoint: personalSettlementCheckpointSchema.nullable(),
  delta: personalSettlementDeltaSchema.nullable(),
  coverage: z.array(
    z.object({
      memberId: uuid,
      displayName: z.string().min(1).max(200),
      reviewedAt: z.string().nullable(),
      reviewState: personalSettlementCoverageStateSchema,
    }),
  ),
});

export const createPersonalSettlementCheckpointRequestSchema = z.object({
  id: uuid,
  statementFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  operationId: uuid,
  reviewState: personalSettlementReviewStateSchema,
});

export const repaymentValuationSchema = z.object({
  id: uuid,
  decimalRate: z.string(),
  source: z.enum(["REFERENCE_RATE", "MANUAL_AGREED"]),
  sourceLabel: z.string().min(1).max(120),
  effectiveAt: z.iso.datetime({ offset: true }),
  reason: z.string().nullable(),
});

export const settlementPaymentDischargeSchema = z.object({
  id: uuid,
  amount: settlementMoneySchema,
  confirmationAuthority: z.enum(["RECIPIENT", "ORGANIZER_OVERRIDE"]),
  confirmedByUserId: uuid,
  confirmedByMemberId: uuid,
  reason: z.string().nullable(),
  confirmedAt: z.string(),
});

export const settlementPaymentSchema = z.object({
  id: uuid,
  transferId: uuid,
  status: z.enum([
    "AWAITING_CONFIRMATION",
    "CONFIRMED",
    "REJECTED",
    "DISPUTED",
    "CORRECTED",
  ]),
  payment: settlementMoneySchema,
  assertedDischarge: settlementMoneySchema,
  repaymentValuation: repaymentValuationSchema.nullable(),
  feeTreatment: z
    .object({
      fee: settlementMoneySchema,
      borneBy: z.enum(["DEBTOR", "CREDITOR", "SHARED"]),
    })
    .nullable(),
  reportedByUserId: uuid,
  reportedByMemberId: uuid,
  reportingAuthority: z.enum(["PAYER", "ORGANIZER_OVERRIDE"]),
  reportingReason: z.string().nullable(),
  paidAt: z.string(),
  evidenceAssetId: uuid.nullable(),
  notes: z.string().nullable(),
  supersedesPaymentId: uuid.nullable(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  syncStatus: z.enum(["PENDING", "SYNCED", "FAILED"]).default("SYNCED"),
  discharge: settlementPaymentDischargeSchema.nullable(),
});

export const finalizedSettlementTransferSchema = z.object({
  id: uuid,
  fromMemberId: uuid,
  toMemberId: uuid,
  amount: settlementMoneySchema,
  confirmedDischarge: settlementMoneySchema,
  confirmedRemaining: settlementMoneySchema,
  awaitingAmount: settlementMoneySchema,
  availableToReport: settlementMoneySchema,
  status: z.enum([
    "OPEN",
    "PARTIALLY_PAID",
    "AWAITING_CONFIRMATION",
    "SETTLED",
    "DISPUTED",
    "CANCELLED",
  ]),
  revision: z.number().int().positive(),
  payments: z.array(settlementPaymentSchema),
});

export const finalizedSettlementSchema = z.object({
  id: uuid,
  journeyId: uuid,
  kind: z.enum(["ROOT", "ADJUSTMENT"]).optional(),
  rootSettlementId: uuid.nullable().optional(),
  parentAdjustmentId: uuid.nullable().optional(),
  lineageSequence: z.number().int().nonnegative().optional(),
  priorInputDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional(),
  adjustmentReason: z.string().nullable().optional(),
  correctionSourceExpenseId: uuid.nullable().optional(),
  correctionSuccessorExpenseId: uuid.nullable().optional(),
  eligibilityVersion: z.string().optional(),
  status: z.enum(["FINALIZED", "PARTIALLY_PAID", "SETTLED", "SUPERSEDED"]),
  throughTimestamp: z.string(),
  settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
  settlementScale: z.number().int().min(0).max(4),
  settingsRevision: z.number().int().positive(),
  algorithmVersion: z.literal("ledger-settlement-greedy-v1"),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().positive(),
  finalizedBy: uuid,
  finalizedAt: z.string(),
  inputs: z.array(input),
  balances: z.array(balance),
  adjustmentDeltas: z
    .array(
      z.object({
        memberId: uuid,
        displayNameSnapshot: z.string().min(1).max(200),
        deltaMinor: z.number().int(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        scale: z.number().int().min(0).max(4),
      }),
    )
    .optional(),
  adjustmentState: z
    .enum(["CURRENT", "ADJUSTMENT_REQUIRED", "ADJUSTMENT_BLOCKED"])
    .optional(),
  lineageHeadId: uuid.nullable().optional(),
  outstandingBalances: z
    .array(
      z.object({
        memberId: uuid,
        displayNameSnapshot: z.string().min(1).max(200),
        amount: settlementMoneySchema,
      }),
    )
    .optional(),
  transfers: z.array(finalizedSettlementTransferSchema),
  auditEvents: z.array(
    z.object({
      id: uuid,
      eventType: z.enum([
        "FINALIZED",
        "PAID",
        "RECEIVED",
        "REJECTED",
        "DISPUTED",
        "CORRECTED",
        "ORGANIZER_OVERRIDE",
        "ADJUSTED",
      ]),
      actorUserId: uuid,
      actorMemberId: uuid,
      reason: z.string().nullable(),
      transferId: uuid.nullable(),
      paymentId: uuid.nullable(),
      dischargeId: uuid.nullable(),
      authority: z.enum(["PAYER", "RECIPIENT", "ORGANIZER_OVERRIDE"]).nullable(),
      revision: z.number().int().positive(),
      createdAt: z.string(),
    }),
  ),
});

export const settlementFinalizeResponseSchema = z.object({
  entity: finalizedSettlementSchema,
  idempotentReplay: z.boolean(),
});

const adjustmentVector = z.object({
  memberId: uuid,
  displayNameSnapshot: z.string().min(1).max(200),
  currency: z.string().regex(/^[A-Z]{3}$/),
  scale: z.number().int().min(0).max(4),
  sealedMinor: z.number().int(),
  currentMinor: z.number().int(),
  deltaMinor: z.number().int(),
});

export const settlementAdjustmentPreviewSchema = z.object({
  state: z.enum(["PREVIEW_BLOCKED", "PREVIEW_UNCHANGED", "PREVIEW_READY"]),
  rootSettlementId: uuid,
  expectedHeadId: uuid.nullable(),
  priorInputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  zeroTransfer: z.boolean(),
  inputs: z.array(input),
  balances: z.array(adjustmentVector),
  transfers: z.array(transfer),
  blockers: z.array(
    z.object({
      expenseId: uuid,
      reason: z.enum(["OPEN_CONFLICT", "RATE_REQUIRED"]),
    }),
  ),
  exclusions: z.array(
    z.object({
      expenseId: uuid,
      reason: z.enum(["DELETED", "DRAFT", "EXCLUDED_FROM_SETTLEMENT"]),
    }),
  ),
  changedExpenses: z.array(
    z.object({
      expenseId: uuid,
      change: z.enum(["NEW", "CHANGED", "DELETED"]),
    }),
  ),
});

export const settlementAdjustmentFinalizeRequestSchema = z.object({
  expectedHeadId: uuid.nullable(),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(2000),
  allowZeroTransfer: z.boolean(),
});

export const settlementAdjustmentMutationResponseSchema = z.object({
  entity: finalizedSettlementSchema,
  idempotentReplay: z.boolean(),
});

const correctionMoney = settlementMoneySchema.refine((value) => value.minor > 0);
const correctionSuccessor = z.object({
  localId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable(),
  category: z.string().trim().min(1).max(80),
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  economicDate: z.iso.date().nullable().optional(),
  payerMemberId: uuid,
  original: correctionMoney,
  businessStatus: z.enum(["DRAFT", "ACCEPTED", "RATE_REQUIRED"]),
  settlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
  participants: z.array(
    z.object({
      memberId: uuid,
      displayNameSnapshot: z.string().trim().min(1).max(200),
      householdIdSnapshot: uuid.nullable(),
    }),
  ),
  splits: z.array(
    z.object({
      memberId: uuid,
      method: z.enum([
        "EQUAL_PERSON",
        "EQUAL_HOUSEHOLD",
        "HOUSEHOLD_SHARES",
        "EXACT",
        "PERCENTAGE",
      ]),
      originalMinor: z.number().int().nonnegative(),
      settlementMinor: z.number().int().nonnegative().nullable(),
      weightUnits: z.number().int().positive().nullable(),
      percentageUnits: z.number().int().min(0).max(1_000_000).nullable(),
      roundingAdjustmentMinor: z.number().int().min(-1).max(1),
    }),
  ),
  valuation: z
    .object({
      policy: z.enum([
        "REFERENCE_RATE",
        "ACTUAL_PAYER_COST",
        "MANUAL_AGREED",
        "SAME_CURRENCY",
        "LEGACY_IMPORTED",
      ]),
      original: correctionMoney,
      settlement: correctionMoney,
      rateSnapshotId: uuid.nullable(),
      paymentRecordId: uuid.nullable(),
      reason: z.string().trim().max(1000).nullable(),
    })
    .nullable(),
});

export const settlementCorrectionPreviewRequestSchema = z.object({
  sourceExpenseId: uuid,
  successor: correctionSuccessor,
  reason: z.string().trim().min(1).max(2000),
});

export const settlementCorrectionPreviewSchema = settlementAdjustmentPreviewSchema.extend(
  {
    sourceExpenseId: uuid,
    successorExpenseId: uuid,
  },
);

export const settlementCorrectionConfirmRequestSchema =
  settlementCorrectionPreviewRequestSchema.extend({
    expectedHeadId: uuid.nullable(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    allowZeroTransfer: z.boolean(),
  });

export const settlementCorrectionMutationResponseSchema = z.object({
  entity: finalizedSettlementSchema,
  successorExpenseId: uuid,
  idempotentReplay: z.boolean(),
});

const positiveMoney = settlementMoneySchema.refine((value) => value.minor > 0);
const repaymentProposition = z.object({
  payment: positiveMoney,
  assertedDischarge: positiveMoney,
  repaymentValuation: repaymentValuationSchema.omit({ id: true }).nullable(),
  feeTreatment: z
    .object({
      fee: settlementMoneySchema.refine((value) => value.minor >= 0),
      borneBy: z.enum(["DEBTOR", "CREDITOR", "SHARED"]),
    })
    .nullable(),
  paidAt: z.iso.datetime({ offset: true }),
  evidenceAssetId: uuid.nullable(),
  notes: z.string().max(2000).nullable(),
});

export const recordSettlementPaymentRequestSchema = repaymentProposition.extend({
  localId: uuid,
  baseTransferRevision: z.number().int().positive(),
  reportingAuthority: z.enum(["PAYER", "ORGANIZER_OVERRIDE"]),
  reason: z.string().trim().min(1).max(2000).nullable(),
});

export const settlementPaymentActionRequestSchema = z.object({
  basePaymentRevision: z.number().int().positive(),
  authority: z.enum(["PAYER", "RECIPIENT", "ORGANIZER_OVERRIDE"]).optional(),
  reason: z.string().trim().min(1).max(2000).nullable(),
});

export const correctSettlementPaymentRequestSchema = repaymentProposition.extend({
  basePaymentRevision: z.number().int().positive(),
  replacementLocalId: uuid,
  reason: z.string().trim().min(1).max(2000),
});

export const settlementPaymentMutationResponseSchema = z.object({
  entity: finalizedSettlementSchema,
  paymentId: uuid,
  idempotentReplay: z.boolean(),
});

const personalPaymentEquivalentSchema = z.object({
  recordedEquivalentMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  recordedEquivalentCurrency: z.string().regex(/^[A-Z]{3}$/),
  recordedEquivalentScale: z.number().int().min(0).max(4),
});

const personalPaymentReferenceSchema = z.object({
  referenceRateDecimal: z
    .string()
    .regex(/^(?=.*[1-9])\d+(?:\.\d+)?$/)
    .nullable()
    .optional(),
  referenceRateDate: z.iso.date().nullable().optional(),
  referenceSource: z.string().trim().min(1).max(200).nullable().optional(),
  referenceProvenance: z.record(z.string(), z.unknown()).nullable().optional(),
});

const personalPaymentValueSchema = z
  .object({
    counterpartyMemberId: uuid,
    direction: z.enum(["PAID", "RECEIVED"]),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    scale: z.number().int().min(0).max(4),
    occurredAt: z.iso.datetime({ offset: true }),
    economicDate: z.iso.date().optional(),
    note: z.string().max(2000).nullable().optional(),
    recordedEquivalentMinor: personalPaymentEquivalentSchema.shape.recordedEquivalentMinor
      .nullable()
      .optional(),
    recordedEquivalentCurrency:
      personalPaymentEquivalentSchema.shape.recordedEquivalentCurrency
        .nullable()
        .optional(),
    recordedEquivalentScale: personalPaymentEquivalentSchema.shape.recordedEquivalentScale
      .nullable()
      .optional(),
    ...personalPaymentReferenceSchema.shape,
  })
  .strict()
  .superRefine((value, context) => {
    const equivalent = [
      value.recordedEquivalentMinor,
      value.recordedEquivalentCurrency,
      value.recordedEquivalentScale,
    ];
    if (
      equivalent.some((item) => item != null) &&
      equivalent.some((item) => item == null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Recorded equivalent fields must be supplied together.",
      });
    }
    if (
      value.recordedEquivalentCurrency &&
      value.recordedEquivalentScale != null &&
      !isIso4217Money(value.recordedEquivalentCurrency, value.recordedEquivalentScale)
    ) {
      context.addIssue({
        code: "custom",
        message: "Recorded equivalent currency is invalid.",
      });
    }
    if (!isIso4217Money(value.currency, value.scale)) {
      context.addIssue({ code: "custom", message: "Currency scale is invalid." });
    }
  });

export const createPersonalSettlementPaymentRequestSchema =
  personalPaymentValueSchema.safeExtend({
    id: uuid,
    auditReason: z.string().trim().min(1).max(2000).nullable().optional(),
  });

export const updatePersonalSettlementPaymentRequestSchema =
  personalPaymentValueSchema.safeExtend({
    baseRevision: z.number().int().positive(),
    auditReason: z.string().trim().min(1).max(2000).nullable().optional(),
  });

export const deletePersonalSettlementPaymentRequestSchema = z
  .object({
    baseRevision: z.number().int().positive(),
    auditReason: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const personalSettlementPaymentFxProjectionSchema = z.object({
  id: uuid,
  paymentId: uuid,
  journeyId: uuid,
  targetCurrency: z.string().regex(/^[A-Z]{3}$/),
  targetScale: z.number().int().min(0).max(4),
  policyVersion: z.literal("ECB_DAILY_V1"),
  sourcePaymentRevision: z.number().int().positive(),
  inputDigest: z.string().length(32),
  economicDate: z.iso.date(),
  originalAmountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  originalCurrency: z.string().regex(/^[A-Z]{3}$/),
  originalScale: z.number().int().min(0).max(4),
  state: z.enum(["PENDING", "CONFIRMED", "UNAVAILABLE", "SUPERSEDED"]),
  equivalentMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  decimalRate: z.string().nullable(),
  rateQuoteId: uuid.nullable(),
  referenceDate: z.iso.date().nullable(),
  provider: z.string().nullable(),
  providerReference: z.string().nullable(),
  sourceReference: z.string().nullable(),
  failureCategory: z.string().nullable(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const personalSettlementPaymentSchema = personalPaymentValueSchema.safeExtend({
  id: uuid,
  journeyId: uuid,
  ownerUserId: uuid,
  ownerMemberId: uuid,
  economicDate: z.iso.date().optional(),
  economicDateSource: z.enum(["EXPLICIT", "LEGACY_DERIVED_UTC"]).nullable().optional(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export const personalSettlementPaymentMutationResponseSchema = z.object({
  record: personalSettlementPaymentSchema,
  projections: z.array(personalSettlementPaymentFxProjectionSchema).optional(),
  idempotentReplay: z.boolean(),
});

export const personalSettlementPaymentListResponseSchema = z.object({
  payments: z.array(personalSettlementPaymentSchema),
  projections: z.array(personalSettlementPaymentFxProjectionSchema).optional(),
  serverTime: z.string(),
});

export type SettlementPreviewResponse = z.infer<typeof settlementPreviewSchema>;
export type PersonalSettlementStatementDto = z.infer<
  typeof personalSettlementStatementSchema
>;
export type PersonalSettlementCheckpointDto = z.infer<
  typeof personalSettlementCheckpointSchema
>;
export type PersonalSettlementReviewResponse = z.infer<
  typeof personalSettlementReviewResponseSchema
>;
export type PersonalSettlementReviewState = z.infer<
  typeof personalSettlementReviewStateSchema
>;
export type CreatePersonalSettlementCheckpointRequest = z.infer<
  typeof createPersonalSettlementCheckpointRequestSchema
>;
export type FinalizedSettlementDto = z.infer<typeof finalizedSettlementSchema>;
export type SettlementFinalizeResponse = z.infer<typeof settlementFinalizeResponseSchema>;
export type SettlementAdjustmentPreviewResponse = z.infer<
  typeof settlementAdjustmentPreviewSchema
>;
export type SettlementAdjustmentFinalizeRequest = z.infer<
  typeof settlementAdjustmentFinalizeRequestSchema
>;
export type SettlementAdjustmentMutationResponse = z.infer<
  typeof settlementAdjustmentMutationResponseSchema
>;
export type SettlementCorrectionPreviewRequest = z.infer<
  typeof settlementCorrectionPreviewRequestSchema
>;
export type SettlementCorrectionPreviewResponse = z.infer<
  typeof settlementCorrectionPreviewSchema
>;
export type SettlementCorrectionConfirmRequest = z.infer<
  typeof settlementCorrectionConfirmRequestSchema
>;
export type SettlementCorrectionMutationResponse = z.infer<
  typeof settlementCorrectionMutationResponseSchema
>;
export type SettlementPaymentDto = z.infer<typeof settlementPaymentSchema>;
export type RecordSettlementPaymentRequest = z.infer<
  typeof recordSettlementPaymentRequestSchema
>;
export type SettlementPaymentActionRequest = z.infer<
  typeof settlementPaymentActionRequestSchema
>;
export type CorrectSettlementPaymentRequest = z.infer<
  typeof correctSettlementPaymentRequestSchema
>;
export type SettlementPaymentMutationResponse = z.infer<
  typeof settlementPaymentMutationResponseSchema
>;
export type PersonalSettlementPaymentDto = z.infer<
  typeof personalSettlementPaymentSchema
>;
export type PersonalSettlementPaymentFxProjectionDto = z.infer<
  typeof personalSettlementPaymentFxProjectionSchema
>;
export type CreatePersonalSettlementPaymentRequest = z.infer<
  typeof createPersonalSettlementPaymentRequestSchema
>;
export type UpdatePersonalSettlementPaymentRequest = z.infer<
  typeof updatePersonalSettlementPaymentRequestSchema
>;
export type DeletePersonalSettlementPaymentRequest = z.infer<
  typeof deletePersonalSettlementPaymentRequestSchema
>;
export type PersonalSettlementPaymentMutationResponse = z.infer<
  typeof personalSettlementPaymentMutationResponseSchema
>;
