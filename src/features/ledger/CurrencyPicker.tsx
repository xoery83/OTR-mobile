import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  Settings,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppIcon } from "@/components/AppIcon";
import {
  currencyName,
  searchCurrencies,
  suggestedCurrencies,
} from "./currencyPickerData";

type Props = {
  selected: string;
  suggestions: string[];
  onSelect: (code: string) => void;
};

export function CurrencyPicker({ selected, suggestions, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const languages = Settings.get("AppleLanguages");
  const locale =
    Array.isArray(languages) && typeof languages[0] === "string"
      ? languages[0]
      : Intl.DateTimeFormat().resolvedOptions().locale;
  const chinese = locale.startsWith("zh");
  const rows = useMemo(() => searchCurrencies(query), [query]);
  const suggested = useMemo(() => suggestedCurrencies(suggestions), [suggestions]);
  const searching = query.trim().length > 0;
  const label = (code: string) => `${code}, ${currencyName(code, locale)}`;

  return (
    <View style={styles.container}>
      <TextInput
        accessibilityLabel={chinese ? "搜索货币" : "Search currencies"}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder={
          chinese ? "搜索货币、国家/地区或代码" : "Search currency, country or code"
        }
        style={styles.search}
        value={query}
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={rows}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          searching ? null : (
            <View style={styles.top}>
              <Text style={styles.heading}>{chinese ? "推荐" : "Suggested"}</Text>
              <View style={styles.chips}>
                {suggested.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityLabel={label(code)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selected === code }}
                    onPress={() => onSelect(code)}
                    style={[styles.chip, selected === code && styles.selectedChip]}
                  >
                    {selected === code ? (
                      <AppIcon color="#0F766E" name="checkmark" size={14} />
                    ) : null}
                    <Text style={[styles.code, selected === code && styles.selectedText]}>
                      {code}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.chipName, selected === code && styles.selectedText]}
                    >
                      {currencyName(code, locale)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.heading, styles.allHeading]}>
                {chinese ? "所有货币" : "All currencies"}
              </Text>
            </View>
          )
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {chinese ? "没有匹配的货币" : "No matching currencies"}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={label(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === item }}
            onPress={() => onSelect(item)}
            style={styles.row}
          >
            <Text style={styles.code}>{item}</Text>
            <Text numberOfLines={1} style={styles.rowName}>
              {currencyName(item, locale)}
            </Text>
            {selected === item ? (
              <AppIcon color="#0F766E" name="checkmark" size={16} />
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F6F7F9", flex: 1 },
  search: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    color: "#111827",
    fontSize: 16,
    marginHorizontal: 16,
    marginVertical: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  top: { paddingHorizontal: 16, paddingTop: 4 },
  heading: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 44,
    maxWidth: 148,
    paddingHorizontal: 10,
  },
  selectedChip: { backgroundColor: "#E6F5F2", borderColor: "#0F766E" },
  code: { color: "#111827", fontSize: 15, fontWeight: "700" },
  selectedText: { color: "#0F766E" },
  chipName: { color: "#475569", flexShrink: 1, fontSize: 13, maxWidth: 130 },
  allHeading: { marginBottom: 0, marginTop: 16 },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  rowName: { color: "#475569", flex: 1, fontSize: 15 },
  listContent: { paddingBottom: 24 },
  empty: { color: "#64748B", padding: 18 },
});
