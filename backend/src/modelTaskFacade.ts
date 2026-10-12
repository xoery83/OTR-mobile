import {
  modelTaskResultSchema,
  type ModelTaskResult,
} from "../../src/domain/intelligence/modelTask";
import {
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import type { createFlightDevExecutor } from "./flightDevDispatch";

// Explicit CLOSED read seam on the existing repository/executor; no dispatch lifecycle.
export function createClosedModelTaskFacade(
  repo: Pick<ReturnType<typeof createIntelligenceContinuationRepository>, "snapshot">,
  execution: Pick<ReturnType<typeof createFlightDevExecutor>, "readTechnicalOutput">,
) {
  return {
    async read(context: AccountRequestContext, taskId: string): Promise<ModelTaskResult> {
      const { task, attempts } = await repo.snapshot(context, taskId);
      if (
        task.policy_snapshot.max_attempts !== 1 ||
        attempts.some((a) => a.shadow) ||
        attempts.length > 1
      )
        throw new Error("MODEL_TASK_SCOPE");
      const a = attempts[0] ?? null;
      const technical =
        task.cancellation_disposition === "NONE" &&
        a?.execution_observation === "TERMINAL"
          ? await execution.readTechnicalOutput(context, a.attempt_id)
          : null;
      if (
        technical &&
        (technical.request.logical_request_id !== task.logical_request_id ||
          technical.request.logical_idempotency_key !== task.logical_idempotency_key ||
          technical.request.consumer_id !== task.consumer_id ||
          technical.request.consumer_version !== task.consumer_version ||
          technical.request.policy_sha256 !== task.policy_sha256)
      )
        throw new Error("MODEL_TASK_CHANGED_BINDING");
      // Recheck current cancellation/fence after custody I/O before any projection escapes.
      const current = await repo.snapshot(context, taskId);
      if (
        current.task.row_revision !== task.row_revision ||
        current.task.publication_fence !== task.publication_fence ||
        current.task.cancellation_disposition !== task.cancellation_disposition
      )
        throw new Error("POLICY_BLOCKED");
      assertAccountRequestGeneration(context);
      return modelTaskResultSchema.parse({
        contract_version: "otr-model-task-v1",
        task_id: task.task_id,
        logical_request_id: task.logical_request_id,
        continuation: {
          work_disposition: task.work_disposition,
          wait_reason: task.wait_reason,
          row_revision: task.row_revision,
          publication_fence: task.publication_fence,
          cancellation_disposition: task.cancellation_disposition,
        },
        attempt: a
          ? {
              attempt_id: a.attempt_id,
              request_id: a.request_id,
              request_sha256: a.request_sha256,
              usage_correlation_id: a.usage_correlation_id,
              execution_observation: a.execution_observation,
              execution_outcome: a.execution_outcome,
              metering_disposition: a.metering_disposition,
              safe_failure_code:
                a.safe_failure_code === null ? null : "EXECUTION_FAILURE",
            }
          : null,
        structured_output: technical?.witness.output ?? null,
        technical_error:
          !a || technical || !["UNKNOWN", "TERMINAL"].includes(a.execution_observation)
            ? null
            : {
                category:
                  a.execution_observation === "UNKNOWN"
                    ? "RESPONSE_LOST"
                    : "POLICY_BLOCKED",
                phase:
                  a.execution_observation === "UNKNOWN"
                    ? "RECOVERY"
                    : "OUTPUT_VALIDATION",
                retryability: "NEVER",
                execution_certainty: a.execution_observation,
                retry_after_ms: null,
              },
      });
    },
  };
}
