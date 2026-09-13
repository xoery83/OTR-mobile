import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, Stack } from "expo-router";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import {
  chooseJourneyEntry,
  type LedgerJourneyContext,
} from "@/domain/ledger/journeyContext";
import type { ReportingAggregate, ReportingScope } from "@/domain/ledger/reporting";
import { stage3JourneyId } from "@/hooks/useLedgerStage3";
import { useLedgerReportingRefresh } from "@/hooks/useLedgerReportingRefresh";

import { formatLedgerMoney } from "./format";
import { SettlementReadinessScreen } from "./SettlementReadinessScreen";

type Mode = "SPENDING" | "SETTLEMENT";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function LedgerStage6Screen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { refreshJourney, refreshPersonal } = useLedgerReportingRefresh();
  const manualJourneyId = useRef<string | undefined>(undefined);
  const [journeys, setJourneys] = useState<LedgerJourneyContext[]>([]);
  const [journey, setJourney] = useState<LedgerJourneyContext | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [scope, setScope] = useState<ReportingScope>("MINE");
  const [mode, setMode] = useState<Mode>("SPENDING");
  const [summary, setSummary] = useState<ReportingAggregate | null>(null);
  const [expenses, setExpenses] = useState<LedgerReportListItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fallbackJourneyId =
    journeys.length === 0 || journeys.some((item) => item.journeyId === stage3JourneyId)
      ? stage3JourneyId
      : "";

  const loadContext = useCallback(async () => {
    const repository = await getDefaultLedgerReportingRepository();
    const available = await repository.listJourneys();
    const selected = await repository.getSelectedJourneyId();
    const entry = chooseJourneyEntry(
      available,
      localToday(),
      selected,
      manualJourneyId.current,
    );
    setJourneys(available);
    const nextJourney =
      entry.kind === "JOURNEY"
        ? (available.find((item) => item.journeyId === entry.journeyId) ?? null)
        : null;
    setJourney((current) =>
      current?.journeyId === nextJourney?.journeyId &&
      current?.title === nextJourney?.title &&
      current?.startDate === nextJourney?.startDate &&
      current?.endDate === nextJourney?.endDate &&
      current?.settlementCurrency === nextJourney?.settlementCurrency &&
      current?.settlementScale === nextJourney?.settlementScale
        ? current
        : nextJourney,
    );
    if (manualJourneyId.current && nextJourney) setMessage(null);
    else if (entry.kind === "CHOOSE") setMessage("Choose a current Journey to continue.");
    else if (entry.kind === "MY_LEDGER")
      setMessage("No Journey is current today. My Ledger remains available.");
    setLoading(false);
  }, []);

  const loadReport = useCallback(async () => {
    if (!journey) {
      setSummary(null);
      setExpenses([]);
      return;
    }
    const repository = await getDefaultLedgerReportingRepository();
    const actor = await repository.getActorMemberId(journey.journeyId);
    const currentMemberId = actor?.memberId ?? null;
    setMemberId(currentMemberId);
    if (!currentMemberId) {
      setSummary(null);
      setExpenses([]);
      setMessage(
        "This Journey needs an authenticated bootstrap before reporting is available.",
      );
      return;
    }
    const query = { journeyId: journey.journeyId, memberId: currentMemberId, scope };
    const [nextSummary, nextExpenses] = await Promise.all([
      repository.summarize(query),
      repository.listExpenses(query, 30),
    ]);
    setSummary(nextSummary);
    setExpenses(nextExpenses);
  }, [journey, scope]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => loadContext())
      .catch(() => {
        setLoading(false);
        setMessage("Ledger cache is unavailable.");
      });
  }, [loadContext]);

  useEffect(() => {
    void Promise.resolve()
      .then(loadReport)
      .catch(() => setMessage("Ledger reporting cache is unavailable."));
  }, [loadReport]);

  useEffect(() => {
    const id = journey?.journeyId ?? fallbackJourneyId;
    if (!id) return;
    void refreshJourney(id)
      .then(async () => {
        await refreshPersonal("ALL", { from: null, to: null });
        await loadContext();
        await loadReport();
      })
      .catch(() => setMessage((current) => current ?? "Offline · showing SQLite data"));
  }, [
    journey?.journeyId,
    fallbackJourneyId,
    loadContext,
    loadReport,
    refreshJourney,
    refreshPersonal,
  ]);

  const choose = () => {
    const labels = journeys.map((item) => {
      const dates = [item.startDate, item.endDate].filter(Boolean).join(" – ");
      return `${item.title}${dates ? ` · ${dates}` : ""}`;
    });
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Choose Ledger",
        options: [...labels, "My Ledger", "Cancel"],
        cancelButtonIndex: labels.length + 1,
      },
      (index) => {
        if (index === labels.length) {
          router.push("/expenses/all-journeys");
          return;
        }
        const selected = journeys[index];
        if (!selected) return;
        manualJourneyId.current = selected.journeyId;
        void getDefaultLedgerReportingRepository().then(async (repository) => {
          await repository.selectJourney(selected.journeyId);
          setJourney(selected);
          setMessage(null);
        });
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.content, largeText && styles.largeContent]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={[styles.header, largeText && styles.stack]}>
          <Text
            accessibilityRole="header"
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            numberOfLines={1}
            style={styles.title}
          >
            Ledger
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/expenses/new")}
            style={styles.add}
          >
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={2}
              minimumFontScale={0.5}
              numberOfLines={1}
              style={styles.addText}
            >
              + Expense
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityHint="Choose a Journey or open My Ledger"
          accessibilityLabel={
            journey
              ? `${journey.title}, ${journey.startDate ?? "no start date"} to ${journey.endDate ?? "no end date"}, settlement currency ${journey.settlementCurrency}`
              : "No current Journey selected"
          }
          accessibilityRole="button"
          onPress={choose}
          style={styles.context}
        >
          <Text maxFontSizeMultiplier={2} style={styles.contextTitle}>
            {journey?.title ?? "Choose Journey"}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.meta}>
            {journey
              ? `${journey.startDate ?? "Open start"} – ${journey.endDate ?? "Open end"} · ${journey.settlementCurrency}`
              : "My Ledger and manually selectable Journeys are still available"}
          </Text>
        </Pressable>

        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={2}
            style={styles.message}
          >
            {message}
          </Text>
        ) : null}
        {loading ? <ActivityIndicator /> : null}

        {journey ? (
          <>
            <Segment
              stacked={largeText}
              value={mode}
              options={["SPENDING", "SETTLEMENT"]}
              onChange={setMode}
            />
            {mode === "SPENDING" ? (
              <>
                <Segment
                  stacked={largeText}
                  value={scope}
                  options={["MINE", "GROUP"]}
                  onChange={setScope}
                />
                <View style={styles.total}>
                  <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>
                    {scope === "MINE" ? "MY SPENDING" : "GROUP SPENDING"}
                  </Text>
                  <Text
                    accessibilityLabel={`${scope === "MINE" ? "My" : "Group"} authoritative spending ${summary ? formatLedgerMoney(summary.totalMinor, journey.settlementCurrency, journey.settlementScale) : "unavailable"}`}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={2}
                    minimumFontScale={0.5}
                    numberOfLines={1}
                    style={styles.totalValue}
                  >
                    {summary
                      ? formatLedgerMoney(
                          summary.totalMinor,
                          journey.settlementCurrency,
                          journey.settlementScale,
                        )
                      : "—"}
                  </Text>
                  <Text maxFontSizeMultiplier={2} style={styles.meta}>
                    {summary?.expenseCount ?? 0} valued Expenses
                  </Text>
                </View>
                {summary?.unresolvedRateCount || summary?.openConflictCount ? (
                  <View style={styles.attention}>
                    <Text maxFontSizeMultiplier={2} style={styles.attentionTitle}>
                      Excluded from authoritative total
                    </Text>
                    <Text maxFontSizeMultiplier={2} style={styles.meta}>
                      {summary.unresolvedRateCount} rate required ·{" "}
                      {summary.openConflictCount} open conflict
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.actions, largeText && styles.stack]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/expenses/analysis",
                        params: {
                          journeyId: journey.journeyId,
                          memberId: memberId ?? "",
                          scope,
                        },
                      })
                    }
                    style={styles.action}
                  >
                    <Text maxFontSizeMultiplier={2} style={styles.actionText}>
                      Analysis
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/expenses/search",
                        params: {
                          journeyId: journey.journeyId,
                          memberId: memberId ?? "",
                          scope,
                        },
                      })
                    }
                    style={styles.action}
                  >
                    <Text maxFontSizeMultiplier={2} style={styles.actionText}>
                      Search & Filter
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/expenses/review" as never)}
                    style={styles.action}
                  >
                    <Text maxFontSizeMultiplier={2} style={styles.actionText}>
                      Review
                    </Text>
                  </Pressable>
                </View>
                <Text maxFontSizeMultiplier={2} style={styles.section}>
                  RECENT EXPENSES
                </Text>
                <View style={styles.surface}>
                  {expenses.map((expense) => (
                    <Pressable
                      accessibilityLabel={`${expense.title}, ${formatLedgerMoney(expense.originalMinor, expense.originalCurrency, expense.originalScale)}${expense.isAuthoritative ? "" : ", excluded from authoritative total"}`}
                      accessibilityRole="button"
                      key={expense.id}
                      onPress={() => router.push(`/expenses/expense/${expense.id}`)}
                      style={[styles.row, largeText && styles.stack]}
                    >
                      <View style={styles.grow}>
                        <Text maxFontSizeMultiplier={2} style={styles.rowTitle}>
                          {expense.title}
                        </Text>
                        <Text maxFontSizeMultiplier={2} style={styles.meta}>
                          {expense.payerName} paid · {expense.category}
                        </Text>
                        {!expense.isAuthoritative ? (
                          <Text maxFontSizeMultiplier={2} style={styles.warning}>
                            {expense.hasOpenConflict
                              ? "Conflict"
                              : expense.businessStatus === "RATE_REQUIRED"
                                ? "Rate required"
                                : expense.businessStatus}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={2}
                        minimumFontScale={0.5}
                        numberOfLines={1}
                        style={styles.rowAmount}
                      >
                        {formatLedgerMoney(
                          expense.originalMinor,
                          expense.originalCurrency,
                          expense.originalScale,
                        )}
                      </Text>
                    </Pressable>
                  ))}
                  {expenses.length === 0 ? (
                    <Text maxFontSizeMultiplier={2} style={styles.empty}>
                      No cached Expenses.
                    </Text>
                  ) : null}
                </View>
              </>
            ) : (
              <SettlementReadinessScreen embedded journeyId={journey.journeyId} />
            )}
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/expenses/all-journeys")}
            style={styles.primary}
          >
            <Text maxFontSizeMultiplier={2} style={styles.primaryText}>
              Open My Ledger
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

function Segment<T extends string>({
  stacked,
  value,
  options,
  onChange,
}: {
  stacked?: boolean;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={[styles.segment, stacked && styles.stack]}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          key={option}
          onPress={() => onChange(option)}
          style={[styles.segmentItem, value === option && styles.segmentSelected]}
        >
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={2}
            minimumFontScale={0.5}
            numberOfLines={1}
            style={[styles.segmentText, value === option && styles.segmentTextSelected]}
          >
            {option === "MINE"
              ? "Mine"
              : option === "GROUP"
                ? "Group"
                : option === "SPENDING"
                  ? "Spending"
                  : "Settlement"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: "#F6F7F9",
    flexGrow: 1,
    gap: 14,
    padding: 16,
    paddingBottom: 40,
  },
  largeContent: { paddingBottom: 140 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  title: { color: "#111827", fontSize: 32, fontWeight: "800" },
  add: { minHeight: 44, justifyContent: "center" },
  addText: { color: "#087E68", fontSize: 16, fontWeight: "700" },
  context: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    gap: 4,
    minHeight: 68,
    padding: 14,
  },
  contextTitle: { color: "#111827", fontSize: 18, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 13 },
  message: { color: "#7C5B00", fontSize: 14 },
  segment: {
    backgroundColor: "#E5E7EB",
    borderRadius: 9,
    flexDirection: "row",
    padding: 2,
  },
  segmentItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 8,
    borderRadius: 7,
  },
  segmentSelected: { backgroundColor: "#FFFFFF" },
  segmentText: { color: "#64748B", fontWeight: "600" },
  segmentTextSelected: { color: "#111827" },
  total: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16 },
  eyebrow: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  totalValue: { color: "#111827", fontSize: 30, fontWeight: "800", marginVertical: 4 },
  attention: { backgroundColor: "#FFF7DB", borderRadius: 10, padding: 13 },
  attentionTitle: { color: "#7C5B00", fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10 },
  action: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  actionText: { color: "#087E68", fontWeight: "700" },
  section: { color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 4 },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 14,
  },
  grow: { flex: 1 },
  rowTitle: { color: "#111827", fontSize: 16, fontWeight: "600" },
  rowAmount: { color: "#111827", fontSize: 15, fontWeight: "700" },
  warning: { color: "#B45309", fontSize: 12, fontWeight: "700", marginTop: 3 },
  empty: { color: "#64748B", padding: 24, textAlign: "center" },
  readiness: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 10, padding: 18 },
  readinessTitle: { color: "#111827", fontSize: 20, fontWeight: "700" },
  body: { color: "#334155", fontSize: 15, lineHeight: 22 },
  stack: { alignItems: "stretch", flexDirection: "column" },
  primary: {
    alignItems: "center",
    backgroundColor: "#087E68",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 12,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
