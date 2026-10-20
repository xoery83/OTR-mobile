import { z } from "zod";
import { createUuid } from "@/domain/localId";
import { ApplePlaceError, type ApplePlaceCandidate } from "./applePlaceProvider";

/** Draft interaction state only: not a Canonical Place or a persistence envelope. */
export type TripDestinationDraftSelection = Readonly<{
  localId: string;
  text: string;
  source: "MANUAL" | "APPLE";
  match?: Readonly<{
    provider: "apple";
    providerPlaceId: string | null;
    title: string;
    secondary: string;
    address?: string;
    point?: Readonly<{ latitude: number; longitude: number }>;
    category?: string;
  }>;
}>;
const normalized = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");
function label(value: string) {
  const text = normalized(value);
  if (!text || text.length > 256) throw new ApplePlaceError("DESTINATION_LABEL_INVALID");
  return text;
}
export function manualTripDestination(
  text: string,
  id = createUuid,
): TripDestinationDraftSelection {
  return Object.freeze({
    localId: z.uuid().parse(id()),
    text: label(text),
    source: "MANUAL",
  });
}
export function resolvedTripDestination(
  candidate: ApplePlaceCandidate,
  id = createUuid,
): TripDestinationDraftSelection {
  if (candidate.provider !== "apple" || candidate.kind !== "mapItem")
    throw new ApplePlaceError("DESTINATION_NOT_RESOLVED");
  const point = candidate.point ? Object.freeze({ ...candidate.point }) : undefined;
  return Object.freeze({
    localId: z.uuid().parse(id()),
    text: label(candidate.title),
    source: "APPLE",
    match: Object.freeze({
      provider: "apple",
      providerPlaceId: candidate.providerPlaceId ?? null,
      title: candidate.title,
      secondary: candidate.secondary,
      ...(candidate.address === undefined ? {} : { address: candidate.address }),
      ...(point === undefined ? {} : { point }),
      ...(candidate.category === undefined ? {} : { category: candidate.category }),
    }),
  });
}
/** Normalized draft dedup without inventing cross-source or global place identity. */
export function sameTripDestination(
  a: TripDestinationDraftSelection,
  b: TripDestinationDraftSelection,
): boolean {
  if (a.source !== b.source) return false;
  if (
    a.match?.providerPlaceId &&
    b.match?.providerPlaceId &&
    a.match.providerPlaceId === b.match.providerPlaceId
  )
    return true;
  if (
    normalized(a.match?.title ?? a.text).toLowerCase() !==
    normalized(b.match?.title ?? b.text).toLowerCase()
  )
    return false;
  if (!a.match || !b.match) return true;
  if (
    normalized(a.match.secondary).toLowerCase() !==
    normalized(b.match.secondary).toLowerCase()
  )
    return false;
  if (a.match.point && b.match.point)
    return (
      a.match.point.latitude === b.match.point.latitude &&
      a.match.point.longitude === b.match.point.longitude
    );
  return true;
}
export function addTripDestination(
  items: readonly TripDestinationDraftSelection[],
  item: TripDestinationDraftSelection,
): readonly TripDestinationDraftSelection[] {
  return items.some((existing) => sameTripDestination(existing, item))
    ? items
    : Object.freeze([...items, item]);
}
export function removeTripDestination(
  items: readonly TripDestinationDraftSelection[],
  localId: string,
): readonly TripDestinationDraftSelection[] {
  return Object.freeze(items.filter((item) => item.localId !== localId));
}
