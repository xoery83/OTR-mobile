import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFoundationDiagnostics } from "@/hooks/useFoundationDiagnostics";

export function FoundationDiagnosticsScreen() {
  const { diagnostics, error } = useFoundationDiagnostics();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Foundation Diagnostics</Text>
        {error ? <Text style={styles.value}>{error}</Text> : null}
        {diagnostics ? (
          <View style={styles.list}>
            <Text style={styles.value}>
              DB initialized: {diagnostics.dbInitialized ? "yes" : "no"}
            </Text>
            <Text style={styles.value}>Schema version: {diagnostics.schemaVersion}</Text>
            <Text style={styles.value}>Auth: {diagnostics.authState}</Text>
            <Text style={styles.value}>Network: {diagnostics.networkState}</Text>
            <Text style={styles.value}>Pending sync: {diagnostics.pendingSyncCount}</Text>
            <Text style={styles.value}>
              Pending itinerary create: {diagnostics.pendingItineraryCreateCount}
            </Text>
          </View>
        ) : (
          <Text style={styles.value}>Loading diagnostics...</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, padding: 24 },
  title: { color: "#0F172A", fontSize: 24, fontWeight: "700" },
  list: { gap: 10, marginTop: 24 },
  value: { color: "#334155", fontSize: 16, marginTop: 18 },
});
