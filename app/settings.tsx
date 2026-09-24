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

export default function SettingsRoute() {
  const developer = process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev";
  const [debugMode, setDebugMode] = useState(false);
  const [loading, setLoading] = useState(developer);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!developer) return;
    void getDefaultLedgerReportingRepository()
      .then((repository) => repository.getPreferences())
      .then((preferences) => setDebugMode(preferences.debugMode))
      .catch(() => setMessage("Debug Mode could not be loaded."))
      .finally(() => setLoading(false));
  }, [developer]);

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Settings
      </Text>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Data & Sync
      </Text>
      <View style={styles.group}>
        <SettingRow
          icon="checkmark.shield"
          label="Check Data Health"
          onPress={() => router.push("/data-sync")}
        />
      </View>
      {developer ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Developer
          </Text>
          <View style={styles.group}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.label}>Debug Mode</Text>
                <Text style={styles.detail}>Show internal diagnostic information</Text>
              </View>
              {loading ? (
                <ActivityIndicator accessibilityLabel="Loading Debug Mode" />
              ) : (
                <Switch
                  accessibilityLabel="Debug Mode"
                  onValueChange={(enabled) => void toggleDebugMode(enabled)}
                  trackColor={{ false: "#CBD5E1", true: "#86CFC4" }}
                  value={debugMode}
                />
              )}
            </View>
          </View>
        </>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {message}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  onPress,
}: {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <AppIcon color="#475569" name={icon} size={20} />
      <Text style={[styles.label, styles.grow]}>{label}</Text>
      <AppIcon color="#64748B" name="chevron.right" size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#F6F7F9", flexGrow: 1, padding: 20 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  sectionTitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 4,
    marginTop: 24,
    textTransform: "uppercase",
  },
  group: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  grow: { flex: 1 },
  label: { color: "#0F172A", fontSize: 16, fontWeight: "600" },
  detail: { color: "#64748B", fontSize: 12, marginTop: 2 },
  error: { color: "#B91C1C", fontSize: 14, marginTop: 12 },
});
