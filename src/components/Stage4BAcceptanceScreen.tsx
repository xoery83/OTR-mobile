import { ScrollView, StyleSheet, Text } from "react-native";

import { useStage4BAcceptance } from "@/hooks/useStage4BAcceptance";

export function Stage4BAcceptanceScreen() {
  const checks = useStage4BAcceptance();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stage 4B Acceptance</Text>
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
