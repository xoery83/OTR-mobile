import type { ImageSourcePropType } from "react-native";
import { tripCoverId, type BuiltInTripCoverId } from "./tripCoverSelection";
export { builtInTripCoverIds, tripCoverId } from "./tripCoverSelection";

const sources: Record<BuiltInTripCoverId, ImageSourcePropType> = {
  "cultural-oldtown": require("../../../assets/trips/covers/cultural-oldtown.jpg"),
  city: require("../../../assets/trips/covers/city.jpg"),
  coast: require("../../../assets/trips/covers/coast.jpg"),
  mountain: require("../../../assets/trips/covers/mountain.jpg"),
};

export const tripCoverSource = (
  trip: Readonly<{ id: string; selectedCoverAssetId?: BuiltInTripCoverId | null }>,
) => sources[tripCoverId(trip)];

export const builtInTripCoverSource = (id: BuiltInTripCoverId) => sources[id];
