// Read-through local safety guard only; these records never grant cloud authority.
const pending = new Set<string>();

export function noteGuestPublicationRequested(localId: string) {
  pending.add(localId);
}
export function noteInspectedGuestPublications(
  localId: string,
  adoptionIds: readonly string[],
) {
  if (adoptionIds.length) pending.add(localId);
  else pending.delete(localId);
}
export function hasGuestPublicationHold(localId: string) {
  return pending.has(localId);
}
export function assertGuestPublicationNotRequested(localId: string) {
  if (pending.has(localId)) throw Error("GUEST_PUBLICATION_STATUS_REQUIRED");
}
