import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { candidateRows } from "./receiptReviewPresentation";

export type ReceiptTag = {
  key: string;
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function ReceiptCandidateTags({
  tags,
  label,
  onOverflow,
  alwaysOverflow = false,
}: {
  tags: ReceiptTag[];
  label: string;
  onOverflow: () => void;
  alwaysOverflow?: boolean;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  const [width, setWidth] = useState(0);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  if (!tags.length && !alwaysOverflow) return null;
  const measured = width > 0 && tags.every((tag) => measurements[tag.key] !== undefined);
  const layout = candidateRows(
    tags.map((tag) => measurements[tag.key] ?? 44),
    width,
    alwaysOverflow,
  );
  const chip = (tag: ReceiptTag, measuring = false) => (
    <Pressable
      key={tag.key}
      accessibilityLabel={t("receipt.useSuggestion", { label, value: tag.label })}
      accessibilityRole="button"
      accessibilityState={{ selected: tag.selected }}
      onPress={tag.onPress}
      onLayout={
        measuring
          ? (event) => {
              const next = event.nativeEvent.layout.width;
              setMeasurements((current) =>
                current[tag.key] === next ? current : { ...current, [tag.key]: next },
              );
            }
          : undefined
      }
      style={[
        styles.chip,
        { maxWidth: Math.max(44, width - 50) },
        tag.selected && styles.selected,
      ]}
    >
      <Text style={styles.check}>{tag.selected ? "✓" : ""}</Text>
      <Text numberOfLines={1} style={styles.text}>
        {tag.label}
      </Text>
    </Pressable>
  );
  const rowCount = Math.max(
    layout.rows.length,
    layout.overflow ? layout.overflowRow + 1 : 0,
  );
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.group}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measure}
      >
        {tags.map((tag) => chip(tag, true))}
      </View>
      {measured
        ? Array.from({ length: rowCount }, (_, row) => (
            <View key={row} style={styles.row}>
              {(layout.rows[row] ?? []).map((index) => chip(tags[index]))}
              {layout.overflow && row === layout.overflowRow ? (
                <Pressable
                  accessibilityLabel={t("receipt.moreOptions", { label })}
                  accessibilityRole="button"
                  onPress={onOverflow}
                  style={styles.overflow}
                >
                  <Text style={styles.text}>⌄</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        : null}
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    group: { gap: 6 },
    measure: { position: "absolute", opacity: 0, alignItems: "flex-start" },
    row: { flexDirection: "row", gap: 6 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.separator,
      backgroundColor: colors.surface,
    },
    selected: { backgroundColor: colors.accentSurface, borderColor: colors.accent },
    check: { width: 14, color: colors.accent, fontSize: 14 },
    text: { color: colors.accent, fontSize: 15, fontWeight: "600", flexShrink: 1 },
    overflow: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.separator,
    },
  });
