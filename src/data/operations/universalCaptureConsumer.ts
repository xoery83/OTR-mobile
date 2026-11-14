import { isUnsupportedUniversalInputMetadata } from "@/domain/capture/universalInputSupport";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createUniversalImportTransport } from "../api/universalImportTransport";
import { ApiClientError } from "../api/client";
import {
  universalBatchPreparedSchema,
  universalMaterialReadySchema,
} from "../api/universalImportContracts";
import type {
  UniversalBatchPrepared,
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
  startRetained?(
    context: import("../auth/accountRequestContext").AccountRequestContext,
    model: CaptureJobReadModel,
  ): Promise<UniversalBatchPrepared>;
  prepareSources?(
    context: import("../auth/accountRequestContext").AccountRequestContext,
    model: CaptureJobReadModel,
  ): Promise<UniversalBatchPrepared | null | void>;
}) {
  let dispatchUncertain = false;
  let materialContinuationSelected = false;
  let materialPrepareAttempted = false;
  let observedTask = false;
  let sourceTaskPrepareAttempted = false;
  let sourcePreparedTaskId: string | undefined;
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
    let queuedReceiptUsed = false;
    const continuation =
      allowDispatch &&
      dependencies.continuous &&
      !dispatchUncertain &&
      !materialPrepareAttempted &&
      !sourceTaskPrepareAttempted &&
      !observedTask
        ? dependencies.materialContinuation
        : undefined;
    try {
      if (
        allowDispatch &&
        dependencies.startRetained &&
        !dispatchUncertain &&
        !terminalActivity()
      ) {
        sourceTaskPrepareAttempted = true;
        const receipt = universalBatchPreparedSchema.parse(
          await dependencies.startRetained(context, model),
        );
        found = receipt.context;
        if (
          found.actorId !== context.accountId ||
          found.accountId !== context.accountId ||
          found.tripId !== context.tripId ||
          found.batchId !== model.batch.batchId
        )
          throw Error("UNIVERSAL_CAPTURE_SCOPE_MISMATCH");
        preparedThisAction = true;
        queuedReceiptUsed = receipt.status === "QUEUED";
      } else {
        found = await dependencies.transport.context(context, model.batch.batchId);
      }
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
          sourceTaskPrepareAttempted ||
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
        const prepared = await dependencies.prepareSources(context, model);
        preparedThisAction = true;
        current();
        let queuedContext: UniversalExecutionContext | undefined;
        if (dependencies.continuous && prepared !== undefined) {
          sourceTaskPrepareAttempted = true;
          const receipt = universalBatchPreparedSchema.safeParse(prepared);
          if (
            receipt.success &&
            receipt.data.context.accountId === context.accountId &&
            receipt.data.context.actorId === context.accountId &&
            receipt.data.context.tripId === context.tripId &&
            receipt.data.context.batchId === model.batch.batchId
          ) {
            sourcePreparedTaskId = receipt.data.context.taskId;
            if (receipt.data.status === "QUEUED") queuedContext = receipt.data.context;
          } else {
            // An unconfirmed Task prepare may already have been applied.
            dispatchUncertain = true;
          }
        }
        if (queuedContext) {
          found = queuedContext;
          queuedReceiptUsed = true;
        } else {
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
        new Set(prepare.inputs.map((pin) => pin.representation_id)).size !==
          originals.size ||
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
    if (sourcePreparedTaskId && binding.taskId !== sourcePreparedTaskId)
      throw Error("UNIVERSAL_CAPTURE_STALE");
    observedTask = true;
    activity = binding.activity ?? null;
    if (queuedReceiptUsed && !activity) queued = true;
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
      (activity
        ? ["PENDING", "WAITING", "PROCESSING"].includes(activity.state)
        : queuedReceiptUsed) &&
      (!allowDispatch ||
        dispatchUncertain ||
        !dependencies.resumeTask ||
        preparedThisAction)
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

// Native observes the existing backend session; endpoint configuration stays in data operations.
export function openUniversalCaptureBackend(
  account: () => Promise<string>,
  options: { signal?: AbortSignal; assertCurrent?: () => void } = {},
) {
  return createUniversalImportTransport(account, {
    ...options,
    baseUrl: process.env.EXPO_PUBLIC_OTR_API_BASE_URL!,
  });
}
export type UniversalCaptureBackend = ReturnType<typeof openUniversalCaptureBackend>;
export function isCaptureRequestError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}
export function parsePreparedUniversalBatch(value: unknown) {
  return universalBatchPreparedSchema.parse(value);
}

export async function openUniversalPngSourceBackend(
  account: () => Promise<string>,
  options: { signal?: AbortSignal; assertRequestCurrent(): void },
) {
  const { createSourcePngPreparationTransport } =
    await import("../api/sourcePngPreparationTransport");
  return createSourcePngPreparationTransport(account, {
    ...options,
    baseUrl: process.env.EXPO_PUBLIC_OTR_API_BASE_URL!,
  });
}
