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
    return createNormalTripSyncWake(
      {
        database,
        account: requireActiveUserId,
        enabled,
        deferred: repository,
        recoverP1Readback: async (tripId) => {
          const context = await core.captureContext(tripId);
          const pending = await core.pending(context);
          if (!pending.some((intent) => intent.state === "APPLIED")) return;
          const ids = new Set(
            (await core.readGraph(context)).itinerary_events
              .filter((item) => item.experience_family === "P1")
              .map((item) => item.id),
          );
          for (const { command } of pending)
            if (
              command.command === "CREATE_ITEM" &&
              (command.payload as { family: string }).family === "P1"
            )
              ids.add(command.target.id);
          if (
            pending.some(
              (intent) => intent.state === "APPLIED" && ids.has(intent.command.target.id),
            )
          )
            await core.refresh(
              context,
              createCoreV2Transport(requireActiveUserId, tripCoreSha256Hex),
            );
        },
        runCreate: (target) => createNativeTripCreateSyncRunner(target, enabled)(),
        runMetadata: (target) => createNativeTripMetadataSyncRunner(enabled, target)(),
        runP1: async (target) => {
          const transport = createCoreV2Transport(requireActiveUserId, tripCoreSha256Hex);
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
          if (intent?.state === "APPLIED") await core.refresh(context, transport);
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
