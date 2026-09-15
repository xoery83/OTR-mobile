import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function ExchangeRatesRoute() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Managed automatically
        </Text>
        <Text style={styles.body}>
          Online retrieval, cached rates, background refresh, offline fallback and manual
          overrides will live in the Currency Module.
        </Text>
        <Text style={styles.status}>Not available in this build</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: "#F6F7F9", flexGrow: 1, padding: 16 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 8, padding: 16 },
  title: { color: "#111827", fontSize: 19, fontWeight: "700" },
  body: { color: "#475569", fontSize: 15, lineHeight: 22 },
  status: { color: "#64748B", fontSize: 13, fontWeight: "700" },
});
