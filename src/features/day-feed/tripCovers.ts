import type { TripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import type { CoverMetadata } from "@/features/trip-cover/coverDecision";
import { tripCoverSources } from "@/features/trip-cover/tripCoverSources";
import { tripCoverId } from "./tripCoverSelection";
export { builtInTripCoverIds, tripCoverId } from "./tripCoverSelection";
export const tripCoverSource = (trip: CoverMetadata) =>
  tripCoverSources[tripCoverId(trip)];
export const builtInTripCoverSource = (id: TripCoverAssetId) => tripCoverSources[id];
