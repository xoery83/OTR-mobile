import { createHash } from "node:crypto";
import { z } from "zod";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import type { UniversalV3Manifest } from "../../src/data/api/universalV3Contracts";
import { intelligenceWakeIdentity } from "../../src/data/sync/syncOperationRepository";
import { canonicalEventJson } from "../../src/domain/trip/eventIntentJson";
import { attemptSchema, taskSchema } from "../../src/domain/intelligence/persistence";
import { persistenceDigest } from "./externalIntegrationPersistence";
import { universalBatchIdentity } from "./universalBatchSource";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { universalV3IntakePins, universalV3TaskId } from "./universalV3Intake";
import { bindUniversalV3ModelTask, universalV3Profile } from "./universalV3Profile";
import type { UniversalProvider } from "./universalImport";

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export async function buildUniversalV3TaskDraft(
  scope: { accountId: string; analysisId: string },
  manifest: UniversalV3Manifest,
  sources: Parameters<UniversalProvider["interpret"]>[0]["sources"],
  rawSelection: z.infer<typeof universalContinuousSelectionSchema>,
  acceptedAt: string,
) {
  const { accountId, analysisId } = scope;
  const { tripId } = manifest;
  const selection = universalContinuousSelectionSchema.parse(rawSelection);
  const createdAt = z.iso.datetime().parse(acceptedAt);
  const id = (purpose: string) =>
    universalBatchIdentity(accountId, tripId, analysisId, "local-first/" + purpose);
  if (manifest.files.length !== sources.length)
    throw Error("UNIVERSAL_V3_MATERIAL_COUNT");
  const providerInput: Parameters<UniversalProvider["interpret"]>[0] = {
    actorId: accountId,
    accountId,
    batchId: analysisId,
    tripId,
    taskId: universalV3TaskId({ ...scope, tripId }),
    promptVersion: COMPACT_PROMPT_VERSION,
    instruction: universalInstruction,
    advisoryInstruction: universalAdvisoryInstruction,
    sources,
  };
  const request = buildUniversalDeepSeekRequest(providerInput, "local-first");
  const inputPins = universalV3IntakePins(manifest);
  const manifestSha = sha(canonicalEventJson(manifest));
  const policy = {
    version: 1,
    privacy: "REMOTE_ALLOWED",
    network_required: true,
    region: selection.region,
    budget_currency: "USD",
    budget_nanos: selection.maxCostNanos,
    route: selection.route,
    max_attempts: 1,
    deadline: new Date(
      Date.parse(createdAt) + Math.min(60 * 60_000, selection.taskLifetimeMs),
    ).toISOString(),
  };
  const task = taskSchema.parse({
    account_id: accountId,
    task_id: providerInput.taskId,
    format_version: 1,
    import_id: analysisId,
    manifest_version: 1,
    manifest_sha256: manifestSha,
    trip_id: tripId,
    stage: "INTERPRETATION",
    logical_request_id: id("logical-request"),
    logical_idempotency_key: id("logical-idempotency"),
    input_pins: inputPins,
    input_sha256: persistenceDigest(inputPins),
    consumer_id: universalV3Profile.consumer_id,
    schema_id: universalV3Profile.execution_scope,
    schema_dialect: "OTR_TYPED_V1",
    consumer_version: universalV3Profile.consumer_version,
    schema_version: 1,
    schema_sha256: universalV3Profile.output_schema_sha256,
    capability_requirements: ["EXTRACT"],
    policy_snapshot: policy,
    policy_sha256: persistenceDigest(policy),
    run_id: null,
    expected_run_generation: null,
    candidate_id: null,
    expected_candidate_sha256: null,
    event_id: null,
    expected_event_revision: null,
    created_at: createdAt,
    creation_clock: "SERVER_OBSERVED",
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
    update_clock: "SERVER_OBSERVED",
    completed_at: null,
  });
  const wakeId = await intelligenceWakeIdentity(
    {
      version: 1,
      account_id: accountId,
      task_id: task.task_id,
      expected_publication_fence: 1,
      wake_reason: "REEVALUATE",
    },
    async (bytes) => sha(bytes),
  );
  const marker = Buffer.from(
    canonicalEventJson({
      manifestSha,
      requestSha: request.requestSha256,
      materials: sources.map(({ index, sha256 }) => ({ index, sha256 })),
    }),
  );
  const binding = bindUniversalV3ModelTask({
    contract_version: "otr-model-task-v1",
    task_id: task.task_id,
    logical_request_id: task.logical_request_id,
    logical_idempotency_key: task.logical_idempotency_key,
    consumer_id: task.consumer_id,
    consumer_version: task.consumer_version,
    input: {
      reference: id("request-material"),
      sha256: sha(marker),
      byte_count: marker.length,
    },
    schema: {
      id: task.schema_id,
      version: task.schema_version,
      dialect: task.schema_dialect,
      sha256: task.schema_sha256,
    },
    policy_snapshot: task.policy_snapshot,
    policy_sha256: task.policy_sha256,
  });
  const policyAdmission = {
    version: 1,
    policy_sha256: task.policy_sha256,
    allowed: true,
  };
  const attempt = attemptSchema.parse({
    account_id: accountId,
    attempt_id: id("attempt"),
    task_id: task.task_id,
    attempt_sequence: 1,
    format_version: 1,
    request_id: id("request"),
    idempotency_key: id("idempotency"),
    request_sha256: request.requestSha256,
    request_material_reference: binding.request.input.reference,
    request_material_sha256: binding.request.input.sha256,
    predecessor_attempt_id: null,
    predecessor_request_id: null,
    integration_id: selection.integrationId,
    provider_id: selection.providerId,
    model_id: selection.modelId,
    model_version: selection.modelVersion,
    adapter_version: selection.adapterVersion,
    provider_config_id: selection.providerConfigId,
    config_version: String(selection.configVersion),
    configuration_sha256: selection.configurationSha256,
    descriptor_snapshot: {
      version: 1,
      provider_class: "COMMERCIAL_REMOTE",
      replay_support: "UNSUPPORTED",
      capabilities: ["EXTRACT"],
      modalities: [...new Set(sources.map(({ modality }) => modality))],
      network_required: true,
    },
    policy_admission: policyAdmission,
    policy_admission_sha256: persistenceDigest(policyAdmission),
    task_publication_fence: 1,
    sync_operation_id: wakeId,
    usage_correlation_id: id("call"),
    fallback_chain_id: id("fallback"),
    shadow: false,
    shadow_of_attempt_id: null,
    created_at: createdAt,
    creation_clock: "SERVER_OBSERVED",
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
    update_clock: "SERVER_OBSERVED",
  });
  return {
    task,
    attempt,
    wakeId,
    providerInput,
    requestSha256: request.requestSha256,
    marker,
    binding,
  };
}
