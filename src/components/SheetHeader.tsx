import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export function SheetHeader({
  title,
  leftLabel = t("common.close"),
  onLeft,
  rightLabel = t("common.done"),
  onRight,
  rightDisabled = false,
  safeTop = true,
}: {
  title: string;
  leftLabel?: string;
  onLeft: () => void;
  rightLabel?: string;
  onRight?: () => void;
  rightDisabled?: boolean;
  safeTop?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 2;
  const touchY = useRef(0);
  const left = <Action label={leftLabel} onPress={onLeft} />;
  const right = onRight ? (
    <Action disabled={rightDisabled} label={rightLabel} onPress={onRight} />
  ) : null;
  // Accessibility exception: large text keeps two title lines above the actions.
  return (
    <SafeAreaView edges={safeTop ? ["top"] : []} style={styles.safe}>
      <View
        onTouchEnd={(event) => {
          if (event.nativeEvent.pageY - touchY.current > 80) onLeft();
        }}
        onTouchStart={(event) => {
          touchY.current = event.nativeEvent.pageY;
        }}
        style={[styles.header, largeText && styles.largeHeader]}
      >
        {largeText ? (
          <>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.largeTitle}>
              {title}
            </Text>
            <View style={styles.actions}>
              {left}
              {right}
            </View>
          </>
        ) : (
          <>
            <View style={styles.side}>{left}</View>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <View style={[styles.side, styles.rightSide]}>{right}</View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Action({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text numberOfLines={1} style={styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    safe: { backgroundColor: colors.surface },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minHeight: 58,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    largeHeader: { alignItems: "stretch", flexDirection: "column" },
    side: { width: 112 },
    rightSide: { alignItems: "flex-end" },
    title: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 17,
      fontWeight: "600",
      textAlign: "center",
    },
    largeTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "600",
      textAlign: "center",
    },
    actions: { flexDirection: "row", justifyContent: "space-between" },
    button: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
      minWidth: 72,
      paddingHorizontal: 10,
    },
    buttonText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
    disabled: { opacity: 0.45 },
  });
