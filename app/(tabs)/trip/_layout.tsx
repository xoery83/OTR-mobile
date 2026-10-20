import { Stack } from "expo-router";
import { useUiTheme } from "@/ui/theme";
import { navigationContentFrameOptions } from "@/components/navigationChrome";
export default function TripLayout() {
  const colors = useUiTheme();
  return (
    <Stack
      screenOptions={{
        ...navigationContentFrameOptions,
        headerTitleAlign: "center",
        headerTintColor: colors.accent,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
