// Operator-only deterministic proposal. No Auth, SQL, Source proof, Task write or Provider call.
import { createHash } from "node:crypto";
import { z } from "zod";
import { taskSchema, attemptSchema } from "../../src/domain/intelligence/persistence";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { intelligenceWakeIdentity } from "../../src/data/sync/syncOperationRepository";
import { persistenceDigest } from "./externalIntegrationPersistence";
import { prepareUniversalDispatch, UNIVERSAL_IMPORT_VERSION } from "./universalImport";
import {
  registeredUniversalModelProfile,
  bindUniversalModelTask,
} from "./universalModelProfile";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
const uuid = z.uuid(),
  digest = z.string().regex(/^[a-f0-9]{64}$/),
  label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const pin = z.strictObject({
  profile: z.enum(["OTR_UTF8_TEXT_FILE_V1", "OTR_SUBMITTED_TEXT_V1"]),
  actorId: uuid,
  tripId: uuid,
  sourceId: uuid,
  representationId: uuid,
  operationId: uuid,
  operationKey: label,
  operationSha256: digest,
});
export const universalNativePinReceiptSchema = z.object({
  version: z.literal("otr.native.universal-pin-proposal/1"),
  qualification: z.literal("LOCAL_C3_AND_EXISTING_COMMANDS_ONLY_NOT_SOURCE_PROOF"),
  accountId: uuid,
  tripId: uuid,
  batchId: uuid,
  jobId: uuid,
  submissionSha256: digest,
  inputs: z
    .array(
      z.object({
        inputId: uuid,
        ordinal: z.number().int().min(0),
        kind: z.enum(["FILE", "TEXT"]),
        acquisitionSource: z.enum(["files", "magic_input"]),
        originalFilename: z.string().nullable(),
        byteCount: z.number().int().positive(),
        sha256: digest,
        bindingId: uuid,
        sourceState: z.literal("PREPARED"),
        queueOperationId: uuid,
        sourceCommandPin: pin,
      }),
    )
    .length(3),
});
export const universalOperatorIdentitiesSchema = z.strictObject({
  taskId: uuid,
  runId: uuid,
  attemptId: uuid,
  callId: uuid,
  logicalRequestId: uuid,
  logicalIdempotencyKey: uuid,
  requestId: uuid,
  idempotencyKey: uuid,
  requestMaterialReference: uuid,
  fallbackChainId: uuid,
  runInputIds: z.array(uuid).length(3),
});
export const universalExecutionFactsSchema = z.strictObject({
  integrationId: label,
  configVersion: z.literal(2),
  configurationSha256: digest,
  providerConfigId: uuid,
  priceScheduleId: uuid,
  providerId: z.literal("DeepSeek"),
  modelId: z.literal("deepseek-flash"),
  modelVersion: z.literal("DeepSeek-V4.1-Flash"),
  adapterVersion: label,
  region: label,
  route: label,
  startsAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export async function buildUniversalExecutionProposal(
  rawReceipt: unknown,
  rawIds: unknown,
  rawFacts: unknown,
  originals: ReadonlyMap<string, Buffer>,
) {
  const r = universalNativePinReceiptSchema.parse(rawReceipt),
    ids = universalOperatorIdentitiesSchema.parse(rawIds),
    f = universalExecutionFactsSchema.parse(rawFacts);
  if (
    Date.parse(f.expiresAt) <= Date.parse(f.startsAt) ||
    Date.parse(f.expiresAt) - Date.parse(f.startsAt) > 600000
  )
    throw Error("FINITE_INNER_WINDOW_REQUIRED");
  const values = [
    ...Object.values(ids).filter((v): v is string => typeof v === "string"),
    ...ids.runInputIds,
  ];
  if (new Set(values).size !== values.length) throw Error("PROPOSED_IDENTITY_REUSED");
  const seen = new Set<string>();
  const representations = r.inputs.map((i, n) => {
    const p = i.sourceCommandPin,
      b = originals.get(i.inputId);
    if (
      i.ordinal !== n ||
      p.actorId !== r.accountId ||
      p.tripId !== r.tripId ||
      !b ||
      b.length !== i.byteCount ||
      hash(b) !== i.sha256 ||
      !Buffer.from(b.toString("utf8")).equals(b) ||
      b.includes(0) ||
      seen.has(p.sourceId) ||
      seen.has(p.representationId)
    )
      throw Error("ACTUAL_SOURCE_INPUT_BINDING_CHANGED");
    if (
      (i.kind === "FILE") !== (p.profile === "OTR_UTF8_TEXT_FILE_V1") ||
      (i.kind === "FILE") !== (i.acquisitionSource === "files") ||
      (i.kind === "TEXT" && i.originalFilename !== null)
    )
      throw Error("SOURCE_PROFILE_CHANGED");
    seen.add(p.sourceId);
    seen.add(p.representationId);
    return {
      accountId: r.accountId,
      tripId: r.tripId,
      batchId: r.batchId,
      inputId: ids.runInputIds[n],
      sourceId: p.sourceId,
      representationId: p.representationId,
      revision: 1,
      originalSha256: i.sha256,
      mime: "text/plain",
      bytes: b,
    };
  });
  if (originals.size !== 3) throw Error("EXACT_THREE_ORIGINALS_REQUIRED");
  const inputPins = representations.map((x) => ({
    kind: "SOURCE" as const,
    source_id: x.sourceId,
    material_revision: 1,
    representation_id: x.representationId,
    payload_sha256: x.originalSha256,
    byte_count: x.bytes.length,
    input_id: x.inputId,
    transform_sha256: null,
  }));
  const runInputs = representations.map((x) => ({
    id: x.inputId,
    source_id: x.sourceId,
    material_revision: 1,
    representation_id: x.representationId,
    payload_sha256: x.originalSha256,
    byte_count: x.bytes.length,
    observed_source_row_revision: 1,
    historical_selection: false,
  }));
  // Expected descriptor of these two approved original UTF8 profiles only. Existing
  // SQL independently recomputes this from retained representations before Run begin.
  const descriptors = [...runInputs]
    .sort((a, b) => (a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0))
    .map((i) => [
      i.id,
      i.source_id,
      i.material_revision,
      i.representation_id,
      i.payload_sha256,
      i.byte_count,
      i.observed_source_row_revision,
      i.historical_selection,
      1,
      "ORIGINAL",
      "TEXT",
      null,
      null,
      null,
      [],
    ]);
  const proposedRunInputSha256 = await importDigest(
    "otr-source-run-input-v1",
    [1, descriptors],
    async (b) => hash(b),
  );
  const policy = {
    version: 1 as const,
    privacy: "REMOTE_ALLOWED" as const,
    network_required: true,
    region: f.region,
    budget_currency: "USD",
    budget_nanos: "1000000000",
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
    expected_run_generation: 1,
    candidate_id: null,
    expected_candidate_sha256: null,
    event_id: null,
    expected_event_revision: null,
    created_at: f.startsAt,
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
    updated_at: f.startsAt,
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
  if (dispatch.ready.length !== 3) throw Error("ORIGINAL_PREFLIGHT_NOT_READY");
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
    created_at: f.startsAt,
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
    updated_at: f.startsAt,
    update_clock: "CALLER_OBSERVED",
  });
  const modelBinding = bindUniversalModelTask({
    contract_version: "otr-model-task-v1",
    task_id: ids.taskId,
    logical_request_id: ids.logicalRequestId,
    logical_idempotency_key: ids.logicalIdempotencyKey,
    consumer_id: "import",
    consumer_version: 1,
    input: {
      reference: ids.requestMaterialReference,
      sha256: hash(material),
      byte_count: material.length,
    },
    schema: {
      id: "UNIVERSAL_IMPORT_V1",
      version: 1,
      dialect: "OTR_TYPED_V1",
      sha256: registeredUniversalModelProfile.output_schema_sha256,
    },
    policy_snapshot: policy,
    policy_sha256: task.policy_sha256,
  });
  const providerRequest = buildUniversalDeepSeekRequest({
    taskId: ids.taskId,
    actorId: r.accountId,
    accountId: r.accountId,
    tripId: r.tripId,
    batchId: r.batchId,
    promptVersion: COMPACT_PROMPT_VERSION,
    instruction: universalInstruction,
    advisoryInstruction: universalAdvisoryInstruction,
    sources: dispatch.ready.map((p, index) => ({
      index,
      sourceId: p.sourceId,
      mime: p.mime,
      modality: p.modality as "TEXT",
      sha256: p.submittedSha256,
      bytes: p.bytes,
    })),
  });
  const scope = {
    singleton: true,
    actor_id: r.accountId,
    trip_id: r.tripId,
    batch_id: r.batchId,
    task_id: ids.taskId,
    starts_at: f.startsAt,
    expires_at: f.expiresAt,
  };
  return {
    qualification: "PROPOSED_OPERATOR_PINS_NOT_SOURCE_PROOF_OR_TASK_RECEIPT" as const,
    task,
    attempt,
    sourceScope: {
      ...scope,
      run_id: ids.runId,
      submission_sha256: r.submissionSha256,
      input_sha256: proposedRunInputSha256,
      source_command_pins: r.inputs.map((i) => i.sourceCommandPin),
    },
    providerScope: {
      ...scope,
      attempt_id: ids.attemptId,
      call_id: ids.callId,
      integration_id: f.integrationId,
      provider_config_id: f.providerConfigId,
      price_schedule_id: f.priceScheduleId,
      request_sha256: dispatch.requestSha256,
      provider_request_sha256: providerRequest.requestSha256,
      input_sha256: task.input_sha256,
      model_binding: modelBinding,
      input_ceiling: 36864,
      output_ceiling: 4096,
      max_cost_nanos: 1000000000,
    },
    runInputProposal: runInputs,
    sourceProofRequired: true,
    taskReceiptRequired: true,
    runtimePublic: {
      version: 1,
      environment: "DEV",
      project: "tuqigdxrvrerfewsxqgm",
      startsAt: f.startsAt,
      expiresAt: f.expiresAt,
      actorId: r.accountId,
      task,
      attempt,
      directory: "/var/lib/otr/universal-custody",
      taskDatabase: "/var/lib/otr/universal-custody/continuations.db",
    },
    requestMaterialByteCount: material.length,
    providerRequestByteCount: Buffer.byteLength(providerRequest.body),
    profile: registeredUniversalModelProfile,
  };
}
