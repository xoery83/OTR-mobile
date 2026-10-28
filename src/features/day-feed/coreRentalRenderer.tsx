import { useState } from "react";
import { View } from "react-native";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { bindRenderer, type DayRowRendererProps } from "./rendererContribution";
import { RentalContent, type RentalFacts } from "./RentalRow";
import { localCalendarDate } from "@/domain/trip/dayReadModel";
import { rentalFactsFromItem, rentalTemporalContext } from "./rentalReadPresentation";
export { knownRentalClock, rentalFactsFromItem } from "./rentalReadPresentation";
export type CoreRentalPresentationActions = {
  instant?: string;
  onOpenRental?(id: string, role: "PICKUP" | "RETURN", date: string): void;
  onInsertRental?(
    id: string,
    role: "PICKUP" | "RETURN",
    date: string,
    side: "BEFORE" | "AFTER",
  ): void;
};
type Facts = {
  rental: RentalFacts;
  pending: boolean;
  actions?: CoreRentalPresentationActions;
};
function CoreRentalRow({
  row,
  depth,
  onDepth,
  context,
  facts,
}: DayRowRendererProps & { facts: Facts }) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const keys = row.coreRowKeys.filter(
    (key) => key.projectionRole === "PICKUP" || key.projectionRole === "RETURN",
  );
  return (
    <View>
      {(depth === "I"
        ? keys.filter(
            (key) => key.projectionRole === (selectedRole ?? keys[0]?.projectionRole),
          )
        : keys
      ).map((key) => {
        const role = key.projectionRole === "RETURN" ? "RETURN" : "PICKUP";
        const selected = (selectedRole ?? keys[0]?.projectionRole) === role;
        const instant = facts.actions?.instant ?? new Date().toISOString();
        const displayContext =
          context && context !== "UNKNOWN"
            ? context
            : rentalTemporalContext(
                facts.rental,
                role,
                instant,
                localCalendarDate(
                  instant,
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                ),
              );
        return (
          <RentalContent
            key={role}
            title={row.item.event.title}
            pickup={role === "PICKUP"}
            back={role === "RETURN"}
            facts={facts.rental}
            pending={facts.pending}
            context={displayContext}
            depth={selected ? depth : "B"}
            onDepth={(next) => {
              setSelectedRole(role);
              if (next === "I" && facts.actions?.onOpenRental)
                facts.actions.onOpenRental(row.item.event.id, role, key.localDate);
              else onDepth(next);
            }}
            onInsert={
              facts.actions?.onInsertRental
                ? (side) =>
                    facts.actions!.onInsertRental!(
                      row.item.event.id,
                      role,
                      key.localDate,
                      side,
                    )
                : undefined
            }
          />
        );
      })}
    </View>
  );
}
// Display adapter over the existing actor-filtered Reader; no new Core authority.
export function createCoreRentalRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreRentalPresentationActions,
) {
  const facts: Record<string, Facts> = {};
  for (const item of projection.items) {
    const event = projection.events.find((event) => event.id === item.itemId);
    if (
      item.tripId !== projection.tripId ||
      !event ||
      event.semantic_revision !== item.itemRevision
    )
      continue;
    const rental = rentalFactsFromItem(item);
    if (rental)
      facts[item.itemId] = {
        rental,
        actions,
        pending:
          item.localState === "PENDING" ||
          projection.source.localTargetIds?.includes(item.itemId) === true,
      };
  }
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P4",
    facts,
    render: CoreRentalRow,
  });
}
