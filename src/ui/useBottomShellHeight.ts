import { useContext } from "react";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";

// The custom shell reports its full native height, including its bottom safe area.
export function useBottomShellHeight() {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
