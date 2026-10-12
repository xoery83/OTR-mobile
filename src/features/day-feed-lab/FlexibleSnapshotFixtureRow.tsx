import { useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import {
  FlexibleBlockRow,
  type FlexibleBlockRendererProps,
} from "@/features/day-feed/FlexibleBlockRow";
import { UiButton } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  flexibleFixtureActions,
  flexibleFixtureUpdate,
} from "./flexibleReactiveContribution";

// Local fixture expansion proves the boundary, not a Flexible business workspace.
export function FlexibleSnapshotFixtureRow(props: FlexibleBlockRendererProps) {
  const styles = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState<
    "POOL" | "SEARCH" | "SAVED" | "PUBLISHED" | null
  >(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const snapshot = props.flexibleSnapshot;
  const publish = props.onReplaceFlexibleSnapshot;
  return (
    <View>
      <FlexibleBlockRow {...props} />
      {props.immersive && snapshot && publish ? (
        <View style={styles.controls}>
          <Text style={styles.meta}>
            {t("dayLab.snapshotRevision", { revision: snapshot.revision })}
          </Text>
          {(["POOL", "SEARCH", "SAVED", "PUBLISHED"] as const).map((resource) => (
            <UiChoiceChip
              key={resource}
              label={t(`dayLab.snapshotResource.${resource}`)}
              selected={expanded === resource}
              onPress={() => setExpanded(expanded === resource ? null : resource)}
            />
          ))}
          {expanded ? (
            <Text style={styles.meta}>
              {t("dayLab.snapshotExpanded", {
                resource: t(`dayLab.snapshotResource.${expanded}`),
              })}
            </Text>
          ) : null}
          {flexibleFixtureActions.map((action) => (
            <UiButton
              key={action}
              label={t(`dayLab.snapshotAction.${action}`)}
              variant="text"
              onPress={() =>
                setAccepted(publish(flexibleFixtureUpdate(snapshot, action)))
              }
            />
          ))}
          <UiButton
            label={t("dayLab.snapshotAction.RAPID")}
            variant="text"
            onPress={() => {
              const first = flexibleFixtureUpdate(snapshot, "COPY");
              publish(first);
              setAccepted(publish(flexibleFixtureUpdate(first, "RESIZE")));
            }}
          />
          <UiButton
            label={t("dayLab.snapshotAction.STALE")}
            variant="text"
            onPress={() => setAccepted(publish(snapshot))}
          />
          {accepted !== null ? (
            <Text style={styles.meta}>
              {t(accepted ? "dayLab.snapshotAccepted" : "dayLab.snapshotRejected")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    controls: { gap: visual.space.row },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
