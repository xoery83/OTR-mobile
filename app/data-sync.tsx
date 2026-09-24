import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  DataHealthOutcome,
  DataHealthReport,
} from "@/data/health/dataHealthCoordinator";
import { getDefaultDataHealthCoordinator } from "@/data/health/defaultDataHealthCoordinator";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";

export default function DataSyncRoute() {
  const mounted = useRef(true);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<DataHealthOutcome | null>(null);
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([
      getDefaultDataHealthCoordinator().then((coordinator) =>
        coordinator.getLatestState(),
      ),
      getDefaultLedgerReportingRepository().then((repository) =>
        repository.getPreferences(),
      ),
    ])
      .then(([state, preferences]) => {
        if (!mounted.current) return;
        setOutcome(state?.outcome ?? null);
        setDebugMode(preferences.debugMode);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = async () => {
    setChecking(true);
    setFailed(false);
    try {
      const next = await (await getDefaultDataHealthCoordinator()).run("MANUAL");
      if (!mounted.current) return;
      setReport(next);
      setOutcome(next.outcome);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setChecking(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Data & Sync
      </Text>
      <Text style={styles.body}>
        Check saved changes and local data for this account. This check does not delete or
        change your travel data.
      </Text>
      <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.result}>
          {checking
            ? "Checking your data…"
            : failed
              ? "Your data could not be checked right now."
              : outcomeMessage(outcome)}
        </Text>
        {checking ? <ActivityIndicator color="#0F766E" /> : null}
        <Pressable
          accessibilityRole="button"
          disabled={checking}
          onPress={() => void check()}
          style={({ pressed }) => [
            styles.button,
            pressed && !checking ? styles.buttonPressed : null,
            checking ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.buttonText}>Check Data Health</Text>
        </Pressable>
      </View>
      {debugMode && report ? (
        <View style={styles.debugCard}>
          <Text accessibilityRole="header" style={styles.debugTitle}>
            Debug Information
          </Text>
          <Text style={styles.debugText}>
            {report.findings.length
              ? report.findings
                  .map((finding) => `${finding.ruleId} · ${finding.category}`)
                  .join("\n")
              : "No findings"}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function outcomeMessage(outcome: DataHealthOutcome | null) {
  if (outcome === "HEALTHY") return "Everything is up to date";
  if (outcome === "WAITING") return "Some saved changes are still waiting to sync";
  if (outcome === "NEEDS_ATTENTION") return "Some local data needs attention";
  return "Run a check when you want to review this account's saved data.";
}

const styles = StyleSheet.create({
  body: { color: "#475569", fontSize: 16, lineHeight: 23 },
  button: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 10,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { backgroundColor: "#115E59" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8DEE7",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 18,
    padding: 18,
  },
  content: { gap: 18, padding: 20 },
  debugCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 14,
  },
  debugText: { color: "#475569", fontFamily: "Courier", fontSize: 12, lineHeight: 18 },
  debugTitle: { color: "#334155", fontSize: 14, fontWeight: "700" },
  result: { color: "#0F172A", fontSize: 18, fontWeight: "700", lineHeight: 25 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
});
