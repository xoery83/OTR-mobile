import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { StyleSheet, Text, View } from "react-native";
import type { ExpenseSettlementParticipation } from "@/domain/ledger/types";

export function ExpenseSettlementTag({
  value,
}: {
  value: ExpenseSettlementParticipation;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const included = value === "INCLUDED";
  return (
    <View style={[styles.tag, included ? styles.included : styles.excluded]}>
      <Text style={[styles.text, included ? styles.includedText : styles.excludedText]}>
        {included ? t("expense.includedSettlement") : t("expense.excludedSettlement")}
      </Text>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    tag: {
      alignSelf: "flex-start",
      borderRadius: 6,
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    included: { backgroundColor: colors.selected },
    excluded: { backgroundColor: colors.groupedBackground },
    text: { fontSize: 12, fontWeight: "700" },
    includedText: { color: colors.accent },
    excludedText: { color: colors.textTertiary },
  });
