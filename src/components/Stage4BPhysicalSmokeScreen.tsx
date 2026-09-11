import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

import { useStage4BPhysicalSmoke } from "@/hooks/useStage4BPhysicalSmoke";

export function Stage4BPhysicalSmokeScreen() {
  const smoke = useStage4BPhysicalSmoke();
  const { auto } = useLocalSearchParams<{ auto?: string | string[] }>();
  const lastAuto = useRef<string | null>(null);
  const autoAction = Array.isArray(auto) ? auto[0] : auto;

  useEffect(() => {
    if (!autoAction || lastAuto.current === autoAction) return;
    lastAuto.current = autoAction;
    const actions: Record<string, () => void> = {
      online: smoke.runOnlineSmoke,
      "prepare-offline": smoke.prepareOfflineTarget,
      "offline-edit": smoke.runOfflineEditAttempt,
      reconnect: smoke.reconnectOfflineEdit,
    };
    actions[autoAction]?.();
  }, [autoAction, smoke]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stage 4B Physical Smoke</Text>
      <View style={styles.buttons}>
        <Button
          disabled={smoke.running}
          title="Online Smoke"
          onPress={smoke.runOnlineSmoke}
        />
        <Button
          disabled={smoke.running}
          title="Prepare Offline Target"
          onPress={smoke.prepareOfflineTarget}
        />
        <Button
          disabled={smoke.running}
          title="Offline Edit Attempt"
          onPress={smoke.runOfflineEditAttempt}
        />
        <Button
          disabled={smoke.running}
          title="Reconnect Offline Edit"
          onPress={smoke.reconnectOfflineEdit}
        />
        <Button disabled={smoke.running} title="Clear" onPress={smoke.reset} />
      </View>
      {smoke.checks.map((check, index) => (
        <Text key={`${check.name}-${index}`} style={check.ok ? styles.ok : styles.fail}>
          {check.ok ? "PASS" : "FAIL"} {check.name}: {check.detail}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: 8 },
  content: { gap: 10, padding: 20 },
  fail: { color: "#B91C1C", fontSize: 14 },
  ok: { color: "#0F766E", fontSize: 14 },
  title: { fontSize: 24, fontWeight: "800" },
});
