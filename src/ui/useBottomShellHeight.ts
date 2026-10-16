import { useContext } from "react";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
import { bottomBarVisible } from "@/components/bottomBarVisibility";
import { bottomShellInset } from "./bottomShellInset";

export function useBottomShellHeight() {
  const measured = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return bottomBarVisible(usePathname())
    ? bottomShellInset(measured, insets.bottom, fontScale)
    : 0;
}
