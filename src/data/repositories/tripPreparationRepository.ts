import { requireActiveUserId } from "../auth/authRepository";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import {
  createTripCoreV2Repository,
  type CoreAcceptedCertificate,
} from "./tripCoreV2Repository";
import {
  createTripLocalManualReader,
  type LocalManualRead,
} from "./tripLocalManualReadRepository";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
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
// Read identity only, never an admission receipt or a substitute for current actor checks.
export type TripPreparationSourceToken = Readonly<
  { scope: AccountRequestContext } & (
    | { kind: "ACCEPTED"; certificate: CoreAcceptedCertificate }
    | { kind: "LOCAL_MANUAL"; fingerprint: string }
    | { kind: "MIXED"; certificate: CoreAcceptedCertificate; fingerprint: string }
  )
>;
const same = (left: unknown, right: unknown) =>
  canonicalCoreJson(left as Json) === canonicalCoreJson(right as Json);
export function createTripPreparationReader(
  core: Core,
  localTrip: (tripId: string) => Promise<LocalTrip | null>,
  account: () => Promise<string>,
  localManual?: (tripId: string) => Promise<LocalManualRead | null>,
) {
  async function read(tripId: string) {
    coreUuid.parse(tripId);
    const scope = await core.captureContext(tripId);
    const snapshot = await core.acceptedSnapshot(scope);
    const manual = (await localManual?.(tripId)) ?? null;
    await assertAccountRequestContext(scope, account);
    if (manual && !same(manual.scope, scope)) throw new Error("PREPARATION_MANUAL_SCOPE");
    // The two owning reads have separate transactions. Never combine different collections.
    if (localManual) {
      const after = await core.acceptedSnapshot(scope);
      if (!same(snapshot?.certificate ?? null, after?.certificate ?? null))
        throw new Error("PREPARATION_SOURCE_CHANGED");
    }
    const local = !snapshot ? await localTrip(tripId) : null;
    await assertAccountRequestContext(scope, account);
    if (
      !snapshot &&
      !manual &&
      !(local?.id === tripId && local.syncStatus === "PENDING_CREATE")
    )
      return null;
    if (
      snapshot &&
      (snapshot.actor.accountId !== scope.accountId || snapshot.actor.tripId !== tripId)
    )
      throw new Error("PREPARATION_ACTOR_SCOPE");
    const sourceToken: TripPreparationSourceToken | null = snapshot
      ? manual
        ? {
            kind: "MIXED",
            scope,
            certificate: snapshot.certificate,
            fingerprint: manual.source.fingerprint,
          }
        : { kind: "ACCEPTED", scope, certificate: snapshot.certificate }
      : manual
        ? { kind: "LOCAL_MANUAL", scope, fingerprint: manual.source.fingerprint }
        : null;
    const authority = {
      rosterHash: snapshot?.certificate.roster_hash,
      participatingPersonIds: snapshot?.participatingPersonIds,
    };
    const entries =
      snapshot?.graph.itinerary_events.flatMap((row) => {
        const item = projectCoreItem(
          snapshot.graph,
          snapshot.actor,
          String(row.id),
          authority,
        );
        return item && !manual?.hasPendingItem(item.itemId)
          ? [
              {
                item,
                createdAt: typeof row.created_at === "string" ? row.created_at : null,
              },
            ]
          : [];
      }) ?? [];
    const pendingIds = new Set(manual?.items.map((item) => item.itemId) ?? []);
    for (const item of manual?.items ?? [])
      entries.push({ item, createdAt: manual!.itemCreatedAt[item.itemId] ?? null });
    await assertAccountRequestContext(scope, account);
    return {
      scope,
      epoch: snapshot?.certificate.epoch ?? null,
      sourceToken,
      canPlan: snapshot
        ? snapshot.actor.active && snapshot.actor.canManageShared
        : local?.canPlan === true,
      preparation: selectTripPreparation(entries, pendingIds),
    };
  }
  return {
    read,
    async resolveItem(tripId: string, itemId: string, expectedEpoch: string) {
      coreUuid.parse(itemId);
      const current = await read(tripId);
      if (!current || current.epoch !== expectedEpoch) return null;
      const recent = current.preparation.recent.find(
        (entry) => entry.item.itemId === itemId && entry.item.localState === "ACCEPTED",
      );
      return recent
        ? { scope: current.scope, epoch: current.epoch!, item: recent.item }
        : null;
    },
    async resolveItemFromSource(
      tripId: string,
      itemId: string,
      expected: TripPreparationSourceToken,
    ) {
      coreUuid.parse(itemId);
      const current = await read(tripId);
      if (!current?.sourceToken || !same(current.sourceToken, expected)) return null;
      const recent = current.preparation.recent.find(
        (entry) => entry.item.itemId === itemId,
      );
      return recent
        ? {
            scope: current.scope,
            epoch: current.epoch,
            sourceToken: current.sourceToken,
            item: recent.item,
          }
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
    createTripLocalManualReader(database, requireActiveUserId, core),
  );
}
export type TripPreparationRead = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createTripPreparationReader>["read"]>>
>;
