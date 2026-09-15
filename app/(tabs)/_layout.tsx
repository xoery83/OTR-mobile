import { Tabs } from "expo-router";

import { AppIcon } from "@/components/AppIcon";

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
          tabBarIcon: ({ color }) => <AppIcon color={color} name="viewfinder" />,
          title: "Capture",
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          tabBarIcon: ({ color }) => <AppIcon color={color} name="suitcase" />,
          title: "Trip",
        }}
      />
    </Tabs>
  );
}
