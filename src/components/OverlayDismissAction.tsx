import { useUiTheme } from "@/ui/theme";
import type { ColorValue } from "react-native";
import { Pressable, StyleSheet } from "react-native";

import { AppIcon } from "./AppIcon";

export function OverlayDismissAction({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color?: ColorValue;
}) {
  const colors = useUiTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.target}
    >
      <AppIcon name="xmark" color={color ?? colors.textTertiary} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
