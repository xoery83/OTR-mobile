import { useState } from "react";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { View } from "react-native";
import {
  BottomTabBarHeightContext,
  BottomTabBarHeightCallbackContext,
} from "expo-router/js-tabs";
import { ExperienceBottomShell } from "@/components/ExperienceBottomShell";
import TripRoute from "./(tabs)/trip";

// A real native Stack screen keeps the underlying My Trips tree and scroll position mounted.
export default function TripHomeRoute() {
  const [height, setHeight] = useState(0);
  useUiLocale();
  const params = useLocalSearchParams<{ tripId?: string; importJobId?: string }>();
  return (
    <>
      {params.importJobId ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="chevron.left"
            accessibilityLabel={t("capture.results.back")}
            onPress={() =>
              router.push({
                pathname: "/import-plans",
                params: { tripId: params.tripId, jobId: params.importJobId },
              })
            }
          />
        </Stack.Toolbar>
      ) : null}
      <BottomTabBarHeightContext.Provider value={height}>
        <BottomTabBarHeightCallbackContext.Provider value={setHeight}>
          <View style={{ flex: 1 }}>
            <TripRoute />
            <ExperienceBottomShell visible pathname="/trip-home" />
          </View>
        </BottomTabBarHeightCallbackContext.Provider>
      </BottomTabBarHeightContext.Provider>
    </>
  );
}
