import { createTripDiscoveryRepository } from "../repositories/tripDiscoveryRepository";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "../repositories/tripCoreV2Repository";
import { refreshTripDiscovery } from "../sync/tripDiscoveryTransport";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import type { createGuestAdoptionTransport } from "./guestAdoptionTransport";
import { qualifyGuestAdoptionReceiptForRecovery } from "./guestAdoptionReceiptQualification";
import { guestAdoptionPreparationSchema } from "./guestAdoptionPreparation";
import {
  guestSourceCheckpointSchema,
  verifyGuestSourceCheckpoint,
} from "./guestTripP1SourceSchema";
import { guestAdoptionStatusRequestSchema } from "@/domain/auth/guestAdoptionStatus";
import { prepareCoreCacheTransitionCheck } from "../repositories/tripCoreTransitionQualification";
import type { AccountTransitionLease } from "./accountRequestContext";

// The caller supplies the canonical Account database, never the Guest workspace.
// Owning caches only: this does not install a Session or release the Guest source.
export async function restoreGuestAdoption(
  database: CoreDatabase,
  transport: ReturnType<typeof createGuestAdoptionTransport>,
  rawExpected: unknown,
  checkpoint: unknown,
) {
  const expected = guestAdoptionStatusRequestSchema.parse(rawExpected);
  const pinnedCheckpoint = guestSourceCheckpointSchema.parse(checkpoint);
  const reads = transport.targetReads;
  if (reads.scope.accountId !== expected.targetAccountId)
    throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
  const status = await transport.status(expected);
  if (status.status !== "PUBLISHED") throw Error("GUEST_ADOPTION_PUBLISHED_REQUIRED");
  const qualified = await qualifyGuestAdoptionReceiptForRecovery(
    await transport.receipt({ ...expected, ...status.receipt }),
    pinnedCheckpoint,
    expected,
    status,
    tripCoreSha256Hex,
  );
  const receipt = qualified.receipt;
  if (receipt.outcome !== "PUBLISHED") throw Error("GUEST_ADOPTION_PUBLISHED_REQUIRED");
  // Qualification has pinned this checkpoint's schema, bytes, digest and coverage.
  const preparation = guestAdoptionPreparationSchema.parse(
    JSON.parse(pinnedCheckpoint.canonicalText),
  );
  const source = await verifyGuestSourceCheckpoint(preparation.source!, preparation);
  await reads.ensureProfile();
  const discovery = createTripDiscoveryRepository(database, reads.account);
  await refreshTripDiscovery(reads.account, reads.discovery, {
    async replaceSnapshot(scope, trips) {
      if (receipt.trips.some((trip) => !trips.some((row) => row.id === trip.tripId)))
        throw Error("GUEST_ADOPTION_TRIP_READBACK_MISSING");
      await discovery.replaceSnapshot(scope, trips);
    },
  });
  const core = createTripCoreV2Repository(database, reads.account, tripCoreSha256Hex);
  const checks: ((lease: AccountTransitionLease) => Promise<void>)[] = [];
  for (const trip of receipt.trips) {
    const context = { ...reads.scope, tripId: trip.tripId };
    await core.refresh(context, reads.core);
    const snapshot = await core.acceptedSnapshot(context);
    const original = source.trips.find((row) => row.create.tripId === trip.tripId)!;
    if (
      !snapshot ||
      snapshot.actor.personId !== trip.ownerPersonId ||
      original.coreIntents.some(
        ({ command }) =>
          command.target.kind !== "ITEM" ||
          !snapshot.graph.itinerary_events.some(
            (row) =>
              row.id === command.target.id &&
              row.owner_account_id === expected.targetAccountId,
          ),
      )
    )
      throw Error("GUEST_ADOPTION_CORE_READBACK_MISMATCH");
    checks.push(
      prepareCoreCacheTransitionCheck(
        database,
        reads.scope,
        snapshot,
        original.coreIntents.map(({ command }) => command.target.id),
      ),
    );
  }
  await reads.account();
  return Object.freeze({
    receipt,
    authority: "NONE" as const,
    async qualifyLocalCache(lease: AccountTransitionLease) {
      for (const check of checks) await check(lease);
    },
  });
}
