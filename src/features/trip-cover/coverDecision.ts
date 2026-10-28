import { isTripCoverAssetId, type TripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import {
  configureProductionGeo,
  rankCoverAssets,
  type ProductionAsset,
  type ProductionRank,
} from "../../../vendor/otr-cover-core/frozenExports";
import type { GeoEntity } from "../../../vendor/otr-cover-core/geo";

export type CoverMetadata = Readonly<{
  id: string;
  name?: string;
  destination?: string | null;
  destinations?: readonly { displayLabel: string }[];
  selectedCoverAssetId?: TripCoverAssetId | null;
  selectedCoverAssetIdRaw?: string | null;
}>;
export const coverCatalog: readonly ProductionAsset[] = require("../../../vendor/otr-cover-core/catalog.json");
let configured = false;
const cache = new Map<string, readonly ProductionRank[]>();
export function rankedTripCovers(
  trip: CoverMetadata,
  limit = 1,
): readonly ProductionRank[] {
  if (!configured) {
    const geo: {
      entities: GeoEntity[];
    } = require("../../../vendor/otr-cover-core/geo.json");
    configureProductionGeo(geo.entities);
    configured = true;
  }
  // Geographic matching keeps the complete labels; UI summaries may omit countries.
  const destination = trip.destinations?.length
    ? trip.destinations.map((place) => place.displayLabel).join(" · ")
    : trip.destination || null;
  const key = JSON.stringify([trip.id, trip.name ?? "", destination, limit]);
  const previous = cache.get(key);
  if (previous) return previous;
  const result = rankCoverAssets(
    {
      tripId: trip.id,
      name: trip.name ?? "",
      destination,
      allowPendingLandmarkPreview: true,
    },
    coverCatalog,
    {},
    limit,
  );
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
export function rawTripCover(trip: CoverMetadata): string | null | undefined {
  if (trip.selectedCoverAssetIdRaw !== undefined) return trip.selectedCoverAssetIdRaw;
  return isTripCoverAssetId(trip.selectedCoverAssetId)
    ? trip.selectedCoverAssetId
    : undefined;
}
const fallbackIds = ["city", "coast", "mountain"] as const;
export function legacyTripCover(tripId: string) {
  let value = 0;
  for (const character of tripId) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return fallbackIds[value % fallbackIds.length];
}
export function resolveTripCover(trip: CoverMetadata): Readonly<{
  assetId: TripCoverAssetId;
  mode: "manual" | "automatic" | "legacy_fallback" | "unavailable_manual";
}> {
  const raw = rawTripCover(trip);
  if (isTripCoverAssetId(raw)) return { assetId: raw, mode: "manual" };
  if (raw !== null)
    return { assetId: legacyTripCover(trip.id), mode: "unavailable_manual" };
  const first = rankedTripCovers(trip)[0];
  return first && isTripCoverAssetId(first.asset.id)
    ? { assetId: first.asset.id, mode: "automatic" }
    : { assetId: legacyTripCover(trip.id), mode: "legacy_fallback" };
}
