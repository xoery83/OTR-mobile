import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import {
  guestTripDraftHasOnlyStaticCovers,
  guestTripDraftSnapshotSchema,
} from "@/domain/auth/guestTripDraft";
import { openGuestLocalWorkspace, type GuestLocalWorkspace } from "./guestLocalWorkspace";
import { guestP1DraftInventory } from "./guestP1DraftInventory";
import { guestTripDraftInventory } from "./guestTripDraftInventory";
import { verifyGuestAdoptionDrafts } from "./guestAdoptionRecovery";
import { hasGuestPublicationHold } from "./guestPublicationHold";
import { guestCensusTablesSha256 } from "./guestRegisteredFileQualification";

type TripLease = Awaited<ReturnType<typeof guestTripDraftInventory.freeze>>;
type P1Lease = Awaited<ReturnType<typeof guestP1DraftInventory.freeze>>;

export function createGuestHandoffInventory(deps: {
  openWorkspace(): Promise<GuestLocalWorkspace>;
  tripDrafts: Pick<typeof guestTripDraftInventory, "freeze">;
  p1Drafts: Pick<typeof guestP1DraftInventory, "freeze">;
}) {
  return async () => {
    const workspace = await deps.openWorkspace();
    const vault = await workspace.freezeForInventory();
    const scope = vault.scope;
    let trips: TripLease | undefined, p1: P1Lease | undefined;
    let resumeRequested = false,
      resumed = false;
    let resuming: Promise<void> | null = null;
    const assertNoPublication = () => {
      if (hasGuestPublicationHold(scope.localId))
        throw Error("GUEST_HANDOFF_STATUS_REQUIRED");
    };
    async function resumeEditors() {
      let failure: unknown;
      for (const lease of [p1, trips]) {
        try {
          await lease?.resume();
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    }
    async function resumeGuestBeforePublication() {
      if (resumed) return;
      if (resuming) return resuming;
      assertNoPublication();
      resumeRequested = true;
      resuming = (async () => {
        try {
          await vault.release(resumeEditors);
          resumed = true;
        } catch (error) {
          // A superseded scope may retire its UI leases; UNKNOWN must retain them.
          if (!hasGuestPublicationHold(scope.localId)) {
            try {
              await resumeEditors();
            } catch (cleanupError) {
              throw new AggregateError(
                [error, cleanupError],
                "GUEST_HANDOFF_INVENTORY_RECOVERY_REQUIRED",
              );
            }
          }
          throw error;
        }
      })();
      try {
        await resuming;
      } finally {
        resuming = null;
      }
    }
    async function assertCurrent() {
      if (resumeRequested) throw Error("GUEST_HANDOFF_INVENTORY_RELEASED");
      assertNoPublication();
      await vault.assertCurrent();
      await trips?.assertCurrent();
      await p1?.assertCurrent();
      if (resumeRequested) throw Error("GUEST_HANDOFF_INVENTORY_RELEASED");
      assertNoPublication();
    }
    try {
      trips = await deps.tripDrafts.freeze(scope);
      p1 = await deps.p1Drafts.freeze(scope);
      const files = await vault.readRegisteredFileQualification();
      const drafts = Object.freeze(
        [...trips.entries, ...p1.entries].map((entry) => Object.freeze({ ...entry })),
      );
      for (const entry of trips.entries) {
        const body = guestTripDraftSnapshotSchema.parse(JSON.parse(entry.canonicalText));
        if (!guestTripDraftHasOnlyStaticCovers(body))
          throw Error("GUEST_REGISTERED_FILES_QUALIFICATION_REQUIRED");
      }
      const census = await vault.readCensus({
        sourceGuestLocalId: scope.localId,
        generation: scope.generation,
        files: { status: "COMPLETE", entries: [...files.entries] },
        liveDrafts: {
          status: "COMPLETE",
          entries: drafts.map(({ id, sha256, bytes }) => ({ id, sha256, bytes })),
        },
      });
      if (
        !census.readyForServerPreflight ||
        !census.inventorySha256 ||
        (await guestCensusTablesSha256(census.tables)) !== files.sourceTablesSha256
      )
        throw Error("GUEST_HANDOFF_DATASET_CHANGED_OR_UNSUPPORTED");
      await verifyGuestAdoptionDrafts({
        schemaId: "otr.auth.guest-adoption-recovery/2",
        sourceGuestLocalId: scope.localId,
        tripIds: [...census.tripIds],
        drafts: [...drafts],
      });
      await assertCurrent();
      // JSON input is now verified; do not expose a mutable preflight counter/table view.
      const stable = JSON.parse(
        canonicalCoreJson(census as unknown as Json),
      ) as typeof census;
      Object.freeze(stable.totals);
      Object.freeze(stable.tripIds);
      Object.freeze(stable.blockers);
      stable.tables.forEach(Object.freeze);
      Object.freeze(stable.tables);
      Object.freeze(stable.scope);
      Object.freeze(stable);
      return Object.freeze({
        schemaId: "otr.auth.guest-handoff-inventory/1" as const,
        scope,
        census: stable,
        files,
        drafts,
        assertCurrent,
        resumeGuestBeforePublication,
        cloudAuthority: false as const,
      });
    } catch (error) {
      try {
        await resumeGuestBeforePublication();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "GUEST_HANDOFF_INVENTORY_RECOVERY_REQUIRED",
        );
      }
      throw error;
    }
  };
}

export const freezeGuestHandoffInventory = createGuestHandoffInventory({
  openWorkspace: openGuestLocalWorkspace,
  tripDrafts: guestTripDraftInventory,
  p1Drafts: guestP1DraftInventory,
});
