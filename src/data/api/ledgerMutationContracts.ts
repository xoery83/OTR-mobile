import { z } from "zod";

import { isIso4217Money } from "@/domain/ledger/currency";

import {
  economicDateSchema,
  ledgerCorrectionRequestSchema,
  ledgerExpenseSchema,
  ledgerPaymentRecordSchema,
  ledgerStage4EditableExpenseSchema,
} from "./ledgerReadContracts";

const localIdSchema = z.string().trim().min(1).max(200);
const moneySchema = z
  .object({
    minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    scale: z.number().int().min(0).max(4),
  })
  .refine((money) => isIso4217Money(money.currency, money.scale), {
    message: "Currency scale does not match ISO 4217 metadata.",
  });
const participantSchema = z.object({
  memberId: z.uuid(),
  displayNameSnapshot: z.string().trim().min(1).max(200),
  householdIdSnapshot: z.uuid().nullable(),
});
const splitSchema = z.object({
  memberId: z.uuid(),
  method: z.enum([
    "EQUAL_PERSON",
    "EQUAL_HOUSEHOLD",
    "HOUSEHOLD_SHARES",
    "EXACT",
    "PERCENTAGE",
  ]),
  originalMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  settlementMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  weightUnits: z.number().int().positive().nullable(),
  percentageUnits: z.number().int().min(0).max(1_000_000).nullable(),
  roundingAdjustmentMinor: z.number().int().min(-1).max(1),
});
const valuationSchema = z
  .object({
    policy: z.enum([
      "REFERENCE_RATE",
      "ACTUAL_PAYER_COST",
      "MANUAL_AGREED",
      "SAME_CURRENCY",
      "LEGACY_IMPORTED",
    ]),
    original: moneySchema,
    settlement: moneySchema,
    rateSnapshotId: z.uuid().nullable(),
    paymentRecordId: z.uuid().nullable(),
    reason: z.string().trim().max(1000).nullable(),
  })
  .nullable();

const expenseFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable(),
  category: z.string().trim().min(1).max(80),
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  economicDate: economicDateSchema.nullable().optional(),
  payerMemberId: z.uuid(),
  original: moneySchema,
  businessStatus: z.enum(["DRAFT", "ACCEPTED", "RATE_REQUIRED"]),
  settlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
  participants: z.array(participantSchema).min(1).max(200),
  splits: z.array(splitSchema).min(1).max(200),
  valuation: valuationSchema,
};

function validateValuationState(
  value: {
    businessStatus: string;
    valuation: unknown;
    splits: { settlementMinor: number | null }[];
  },
  context: z.RefinementCtx,
) {
  if (value.businessStatus === "ACCEPTED" && !value.valuation)
    context.addIssue({ code: "custom", message: "Accepted Expense needs valuation." });
  if (
    value.businessStatus === "RATE_REQUIRED" &&
    (value.valuation || value.splits.some((split) => split.settlementMinor !== null))
  )
    context.addIssue({
      code: "custom",
      message: "RATE_REQUIRED cannot contain settlement value.",
    });
}

export const createLedgerExpenseRequestSchema = z
  .object({ localId: localIdSchema, ...expenseFields })
  .superRefine(validateValuationState);

export const updateLedgerExpenseRequestSchema = z
  .object({
    ...expenseFields,
    baseRevision: z.number().int().nonnegative(),
    auditReason: z.string().trim().max(2000).nullable(),
  })
  .superRefine(validateValuationState);

export const ledgerConflictFieldGroupSchema = z.enum([
  "FINANCIAL_CORE",
  "DESCRIPTIVE",
  "LINKS",
  "EVIDENCE",
  "LIFECYCLE",
]);

export const ledgerExpenseConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal("REVISION_CONFLICT"),
    conflictId: z.uuid(),
    expenseId: z.uuid(),
    baseRevision: z.number().int().nonnegative(),
    currentRevision: z.number().int().positive(),
    submitted: ledgerStage4EditableExpenseSchema,
    current: ledgerExpenseSchema,
    changedGroups: z.array(ledgerConflictFieldGroupSchema),
    auditSummaries: ledgerExpenseSchema.shape.auditEvents,
    requestId: z.string().optional(),
  }),
});

export const resolveLedgerExpenseConflictRequestSchema = z.object({
  conflictId: z.uuid(),
  currentRevision: z.number().int().positive(),
  resolution: z.enum(["KEEP_MINE", "KEEP_JOURNEY", "EDITED"]),
  resolvedExpense: ledgerStage4EditableExpenseSchema,
  selectedSources: z.record(
    ledgerConflictFieldGroupSchema,
    z.enum(["SUBMITTED", "JOURNEY", "EDITED"]),
  ),
  reason: z.string().trim().min(1).max(2000),
});

export const createLedgerCorrectionRequestSchema = z.object({
  localId: localIdSchema,
  baseRevision: z.number().int().positive(),
  proposedExpense: ledgerStage4EditableExpenseSchema,
  reason: z.string().trim().min(1).max(2000),
});

export const ledgerCorrectionActionRequestSchema = z.object({
  baseRequestRevision: z.number().int().positive(),
  resolutionReason: z.string().trim().max(2000).nullable(),
});

export const ledgerCorrectionMutationResponseSchema = z.object({
  correction: ledgerCorrectionRequestSchema,
  expense: ledgerExpenseSchema.nullable(),
  idempotentReplay: z.boolean(),
});

export const lifecycleLedgerExpenseRequestSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  auditReason: z.string().trim().max(2000).nullable(),
  businessStatus: z.enum(["DRAFT", "ACCEPTED", "RATE_REQUIRED"]).optional(),
});

export const ledgerExpenseMutationResponseSchema = z.object({
  entity: ledgerExpenseSchema,
  serverId: z.uuid(),
  revision: z.number().int().positive(),
  updatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  idempotentReplay: z.boolean(),
});

export const createLedgerPaymentRecordRequestSchema = z
  .object({
    localId: localIdSchema,
    instrumentLabel: z.string().trim().max(200).nullable(),
    authorization: moneySchema.nullable(),
    posted: moneySchema.nullable(),
    authorizedAt: z.string().nullable().default(null),
    postedAt: z.string().nullable(),
    fee: moneySchema.nullable(),
    bankFxRate: z.string().trim().max(100).nullable().default(null),
    source: z.string().trim().max(100).nullable().default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
    supersedesPaymentRecordId: z.uuid().nullable(),
  })
  .refine((value) => value.authorization || value.posted, {
    message: "Payment evidence needs an authorization or posted cost.",
  });

export const ledgerPaymentRecordMutationResponseSchema = z.object({
  entity: ledgerPaymentRecordSchema,
  serverId: z.uuid(),
  revision: z.literal(1),
  updatedAt: z.string(),
  idempotentReplay: z.boolean(),
});

export const applyLedgerValuationRequestSchema = z
  .object({
    localValuationId: localIdSchema,
    localRateSnapshotId: localIdSchema.nullable(),
    baseRevision: z.number().int().positive(),
    policy: z.enum([
      "REFERENCE_RATE",
      "ACTUAL_PAYER_COST",
      "MANUAL_AGREED",
      "SAME_CURRENCY",
    ]),
    rateQuoteId: z.uuid().nullable(),
    paymentRecordId: z.uuid().nullable(),
    manualRate: z.string().trim().max(100).nullable(),
    reason: z.string().trim().max(2000).nullable(),
    previewSettlement: moneySchema,
  })
  .superRefine((value, context) => {
    if (value.policy === "REFERENCE_RATE" && !value.rateQuoteId)
      context.addIssue({ code: "custom", message: "REFERENCE_RATE needs a quote." });
    if (value.policy === "ACTUAL_PAYER_COST" && !value.paymentRecordId)
      context.addIssue({
        code: "custom",
        message: "ACTUAL_PAYER_COST needs payment evidence.",
      });
    if (value.policy === "MANUAL_AGREED" && (!value.manualRate || !value.reason))
      context.addIssue({
        code: "custom",
        message: "Manual valuation needs rate and reason.",
      });
  });

export type CreateLedgerExpenseRequest = z.infer<typeof createLedgerExpenseRequestSchema>;
export type UpdateLedgerExpenseRequest = z.infer<typeof updateLedgerExpenseRequestSchema>;
export type LifecycleLedgerExpenseRequest = z.infer<
  typeof lifecycleLedgerExpenseRequestSchema
>;
export type LedgerExpenseMutationResponse = z.infer<
  typeof ledgerExpenseMutationResponseSchema
>;
export type LedgerExpenseConflictResponse = z.infer<
  typeof ledgerExpenseConflictResponseSchema
>;
export type ResolveLedgerExpenseConflictRequest = z.infer<
  typeof resolveLedgerExpenseConflictRequestSchema
>;
export type CreateLedgerCorrectionRequest = z.infer<
  typeof createLedgerCorrectionRequestSchema
>;
export type LedgerCorrectionActionRequest = z.infer<
  typeof ledgerCorrectionActionRequestSchema
>;
export type LedgerCorrectionMutationResponse = z.infer<
  typeof ledgerCorrectionMutationResponseSchema
>;
export type CreateLedgerPaymentRecordRequest = z.infer<
  typeof createLedgerPaymentRecordRequestSchema
>;
export type ApplyLedgerValuationRequest = z.infer<
  typeof applyLedgerValuationRequestSchema
>;
