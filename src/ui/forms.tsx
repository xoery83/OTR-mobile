import type { Ref } from "react";
import {
  TextInput,
  View,
  Pressable,
  Text,
  StyleSheet,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import DateTimePicker, {
  type IOSNativeProps,
} from "@react-native-community/datetimepicker";
import { useUiTheme, useUiAppearance, useThemedStyles } from "./theme";
import type { UiColors } from "./palette";
import { useUiLocale } from "./useUiLocale";
import { getFormatLocale } from "./locale";
import { visual } from "./visual";

export function UiTextInput({
  style,
  editable,
  variant = "field",
  ...props
}: TextInputProps & { ref?: Ref<TextInput>; variant?: "field" | "bare" }) {
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      selectionColor={colors.accent}
      cursorColor={colors.accent}
      keyboardAppearance={useUiAppearance()}
      editable={editable}
      {...props}
      style={[
        styles.input,
        variant === "bare" && styles.bareInput,
        style,
        editable === false && styles.disabled,
      ]}
    />
  );
}
// Keep the installed native picker. System-derived props update mounted modal hosts.
// Locale override is reliable for the spinner mode used by these date sheets.
export function UiDatePicker(
  props: Omit<IOSNativeProps, "themeVariant" | "textColor" | "accentColor" | "locale">,
) {
  useUiLocale();
  const colors = useUiTheme();
  const appearance = useUiAppearance();
  return (
    <DateTimePicker
      {...props}
      themeVariant={appearance}
      textColor={colors.textPrimary}
      accentColor={colors.accent}
      locale={props.display === "spinner" ? getFormatLocale() : undefined}
    />
  );
}
export function UiFormRow({
  label,
  value,
  onPress,
  disabled = false,
  stacked = false,
  horizontalInset,
  variant = "row",
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  stacked?: boolean;
  horizontalInset?: number;
  variant?: "row" | "field";
}) {
  const styles = useThemedStyles(createStyles);

  const largeText = useWindowDimensions().fontScale > 2;
  const field = variant === "field";
  const button = (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        field ? styles.input : styles.row,
        field && styles.fieldButton,
        !field && (largeText || stacked) && styles.rowLargeText,
        disabled && styles.disabledSurface,
        !field && horizontalInset !== undefined && { paddingHorizontal: horizontalInset },
      ]}
    >
      {!field && (
        <Text
          style={[
            styles.rowLabel,
            stacked && styles.rowLabelStacked,
            disabled && styles.disabledText,
          ]}
        >
          {label}
        </Text>
      )}
      <Text
        numberOfLines={2}
        style={[
          field ? styles.fieldValue : styles.rowValue,
          !field && (largeText || stacked) && styles.rowValueLargeText,
          disabled && styles.disabledText,
        ]}
      >
        {value}
      </Text>
    </Pressable>
  );
  return field ? (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {button}
    </View>
  ) : (
    button
  );
}

export function UiChoiceChip({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choiceChip,
        compact && styles.compactChip,
        selected && !compact && styles.choiceChipSelected,
      ]}
    >
      <Text
        style={[
          styles.choiceChipText,
          compact && styles.compactChipText,
          compact && selected && styles.compactSelected,
          selected && !compact && styles.choiceChipTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    input: {
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      borderColor: colors.separator,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: visual.radius.control,
      minHeight: 52,
      paddingHorizontal: 14,
      ...visual.type.row,
    },
    fieldGroup: { gap: visual.space.heading },
    fieldLabel: { ...visual.type.action, color: colors.textPrimary },
    fieldButton: { justifyContent: "center", paddingVertical: visual.space.heading },
    fieldValue: { ...visual.type.row, color: colors.textPrimary },
    bareInput: {
      backgroundColor: colors.background,
      borderWidth: 0,
      paddingHorizontal: 0,
    },
    disabledSurface: { backgroundColor: colors.groupedBackground },
    disabledText: { color: colors.disabled },
    disabled: { color: colors.disabled, backgroundColor: colors.groupedBackground },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 8,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowLargeText: { alignItems: "flex-start", flexDirection: "column" },
    rowLabel: { color: colors.textPrimary, flex: 1, fontSize: 17, fontWeight: "600" },
    rowLabelStacked: { flex: 0, fontSize: 14 },
    rowValue: {
      color: colors.textTertiary,
      flexShrink: 1,
      fontSize: 16,
      textAlign: "right",
    },
    rowValueLargeText: { textAlign: "left" },
    choiceChip: {
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
    },
    compactChip: {
      borderWidth: 0,
      paddingHorizontal: 0,
      backgroundColor: colors.transparent,
    },
    compactChipText: {
      ...visual.type.tripSectionLabel,
      fontSize: 12,
      color: colors.textSecondary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: visual.radius.control,
      overflow: "hidden",
    },
    compactSelected: {
      backgroundColor: colors.elevatedSurface,
      color: colors.textPrimary,
    },
    choiceChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    choiceChipText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    choiceChipTextSelected: { color: colors.onAccent },
  });
