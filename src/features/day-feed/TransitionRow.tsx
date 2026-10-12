import { Pressable, StyleSheet, Text, View } from "react-native";
import type { composeDayStream } from "./composition";
import { formatUiNumber, t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export type ComposedTransition = NonNullable<
  ReturnType<typeof composeDayStream>["rows"][number]["transition"]
>;

export function TransitionRow({
  transition,
  onOpen,
}: {
  transition: ComposedTransition;
  onOpen?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const distance = transition.geometricDistance
    ? t("ttr.straightLineDistance", {
        distance: formatUiNumber(transition.geometricDistance.meters / 1000, {
          maximumFractionDigits: 1,
        }),
      })
    : null;
  const mode = transition.mode ? t(`ttr.mode.${transition.mode}`) : t("ttr.straightLine");
  const title =
    transition.visibility === "SUGGESTED_MODE" ? t("ttr.suggestedMode", { mode }) : mode;
  const status = t(`ttr.route.${transition.routeStatus}`);
  const accessibilityLabel = distance
    ? t("ttr.accessibilityWithDistance", { title, distance, status })
    : t("ttr.accessibilityWithoutDistance", { title, status });
  return (
    <Pressable
      accessibilityRole={onOpen ? "button" : "text"}
      accessibilityLabel={accessibilityLabel}
      onPress={onOpen}
      disabled={!onOpen}
      style={styles.row}
    >
      {!transition.suppressConnector ? <View style={styles.connector} /> : null}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {distance ? <Text style={styles.meta}>{distance}</Text> : null}
        <Text style={styles.meta}>{status}</Text>
      </View>
    </Pressable>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    row: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: visual.space.row,
    },
    connector: {
      width: 2,
      alignSelf: "stretch",
      backgroundColor: c.separator,
      marginRight: visual.space.heading,
    },
    content: { gap: 2 },
    title: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
