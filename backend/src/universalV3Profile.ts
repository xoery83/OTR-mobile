import { createHash } from "node:crypto";
import { z } from "zod";
import {
  modelTaskRequestSchema,
  type ModelTaskRequest,
} from "../../src/domain/intelligence/modelTask";
import { persistenceDigest } from "./externalIntegrationPersistence";
import { universalLocalFirstInstruction } from "./universalProviderRequest";
import { universalV3OutputSchema } from "./universalV3Materials";

export const universalV3Profile = Object.freeze({
  version: 1,
  consumer_id: "import",
  consumer_version: 3,
  boundary_version: "otr.import.local-first/1",
  capability: "EXTRACT",
  modalities: "TEXT,IMAGE",
  execution_scope: "UNIVERSAL_IMPORT_LOCAL_FIRST_V3",
  prompt_sha256: createHash("sha256")
    .update(universalLocalFirstInstruction)
    .digest("hex"),
  output_schema_sha256: persistenceDigest(z.toJSONSchema(universalV3OutputSchema)),
  max_images: 5,
  max_text_bytes: 32768,
  max_output_tokens: 4096,
});

export function bindUniversalV3ModelTask(raw: ModelTaskRequest) {
  const request = modelTaskRequestSchema.parse(structuredClone(raw));
  const p = request.policy_snapshot;
  if (
    request.consumer_id !== universalV3Profile.consumer_id ||
    request.consumer_version !== universalV3Profile.consumer_version ||
    request.schema.id !== universalV3Profile.execution_scope ||
    request.schema.dialect !== "OTR_TYPED_V1" ||
    request.schema.version !== 1 ||
    request.schema.sha256 !== universalV3Profile.output_schema_sha256 ||
    request.policy_sha256 !== persistenceDigest(p) ||
    p.privacy !== "REMOTE_ALLOWED" ||
    !p.network_required ||
    p.max_attempts !== 1 ||
    p.budget_currency !== "USD" ||
    !p.budget_nanos ||
    BigInt(p.budget_nanos) <= 0n ||
    !p.deadline
  )
    throw Error("UNIVERSAL_V3_MODEL_TASK_BINDING_INVALID");
  return {
    version: 1 as const,
    request,
    request_sha256: persistenceDigest(request),
    profile: universalV3Profile,
    profile_sha256: persistenceDigest(universalV3Profile),
  };
}
