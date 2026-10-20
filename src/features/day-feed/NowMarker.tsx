import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { NowPlacement } from "@/domain/trip/experience/nowIndicator";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { experienceVisualTokens as tokens, timeRailWidth } from "./visualTokens";

// Latest N1 marker, shared by boundary and real Event rail hosts.
export function NowMarker({
  placement,
  within = false,
}: {
  placement: NowPlacement;
  within?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  if (placement.mode === "HIDDEN") return null;
  const time = formatUiDate(new Date(placement.instant), {
    timeZone: placement.zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={t("nowGallery.clockOnly", { time })}
      testID={within ? "now-within" : "now-between"}
      style={styles.marker}
    >
      <View style={{ width: timeRailWidth(fontScale), flexShrink: 0 }}>
        <View style={styles.markerClock}>
          {within ? <View style={styles.tick} /> : null}
          <Text
            style={styles.nowClock}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {time}
          </Text>
        </View>
      </View>
      {!within ? <View style={styles.nowLine} testID="now-horizontal-line" /> : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    marker: { flexDirection: "row", alignItems: "center" },
    markerClock: { flexDirection: "row", alignItems: "center", gap: 3 },
    nowClock: {
      ...tokens.typography.secondary,
      color: colors.accent,
      fontVariant: ["tabular-nums"],
    },
    nowLine: {
      height: StyleSheet.hairlineWidth,
      flex: 1,
      backgroundColor: colors.accent,
      marginLeft: 12,
    },
    tick: {
      width: 5,
      height: 5,
      borderRadius: tokens.radius.pill,
      backgroundColor: colors.accent,
    },
  });
