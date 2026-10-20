import { isTripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import {
  rankedTripCovers,
  type CoverMetadata,
} from "@/features/trip-cover/coverDecision";

export function suggestedCoverIds(trip: CoverMetadata, currentId?: string | null) {
  return rankedTripCovers(trip, isTripCoverAssetId(currentId) ? 7 : 6)
    .map((row) => row.asset.id)
    .filter(isTripCoverAssetId)
    .filter((id) => id !== currentId)
    .slice(0, 6);
}
