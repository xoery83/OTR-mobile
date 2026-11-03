import {
  modelTaskRequestSchema,
  type ModelTaskRequest,
} from "../../../src/domain/intelligence/modelTask";
import { persistenceDigest } from "../externalIntegrationPersistence";
import {
  registeredFlightEnrichmentProfile as profile,
  flightEnrichmentProfileSha256,
} from "./registeredProfile";
import upstream from "./UPSTREAM.json";

export const enrichmentOutputSchemaDescriptor = Object.freeze({
  id: "FLIGHT_ENRICHMENT_PROPOSAL_V1",
  version: 1,
  dialect: "OTR_PINNED_ZOD_V1",
  package_sha256: profile.package_sha256,
  source_sha256: upstream.contractsSourceSha256,
  symbol: "proposalSchema",
});
export const enrichmentOutputSchemaSha256 = persistenceDigest(
  enrichmentOutputSchemaDescriptor,
);

// Common technical admission binding only; these server-correlated UUIDs confer no Import/Core authority.
export function bindFlightEnrichmentModelTask(input: {
  logicalRequestId: string;
  material: ModelTaskRequest["input"];
  policy: ModelTaskRequest["policy_snapshot"];
}) {
  const request = modelTaskRequestSchema.parse({
    contract_version: "otr-model-task-v1",
    task_id: input.logicalRequestId,
    logical_request_id: input.logicalRequestId,
    logical_idempotency_key: input.logicalRequestId,
    consumer_id: profile.consumer_id,
    consumer_version: profile.version,
    input: input.material,
    schema: {
      id: enrichmentOutputSchemaDescriptor.id,
      version: 1,
      dialect: enrichmentOutputSchemaDescriptor.dialect,
      sha256: enrichmentOutputSchemaSha256,
    },
    policy_snapshot: input.policy,
    policy_sha256: persistenceDigest(input.policy),
  });
  const policy = request.policy_snapshot;
  if (
    request.input.byte_count > profile.max_request_bytes ||
    policy.privacy !== "REMOTE_ALLOWED" ||
    !policy.network_required ||
    policy.max_attempts !== 1 ||
    policy.budget_currency !== "USD" ||
    policy.budget_nanos === null ||
    BigInt(policy.budget_nanos) <= 0n ||
    BigInt(policy.budget_nanos) > BigInt(profile.target_nanos) ||
    policy.deadline === null
  )
    throw Error("ENRICHMENT_MODEL_POLICY");
  return {
    version: 1,
    request,
    request_sha256: persistenceDigest(request),
    profile,
    profile_sha256: flightEnrichmentProfileSha256,
  };
}
