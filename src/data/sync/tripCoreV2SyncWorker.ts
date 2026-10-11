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
      const intent = (await repository.pending(context)).find(
        (i) => i.command.operationId === operation.id,
      );
      if (
        !intent ||
        (await coreHashValue("otr-trip-core-intent-v2", intent.command, hash)) !==
          (await coreHashValue("otr-trip-core-intent-v2", command, hash))
      )
        throw new Error("CORE_QUEUE_BINDING_MISMATCH");
      let result = await transport.receipt(context, operation.id);
      await assertAccountRequestContext(context, getAccountId);
      if (!result) {
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
        result = await transport.submit(context, command);
        await assertAccountRequestContext(context, getAccountId);
      }
      if (result.projection !== "FULL")
        throw new SyncDependencyError("CORE_CURRENT_AUTHORIZATION_REQUIRED");
      await repository.applyReceipt(context, result.receipt);
    },
  };
}
// Same durable queue and executor; no feature timer or independent retry lifecycle.
export function createCoreV2SyncCoordinator(
  queue: SyncOperationRepository,
  worker: SyncWorker,
  repository: Repository,
  tripId: string,
) {
  const engine = createSyncEngine(
    queue,
    worker,
    undefined,
    (operation) =>
      operation.operationType === "CORE_V2_COMMAND" && operation.tripId === tripId,
  );
  return {
    async run(authState: Parameters<typeof engine.run>[0]) {
      if (authState === "AUTHENTICATED_ONLINE")
        await repository.resume(await repository.captureContext(tripId));
      return engine.run(authState);
    },
  };
}
