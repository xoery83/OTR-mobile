import { getAccountGeneration } from "../auth/accountGeneration";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
} from "../auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { readInitializedDatabase } from "@/data/db/database";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import type { TripCreateTarget } from "@/domain/trip/tripCreateContract";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { createTripCreateTransport } from "./tripCreateTransport";
import {
  createTripCreateSyncCoordinator,
  createTripCreateSyncWorker,
} from "./tripCreateSyncWorker";

// Explicit composition only; normal startup installs no runner and the port stays CLOSED.
export function createNativeTripCreateSyncRunner(
  target?: TripCreateTarget,
  portEnabled: () => boolean = () => false,
  lastAttemptAt?: string | null,
) {
  const selected = target && Object.freeze({ ...target });
  const dispatchGuard = () => {
    if (!portEnabled()) throw new Error("TRIP_QA_DISPATCH_CLOSED");
  };
  return async () => {
    if (!selected || !portEnabled())
      return { status: "closed" as const, processedCount: 0 };
    const scope = { accountId: selected.accountId, generation: getAccountGeneration() };
    assertAccountRequestGeneration(scope);
    coreUuid.parse(selected.accountId);
    coreUuid.parse(selected.tripId);
    coreUuid.parse(selected.operationId);
    if ((await requireActiveUserId()) !== selected.accountId)
      throw new Error("TRIP_CREATE_ACCOUNT_MISMATCH");
    await assertAccountRequestContext(scope, requireActiveUserId);
    const database = await readInitializedDatabase();
    await assertAccountRequestContext(scope, requireActiveUserId);
    const repository = await readLocalTripRepository();
    await assertAccountRequestContext(scope, requireActiveUserId);
    return createTripCreateSyncCoordinator(
      createSyncOperationRepository(
        database,
        requireActiveUserId,
        undefined,
        selected && {
          ...selected,
          ...(lastAttemptAt === undefined ? {} : { lastAttemptAt }),
        },
      ),
      createTripCreateSyncWorker(
        repository,
        createTripCreateTransport(requireActiveUserId, {}, undefined, dispatchGuard),
        requireActiveUserId,
        dispatchGuard,
      ),
      repository,
      portEnabled,
      selected,
    ).run("AUTHENTICATED_ONLINE");
  };
}
