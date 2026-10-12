import { Text, StyleSheet } from "react-native";
import { P1Row } from "@/features/day-feed/P1Row";
import { bindRenderer } from "@/features/day-feed/rendererContribution";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayRowRendererProps } from "@/features/day-feed/rendererContribution";
import type { FixtureContribution } from "./contribution";
import type { StaySupplement } from "./stayContribution";

export function StayFixtureRow({
  row,
  depth,
  onDepth,
  withinMarker,
  facts,
}: DayRowRendererProps & { facts: StaySupplement }) {
  const styles = useThemedStyles(createStyles);
  const role = row.coreRowKeys[0]?.projectionRole;
  return (
    <P1Row
      event={{
        ...row.item.event,
        temporal_shape: "STAY",
        boundaries: [
          { ...row.item.event.boundaries[0], role: "START", local_date: facts.checkin },
          { ...row.item.event.boundaries[0], role: "END", local_date: facts.checkout },
        ],
      }}
      depth={depth}
      onDepth={onDepth}
      withinMarker={withinMarker}
    >
      <Text style={styles.copy}>
        {t("dayLab.stayRange", {
          start: facts.checkin,
          end: facts.checkout,
          nights: facts.nights,
        })}
      </Text>
      {role === "CHECKIN" || role === "CHECKOUT" || role === "TONIGHT" ? (
        <Text style={styles.copy}>{t(`dayLab.stayRole.${role}`)}</Text>
      ) : null}
      <Text style={styles.copy}>{facts.instructions}</Text>
    </P1Row>
  );
}
export function stayRenderer(fixture: FixtureContribution<StaySupplement>) {
  return bindRenderer({
    version: "day-feed-renderer/1",
    family: "P3",
    facts: { [fixture.projection.events[0].id]: fixture.supplemental! },
    render: StayFixtureRow,
  });
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({ copy: { ...visual.type.meta, color: c.textSecondary } });
