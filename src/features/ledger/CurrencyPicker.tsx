import { UiTextInput as TextInput } from "@/ui/forms";
import { UiText } from "@/ui/controls";
import { t, getFormatLocale } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useSheetScrollDismissal } from "@/components/SheetHost";
import { AppIcon } from "@/components/AppIcon";
import {
  currencyName,
  searchCurrencies,
  suggestedCurrencies,
} from "./currencyPickerData";

type Props = {
  selected: string;
  hosted?: boolean;
  suggestions: string[];
  onSelect: (code: string) => void;
};

export function CurrencyPicker({ selected, suggestions, onSelect, hosted = false }: Props) {
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const dismissal = useSheetScrollDismissal(hosted);
  const [query, setQuery] = useState("");
  const { width, height, fontScale } = useWindowDimensions();
  const compactLandscape = hosted && width > height && height < 480;
  const largeText = hosted && fontScale > 1.5;
  const PickerText = hosted ? UiText : Text;
  useUiLocale();
  const locale = getFormatLocale();
  const rows = useMemo(() => searchCurrencies(query), [query]);
  const suggested = useMemo(() => suggestedCurrencies(suggestions), [suggestions]);
  const searching = query.trim().length > 0;
  const label = (code: string) => `${code}, ${currencyName(code, locale)}`;

  return (
    <View style={[styles.container, compactLandscape && styles.compactLandscape]}>
      <TextInput
        accessibilityLabel={t("currency.search")}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder={t("currency.placeholder")}
        style={[styles.search, compactLandscape && styles.compactSearch]}
        value={query}
      />
      <FlatList
        {...dismissal}
        automaticallyAdjustKeyboardInsets={hosted}
        style={compactLandscape ? styles.compactResults : undefined}
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          searching ? null : (
            <View style={styles.top}>
              <PickerText style={styles.heading}>{t("currency.suggested")}</PickerText>
              <View style={largeText ? styles.largeChips : styles.chips}>
                {suggested.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityLabel={label(code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selected === code }}
                    onPress={() => onSelect(code)}
                    style={[
                      styles.chip,
                      hosted && styles.hostedChip,
                      largeText && styles.largeChip,
                      selected === code && styles.selectedChip,
                    ]}
                  >
                    {selected === code ? (
                      <AppIcon color={colors.accent} name="checkmark" size={14} />
                    ) : null}
                    <PickerText style={[styles.code, selected === code && styles.selectedText]}>
                      {code}
                    </PickerText>
                    <PickerText
                      numberOfLines={hosted ? undefined : 1}
                      style={[styles.chipName, largeText && styles.largeChipName, selected === code && styles.selectedText]}
                    >
                      {currencyName(code, locale)}
                    </PickerText>
                  </Pressable>
                ))}
              </View>
              <PickerText style={[styles.heading, styles.allHeading]}>{t("currency.all")}</PickerText>
            </View>
          )
        }
        ListEmptyComponent={<PickerText style={styles.empty}>{t("currency.noMatches")}</PickerText>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={label(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === item }}
            onPress={() => onSelect(item)}
            style={styles.row}
          >
            <PickerText style={styles.code}>{item}</PickerText>
            <PickerText numberOfLines={largeText ? undefined : 1} style={styles.rowName}>
              {currencyName(item, locale)}
            </PickerText>
            {selected === item ? (
              <AppIcon color={colors.accent} name="checkmark" size={16} />
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    container: { backgroundColor: colors.background, flex: 1 },
    compactLandscape: { flexDirection: "row" },
    compactSearch: { width: "40%", alignSelf: "flex-start" },
    compactResults: { flex: 1 },
    search: {
      backgroundColor: colors.separator,
      borderRadius: 10,
      color: colors.textPrimary,
      fontSize: 16,
      marginHorizontal: 16,
      marginVertical: 10,
      minHeight: 44,
      paddingHorizontal: 12,
    },
    top: { paddingHorizontal: 16, paddingTop: 4 },
    heading: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    largeChips: { gap: 8 },
    chip: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      minHeight: 44,
      maxWidth: 148,
      paddingHorizontal: 10,
    },
    hostedChip: { maxWidth: "100%" },
    largeChip: { paddingVertical: 6 },
    selectedChip: { backgroundColor: colors.selected, borderColor: colors.accent },
    code: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    selectedText: { color: colors.accent },
    chipName: { color: colors.textTertiary, flexShrink: 1, fontSize: 13, maxWidth: 130 },
    largeChipName: { flex: 1, maxWidth: "100%" },
    allHeading: { marginBottom: 0, marginTop: 16 },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 18,
    },
    rowName: { color: colors.textTertiary, flex: 1, fontSize: 15 },
    listContent: { paddingBottom: 24 },
    empty: { color: colors.textSecondary, padding: 18 },
  });
