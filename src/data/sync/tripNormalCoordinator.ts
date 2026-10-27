import { createTripPersonCloudCreateRepository } from "../repositories/tripPersonCloudCreateRepository";
import {
  createPersonCloudSyncWorker,
  createPersonCloudTransport,
} from "./tripPersonCloudCreateSync";
import { createSyncEngine } from "./syncEngine";
import { personCloudCreateKind } from "@/domain/trip/tripPersonCloudCreate";
import { createUuid } from "@/domain/localId";
import { createTripNormalReadbackRepository } from "../repositories/tripNormalReadbackRepository";
import { structuredTripMetadataSnapshotSchema } from "@/domain/trip/tripStructuredDestinationContract";
import { createTripMetadataTransport } from "./tripMetadataTransport";
import { createTripMetadataRepository } from "../repositories/tripMetadataRepository";
import { createNormalTripSyncWake, type NormalTripSyncScope } from "./tripNormalSync";
import { createNativeTripCreateSyncRunner } from "./tripCreateCoordinator";
import { createNativeTripMetadataSyncRunner } from "./tripMetadataCoordinator";
import {
  createCoreV2SyncCoordinator,
  createCoreV2SyncWorker,
} from "./tripCoreV2SyncWorker";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { createCoreV2Transport } from "../api/tripCoreV2Transport";
import { createTripCoreV2Repository } from "../repositories/tripCoreV2Repository";
import { createTripPersonRepository } from "../repositories/tripPersonRepository";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { p1SharedParticipantsReady } from "./p1SharedParticipantQualification";
import {
  captureAccountScope,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";

const coldReadbackSeen = new Set<string>();
// Host installs this single wake beside existing queue notifications. Default is CLOSED.
export function createNativeNormalTripSyncRunner(
  input: NormalTripSyncScope,
  enabled: () => boolean = () => false,
) {
  return async (authState: string) => {
    if (!enabled() || authState !== "AUTHENTICATED_ONLINE")
      return { status: "closed" as const, runnerCalls: 0 };
    const [
      { requireActiveUserId },
      { readInitializedDatabase },
      { readLocalTripRepository },
    ] = await Promise.all([
      import("../auth/authRepository"),
      import("../db/database"),
      import("../repositories/tripRepository"),
    ]);
    const account = await captureAccountScope(requireActiveUserId);
    if (account.accountId !== input.accountId) throw Error("TRIP_SYNC_ACCOUNT_MISMATCH");
    const database = await readInitializedDatabase();
    await assertAccountRequestContext(account, requireActiveUserId);
    const repository = await readLocalTripRepository();
    await assertAccountRequestContext(account, requireActiveUserId);
    const core = createTripCoreV2Repository(
      database,
      requireActiveUserId,
      tripCoreSha256Hex,
    );
    const persons = createTripPersonRepository(database, requireActiveUserId);
    const readback = createTripNormalReadbackRepository(database, requireActiveUserId);
    const recoverReadback = async (tripId: string, createOperationId: string) => {
      const local = await repository.getTrip(tripId);
      await assertAccountRequestContext(account, requireActiveUserId);
      if (local?.serverId !== tripId) return;
      const trigger = await database.getAllAsync<{
        id: string;
        status: string;
        attempt_count: number;
      }>(
        "SELECT id,status,attempt_count FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND ((status='COMPLETED' AND operation_type IN ('CREATE_TRIP','UPDATE_TRIP_METADATA','CORE_V2_COMMAND')) OR (entity_type='TRIP_CORE_V2' AND operation_type='CORE_V2_COMMAND' AND status IN ('PENDING','RETRYABLE','DEPENDENCY_BLOCKED') AND attempt_count>0 AND failure_category IS NOT 'AUTH')) ORDER BY id",
        account.accountId,
        tripId,
      );
      await assertAccountRequestContext(account, requireActiveUserId);
      const coldKey = `${account.generation}:${account.accountId}:${tripId}`;
      await readback.run(
        { ...account, tripId },
        createOperationId,
        async () => {
          const snapshot = await createTripMetadataTransport(
            requireActiveUserId,
            {},
            undefined,
            () => {
              if (!enabled()) throw Error("TRIP_SYNC_PORT_CLOSED");
            },
          ).snapshot(account, tripId, createOperationId, 3);
          await assertAccountRequestContext(account, requireActiveUserId);
          await createTripMetadataRepository(database, requireActiveUserId, () =>
            new Date().toISOString(),
          ).retainMetadataSnapshot(
            structuredTripMetadataSnapshotSchema.parse(snapshot),
            createUuid(),
          );
          const context = await core.captureContext(tripId);
          const transport = createCoreV2Transport(
            requireActiveUserId,
            tripCoreSha256Hex,
            { timeoutMs: 60_000 },
          );
          await core.recoverP1Receipts(context, transport);
          const pending = await core.pending(context);
          if (pending.some((i) => i.state === "APPLIED"))
            await core.refresh(
              context,
              createCoreV2Transport(requireActiveUserId, tripCoreSha256Hex, {
                timeoutMs: 60_000,
              }),
            );
        },
        JSON.stringify(trigger.map((row) => [row.id, row.status, row.attempt_count])),
        !coldReadbackSeen.has(coldKey),
      );
      coldReadbackSeen.add(coldKey);
    };
    return createNormalTripSyncWake(
      {
        database,
        account: requireActiveUserId,
        enabled,
        deferred: repository,
        recoverTripReadback: recoverReadback,
        recoverP1Readback: async (tripId) => {
          const row = await database.getFirstAsync<{ create_operation_id: string }>(
            "SELECT create_operation_id FROM local_trip_containers WHERE account_id=? AND id=?",
            account.accountId,
            tripId,
          );
          await assertAccountRequestContext(account, requireActiveUserId);
          if (row) await recoverReadback(tripId, row.create_operation_id);
        },
        runPerson: async (target) => {
          const context = { ...account, tripId: target.tripId };
          const people = createTripPersonCloudCreateRepository(
            database,
            requireActiveUserId,
          );
          await people.resume(context, target.operationId);
          await assertAccountRequestContext(account, requireActiveUserId);
          if (!enabled()) throw Error("PERSON_PORT_CLOSED");
          const result = await createSyncEngine(
            createSyncOperationRepository(
              database,
              requireActiveUserId,
              undefined,
              target,
            ),
            createPersonCloudSyncWorker(
              people,
              createPersonCloudTransport(requireActiveUserId, enabled),
              requireActiveUserId,
            ),
            undefined,
            (op) =>
              op.id === target.operationId &&
              op.entityType === "TRIP_PERSON" &&
              op.operationType === personCloudCreateKind,
          ).run("AUTHENTICATED_ONLINE");
          await assertAccountRequestContext(account, requireActiveUserId);
          return result;
        },
        runCreate: (target) => createNativeTripCreateSyncRunner(target, enabled)(),
        runMetadata: (target) => createNativeTripMetadataSyncRunner(enabled, target)(),
        runP1: async (target) => {
          const transport = createCoreV2Transport(
            requireActiveUserId,
            tripCoreSha256Hex,
            { timeoutMs: 60_000 },
          );
          const result = await createCoreV2SyncCoordinator(
            createSyncOperationRepository(
              database,
              requireActiveUserId,
              undefined,
              target,
            ),
            createCoreV2SyncWorker(
              core,
              transport,
              requireActiveUserId,
              tripCoreSha256Hex,
            ),
            core,
            target.tripId,
            target.operationId,
          ).run("AUTHENTICATED_ONLINE");
          const context = await core.captureContext(target.tripId);
          const intent = (await core.pending(context)).find(
            (item) => item.command.operationId === target.operationId,
          );
          if (intent?.state === "APPLIED") {
            const row = await database.getFirstAsync<{ create_operation_id: string }>(
              "SELECT create_operation_id FROM local_trip_containers WHERE account_id=? AND id=?",
              account.accountId,
              target.tripId,
            );
            await assertAccountRequestContext(account, requireActiveUserId);
            if (!row) throw Error("TRIP_CREATE_LOCAL_MISSING");
            await recoverReadback(target.tripId, row.create_operation_id);
          }
          return result;
        },
        isP1Item: async (tripId, itemId) => {
          const context = await core.captureContext(tripId);
          const pending = await core.pending(context);
          if (
            pending.some(
              ({ command }) =>
                command.command === "CREATE_ITEM" &&
                command.target.id === itemId &&
                (command.payload as { family: string }).family === "P1",
            )
          )
            return true;
          return (await core.readGraph(context)).itinerary_events.some(
            (item) => item.id === itemId && item.experience_family === "P1",
          );
        },
        participantsReady: async (tripId, command) => {
          const context = await core.captureContext(tripId);
          const pending = await core.pending(context);
          const index = pending.findIndex(
            (intent) => intent.command.operationId === command.operationId,
          );
          if (
            index < 0 ||
            pending
              .slice(0, index)
              .some(
                (intent) =>
                  intent.command.target.id === command.target.id &&
                  intent.state !== "APPLIED",
              )
          )
            return false;
          return p1SharedParticipantsReady(
            command,
            await persons.listTripPersons(tripId),
          );
        },
      },
      input,
    )(authState);
  };
}
