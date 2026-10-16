import { useSyncExternalStore } from "react";
import { router, Stack } from "expo-router";
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
  nativeToolbar = false,
  showUnavailableTripEdit = false,
}: {
  entry: "MY_TRIPS" | "HOME" | "DAY";
  tripId?: string;
  nativeToolbar?: boolean;
  showUnavailableTripEdit?: boolean;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view, resumeView, quickActions } = useTripView();
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
  const edit =
    entry === "HOME" &&
    quickActions &&
    quickActions.tripId === target &&
    quickActions.generation === generation
      ? quickActions.editTrip
      : undefined;

  const open = () => {
    if (generation !== getAccountGeneration()) return;
    router.push({
      pathname: "/search",
      params: { entry, ...(target ? { tripId: target } : {}) },
    });
  };
  if (nativeToolbar)
    return (
      <Stack.Toolbar placement="right">
        {showUnavailableTripEdit ? (
          <Stack.Toolbar.Button
            icon="square.and.pencil"
            separateBackground
            disabled={!edit}
            accessibilityLabel={t(edit ? "tripHome.edit" : "tripHome.editUnavailable")}
            onPress={
              edit
                ? () => {
                    if (generation === getAccountGeneration()) edit();
                  }
                : undefined
            }
          />
        ) : null}
        {showUnavailableTripEdit ? <Stack.Toolbar.Spacer width={8} /> : null}
        <Stack.Toolbar.Button
          tintColor={colors.accent}
          icon="magnifyingglass"
          separateBackground={showUnavailableTripEdit}
          accessibilityLabel={t("comprehensiveSearch.title")}
          onPress={open}
        />
      </Stack.Toolbar>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("comprehensiveSearch.title")}
      style={styles.target}
      onPress={open}
    >
      <AppIcon name="magnifyingglass" color={colors.accent} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  target: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
