import { z } from "zod";

export const journeyCurrencyPreviewRequestSchema = z.object({
  proposedCurrency: z.string().regex(/^[A-Z]{3}$/),
});

export const journeyCurrencyCommitRequestSchema =
  journeyCurrencyPreviewRequestSchema.extend({
    baseSettingsRevision: z.number().int().positive(),
    previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  });

export const journeyCurrencyPreviewSchema = z.object({
  currentCurrency: z.string(),
  currentScale: z.number().int(),
  proposedCurrency: z.string(),
  proposedScale: z.number().int(),
  settingsRevision: z.number().int().positive(),
  previewDigest: z.string(),
  affectedExpenses: z.number().int().nonnegative(),
  sameCurrencyCount: z.number().int().nonnegative(),
  referenceCandidateCount: z.number().int().nonnegative(),
  missingEconomicDateCount: z.number().int().nonnegative(),
  missingHistoricalQuoteCount: z.number().int().nonnegative(),
  manualAgreedCount: z.number().int().nonnegative(),
  actualPayerCostCount: z.number().int().nonnegative(),
  otherPolicyCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  expectedUnresolvedCount: z.number().int().nonnegative(),
  openSettlementCount: z.number().int().nonnegative(),
  finalizedSettlementCount: z.number().int().nonnegative(),
  totalsAvailable: z.boolean(),
  requiresAbandonPreview: z.boolean(),
});

export const journeyCurrencyCommitSchema = z.object({
  changeId: z.uuid(),
  settlementCurrency: z.string(),
  settlementScale: z.number().int(),
  settingsRevision: z.number().int().positive(),
  affectedExpenses: z.number().int().nonnegative(),
  unresolvedExpenses: z.number().int().nonnegative(),
  idempotentReplay: z.boolean(),
});

export type JourneyCurrencyPreview = z.infer<typeof journeyCurrencyPreviewSchema>;
export type JourneyCurrencyCommit = z.infer<typeof journeyCurrencyCommitSchema>;
