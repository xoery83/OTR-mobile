import { z } from "zod";

import { isIso4217Money } from "@/domain/ledger/currency";
import { receiptSchema } from "./ledgerReceiptContracts";
import {
  finalizedSettlementSchema,
  personalSettlementPaymentFxProjectionSchema,
  personalSettlementPaymentSchema,
} from "./ledgerSettlementContracts";
import {
  ledgerReviewActionSchema,
  ledgerReviewFindingSchema,
} from "./ledgerReviewContracts";

const uuidSchema = z.uuid();
export const economicDateSchema = z.iso.date();
export const ledgerMoneySchema = z
  .object({
    minor: z.number().int(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    scale: z.number().int().min(0).max(4),
  })
  .refine((money) => isIso4217Money(money.currency, money.scale), {
    message: "Currency scale does not match ISO 4217 metadata.",
  });

export const ledgerParticipantSchema = z.object({
  memberId: uuidSchema,
  displayNameSnapshot: z.string(),
  householdIdSnapshot: uuidSchema.nullable(),
});

export const ledgerSplitSchema = z.object({
  memberId: uuidSchema,
  method: z.enum([
    "EQUAL_PERSON",
    "EQUAL_HOUSEHOLD",
    "HOUSEHOLD_SHARES",
    "EXACT",
    "PERCENTAGE",
  ]),
  originalMinor: z.number().int(),
  settlementMinor: z.number().int().nullable(),
  weightUnits: z.number().int().nullable(),
  percentageUnits: z.number().int().nullable(),
  roundingAdjustmentMinor: z.number().int(),
});

export const ledgerEditableValuationSchema = z
  .object({
    policy: z.enum([
      "REFERENCE_RATE",
      "ACTUAL_PAYER_COST",
      "MANUAL_AGREED",
      "SAME_CURRENCY",
      "LEGACY_IMPORTED",
    ]),
    original: ledgerMoneySchema,
    settlement: ledgerMoneySchema,
    rateSnapshotId: uuidSchema.nullable(),
    paymentRecordId: uuidSchema.nullable(),
    reason: z.string().nullable(),
    decimalRate: z.string().nullable().optional(),
    roundingMode: z.literal("HALF_UP").optional(),
    effectiveAt: z.string().optional(),
    supersedesValuationId: uuidSchema.nullable().optional(),
    referenceEvidence: z
      .object({
        economicDate: economicDateSchema,
        referenceDate: economicDateSchema,
        source: z.string(),
        sourceReference: z.url(),
        deliveryProvider: z.string(),
        providerReference: z.url(),
        observedAt: z.string(),
        acceptedAt: z.string(),
        automatic: z.boolean(),
      })
      .nullable()
      .optional(),
  })
  .nullable();

export const ledgerStage4EditableExpenseSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  occurredAt: z.string(),
  economicDate: economicDateSchema.nullable().optional(),
  payerMemberId: uuidSchema,
  original: ledgerMoneySchema,
  businessStatus: z.enum(["DRAFT", "ACCEPTED", "RATE_REQUIRED"]),
  settlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
  participants: z.array(ledgerParticipantSchema),
  splits: z.array(ledgerSplitSchema),
  valuation: ledgerEditableValuationSchema,
});

export const ledgerCapabilitySchema = z.object({
  canRead: z.boolean(),
  canCreateExpense: z.boolean(),
  canEditOwnExpense: z.boolean(),
  canCorrectAnyExpense: z.boolean(),
  canSuggestCorrection: z.boolean(),
  canResolveOwnExpenseConflict: z.boolean(),
  canAddOwnPaymentEvidence: z.boolean().default(false),
  canManageExpenseValuation: z.boolean().default(false),
  canManageLedgerValuationPolicy: z.boolean().default(false),
  canPrepareSettlement: z.boolean().optional(),
  canFinalizeSettlement: z.boolean().optional(),
});

export const ledgerRateQuoteSchema = z.object({
  id: uuidSchema,
  journeyId: uuidSchema,
  quoteCurrency: z.string(),
  baseCurrency: z.string(),
  decimalRate: z.string(),
  effectiveDate: z.string(),
  economicDate: economicDateSchema.nullable().optional(),
  referenceDate: economicDateSchema.nullable().optional(),
  policyVersion: z.string().nullable().optional(),
  observedAt: z.string(),
  provider: z.string(),
  providerReference: z.string().nullable(),
  sourceReference: z.string().nullable().optional(),
  expiresAt: z.string(),
});

export const ledgerAuditEventSchema = z.object({
  id: uuidSchema,
  expenseId: uuidSchema,
  actorUserId: uuidSchema.nullable(),
  actorMemberId: uuidSchema.nullable(),
  eventType: z.string(),
  reason: z.string().nullable(),
  changedGroups: z.array(z.string()),
  revision: z.number().int().positive(),
  createdAt: z.string(),
});

export const ledgerPaymentRecordSchema = z.object({
  id: uuidSchema,
  expenseId: uuidSchema.optional(),
  expenseRevision: z.number().int().positive().optional(),
  payerMemberId: uuidSchema.optional(),
  instrumentLabel: z.string().nullable(),
  authorization: ledgerMoneySchema.nullable(),
  posted: ledgerMoneySchema.nullable(),
  authorizedAt: z.string().nullable().optional(),
  postedAt: z.string().nullable(),
  fee: ledgerMoneySchema.nullable(),
  bankFxRate: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  supersedesPaymentRecordId: uuidSchema.nullable(),
  auditEvent: ledgerAuditEventSchema.optional(),
});

export const ledgerMemberSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  role: z.string().nullable(),
  status: z.string().nullable(),
  capabilities: ledgerCapabilitySchema,
  updatedAt: z.string(),
});

export const ledgerHouseholdSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  displayOrder: z.number().int(),
  updatedAt: z.string(),
  memberIds: z.array(uuidSchema),
});

export const ledgerExpenseSchema = z.object({
  id: uuidSchema,
  journeyId: uuidSchema,
  creatorMemberId: uuidSchema.nullable(),
  payerMemberId: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  occurredAt: z.string(),
  economicDate: economicDateSchema.nullable().optional(),
  original: ledgerMoneySchema,
  businessStatus: z.enum(["DRAFT", "ACCEPTED", "RATE_REQUIRED", "DELETED"]),
  settlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]).default("INCLUDED"),
  revision: z.number().int().positive(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  participants: z.array(ledgerParticipantSchema),
  splits: z.array(ledgerSplitSchema),
  valuation: ledgerEditableValuationSchema.and(z.object({ id: uuidSchema })).nullable(),
  paymentRecords: z.array(ledgerPaymentRecordSchema),
  auditEvents: z.array(ledgerAuditEventSchema),
});

export const ledgerCorrectionRequestSchema = z.object({
  id: uuidSchema,
  journeyId: uuidSchema,
  expenseId: uuidSchema,
  baseExpenseRevision: z.number().int().positive(),
  proposedExpense: ledgerStage4EditableExpenseSchema,
  reason: z.string().trim().min(1).max(2000),
  status: z.enum(["OPEN", "ACCEPTED", "REJECTED", "WITHDRAWN", "STALE"]),
  requestedByUserId: uuidSchema,
  requestedByMemberId: uuidSchema,
  resolvedByUserId: uuidSchema.nullable(),
  resolvedByMemberId: uuidSchema.nullable(),
  resolutionReason: z.string().nullable(),
  resultingExpenseRevision: z.number().int().positive().nullable(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const ledgerBootstrapResponseSchema = z.object({
  reviewProtocol: z.literal(2).optional(),
  journey: z.object({
    id: uuidSchema,
    title: z.string(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    settlementCurrency: z.string().regex(/^[A-Z]{3}$/),
    settlementScale: z.number().int().min(0).max(4),
    valuationPolicy: z.string(),
    updatedAt: z.string(),
  }),
  members: z.array(ledgerMemberSchema),
  households: z.array(ledgerHouseholdSchema),
  expenses: z.array(ledgerExpenseSchema),
  corrections: z.array(ledgerCorrectionRequestSchema),
  rateQuotes: z.array(ledgerRateQuoteSchema).default([]),
  receipts: z.array(receiptSchema).optional(),
  settlements: z.array(finalizedSettlementSchema).optional(),
  personalPayments: z.array(personalSettlementPaymentSchema).optional(),
  personalPaymentFxProjections: z
    .array(personalSettlementPaymentFxProjectionSchema)
    .optional(),
  reviewFindings: z.array(ledgerReviewFindingSchema).optional(),
  reviewActions: z.array(ledgerReviewActionSchema).optional(),
  actor: z.object({
    userId: uuidSchema.optional(),
    memberId: uuidSchema.nullable(),
    role: z.string().nullable(),
    capabilities: ledgerCapabilitySchema,
  }),
  cursor: z.string().nullable(),
  serverTime: z.string(),
});

export const ledgerChangesResponseSchema = z.object({
  reviewProtocol: z.literal(2).optional(),
  reviewFindings: z.array(ledgerReviewFindingSchema).optional(),
  reviewActions: z.array(ledgerReviewActionSchema).optional(),
  changes: z.array(
    z.object({
      entityType: z.enum([
        "EXPENSE",
        "HOUSEHOLD",
        "CORRECTION",
        "RATE_QUOTE",
        "PAYMENT_RECORD",
        "RECEIPT",
        "SETTLEMENT",
        "PERSONAL_SETTLEMENT_PAYMENT",
        "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION",
        "REVIEW_FINDING",
      ]),
      entityId: uuidSchema,
      revision: z.number().int().positive(),
      isTombstone: z.boolean(),
      aggregate: z
        .union([
          ledgerExpenseSchema,
          ledgerHouseholdSchema,
          ledgerCorrectionRequestSchema,
          ledgerRateQuoteSchema,
          ledgerPaymentRecordSchema,
          receiptSchema,
          finalizedSettlementSchema,
          personalSettlementPaymentSchema,
          personalSettlementPaymentFxProjectionSchema,
          ledgerReviewFindingSchema,
        ])
        .nullable(),
    }),
  ),
  cursor: z.string().nullable(),
  hasMore: z.boolean().optional(),
  serverTime: z.string(),
});

export const myLedgerPeriodSchema = z.enum(["30D", "YEAR", "ALL"]);

export const myLedgerResponseSchema = z.object({
  period: myLedgerPeriodSchema,
  from: z.string().nullable(),
  to: z.string().nullable(),
  journeys: z.array(
    z.object({
      journeyId: uuidSchema,
      title: z.string(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      scale: z.number().int().min(0).max(4),
      mySpendMinor: z.number().int(),
      paidMinor: z.number().int(),
      positionMinor: z.number().int(),
      unvaluedCount: z.number().int().nonnegative(),
      conflictCount: z.number().int().nonnegative(),
      updatedAt: z.string(),
    }),
  ),
  serverTime: z.string(),
});

export const ledgerReportAggregateSchema = z.object({
  totalMinor: z.number().int(),
  expenseCount: z.number().int().nonnegative(),
  includedExpenseIds: z.array(uuidSchema),
  unresolvedRateCount: z.number().int().nonnegative(),
  openConflictCount: z.number().int().nonnegative(),
});

export const ledgerAnalysisResponseSchema = z.object({
  scope: z.enum(["MINE", "GROUP"]),
  dimension: z.enum(["CATEGORY", "DAY", "PAYER", "PARTICIPANT", "CURRENCY"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  summary: ledgerReportAggregateSchema,
  buckets: z.array(
    ledgerReportAggregateSchema.extend({ key: z.string(), label: z.string() }),
  ),
});

export const ledgerExpenseListResponseSchema = z.object({
  expenses: z.array(ledgerExpenseSchema),
  nextCursor: z.string().nullable(),
});

export type LedgerBootstrapResponse = z.infer<typeof ledgerBootstrapResponseSchema>;
export type LedgerChangesResponse = z.infer<typeof ledgerChangesResponseSchema>;
export type LedgerExpenseDto = z.infer<typeof ledgerExpenseSchema>;
export type LedgerCorrectionRequest = z.infer<typeof ledgerCorrectionRequestSchema>;
export type LedgerRateQuoteDto = z.infer<typeof ledgerRateQuoteSchema>;
export type LedgerPaymentRecordDto = z.infer<typeof ledgerPaymentRecordSchema>;
export type MyLedgerResponse = z.infer<typeof myLedgerResponseSchema>;
export type MyLedgerPeriod = z.infer<typeof myLedgerPeriodSchema>;
export type LedgerAnalysisResponse = z.infer<typeof ledgerAnalysisResponseSchema>;
export type LedgerExpenseListResponse = z.infer<typeof ledgerExpenseListResponseSchema>;
