import type { BuiltInTripCoverId } from "@/domain/trip/types";
export type { BuiltInTripCoverId } from "@/domain/trip/types";
export const builtInTripCoverIds = [
  "city",
  "coast",
  "mountain",
  "cultural-oldtown",
] as const;
const initialFallbackIds = ["city", "coast", "mountain"] as const;

export function tripCoverId(
  trip: Readonly<{ id: string; selectedCoverAssetId?: BuiltInTripCoverId | null }>,
): BuiltInTripCoverId {
  const selected = trip.selectedCoverAssetId;
  if (selected && builtInTripCoverIds.includes(selected)) return selected;
  // Stable across launches and offline, without inferring a destination from a name.
  let value = 0;
  for (const character of trip.id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  // Keep this initial assignment pool fixed when the selectable library grows.
  return initialFallbackIds[value % initialFallbackIds.length];
}
