import { z } from "zod";
import { canonicalEventJson, type Json } from "../trip/eventIntentJson";
import {
  attemptSchema,
  attemptMutableColumns,
  digest,
  identity,
  label,
  type Attempt,
  type RouterRequest,
} from "./persistence";
const count = z.number().int().nonnegative().safe();
const version = count.positive();
const nanos = z.string().regex(/^[0-9]{1,60}$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
export const outboundSnapshotSchema = z
  .strictObject({
    environment: z.enum(["TEST", "DEV", "PRODUCTION"]),
    environment_version: version,
    environment_killed: z.boolean(),
    runtime_enabled: z.literal(false),
    integration_id: label,
    integration_version: version,
    integration_sha256: digest,
    enabled: z.boolean(),
    killed: z.boolean(),
    provider_config_id: identity,
    provider_id: label,
    model_id: label,
    model_version: label,
    adapter_version: label,
    config_version: version,
    configuration_sha256: digest,
    provider_class: z.enum([
      "DETERMINISTIC",
      "ON_DEVICE",
      "OTR_SELF_HOSTED",
      "COMMERCIAL_REMOTE",
    ]),
    capabilities: z.array(label).max(32),
    modalities: z.array(label).max(32),
    schemas: z.array(z.strictObject({ id: label, version, dialect: label })).max(32),
    schema_output: z.boolean(),
    privacy: z.enum(["LOCAL_ONLY", "OTR_ONLY", "REMOTE_ALLOWED"]),
    network_required: z.boolean(),
    region: label,
    routing_class: label,
    priority: count,
    eligibility: z.enum(["DISABLED", "SHADOW_ONLY", "ELIGIBLE"]),
    input_byte_limit: count,
    input_count_limit: count,
    output_byte_limit: count,
    max_risk: count,
    max_complexity: count,
    replay_support: z.enum(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]),
    quota_admitted: z.boolean(),
    rate_admitted: z.boolean(),
    latency_ms: count.nullable(),
    expected_cost_nanos: nanos.nullable(),
    expected_currency: currency.nullable(),
    price: z
      .strictObject({ id: identity, version: label, sha256: digest, currency })
      .nullable(),
    health: z.enum(["HEALTHY", "UNAVAILABLE", "UNKNOWN"]),
    health_reference: identity.nullable(),
    health_config_version: version.nullable(),
    quality_reference: identity.nullable(),
    quality_policy_reference: label.nullable(),
    quality_policy_sha256: digest.nullable(),
  })
  .superRefine((s, ctx) => {
    if (
      (s.expected_cost_nanos === null) !== (s.expected_currency === null) ||
      (s.quality_reference === null) !== (s.quality_policy_sha256 === null) ||
      (s.quality_reference === null) !== (s.quality_policy_reference === null) ||
      (s.health_reference === null) !== (s.health_config_version === null) ||
      (s.health !== "UNKNOWN" && s.health_reference === null) ||
      (s.privacy === "LOCAL_ONLY" && s.network_required)
    )
      ctx.addIssue({ code: "custom", message: "Invalid admitted snapshot." });
  });
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
export type OutboundSnapshot = Immutable<z.infer<typeof outboundSnapshotSchema>>;
export function freeze<T>(v: T): Immutable<T> {
  if (v !== null && typeof v === "object") {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v as Immutable<T>;
}
export function readOutboundSnapshots(raw: unknown): readonly OutboundSnapshot[] {
  const rows = z.array(outboundSnapshotSchema).max(64).parse(raw);
  if (new Set(rows.map((s) => s.provider_config_id)).size !== rows.length)
    throw new Error("OUTBOUND_DUPLICATE_SNAPSHOT");
  return freeze(rows);
}
export type OutboundReason =
  | "NETWORK_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "QUOTA_EXHAUSTED"
  | "CAPABILITY_UNAVAILABLE"
  | "BUDGET_POLICY"
  | "PRIVACY_POLICY"
  | "RECOVERY_REQUIRED";
const outboundPinsSchema = z.strictObject({
  version: z.literal(1),
  snapshot: outboundSnapshotSchema,
  policy_sha256: digest,
  routing_policy_sha256: digest,
  routing_decision_sha256: digest,
  role: z.enum(["ACTIVE", "SHADOW"]),
  execution_policy: z.literal("CLOSED_SYNTHETIC_ONLY"),
  replay_policy: z.literal("NEW_ATTEMPT_REQUIRED"),
});
export type OutboundPins = Immutable<z.infer<typeof outboundPinsSchema>>;
export type OutboundRoute =
  | { status: "WAIT" | "UNAVAILABLE"; reason: OutboundReason }
  | { status: "ELIGIBLE"; pins: OutboundPins };
export type OutboundHash = (bytes: Uint8Array) => Promise<string>;
export const outboundDigest = (hash: OutboundHash, value: unknown) =>
  hash(new TextEncoder().encode(canonicalEventJson(value as Json)));
export async function routeOutbound(
  request: RouterRequest & {
    environment: OutboundSnapshot["environment"];
    complexity?: number;
    shadow?: boolean;
  },
  snapshots: readonly OutboundSnapshot[],
  hash: OutboundHash,
): Promise<OutboundRoute> {
  z.array(label).max(32).parse(request.capabilities);
  z.array(label).max(32).parse(request.modalities);
  z.enum(["NORMAL", "HIGH"]).parse(request.risk);
  z.enum(["LOCAL_ONLY", "OTR_ONLY", "REMOTE_ALLOWED"]).parse(request.privacy);
  z.enum(["TEST", "DEV", "PRODUCTION"]).parse(request.environment);
  if (
    !Number.isSafeInteger(request.complexity ?? 0) ||
    (request.complexity ?? 0) < 0 ||
    (request.latencyBudgetMs !== null &&
      (!Number.isSafeInteger(request.latencyBudgetMs) || request.latencyBudgetMs < 0)) ||
    (request.budget.nanos !== null && !nanos.safeParse(request.budget.nanos).success) ||
    (request.budget.currency !== null &&
      !currency.safeParse(request.budget.currency).success)
  )
    throw new Error("OUTBOUND_POLICY_INVALID");
  const rows = readOutboundSnapshots(snapshots);
  const inputPins = request.task.input_pins ?? [];
  const inputBytes = inputPins.reduce((total, pin) => total + pin.byte_count, 0);
  if (!Number.isSafeInteger(inputBytes) || inputBytes < 0)
    throw new Error("OUTBOUND_INPUT_BOUND");
  let candidates = rows.filter(
    (s) =>
      !rows.some(
        (n) =>
          n.environment === s.environment &&
          n.integration_id === s.integration_id &&
          n.provider_id === s.provider_id &&
          n.model_id === s.model_id &&
          n.config_version > s.config_version,
      ),
  );
  const filter = (predicate: (s: OutboundSnapshot) => boolean) => {
    candidates = candidates.filter(predicate);
    return candidates.length > 0;
  };
  if (
    !filter(
      (s) =>
        inputBytes <= s.input_byte_limit &&
        inputPins.length <= s.input_count_limit &&
        request.capabilities.every((c) => s.capabilities.includes(c)) &&
        request.modalities.every((m) => s.modalities.includes(m)) &&
        s.schema_output &&
        s.schemas.some(
          (c) =>
            c.id === request.schema.id &&
            c.version === request.schema.version &&
            c.dialect === request.task.schema_dialect,
        ),
    )
  )
    return { status: "UNAVAILABLE", reason: "CAPABILITY_UNAVAILABLE" };
  if (
    !filter(
      (s) =>
        s.region === request.task.policy_snapshot.region &&
        (request.privacy !== "LOCAL_ONLY" ||
          (!s.network_required &&
            ["DETERMINISTIC", "ON_DEVICE"].includes(s.provider_class))) &&
        (request.privacy !== "OTR_ONLY" || s.provider_class !== "COMMERCIAL_REMOTE"),
    )
  )
    return { status: "UNAVAILABLE", reason: "PRIVACY_POLICY" };
  if (
    !filter(
      (s) =>
        s.environment === request.environment &&
        !s.environment_killed &&
        s.enabled &&
        !s.killed,
    )
  )
    return { status: "WAIT", reason: "PROVIDER_UNAVAILABLE" };
  if (
    !filter(
      (s) =>
        s.routing_class === request.task.policy_snapshot.route &&
        (s.eligibility === "ELIGIBLE" ||
          (!!request.shadow &&
            request.shadowEligible &&
            s.eligibility === "SHADOW_ONLY")),
    )
  )
    return { status: "UNAVAILABLE", reason: "PROVIDER_UNAVAILABLE" };
  if (request.shadow && !request.shadowEligible)
    return { status: "UNAVAILABLE", reason: "BUDGET_POLICY" };
  if (!filter((s) => request.online || (!s.network_required && !request.networkRequired)))
    return { status: "WAIT", reason: "NETWORK_REQUIRED" };
  if (!filter((s) => s.quota_admitted && s.rate_admitted))
    return { status: "WAIT", reason: "QUOTA_EXHAUSTED" };
  if (
    !filter(
      (s) =>
        s.max_risk >= (request.risk === "HIGH" ? 1 : 0) &&
        s.max_complexity >= (request.complexity ?? 0) &&
        (request.latencyBudgetMs === null ||
          (s.latency_ms !== null && s.latency_ms <= request.latencyBudgetMs)),
    )
  )
    return { status: "UNAVAILABLE", reason: "CAPABILITY_UNAVAILABLE" };
  if (
    !filter(
      (s) =>
        request.budget.nanos === null ||
        (s.price !== null &&
          s.expected_cost_nanos !== null &&
          s.expected_currency === request.budget.currency &&
          s.price.currency === request.budget.currency &&
          BigInt(s.expected_cost_nanos) <= BigInt(request.budget.nanos)),
    )
  )
    return { status: "UNAVAILABLE", reason: "BUDGET_POLICY" };
  if (
    !filter((s) =>
      s.health_config_version === s.integration_version
        ? s.health !== "UNAVAILABLE"
        : true,
    )
  )
    return { status: "WAIT", reason: "PROVIDER_UNAVAILABLE" };
  candidates.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.provider_config_id < b.provider_config_id
        ? -1
        : a.provider_config_id > b.provider_config_id
          ? 1
          : 0),
  );
  const snapshot = candidates[0];
  const routing_policy_sha256 = await outboundDigest(hash, {
    version: 1,
    order: "HARD_ENV_ELIGIBILITY_NETWORK_QUOTA_RISK_BUDGET_HEALTH_ID",
    request: {
      capabilities: request.capabilities,
      modalities: request.modalities,
      schema: request.schema,
      privacy: request.privacy,
      environment: request.environment,
      online: request.online,
      network: request.networkRequired,
      latency: request.latencyBudgetMs,
      risk: request.risk,
      complexity: request.complexity ?? 0,
      budget: request.budget,
      shadow: !!request.shadow,
      shadowEligible: request.shadowEligible,
    },
    policy: request.task.policy_sha256,
  });
  return {
    status: "ELIGIBLE",
    pins: freeze({
      version: 1,
      snapshot,
      policy_sha256: request.task.policy_sha256,
      routing_policy_sha256,
      routing_decision_sha256: await outboundDigest(hash, {
        routing_policy_sha256,
        candidates: candidates.map((s) => s.provider_config_id),
        snapshot,
      }),
      role: request.shadow ? "SHADOW" : "ACTIVE",
      execution_policy: "CLOSED_SYNTHETIC_ONLY",
      replay_policy: "NEW_ATTEMPT_REQUIRED",
    }),
  };
}
const outboundAdmissionSchema = z.strictObject({
  version: z.literal(1),
  body_sha256: digest,
  attempt: attemptSchema,
  pins: outboundPinsSchema,
  input_sha256: digest,
  schema_sha256: digest,
  trip_id: identity.nullable(),
  import_id: identity,
  shadow_of_call_id: identity.nullable(),
});
export type OutboundAdmission = Omit<z.infer<typeof outboundAdmissionSchema>, "pins"> & {
  pins: OutboundPins;
};
export async function createOutboundAdmission(input: {
  request: RouterRequest;
  pins: OutboundPins;
  seed: Attempt;
  predecessor: Attempt | null;
  shadowOf: Attempt | null;
  hash: OutboundHash;
}): Promise<OutboundAdmission> {
  const hash = input.hash,
    request = structuredClone(input.request),
    pins = freeze(outboundPinsSchema.parse(input.pins)),
    seed = attemptSchema.parse(input.seed),
    predecessor = input.predecessor ? attemptSchema.parse(input.predecessor) : null,
    shadowOf = input.shadowOf ? attemptSchema.parse(input.shadowOf) : null;
  const s = pins.snapshot,
    t = request.task;
  if (
    pins.policy_sha256 !== t.policy_sha256 ||
    !t.sync_operation_id ||
    (predecessor &&
      (predecessor.execution_observation !== "TERMINAL" ||
        predecessor.execution_outcome !== "FAILED" ||
        predecessor.response_sha256 ||
        predecessor.metering_disposition !== "COMPLETE" ||
        predecessor.shadow ||
        predecessor.task_id !== t.task_id ||
        predecessor.account_id !== t.account_id ||
        t.current_attempt_id !== predecessor.attempt_id ||
        seed.attempt_sequence <= predecessor.attempt_sequence)) ||
    (pins.role === "SHADOW" &&
      (!shadowOf ||
        shadowOf.shadow ||
        shadowOf.task_id !== t.task_id ||
        shadowOf.account_id !== t.account_id ||
        !shadowOf.usage_correlation_id))
  )
    throw new Error("OUTBOUND_ADMISSION_FENCE");
  const binding = {
    body_sha256: seed.request_sha256,
    attempt_id: seed.attempt_id,
    request_id: seed.request_id,
    idempotency_key: seed.idempotency_key,
    call_id: seed.usage_correlation_id,
    version: 1,
    pins,
    task_id: t.task_id,
    account_id: t.account_id,
    trip_id: t.trip_id,
    import_id: t.import_id,
    input_sha256: t.input_sha256,
    schema_sha256: t.schema_sha256,
    publication_fence: t.publication_fence,
    predecessor: predecessor?.attempt_id ?? null,
    shadow_of: shadowOf?.attempt_id ?? null,
    shadow_of_call_id: pins.role === "SHADOW" ? shadowOf!.usage_correlation_id : null,
  };
  const request_sha256 = await outboundDigest(hash, binding);
  const attempt = attemptSchema.parse({
    ...seed,
    account_id: t.account_id,
    task_id: t.task_id,
    attempt_sequence: seed.attempt_sequence,
    integration_id: s.integration_id,
    provider_id: s.provider_id,
    model_id: s.model_id,
    model_version: s.model_version,
    adapter_version: s.adapter_version,
    provider_config_id: s.provider_config_id,
    config_version: String(s.integration_version),
    configuration_sha256: s.integration_sha256,
    descriptor_snapshot: {
      version: 1,
      provider_class: s.provider_class,
      replay_support: s.replay_support,
      capabilities: [...s.capabilities],
      modalities: [...s.modalities],
      network_required: s.network_required,
    },
    request_sha256,
    request_material_sha256: request_sha256,
    task_publication_fence: t.publication_fence,
    sync_operation_id: t.sync_operation_id,
    policy_admission: { version: 1, policy_sha256: t.policy_sha256, allowed: true },
    policy_admission_sha256: await outboundDigest(hash, {
      version: 1,
      policy_sha256: t.policy_sha256,
      allowed: true,
    }),
    predecessor_attempt_id: predecessor?.attempt_id ?? null,
    predecessor_request_id: predecessor?.request_id ?? null,
    fallback_chain_id:
      predecessor?.fallback_chain_id ??
      shadowOf?.fallback_chain_id ??
      seed.fallback_chain_id,
    shadow: pins.role === "SHADOW",
    shadow_of_attempt_id: pins.role === "SHADOW" ? shadowOf!.attempt_id : null,
    metering_disposition: "START_PENDING",
  });
  if (
    !attempt.request_material_reference ||
    !attempt.usage_correlation_id ||
    (predecessor &&
      (attempt.attempt_id === predecessor.attempt_id ||
        attempt.request_id === predecessor.request_id ||
        attempt.idempotency_key === predecessor.idempotency_key ||
        attempt.usage_correlation_id === predecessor.usage_correlation_id))
  )
    throw new Error("OUTBOUND_NEW_IDENTITY_REQUIRED");
  return {
    body_sha256: seed.request_sha256,
    version: 1,
    attempt,
    pins,
    input_sha256: t.input_sha256,
    schema_sha256: t.schema_sha256,
    trip_id: t.trip_id,
    import_id: t.import_id,
    shadow_of_call_id: pins.role === "SHADOW" ? shadowOf!.usage_correlation_id : null,
  };
}
export function continuationRouteReason(
  route: Exclude<OutboundRoute, { status: "ELIGIBLE" }>,
) {
  return route.status === "UNAVAILABLE"
    ? { status: "UNAVAILABLE" as const, reason: "UNSUPPORTED" as const }
    : {
        status: "WAIT" as const,
        reason:
          route.reason === "NETWORK_REQUIRED"
            ? ("WAITING_FOR_NETWORK" as const)
            : ("WAITING_FOR_REMOTE_INTELLIGENCE" as const),
      };
}

export async function verifyOutboundAdmission(
  a: Attempt,
  envelope: OutboundAdmission,
  hash: OutboundHash,
) {
  // Capture before asynchronous hashing/custody verification can yield to the caller.
  a = attemptSchema.parse(a);
  envelope = outboundAdmissionSchema.parse(envelope);
  if (
    envelope.version !== 1 ||
    envelope.pins.version !== 1 ||
    envelope.pins.execution_policy !== "CLOSED_SYNTHETIC_ONLY" ||
    envelope.pins.replay_policy !== "NEW_ATTEMPT_REQUIRED" ||
    (envelope.pins.role === "SHADOW") !== a.shadow
  )
    throw new Error("OUTBOUND_ADMISSION_FORMAT");
  const expected = attemptSchema.parse(envelope.attempt);
  // Mutable execution/install/metering observations never rewrite admitted pins.
  const immutable = (row: Attempt) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([k]) => !(attemptMutableColumns as readonly string[]).includes(k),
      ),
    );
  if (
    canonicalEventJson(immutable(a) as Json) !==
    canonicalEventJson(immutable(expected) as Json)
  )
    throw new Error("OUTBOUND_IDENTITY_MISMATCH");
  const pins = envelope.pins;
  outboundSnapshotSchema.parse(pins.snapshot);
  digest.parse(envelope.body_sha256);
  digest.parse(pins.routing_decision_sha256);
  digest.parse(pins.routing_policy_sha256);
  digest.parse(pins.policy_sha256);
  const binding = {
    body_sha256: envelope.body_sha256,
    attempt_id: a.attempt_id,
    request_id: a.request_id,
    idempotency_key: a.idempotency_key,
    call_id: a.usage_correlation_id,
    version: 1,
    pins,
    task_id: a.task_id,
    account_id: a.account_id,
    trip_id: envelope.trip_id,
    import_id: envelope.import_id,
    input_sha256: envelope.input_sha256,
    schema_sha256: envelope.schema_sha256,
    publication_fence: a.task_publication_fence,
    predecessor: a.predecessor_attempt_id,
    shadow_of: a.shadow_of_attempt_id,
    shadow_of_call_id: envelope.shadow_of_call_id,
  };
  if (
    (await outboundDigest(hash, binding)) !== a.request_sha256 ||
    a.request_material_sha256 !== a.request_sha256
  )
    throw new Error("OUTBOUND_ADMISSION_DIGEST");
  return freeze(structuredClone(envelope)) as OutboundAdmission;
}
