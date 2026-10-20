import { useMemo } from "react";
import { useColorScheme } from "react-native";
import { uiPalette, type UiColors } from "./palette";
export function useUiTheme() {
  return uiPalette(useColorScheme());
}
export function useThemedStyles<T>(factory: (colors: UiColors) => T): T {
  const colors = useUiTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}

export const useUiAppearance = () => (useColorScheme() === "dark" ? "dark" : "light");
