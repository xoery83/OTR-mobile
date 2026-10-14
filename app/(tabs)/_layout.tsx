import { isSelectedTripHome } from "@/features/day-feed/tripWorkspaceRoute";
import { UiText as Text } from "@/ui/controls";
import { TripSearchEntry } from "@/features/trip-search/TripSearchEntry";
import { Tabs, usePathname } from "expo-router";
import { getDefaultHeaderHeight } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { ExperienceBottomShell } from "@/components/ExperienceBottomShell";
import { GlobalMenu } from "@/components/GlobalMenu";
import { bottomBarVisible } from "@/components/bottomBarVisibility";
import { useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { visual } from "@/ui/visual";

export default function TabsLayout() {
  useUiLocale();
  const colors = useUiTheme();
  const pathname = usePathname();
  const dimensions = useWindowDimensions();
  const { fontScale } = dimensions;
  const insets = useSafeAreaInsets();
  const largeText = fontScale > 2;
  return (
    <Tabs
      tabBar={() => (
        <ExperienceBottomShell visible={bottomBarVisible(pathname)} pathname={pathname} />
      )}
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleAlign: "center",
        headerTitleStyle: { color: colors.textPrimary },
        tabBarStyle: bottomBarVisible(pathname)
          ? { backgroundColor: colors.surface, borderTopColor: colors.separator }
          : { display: "none" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerLeft: () => <GlobalMenu module="TODAY" />,
          headerRight: () => <TripSearchEntry entry="DAY" />,
          tabBarIcon: ({ color }) => <AppIcon color={color} name="calendar" />,
          title: t("shell.day"),
        }}
      />
      <Tabs.Screen
        name="expenses"
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (navigation.isFocused()) event.preventDefault();
          },
        })}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <AppIcon color={color} name="list.bullet.rectangle" />
          ),
          title: t("navigation.ledger"),
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          headerLeft: () => <GlobalMenu module="CAPTURE" />,
          tabBarIcon: ({ color }) => <AppIcon color={color} name="viewfinder" />,
          title: t("navigation.capture"),
        }}
      />
      <Tabs.Screen
        name="trip"
        options={({ route }) => ({
          headerLeft: () => <GlobalMenu module="TRIP" />,
          headerRight: () => (
            <TripSearchEntry
              entry={isSelectedTripHome(route.params) ? "HOME" : "MY_TRIPS"}
              tripId={
                isSelectedTripHome(route.params)
                  ? (route.params as { tripId: string }).tripId
                  : undefined
              }
            />
          ),
          ...(isSelectedTripHome(route.params)
            ? { headerTitle: "" }
            : largeText
              ? {
                  headerTitleAlign: "left" as const,
                  headerStyle: {
                    backgroundColor: colors.surface,
                    height: Math.max(
                      getDefaultHeaderHeight(dimensions, false, insets.top),
                      insets.top +
                        visual.type.section.fontSize * fontScale +
                        visual.space.card * 2,
                    ),
                  },
                  headerTitleContainerStyle: {
                    minWidth: 132,
                    minHeight:
                      visual.type.section.fontSize * fontScale + visual.space.card,
                  },
                  headerTitle: ({ onLayout }) => (
                    <Text
                      onLayout={onLayout}
                      numberOfLines={1}
                      style={{
                        ...visual.type.section,
                        color: colors.textPrimary,
                      }}
                    >
                      {t("navigation.trip")}
                    </Text>
                  ),
                }
              : {}),
          tabBarIcon: ({ color }) => <AppIcon color={color} name="suitcase" />,
          title: t("navigation.trip"),
        })}
      />
    </Tabs>
  );
}
