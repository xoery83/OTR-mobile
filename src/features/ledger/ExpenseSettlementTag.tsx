import { StyleSheet, Text, View } from "react-native";
import type { ExpenseSettlementParticipation } from "@/domain/ledger/types";

export function ExpenseSettlementTag({
  value,
}: {
  value: ExpenseSettlementParticipation;
}) {
  const included = value === "INCLUDED";
  return (
    <View style={[styles.tag, included ? styles.included : styles.excluded]}>
      <Text style={[styles.text, included ? styles.includedText : styles.excludedText]}>
        {included ? "Included in settlement" : "Excluded from settlement"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "flex-start",
    borderRadius: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  included: { backgroundColor: "#E6F5F1" },
  excluded: { backgroundColor: "#F1F5F9" },
  text: { fontSize: 12, fontWeight: "700" },
  includedText: { color: "#0F766E" },
  excludedText: { color: "#475569" },
});
