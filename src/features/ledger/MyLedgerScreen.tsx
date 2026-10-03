import { segmentedControlTokens } from "@/ui/segmented";
import { categoryLabel, domainLabel } from "@/ui/domainLabels";
import { t, getFormatLocale } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { MoneyText } from "./MoneyText";
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
import { myLedgerPeriodBounds } from "@/domain/ledger/journeyContext";
import { useLedgerReportingRefresh } from "@/hooks/useLedgerReportingRefresh";
import { formatLedgerDateRange, formatLedgerMoney } from "./format";
import { visual as cv } from "@/ui/visual";
import { createLatestRequest } from "./latestRequest";
import { loadMyLedger } from "./loadMyLedger";
import type { Period } from "./myLedgerAnalytics";
import { settlementPositionLabel, spendingPercentage } from "./dashboardPresentation";

type ViewData = Awaited<ReturnType<typeof loadMyLedger>>;
type Section = "SPENDING" | "SETTLEMENTS";

export function MyLedgerScreen() {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

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
            <Text
              style={[styles.segmentText, section === item && styles.segmentTextSelected]}
            >
              {item === "SPENDING" ? t("ui.spending") : t("ui.settlements")}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filterRow}>
        {section === "SPENDING" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("myLedger.currencyDescription", {
              currency: currency ?? t("common.loading"),
            })}
            style={styles.currencyControl}
            onPress={() => setCurrencyOpen(true)}
          >
            <Text style={styles.filterLabel}>{t("ui.displayCurrency")}</Text>
            <Text style={styles.currency}>{currency ?? "—"} ▾</Text>
          </Pressable>
        ) : (
          <View style={styles.currencyControl}>
            <Text style={styles.filterLabel}>{t("ui.settlementCurrency")}</Text>
            <Text style={styles.currency}>{t("ui.perJourney")}</Text>
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
                {item === "YEAR" ? t("ui.thisYear") : t("ui.allTime")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {loading && !shown ? (
        <ActivityIndicator accessibilityLabel={t("ui.loadingMyLedger")} />
      ) : null}
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void load(period, currency, section)}
        >
          <Text style={styles.error}>
            {t("ui.myLedgerCouldNotBeLoadedTapToTryAgain")}
          </Text>
        </Pressable>
      ) : null}
      {shown && section === "SPENDING" && spending ? (
        <>
          <View style={styles.total}>
            <MoneyText
              variant="hero"
              style={styles.amount}
              prefix="≈ "
              minor={spending.totalMinor}
              currency={spending.currency}
              scale={spending.scale}
            />
            <Text style={styles.label}>{t("ui.totalSpending")}</Text>
            {spending.unconverted ? (
              <Text style={styles.meta}>
                {t("myLedger.excludedExpenses", { count: spending.unconverted })}
              </Text>
            ) : null}
            {shown.incompleteJourneyCount ? (
              <Text style={styles.meta}>
                {t("myLedger.excludedJourneys", { count: shown.incompleteJourneyCount })}
              </Text>
            ) : null}
          </View>
          <Text style={styles.heading}>{t("ui.byCategory")}</Text>
          {spending.categories.length ? (
            spending.categories.map(([name, amount], index) => {
              const percentage = spendingPercentage(amount, spending.totalMinor);
              return (
                <View key={`${name}-${index}`} style={styles.category}>
                  <View style={styles.inline}>
                    <Text style={styles.categoryName}>{categoryLabel(name)}</Text>
                    <Text>
                      <MoneyText
                        accessible={false}
                        minor={amount}
                        currency={spending.currency}
                        scale={spending.scale}
                      />
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
            <Text style={styles.meta}>{t("ui.noSpendingInThisPeriod")}</Text>
          )}
          <Text style={styles.heading}>{t("ui.monthlySpending")}</Text>
          <View style={styles.chart} accessibilityLabel={t("ui.monthlySpendingChart")}>
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
                    ? new Date(`${month}-01T12:00:00Z`).toLocaleString(
                        getFormatLocale(),
                        {
                          month: "short",
                        },
                      )
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
              accessibilityLabel={`${journey.title}, ${projection ? `${settlementPositionLabel(projection.balanceMinor)}, ${formatLedgerMoney(Math.abs(projection.balanceMinor), projection.currency, projection.scale)}` : t("ui.balanceUnavailable")}`}
              style={styles.journey}
              onPress={() =>
                router.push({
                  pathname: "/expenses/settlement",
                  params: { journeyId: journey.journeyId, journeyTitle: journey.title },
                })
              }
            >
              <View style={styles.grow}>
                <Text style={styles.journeyTitle}>{journey.title}</Text>
                <Text style={styles.meta}>
                  {formatLedgerDateRange(journey.startDate, journey.endDate)}
                </Text>
                {status ? <Text style={styles.meta}>{domainLabel(status)}</Text> : null}
              </View>
              <View style={styles.balanceColumn}>
                <MoneyText
                  style={styles.balance}
                  minor={projection ? Math.abs(projection.balanceMinor) : null}
                  currency={projection?.currency ?? journey.settlementCurrency}
                  scale={projection?.scale ?? journey.settlementScale}
                />
                {projection ? (
                  <Text
                    style={[
                      styles.balanceMeaning,
                      projection.balanceMinor > 0
                        ? styles.owed
                        : projection.balanceMinor < 0
                          ? styles.owe
                          : styles.settled,
                    ]}
                  >
                    {settlementPositionLabel(projection.balanceMinor)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {!shown.settlements.length ? (
            <Text style={styles.meta}>{t("ui.noJourneysInThisPeriod")}</Text>
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
            <Text style={styles.heading}>{t("ui.displayCurrency")}</Text>
            {(shown?.options ?? []).map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option}
                style={styles.option}
                onPress={() => changeCurrency(option)}
              >
                <Text style={styles.currency}>{option}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              style={styles.option}
              onPress={() => setCurrencyOpen(false)}
            >
              <Text style={styles.currency}>{t("ui.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors: UiColors) => {
  const segment = segmentedControlTokens(colors);
  return StyleSheet.create({
    content: {
      backgroundColor: colors.background,
      flexGrow: 1,
      gap: 14,
      padding: 16,
      paddingBottom: 40,
    },
    segment: {
      backgroundColor: segment.trackSurface,
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
    selected: { backgroundColor: segment.selectedSurface },
    segmentText: { color: segment.label, fontWeight: "600" },
    segmentTextSelected: { color: segment.selectedLabel },
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
    filterLabel: { color: colors.textSecondary, fontSize: 11 },
    currency: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
      marginTop: 2,
    },
    periodGroup: { flexDirection: "row", gap: 4, marginLeft: "auto" },
    periodItem: {
      borderColor: colors.separator,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 10,
    },
    periodSelected: {
      backgroundColor: segment.selectedSurface,
      borderColor: colors.separator,
    },
    periodText: { color: segment.label, fontSize: 12 },
    periodTextSelected: { color: segment.selectedLabel, fontWeight: "700" },
    label: { color: colors.textSecondary, fontSize: 14 },
    total: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      gap: 3,
      padding: 20,
    },
    amount: {
      color: colors.textPrimary,
      fontSize: 30,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    heading: { color: colors.textPrimary, ...cv.type.section, marginTop: 8 },
    meta: { color: colors.textSecondary, fontSize: 13 },
    error: { color: colors.destructive },
    category: { gap: 6 },
    inline: { flexDirection: "row", justifyContent: "space-between" },
    categoryName: { flex: 1, fontWeight: "600" },
    categoryPercentage: { color: colors.textSecondary, fontSize: 12 },
    track: { backgroundColor: colors.separator, borderRadius: 4, height: 6 },
    fill: { backgroundColor: colors.textSecondary, borderRadius: 4, height: 6 },
    chart: { flexDirection: "row", height: 116, width: "100%" },
    month: { alignItems: "center", flex: 1, justifyContent: "flex-end", minWidth: 0 },
    barArea: {
      alignItems: "center",
      height: 94,
      justifyContent: "flex-end",
      width: "100%",
    },
    bar: {
      backgroundColor: colors.textSecondary,
      borderRadius: 2,
      maxWidth: 22,
      minWidth: 1,
      width: "68%",
    },
    monthLabel: {
      color: colors.textSecondary,
      fontSize: 9,
      height: 15,
      marginTop: 5,
      textAlign: "center",
      width: "100%",
    },
    chartRange: { color: colors.textSecondary, fontSize: 11, textAlign: "center" },
    journey: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      flexDirection: "row",
      gap: 12,
      minHeight: 72,
      padding: 14,
    },
    grow: { flex: 1 },
    journeyTitle: { color: colors.textPrimary, ...cv.type.row },
    balanceColumn: { alignItems: "flex-end", maxWidth: "46%" },
    balance: { color: colors.textPrimary, ...cv.type.rowAmount, textAlign: "right" },
    balanceMeaning: {
      borderRadius: 6,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 3,
      overflow: "hidden",
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    owed: { backgroundColor: colors.successSurface, color: colors.success },
    owe: { backgroundColor: colors.destructiveSurface, color: colors.destructive },
    settled: { backgroundColor: colors.separator, color: colors.textTertiary },
    backdrop: {
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: "center",
      padding: 28,
    },
    menu: { backgroundColor: colors.surface, borderRadius: 12, padding: 18 },
    option: { justifyContent: "center", minHeight: 48 },
  });
};
