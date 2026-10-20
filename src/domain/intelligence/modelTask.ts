import { z } from "zod";
import { identity, digest, label, taskSchema, attemptSchema } from "./persistence";

export const modelTaskMaterialSchema = z.strictObject({
  reference: identity,
  sha256: digest,
  byte_count: z.number().int().positive().max(4194304),
});
export const modelTaskRequestSchema = z.strictObject({
  contract_version: z.literal("otr-model-task-v1"),
  task_id: identity,
  logical_request_id: identity,
  logical_idempotency_key: identity,
  consumer_id: label,
  consumer_version: z.number().int().positive().safe(),
  input: modelTaskMaterialSchema,
  schema: z.strictObject({
    id: label,
    version: z.number().int().positive().safe(),
    dialect: label,
    sha256: digest,
  }),
  policy_snapshot: taskSchema.shape.policy_snapshot,
  policy_sha256: digest,
});
export type ModelTaskRequest = z.infer<typeof modelTaskRequestSchema>;
export const technicalOutputWitnessSchema = z.strictObject({
  version: z.literal(1),
  task_id: identity,
  attempt_id: identity,
  request_id: identity,
  request_sha256: digest,
  schema_sha256: digest,
  output: modelTaskMaterialSchema,
});
export type TechnicalOutputWitness = z.infer<typeof technicalOutputWitnessSchema>;
export const modelTaskResultSchema = z.strictObject({
  contract_version: z.literal("otr-model-task-v1"),
  task_id: identity,
  logical_request_id: identity,
  continuation: z.strictObject({
    work_disposition: taskSchema.shape.work_disposition,
    wait_reason: taskSchema.shape.wait_reason,
    row_revision: taskSchema.shape.row_revision,
    publication_fence: taskSchema.shape.publication_fence,
    cancellation_disposition: taskSchema.shape.cancellation_disposition,
  }),
  attempt: z
    .strictObject({
      attempt_id: identity,
      request_id: identity,
      request_sha256: digest,
      usage_correlation_id: identity.nullable(),
      execution_observation: attemptSchema.shape.execution_observation,
      execution_outcome: attemptSchema.shape.execution_outcome,
      metering_disposition: attemptSchema.shape.metering_disposition,
      safe_failure_code: label.nullable(),
    })
    .nullable(),
  structured_output: modelTaskMaterialSchema.nullable(),
  technical_error: z
    .strictObject({
      category: z.enum(["RESPONSE_LOST", "POLICY_BLOCKED"]),
      phase: z.enum(["RECOVERY", "OUTPUT_VALIDATION"]),
      retryability: z.literal("NEVER"),
      execution_certainty: attemptSchema.shape.execution_observation,
      retry_after_ms: z.null(),
    })
    .nullable(),
});
export type ModelTaskResult = z.infer<typeof modelTaskResultSchema>;
