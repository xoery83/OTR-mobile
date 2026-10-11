import { TripViewProvider } from "@/features/day-feed/TripViewContext";
import { Tabs, usePathname } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { GlobalMenu } from "@/components/GlobalMenu";
import { bottomBarVisible } from "@/components/bottomBarVisibility";
import { useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";

export default function TabsLayout() {
  useUiLocale();
  const colors = useUiTheme();
  const pathname = usePathname();
  return (
    <TripViewProvider>
      <Tabs
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
            tabBarIcon: ({ color }) => <AppIcon color={color} name="calendar" />,
            title: t("navigation.today"),
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
          options={{
            headerLeft: () => <GlobalMenu module="TRIP" />,
            tabBarIcon: ({ color }) => <AppIcon color={color} name="suitcase" />,
            title: t("navigation.trip"),
          }}
        />
      </Tabs>
    </TripViewProvider>
  );
}
