import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function LedgerSettingsRoute() {
  return (
    <View style={styles.content}>
      <Text style={styles.body}>
        No configurable Ledger settings are available for this Journey yet.
      </Text>
      {__DEV__ ? (
        <View style={styles.diagnostics}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Developer / Diagnostics
          </Text>
          <Text style={styles.body}>
            Development-only local sync and failure controls. Not shown in Release.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/expenses/stage2" as never)}
            style={styles.row}
          >
            <Text style={styles.rowText}>Open local sync diagnostics</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#F6F7F9", flex: 1, gap: 8, padding: 20 },
  body: { color: "#64748B", fontSize: 16, lineHeight: 23 },
  diagnostics: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
    padding: 14,
  },
  sectionTitle: { color: "#9A3412", fontSize: 18, fontWeight: "700" },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  rowText: { color: "#0F766E", fontSize: 16, fontWeight: "700" },
});
