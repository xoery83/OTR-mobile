import { useRef } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function LedgerSheetHeader({
  title,
  titleBold = false,
  leftLabel = "Close",
  onLeft,
  rightLabel = "Done",
  onRight = onLeft,
  rightDisabled = false,
  safeTop = true,
}: {
  title: string;
  titleBold?: boolean;
  leftLabel?: string;
  onLeft: () => void;
  rightLabel?: string;
  onRight?: () => void;
  rightDisabled?: boolean;
  safeTop?: boolean;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  const touchY = useRef(0);
  const left = <Action label={leftLabel} onPress={onLeft} />;
  const right = <Action disabled={rightDisabled} label={rightLabel} onPress={onRight} />;
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
            <Text
              accessibilityRole="header"
              style={[styles.largeTitle, titleBold && styles.boldTitle]}
            >
              {title}
            </Text>
            <View style={styles.actions}>
              {left}
              {right}
            </View>
          </>
        ) : (
          <>
            {left}
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[styles.title, titleBold && styles.boldTitle]}
            >
              {title}
            </Text>
            {right}
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

const styles = StyleSheet.create({
  safe: { backgroundColor: "#FFFFFF" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  largeHeader: { alignItems: "stretch", flexDirection: "column" },
  title: {
    color: "#0F766E",
    flex: 1,
    fontSize: 20,
    fontWeight: "400",
    textAlign: "center",
  },
  largeTitle: { color: "#0F766E", fontSize: 22, fontWeight: "400" },
  boldTitle: { fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  button: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  buttonText: { color: "#0F766E", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
