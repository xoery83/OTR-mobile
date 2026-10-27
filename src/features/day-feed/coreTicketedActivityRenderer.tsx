import { createElement } from "react";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { bindRenderer } from "./rendererContribution";
import { TicketedActivityRow, type TicketedActivityFacts } from "./TicketedActivityRow";
import { activityFactsFromItem } from "./activityReadPresentation";
export { activityPlannedClock } from "./activityReadPresentation";
export function coreTicketedActivityFacts(
  projection: CoreFlightDayProjection,
): Record<string, TicketedActivityFacts> {
  const facts: Record<string, TicketedActivityFacts> = {};
  for (const item of projection.items) {
    const event = projection.events.find((event) => event.id === item.itemId);
    if (
      item.tripId !== projection.tripId ||
      !event ||
      event.semantic_revision !== item.itemRevision
    )
      continue;
    const value = activityFactsFromItem(item);
    if (value)
      facts[item.itemId] = {
        ...value,
        pending:
          value.pending ||
          projection.source.localTargetIds?.includes(item.itemId) === true,
      };
  }
  return facts;
}
export type CoreActivityPresentationActions = {
  onOpenActivity?(id: string, role: "START" | "END", date: string): void;
  onInsertActivity?(
    id: string,
    role: "START" | "END",
    date: string,
    side: "BEFORE" | "AFTER",
  ): void;
};
export function createCoreTicketedActivityRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreActivityPresentationActions,
) {
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P6",
    facts: coreTicketedActivityFacts(projection),
    render: (props) => {
      const key = props.row.coreRowKeys[0];
      const role = key?.projectionRole === "END" ? "END" : "START";
      return createElement(TicketedActivityRow, {
        ...props,
        onDepth: (depth) =>
          depth === "I" && actions?.onOpenActivity && key
            ? actions.onOpenActivity(props.row.item.event.id, role, key.localDate)
            : props.onDepth(depth),
        onInsert:
          actions?.onInsertActivity && key
            ? (side) =>
                actions.onInsertActivity!(
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
