import type { Ref } from "react";
import { TextInput, StyleSheet, type TextInputProps } from "react-native";
import { useUiTheme, useUiAppearance, useThemedStyles } from "./theme";
import type { UiColors } from "./palette";
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

export const textInputStyles = (colors: UiColors) => ({
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
  bareInput: { backgroundColor: colors.background, borderWidth: 0, paddingHorizontal: 0 },
  disabled: { color: colors.disabled, backgroundColor: colors.groupedBackground },
});
const createStyles = (colors: UiColors) => StyleSheet.create(textInputStyles(colors));
