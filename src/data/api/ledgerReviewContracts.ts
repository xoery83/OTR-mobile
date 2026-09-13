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
});

export const ledgerReviewActionSchema = z.object({
  id: uuid,
  findingId: uuid,
  action: z.enum(["ACKNOWLEDGED", "DISMISSED"]),
  actorUserId: uuid,
  actorMemberId: uuid,
  actorRole: z.string(),
  reason: z.string().trim().min(1).max(2000),
  findingRevision: z.number().int().positive(),
  entityRevision: z.number().int().positive().nullable(),
  rulesetVersion: z.string(),
  operationId: z.string().min(1).max(200),
  createdAt: z.string(),
});

export const ledgerReviewResponseSchema = z.object({
  findings: z.array(ledgerReviewFindingSchema),
  actions: z.array(ledgerReviewActionSchema),
});

export const ledgerReviewActionRequestSchema = z.object({
  action: z.enum(["ACKNOWLEDGED", "DISMISSED"]),
  baseRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
  operationId: z.string().min(1).max(200),
});

export type LedgerReviewFindingDto = z.infer<typeof ledgerReviewFindingSchema>;
export type LedgerReviewActionDto = z.infer<typeof ledgerReviewActionSchema>;
export type LedgerReviewActionRequest = z.infer<typeof ledgerReviewActionRequestSchema>;
