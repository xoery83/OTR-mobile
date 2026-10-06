import { z } from "zod";
import {
  createClosedPersistenceGateway,
  commandDigest,
  persistenceDigest,
  callCorrelationSchema,
  verifyCallCorrelation,
} from "./externalIntegrationPersistence";
import {
  readOutboundSnapshots,
  verifyOutboundAdmission,
  type OutboundAdmission,
  type OutboundHash,
} from "../../src/domain/intelligence/outboundRouting";
import type { OutboundServer83 } from "../../src/data/intelligence/closedOutboundHarness";
const headerSchema = callCorrelationSchema.extend({
  environment: z.literal("TEST"),
  price_schedule_id: z.uuid().nullable(),
  provider_id: z.string(),
  model_id: z.string(),
  model_version: z.string(),
  adapter_version: z.string(),
  trip_id: z.uuid().nullable(),
  import_id: z.uuid(),
  idempotency_key: z.uuid(),
  admission_sha256: z.string(),
  start_sha256: z.string(),
  row_revision: z.number().int().positive().safe(),
  dispatch_state: z.literal("RESERVED"),
  execution_certainty: z.literal("NOT_STARTED"),
  start_durable: z.literal(true),
});
export function outboundReservationCommand(e: Readonly<OutboundAdmission>) {
  const a = e.attempt,
    s = e.pins.snapshot;
  const row = {
    call_id: a.usage_correlation_id,
    integration_id: a.integration_id,
    environment: s.environment,
    provider_config_id: a.provider_config_id,
    provider_id: a.provider_id,
    model_id: a.model_id,
    model_version: a.model_version,
    adapter_version: a.adapter_version,
    config_version: s.integration_version,
    configuration_sha256: a.configuration_sha256,
    account_id: a.account_id,
    user_id: a.account_id,
    billing_subject_id: null,
    trip_id: e.trip_id,
    import_id: e.import_id,
    task_id: a.task_id,
    attempt_id: a.attempt_id,
    fallback_chain_id: a.fallback_chain_id,
    shadow_of_call_id: e.shadow_of_call_id,
    evaluation_reference: a.shadow ? a.attempt_id : null,
    attempt_sequence: a.attempt_sequence,
    invocation_id: null,
    request_id: a.request_id,
    idempotency_key: a.idempotency_key,
    request_sha256: a.request_sha256,
    input_sha256: e.input_sha256,
    schema_sha256: e.schema_sha256,
    capability: a.descriptor_snapshot.capabilities[0],
    task_class: "INTELLIGENCE",
    call_kind:
      s.provider_class === "OTR_SELF_HOSTED" ? "SELF_HOSTED_COMPUTE" : "OUTBOUND_MODEL",
    shadow: a.shadow,
    price_schedule_id: s.price?.id ?? null,
    admitted_at: a.created_at,
    admission_sha256: e.pins.routing_decision_sha256,
    publication_fence: a.task_publication_fence,
    row_revision: 1,
    dispatch_state: "RESERVED",
    execution_certainty: "NOT_STARTED",
    dispatch_marked_at: null,
    terminal_observed_at: null,
    safe_reason: null,
  };
  const start = {
    observation_id: a.usage_correlation_id,
    call_id: a.usage_correlation_id,
    observation_key: "start",
    observation_version: 1,
    observation_kind: "START",
    measurement_mode: "NONE",
    observed_at: a.created_at,
    received_at: a.created_at,
    started_at: null,
    ended_at: null,
    latency_ms: null,
    status: "STARTED",
    outcome: null,
    response_sha256: null,
    publication_sha256: null,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    cached_input_tokens: null,
    reasoning_tokens: null,
    image_units: null,
    audio_units: null,
    call_count: null,
    bytes: null,
    wall_ms: null,
    cpu_ms: null,
    gpu_ms: null,
    accelerator_ms: null,
    other_units: {},
    provider_extension: {},
    usage_quality: "UNKNOWN",
    unit_quality: {},
    price_schedule_id: s.price?.id ?? null,
    cost_nanos: null,
    currency: s.price?.currency ?? null,
    cost_quality: "UNKNOWN",
    cost_calculation_version: null,
    supersedes_observation_id: null,
    observation_sha256: persistenceDigest({
      domain: "otr-cp14-outbound-start-v1",
      call_id: a.usage_correlation_id,
      request_sha256: a.request_sha256,
    }),
  };
  const command = {
    version: 1,
    environment: s.environment,
    request_id: a.request_id,
    account_id: a.account_id,
    integration_id: a.integration_id,
    row,
    start,
  };
  return Object.freeze({ ...command, request_sha256: commandDigest(command) });
}
// Injected accepted gateway and trusted nonsecret projections only. No SQL session,
// credentials, reporting privilege expansion, HTTP route or production factory.
export function createServer83OutboundReservation(deps: {
  gateway: ReturnType<typeof createClosedPersistenceGateway>;
  hash: OutboundHash;
  id(): string;
  // Trusted read-side authorization, never a caller-supplied verified flag.
  assertCurrentAuthorization(e: Readonly<OutboundAdmission>): Promise<void>;
  readReserved(e: Readonly<OutboundAdmission>): Promise<unknown>;
  readCurrent(e: Readonly<OutboundAdmission>): Promise<unknown>;
}): OutboundServer83 {
  async function header(e: Readonly<OutboundAdmission>) {
    e = await verifyOutboundAdmission(e.attempt, e as OutboundAdmission, deps.hash);
    const h = headerSchema.parse(await deps.readReserved(e));
    verifyCallCorrelation(
      e.attempt,
      Object.fromEntries(
        Object.keys(callCorrelationSchema.shape).map((k) => [k, h[k as keyof typeof h]]),
      ) as z.infer<typeof callCorrelationSchema>,
    );
    if (
      h.environment !== e.pins.snapshot.environment ||
      h.price_schedule_id !== (e.pins.snapshot.price?.id ?? null) ||
      h.input_sha256 !== e.input_sha256 ||
      h.schema_sha256 !== e.schema_sha256 ||
      h.publication_fence !== e.attempt.task_publication_fence ||
      h.shadow_of_call_id !== e.shadow_of_call_id ||
      h.provider_id !== e.attempt.provider_id ||
      h.model_id !== e.attempt.model_id ||
      h.model_version !== e.attempt.model_version ||
      h.adapter_version !== e.attempt.adapter_version ||
      h.trip_id !== e.trip_id ||
      h.import_id !== e.import_id ||
      h.idempotency_key !== e.attempt.idempotency_key ||
      h.admission_sha256 !== outboundReservationCommand(e).request_sha256 ||
      h.start_sha256 !== outboundReservationCommand(e).start.observation_sha256
    )
      throw new Error("OUTBOUND_SERVER_BINDING");
    return h;
  }
  return {
    async reserve(e) {
      e = await verifyOutboundAdmission(e.attempt, e as OutboundAdmission, deps.hash);
      await deps.gateway.invoke(
        "external_integration_reserve_call",
        outboundReservationCommand(e),
      );
    },
    async assertStart(e) {
      await header(e);
    },
    async freshEligibility(e) {
      e = await verifyOutboundAdmission(e.attempt, e as OutboundAdmission, deps.hash);
      await deps.assertCurrentAuthorization(e);
      const old = e.pins.snapshot;
      const rows = readOutboundSnapshots(await deps.readCurrent(e));
      const current = rows
        .filter(
          (s) =>
            s.environment === old.environment &&
            s.integration_id === old.integration_id &&
            s.provider_id === old.provider_id &&
            s.model_id === old.model_id,
        )
        .sort((a, b) => b.config_version - a.config_version)[0];
      if (
        !current ||
        current.provider_config_id !== old.provider_config_id ||
        current.environment !== old.environment ||
        current.environment_killed ||
        current.killed ||
        !current.enabled ||
        current.integration_version !== old.integration_version ||
        current.integration_sha256 !== old.integration_sha256 ||
        current.config_version !== old.config_version ||
        current.configuration_sha256 !== old.configuration_sha256 ||
        current.model_id !== old.model_id ||
        current.provider_id !== old.provider_id ||
        current.model_version !== old.model_version ||
        current.adapter_version !== old.adapter_version ||
        current.eligibility === "DISABLED" ||
        (!e.attempt.shadow && current.eligibility === "SHADOW_ONLY") ||
        (current.health_config_version === current.integration_version &&
          current.health === "UNAVAILABLE")
      )
        throw new Error("OUTBOUND_PREDISPATCH_INELIGIBLE");
      // Quota/rate were consumed by atomic reservation; never count/refund locally.
      await header(e);
    },
    async observeDispatchClosed(e) {
      const h = await header(e);
      const raw = {
        version: 1,
        environment: h.environment,
        request_id: deps.id(),
        account_id: h.account_id,
        integration_id: h.integration_id,
        call_id: h.call_id,
        expected_revision: h.row_revision,
        publication_fence: h.publication_fence,
      };
      try {
        await deps.gateway.invoke("external_integration_mark_dispatch", {
          ...raw,
          request_sha256: commandDigest(raw),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CP14_RUNTIME_CLOSED") return;
        throw error; // Auth/CAS/kill/transport failure is not proof of the closed runtime gate.
      }
      throw new Error("OUTBOUND_UNEXPECTED_REAL_DISPATCH");
    },
  };
}
