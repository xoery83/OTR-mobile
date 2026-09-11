import { z } from "zod";

import {
  ledgerCorrectionRequestSchema,
  ledgerExpenseSchema,
  ledgerStage4EditableExpenseSchema,
} from "./ledgerReadContracts";

const localIdSchema = z.string().trim().min(1).max(200);
const moneySchema = z.object({
  minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  scale: z.number().int().min(0).max(4),
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

export const createLedgerExpenseRequestSchema = z.object({
  localId: localIdSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable(),
  category: z.string().trim().min(1).max(80),
  occurredAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  payerMemberId: z.uuid(),
  original: moneySchema,
  businessStatus: z.enum(["DRAFT", "ACCEPTED", "RATE_REQUIRED"]),
  participants: z.array(participantSchema).min(1).max(200),
  splits: z.array(splitSchema).min(1).max(200),
  valuation: valuationSchema,
});

export const updateLedgerExpenseRequestSchema = createLedgerExpenseRequestSchema
  .omit({ localId: true })
  .extend({
    baseRevision: z.number().int().nonnegative(),
    auditReason: z.string().trim().max(2000).nullable(),
  });

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
