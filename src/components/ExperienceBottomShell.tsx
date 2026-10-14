import { UiText as Text } from "@/ui/controls";
import { router } from "expo-router";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// S1 exposes only a selected, account-generation-scoped accepted Day.
// The Today route performs the owning read again after navigation.
export function ExperienceBottomShell({
  visible,
  pathname,
}: {
  visible: boolean;
  pathname: string;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 2;
  const { view } = useTripView();
  if (!visible) return null;
  const openMyTrips = () => {
    if (pathname === "/trip") router.setParams({ view: "trips" });
    else router.navigate({ pathname: "/trip", params: { view: "trips" } });
  };
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safe}>
      <View style={[styles.row, largeText && styles.largeRow]}>
        <View style={styles.navigationIsland}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("dayFeed.myTrips")}
            accessibilityHint={t("shell.openMyTrips")}
            accessibilityState={{ selected: pathname === "/trip" }}
            onPress={openMyTrips}
            style={[styles.destination, largeText && styles.largeDestination]}
          >
            <AppIcon
              name="suitcase"
              color={pathname === "/trip" ? colors.accent : colors.textSecondary}
            />
            <Text style={[styles.label, pathname === "/trip" && styles.activeLabel]}>
              {t("dayFeed.myTrips")}
            </Text>
          </Pressable>
          {view ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("shell.day")}
              accessibilityHint={t("shell.openSelectedDay")}
              accessibilityState={{ selected: pathname === "/" }}
              onPress={() => router.navigate("/")}
              style={[styles.destination, largeText && styles.largeDestination]}
            >
              <AppIcon
                name="calendar"
                color={pathname === "/" ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.label, pathname === "/" && styles.activeLabel]}>
                {t("shell.day")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {pathname === "/trip" ? (
          <View style={styles.actionIsland}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("myTrips.createTrip")}
              onPress={() =>
                router.setParams({ tripId: "", date: "", zone: "", view: "create" })
              }
              style={styles.action}
            >
              <AppIcon name="plus" color={colors.accent} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: UiColors) =>
  StyleSheet.create({
    safe: { backgroundColor: c.background },
    row: {
      paddingHorizontal: visual.space.page,
      paddingTop: visual.space.heading,
      paddingBottom: visual.space.heading,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    largeRow: { paddingBottom: visual.space.section },
    navigationIsland: {
      backgroundColor: c.elevatedSurface,
      borderColor: c.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.control,
      flexDirection: "row",
    },
    actionIsland: {
      backgroundColor: c.elevatedSurface,
      borderColor: c.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.control,
    },
    action: {
      minWidth: 48,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    destination: {
      minWidth: 76,
      minHeight: 44,
      paddingHorizontal: visual.space.heading,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: visual.space.heading,
    },
    largeDestination: {
      minHeight: 76,
      paddingVertical: visual.space.card,
    },
    label: { ...visual.type.action, color: c.textSecondary },
    activeLabel: { color: c.accent },
  });
