import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createUniversalImportTransport } from "../api/universalImportTransport";
import { ApiClientError } from "../api/client";
import type { UniversalImportResult } from "../api/universalImportContracts";

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
  transport: ReturnType<typeof createUniversalImportTransport>;
  isCurrent(): boolean;
}) {
  let dispatchUncertain = false;
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
    const binding = await dependencies.transport.context(context, model.batch.batchId);
    current();
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
      if (!allowDispatch || dispatchUncertain) return null;
      // Set before the first possible send. Failure never enables a blind paid retry.
      dispatchUncertain = true;
      result = await dependencies.transport.execute(context, binding);
    }
    current();
    assertUniversalCaptureResult(model, result);
    return result;
  }
  return {
    start: (model: CaptureJobReadModel) => read(model, true),
    recover: (model: CaptureJobReadModel) => read(model, false),
  };
}
