import { Tabs } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { GlobalMenu } from "@/components/GlobalMenu";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0F766E",
        tabBarInactiveTintColor: "#475569",
        headerTitleAlign: "center",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerLeft: () => <GlobalMenu module="TODAY" />,
          tabBarIcon: ({ color }) => <AppIcon color={color} name="calendar" />,
          title: "Today",
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <AppIcon color={color} name="list.bullet.rectangle" />
          ),
          title: "Ledger",
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          headerLeft: () => <GlobalMenu module="CAPTURE" />,
          tabBarIcon: ({ color }) => <AppIcon color={color} name="viewfinder" />,
          title: "Capture",
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          headerLeft: () => <GlobalMenu module="TRIP" />,
          tabBarIcon: ({ color }) => <AppIcon color={color} name="suitcase" />,
          title: "Trip",
        }}
      />
    </Tabs>
  );
}
