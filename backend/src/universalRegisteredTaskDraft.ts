import { createHash } from "node:crypto";
import { z } from "zod";
import { taskSchema, attemptSchema } from "../../src/domain/intelligence/persistence";
import { intelligenceWakeIdentity } from "../../src/data/sync/syncOperationRepository";
import { persistenceDigest } from "./externalIntegrationPersistence";
import {
  prepareUniversalDispatch,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalManifest,
} from "./universalImport";
import { registeredUniversalModelProfile } from "./universalModelProfile";
import { universalBatchIdentity, type UniversalRunBinding } from "./universalBatchSource";
const label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
// This is an owning configuration read result. HTTP caller JSON cannot select a provider.
export const universalContinuousSelectionSchema = z.strictObject({
  integrationId: label,
  configVersion: z.number().int().safe().min(2),
  configurationSha256: z.string().regex(/^[a-f0-9]{64}$/),
  providerConfigId: z.uuid(),
  priceScheduleId: z.uuid(),
  providerId: z.literal("DeepSeek"),
  modelId: z.literal("deepseek-flash"),
  modelVersion: z.literal("DeepSeek-V4.1-Flash"),
  adapterVersion: label,
  region: label,
  route: label,
  maxCostNanos: z
    .string()
    .regex(/^[1-9][0-9]{0,9}$/)
    .refine((v) => BigInt(v) <= 1000000000n),
  taskLifetimeMs: z.number().int().min(60000).max(86400000),
});
export async function buildUniversalRegisteredTaskDraft(
  binding: UniversalRunBinding,
  manifest: UniversalManifest,
  rawSelection: z.infer<typeof universalContinuousSelectionSchema>,
) {
  const selection = universalContinuousSelectionSchema.parse(rawSelection);
  if (
    manifest.accountId !== binding.actorId ||
    manifest.tripId !== binding.tripId ||
    manifest.batchId !== binding.batchId ||
    manifest.representations.length !== binding.inputs.length
  )
    throw Error("UNIVERSAL_TASK_SOURCE_BINDING");
  for (const i of binding.inputs) {
    const rep = manifest.representations.find((r) => r.inputId === i.id);
    if (
      !rep ||
      rep.sourceId !== i.source_id ||
      rep.representationId !== i.representation_id ||
      rep.revision !== i.material_revision ||
      rep.originalSha256 !== i.payload_sha256 ||
      rep.bytes.length !== i.byte_count ||
      hash(rep.bytes) !== i.payload_sha256
    )
      throw Error("UNIVERSAL_TASK_SOURCE_BINDING");
  }
  // Owning PostgreSQL timestamps carry offsets; Task timestamps use UTC Z.
  // Preserve the original fractional precision when normalizing the same instant.
  const observedAt = z.iso.datetime({ offset: true }).parse(binding.createdAt),
    fraction = observedAt.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1],
    utc = new Date(observedAt).toISOString(),
    createdAt = fraction ? utc.replace(/\.\d{3}Z$/, `.${fraction}Z`) : utc;
  const r = {
    submissionSha256: binding.submissionSha256,
    accountId: binding.actorId,
    tripId: binding.tripId,
    batchId: binding.batchId,
  };
  const ids = Object.fromEntries(
    [
      "attemptId",
      "callId",
      "logicalRequestId",
      "logicalIdempotencyKey",
      "requestId",
      "idempotencyKey",
      "requestMaterialReference",
      "fallbackChainId",
    ].map((k) => [
      k,
      universalBatchIdentity(binding.actorId, binding.tripId, binding.batchId, k),
    ]),
  ) as Record<string, string>;
  ids.taskId = binding.taskId;
  ids.runId = binding.runId;
  const expiresAt = new Date(
    Date.parse(binding.createdAt) + selection.taskLifetimeMs,
  ).toISOString();
  const f = { ...selection, startsAt: createdAt, expiresAt };
  const representations = manifest.representations;
  const inputPins = binding.inputs.map((p) => ({
    kind: "SOURCE" as const,
    source_id: p.source_id,
    material_revision: p.material_revision,
    representation_id: p.representation_id,
    payload_sha256: p.payload_sha256,
    byte_count: p.byte_count,
    input_id: p.id,
    transform_sha256:
      representations.find((r) => r.inputId === p.id)?.pdfSource
        ?.transformOptionsSha256 ?? null,
  }));
  const policy = {
    version: 1 as const,
    privacy: "REMOTE_ALLOWED" as const,
    network_required: true,
    region: f.region,
    budget_currency: "USD",
    budget_nanos: f.maxCostNanos,
    route: f.route,
    max_attempts: 1,
    deadline: f.expiresAt,
  };
  const task = taskSchema.parse({
    account_id: r.accountId,
    task_id: ids.taskId,
    format_version: 1,
    import_id: r.batchId,
    manifest_version: 1,
    manifest_sha256: r.submissionSha256,
    trip_id: r.tripId,
    stage: "INTERPRETATION",
    logical_request_id: ids.logicalRequestId,
    logical_idempotency_key: ids.logicalIdempotencyKey,
    input_pins: inputPins,
    input_sha256: persistenceDigest(inputPins),
    consumer_id: "import",
    schema_id: "UNIVERSAL_IMPORT_V1",
    schema_dialect: "OTR_TYPED_V1",
    consumer_version: 1,
    schema_version: 1,
    schema_sha256: registeredUniversalModelProfile.output_schema_sha256,
    capability_requirements: ["EXTRACT"],
    policy_snapshot: policy,
    policy_sha256: persistenceDigest(policy),
    run_id: ids.runId,
    expected_run_generation: binding.generation,
    candidate_id: null,
    expected_candidate_sha256: null,
    event_id: null,
    expected_event_revision: null,
    created_at: createdAt,
    creation_clock: "CALLER_OBSERVED",
    row_revision: 1,
    publication_fence: 1,
    current_pass_complete: false,
    work_disposition: "PENDING",
    wait_reason: null,
    wait_reasons: [],
    sync_operation_id: null,
    dependencies: [],
    current_attempt_id: null,
    cancellation_disposition: "NONE",
    safe_reason: null,
    publication_id: null,
    publication_sha256: null,
    result_sha256: null,
    updated_at: createdAt,
    update_clock: "CALLER_OBSERVED",
    completed_at: null,
  });
  const wake = await intelligenceWakeIdentity(
    {
      version: 1,
      account_id: r.accountId,
      task_id: ids.taskId,
      expected_publication_fence: 1,
      wake_reason: "REEVALUATE",
    },
    async (b) => hash(b),
  );
  const dispatch = prepareUniversalDispatch(
    r.accountId,
    r.batchId,
    { version: UNIVERSAL_IMPORT_VERSION, tripId: r.tripId, taskId: ids.taskId },
    { accountId: r.accountId, tripId: r.tripId, batchId: r.batchId, representations },
  );
  if (!dispatch.ready.length) throw Error("ORIGINAL_PREFLIGHT_NOT_READY");
  const material = Buffer.from(JSON.stringify(dispatch.dispatchMarker));
  const admission = {
    version: 1 as const,
    policy_sha256: task.policy_sha256,
    allowed: true,
  };
  const attempt = attemptSchema.parse({
    account_id: r.accountId,
    attempt_id: ids.attemptId,
    task_id: ids.taskId,
    attempt_sequence: 1,
    format_version: 1,
    request_id: ids.requestId,
    idempotency_key: ids.idempotencyKey,
    request_sha256: dispatch.requestSha256,
    request_material_reference: ids.requestMaterialReference,
    request_material_sha256: hash(material),
    predecessor_attempt_id: null,
    predecessor_request_id: null,
    integration_id: f.integrationId,
    provider_id: f.providerId,
    model_id: f.modelId,
    model_version: f.modelVersion,
    adapter_version: f.adapterVersion,
    provider_config_id: f.providerConfigId,
    config_version: String(f.configVersion),
    configuration_sha256: f.configurationSha256,
    descriptor_snapshot: {
      version: 1,
      provider_class: "COMMERCIAL_REMOTE",
      replay_support: "UNSUPPORTED",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      network_required: true,
    },
    policy_admission: admission,
    policy_admission_sha256: persistenceDigest(admission),
    task_publication_fence: 1,
    sync_operation_id: wake,
    usage_correlation_id: ids.callId,
    fallback_chain_id: ids.fallbackChainId,
    shadow: false,
    shadow_of_attempt_id: null,
    created_at: createdAt,
    creation_clock: "CALLER_OBSERVED",
    row_revision: 1,
    execution_observation: "NOT_STARTED",
    execution_outcome: null,
    result_install_disposition: "NONE",
    metering_disposition: "START_PENDING",
    safe_failure_code: null,
    response_material_reference: null,
    response_material_sha256: null,
    response_sha256: null,
    publication_sha256: null,
    started_at: null,
    ended_at: null,
    latency_ms: null,
    reported_usage_summary: null,
    updated_at: createdAt,
    update_clock: "CALLER_OBSERVED",
  });
  return { task, attempt, marker: material, selection };
}
