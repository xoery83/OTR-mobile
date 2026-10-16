import { requireActiveUserId } from "../auth/authRepository";
import { assertAccountRequestContext } from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";
import { createTripRepository } from "./tripRepository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { selectTripPreparation } from "@/domain/trip/tripPreparation";
import { coreUuid } from "@/domain/trip/tripCoreV2";

type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "acceptedSnapshot"
>;
type LocalTrip = { id: string; syncStatus: string; canPlan: boolean };
export function createTripPreparationReader(
  core: Core,
  localTrip: (tripId: string) => Promise<LocalTrip | null>,
  account: () => Promise<string>,
) {
  async function read(tripId: string) {
    coreUuid.parse(tripId);
    const scope = await core.captureContext(tripId);
    const snapshot = await core.acceptedSnapshot(scope);
    if (!snapshot) {
      const local = await localTrip(tripId);
      await assertAccountRequestContext(scope, account);
      // A pending local container has no admitted Items; it grants no Hosted rights.
      return local?.id === tripId && local.syncStatus === "PENDING_CREATE"
        ? {
            scope,
            epoch: null,
            canPlan: local.canPlan,
            preparation: selectTripPreparation([]),
          }
        : null;
    }
    if (snapshot.actor.accountId !== scope.accountId || snapshot.actor.tripId !== tripId)
      throw new Error("PREPARATION_ACTOR_SCOPE");
    const authority = {
      rosterHash: snapshot.certificate.roster_hash,
      participatingPersonIds: snapshot.participatingPersonIds,
    };
    const entries = snapshot.graph.itinerary_events.flatMap((row) => {
      const item = projectCoreItem(
        snapshot.graph,
        snapshot.actor,
        String(row.id),
        authority,
      );
      return item
        ? [
            {
              item,
              createdAt: typeof row.created_at === "string" ? row.created_at : null,
            },
          ]
        : [];
    });
    await assertAccountRequestContext(scope, account);
    return {
      scope,
      epoch: snapshot.certificate.epoch,
      canPlan: snapshot.actor.active && snapshot.actor.canManageShared,
      preparation: selectTripPreparation(entries),
    };
  }
  return {
    read,
    async resolveItem(tripId: string, itemId: string, expectedEpoch: string) {
      coreUuid.parse(itemId);
      const current = await read(tripId);
      if (!current || current.epoch !== expectedEpoch) return null;
      const recent = current.preparation.recent.find(
        (entry) => entry.item.itemId === itemId,
      );
      // Only rendered recent rows are actionable; re-read permissions and epoch at tap.
      return recent
        ? { scope: current.scope, epoch: current.epoch, item: recent.item }
        : null;
    },
  };
}
export async function readTripPreparation() {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    tripCoreSha256Hex,
  );
  const trips = createTripRepository(database, requireActiveUserId, core);
  return createTripPreparationReader(
    core,
    async (tripId) => {
      const local = await trips.getTrip(tripId);
      if (!local) return null;
      const scope = await core.captureContext(tripId);
      const creator = await database.getFirstAsync<{ trip_id: string }>(
        `SELECT binding.trip_id FROM local_trip_ledger_bindings binding
       JOIN local_trip_containers trip ON trip.account_id=binding.account_id AND trip.id=binding.trip_id
       JOIN sync_operations op ON op.id=binding.create_operation_id AND op.id=trip.create_operation_id
       WHERE binding.account_id=? AND binding.trip_id=? AND trip.accepted_at IS NULL
         AND op.owner_user_id=binding.account_id AND op.trip_id=binding.trip_id
         AND op.entity_id=binding.trip_id AND op.id=op.idempotency_key
         AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'
         AND op.status IN ('PENDING','DEPENDENCY_BLOCKED','PROCESSING','RETRYABLE')`,
        scope.accountId,
        tripId,
      );
      await assertAccountRequestContext(scope, requireActiveUserId);
      return { ...local, canPlan: creator !== null };
    },
    requireActiveUserId,
  );
}
export type TripPreparationRead = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createTripPreparationReader>["read"]>>
>;
