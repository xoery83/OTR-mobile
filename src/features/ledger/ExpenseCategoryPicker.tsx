import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import type { EXPENSE_CATEGORIES } from "./expenseDraft";
import { UiText } from "@/ui/controls";
import { categoryLabel } from "@/ui/domainLabels";
import { t, type MessageKey } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";

const categoryGroups: {
  titleKey: MessageKey;
  items: {
    id: (typeof EXPENSE_CATEGORIES)[number];
    icon: ComponentProps<typeof AppIcon>["name"];
  }[];
}[] = [
  {
    titleKey: "ui.foodShopping",
    items: [
      { id: "food", icon: "fork.knife" },
      { id: "shopping", icon: "bag" },
      { id: "groceries", icon: "basket" },
    ],
  },
  {
    titleKey: "ui.gettingAround",
    items: [
      { id: "flight", icon: "airplane" },
      { id: "car", icon: "car" },
      { id: "fuel", icon: "fuelpump" },
      { id: "transport", icon: "tram" },
    ],
  },
  {
    titleKey: "ui.stayExperiences",
    items: [
      { id: "hotel", icon: "bed.double" },
      { id: "ticket", icon: "ticket" },
      { id: "activity", icon: "figure.walk" },
    ],
  },
  {
    titleKey: "ui.insuranceOther",
    items: [
      { id: "insurance", icon: "shield" },
      { id: "other", icon: "square.grid.2x2" },
    ],
  },
];

export function ExpenseCategoryPicker({
  category, onSelect, hosted = false,
}: { category: string; onSelect(category: string): void; hosted?: boolean }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const largeText = hosted && fontScale > 1.5;
  const PickerText = hosted ? UiText : Text;
  return (
    <View style={styles.categoryContent}>
      {categoryGroups.map((group) => (
        <View key={t(group.titleKey)}>
          <PickerText style={styles.categoryHeading}>{t(group.titleKey)}</PickerText>
          <View style={styles.categoryGrid}>
            {group.items.map(({ id, icon }) => {
              const selected = category === id;
              return (
                <Pressable
                  accessibilityLabel={categoryLabel(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={id}
                  onPress={() => onSelect(id)}
                  style={[
                    styles.categoryTile,
                    largeText && styles.largeCategoryTile,
                    selected && styles.categoryTileSelected,
                  ]}
                >
                  <AppIcon color={colors.accent} name={icon} size={22} />
                  <PickerText style={styles.categoryTileText}>{categoryLabel(id)}</PickerText>
                  {selected ? (
                    <AppIcon color={colors.accent} name="checkmark" size={16} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: UiColors) => StyleSheet.create({
    categoryContent: { gap: 24, padding: 16, paddingBottom: 48 },
    categoryHeading: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 10,
    },
    categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    categoryTile: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 60,
      paddingHorizontal: 12,
      width: "48%",
    },
    largeCategoryTile: { width: "100%", paddingVertical: 8 },
    categoryTileSelected: {
      backgroundColor: colors.selected,
      borderColor: colors.accent,
    },
    categoryTileText: {
      color: colors.textPrimary,
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
    },
});
