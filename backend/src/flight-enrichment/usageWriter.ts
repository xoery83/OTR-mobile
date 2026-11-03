import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  commandDigest,
  persistenceDigest,
  type createClosedPersistenceGateway,
} from "../externalIntegrationPersistence";
import { observationSchema } from "./contracts";
import type { UsagePort } from "./ports";
import { registeredFlightEnrichmentProfile as profile } from "./registeredProfile";

const label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const enrichmentUsageReceiptSchema = z.strictObject({
  accountId: z.uuid(),
  actorId: z.uuid(),
  tripId: z.uuid(),
  requestId: label,
  idempotencyKey: label,
  requestDigest: sha,
  usageReceiptId: label,
  stepReceiptId: label,
  stepId: sha,
  kind: z.enum(["SEARCH", "EXTRACTION"]),
  callId: z.uuid(),
  priceScheduleId: z.uuid(),
  rowRevision: z.number().int().positive().safe(),
  publicationFence: z.number().int().positive().safe(),
  dispatchState: z.enum(["RESERVED", "MAY_HAVE_STARTED", "UNKNOWN", "TERMINAL"]),
  // Frozen in owning custody/receipt before append, so retry sends an identical ledger row.
  observationId: z.uuid(),
  observedAt: z.iso.datetime(),
  responseSha256: sha.nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  inputCeiling: z.number().int().min(0).max(24000),
  outputCeiling: z.number().int().min(0).max(1200),
  maxCostNanos: z.string().regex(/^[0-9]{1,60}$/),
});
export type EnrichmentUsageReceipt = z.infer<typeof enrichmentUsageReceiptSchema>;
type Event = Parameters<UsagePort["observeStep"]>[0];

// Only admitted child observations are billable; the logical response summary is stored by request idempotency.
export async function appendFlightEnrichmentUsage(
  gateway: Pick<ReturnType<typeof createClosedPersistenceGateway>, "invoke">,
  event: Event,
  rawReceipt: EnrichmentUsageReceipt | null,
): Promise<"RECORDED" | "RECOVERY_REQUIRED" | "NO_PROVIDER_CALL"> {
  const observation = observationSchema.parse(event.observation);
  if (!rawReceipt) {
    if (
      observation.execution === "NOT_STARTED" &&
      observation.billing_status === "NOT_BILLED" &&
      observation.cost_nanos === "0" &&
      [
        observation.input_tokens,
        observation.output_tokens,
        observation.cached_input_tokens,
        observation.total_tokens,
      ].every((n) => n === 0)
    )
      return "NO_PROVIDER_CALL";
    throw Error("ENRICHMENT_METER_RECEIPT_REQUIRED");
  }
  const receipt = enrichmentUsageReceiptSchema.parse(rawReceipt);
  if (
    event.feature !== "FLIGHT_ENRICHMENT" ||
    [
      "accountId",
      "actorId",
      "tripId",
      "requestId",
      "idempotencyKey",
      "requestDigest",
      "usageReceiptId",
      "stepId",
      "kind",
    ].some(
      (key) => event[key as keyof Event] !== receipt[key as keyof EnrichmentUsageReceipt],
    ) ||
    // V1 failure observations use the bound step hash when no StepResult receipt could be returned.
    (event.stepReceiptId !== receipt.stepReceiptId &&
      event.stepReceiptId !== receipt.stepId) ||
    observation.providerId !== "deepseek" ||
    (receipt.kind === "SEARCH" && observation.modelId !== null) ||
    (receipt.kind === "EXTRACTION" &&
      observation.cost_nanos !== null &&
      (observation.modelId === null ||
        !profile.accepted_returned_models.includes(observation.modelId)))
  )
    throw Error("ENRICHMENT_METER_SCOPE");
  if (receipt.dispatchState === "RESERVED" && observation.execution === "COMPLETED")
    throw Error("ENRICHMENT_COMPLETION_WITHOUT_DISPATCH");
  const uncertain = observation.execution === "MAY_HAVE_STARTED";
  const overBound =
    (observation.input_tokens !== null &&
      observation.input_tokens > receipt.inputCeiling) ||
    (observation.output_tokens !== null &&
      observation.output_tokens > receipt.outputCeiling) ||
    (observation.cost_nanos !== null &&
      BigInt(observation.cost_nanos) > BigInt(receipt.maxCostNanos));
  const searchUnits =
    receipt.kind !== "SEARCH"
      ? {}
      : observation.billing_status === "NOT_BILLED"
        ? { [profile.search_billable_unit]: 0 }
        : observation.execution === "COMPLETED" && observation.cost_quality !== "UNKNOWN"
          ? { [profile.search_billable_unit]: 1 }
          : {};
  const none = Object.fromEntries(
    "started_at ended_at latency_ms outcome publication_sha256 reasoning_tokens image_units audio_units bytes wall_ms cpu_ms gpu_ms accelerator_ms"
      .split(" ")
      .map((key) => [key, null]),
  );
  const row = {
    ...none,
    observation_id: receipt.observationId,
    call_id: receipt.callId,
    observation_key: `flight-enrichment-${receipt.observationId}`,
    observation_version: 1,
    observation_kind: "COMPLETION",
    measurement_mode: "CUMULATIVE",
    observed_at: receipt.observedAt,
    received_at: receipt.observedAt,
    status: uncertain
      ? "UNKNOWN"
      : observation.execution === "NOT_STARTED" || receipt.httpStatus !== 200
        ? "FAILED"
        : "SUCCEEDED",
    response_sha256: receipt.responseSha256,
    input_tokens: observation.input_tokens,
    output_tokens: observation.output_tokens,
    total_tokens: observation.total_tokens,
    cached_input_tokens: observation.cached_input_tokens,
    call_count: observation.execution === "NOT_STARTED" ? 0 : 1,
    other_units: searchUnits,
    provider_extension: {},
    usage_quality: observation.usage_quality,
    unit_quality:
      receipt.kind === "SEARCH" && Object.keys(searchUnits).length
        ? { [profile.search_billable_unit]: "ACTUAL_REPORTED" }
        : {},
    price_schedule_id: receipt.priceScheduleId,
    cost_nanos: observation.cost_nanos,
    currency: "USD",
    cost_quality:
      observation.cost_quality === "ACTUAL"
        ? "ACTUAL_REPORTED"
        : observation.cost_quality,
    cost_calculation_version:
      observation.cost_nanos === null ? null : "SUM_THEN_CEIL_NANOS_V1",
    // New cumulative coverage is not an incompatible NULL→known correction; CP14 projection selects it, never sums it.
    supersedes_observation_id: null,
    // Existing ledger ID permission is Import-only. The original ID remains in owning raw response custody.
    provider_request_id: null,
  };
  const append = {
    version: 1,
    environment: "DEV",
    request_id: randomUUID(),
    integration_id: "otr-flight-enrichment-v1",
    call_id: receipt.callId,
    row: {
      ...row,
      observation_sha256: persistenceDigest({
        domain: "otr-flight-enrichment-usage-v1",
        row,
      }),
    },
  };
  await gateway.invoke("external_integration_usage_append", {
    ...append,
    request_sha256: commandDigest(append),
  });
  // A late measurement can settle cost facts, but only the owning recovery gateway may resolve UNKNOWN execution.
  if (
    receipt.dispatchState === "UNKNOWN" ||
    (receipt.dispatchState === "RESERVED" && observation.execution !== "NOT_STARTED")
  )
    return "RECOVERY_REQUIRED";
  if (receipt.dispatchState !== "TERMINAL") {
    const unknown = uncertain || overBound;
    const observe = {
      version: 1,
      environment: "DEV",
      request_id: randomUUID(),
      integration_id: "otr-flight-enrichment-v1",
      call_id: receipt.callId,
      expected_revision: receipt.rowRevision,
      publication_fence: receipt.publicationFence,
      dispatch_state: unknown ? "UNKNOWN" : "TERMINAL",
      execution_certainty: unknown
        ? "UNKNOWN"
        : observation.execution === "NOT_STARTED"
          ? "NOT_STARTED"
          : "TERMINAL",
      safe_reason: overBound
        ? "ENRICHMENT_USAGE_BOUND"
        : uncertain
          ? "ENRICHMENT_RESPONSE_UNCERTAIN"
          : null,
      recovery_sha256: null,
    };
    await gateway.invoke("external_integration_observe_call", {
      ...observe,
      request_sha256: commandDigest(observe),
    });
  }
  if (overBound) throw Error("ENRICHMENT_USAGE_BOUND_RECORDED");
  return uncertain ? "RECOVERY_REQUIRED" : "RECORDED";
}
