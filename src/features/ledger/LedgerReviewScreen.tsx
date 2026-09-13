import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";

import { useLedgerReview } from "@/hooks/useLedgerReview";

export function LedgerReviewScreen() {
  const { findings, message, act, generateDiagnostics } = useLedgerReview();
  const [reason, setReason] = useState("");

  return (
    <>
      <Stack.Screen options={{ title: "Ledger Review" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Ledger Review
        </Text>
        <Text style={styles.subtitle}>
          Advisory findings never change financial records.
        </Text>
        <Pressable
          accessibilityLabel="Generate redacted support diagnostics"
          accessibilityRole="button"
          onPress={() => void generateDiagnostics()}
          style={styles.diagnosticsButton}
        >
          <Text style={styles.diagnosticsText}>Generate support diagnostics</Text>
        </Pressable>
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        ) : null}
        {findings.length === 0 ? (
          <Text style={styles.empty}>No review findings.</Text>
        ) : null}
        {findings.some(
          (finding) =>
            finding.layer === "HEURISTIC" &&
            finding.status !== "STALE" &&
            finding.status !== "RESOLVED",
        ) ? (
          <TextInput
            accessibilityLabel="Review action reason"
            multiline
            onChangeText={setReason}
            placeholder="Reason for acknowledge or dismiss"
            style={styles.reason}
            value={reason}
          />
        ) : null}
        {findings.map((finding) => (
          <View
            accessible
            accessibilityLabel={`${finding.findingType.replaceAll("_", " ")}, ${finding.severity}, ${finding.layer}, ${finding.expenseId ? `Expense revision ${finding.entityRevision ?? "unknown"}` : "Journey context"}, status ${finding.status}`}
            key={finding.id}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>
              {finding.findingType.replaceAll("_", " ")}
            </Text>
            <Text>
              {finding.severity} · {finding.layer}
            </Text>
            <Text>
              {finding.expenseId
                ? `Expense · revision ${finding.entityRevision ?? "unknown"}`
                : "Journey context"}
            </Text>
            <Text>{finding.evidenceCodes.join(" · ")}</Text>
            <Text>Status: {finding.status}</Text>
            {finding.layer === "HEURISTIC" &&
            finding.status !== "STALE" &&
            finding.status !== "RESOLVED" ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityLabel="Acknowledge finding"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !reason.trim(),
                    selected: finding.status === "ACKNOWLEDGED",
                  }}
                  disabled={!reason.trim()}
                  onPress={() => void act(finding.id, "ACKNOWLEDGED", reason.trim())}
                  style={[styles.button, !reason.trim() && styles.buttonDisabled]}
                >
                  <Text style={styles.buttonText}>Acknowledge</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Dismiss finding"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !reason.trim(),
                    selected: finding.status === "DISMISSED",
                  }}
                  disabled={!reason.trim()}
                  onPress={() => void act(finding.id, "DISMISSED", reason.trim())}
                  style={[styles.button, !reason.trim() && styles.buttonDisabled]}
                >
                  <Text style={styles.buttonText}>Dismiss</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 20, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: "800" },
  subtitle: { color: "#475569", fontSize: 16 },
  message: { color: "#92400e" },
  empty: { paddingVertical: 24 },
  card: { backgroundColor: "#f8fafc", borderRadius: 16, gap: 6, padding: 16 },
  reason: {
    backgroundColor: "white",
    borderColor: "#94A3B8",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 72,
    padding: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  diagnosticsButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  diagnosticsText: { color: "#0F766E", fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  button: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: "white", fontWeight: "700" },
});
