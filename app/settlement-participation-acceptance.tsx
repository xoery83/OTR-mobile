import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { useSettlementParticipationAcceptance } from "@/hooks/useSettlementParticipationAcceptance";

export default function SettlementParticipationAcceptanceRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const checks = useSettlementParticipationAcceptance(mode ?? "online");
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Settlement Participation Acceptance
      </Text>
      <View style={styles.control}>
        <View style={styles.copy}>
          <Text style={styles.label}>Include in group settlement</Text>
          <Text>
            This expense is included in Spending and analysis but does not affect who owes
            whom.
          </Text>
        </View>
        <Switch accessibilityLabel="Include in group settlement" value={false} />
      </View>
      {checks.map((check) => (
        <View key={check.name} style={styles.row}>
          <Text style={check.ok ? styles.pass : styles.fail}>
            {check.ok ? "PASS" : "FAIL"} · {check.name}
          </Text>
          <Text>{check.detail}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 20, paddingTop: 80 },
  title: { fontSize: 24, fontWeight: "800" },
  control: { alignItems: "center", flexDirection: "row", gap: 16 },
  copy: { flex: 1, gap: 4 },
  label: { fontSize: 16, fontWeight: "700" },
  row: { borderBottomWidth: 1, borderColor: "#CBD5E1", gap: 4, paddingVertical: 10 },
  pass: { color: "#047857", fontWeight: "800" },
  fail: { color: "#B91C1C", fontWeight: "800" },
});
