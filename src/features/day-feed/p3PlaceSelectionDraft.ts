import type { ApplePlaceCandidate } from "@/data/places/applePlaceProvider";
import {
  appleSelectedPlaceDraftSchema,
  type AppleSelectedPlaceDraft,
} from "@/data/places/appleSelectedPlaceDraft";

export type P3PlaceSelectionBinding = Readonly<{
  tripId: string;
  itemId: string;
  accountGeneration: number;
  inputRevision: number;
  location: string | null;
}>;
export type P3PlaceSelectionDraft = AppleSelectedPlaceDraft;

// Called only after the existing provider/session selection fence has succeeded.
export function p3PlaceSelectionDraft(
  place: ApplePlaceCandidate,
  binding: P3PlaceSelectionBinding,
): P3PlaceSelectionDraft | null {
  if (
    place.provider !== "apple" ||
    place.kind !== "mapItem" ||
    !place.address?.trim() ||
    place.address.trim() !== binding.location?.trim() ||
    !Number.isSafeInteger(binding.inputRevision) ||
    binding.inputRevision < 1
  )
    return null;
  const parsed = appleSelectedPlaceDraftSchema.safeParse({
    authority: "UNACCEPTED_PROVIDER_DRAFT",
    binding: { ...binding },
    provider: "apple",
    selectionSessionId: place.sessionId,
    selectionGeneration: place.generation,
    ...(place.providerPlaceId ? { providerPlaceId: place.providerPlaceId } : {}),
    ...(place.addressComponents
      ? { addressComponents: Object.freeze({ ...place.addressComponents }) }
      : {}),
    ...(place.point ? { point: Object.freeze({ ...place.point }) } : {}),
  });
  return parsed.success
    ? Object.freeze({
        ...parsed.data,
        binding: Object.freeze(parsed.data.binding),
        ...(parsed.data.addressComponents
          ? { addressComponents: Object.freeze(parsed.data.addressComponents) }
          : {}),
        ...(parsed.data.point ? { point: Object.freeze(parsed.data.point) } : {}),
      })
    : null;
}
export function currentP3PlaceSelection(
  draft: P3PlaceSelectionDraft | null,
  binding: P3PlaceSelectionBinding,
) {
  return draft &&
    (Object.keys(binding) as (keyof P3PlaceSelectionBinding)[]).every(
      (key) => draft.binding[key] === binding[key],
    )
    ? draft
    : null;
}
