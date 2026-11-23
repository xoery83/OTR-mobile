import { Stack } from "expo-router";

import { useUiTheme } from "@/ui/theme";

export default function UpdatesLayout() {
  const colors = useUiTheme();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerTitleAlign: "center",
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.textPrimary },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
      }}
    />
  );
}
