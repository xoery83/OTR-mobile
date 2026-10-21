import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "./AppIcon";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export function SheetHeader({
  title,
  leftLabel,
  category = "legacy",
  onLeft,
  leftDisabled = false,
  rightLabel = t("common.done"),
  onRight,
  rightDisabled = false,
  safeTop = true,
}: {
  title: string;
  category?: "legacy" | "action" | "composer" | "form" | "picker";
  leftLabel?: string;
  onLeft: () => void;
  leftDisabled?: boolean;
  rightLabel?: string;
  onRight?: () => void;
  rightDisabled?: boolean;
  safeTop?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 2;
  const touchY = useRef(0);
  const lightweight = category === "action" || category === "composer";
  const standard = category !== "legacy";
  const left = lightweight ? null : (
    <Action
      disabled={leftDisabled}
      label={leftLabel ?? t(standard ? "common.cancel" : "common.close")}
      onPress={onLeft}
      regular={standard}
    />
  );
  const right = lightweight ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.close")}
      accessibilityState={{ disabled: leftDisabled }}
      disabled={leftDisabled}
      onPress={onLeft}
      style={styles.close}
    >
      <AppIcon name="xmark" size={20} color={styles.closeIcon.color} />
    </Pressable>
  ) : onRight ? (
    <Action disabled={rightDisabled} label={rightLabel} onPress={onRight} />
  ) : null;
  // Accessibility exception: large text keeps two title lines above the actions.
  return (
    <SafeAreaView edges={safeTop ? ["top"] : []} style={styles.safe}>
      <View
        onTouchEnd={(event) => {
          if (!leftDisabled && event.nativeEvent.pageY - touchY.current > 80) onLeft();
        }}
        onTouchStart={(event) => {
          touchY.current = event.nativeEvent.pageY;
        }}
      >
        {standard ? (
          <View
            accessible={false}
            accessibilityElementsHidden
            style={styles.indicatorSpace}
          >
            <View style={styles.indicator} />
          </View>
        ) : null}
        <View
          style={[
            styles.header,
            standard && styles.standardHeader,
            largeText && styles.largeHeader,
          ]}
        >
          {largeText ? (
            <>
              <Text
                accessibilityRole="header"
                numberOfLines={2}
                style={styles.largeTitle}
              >
                {title}
              </Text>
              <View style={[styles.actions, lightweight && styles.closeActions]}>
                {left}
                {right}
              </View>
            </>
          ) : (
            <>
              <View style={[styles.side, standard && styles.standardSide]}>{left}</View>
              <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
                {title}
              </Text>
              <View
                style={[styles.side, standard && styles.standardSide, styles.rightSide]}
              >
                {right}
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function Action({
  disabled = false,
  label,
  onPress,
  regular = false,
}: {
  regular?: boolean;
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
      <Text
        numberOfLines={1}
        style={[
          styles.buttonText,
          regular && styles.regularText,
          disabled && styles.disabledText,
        ]}
      >
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
    standardHeader: { minHeight: 50, paddingHorizontal: 20, paddingVertical: 0 },
    standardSide: { width: 80 },
    indicatorSpace: { height: 22, alignItems: "center", paddingTop: 8 },
    indicator: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.textTertiary,
    },
    close: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    closeIcon: { color: colors.textSecondary },
    regularText: { fontWeight: "400" },
    disabledText: { color: colors.disabled },
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
    closeActions: { justifyContent: "flex-end" },
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
