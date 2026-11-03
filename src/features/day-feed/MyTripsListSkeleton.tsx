import { StyleSheet, View } from "react-native";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { DayReadSkeleton } from "./DayReadSkeleton";

export function MyTripsListSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View testID="my-trips-list-skeleton" style={styles.list}>
      <View style={styles.card}>
        <DayReadSkeleton compact />
      </View>
      <View style={styles.card}>
        <DayReadSkeleton compact />
      </View>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    list: { gap: visual.space.card },
    card: {
      padding: visual.space.page,
      backgroundColor: colors.surface,
      borderRadius: visual.radius.card,
    },
  });
