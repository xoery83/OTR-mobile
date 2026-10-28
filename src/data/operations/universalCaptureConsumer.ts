import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createUniversalImportTransport } from "../api/universalImportTransport";
import { ApiClientError } from "../api/client";
import type {
  UniversalTaskActivity,
  UniversalImportResult,
} from "../api/universalImportContracts";

export function assertUniversalCaptureResult(
  model: CaptureJobReadModel,
  result: UniversalImportResult,
) {
  if (
    result.accountId !== model.batch.accountId ||
    result.batchId !== model.batch.batchId ||
    result.tripId !== model.batch.context.tripPrior?.id
  )
    throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
  const inputs = model.inputs;
  if (
    !model.allInputsAccepted ||
    !inputs.length ||
    result.sourceBindings.some(
      (b) =>
        !inputs.some(
          (i) =>
            i.id === b.inputId &&
            i.state === "ACCEPTED" &&
            i.contentSha256 === b.originalSha256,
        ),
    ) ||
    inputs.some((i) => !result.sourceBindings.some((b) => b.inputId === i.id))
  )
    throw Error("UNIVERSAL_CAPTURE_ORIGINALS_MISMATCH");
}

// Transient view of the existing Backend-owned Task. No new queue/store/Task identity.
export function createUniversalCaptureConsumer(dependencies: {
  getAccountId(): Promise<string>;
  transport: Pick<
    ReturnType<typeof createUniversalImportTransport>,
    "context" | "result" | "execute"
  >;
  continuous?: boolean;
  isCurrent(): boolean;
  prepareSources?(
    context: import("../auth/accountRequestContext").AccountRequestContext,
    model: CaptureJobReadModel,
  ): Promise<void>;
}) {
  let dispatchUncertain = false;
  let queued = false;
  let activity: UniversalTaskActivity | null = null;
  const current = () => {
    if (!dependencies.isCurrent()) throw Error("UNIVERSAL_CAPTURE_STALE");
  };
  async function read(model: CaptureJobReadModel, allowDispatch: boolean) {
    current();
    const trip = model.batch.context.tripPrior?.id;
    if (!trip || !model.allInputsAccepted) throw Error("UNIVERSAL_CAPTURE_NOT_QUALIFIED");
    const context = await captureAccountRequestContext(trip, dependencies.getAccountId);
    current();
    if (context.accountId !== model.batch.accountId)
      throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
    let binding;
    let preparedThisAction = false;
    try {
      binding = await dependencies.transport.context(context, model.batch.batchId);
    } catch (error) {
      current();
      if (
        !allowDispatch ||
        dispatchUncertain ||
        !dependencies.prepareSources ||
        !(
          error instanceof ApiClientError &&
          ((error.status === 503 &&
            ["UNIVERSAL_IMPORT_CLOSED", "UNIVERSAL_CONTEXT_UNAVAILABLE"].includes(
              error.code ?? "",
            )) ||
            (dependencies.continuous &&
              error.status === 404 &&
              error.code === "TASK_NOT_FOUND"))
        )
      )
        throw error;
      await dependencies.prepareSources(context, model);
      preparedThisAction = true;
      current();
      // Only owning Backend context can supply the Task, including after Source preparation.
      try {
        binding = await dependencies.transport.context(context, model.batch.batchId);
      } catch (error) {
        current();
        if (
          error instanceof ApiClientError &&
          ((error.status === 503 &&
            ["UNIVERSAL_IMPORT_CLOSED", "UNIVERSAL_CONTEXT_UNAVAILABLE"].includes(
              error.code ?? "",
            )) ||
            (dependencies.continuous &&
              error.status === 404 &&
              error.code === "TASK_NOT_FOUND"))
        )
          throw new ApiClientError(
            "OWNING_TASK_READER_UNAVAILABLE",
            "http",
            503,
            "OWNING_TASK_READER_UNAVAILABLE",
          );
        throw error;
      }
    }
    current();
    activity = binding.activity ?? null;
    let result: UniversalImportResult;
    try {
      result = await dependencies.transport.result(context, binding);
    } catch (error) {
      current();
      if (!(
        error instanceof ApiClientError &&
        error.status === 404 &&
        error.code === "TASK_NOT_FOUND"
      ))
        throw error;
      if (dependencies.continuous) {
        // Explicit Start may wake the same durable Task after a Backend restart.
        // Recovery GET never prepares work or resends a Provider call.
        if (allowDispatch && !preparedThisAction && dependencies.prepareSources) {
          await dependencies.prepareSources(context, model);
          current();
        }
        queued = true;
        return null;
      }
      if (!allowDispatch || dispatchUncertain) return null;
      // Set before the first possible send. Failure never enables a blind paid retry.
      dispatchUncertain = true;
      result = await dependencies.transport.execute(context, binding);
    }
    current();
    assertUniversalCaptureResult(model, result);
    if (
      dependencies.continuous &&
      result.status === "EXECUTION_OUTCOME_UNKNOWN" &&
      result.providerOutcome === "UNKNOWN" &&
      activity &&
      ["PENDING", "WAITING", "PROCESSING"].includes(activity.state)
    ) {
      // The retained request marker is provisional while the owning Task is running.
      queued = true;
      return null;
    }
    if (
      allowDispatch &&
      dependencies.continuous &&
      !preparedThisAction &&
      dependencies.prepareSources &&
      result.status === "EXECUTION_OUTCOME_UNKNOWN" &&
      result.providerOutcome === "UNKNOWN"
    ) {
      // Existing attempts only reconcile retained receipts in the owning queue; they cannot resend.
      await dependencies.prepareSources(context, model);
      current();
      const resumed = await dependencies.transport.context(context, model.batch.batchId);
      current();
      if (
        resumed.taskId !== binding.taskId ||
        resumed.batchId !== binding.batchId ||
        resumed.tripId !== binding.tripId ||
        resumed.accountId !== binding.accountId ||
        resumed.actorId !== binding.actorId
      )
        throw Error("UNIVERSAL_CAPTURE_STALE");
      queued = true;
      return null;
    }
    queued = false;
    return result;
  }
  return {
    get activity() {
      return dependencies.isCurrent() ? activity : null;
    },
    get queued() {
      return queued;
    },
    get canDispatch() {
      return !dispatchUncertain;
    },
    start: (model: CaptureJobReadModel) => read(model, true),
    recover: (model: CaptureJobReadModel) => read(model, false),
  };
}
