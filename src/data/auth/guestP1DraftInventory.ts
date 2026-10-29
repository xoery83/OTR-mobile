import type { ManualPlanFields } from "../repositories/manualPlanRepository";
import { requireCommittedGuestPrincipal } from "./authRepository";
import { getAccountGeneration } from "./accountGeneration";

import { createGuestDraftInventory, type GuestDraftScope } from "./guestDraftInventory";
type Scope = GuestDraftScope;
export type GuestP1DraftParticipant = {
  freeze(): {
    snapshot: {
      schemaId: "otr.auth.guest-p1-draft/1";
      tripId: string;
      itemId: string;
      mode: "CREATE" | "EDIT";
      fields: ManualPlanFields;
      initialFields: ManualPlanFields;
      firstAttempt: null;
      placeSelection: null;
    };
    isCurrent(): boolean;
    resume(): void;
  };
};

export function createGuestP1DraftInventory(
  assertScope: (scope: Scope) => Promise<void>,
) {
  return createGuestDraftInventory<
    ReturnType<GuestP1DraftParticipant["freeze"]>["snapshot"],
    "otr.auth.guest-p1-drafts/1"
  >(assertScope, "otr.auth.guest-p1-drafts/1", (snapshot) => snapshot.itemId);
}

export async function assertGuestDraftScope(scope: Scope) {
  const generation = getAccountGeneration();
  const principal = await requireCommittedGuestPrincipal();
  if (
    scope.kind !== "GUEST" ||
    scope.localId !== principal.localId ||
    scope.generation !== generation ||
    generation !== getAccountGeneration()
  )
    throw Error("GUEST_DRAFT_SCOPE_CHANGED");
}

export const guestP1DraftInventory = createGuestP1DraftInventory(assertGuestDraftScope);
