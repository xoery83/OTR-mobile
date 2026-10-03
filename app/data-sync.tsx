import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { systemMessage } from "@/ui/domainLabels";
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
import { ExpenseConflictList } from "@/features/ledger/ExpenseConflictList";
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
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
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
      <Text style={styles.body}>{t("health.intro")}</Text>
      <ExpenseConflictList title={t("health.decisions")} />

      <View style={styles.card}>
        {checking ? (
          <Progress progress={progress ?? "CHECKING_SAVED"} />
        ) : failed ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.result}>
              {t("health.failed")}
            </Text>
            <Text style={styles.body}>{t("health.protected")}</Text>
          </>
        ) : summary ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.result}>
              {systemMessage(summary.title)}
            </Text>
            <View style={styles.summaryList}>
              {summary.messages.map((message) => (
                <View key={message} style={styles.summaryRow}>
                  <AppIcon color={colors.accent} name="checkmark.circle.fill" size={18} />
                  <Text style={styles.summaryText}>{systemMessage(message)}</Text>
                </View>
              ))}
            </View>
            {summary.attentionItems.length ? (
              <View style={styles.attentionSection}>
                <Text accessibilityRole="header" style={styles.attentionTitle}>
                  {t("health.attention")}
                </Text>
                {summary.attentionItems.map((item) => (
                  <View key={item.key} style={styles.attentionItem}>
                    <Text style={styles.attentionItemTitle}>
                      {systemMessage(item.title)}
                    </Text>
                    <Text style={styles.attentionText}>
                      {systemMessage(item.message)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {timing ? (
              <Text style={styles.timing}>{localizedHealthTiming(timing)}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.result}>
              {savedOutcomeMessage(outcome)}
            </Text>
            {timing ? (
              <Text style={styles.timing}>{localizedHealthTiming(timing)}</Text>
            ) : null}
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
              ? t("health.checking")
              : failed
                ? t("health.tryAgain")
                : report || outcome
                  ? t("health.checkAgain")
                  : t("health.check")}
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
            <Text style={styles.technicalTitle}>{t("health.technical")}</Text>
            <AppIcon
              color={colors.textTertiary}
              name={showTechnical ? "chevron.down" : "chevron.right"}
              size={14}
            />
          </Pressable>
          {showTechnical ? (
            <Text style={styles.technicalText}>
              {report?.findings.length === 0 ? t("health.noFindings") : technicalDetails}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Progress({ progress }: { progress: DataHealthProgressStage }) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const current = DATA_HEALTH_PROGRESS_STAGES.findIndex((stage) => stage.id === progress);
  return (
    <>
      <Text accessibilityLiveRegion="polite" style={styles.result}>
        {systemMessage(DATA_HEALTH_PROGRESS_STAGES[current]?.label ?? t("health.saved"))}
      </Text>
      <View style={styles.progressList}>
        {DATA_HEALTH_PROGRESS_STAGES.map((stage, index) => (
          <View key={stage.id} style={styles.progressRow}>
            {index < current ? (
              <AppIcon color={colors.accent} name="checkmark.circle.fill" size={20} />
            ) : index === current ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <AppIcon color={colors.disabled} name="circle" size={20} />
            )}
            <Text style={index <= current ? styles.progressText : styles.upcomingText}>
              {systemMessage(stage.label)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.helpText}>{t("health.continue")}</Text>
    </>
  );
}

function savedOutcomeMessage(outcome: DataHealthOutcome | null) {
  if (outcome === "HEALTHY") return t("health.healthy");
  if (outcome === "WAITING") return t("health.waiting");
  if (outcome === "NEEDS_ATTENTION") return t("health.needsAttention");
  return t("health.idle");
}

function localizedHealthTiming(value: string) {
  return value
    .split(" · ")
    .map((part) => {
      const seconds = part.match(/^(\d+)s$/);
      if (seconds) return t("health.seconds", { count: seconds[1] });
      const duration = part.match(/^(\d+)m (\d+)s$/);
      return duration
        ? t("health.duration", { minutes: duration[1], seconds: duration[2] })
        : systemMessage(part);
    })
    .join(" · ");
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    attentionItem: {
      backgroundColor: colors.warningSurface,
      borderRadius: 10,
      gap: 3,
      padding: 12,
    },
    attentionItemTitle: { color: colors.warning, fontSize: 15, fontWeight: "700" },
    attentionSection: { gap: 8, marginTop: 4 },
    attentionText: { color: colors.warning, fontSize: 14, lineHeight: 20 },
    attentionTitle: { color: colors.warning, fontSize: 16, fontWeight: "800" },
    body: { color: colors.textSecondary, fontSize: 16, lineHeight: 23 },
    button: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 10,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    buttonDisabled: { opacity: 0.55 },
    buttonPressed: { backgroundColor: colors.accent },
    buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 18,
      padding: 18,
    },
    content: { backgroundColor: colors.background, flexGrow: 1, gap: 18, padding: 20 },
    helpText: { color: colors.textTertiary, fontSize: 14, lineHeight: 20 },
    progressList: { gap: 12 },
    progressRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 24 },
    progressText: { color: colors.textPrimary, flex: 1, fontSize: 15, fontWeight: "600" },
    result: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
      lineHeight: 25,
    },
    summaryList: { gap: 10 },
    summaryRow: { alignItems: "center", flexDirection: "row", gap: 9 },
    summaryText: { color: colors.textSecondary, flex: 1, fontSize: 15, lineHeight: 21 },
    technicalButton: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44,
    },
    technicalCard: {
      backgroundColor: colors.groupedBackground,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    technicalText: {
      color: colors.textSecondary,
      fontFamily: "Courier",
      fontSize: 12,
      lineHeight: 18,
      paddingBottom: 14,
    },
    technicalTitle: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
    timing: { color: colors.textTertiary, fontSize: 13 },
    upcomingText: { color: colors.disabled, flex: 1, fontSize: 15 },
  });
