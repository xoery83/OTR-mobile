import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";

import { useStage3Acceptance } from "@/hooks/useStage3Acceptance";

export function Stage3AcceptanceScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const checks = useStage3Acceptance(params.mode ?? "bootstrap");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stage 3 Acceptance</Text>
      {checks.map((check) => (
        <Text key={check.name} style={check.ok ? styles.ok : styles.fail}>
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
