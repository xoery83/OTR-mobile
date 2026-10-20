import { tripCoverAssetIds } from "@/domain/trip/tripCoverAssets";
import {
  resolveTripCover,
  type CoverMetadata,
} from "@/features/trip-cover/coverDecision";
export type { BuiltInTripCoverId } from "@/domain/trip/types";
export const builtInTripCoverIds = tripCoverAssetIds;
export function tripCoverId(trip: CoverMetadata) {
  return resolveTripCover(trip).assetId;
}
