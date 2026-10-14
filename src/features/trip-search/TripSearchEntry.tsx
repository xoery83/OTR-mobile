import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { Pressable, StyleSheet } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { useUiTheme } from "@/ui/theme";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export function TripSearchEntry({
  entry,
  tripId,
}: {
  entry: "MY_TRIPS" | "HOME" | "DAY";
  tripId?: string;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view, resumeView } = useTripView();
  const current = view ?? resumeView;
  const target =
    entry === "MY_TRIPS"
      ? undefined
      : entry === "HOME"
        ? tripId
        : current?.generation === generation
          ? current.tripId
          : undefined;
  if (entry !== "MY_TRIPS" && !target) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("comprehensiveSearch.title")}
      style={styles.target}
      onPress={() => {
        if (generation !== getAccountGeneration()) return;
        router.push({
          pathname: "/search",
          params: { entry, ...(target ? { tripId: target } : {}) },
        });
      }}
    >
      <AppIcon name="magnifyingglass" color={colors.accent} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  target: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
