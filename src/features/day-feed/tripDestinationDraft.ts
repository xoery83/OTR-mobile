import type { LocalTripDestinationInput } from "@/domain/trip/localTripDestination";
import type { TripDestinationDraftSelection } from "@/data/places/tripDestinationSelection";

export function destinationDraft(
  items: readonly LocalTripDestinationInput[],
): readonly TripDestinationDraftSelection[] {
  return items.map((item) =>
    item.source === "MANUAL"
      ? { localId: item.destinationId, text: item.displayLabel, source: "MANUAL" }
      : {
          localId: item.destinationId,
          text: item.displayLabel,
          source: "APPLE",
          match: {
            provider: "apple",
            providerPlaceId: item.providerPlaceId,
            title: item.displayLabel,
            secondary: "",
          },
        },
  );
}
export function destinationInputs(
  items: readonly TripDestinationDraftSelection[],
): readonly LocalTripDestinationInput[] {
  return items.map((item) => {
    if (item.source === "MANUAL")
      return { destinationId: item.localId, displayLabel: item.text, source: "MANUAL" };
    if (!item.match?.providerPlaceId)
      throw new Error("TRIP_DESTINATION_IDENTITY_REQUIRED");
    return {
      destinationId: item.localId,
      displayLabel: item.text,
      source: "APPLE_PLACE_ID",
      provider: "apple",
      providerPlaceId: item.match.providerPlaceId,
    };
  });
}
