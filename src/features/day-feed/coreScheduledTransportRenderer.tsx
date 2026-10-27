import { createElement } from "react";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { bindRenderer } from "./rendererContribution";
import {
  ScheduledTransportRow,
  type ScheduledTransportFacts,
} from "./ScheduledTransportRow";

import { transportFactsFromItem } from "./transportReadPresentation";
export { knownTransportClock, transportFactsFromItem } from "./transportReadPresentation";
export type CoreScheduledTransportPresentationActions = {
  onOpenTransport?(id: string, role: "ORIGIN" | "DESTINATION", date: string): void;
  onInsertTransport?(
    id: string,
    role: "ORIGIN" | "DESTINATION",
    date: string,
    side: "BEFORE" | "AFTER",
  ): void;
};
export function createCoreScheduledTransportRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreScheduledTransportPresentationActions,
) {
  const facts: Record<string, ScheduledTransportFacts> = {};
  for (const item of projection.items) {
    const event = projection.events.find((event) => event.id === item.itemId);
    if (
      item.tripId !== projection.tripId ||
      !event ||
      event.semantic_revision !== item.itemRevision
    )
      continue;
    const value = transportFactsFromItem(item);
    if (value)
      facts[item.itemId] = {
        ...value,
        pending:
          value.pending ||
          projection.source.localTargetIds?.includes(item.itemId) === true,
      };
  }
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P5",
    facts,
    render: (props) => {
      const key = props.row.coreRowKeys[0];
      const role = key?.projectionRole === "DESTINATION" ? "DESTINATION" : "ORIGIN";
      return createElement(ScheduledTransportRow, {
        ...props,
        onDepth: (depth) =>
          depth === "I" && actions?.onOpenTransport && key
            ? actions.onOpenTransport(props.row.item.event.id, role, key.localDate)
            : props.onDepth(depth),
        onInsert:
          actions?.onInsertTransport && key
            ? (side) =>
                actions.onInsertTransport!(
                  props.row.item.event.id,
                  role,
                  key.localDate,
                  side,
                )
            : undefined,
      });
    },
  });
}
