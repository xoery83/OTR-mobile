import { z } from "zod";
import {
  calculateScheduledCost,
  commandDigest,
  persistenceDigest,
} from "./externalIntegrationPersistence";
import type { FlightProviderResult } from "./deepSeekFlight";
import { remoteFlightPinsSchema } from "../../src/domain/intelligence/interpretation";
import type { createClosedPersistenceGateway } from "./externalIntegrationPersistence";
import type { Attempt, ExecutionReport } from "../../src/domain/intelligence/persistence";
const scheduleSchema = z.strictObject({
  id: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  billing_applicability: z.enum(["UNAMBIGUOUS", "UNRESOLVED"]).default("UNAMBIGUOUS"),
  units: z
    .array(
      z.strictObject({
        measurement_unit: z.enum([
          "input_tokens",
          "cached_input_tokens",
          "output_tokens",
          "reasoning_tokens",
        ]),
        unit_quantity: z.number().int().positive().safe(),
        price_per_quantity: z.string().regex(/^\d+(?:\.\d{1,18})?$/),
        relationship: z.enum(["DISJOINT", "INCLUDED", "AMBIGUOUS"]),
        billable: z.boolean(),
      }),
    )
    .min(1)
    .max(32),
});
function nanosRate(rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  const coefficient =
    (BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"))) * 1000000000n;
  return `${coefficient / 10n ** 18n}.${(coefficient % 10n ** 18n).toString().padStart(18, "0")}`;
}
export function flightUsageCommand(
  a: Attempt,
  result: FlightProviderResult,
  report: ExecutionReport,
  rawSchedule: z.input<typeof scheduleSchema>,
  observation: { id: string; request_id: string; at: string },
) {
  const schedule = scheduleSchema.parse(rawSchedule);
  if (
    a.descriptor_snapshot.version !== 2 ||
    schedule.id !== a.descriptor_snapshot.remote_run.remote.price_schedule_id ||
    schedule.sha256 !== a.descriptor_snapshot.remote_run.remote.price_sha256
  )
    throw new Error("POLICY_BLOCKED");
  return buildFlightUsageCommand(a, result, report, schedule, observation);
}
function buildFlightUsageCommand(
  a: Attempt,
  result: FlightProviderResult,
  report: ExecutionReport,
  schedule: z.infer<typeof scheduleSchema>,
  observation: { id: string; request_id: string; at: string },
) {
  const u = result.usage;
  const separateCache = schedule.units.some(
    (unit) =>
      unit.measurement_unit === "cached_input_tokens" &&
      unit.relationship === "DISJOINT" &&
      unit.billable,
  );
  const quantities = {
    input_tokens: separateCache
      ? u.input_tokens === null || u.cached_input_tokens === null
        ? null
        : u.input_tokens - u.cached_input_tokens
      : u.input_tokens,
    cached_input_tokens: u.cached_input_tokens,
    output_tokens: u.output_tokens,
    reasoning_tokens: u.reasoning_tokens,
  };
  const duplicate = schedule.units.some(
    (unit, i) =>
      unit.billable &&
      unit.relationship === "DISJOINT" &&
      schedule.units
        .slice(0, i)
        .some(
          (prior) =>
            prior.measurement_unit === unit.measurement_unit &&
            prior.billable &&
            prior.relationship === "DISJOINT",
        ),
  );
  // Reasoning is included in completion, never an extra billable output dimension.
  const invalid =
    schedule.billing_applicability === "UNRESOLVED" ||
    duplicate ||
    schedule.units.some(
      (unit) =>
        unit.measurement_unit === "reasoning_tokens" &&
        unit.billable &&
        unit.relationship !== "INCLUDED",
    );
  const cost =
    invalid || u.usage_quality !== "ACTUAL_REPORTED"
      ? null
      : calculateScheduledCost(
          schedule.units.map((unit) => ({
            quantity:
              quantities[unit.measurement_unit] === null
                ? null
                : BigInt(quantities[unit.measurement_unit]!),
            quantityPerRate: BigInt(unit.unit_quantity),
            rate: nanosRate(unit.price_per_quantity),
            relationship: unit.relationship,
            billable: unit.billable,
          })),
        );
  const nullable = Object.fromEntries(
    "started_at ended_at outcome publication_sha256 image_units audio_units call_count bytes wall_ms cpu_ms gpu_ms accelerator_ms supersedes_observation_id"
      .split(" ")
      .map((k) => [k, null]),
  );
  const hasUsage =
    [
      u.input_tokens,
      u.output_tokens,
      u.total_tokens,
      u.cached_input_tokens,
      u.reasoning_tokens,
    ].some((v) => v !== null) || Object.keys(u.provider_extension).length > 0;
  const row = {
    ...nullable,
    observation_id: observation.id,
    call_id: a.usage_correlation_id,
    observation_key: "cp15-completion",
    observation_version: 1,
    observation_kind: "COMPLETION",
    measurement_mode: hasUsage ? "CUMULATIVE" : "NONE",
    observed_at: observation.at,
    received_at: observation.at,
    latency_ms: result.latency_ms,
    status: result.status === "SUCCEEDED" ? "SUCCEEDED" : result.status,
    response_sha256: report.response_sha256,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    total_tokens: u.total_tokens,
    cached_input_tokens: u.cached_input_tokens,
    reasoning_tokens: u.reasoning_tokens,
    other_units: {},
    provider_extension: u.provider_extension,
    usage_quality: u.usage_quality,
    unit_quality: {},
    price_schedule_id: schedule.id,
    cost_nanos: cost,
    currency: schedule.currency,
    cost_quality: cost === null ? "UNKNOWN" : "ESTIMATED",
    cost_calculation_version: cost === null ? null : "SUM_THEN_CEIL_NANOS_V1",
    provider_request_id: result.provider_request_id,
  };
  const sealed = {
    ...row,
    observation_sha256: persistenceDigest({ domain: "otr-cp15-flight-usage-v1", row }),
  };
  const c = {
    version: 1,
    environment: "DEV",
    request_id: observation.request_id,
    integration_id: a.integration_id,
    call_id: a.usage_correlation_id,
    row: sealed,
  };
  return { ...c, request_sha256: commandDigest(c) };
}
// Semantic callers supply exact retained execution pins; no Source/Admission authority is added.
export function flightSemanticUsageCommand(
  a: Attempt,
  result: FlightProviderResult,
  report: ExecutionReport,
  rawSchedule: z.input<typeof scheduleSchema>,
  rawPins: z.infer<typeof remoteFlightPinsSchema>,
  observation: { id: string; request_id: string; at: string },
) {
  const p = remoteFlightPinsSchema.parse(rawPins),
    schedule = scheduleSchema.parse(rawSchedule);
  if (
    a.descriptor_snapshot.version !== 1 ||
    a.descriptor_snapshot.provider_class !== "COMMERCIAL_REMOTE" ||
    !a.descriptor_snapshot.network_required ||
    !a.descriptor_snapshot.capabilities.includes("INTERPRET") ||
    a.shadow ||
    a.provider_id !== "DeepSeek" ||
    a.model_id !== "deepseek-flash" ||
    a.usage_correlation_id !== p.call_id ||
    a.attempt_id !== p.attempt_id ||
    a.request_sha256 !== p.request_sha256 ||
    a.provider_config_id !== p.provider_config_id ||
    a.adapter_version !== p.adapter_version ||
    schedule.id !== p.price_schedule_id ||
    schedule.sha256 !== p.price_sha256 ||
    report.account_id !== a.account_id ||
    report.attempt_id !== a.attempt_id ||
    report.task_id !== a.task_id ||
    report.request_id !== a.request_id ||
    report.request_sha256 !== a.request_sha256 ||
    report.usage_correlation_id !== a.usage_correlation_id
  )
    throw new Error("POLICY_BLOCKED");
  return buildFlightUsageCommand(a, result, report, schedule, observation);
}
export function createFlightSemanticUsageAppender(deps: {
  gateway: ReturnType<typeof createClosedPersistenceGateway>;
  authorize(a: Attempt): Promise<void>;
  loadPrice(a: Attempt): Promise<{
    pins: z.infer<typeof remoteFlightPinsSchema>;
    schedule: z.input<typeof scheduleSchema>;
  }>;
  readCompletion(
    a: Attempt,
  ): Promise<ReturnType<typeof flightSemanticUsageCommand>["row"] | null>;
  id(): string;
  now(): string;
}) {
  return async (a: Attempt, result: FlightProviderResult, report: ExecutionReport) => {
    await deps.authorize(a);
    const { pins, schedule } = await deps.loadPrice(a);
    const previous = await deps.readCompletion(a);
    const observation = previous
      ? {
          id: previous.observation_id,
          request_id: previous.observation_id,
          at: previous.observed_at,
        }
      : { id: deps.id(), request_id: deps.id(), at: deps.now() };
    let command = flightSemanticUsageCommand(
      a,
      result,
      report,
      schedule,
      pins,
      observation,
    );
    if (previous) {
      if (
        previous.call_id !== a.usage_correlation_id ||
        previous.observation_key !== "cp15-completion" ||
        previous.price_schedule_id !== schedule.id
      )
        throw new Error("POLICY_BLOCKED");
      if (
        previous.status === "UNKNOWN" &&
        command.row.usage_quality === "ACTUAL_REPORTED"
      )
        throw new Error("USAGE_UNKNOWN_TO_ACTUAL_CONTRACT_REQUIRED");
      // Recovered raw may not have a measured latency; retain the prior actual duration, never invent zero.
      if (command.row.latency_ms === null) {
        command = flightSemanticUsageCommand(
          a,
          { ...result, latency_ms: previous.latency_ms },
          report,
          schedule,
          pins,
          observation,
        );
      }
      if (persistenceDigest(command.row) !== persistenceDigest(previous))
        throw new Error("CP14_CHANGED_OBSERVATION");
    }
    await deps.authorize(a);
    await deps.gateway.invoke("external_integration_usage_append", command);
  };
}

// Operational facts deliberately omit raw fields, prompts, model prose and source IDs.
export function flightOperationalFacts(
  descriptor: { model_version: string; configuration_sha256: string },
  result: FlightProviderResult,
  counts: { fields: number; supported: number; missing: number; contradictory: number },
  review?: {
    changes: number;
    decision: "ACCEPT" | "REJECT" | "DEFER";
    cp13a: "PENDING" | "APPLIED" | "REJECTED";
  },
) {
  z.strictObject({
    fields: z.number().int().nonnegative().safe(),
    supported: z.number().int().nonnegative().safe(),
    missing: z.number().int().nonnegative().safe(),
    contradictory: z.number().int().nonnegative().safe(),
  }).parse(counts);
  z.object({
    model_version: z.literal("DeepSeek-V4.1-Flash"),
    configuration_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).parse(descriptor);
  if (review)
    z.strictObject({
      changes: z.number().int().nonnegative().safe(),
      decision: z.enum(["ACCEPT", "REJECT", "DEFER"]),
      cp13a: z.enum(["PENDING", "APPLIED", "REJECTED"]),
    }).parse(review);
  for (const value of Object.values(counts))
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("POLICY_BLOCKED");
  if (review && (!Number.isSafeInteger(review.changes) || review.changes < 0))
    throw new Error("POLICY_BLOCKED");
  return {
    version: 1,
    model: descriptor.model_version,
    configuration_sha256: descriptor.configuration_sha256,
    status: result.status,
    latency_ms: result.latency_ms,
    usage_quality: result.usage.usage_quality,
    counts,
    review: review ?? null,
  };
}
