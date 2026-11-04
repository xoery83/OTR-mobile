import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  normalizePlaceQuery,
  type ApplePlaceCandidate,
  type PlaceSearchBinding,
} from "@/data/places/applePlaceProvider";

// Read existing local Trip labels only; never infer coordinates or use device location.
export async function readTripPlaceSearchRegions(binding: PlaceSearchBinding) {
  const current = () =>
    binding.isCurrent() && binding.accountGeneration === getAccountGeneration();
  if (!binding.tripId || !current()) return [];
  const { readLocalTripPrincipal, readLocalTripRepository } =
    await import("@/data/auth/localTripAccess");
  const principal = await readLocalTripPrincipal();
  const owner =
    principal?.kind === "ACCOUNT"
      ? principal.accountId
      : principal?.kind === "GUEST"
        ? principal.localId
        : null;
  if (!current() || owner !== binding.accountId) return [];
  const repository = await readLocalTripRepository();
  if (!current()) return [];
  const trip = (await repository.listTrips()).find(
    (value) => value.id === binding.tripId,
  );
  if (!current() || !trip) return [];
  const labels = trip.destinations?.length
    ? trip.destinations.map((value) => value.displayLabel)
    : trip.destination
      ? [trip.destination]
      : [];
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))].slice(0, 20);
}

export function uniqueTripSearchRegion(
  label: string,
  rows: readonly ApplePlaceCandidate[],
) {
  const tokens = normalizePlaceQuery(label).tokens;
  if (!tokens.length) return null;
  const matches = rows.filter((row) => {
    if (
      row.kind !== "mapItem" ||
      !row.area ||
      row.area.label !== row.title ||
      row.area.qualifier !== row.secondary ||
      !row.point ||
      !Number.isFinite(row.point.latitude) ||
      !Number.isFinite(row.point.longitude) ||
      Math.abs(row.point.latitude) > 90 ||
      Math.abs(row.point.longitude) > 180 ||
      (!row.point.latitude && !row.point.longitude)
    )
      return false;
    const found = new Set(normalizePlaceQuery(`${row.title} ${row.secondary}`).tokens);
    return tokens.every((token) => found.has(token));
  });
  return matches.length === 1 ? matches[0] : null;
}
