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

export const completeEconomicDateRequestSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("USER_CONFIRMED_V1"),
    baseRevision: z.number().int().positive(),
    economicDate: economicDateSchema,
  }),
  z.strictObject({
    source: z.literal("STAGE9_DATE_ONLY_V1"),
    baseRevision: z.number().int().positive(),
  }),
]);
export type CompleteEconomicDateRequest = z.infer<
  typeof completeEconomicDateRequestSchema
>;
export const economicDateEvidenceResponseSchema = z.discriminatedUnion("disposition", [
  z.object({
    disposition: z.literal("AUTO_SAFE"),
    economicDate: economicDateSchema,
    source: z.literal("STAGE9_DATE_ONLY_V1"),
    expenseRevision: z.number().int().positive(),
  }),
  z.object({
    disposition: z.literal("USER_ACTION_REQUIRED"),
    economicDate: z.null(),
    source: z.null(),
    expenseRevision: z.number().int().positive(),
  }),
]);
export type EconomicDateEvidenceResponse = z.infer<
  typeof economicDateEvidenceResponseSchema
>;

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

export const ledgerExpenseMutationResponseSchema = z
  .object({
    receipt: z.lazy(() => expenseOperationReceiptSchema).optional(),
    entity: ledgerExpenseSchema,
    serverId: z.uuid(),
    revision: z.number().int().positive(),
    updatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    idempotentReplay: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.receipt &&
      (value.receipt.expenseId !== value.entity.id ||
        value.receipt.canonicalRevision !== value.revision ||
        value.entity.revision !== value.revision)
    )
      context.addIssue({
        code: "custom",
        message: "Receipt must match canonical Expense and revision.",
      });
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
    economicDate: economicDateSchema.nullable().optional(),
    settingsRevision: z.number().int().positive().optional(),
    rateQuoteId: z.uuid().nullable(),
    paymentRecordId: z.uuid().nullable(),
    manualRate: z.string().trim().max(100).nullable(),
    reason: z.string().trim().max(2000).nullable(),
    previewSettlement: moneySchema,
  })
  .superRefine((value, context) => {
    if (value.policy === "REFERENCE_RATE" && (!value.rateQuoteId || !value.economicDate))
      context.addIssue({
        code: "custom",
        message: "REFERENCE_RATE needs a quote and economic date.",
      });
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

// Additive v2 contracts. Legacy routes remain strict aggregate CAS until Phase 3.
const nonemptyPatchGroup = <T extends z.ZodRawShape>(shape: T) =>
  z
    .strictObject(shape)
    .refine((value) => Object.values(value).some((v) => v !== undefined), {
      message: "Patch group must contain a requested field.",
    });
export const expenseUserPatchSchema = z.strictObject({
  descriptive: nonemptyPatchGroup({
    title: expenseFields.title.optional(),
    description: expenseFields.description.optional(),
    category: expenseFields.category.optional(),
    occurredAt: expenseFields.occurredAt.optional(),
  }).optional(),
  financial: nonemptyPatchGroup({
    original: moneySchema.optional(),
    economicDate: economicDateSchema.nullable().optional(),
    payerMemberId: z.uuid().optional(),
    settlementParticipation: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
  }).optional(),
  participantSplit: nonemptyPatchGroup({
    participants: z.array(participantSchema).min(1).max(200).optional(),
    splits: z
      .array(
        splitSchema
          .omit({ settlementMinor: true, roundingAdjustmentMinor: true })
          .strict(),
      )
      .min(1)
      .max(200)
      .optional(),
  }).optional(),
});
const { baseRevision: _valuationBaseRevision, ...valuationIntentFields } =
  applyLedgerValuationRequestSchema.shape;
const valuationIntentSchema = z
  .strictObject({
    ...valuationIntentFields,
    rateAcceptance: z
      .strictObject({
        revision: z.number().int().positive(),
        serverRevision: z.number().int().nonnegative(),
        original: moneySchema,
        economicDate: economicDateSchema,
        settlement: moneySchema,
        decimalRate: z.string().regex(/^(?=.*[1-9])\d+(?:\.\d+)?$/),
        referenceDate: economicDateSchema,
      })
      .optional(),
  })
  .superRefine((value, context) => {
    const parsed = applyLedgerValuationRequestSchema.safeParse({
      ...value,
      baseRevision: 1,
    });
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  });
export const expenseTypedIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("CREATE"),
    expense: ledgerStage4EditableExpenseSchema,
  }),
  z.strictObject({ type: z.literal("UPDATE"), patch: expenseUserPatchSchema }),
  z.strictObject({
    type: z.literal("APPLY_VALUATION"),
    valuation: valuationIntentSchema,
  }),
  z.strictObject({ type: z.literal("DELETE") }),
  z.strictObject({
    type: z.literal("RESTORE"),
    businessStatus: expenseFields.businessStatus,
  }),
]);
export const expenseCommandTypeSchema = z.enum([
  "CREATE",
  "UPDATE",
  "APPLY_VALUATION",
  "DELETE",
  "RESTORE",
]);
export const expenseOperationReceiptSchema = z.strictObject({
  operationId: localIdSchema,
  commandId: localIdSchema,
  idempotencyKey: localIdSchema,
  expenseId: z.uuid(),
  commandType: expenseCommandTypeSchema,
  intentSequence: z.number().int().positive(),
  disposition: z.enum(["APPLIED", "KEPT_SERVER", "SUPERSEDED"]),
  canonicalRevision: z.number().int().positive(),
});
export const expenseIntentEnvelopeSchema = z
  .strictObject({
    commandId: localIdSchema,
    intentVersion: z.literal(2),
    intentSequence: z.number().int().positive(),
    predecessorOperationId: localIdSchema.nullable(),
    observedServerRevision: z.number().int().nonnegative(),
    observedBase: ledgerExpenseSchema.nullable(),
    patchOrIntent: expenseTypedIntentSchema,
    causalBaseReceipt: expenseOperationReceiptSchema.nullable(),
    boundExecutionRevision: z.number().int().nonnegative().nullable(),
    idempotencyKey: localIdSchema,
  })
  .superRefine((value, context) => {
    if (
      value.observedBase &&
      value.observedBase.revision !== value.observedServerRevision
    )
      context.addIssue({
        code: "custom",
        message: "Observed revision must match canonical base.",
      });
  });
const operationResultFields = {
  expenseId: localIdSchema,
  commandType: expenseCommandTypeSchema,
  disposition: z.enum(["APPLIED", "KEPT_SERVER", "SUPERSEDED"]).nullable(),
  error: z
    .strictObject({ code: z.string().min(1).max(100), message: z.string().max(300) })
    .optional(),
  blockingOperationId: localIdSchema.optional(),
};
export const expenseOperationResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...operationResultFields,
    state: z.literal("LOCAL_SAVED"),
    operationId: z.null(),
    intentSequence: z.null(),
    changed: z.literal(false),
    disposition: z.null(),
  }),
  z.strictObject({
    ...operationResultFields,
    state: z.enum([
      "PENDING_SYNC",
      "CONFLICT_REQUIRES_ACTION",
      "RETRYABLE_FAILURE",
      "TERMINAL_FAILURE",
    ]),
    operationId: localIdSchema,
    intentSequence: z.number().int().positive(),
    changed: z.literal(true),
    disposition: z.null(),
  }),
  z.strictObject({
    ...operationResultFields,
    state: z.literal("SERVER_CONFIRMED"),
    operationId: localIdSchema,
    intentSequence: z.number().int().positive(),
    changed: z.literal(true),
    disposition: expenseOperationReceiptSchema.shape.disposition,
    confirmedServerRevision: z.number().int().positive(),
  }),
]);
export const expenseConflictChainResolutionRequestSchema = z
  .strictObject({
    contractVersion: z.literal(2),
    commandId: localIdSchema,
    intentType: expenseCommandTypeSchema,
    submittedIntent: expenseTypedIntentSchema,
    observedBaseRevision: z.number().int().nonnegative(),
    currentServerRevision: z.number().int().positive(),
    coveredConflictIds: z
      .array(z.uuid())
      .min(1)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
    expectedChainDigest: z.string().regex(/^[a-f0-9]{64}$/),
    choice: z.enum([
      "KEEP_SERVER",
      "APPLY_PATCH",
      "APPLY_VALUATION",
      "CONFIRM_DELETE",
      "CONFIRM_RESTORE",
      "ACCEPT_EQUIVALENT",
    ]),
    reason: z.string().trim().min(1).max(2000),
  })
  .superRefine((value, context) => {
    const expected = {
      APPLY_PATCH: "UPDATE",
      APPLY_VALUATION: "APPLY_VALUATION",
      CONFIRM_DELETE: "DELETE",
      CONFIRM_RESTORE: "RESTORE",
      ACCEPT_EQUIVALENT: "UPDATE",
    };
    if (
      value.intentType !== value.submittedIntent.type ||
      (value.choice !== "KEEP_SERVER" && expected[value.choice] !== value.intentType)
    )
      context.addIssue({
        code: "custom",
        message: "Resolution must preserve typed command semantics.",
      });
  });
export const expenseCommandRequestSchema = z.strictObject({
  envelope: expenseIntentEnvelopeSchema,
  auditReason: z.string().trim().min(1).max(2000).nullable(),
});
export const expenseTypedConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal("REVISION_CONFLICT"),
    conflictId: z.uuid(),
    expenseId: z.uuid(),
    commandId: localIdSchema,
    commandType: expenseCommandTypeSchema,
    submittedIntent: expenseTypedIntentSchema,
    envelope: expenseIntentEnvelopeSchema,
    baseRevision: z.number().int().nonnegative(),
    currentRevision: z.number().int().positive(),
    current: ledgerExpenseSchema,
    changedGroups: z.array(ledgerConflictFieldGroupSchema),
  }),
});
export type ExpenseTypedConflictResponse = z.infer<
  typeof expenseTypedConflictResponseSchema
>;
export type ExpenseCommandRequest = z.infer<typeof expenseCommandRequestSchema>;
export const expenseConflictChainResolutionResponseSchema = z
  .strictObject({
    resolutionReceipt: expenseOperationReceiptSchema,
    canonical: ledgerExpenseSchema,
    openConflictIds: z.array(z.uuid()),
    conflictOutcomes: z.array(
      z.strictObject({
        conflictId: z.uuid(),
        lifecycle: z.enum(["OPEN", "RESOLVED", "SUPERSEDED"]),
        reason: z.string().min(1).max(2000),
        supersededByCommandId: localIdSchema.nullable(),
        operationReceipt: expenseOperationReceiptSchema.nullable().optional(),
      }),
    ),
  })
  .superRefine((value, context) => {
    if (
      value.resolutionReceipt.expenseId !== value.canonical.id ||
      value.resolutionReceipt.canonicalRevision !== value.canonical.revision
    )
      context.addIssue({
        code: "custom",
        message: "Resolution receipt must match canonical Expense.",
      });
    const open = value.conflictOutcomes
      .filter((outcome) => outcome.lifecycle === "OPEN")
      .map((outcome) => outcome.conflictId);
    if (
      new Set(value.conflictOutcomes.map((outcome) => outcome.conflictId)).size !==
        value.conflictOutcomes.length ||
      new Set(value.openConflictIds).size !== value.openConflictIds.length ||
      open.length !== value.openConflictIds.length ||
      open.some((id) => !value.openConflictIds.includes(id))
    )
      context.addIssue({
        code: "custom",
        message: "Open IDs must match the immutable conflict outcomes.",
      });
  });
export type ExpenseOperationResult = z.infer<typeof expenseOperationResultSchema>;
export type ExpenseOperationReceipt = z.infer<typeof expenseOperationReceiptSchema>;
export type ExpenseIntentEnvelope = z.infer<typeof expenseIntentEnvelopeSchema>;
export type ExpenseConflictChainResolutionRequest = z.infer<
  typeof expenseConflictChainResolutionRequestSchema
>;

export const expenseConflictChainResponseSchema = z.strictObject({
  contractVersion: z.literal(2),
  canonical: ledgerExpenseSchema,
  chainDigest: z.string().regex(/^[a-f0-9]{64}$/),
  conflicts: z.array(
    z.strictObject({
      conflictId: z.uuid(),
      commandId: localIdSchema,
      idempotencyKey: localIdSchema,
      commandType: expenseCommandTypeSchema,
      submittedIntent: expenseTypedIntentSchema.nullable(),
      operationReceipt: expenseOperationReceiptSchema.nullable().optional(),
      observedBaseRevision: z.number().int().nonnegative(),
      currentServerRevision: z.number().int().positive(),
      changedGroups: z.array(ledgerConflictFieldGroupSchema),
      lifecycle: z.enum(["OPEN", "RESOLVED", "SUPERSEDED"]),
      reason: z.string().nullable(),
    }),
  ),
});

export type ExpenseConflictChainResponse = z.infer<
  typeof expenseConflictChainResponseSchema
>;
export type ExpenseConflictChainResolutionResponse = z.infer<
  typeof expenseConflictChainResolutionResponseSchema
>;
