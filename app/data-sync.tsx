import { useEffect, useRef, useState } from "react";
import * as Network from "expo-network";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon } from "@/components/AppIcon";
import type {
  DataHealthOutcome,
  DataHealthProgressStage,
  DataHealthReport,
} from "@/data/health/dataHealthCoordinator";
import { getDefaultDataHealthCoordinator } from "@/data/health/defaultDataHealthCoordinator";
import { getDefaultDataHealthScheduler } from "@/data/health/defaultDataHealthScheduler";
import {
  DATA_HEALTH_PROGRESS_STAGES,
  formatDataHealthTiming,
  formatLastChecked,
  presentDataHealthReport,
  technicalDataHealthDetails,
} from "@/data/health/dataHealthPresentation";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";

export default function DataSyncRoute() {
  const mounted = useRef(true);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<DataHealthProgressStage | null>(null);
  const [outcome, setOutcome] = useState<DataHealthOutcome | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const scheduler = getDefaultDataHealthScheduler();
    const unsubscribe = scheduler.subscribeProgress((stage) => {
      if (!mounted.current) return;
      setProgress(stage);
      if (stage) setChecking(true);
      else {
        const completed = scheduler.getLastManualReport();
        if (completed) {
          setReport(completed);
          setOutcome(completed.outcome);
          setLastCheckedAt(completed.runTiming?.completedAt ?? null);
          setChecking(false);
        }
      }
    });
    void Promise.all([
      getDefaultDataHealthCoordinator().then((coordinator) =>
        coordinator.getLatestState(),
      ),
      getDefaultLedgerReportingRepository().then((repository) =>
        repository.getPreferences(),
      ),
      Network.getNetworkStateAsync(),
    ])
      .then(([state, preferences, network]) => {
        if (!mounted.current) return;
        setOutcome(state?.outcome ?? null);
        setLastCheckedAt(state?.lastManualScanAt ?? state?.updatedAt ?? null);
        setDebugMode(preferences.debugMode);
        setOffline(
          network.isConnected === false || network.isInternetReachable === false,
        );
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  const check = async () => {
    setChecking(true);
    setFailed(false);
    setShowTechnical(false);
    try {
      const next = await getDefaultDataHealthScheduler().runManual();
      const network = await Network.getNetworkStateAsync().catch(() => null);
      if (!mounted.current) return;
      setReport(next);
      setOutcome(next.outcome);
      setLastCheckedAt(next.runTiming?.completedAt ?? null);
      if (network)
        setOffline(
          network.isConnected === false || network.isInternetReachable === false,
        );
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setChecking(false);
    }
  };

  const summary = report ? presentDataHealthReport(report, offline) : null;
  const timing = report
    ? formatDataHealthTiming(report)
    : lastCheckedAt
      ? formatLastChecked(lastCheckedAt)
      : null;
  const technicalDetails = technicalDataHealthDetails(report, debugMode);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Data & Sync
      </Text>
      <Text style={styles.body}>
        Check saved changes and refresh shared data for this account. This check never
        deletes your saved travel data.
      </Text>

      <View style={styles.card}>
        {checking ? (
          <Progress progress={progress ?? "CHECKING_SAVED"} />
        ) : failed ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.result}>
              We couldn&apos;t finish checking your data.
            </Text>
            <Text style={styles.body}>Your saved data is still protected.</Text>
          </>
        ) : summary ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.result}>
              {summary.title}
            </Text>
            <View style={styles.summaryList}>
              {summary.messages.map((message) => (
                <View key={message} style={styles.summaryRow}>
                  <AppIcon color="#0F766E" name="checkmark.circle.fill" size={18} />
                  <Text style={styles.summaryText}>{message}</Text>
                </View>
              ))}
            </View>
            {summary.attentionItems.length ? (
              <View style={styles.attentionSection}>
                <Text accessibilityRole="header" style={styles.attentionTitle}>
                  Items needing attention
                </Text>
                {summary.attentionItems.map((item) => (
                  <View key={item.key} style={styles.attentionItem}>
                    <Text style={styles.attentionItemTitle}>{item.title}</Text>
                    <Text style={styles.attentionText}>{item.message}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {timing ? <Text style={styles.timing}>{timing}</Text> : null}
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.result}>
              {savedOutcomeMessage(outcome)}
            </Text>
            {timing ? <Text style={styles.timing}>{timing}</Text> : null}
          </>
        )}

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
          <Text style={styles.buttonText}>
            {checking
              ? "Checking…"
              : failed
                ? "Try Again"
                : report || outcome
                  ? "Check Again"
                  : "Check Data Health"}
          </Text>
        </Pressable>
      </View>

      {technicalDetails ? (
        <View style={styles.technicalCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowTechnical((visible) => !visible)}
            style={styles.technicalButton}
          >
            <Text style={styles.technicalTitle}>Technical Details</Text>
            <AppIcon
              color="#64748B"
              name={showTechnical ? "chevron.down" : "chevron.right"}
              size={14}
            />
          </Pressable>
          {showTechnical ? (
            <Text style={styles.technicalText}>{technicalDetails}</Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Progress({ progress }: { progress: DataHealthProgressStage }) {
  const current = DATA_HEALTH_PROGRESS_STAGES.findIndex((stage) => stage.id === progress);
  return (
    <>
      <Text accessibilityLiveRegion="polite" style={styles.result}>
        {DATA_HEALTH_PROGRESS_STAGES[current]?.label ?? "Checking saved changes"}
      </Text>
      <View style={styles.progressList}>
        {DATA_HEALTH_PROGRESS_STAGES.map((stage, index) => (
          <View key={stage.id} style={styles.progressRow}>
            {index < current ? (
              <AppIcon color="#0F766E" name="checkmark.circle.fill" size={20} />
            ) : index === current ? (
              <ActivityIndicator color="#0F766E" size="small" />
            ) : (
              <AppIcon color="#94A3B8" name="circle" size={20} />
            )}
            <Text style={index <= current ? styles.progressText : styles.upcomingText}>
              {stage.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.helpText}>
        This may take a minute. You can leave this screen — checking will continue.
      </Text>
    </>
  );
}

function savedOutcomeMessage(outcome: DataHealthOutcome | null) {
  if (outcome === "HEALTHY") return "Everything is up to date";
  if (outcome === "WAITING")
    return "Some saved changes will continue syncing automatically";
  if (outcome === "NEEDS_ATTENTION")
    return "Some saved data is protected. Check again for current details.";
  return "Run a check when you want to review this account's saved data.";
}

const styles = StyleSheet.create({
  attentionItem: {
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    gap: 3,
    padding: 12,
  },
  attentionItemTitle: { color: "#9A3412", fontSize: 15, fontWeight: "700" },
  attentionSection: { gap: 8, marginTop: 4 },
  attentionText: { color: "#7C2D12", fontSize: 14, lineHeight: 20 },
  attentionTitle: { color: "#7C2D12", fontSize: 16, fontWeight: "800" },
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
  helpText: { color: "#64748B", fontSize: 14, lineHeight: 20 },
  progressList: { gap: 12 },
  progressRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 24 },
  progressText: { color: "#0F172A", flex: 1, fontSize: 15, fontWeight: "600" },
  result: { color: "#0F172A", fontSize: 18, fontWeight: "700", lineHeight: 25 },
  summaryList: { gap: 10 },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: 9 },
  summaryText: { color: "#334155", flex: 1, fontSize: 15, lineHeight: 21 },
  technicalButton: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  technicalCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  technicalText: {
    color: "#475569",
    fontFamily: "Courier",
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 14,
  },
  technicalTitle: { color: "#334155", fontSize: 14, fontWeight: "700" },
  timing: { color: "#64748B", fontSize: 13 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  upcomingText: { color: "#94A3B8", flex: 1, fontSize: 15 },
});
