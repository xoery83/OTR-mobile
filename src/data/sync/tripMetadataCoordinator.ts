import { getAccountGeneration } from "../auth/accountGeneration";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
} from "../auth/accountRequestContext";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { TripMetadataSyncTarget } from "@/domain/trip/tripMetadataContract";

// The existing owning Backend must install its durable update port before dispatch.
export function createNativeTripMetadataSyncRunner(
  portEnabled: () => boolean = () => false,
  target?: TripMetadataSyncTarget,
  lastAttemptAt?: string | null,
) {
  const selected = target && Object.freeze({ ...target });
  const dispatchGuard = () => {
    if (!portEnabled()) throw new Error("TRIP_QA_DISPATCH_CLOSED");
  };
  return async () => {
    if (!portEnabled()) return { status: "closed" as const, processedCount: 0 };
    const scope = selected && {
      accountId: selected.accountId,
      generation: getAccountGeneration(),
    };
    if (scope) assertAccountRequestGeneration(scope);
    const [
      { requireActiveUserId },
      { readInitializedDatabase },
      { readLocalTripRepository },
      { createSyncOperationRepository },
      { createTripMetadataSyncCoordinator, createTripMetadataSyncWorker },
      { createTripMetadataTransport },
    ] = await Promise.all([
      import("@/data/auth/authRepository"),
      import("@/data/db/database"),
      import("@/data/repositories/tripRepository"),
      import("./syncOperationRepository"),
      import("./tripMetadataSyncWorker"),
      import("./tripMetadataTransport"),
    ]);
    if (!portEnabled()) return { status: "closed" as const, processedCount: 0 };
    if (selected) {
      coreUuid.parse(selected.accountId);
      coreUuid.parse(selected.tripId);
      coreUuid.parse(selected.operationId);
      if ((await requireActiveUserId()) !== selected.accountId)
        throw new Error("TRIP_METADATA_ACCOUNT_MISMATCH");
    }
    if (scope) await assertAccountRequestContext(scope, requireActiveUserId);
    const repository = await readLocalTripRepository();
    if (scope) await assertAccountRequestContext(scope, requireActiveUserId);
    const database = await readInitializedDatabase();
    if (scope) await assertAccountRequestContext(scope, requireActiveUserId);
    return createTripMetadataSyncCoordinator(
      createSyncOperationRepository(
        database,
        requireActiveUserId,
        undefined,
        selected && {
          ...selected,
          ...(lastAttemptAt === undefined ? {} : { lastAttemptAt }),
        },
      ),
      createTripMetadataSyncWorker(
        repository,
        createTripMetadataTransport(requireActiveUserId, {}, undefined, dispatchGuard),
        requireActiveUserId,
        dispatchGuard,
      ),
      repository,
      portEnabled,
      selected,
    ).run("AUTHENTICATED_ONLINE");
  };
}
export async function isTripMetadataSyncEnabled() {
  if (process.env.EXPO_PUBLIC_OTR_TRIP_METADATA_UPDATE !== "1") return false;
  const { getSyncTransportMode } = await import("./transportSelection");
  return getSyncTransportMode() === "dev";
}
export async function runNativeTripMetadataSync() {
  const enabled = await isTripMetadataSyncEnabled();
  return createNativeTripMetadataSyncRunner(() => enabled)();
}
