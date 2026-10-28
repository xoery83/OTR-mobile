import { createElement } from "react";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { bindRenderer } from "./rendererContribution";
import { P1Row } from "./P1Row";
import type { P1ReadFacts } from "./p1ReadPresentation";

// Consume the existing actor-filtered Core projection; missing associations grant no actions.
export type CoreP1PresentationActions = {
  instant?: string;
  insertionToday?: string | null;
  onInsert?(itemId: string, side: "BEFORE" | "AFTER", date: string): void;
};
export function createCoreP1Renderer(
  projection: CoreFlightDayProjection,
  actions?: CoreP1PresentationActions,
) {
  const facts: Record<string, P1ReadFacts> = {};
  for (const item of projection.items) {
    const event = projection.events.find((entry) => entry.id === item.itemId);
    if (
      item.family !== "P1" ||
      item.hidden ||
      item.tripId !== projection.tripId ||
      !event ||
      event.semantic_revision !== item.itemRevision
    )
      continue;
    const mode = item.participation.mode;
    const personIds = item.participation.personIds.filter(
      (id): id is string => typeof id === "string",
    );
    const participation: P1ReadFacts["participation"] =
      mode === "WHOLE_GROUP" || mode === "SELF"
        ? { mode }
        : mode === "SELECTED_MEMBERS" && personIds.length
          ? { mode, personIds }
          : undefined;
    facts[item.itemId] = {
      itemId: item.itemId,
      semanticRevision: event.semantic_revision,
      ...(typeof item.description === "string" ? { note: item.description } : {}),
      ...(participation ? { participation } : {}),
      documentIds: item.documentSummaries
        .map((document) => document.id)
        .filter((id): id is string => typeof id === "string"),
      pending:
        item.localState === "PENDING" ||
        projection.source.localTargetIds?.includes(item.itemId) === true,
      // expenseLinkIds are link identities, not deduplicated Expense IDs; do not count them.
    };
  }
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P1",
    facts,
    render: ({ row, depth, onDepth, context, nextFocused, withinMarker, facts }) =>
      createElement(P1Row, {
        event: row.item.event,
        depth,
        onDepth,
        context,
        facts,
        instant: actions?.instant,
        insertionToday: actions?.insertionToday,
        onInsert: actions?.onInsert
          ? (side) => {
              const date = row.item.event.boundaries.find(
                (boundary) => boundary.role === "START",
              )?.local_date;
              if (date) actions.onInsert!(row.item.event.id, side, date);
            }
          : undefined,
        withinMarker,
        hideDivider: nextFocused,
        occurrence:
          row.item.roles.includes("END") && !row.item.roles.includes("START")
            ? "END"
            : "START",
      }),
  });
}
