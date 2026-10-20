import { createHash } from "node:crypto";
import { z } from "zod";
import { persistenceDigest } from "./externalIntegrationPersistence";
import {
  FLIGHT_REMOTE_PROMPT,
  FLIGHT_REMOTE_MINIMIZER,
  FLIGHT_REMOTE_PRIVACY,
} from "../../src/domain/intelligence/remoteFlightText";
import {
  modelTaskRequestSchema,
  type ModelTaskRequest,
} from "../../src/domain/intelligence/modelTask";
import { taskSchema, type Task } from "../../src/domain/intelligence/persistence";
const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
export const registeredFlightModelProfile = Object.freeze({
  version: 1,
  consumer_id: "import",
  consumer_version: 1,
  boundary_version: "otr-flight-remote-v2",
  capability: "EXTRACT",
  modality: "TEXT",
  execution_scope: "FLIGHT_IMPORT_V1",
  prompt_sha256: hashText(FLIGHT_REMOTE_PROMPT),
  envelope_version: "FLIGHT_REMOTE_TEXT_V1",
  envelope_sha256: hashText("FLIGHT_REMOTE_TEXT_V1"),
  output_schema_version: "FLIGHT_REMOTE_OUTPUT_V1",
  output_schema_sha256: persistenceDigest({
    version: "FLIGHT_REMOTE_OUTPUT_V1",
    items: "bounded groups of span/path/OBSERVED",
  }),
  minimizer_version: FLIGHT_REMOTE_MINIMIZER,
  minimizer_sha256: hashText(FLIGHT_REMOTE_MINIMIZER),
  privacy_profile: FLIGHT_REMOTE_PRIVACY,
  privacy_sha256: hashText(FLIGHT_REMOTE_PRIVACY),
});
export const modelTaskBindingSchema = z
  .strictObject({
    version: z.literal(1),
    request: modelTaskRequestSchema,
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    profile: z.record(z.string(), z.union([z.string(), z.number()])),
    profile_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((b, ctx) => {
    const q = b.request,
      p = q.policy_snapshot;
    if (
      persistenceDigest(b.profile) !== persistenceDigest(registeredFlightModelProfile) ||
      b.profile_sha256 !== persistenceDigest(registeredFlightModelProfile) ||
      b.request_sha256 !== persistenceDigest(q) ||
      q.policy_sha256 !== persistenceDigest(p) ||
      q.consumer_id !== "import" ||
      q.consumer_version !== 1 ||
      persistenceDigest(q.schema) !==
        persistenceDigest({
          id: "FLIGHT_REMOTE_OUTPUT_V1",
          version: 1,
          dialect: "OTR_TYPED_V1",
          sha256: registeredFlightModelProfile.output_schema_sha256,
        }) ||
      p.max_attempts !== 1 ||
      p.privacy !== "REMOTE_ALLOWED" ||
      !p.network_required ||
      !p.budget_currency ||
      !p.budget_nanos ||
      !/^[0-9]{1,60}$/.test(p.budget_nanos) ||
      BigInt(p.budget_nanos) <= 0n ||
      !p.deadline ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/.test(
        p.deadline,
      )
    )
      ctx.addIssue({ code: "custom", message: "MODEL_TASK_CHANGED_BINDING" });
  });
export type ModelTaskBinding = z.infer<typeof modelTaskBindingSchema>;
export function bindModelTask(raw: ModelTaskRequest): ModelTaskBinding {
  const request = modelTaskRequestSchema.parse(structuredClone(raw));
  return modelTaskBindingSchema.parse({
    version: 1,
    request,
    request_sha256: persistenceDigest(request),
    profile: registeredFlightModelProfile,
    profile_sha256: persistenceDigest(registeredFlightModelProfile),
  });
}
// The owning continuation persists logical identity; the prepared-package digest is separate.
export function projectModelTaskRequest(
  raw: Task,
  input: ModelTaskRequest["input"],
): ModelTaskRequest {
  const t = taskSchema.parse(raw);
  return bindModelTask({
    contract_version: "otr-model-task-v1",
    task_id: t.task_id,
    logical_request_id: t.logical_request_id,
    logical_idempotency_key: t.logical_idempotency_key,
    consumer_id: t.consumer_id,
    consumer_version: t.consumer_version,
    input,
    schema: {
      id: "FLIGHT_REMOTE_OUTPUT_V1",
      version: 1,
      dialect: "OTR_TYPED_V1",
      sha256: registeredFlightModelProfile.output_schema_sha256,
    },
    policy_snapshot: t.policy_snapshot,
    policy_sha256: t.policy_sha256,
  }).request;
}
