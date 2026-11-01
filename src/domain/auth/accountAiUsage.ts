import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  nanos,
  usageSummarySchema,
  type UsageSummary,
} from "@/domain/intelligence/flightEnrichmentContracts";
const count = z.number().int().nonnegative().safe().nullable();
export const accountAiUsageRecordSchema = z.strictObject({
  receiptId: z.string().min(1).max(128),
  feature: z.enum(["UNIVERSAL_IMPORT", "FLIGHT_ENRICHMENT", "POI_ENRICHMENT"]),
  inputTokens: count,
  outputTokens: count,
  cachedInputTokens: count,
  searchCalls: count,
  fetchCalls: count,
  providerCostNanos: nanos.nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  costQuality: usageSummarySchema.shape.costQuality,
  metering: usageSummarySchema.shape.metering,
  billingStatus: usageSummarySchema.shape.billingStatus,
  priceScheduleId: z.string().min(1).max(128).nullable(),
  cacheHit: z.boolean(),
});
export const accountAiUsageSnapshotSchema = z
  .strictObject({
    version: z.literal(1),
    accountId: coreUuid,
    evidence: z.enum(["SERVER", "SYNTHETIC"]),
    records: z.array(accountAiUsageRecordSchema).max(100),
  })
  .superRefine((value, ctx) => {
    const ids = value.records.map((record) => record.receiptId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom" });
  });
export type AccountAiUsageSnapshot = z.infer<typeof accountAiUsageSnapshotSchema>;
export type AccountAiUsageRecord = z.infer<typeof accountAiUsageRecordSchema>;
export const unconfiguredAiAllowance = Object.freeze({
  status: "UNCONFIGURED" as const,
  used: null,
  reserved: null,
  remaining: null,
  cycle: null,
  enforcementEnabled: false as const,
});
// Projection of an existing receipt, never a token ledger or user-credit conversion.
export function flightUsageForAccountView(input: UsageSummary): AccountAiUsageRecord {
  const usage = usageSummarySchema.parse(input);
  if (!usage.receiptId) throw Error("AI_USAGE_RECEIPT_REQUIRED");
  return accountAiUsageRecordSchema.parse({
    receiptId: usage.receiptId,
    feature: "FLIGHT_ENRICHMENT",
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.cached_input_tokens,
    searchCalls: usage.searchCalls,
    fetchCalls: null,
    providerCostNanos: usage.providerCostNanos,
    currency: usage.currency,
    costQuality: usage.costQuality,
    metering: usage.metering,
    billingStatus: usage.billingStatus,
    priceScheduleId: null,
    cacheHit: usage.cacheHit,
  });
}
export function providerCostLabel(record: AccountAiUsageRecord): string | null {
  if (
    record.providerCostNanos === null ||
    !record.currency ||
    record.costQuality === "UNKNOWN"
  )
    return null;
  const n = BigInt(record.providerCostNanos);
  const fraction = (n % 1000000000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${record.currency} ${n / 1000000000n}${fraction ? `.${fraction}` : ""}`;
}
