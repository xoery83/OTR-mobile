import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";

import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { myLedgerPeriodBounds } from "@/domain/ledger/journeyContext";
import { useLedgerReportingRefresh } from "@/hooks/useLedgerReportingRefresh";
import { formatLedgerDateRange, formatLedgerMoney } from "./format";
import { createLatestRequest } from "./latestRequest";
import { loadMyLedger } from "./loadMyLedger";
import type { Period } from "./myLedgerAnalytics";
import { settlementPositionLabel, spendingPercentage } from "./dashboardPresentation";

type ViewData = Awaited<ReturnType<typeof loadMyLedger>>;
type Section = "SPENDING" | "SETTLEMENTS";

export function MyLedgerScreen() {
  const [period, setPeriod] = useState<Period>("YEAR");
  const [section, setSection] = useState<Section>("SPENDING");
  const [currency, setCurrency] = useState<string | null>(null);
  const [view, setView] = useState<ViewData | null>(null);
  const [viewGeneration, setViewGeneration] = useState(getAccountGeneration);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [request] = useState(createLatestRequest);
  const { refreshPersonal } = useLedgerReportingRefresh();
  const selection = useRef({ period, currency, section });
  useEffect(() => {
    selection.current = { period, currency, section };
  }, [period, currency, section]);

  const load = useCallback(
    async (nextPeriod: Period, nextCurrency: string | null, nextSection: Section) => {
      const id = request.begin();
      const generation = getAccountGeneration();
      setLoading(true);
      setError(false);
      try {
        const next = await loadMyLedger(nextPeriod, nextCurrency, nextSection);
        if (!request.isCurrent(id) || generation !== getAccountGeneration()) return;
        setView(next);
        setViewGeneration(generation);
        setCurrency(next.currency);
      } catch {
        if (request.isCurrent(id)) setError(true);
      } finally {
        if (request.isCurrent(id)) setLoading(false);
      }
    },
    [request],
  );

  useFocusEffect(
    useCallback(() => {
      void load(period, currency, section);
      return () => request.cancel();
    }, [load, period, currency, section, request]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const generation = getAccountGeneration();
      void refreshPersonal(period, myLedgerPeriodBounds(period, new Date()))
        .then(() => {
          if (
            active &&
            generation === getAccountGeneration() &&
            selection.current.period === period
          )
            void load(period, selection.current.currency, selection.current.section);
        })
        .catch(() => {
          /* Saved data remains usable offline. */
        });
      return () => {
        active = false;
      };
    }, [period, refreshPersonal, load]),
  );

  const changePeriod = (next: Period) => {
    setPeriod(next);
    setView(null);
  };
  const changeCurrency = (next: string) => {
    setCurrencyOpen(false);
    setCurrency(next);
    setView(null);
  };
  const shown =
    viewGeneration === getAccountGeneration() &&
    view?.period === period &&
    view.currency === currency &&
    view.section === section
      ? view
      : null;
  const spending = shown?.spending;
  const maxMonth = Math.max(1, ...(spending?.months.map(([, amount]) => amount) ?? []));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View accessibilityRole="tablist" style={styles.segment}>
        {(["SPENDING", "SETTLEMENTS"] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item }}
            style={[styles.segmentItem, section === item && styles.selected]}
            onPress={() => {
              setSection(item);
              setView(null);
            }}
          >
            <Text style={styles.segmentText}>
              {item === "SPENDING" ? "Spending" : "Settlements"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {section === "SPENDING" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Display currency, ${currency ?? "loading"}`}
            style={styles.currencyControl}
            onPress={() => setCurrencyOpen(true)}
          >
            <Text style={styles.filterLabel}>Display Currency</Text>
            <Text style={styles.currency}>{currency ?? "—"} ▾</Text>
          </Pressable>
        ) : (
          <View style={styles.currencyControl}>
            <Text style={styles.filterLabel}>Settlement Currency</Text>
            <Text style={styles.currency}>Per Journey</Text>
          </View>
        )}
        <View accessibilityRole="tablist" style={styles.periodGroup}>
          {(["YEAR", "ALL"] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === item }}
              style={[styles.periodItem, period === item && styles.periodSelected]}
              onPress={() => changePeriod(item)}
            >
              <Text
                style={[styles.periodText, period === item && styles.periodTextSelected]}
              >
                {item === "YEAR" ? "This Year" : "All Time"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {loading && !shown ? (
        <ActivityIndicator accessibilityLabel="Loading My Ledger" />
      ) : null}
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void load(period, currency, section)}
        >
          <Text style={styles.error}>
            My Ledger could not be loaded. Tap to try again.
          </Text>
        </Pressable>
      ) : null}
      {shown && section === "SPENDING" && spending ? (
        <>
          <View style={styles.total}>
            <Text style={styles.amount}>
              ≈{" "}
              {formatLedgerMoney(spending.totalMinor, spending.currency, spending.scale)}
            </Text>
            <Text style={styles.label}>Total spending</Text>
            {spending.unconverted ? (
              <Text style={styles.meta}>
                Excludes {spending.unconverted} unconverted{" "}
                {spending.unconverted === 1 ? "expense" : "expenses"}
              </Text>
            ) : null}
            {shown.incompleteJourneyCount ? (
              <Text style={styles.meta}>
                Excludes {shown.incompleteJourneyCount}{" "}
                {shown.incompleteJourneyCount === 1 ? "Journey" : "Journeys"} without
                saved Expense detail
              </Text>
            ) : null}
          </View>
          <Text style={styles.heading}>By Category</Text>
          {spending.categories.length ? (
            spending.categories.map(([name, amount], index) => {
              const percentage = spendingPercentage(amount, spending.totalMinor);
              return (
                <View key={`${name}-${index}`} style={styles.category}>
                  <View style={styles.inline}>
                    <Text style={styles.categoryName}>{name}</Text>
                    <Text>
                      {formatLedgerMoney(amount, spending.currency, spending.scale)}
                      <Text style={styles.categoryPercentage}>{` · ${percentage}%`}</Text>
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${percentage}%` }]} />
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.meta}>No spending in this period.</Text>
          )}
          <Text style={styles.heading}>Monthly Spending</Text>
          <View style={styles.chart} accessibilityLabel="Monthly spending chart">
            {spending.months.map(([month, amount]) => (
              <View
                key={month}
                style={styles.month}
                accessible
                accessibilityLabel={`${month}, ${formatLedgerMoney(amount, spending.currency, spending.scale)}`}
              >
                <View style={styles.barArea}>
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(2, (Math.max(0, amount) / maxMonth) * 90) },
                    ]}
                  />
                </View>
                <Text numberOfLines={1} style={styles.monthLabel}>
                  {spending.months.length <= 12
                    ? new Date(`${month}-01T12:00:00Z`).toLocaleString(undefined, {
                        month: "short",
                      })
                    : spending.months.length <= 36 && month.endsWith("-01")
                      ? month.slice(0, 4)
                      : ""}
                </Text>
              </View>
            ))}
          </View>
          {spending.months.length > 12 ? (
            <Text style={styles.chartRange}>
              {spending.months[0][0]} – {spending.months.at(-1)![0]}
            </Text>
          ) : null}
        </>
      ) : null}
      {shown && section === "SETTLEMENTS" ? (
        <>
          {shown.settlements.map(({ journey, projection, status }) => (
            <Pressable
              key={journey.journeyId}
              accessibilityRole="button"
              accessibilityLabel={`${journey.title}, ${projection ? `${settlementPositionLabel(projection.balanceMinor)}, ${formatLedgerMoney(Math.abs(projection.balanceMinor), projection.currency, projection.scale)}` : "balance unavailable"}`}
              style={styles.journey}
              onPress={async () => {
                await (
                  await getDefaultLedgerReportingRepository()
                ).selectJourney(journey.journeyId);
                router.replace("/expenses");
              }}
            >
              <View style={styles.grow}>
                <Text style={styles.journeyTitle}>{journey.title}</Text>
                <Text style={styles.meta}>
                  {formatLedgerDateRange(journey.startDate, journey.endDate)}
                </Text>
                {status ? <Text style={styles.meta}>{status}</Text> : null}
              </View>
              <View style={styles.balanceColumn}>
                <Text style={styles.balance}>
                  {projection
                    ? formatLedgerMoney(
                        Math.abs(projection.balanceMinor),
                        projection.currency,
                        projection.scale,
                      )
                    : "—"}
                </Text>
                {projection ? (
                  <Text style={styles.balanceMeaning}>
                    {settlementPositionLabel(projection.balanceMinor)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {!shown.settlements.length ? (
            <Text style={styles.meta}>No Journeys in this period.</Text>
          ) : null}
        </>
      ) : null}
      <Modal
        visible={currencyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCurrencyOpen(false)}>
          <View style={styles.menu}>
            <Text style={styles.heading}>Display Currency</Text>
            {(shown?.options ?? []).map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option}
                style={styles.option}
                onPress={() => changeCurrency(option)}
              >
                <Text>{option}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              style={styles.option}
              onPress={() => setCurrencyOpen(false)}
            >
              <Text>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
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
  segment: {
    backgroundColor: "#E5E7EB",
    borderRadius: 9,
    flexDirection: "row",
    padding: 2,
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  selected: { backgroundColor: "#FFFFFF" },
  segmentText: { color: "#111827", fontWeight: "600" },
  filterRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  currencyControl: {
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 112,
  },
  filterLabel: { color: "#64748B", fontSize: 11 },
  currency: { color: "#111827", fontSize: 14, fontWeight: "700", marginTop: 2 },
  periodGroup: { flexDirection: "row", gap: 4, marginLeft: "auto" },
  periodItem: {
    borderColor: "#D5DCE6",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 10,
  },
  periodSelected: { backgroundColor: "#E8EDF4", borderColor: "#BFC9D8" },
  periodText: { color: "#64748B", fontSize: 12 },
  periodTextSelected: { color: "#1F2937", fontWeight: "700" },
  label: { color: "#64748B", fontSize: 14 },
  total: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 3, padding: 20 },
  amount: { color: "#111827", fontSize: 30, fontWeight: "700" },
  heading: { color: "#111827", fontSize: 18, fontWeight: "700", marginTop: 8 },
  meta: { color: "#64748B", fontSize: 13 },
  error: { color: "#B91C1C" },
  category: { gap: 6 },
  inline: { flexDirection: "row", justifyContent: "space-between" },
  categoryName: { flex: 1, fontWeight: "600" },
  categoryPercentage: { color: "#64748B", fontSize: 12 },
  track: { backgroundColor: "#E5E7EB", borderRadius: 4, height: 6 },
  fill: { backgroundColor: "#64748B", borderRadius: 4, height: 6 },
  chart: { flexDirection: "row", height: 116, width: "100%" },
  month: { alignItems: "center", flex: 1, justifyContent: "flex-end", minWidth: 0 },
  barArea: {
    alignItems: "center",
    height: 94,
    justifyContent: "flex-end",
    width: "100%",
  },
  bar: {
    backgroundColor: "#64748B",
    borderRadius: 2,
    maxWidth: 22,
    minWidth: 1,
    width: "68%",
  },
  monthLabel: {
    color: "#64748B",
    fontSize: 9,
    height: 15,
    marginTop: 5,
    textAlign: "center",
    width: "100%",
  },
  chartRange: { color: "#64748B", fontSize: 11, textAlign: "center" },
  journey: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 14,
  },
  grow: { flex: 1 },
  journeyTitle: { color: "#111827", fontSize: 16, fontWeight: "700" },
  balanceColumn: { alignItems: "flex-end", maxWidth: "46%" },
  balance: { color: "#111827", fontWeight: "700", textAlign: "right" },
  balanceMeaning: { color: "#64748B", fontSize: 11, marginTop: 3 },
  backdrop: { backgroundColor: "#0006", flex: 1, justifyContent: "center", padding: 28 },
  menu: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 18 },
  option: { justifyContent: "center", minHeight: 48 },
});
