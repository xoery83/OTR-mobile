import { z } from "zod";
export const identity = z.uuid();
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const revision = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const timestamp = z.iso.datetime();
export const inputPinSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("CAPTURE"),
    capture_id: label,
    payload_id: label,
    revision,
    payload_sha256: digest,
    byte_count: count,
  }),
  z.strictObject({
    kind: z.literal("SOURCE"),
    source_id: identity,
    material_revision: revision,
    representation_id: identity,
    payload_sha256: digest,
    byte_count: count,
    input_id: identity.nullable(),
    transform_sha256: digest.nullable(),
  }),
]);
const dependencies = z
  .array(
    z.strictObject({
      kind: z.enum(["TASK", "QUEUE_OPERATION"]),
      id: z.string().min(1).max(128),
    }),
  )
  .max(64);
const policy = z.strictObject({
  version: z.literal(1),
  privacy: z.enum(["LOCAL_ONLY", "OTR_ONLY", "REMOTE_ALLOWED"]),
  network_required: z.boolean(),
  region: label,
  budget_currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  budget_nanos: z
    .string()
    .regex(/^[0-9]+$/)
    .nullable(),
  route: label,
  max_attempts: revision,
  deadline: timestamp.nullable(),
});
const descriptor = z.strictObject({
  version: z.literal(1),
  provider_class: z.enum([
    "DETERMINISTIC",
    "ON_DEVICE",
    "OTR_SELF_HOSTED",
    "COMMERCIAL_REMOTE",
  ]),
  replay_support: z.enum(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]),
  capabilities: z.array(label).max(32),
  modalities: z.array(label).max(32),
  network_required: z.boolean(),
});
const admission = z.strictObject({
  version: z.literal(1),
  policy_sha256: digest,
  allowed: z.boolean(),
});
const usage = z.strictObject({
  version: z.literal(1),
  input_tokens: count.nullable(),
  output_tokens: count.nullable(),
  total_tokens: count.nullable(),
  cached_input_tokens: count.nullable(),
  reasoning_tokens: count.nullable(),
  image_units: count.nullable(),
  audio_units: count.nullable(),
  call_count: count.nullable(),
  bytes: count.nullable(),
  wall_ms: count.nullable(),
  cpu_ms: count.nullable(),
  gpu_ms: count.nullable(),
  accelerator_ms: count.nullable(),
  usage_quality: z.enum(["UNKNOWN", "ESTIMATED", "ACTUAL_REPORTED"]),
});
export const taskSchema = z.strictObject({
  account_id: identity,
  task_id: identity,
  format_version: z.literal(1),
  import_id: identity,
  manifest_version: revision,
  manifest_sha256: digest,
  trip_id: identity.nullable(),
  stage: z.enum(["EXTRACTION", "INTERPRETATION", "ENRICHMENT", "CLOSURE"]),
  logical_request_id: identity,
  logical_idempotency_key: identity,
  input_pins: z.array(inputPinSchema).max(64),
  input_sha256: digest,
  consumer_id: label,
  schema_id: label,
  schema_dialect: label,
  consumer_version: revision,
  schema_version: revision,
  schema_sha256: digest,
  capability_requirements: z.array(label).max(32),
  policy_snapshot: policy,
  policy_sha256: digest,
  run_id: identity.nullable(),
  expected_run_generation: revision.nullable(),
  candidate_id: identity.nullable(),
  expected_candidate_sha256: digest.nullable(),
  event_id: identity.nullable(),
  expected_event_revision: revision.nullable(),
  created_at: timestamp,
  creation_clock: z.enum(["CALLER_OBSERVED", "DEVICE_WALL", "SERVER_OBSERVED"]),
  row_revision: revision,
  publication_fence: revision,
  current_pass_complete: z.boolean(),
  work_disposition: z.enum([
    "PENDING",
    "WAITING",
    "RUNNING",
    "RESULT_PENDING",
    "PUBLISHED",
    "FAILED",
    "CANCELED",
    "STALE",
    "UNKNOWN",
  ]),
  wait_reason: z
    .enum([
      "WAITING_FOR_NETWORK",
      "WAITING_FOR_REMOTE_INTELLIGENCE",
      "WAITING_FOR_ENRICHMENT",
      "WAITING_FOR_AUTH",
      "POLICY_BLOCKED",
    ])
    .nullable(),
  wait_reasons: z
    .array(
      z.strictObject({
        reason: z.enum([
          "WAITING_FOR_NETWORK",
          "WAITING_FOR_REMOTE_INTELLIGENCE",
          "WAITING_FOR_ENRICHMENT",
          "WAITING_FOR_AUTH",
          "POLICY_BLOCKED",
        ]),
        dependency_id: label.nullable(),
        capability: label.nullable(),
        policy_sha256: digest,
      }),
    )
    .max(64),
  sync_operation_id: label.nullable(),
  dependencies: dependencies,
  current_attempt_id: identity.nullable(),
  cancellation_disposition: z.enum(["NONE", "REQUESTED", "FENCED"]),
  safe_reason: label.nullable(),
  publication_id: identity.nullable(),
  publication_sha256: digest.nullable(),
  result_sha256: digest.nullable(),
  updated_at: timestamp,
  update_clock: z.enum(["CALLER_OBSERVED", "DEVICE_WALL", "SERVER_OBSERVED"]),
  completed_at: timestamp.nullable(),
});
export type Task = z.infer<typeof taskSchema>;
export const taskJsonColumns = [
  "input_pins",
  "capability_requirements",
  "policy_snapshot",
  "wait_reasons",
  "dependencies",
] as const;
export const taskMutableColumns = [
  "row_revision",
  "publication_fence",
  "current_pass_complete",
  "work_disposition",
  "wait_reason",
  "wait_reasons",
  "sync_operation_id",
  "dependencies",
  "current_attempt_id",
  "cancellation_disposition",
  "safe_reason",
  "publication_id",
  "publication_sha256",
  "result_sha256",
  "updated_at",
  "update_clock",
  "completed_at",
] as const;
export const attemptSchema = z.strictObject({
  account_id: identity,
  attempt_id: identity,
  task_id: identity,
  attempt_sequence: revision,
  format_version: z.literal(1),
  request_id: identity,
  idempotency_key: identity,
  request_sha256: digest,
  request_material_reference: identity.nullable(),
  request_material_sha256: digest.nullable(),
  predecessor_attempt_id: identity.nullable(),
  predecessor_request_id: identity.nullable(),
  integration_id: label.nullable(),
  provider_id: label.nullable(),
  model_id: label.nullable(),
  model_version: label.nullable(),
  adapter_version: label.nullable(),
  provider_config_id: identity.nullable(),
  config_version: label.nullable(),
  configuration_sha256: digest.nullable(),
  descriptor_snapshot: descriptor,
  policy_admission: admission,
  policy_admission_sha256: digest,
  task_publication_fence: revision,
  sync_operation_id: label,
  usage_correlation_id: identity.nullable(),
  fallback_chain_id: identity,
  shadow: z.boolean(),
  shadow_of_attempt_id: identity.nullable(),
  created_at: timestamp,
  creation_clock: z.enum(["CALLER_OBSERVED", "DEVICE_WALL", "SERVER_OBSERVED"]),
  row_revision: revision,
  execution_observation: z.enum(["NOT_STARTED", "RUNNING", "TERMINAL", "UNKNOWN"]),
  execution_outcome: z.enum(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELED"]).nullable(),
  result_install_disposition: z.enum([
    "NONE",
    "PENDING",
    "INSTALLED",
    "REJECTED_STALE",
    "REJECTED_CANCELED",
    "FAILED",
    "SHADOW_ONLY",
  ]),
  metering_disposition: z.enum([
    "NOT_REQUIRED",
    "START_PENDING",
    "START_DURABLE",
    "COMPLETION_PENDING",
    "COMPLETE",
    "UNKNOWN",
  ]),
  safe_failure_code: label.nullable(),
  response_material_reference: identity.nullable(),
  response_material_sha256: digest.nullable(),
  response_sha256: digest.nullable(),
  publication_sha256: digest.nullable(),
  started_at: timestamp.nullable(),
  ended_at: timestamp.nullable(),
  latency_ms: count.nullable(),
  reported_usage_summary: usage.nullable(),
  updated_at: timestamp,
  update_clock: z.enum(["CALLER_OBSERVED", "DEVICE_WALL", "SERVER_OBSERVED"]),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const attemptJsonColumns = [
  "descriptor_snapshot",
  "policy_admission",
  "reported_usage_summary",
] as const;
export const attemptMutableColumns = [
  "row_revision",
  "execution_observation",
  "execution_outcome",
  "result_install_disposition",
  "metering_disposition",
  "safe_failure_code",
  "response_material_reference",
  "response_material_sha256",
  "response_sha256",
  "publication_sha256",
  "started_at",
  "ended_at",
  "latency_ms",
  "reported_usage_summary",
  "updated_at",
  "update_clock",
] as const;
