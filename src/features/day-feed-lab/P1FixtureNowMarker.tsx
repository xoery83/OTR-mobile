import { StyleSheet, View } from "react-native";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
// Frozen WebLab reference marker only. Core NOW eligibility/placement is unchanged.
export function P1FixtureNowMarker() {
  useUiLocale();
  const styles = useThemedStyles(makeStyles);
  return (
    <View pointerEvents="none" style={styles.marker}>
      <UiText style={styles.text}>{t("fidelity.syntheticNow")}</UiText>
    </View>
  );
}
const makeStyles = (c: UiColors) =>
  StyleSheet.create({
    marker: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.accent,
      marginTop: visual.space.row,
      paddingTop: visual.space.heading,
    },
    text: { ...visual.type.feedNote, color: c.accent },
  });
