import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { guestP1DraftInventory } from "@/data/auth/guestP1DraftInventory";
import type { GuestDraftScope } from "@/data/auth/guestDraftInventory";
import type {
  ManualStayDraft,
  ManualStayFields,
  ManualStayRepository,
} from "@/data/repositories/manualStayRepository";
import type { P3PlaceSelectionDraft } from "./p3PlaceSelectionDraft";

export type GuestStayEditorMemory = {
  source: { repository: ManualStayRepository; draft: ManualStayDraft };
  fields: ManualStayFields;
  initial: string;
  firstAttempt: ManualStayFields | null;
  firstPlaceAttempt: P3PlaceSelectionDraft | null;
  selectedPlace: P3PlaceSelectionDraft | null;
  inputRevision: number;
  frozen: boolean;
};
// Only an in-process Form lease: never serialized as an adoptable P1 snapshot.
const leases = new Map<
  string,
  {
    recover(): GuestStayEditorMemory | null;
    acquire(): void;
    detach(): void;
    retain(read: () => GuestStayEditorMemory | null): void;
    release(): void;
  }
>();
export function retainGuestStayEditor(
  scope: GuestDraftScope,
  tripId: string,
  itemId?: string,
) {
  if (scope.generation !== getAccountGeneration())
    throw Error("GUEST_DRAFT_SCOPE_CHANGED");
  const key = JSON.stringify([scope.localId, scope.generation, tripId, itemId ?? null]);
  const existing = leases.get(key);
  if (existing) return existing;
  let read: () => GuestStayEditorMemory | null = () => null;
  let attached = false;
  const unregister = guestP1DraftInventory.register({
    freeze(): never {
      throw Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
    },
  });
  let stop = () => {};
  const lease = {
    recover: () => read(),
    acquire() {
      if (attached) throw Error("GUEST_P3_EDITOR_BUSY");
      attached = true;
    },
    detach() {
      const retained = read();
      read = () => retained;
      attached = false;
    },
    retain(next: typeof read) {
      read = next;
    },
    release() {
      if (leases.get(key) !== lease) return;
      leases.delete(key);
      unregister();
      stop();
      read = () => null;
    },
  };
  leases.set(key, lease);
  stop = subscribeAccountGeneration(() => {
    if (scope.generation !== getAccountGeneration()) lease.release();
  });
  return lease;
}
