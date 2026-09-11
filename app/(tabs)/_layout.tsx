import { Tabs } from "expo-router";

import { Icon } from "@/features/ledger-prototype/ui";

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
          tabBarIcon: ({ color }) => <Icon color={color} name="calendar" />,
          title: "Today",
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Icon color={color} name="list.bullet.rectangle" />,
          title: "Ledger",
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          tabBarIcon: ({ color }) => <Icon color={color} name="viewfinder" />,
          title: "Capture",
        }}
      />
      <Tabs.Screen
        name="trip"
        options={{
          tabBarIcon: ({ color }) => <Icon color={color} name="suitcase" />,
          title: "Trip",
        }}
      />
    </Tabs>
  );
}
