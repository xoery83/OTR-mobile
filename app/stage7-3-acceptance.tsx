import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useStage73Acceptance } from "@/hooks/useStage73Acceptance";

export default function Stage73AcceptanceRoute() {
  const { journeyId, action } = useLocalSearchParams<{
    journeyId?: string;
    action?: string;
  }>();
  const checks = useStage73Acceptance(journeyId, action);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Stage 7.3 Acceptance
      </Text>
      {!checks.length ? <Text>Running…</Text> : null}
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
  content: { gap: 12, padding: 20 },
  title: { fontSize: 24, fontWeight: "800" },
  row: { borderBottomWidth: 1, borderColor: "#CBD5E1", gap: 4, paddingVertical: 10 },
  pass: { color: "#047857", fontWeight: "800" },
  fail: { color: "#B91C1C", fontWeight: "800" },
});
