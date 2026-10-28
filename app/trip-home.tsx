import { useState } from "react";
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
  return (
    <BottomTabBarHeightContext.Provider value={height}>
      <BottomTabBarHeightCallbackContext.Provider value={setHeight}>
        <View style={{ flex: 1 }}>
          <TripRoute />
          <ExperienceBottomShell visible pathname="/trip-home" />
        </View>
      </BottomTabBarHeightCallbackContext.Provider>
    </BottomTabBarHeightContext.Provider>
  );
}
