import { ScrollView, StyleSheet, Text } from "react-native";
import { useStage52Acceptance } from "@/hooks/useStage52Acceptance";

export function Stage52AcceptanceScreen() {
  const checks = useStage52Acceptance();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stage 5.2 Acceptance</Text>
      {checks.map((check, index) => (
        <Text key={`${check.name}-${index}`} style={check.ok ? styles.ok : styles.fail}>
          {check.ok ? "PASS" : "FAIL"} · {check.name} · {check.detail}
        </Text>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { gap: 12, padding: 24, paddingTop: 64 },
  title: { fontSize: 26, fontWeight: "800" },
  ok: { color: "#047857" },
  fail: { color: "#B91C1C" },
});
