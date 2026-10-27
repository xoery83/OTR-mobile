import {
  createSyncOperationRepository,
  type SyncQueueDatabase,
} from "./syncOperationRepository";
import {
  coreCapabilitiesSchema,
  validateCoreCommand,
} from "../../domain/trip/tripCoreV2Commands";
import { parseCoreJson } from "../../domain/trip/tripCoreV2Json";
import { coreHashValue } from "../../domain/trip/tripCoreV2Read";
import { assertAccountRequestContext } from "../auth/accountRequestContext";
import type { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import type { ImportHash } from "../../domain/trip/flightImportReview";
import type { CoreReceiptProjection } from "../../domain/trip/tripCoreV2Receipt";
import type { CoreCommand } from "../../domain/trip/tripCoreV2Commands";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import {
  createSyncEngine,
  SyncDependencyError,
  type SyncWorker,
  type SyncOperationRepository,
} from "./syncEngine";
export type CoreSyncTransport = {
  finalizeSourceOperation?(
    context: AccountRequestContext,
    input: import("../../domain/trip/tripCoreV2SourceContract").CoreSourceFinalizeV2,
  ): Promise<
    import("../../domain/trip/tripCoreV2SourceContract").CoreSourceFinalizeResultV2
  >;

  capabilities(context: AccountRequestContext): Promise<unknown>;
  receipt(
    context: AccountRequestContext,
    operationId: string,
  ): Promise<CoreReceiptProjection | null>;
  submit(
    context: AccountRequestContext,
    command: CoreCommand,
  ): Promise<CoreReceiptProjection>;
};
type Repository = ReturnType<typeof createTripCoreV2Repository>;
async function corePhase<T>(phase: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    try {
      if (error instanceof Error && !Object.isFrozen(error)) {
        const diagnostic = error as Error & { kind?: unknown; status?: unknown };
        const kind = ["http", "network", "timeout", "validation"].includes(
          String(diagnostic.kind),
        )
          ? String(diagnostic.kind)
          : "unknown";
        const status =
          typeof diagnostic.status === "number" &&
          diagnostic.status >= 100 &&
          diagnostic.status <= 599
            ? diagnostic.status
            : "none";
        error.message = phase + " [" + kind + "/" + status + "]: " + error.message;
      }
    } catch {
      // Diagnostic metadata must never replace the original sync failure.
    }
    throw error;
  }
}

export function createCoreV2SyncWorker(
  repository: Repository,
  transport: CoreSyncTransport,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
): SyncWorker {
  return {
    async push(operation) {
      if (
        operation.operationType !== "CORE_V2_COMMAND" ||
        operation.entityType !== "TRIP_CORE_V2" ||
        !operation.tripId
      )
        throw new Error("CORE_UNSUPPORTED_QUEUE_OPERATION");
      const context = await repository.captureContext(operation.tripId);
      if (context.accountId !== operation.ownerUserId)
        throw new SyncDependencyError("CORE_ACCOUNT_CHANGED");
      const command = validateCoreCommand(parseCoreJson(operation.payloadJson));
      if (
        command.operationId !== operation.id ||
        command.operationId !== operation.idempotencyKey ||
        command.tripId !== operation.tripId ||
        command.target.id !== operation.entityId
      )
        throw new Error("CORE_QUEUE_BINDING_MISMATCH");
      const intent = (await repository.pending(context, operation.id)).find(
        (i) => i.command.operationId === operation.id,
      );
      if (
        !intent ||
        (await coreHashValue("otr-trip-core-intent-v2", intent.command, hash)) !==
          (await coreHashValue("otr-trip-core-intent-v2", command, hash))
      )
        throw new Error("CORE_QUEUE_BINDING_MISMATCH");
      const sourceItem =
        ((command.command === "CREATE_ITEM" &&
          ["P1", "P3"].includes((command.payload as { family: string }).family)) ||
          command.command === "CREATE_SPARSE_FLIGHT") &&
        command.admission.mode === "REVIEWED_SOURCE";
      let result = await corePhase("CORE_RECEIPT_READ", () =>
        transport.receipt(context, operation.id),
      );
      await assertAccountRequestContext(context, getAccountId);
      if (!result && sourceItem && intent.state === "APPLIED")
        throw new SyncDependencyError("CORE_ACCEPTED_RECEIPT_UNAVAILABLE");
      if (!result) {
        const capabilities = coreCapabilitiesSchema.parse(
          await corePhase("CORE_CAPABILITIES_READ", () =>
            transport.capabilities(context),
          ),
        );
        await assertAccountRequestContext(context, getAccountId);
        if (
          capabilities.activationState !== "ENABLED" ||
          !capabilities.enabledCommands.includes(command.command) ||
          !capabilities.enabledAdmissionModes.includes(command.admission.mode)
        )
          throw new SyncDependencyError("CORE_CAPABILITY_CLOSED");
        if (command.admission.mode !== "MANUAL" && !capabilities.sourceEvidenceAvailable)
          throw new SyncDependencyError("CORE_SOURCE_EVIDENCE_CLOSED");
        const family =
          command.command === "CREATE_SPARSE_FLIGHT"
            ? "P2"
            : command.command === "CREATE_ITEM"
              ? (command.payload as { family: string }).family
              : (await repository.readGraph(context)).itinerary_events.find(
                  (r) => r.id === command.target.id,
                )?.experience_family;
        if (family && !capabilities.enabledFamilies.includes(family as never))
          throw new SyncDependencyError("CORE_FAMILY_CLOSED");
        result = await corePhase("CORE_SUBMIT", () => transport.submit(context, command));
        await assertAccountRequestContext(context, getAccountId);
      }
      if (result.projection !== "FULL")
        throw new SyncDependencyError("CORE_CURRENT_AUTHORIZATION_REQUIRED");
      await repository.applyReceipt(context, result.receipt);
      // Same queue recovers the exact accepted operation before finishing its Source relation.
      if (sourceItem && ["APPLIED", "NO_CHANGE"].includes(result.receipt.outcome)) {
        if (!transport.finalizeSourceOperation)
          throw new Error("CORE_SOURCE_FINALIZER_CLOSED");
        const final = await transport.finalizeSourceOperation(context, {
          captureVersion: 2,
          slotId: command.admission.sourceIntentId!,
          operationId: command.operationId,
          intentSha256: result.receipt.intentSha256,
          domainReceiptId: result.domainReceiptId,
          receiptSha256: result.receipt.receiptSha256,
        });
        await assertAccountRequestContext(context, getAccountId);
        if (final.slotId !== command.admission.sourceIntentId)
          throw Error("CORE_SOURCE_FINALIZER_SCOPE_MISMATCH");
        if (final.state !== "COMPLETE") throw new Error("CORE_SOURCE_EVIDENCE_PENDING");
      }
    },
  };
}
// Same durable queue and executor; no feature timer or independent retry lifecycle.
export function createCoreV2SyncCoordinator(
  queue: SyncOperationRepository,
  worker: SyncWorker,
  repository: Repository,
  tripId: string,
  operationId?: string,
) {
  const engine = createSyncEngine(
    queue,
    worker,
    undefined,
    (operation) =>
      operation.operationType === "CORE_V2_COMMAND" &&
      operation.tripId === tripId &&
      (!operationId || operation.id === operationId),
  );
  return {
    async run(authState: Parameters<typeof engine.run>[0]) {
      if (authState === "AUTHENTICATED_ONLINE") {
        const context = await repository.captureContext(tripId);
        if (operationId) await repository.resume(context, operationId);
        else await repository.resume(context);
      }
      return engine.run(authState);
    },
  };
}

// A prepared Source action wakes its exact durable operation without enabling Manual QA dispatch.
export function createReviewedSourceOperationSync(
  database: SyncQueueDatabase,
  repository: Repository,
  transport: CoreSyncTransport,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
) {
  return async (context: AccountRequestContext, operationId: string) => {
    await assertAccountRequestContext(context, getAccountId);
    const intent = (await repository.pending(context, operationId)).find(
      (i) => i.command.operationId === operationId,
    );
    const command = intent && validateCoreCommand(intent.command);
    if (
      !command ||
      command.tripId !== context.tripId ||
      !(
        (command.command === "CREATE_ITEM" &&
          ["P1", "P3"].includes((command.payload as { family: string }).family)) ||
        command.command === "CREATE_SPARSE_FLIGHT"
      ) ||
      command.target.kind !== "ITEM" ||
      command.admission.mode !== "REVIEWED_SOURCE" ||
      !command.admission.sourceIntentId ||
      command.admission.policyVersion !== null
    )
      throw Error("OWNING_ADMISSION_UNAVAILABLE");
    const queue = createSyncOperationRepository(database, getAccountId, undefined, {
      accountId: context.accountId,
      tripId: context.tripId,
      operationId,
    });
    const result = await createCoreV2SyncCoordinator(
      queue,
      createCoreV2SyncWorker(repository, transport, getAccountId, hash),
      repository,
      context.tripId,
      operationId,
    ).run("AUTHENTICATED_ONLINE");
    await assertAccountRequestContext(context, getAccountId);
    return result;
  };
}
