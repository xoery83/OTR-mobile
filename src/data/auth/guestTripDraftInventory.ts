import type { GuestTripDraftSnapshot } from "@/domain/auth/guestTripDraft";
import { createGuestDraftInventory, type GuestDraftScope } from "./guestDraftInventory";
import { assertGuestDraftScope } from "./guestP1DraftInventory";

export function createGuestTripDraftInventory(
  assertScope: (scope: GuestDraftScope) => Promise<void>,
) {
  return createGuestDraftInventory<
    GuestTripDraftSnapshot,
    "otr.auth.guest-trip-drafts/1"
  >(assertScope, "otr.auth.guest-trip-drafts/1", (snapshot) => snapshot.draftId);
}
export const guestTripDraftInventory =
  createGuestTripDraftInventory(assertGuestDraftScope);
