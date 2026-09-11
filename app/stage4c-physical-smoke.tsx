import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";

import { useStage4CPhysicalSmoke } from "@/hooks/useStage4CPhysicalSmoke";

export default function Stage4CPhysicalSmokeScreen() {
  const { auto } = useLocalSearchParams<{ auto?: string | string[] }>();
  const action = Array.isArray(auto) ? auto[0] : auto;
  const smoke = useStage4CPhysicalSmoke(action);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stage 4C Physical Smoke</Text>
      <Text>
        {smoke.running
          ? `Running ${action}…`
          : action
            ? `Finished ${action}`
            : "Choose an action."}
      </Text>
      {smoke.checks.map((check, index) => (
        <Text key={`${check.name}-${index}`} style={check.ok ? styles.ok : styles.fail}>
          {check.ok ? "PASS" : "FAIL"} {check.name}: {check.detail}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10, padding: 20 },
  fail: { color: "#B91C1C", fontSize: 14 },
  ok: { color: "#0F766E", fontSize: 14 },
  title: { fontSize: 24, fontWeight: "800" },
});
