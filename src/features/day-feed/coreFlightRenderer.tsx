import { createElement } from "react";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { bindRenderer } from "./rendererContribution";
import { FlightLegRow } from "./FlightJourneyView";
import { FlightFidelityGrid } from "./FlightFidelityGrid";
import { flightPresentation, type FlightPresentation } from "./presentation";
import {
  flightAirportContext,
  flightAirportTargets,
  openFlightAirport,
} from "./flightAirportActions";

export type CoreFlightPresentationActions = {
  instant?: string;
  onOpenFlight?(itemId: string, itemRevision: number): void;
};
type Facts = { flight: FlightPresentation; itemRevision: number; pending: boolean };
// Existing actor-filtered projection only. Sparse authored facts remain unqualified.
// Qualified/Source service display keeps the existing renderer fallback unchanged.
export function createCoreFlightRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreFlightPresentationActions,
) {
  const facts: Record<string, Facts> = {};
  for (const item of projection.items) {
    const event = projection.events.find((entry) => entry.id === item.itemId);
    const owning = projection.flightFacts[item.itemId];
    if (
      item.family !== "P2" ||
      item.hidden ||
      ["cancelled", "skipped"].includes(String(item.status)) ||
      item.tripId !== projection.tripId ||
      !event ||
      event.semantic_revision !== item.itemRevision ||
      owning?.qualification !== "SPARSE" ||
      owning.services.length !== 0
    )
      continue;
    const flight = flightPresentation(event, [], owning);
    if (flight)
      facts[item.itemId] = {
        flight,
        itemRevision: item.itemRevision,
        pending:
          item.localState === "PENDING" ||
          projection.source.localTargetIds?.includes(item.itemId) === true,
      };
  }
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P2",
    facts,
    render: ({
      row,
      depth,
      onDepth,
      context = "UNKNOWN",
      nextFocused,
      withinMarker,
      facts,
    }) => {
      if (depth === "I")
        return createElement(FlightFidelityGrid, {
          flight: facts.flight,
          immersive: true,
          pending: facts.pending,
          withinMarker,
        });
      const targets = flightAirportTargets(facts.flight);
      return createElement(FlightLegRow, {
        leg: {
          id: row.item.event.id,
          flight: facts.flight,
          ...(targets
            ? {
                map: () => openFlightAirport(targets.map),
                navigate: () => openFlightAirport(targets.navigate),
              }
            : {}),
        },
        focused: depth === "F",
        context:
          context === "UNKNOWN"
            ? flightAirportContext(
                facts.flight,
                actions?.instant ?? new Date().toISOString(),
              )
            : context,
        pending: facts.pending,
        hideDivider: nextFocused,
        onFocus: () => onDepth(depth === "F" ? "B" : "F"),
        onOpen: () =>
          actions?.onOpenFlight
            ? actions.onOpenFlight(row.item.event.id, facts.itemRevision)
            : onDepth("I"),
      });
    },
  });
}
