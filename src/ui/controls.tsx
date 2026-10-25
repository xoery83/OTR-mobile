import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextProps,
} from "react-native";
import { useThemedStyles } from "./theme";
import type { UiColors } from "./palette";
import { visual } from "./visual";
export function UiText(props: TextProps) {
  const { fontScale } = useWindowDimensions();
  // shortcut: observed native hot text sizing can retain stale measurement; remove after a host update passes hot-resize QA.
  return <Text key={fontScale} {...props} />;
}
export function UiButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  size = "regular",
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "text" | "destructive";
  disabled?: boolean;
  size?: "regular" | "large" | "tile";
  icon?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        size === "large" && styles.largeButton,
        size === "tile" && styles.tileButton,
        styles[variant],
        size === "tile" && variant === "secondary" && styles.tileSurface,
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.label,
          size === "tile" && styles.tileLabel,
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
    tileButton: {
      minHeight: 58,
      borderRadius: visual.radius.feedFocus,
      flexDirection: "row",
      justifyContent: "flex-start",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 11,
    },
    tileSurface: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
    },
    tileLabel: {
      ...visual.type.meta,
      fontWeight: "600",
      flexShrink: 1,
      color: colors.textPrimary,
    },
    largeButton: { minHeight: 88 },
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
