import { z } from "zod";

const uuid = z.uuid();

export const ledgerReviewFindingSchema = z.object({
  id: uuid,
  journeyId: uuid,
  expenseId: uuid.nullable(),
  settlementId: uuid.nullable(),
  layer: z.enum(["DETERMINISTIC", "HEURISTIC"]),
  findingType: z.string(),
  severity: z.enum(["INFO", "WARNING", "BLOCKING"]),
  confidence: z.number().min(0).max(1).nullable(),
  evidenceCodes: z.array(z.string()),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "DISMISSED", "RESOLVED", "STALE"]),
  rulesetVersion: z.string(),
  entityRevision: z.number().int().positive().nullable(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ruleId: z.string().nullable().optional(),
  ruleVersion: z.number().int().positive().nullable().optional(),
  ruleCategory: z.string().nullable().optional(),
  ruleInputFingerprint: z.string().nullable().optional(),
  comparisonFingerprint: z.string().nullable().optional(),
  observationContext: z.record(z.string(), z.unknown()).nullable().optional(),
  lifecycle: z
    .enum(["ACTIVE", "RESOLVED_BY_EXPENSE_UPDATE", "SUPERSEDED"])
    .nullable()
    .optional(),
  observationGeneration: z.number().int().positive().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolutionReason: z.string().nullable().optional(),
  supersededAt: z.string().nullable().optional(),
  supersededByFindingId: uuid.nullable().optional(),
  personalDecision: z.enum(["NEEDS_REVIEW", "ACKNOWLEDGED", "DISMISSED"]).optional(),
  decisionRevision: z.number().int().nonnegative().optional(),
  lastActionId: uuid.nullable().optional(),
  decisionActedAt: z.string().nullable().optional(),
});

export const ledgerReviewActionSchema = z.object({
  id: uuid,
  findingId: uuid,
  action: z.enum(["ACKNOWLEDGED", "DISMISSED"]),
  actorUserId: uuid,
  actorMemberId: uuid,
  actorRole: z.string(),
  reason: z.string().trim().max(2000).nullable(),
  findingRevision: z.number().int().positive(),
  entityRevision: z.number().int().positive().nullable(),
  rulesetVersion: z.string(),
  operationId: z.string().min(1).max(200),
  createdAt: z.string(),
});

export const ledgerReviewResponseSchema = z.object({
  reviewProtocol: z.literal(2).optional(),
  findings: z.array(ledgerReviewFindingSchema),
  actions: z.array(ledgerReviewActionSchema),
});

export const ledgerReviewActionRequestSchema = z.object({
  action: z.enum(["ACKNOWLEDGED", "DISMISSED"]),
  baseRevision: z.number().int().positive(),
  reason: z.string().trim().max(2000).nullable().optional(),
  decisionRevision: z.number().int().nonnegative().default(0),
  operationId: z.string().min(1).max(200),
});

export type LedgerReviewFindingDto = z.infer<typeof ledgerReviewFindingSchema>;
export type LedgerReviewActionDto = z.infer<typeof ledgerReviewActionSchema>;
export type LedgerReviewActionRequest = z.infer<typeof ledgerReviewActionRequestSchema>;
