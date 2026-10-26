import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  AccessibilityInfo,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { GlassViewProps } from "expo-glass-effect";
import { useThemedStyles, useUiAppearance } from "./theme";
import type { UiColors } from "./palette";

function installedGlass(): ComponentType<GlassViewProps> | null {
  try {
    const capability = requireOptionalNativeModule<{
      isLiquidGlassAvailable?: boolean;
      isGlassEffectAPIAvailable?: boolean;
    }>("ExpoGlassEffect");
    return capability?.isLiquidGlassAvailable === true &&
      capability.isGlassEffectAPIAvailable === true
      ? (require("expo-glass-effect") as typeof import("expo-glass-effect")).GlassView
      : null;
  } catch {
    return null;
  }
}
const Glass = installedGlass();
export function UiGlassSurface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  const appearance = useUiAppearance();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true,
      observed = false;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active && !observed) setReduced(value);
      })
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (value) => {
        observed = true;
        setReduced(value);
      },
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return Glass && !reduced ? (
    <Glass glassEffectStyle="regular" colorScheme={appearance} style={style}>
      {children}
    </Glass>
  ) : (
    <View style={[styles.fallback, reduced && styles.solid, style]}>{children}</View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    fallback: { backgroundColor: c.floatingSurface },
    solid: { backgroundColor: c.surface },
  });
