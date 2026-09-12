import { ScrollView, StyleSheet, Text } from "react-native";

import { useStage51Acceptance } from "@/hooks/useStage51Acceptance";

export function Stage51AcceptanceScreen() {
  const checks = useStage51Acceptance();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stage 5.1 Acceptance</Text>
      {checks.map((check, index) => (
        <Text key={`${check.name}-${index}`} style={check.ok ? styles.ok : styles.fail}>
          {check.ok ? "PASS" : "FAIL"} {check.name}: {check.detail}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, padding: 20 },
  title: { fontSize: 24, fontWeight: "800" },
  ok: { color: "#0F766E", fontSize: 14 },
  fail: { color: "#B91C1C", fontSize: 14 },
});
