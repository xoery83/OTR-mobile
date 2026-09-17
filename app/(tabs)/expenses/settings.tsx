import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";

export default function LedgerSettingsRoute() {
  const [debugMode, setDebugMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getDefaultLedgerReportingRepository()
      .then((repository) => repository.getPreferences())
      .then((preferences) => {
        setDebugMode(preferences.debugMode);
      })
      .catch(() => setMessage("Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const toggleDebugMode = async (enabled: boolean) => {
    setDebugMode(enabled);
    setMessage(null);
    try {
      const repository = await getDefaultLedgerReportingRepository();
      await repository.setDebugMode(enabled);
    } catch {
      setDebugMode(!enabled);
      setMessage("Debug Mode could not be saved.");
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Ledger
        </Text>
        <View style={styles.group}>
          <SettingRow
            label="Exchange Rates"
            onPress={() => router.push("/expenses/exchange-rates" as never)}
          />
        </View>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Developer
        </Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.label}>Debug Mode</Text>
              <Text style={styles.detail}>Show diagnostic information on Ledger</Text>
            </View>
            <Switch
              accessibilityLabel="Debug Mode"
              onValueChange={(enabled) => void toggleDebugMode(enabled)}
              trackColor={{ false: "#CBD5E1", true: "#86CFC4" }}
              value={debugMode}
            />
          </View>
        </View>
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
    </>
  );
}

function SettingRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rowValue}>
        <AppIcon color="#94A3B8" name="chevron.right" size={14} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { backgroundColor: "#F6F7F9", flexGrow: 1, padding: 16, paddingBottom: 40 },
  sectionTitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 4,
    marginTop: 18,
    textTransform: "uppercase",
  },
  group: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  grow: { flex: 1 },
  label: { color: "#111827", flex: 1, fontSize: 16, fontWeight: "600" },
  detail: { color: "#64748B", fontSize: 12, marginTop: 2 },
  rowValue: { alignItems: "center", flexDirection: "row", gap: 6 },
  error: { color: "#B91C1C", fontSize: 14, margin: 8 },
});
