import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles } from "./theme";
import type { UiColors } from "./palette";
import { visual } from "./visual";
export function UiButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "text" | "destructive";
  disabled?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, styles[variant], disabled && styles.disabled]}
    >
      <Text
        style={[
          styles.label,
          variant === "primary" && styles.onPrimary,
          variant === "destructive" && styles.danger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function UiSection({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      {title ? (
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
      ) : null}
      <View style={styles.surface}>{children}</View>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    button: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: visual.radius.control,
    },
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.selected },
    text: {},
    destructive: { backgroundColor: colors.destructiveSurface },
    disabled: { opacity: 0.45 },
    label: { color: colors.accent, ...visual.type.row },
    onPrimary: { color: colors.onAccent },
    danger: { color: colors.destructive },
    section: { gap: visual.space.heading },
    heading: { color: colors.textPrimary, ...visual.type.section },
    surface: {
      backgroundColor: colors.surface,
      borderRadius: visual.radius.card,
      padding: visual.space.card,
      gap: visual.space.card,
    },
  });
