import { isUnsupportedUniversalInputMetadata } from "@/domain/capture/universalInputSupport";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createUniversalImportTransport } from "../api/universalImportTransport";
import { ApiClientError } from "../api/client";
import { universalMaterialReadySchema } from "../api/universalImportContracts";
import type {
  UniversalMaterialReady,
  UniversalTaskActivity,
  UniversalExecutionContext,
  UniversalImportResult,
} from "../api/universalImportContracts";

export function assertUniversalCaptureResult(
  model: CaptureJobReadModel,
  result: UniversalImportResult,
) {
  if (
    result.accountId !== model.batch.accountId ||
    result.batchId !== model.batch.batchId ||
    result.tripId !== (model.batch.context.tripPrior?.id ?? model.assignedTripId)
  )
    throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
  const inputs = model.inputs;
  if (
    !model.allInputsAccepted ||
    !inputs.length ||
    !result.sourceBindings.length ||
    result.sourceBindings.some(
      (b) =>
        !inputs.some(
          (i) =>
            i.id === b.inputId &&
            i.state === "ACCEPTED" &&
            i.contentSha256 === (b.pdfSource?.original.sha256 ?? b.originalSha256) &&
            (!b.pdfSource ||
              (i.kind === "FILE" &&
                i.declaredContentType === "application/pdf" &&
                i.contentByteCount === b.pdfSource.original.byteCount &&
                b.mime === "text/plain" &&
                b.pdfSource.original.representationId !== b.representationId)),
        ),
    ) ||
    inputs.some(
      (i) =>
        !isUnsupportedUniversalInputMetadata(i) &&
        !result.sourceBindings.some((b) => b.inputId === i.id),
    )
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
  materialContinuation?: {
    transport: Pick<
      ReturnType<typeof createUniversalImportTransport>,
      "materialReady" | "prepare"
    >;
    verifyLocalSubmission(
      context: import("../auth/accountRequestContext").AccountRequestContext,
      model: CaptureJobReadModel,
    ): Promise<string>;
  };
  continuous?: boolean;
  isCurrent(): boolean;
  resumeTask?(
    context: import("../auth/accountRequestContext").AccountRequestContext,
    binding: UniversalExecutionContext,
  ): Promise<void>;
  prepareSources?(
    context: import("../auth/accountRequestContext").AccountRequestContext,
    model: CaptureJobReadModel,
  ): Promise<void>;
}) {
  let dispatchUncertain = false;
  let materialContinuationSelected = false;
  let materialPrepareAttempted = false;
  let observedTask = false;
  let queued = false;
  let activity: UniversalTaskActivity | null = null;
  const terminalActivity = () =>
    activity !== null &&
    ["RESULTS_READY", "FAILED", "CANCELED", "STALE"].includes(activity.state);

  const current = () => {
    if (!dependencies.isCurrent()) throw Error("UNIVERSAL_CAPTURE_STALE");
  };
  async function read(model: CaptureJobReadModel, allowDispatch: boolean) {
    current();
    // Retained attribution is a GET hint, not authority to start new work.
    const trip =
      model.batch.context.tripPrior?.id ??
      (!allowDispatch ? model.assignedTripId : undefined);
    if (!trip || !model.allInputsAccepted) throw Error("UNIVERSAL_CAPTURE_NOT_QUALIFIED");
    const context = await captureAccountRequestContext(trip, dependencies.getAccountId);
    current();
    if (context.accountId !== model.batch.accountId)
      throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
    let found: UniversalExecutionContext | UniversalMaterialReady;
    let preparedThisAction = false;
    const continuation =
      allowDispatch &&
      dependencies.continuous &&
      !dispatchUncertain &&
      !materialPrepareAttempted &&
      !observedTask
        ? dependencies.materialContinuation
        : undefined;
    try {
      found = await dependencies.transport.context(context, model.batch.batchId);
    } catch (error) {
      current();
      if (
        continuation &&
        error instanceof ApiClientError &&
        error.status === 503 &&
        error.code === "UNIVERSAL_CONTEXT_UNAVAILABLE"
      ) {
        materialContinuationSelected = true;
        found = await continuation.transport.materialReady(context, model.batch.batchId);
      } else {
        if (
          !allowDispatch ||
          dispatchUncertain ||
          materialContinuationSelected ||
          terminalActivity() ||
          !dependencies.prepareSources ||
          !(
            error instanceof ApiClientError &&
            ((!dependencies.continuous &&
              error.status === 503 &&
              ["UNIVERSAL_IMPORT_CLOSED", "UNIVERSAL_CONTEXT_UNAVAILABLE"].includes(
                error.code ?? "",
              )) ||
              (dependencies.continuous &&
                error.status === 404 &&
                error.code === "TASK_NOT_FOUND"))
          )
        )
          throw error;
        // Continuous 503 is uncertainty; only an owning 404 permits Source preparation.
        await dependencies.prepareSources(context, model);
        preparedThisAction = true;
        current();
        // Only owning Backend context can supply the Task, including after Source preparation.
        try {
          found = await dependencies.transport.context(context, model.batch.batchId);
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
    }
    current();
    let binding: UniversalExecutionContext;
    if (found.version === "otr.backend.universal-material-ready/1") {
      const { accountId, actorId, prepare } = universalMaterialReadySchema.parse(found);
      if (
        !continuation ||
        materialPrepareAttempted ||
        observedTask ||
        accountId !== context.accountId ||
        actorId !== context.accountId ||
        prepare.tripId !== context.tripId ||
        prepare.batchId !== model.batch.batchId
      )
        throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
      const originals = new Map(model.inputs.map((input) => [input.id, input]));
      if (
        originals.size !== model.inputs.length ||
        prepare.inputs.length !== originals.size ||
        new Set(prepare.inputs.map((pin) => pin.id)).size !== originals.size ||
        new Set(prepare.inputs.map((pin) => pin.source_id)).size !== originals.size ||
        new Set(prepare.inputs.map((pin) => pin.representation_id)).size !== originals.size ||
        prepare.inputs.some((pin) => {
          const original = originals.get(pin.id);
          return (
            !original ||
            original.state !== "ACCEPTED" ||
            original.contentSha256 !== pin.payload_sha256 ||
            original.contentByteCount !== pin.byte_count
          );
        })
      )
        throw Error("UNIVERSAL_CAPTURE_ORIGINALS_MISMATCH");
      const submissionSha256 = await continuation.verifyLocalSubmission(context, model);
      current();
      if (submissionSha256 !== prepare.submissionSha256)
        throw Error("UNIVERSAL_CAPTURE_ORIGINALS_MISMATCH");
      // From this point a lost response permits only passive reads in this view.
      materialPrepareAttempted = true;
      dispatchUncertain = true;
      const prepared = await continuation.transport.prepare(context, prepare);
      current();
      binding = prepared.context;
      if (
        binding.accountId !== context.accountId ||
        binding.actorId !== context.accountId ||
        binding.tripId !== context.tripId ||
        binding.batchId !== model.batch.batchId
      )
        throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
      dispatchUncertain = false;
      preparedThisAction = true;
    } else {
      binding = found;
    }
    observedTask = true;
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
        if (
          allowDispatch &&
          !dispatchUncertain &&
          !terminalActivity() &&
          !preparedThisAction &&
          (dependencies.resumeTask || dependencies.prepareSources)
        ) {
          if (dependencies.resumeTask) await dependencies.resumeTask(context, binding);
          else await dependencies.prepareSources!(context, model);
          current();
        }
        queued = !terminalActivity();
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
      ["PENDING", "WAITING", "PROCESSING"].includes(activity.state) &&
      (!allowDispatch || dispatchUncertain || !dependencies.resumeTask || preparedThisAction)
    ) {
      // Passive reads keep the marker pending; explicit resume may reconcile a retained call.
      queued = true;
      return null;
    }
    if (
      allowDispatch &&
      !dispatchUncertain &&
      !terminalActivity() &&
      dependencies.continuous &&
      !preparedThisAction &&
      (dependencies.resumeTask || dependencies.prepareSources) &&
      result.status === "EXECUTION_OUTCOME_UNKNOWN" &&
      result.providerOutcome === "UNKNOWN"
    ) {
      // Existing attempts only reconcile retained receipts in the owning queue; they cannot resend.
      if (dependencies.resumeTask) await dependencies.resumeTask(context, binding);
      else await dependencies.prepareSources!(context, model);
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
      return !dispatchUncertain && !terminalActivity();
    },
    start: (model: CaptureJobReadModel) => read(model, true),
    recover: (model: CaptureJobReadModel) => read(model, false),
  };
}
