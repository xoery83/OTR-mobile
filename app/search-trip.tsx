import { router, Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { TripSearchEntry } from "@/features/trip-search/TripSearchEntry";
import {
  NavigationContentFrame,
  navigationContentFrameOptions,
} from "@/components/navigationChrome";
import { TripScreen } from "@/features/day-feed/TripScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

// A Search child stays on the root stack; the tab route would discard Search.
export default function SearchTripRoute() {
  useUiLocale();
  const canGoBack = router.canGoBack();
  const params = useLocalSearchParams<{ tripId?: string; view?: string }>();
  const home = !!params.tripId && params.view !== "day";
  return (
    <>
      <Stack.Screen
        options={{
          ...navigationContentFrameOptions,
          headerShown: true,
          headerBackVisible: canGoBack,
        }}
      />
      {!canGoBack ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="chevron.left"
            accessibilityLabel={t("common.back")}
            onPress={() =>
              router.replace({ pathname: "/trip", params: { view: "trips" } })
            }
          />
        </Stack.Toolbar>
      ) : null}
      {home ? (
        <>
          <TripSearchEntry
            nativeToolbar
            entry="HOME"
            tripId={params.tripId}
            showUnavailableTripEdit
          />
          <View style={{ flex: 1 }}>
            <TripScreen />
          </View>
        </>
      ) : (
        <NavigationContentFrame>
          <TripScreen />
        </NavigationContentFrame>
      )}
    </>
  );
}
