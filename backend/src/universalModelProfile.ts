import { createHash } from "node:crypto";
import { z } from "zod";
import {
  modelTaskRequestSchema,
  type ModelTaskRequest,
} from "../../src/domain/intelligence/modelTask";
import {
  compactSchema,
  COMPACT_PROMPT_VERSION,
} from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import { persistenceDigest } from "./externalIntegrationPersistence";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { UNIVERSAL_IMPORT_VERSION, UNIVERSAL_IMPORT_SCHEMA_ID } from "./universalImport";

const textHash = (text: string) => createHash("sha256").update(text).digest("hex");
// Separate profile: no Flight-only capability or authorization is inherited.
// Registration in existing Model Task SQL is a reviewed deployment prerequisite.
export const registeredUniversalModelProfile = Object.freeze({
  version: 1,
  consumer_id: "import",
  consumer_version: 1,
  boundary_version: UNIVERSAL_IMPORT_VERSION,
  capability: "EXTRACT",
  modalities: "TEXT,IMAGE",
  execution_scope: "UNIVERSAL_IMPORT_V1",
  prompt_version: COMPACT_PROMPT_VERSION,
  prompt_sha256: textHash(universalInstruction + "\n" + universalAdvisoryInstruction),
  output_schema_version: "otr-universal-advisory/1",
  output_schema_sha256: persistenceDigest({
    compact: z.toJSONSchema(compactSchema),
    advisory_instruction: universalAdvisoryInstruction,
  }),
  privacy_profile: "REMOTE_ALLOWED_SOURCE_EVIDENCE_V1",
  max_images: 1,
  max_text_bytes: 32768,
  max_output_tokens: 4096,
});

export function bindUniversalModelTask(raw: ModelTaskRequest) {
  const request = modelTaskRequestSchema.parse(structuredClone(raw));
  const p = request.policy_snapshot;
  if (
    request.consumer_id !== "import" ||
    request.consumer_version !== 1 ||
    request.schema.id !== UNIVERSAL_IMPORT_SCHEMA_ID ||
    request.schema.version !== 1 ||
    request.schema.dialect !== "OTR_TYPED_V1" ||
    request.schema.sha256 !== registeredUniversalModelProfile.output_schema_sha256 ||
    request.policy_sha256 !== persistenceDigest(p) ||
    p.privacy !== "REMOTE_ALLOWED" ||
    !p.network_required ||
    p.max_attempts !== 1 ||
    p.budget_currency !== "USD" ||
    !p.budget_nanos ||
    BigInt(p.budget_nanos) <= 0n ||
    !p.deadline
  )
    throw new Error("UNIVERSAL_MODEL_TASK_BINDING_INVALID");
  return Object.freeze({
    version: 1 as const,
    request,
    request_sha256: persistenceDigest(request),
    profile: registeredUniversalModelProfile,
    profile_sha256: persistenceDigest(registeredUniversalModelProfile),
  });
}
