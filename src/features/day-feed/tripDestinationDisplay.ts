/** Presentation only: never serialize this summary into the legacy destination Writer. */
export function tripDestinationDisplay(trip: {
  destination?: string | null;
  destinations?: readonly { displayLabel: string }[];
}): string | null {
  const destinations = trip.destinations;
  if (!destinations?.length) return trip.destination || null;
  if (destinations.length === 1) return destinations[0].displayLabel;
  // Stored labels retain full geography; only multi-destination summaries use the leading place name.
  return destinations
    .map(({ displayLabel }) => displayLabel.split(/[,，]/u)[0].trim() || displayLabel)
    .join(" · ");
}
