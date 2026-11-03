import { z } from "zod";
import { mapDeepSeekFlightUsage } from "../deepSeekFlight";
import { calculateScheduledCost } from "../externalIntegrationPersistence";
import { observationSchema } from "./contracts";
import type { Step } from "./ports";

const rate = z.string().regex(/^\d{1,60}(?:\.\d{1,18})?$/);
export const enrichmentPriceSchema = z.strictObject({
  searchNanosPerRequest: rate,
  inputNanosPerMillion: rate,
  cachedInputNanosPerMillion: rate,
  outputNanosPerMillion: rate,
  acceptedReturnedModels: z.array(z.string().min(1).max(128)).min(1).max(8),
});
// Rates must come from the protected admitted schedule; neither a client price nor a promotion guess.
export function measureFlightEnrichmentResponse(
  kind: Step,
  bytes: Uint8Array,
  httpStatus: number,
  admittedPrices: z.input<typeof enrichmentPriceSchema>,
) {
  const price = enrichmentPriceSchema.parse(admittedPrices);
  if (bytes.byteLength > 131072) throw Error("ENRICHMENT_RESPONSE_BOUND");
  let raw: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
  } catch {
    /* Malformed material still may have incurred a charge. */
  }
  const modelId =
    kind === "SEARCH"
      ? null
      : typeof raw?.model === "string" && raw.model.length <= 128
        ? raw.model
        : null;
  const reportedId = raw?.id ?? raw?.request_id;
  const providerRequestId =
    typeof reportedId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(reportedId)
      ? reportedId
      : null;
  if (kind === "SEARCH") {
    const results =
      raw?.results ??
      (raw?.data && typeof raw.data === "object"
        ? (raw.data as Record<string, unknown>).results
        : undefined);
    const measured = httpStatus !== 200 || Array.isArray(results);
    const billed = httpStatus === 200 && Array.isArray(results) && results.length > 0;
    return {
      modelAccepted: true,
      observation: observationSchema.parse({
        providerId: "deepseek",
        modelId,
        providerRequestId,
        input_tokens: 0,
        output_tokens: 0,
        cached_input_tokens: 0,
        total_tokens: 0,
        usage_quality: "ACTUAL_REPORTED",
        execution: "COMPLETED",
        cost_nanos: measured
          ? billed
            ? calculateScheduledCost([
                {
                  quantity: 1n,
                  quantityPerRate: 1n,
                  rate: price.searchNanosPerRequest,
                  relationship: "DISJOINT",
                  billable: true,
                },
              ])
            : "0"
          : null,
        cost_quality: measured ? (billed ? "ESTIMATED" : "ACTUAL") : "UNKNOWN",
        billing_status: measured ? (billed ? "UNRECONCILED" : "NOT_BILLED") : "UNKNOWN",
      }),
    };
  }
  const usage = mapDeepSeekFlightUsage(raw?.usage);
  const modelAccepted =
    modelId !== null && price.acceptedReturnedModels.includes(modelId);
  const cost =
    modelAccepted &&
    usage.usage_quality === "ACTUAL_REPORTED" &&
    usage.input_tokens !== null &&
    usage.cached_input_tokens !== null &&
    usage.output_tokens !== null
      ? calculateScheduledCost([
          {
            quantity: BigInt(usage.input_tokens - usage.cached_input_tokens),
            quantityPerRate: 1000000n,
            rate: price.inputNanosPerMillion,
            relationship: "DISJOINT",
            billable: true,
          },
          {
            quantity: BigInt(usage.cached_input_tokens),
            quantityPerRate: 1000000n,
            rate: price.cachedInputNanosPerMillion,
            relationship: "DISJOINT",
            billable: true,
          },
          {
            quantity: BigInt(usage.output_tokens),
            quantityPerRate: 1000000n,
            rate: price.outputNanosPerMillion,
            relationship: "DISJOINT",
            billable: true,
          },
        ])
      : null;
  return {
    modelAccepted,
    observation: observationSchema.parse({
      providerId: "deepseek",
      modelId,
      providerRequestId,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cached_input_tokens: usage.cached_input_tokens,
      total_tokens: usage.total_tokens,
      usage_quality: usage.usage_quality,
      execution: "COMPLETED",
      cost_nanos: cost,
      cost_quality: cost === null ? "UNKNOWN" : "ESTIMATED",
      billing_status: "UNRECONCILED",
    }),
  };
}
