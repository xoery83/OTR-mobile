import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { t } from "@/ui/locale";
import { bindRenderer, type DayRowRendererProps } from "./rendererContribution";
import { StayReadRow, StayReadView, type StayRole } from "./StayReadView";
import { localStayPresentation, localStayMapTargets } from "./localStayPresentation";
import type { StayRead } from "./bookingReadPresentation";
import { stayBasePresentationRows } from "./stayBasePresentationRows";
export type CoreStayPresentationActions = {
  onOpenStay?(itemId: string, role: StayRole, date: string): void;
  onInsertStay?(
    itemId: string,
    role: StayRole,
    date: string,
    side: "BEFORE" | "AFTER",
  ): void;
};
type Facts = { stay: StayRead; actions?: CoreStayPresentationActions };
function CoreStayRow({
  row,
  depth,
  onDepth,
  context = "UNKNOWN",
  nextFocused,
  facts,
}: DayRowRendererProps & { facts: Facts }) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const keys = stayBasePresentationRows(
    row.coreRowKeys.map((rowKey) => ({ family: "P3", rowKey })),
  ).map(({ rowKey }) => rowKey);
  const selectedOccurrence = keys.some((key) => key.projectionRole === selectedRole)
    ? selectedRole
    : keys[0]?.projectionRole;
  const role = (value: string): StayRole =>
    value === "CHECKIN" ? "CHECKIN" : value === "CHECKOUT" ? "CHECKOUT" : "BASE";
  if (depth === "I")
    return (
      <StayReadView
        stay={facts.stay}
        role={role(selectedOccurrence ?? "BASE")}
        context={context}
      />
    );
  return (
    <View>
      {keys.map((key, index) => {
        const occurrence = role(key.projectionRole),
          focused = depth === "F" && selectedOccurrence === key.projectionRole;
        return (
          <StayReadRow
            key={key.projectionRole}
            stay={facts.stay}
            role={occurrence}
            focused={focused}
            context={context}
            hideDivider={nextFocused || (index < keys.length - 1 && depth === "F")}
            onFocus={() => {
              setSelectedRole(key.projectionRole);
              onDepth(focused ? "B" : "F");
            }}
            onOpen={() =>
              facts.actions?.onOpenStay
                ? facts.actions.onOpenStay(facts.stay.id, occurrence, key.localDate)
                : onDepth("I")
            }
            onInsert={
              facts.actions?.onInsertStay
                ? (side) =>
                    facts.actions!.onInsertStay!(
                      facts.stay.id,
                      occurrence,
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
// Existing actor-filtered Core read only. Missing original-body/association ports grant no actions.
export function createCoreStayRenderer(
  projection: CoreFlightDayProjection,
  actions?: CoreStayPresentationActions,
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
    const stay = localStayPresentation(item);
    if (!stay) continue;
    const targets = localStayMapTargets(item);
    const open = (url: string) => {
      void Linking.openURL(url).catch(() => Alert.alert(t("p3.mapUnavailable")));
    };
    if (targets) {
      stay.map = () => open(targets.map);
      if (targets.navigate) stay.navigate = () => open(targets.navigate!);
    }
    facts[item.itemId] = { stay, actions };
  }
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P3",
    facts,
    render: CoreStayRow,
  });
}
