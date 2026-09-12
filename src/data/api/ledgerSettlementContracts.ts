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
    z.object({ expenseId: uuid, reason: z.enum(["DELETED", "DRAFT"]) }),
  ),
  balances: z.array(balance),
  transfers: z.array(transfer),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
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

export type SettlementPreviewResponse = z.infer<typeof settlementPreviewSchema>;
export type FinalizedSettlementDto = z.infer<typeof finalizedSettlementSchema>;
export type SettlementFinalizeResponse = z.infer<typeof settlementFinalizeResponseSchema>;
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
