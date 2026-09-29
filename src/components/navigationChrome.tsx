import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "./AppIcon";

export const navigationColors = {
  text: "#111827",
  muted: "#94A3B8",
  action: "#0F766E",
} as const;

export function NavigationContextTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  return (
    <View
      accessible
      accessibilityLabel={[title, subtitle].filter(Boolean).join(", ")}
      style={styles.titleBlock}
    >
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function HeaderIconAction({
  label,
  name,
  onPress,
  disabled = false,
  active = false,
}: {
  label: string;
  name: Parameters<typeof AppIcon>[0]["name"];
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconAction, disabled && styles.disabled]}
    >
      <AppIcon color={navigationColors.action} name={name} size={21} />
      {active ? <View style={styles.activeDot} /> : null}
    </Pressable>
  );
}

export const navigationTextActionStyle = {
  color: navigationColors.action,
  fontSize: 17,
  fontWeight: "700" as const,
};

const styles = StyleSheet.create({
  titleBlock: { alignItems: "center", maxWidth: 250, flexShrink: 1 },
  title: { color: navigationColors.text, fontSize: 17, fontWeight: "700" },
  subtitle: { color: navigationColors.muted, fontSize: 11, fontWeight: "600" },
  iconAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  activeDot: {
    backgroundColor: navigationColors.action,
    borderRadius: 2,
    height: 4,
    position: "absolute",
    bottom: 5,
    width: 4,
  },
  disabled: { opacity: 0.4 },
});
