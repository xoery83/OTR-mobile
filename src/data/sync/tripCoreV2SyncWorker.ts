import type { CoreCorrectionSyncOperation } from "./tripInstructionCorrectionLifecycle";
import {
  CoreInstructionScopeError,
  resolveCoreInstructionParentForSubmit,
} from "../../domain/trip/tripCoreInstructionParent";
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

  collection?: Parameters<Repository["refresh"]>[1]["collection"];
  capabilities(context: AccountRequestContext, operationId?: string): Promise<unknown>;
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
        const diagnostic = error as Error & {
          kind?: unknown;
          status?: unknown;
        };
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

// Read-only current NEW-submit checks. The lifecycle calls this before claim;
// the Core-owned final callback repeats it as a negative last guard, not a permit.
export async function assertCoreInstructionNewSubmit(
  repository: Repository,
  transport: CoreSyncTransport,
  context: AccountRequestContext,
  command: CoreCommand,
  getAccountId: () => Promise<string>,
  enabled: () => boolean,
) {
  if (!enabled()) throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
  const capabilities = coreCapabilitiesSchema.parse(
    await transport.capabilities(context),
  );
  await assertAccountRequestContext(context, getAccountId);
  if (
    capabilities.activationState !== "ENABLED" ||
    !capabilities.enabledCommands.includes(command.command) ||
    !capabilities.enabledAdmissionModes.includes(command.admission.mode)
  )
    throw new SyncDependencyError("CORE_CAPABILITY_CLOSED");
  const accepted = await repository.acceptedSnapshot(context);
  await assertAccountRequestContext(context, getAccountId);
  if (
    !accepted ||
    accepted.actor.accountId !== context.accountId ||
    accepted.actor.tripId !== context.tripId
  )
    throw new SyncDependencyError("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
  let scope;
  try {
    scope = resolveCoreInstructionParentForSubmit(
      accepted.graph,
      accepted.actor,
      command,
      new Date().toISOString(),
    );
  } catch (error) {
    if (error instanceof CoreInstructionScopeError)
      throw new SyncDependencyError(error.code);
    throw error;
  }
  if (
    scope.family !== "P3" ||
    !["ARRIVAL", "DEPARTURE"].includes(scope.section) ||
    accepted.graph.itinerary_events.find((r) => r.id === scope.parentItemId)
      ?.owner_account_id !== context.accountId
  )
    throw new SyncDependencyError("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
  if (!capabilities.enabledFamilies.includes(scope.family))
    throw new SyncDependencyError("CORE_FAMILY_CLOSED");
  if (!enabled()) throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
}
export function createCoreV2SyncWorker(
  repository: Repository,
  transport: CoreSyncTransport,
  getAccountId: () => Promise<string>,
  hash: ImportHash,
  instructionSubmissionEnabled: () => boolean = () => false,
  noteCorrectionSubmit?: (operation: CoreCorrectionSyncOperation) => Promise<void>,
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
          ["P1", "P3", "P4", "P5", "P6"].includes(
            (command.payload as { family: string }).family,
          )) ||
          command.command === "CREATE_SPARSE_FLIGHT") &&
        command.admission.mode === "REVIEWED_SOURCE";
      let result = await corePhase("CORE_RECEIPT_READ", () =>
        transport.receipt(context, operation.id),
      );
      await assertAccountRequestContext(context, getAccountId);
      if (
        !result &&
        command.command === "CORRECT_INSTRUCTION" &&
        command.target.kind === "INSTRUCTION" &&
        command.admission.mode === "MANUAL"
      ) {
        const claimed = operation as CoreCorrectionSyncOperation;
        if (
          !instructionSubmissionEnabled() ||
          !claimed.coreCorrectionClaim ||
          !noteCorrectionSubmit
        )
          throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
        const execution = await corePhase("CORE_CORRECTION_CONSUME", () =>
          repository.consumeAndSubmitManualInstructionCorrection(
            context,
            claimed.coreCorrectionClaim!,
            {
              receipt: (ctx, id) => transport.receipt(ctx, id),
              submit: async (ctx, canonical) => {
                await assertCoreInstructionNewSubmit(
                  repository,
                  transport,
                  ctx,
                  canonical,
                  getAccountId,
                  instructionSubmissionEnabled,
                );
                // The owning port has committed original IN_FLIGHT before this
                // callback. Only now may a real POST attempt change queue metadata.
                await noteCorrectionSubmit(claimed);
                return transport.submit(ctx, canonical);
              },
            },
          ),
        );
        if (execution.kind === "RECEIPT_ONLY")
          throw new SyncDependencyError("CORE_INSTRUCTION_RECEIPT_RECOVERY_PENDING");
        result = execution.result;
        await assertAccountRequestContext(context, getAccountId);
      }
      if (!result && sourceItem && intent.state === "APPLIED")
        throw new SyncDependencyError("CORE_ACCEPTED_RECEIPT_UNAVAILABLE");
      if (!result) {
        const capabilities = coreCapabilitiesSchema.parse(
          await corePhase("CORE_CAPABILITIES_READ", () =>
            sourceItem
              ? transport.capabilities(context, operation.id)
              : transport.capabilities(context),
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
        const isInstruction = command.target.kind === "INSTRUCTION";
        let instructionFamily: string | undefined;
        if (isInstruction) {
          if (!instructionSubmissionEnabled())
            throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
          const accepted = await repository.acceptedSnapshot(context);
          await assertAccountRequestContext(context, getAccountId);
          if (
            !accepted ||
            accepted.actor.accountId !== context.accountId ||
            accepted.actor.tripId !== context.tripId
          )
            throw new SyncDependencyError("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
          let scope;
          try {
            scope = resolveCoreInstructionParentForSubmit(
              accepted.graph,
              accepted.actor,
              command,
              new Date().toISOString(),
            );
          } catch (error) {
            if (error instanceof CoreInstructionScopeError)
              throw new SyncDependencyError(error.code);
            throw error;
          }
          const parent = accepted.graph.itinerary_events.find(
            (r) => r.id === scope.parentItemId,
          );
          if (
            scope.family !== "P3" ||
            !["ARRIVAL", "DEPARTURE"].includes(scope.section) ||
            parent?.owner_account_id !== context.accountId ||
            !command.baseVector.some(
              (b) => b.kind === "ITEM" && b.id === scope.parentItemId,
            )
          )
            throw new SyncDependencyError("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
          instructionFamily = scope.family;
        }
        const family = isInstruction
          ? instructionFamily
          : command.command === "CREATE_SPARSE_FLIGHT"
            ? "P2"
            : command.command === "CREATE_ITEM"
              ? (command.payload as { family: string }).family
              : (await repository.readGraph(context)).itinerary_events.find(
                  (r) => r.id === command.target.id,
                )?.experience_family;
        if (
          command.command === "SET_AUTHORED_FLIGHT_DETAILS" ||
          (family === "P2" && command.command === "SET_ITEM_PARTICIPATION")
        ) {
          const graph = await repository.readGraph(context);
          const item = graph.itinerary_events.find((r) => r.id === command.target.id);
          if (
            family !== "P2" ||
            item?.owner_account_id !== context.accountId ||
            graph.itinerary_transport_services.some(
              (service) => service.event_id === command.target.id,
            ) ||
            graph.trip_booking_item_links.some(
              (link) => link.item_id === command.target.id && link.active,
            ) ||
            graph.trip_flight_intents.find((r) => r.event_id === command.target.id)
              ?.qualification !== "SPARSE"
          )
            throw new SyncDependencyError("CORE_FAMILY_CLOSED");
        }
        if (command.command === "RECONCILE_ITEM_DOCUMENTS" && command.admission.mode === "MANUAL") {
          const ready = async () => {
            const state = await repository.acceptedSnapshot(context);
            return !!state && command.baseVector.every((base) => {
              if (base.kind === "ITEM") {
                const item = state.graph.itinerary_events.find(({ id }) => id === base.id);
                return !!item && Number(item.semantic_revision) >= Number(base.revision);
              }
              if (base.kind === "DOCUMENT") {
                const document = state.graph.trip_operational_documents.find(({ id }) => id === base.id);
                return !!document && Number(document.revision) >= Number(base.revision);
              }
              return false;
            });
          };
          if (!(await ready())) {
            if (transport.collection) await repository.refresh(context, { collection: transport.collection });
            if (!(await ready())) throw new SyncDependencyError("CORE_DOCUMENT_DEPENDENCY_PENDING");
          }
        }
        if (family && command.command !== "RECONCILE_ITEM_DOCUMENTS" &&
            !capabilities.enabledFamilies.includes(family as never))
          throw new SyncDependencyError("CORE_FAMILY_CLOSED");
        // Parent/family identity is not correction provenance or dispatch-phase proof.
        if (isInstruction) {
          // UI eligibility observes a pending-replayed graph and cannot prove
          // the dispatch phase of an already claimed correction. Until Core
          // provides that narrow binding, no NEW correction is submitted.
          if (command.command === "CORRECT_INSTRUCTION")
            throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
          if (
            command.command === "APPEND_INSTRUCTION" &&
            (command.payload as { sourceRepresentationId: string | null })
              .sourceRepresentationId !== null
          )
            throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
          await assertAccountRequestContext(context, getAccountId);
          if (!instructionSubmissionEnabled())
            throw new SyncDependencyError("CORE_INSTRUCTION_SYNC_CLOSED");
        }
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
          ["P1", "P3", "P4", "P5", "P6"].includes(
            (command.payload as { family: string }).family,
          )) ||
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
