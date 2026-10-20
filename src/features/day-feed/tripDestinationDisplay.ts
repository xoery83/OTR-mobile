/** Presentation only: never serialize this summary into the legacy destination Writer. */
export function tripDestinationDisplay(trip: {
  destination?: string | null;
  destinations?: readonly { displayLabel: string }[];
}): string | null {
  return trip.destinations?.length
    ? trip.destinations.map((place) => place.displayLabel).join(" · ")
    : trip.destination || null;
}
