import { segmentedControlTokens } from "@/ui/segmented";
import { formatExpenseCount } from "./searchFilters";
import { categoryLabel, systemMessage } from "@/ui/domainLabels";
import { t } from "@/ui/locale";
import { UiTextInput as TextInput } from "@/ui/forms";
import { useUiTheme, useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";

import { AppIcon } from "@/components/AppIcon";
import { MoneyText } from "./MoneyText";
import { NavigationContextTitle } from "@/components/navigationChrome";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import {
  aggregateAnalysisPeople,
  addAnalysisDays,
  analysisDateBounds,
  analysisPresetBounds,
  analysisRangePresets,
  buildSpendingAnalysis,
  type AnalysisDataset,
  type AnalysisExpense,
  type AnalysisRange,
  type AnalysisRangePreset,
} from "@/domain/ledger/spendingAnalysis";
import type { ReportingScope } from "@/domain/ledger/reporting";
import { createLatestRequest } from "./latestRequest";
import {
  formatLedgerDate,
  formatLedgerDateFilter,
  formatLedgerMoney,
  localDateKey,
} from "./format";
import { SheetHeader } from "@/components/SheetHeader";
import {
  AnalysisCategories,
  AnalysisCategoryMenu,
  AnalysisExpenseRows,
  AnalysisInsights,
  AnalysisPeople,
  AnalysisSection,
  AnalysisSkeleton,
  AnalysisTimeline,
  useAnalysisStyles,
  type AnalysisDrilldown,
} from "./SpendingAnalysisSections";

const rangeLabels = (): Record<AnalysisRangePreset, string> => ({
  ENTIRE: t("extra.copy21"),
  LAST_30: t("extra.copy22"),
  MONTH: t("extra.copy23"),
  YEAR: t("extra.copy24"),
  CUSTOM: t("extra.copy25"),
});

function exclusionReason(expense: AnalysisExpense, scope: ReportingScope) {
  if (expense.hasOpenConflict) return t("ui.changesNeedReview");
  if (expense.businessStatus === "DRAFT") return t("ui.draftExpense");
  if (expense.businessStatus === "RATE_REQUIRED" || expense.totalMinor === null)
    return t("ui.waitingForConfirmedJourneyCurrencyValue");
  if (scope === "MINE" && expense.personalMinor === null)
    return t("ui.yourShareIsNotAvailableYet");
  return t("ui.notIncludedInSpendingTotal");
}

export function LedgerAnalysisScreen() {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);

  const shared = useAnalysisStyles();
  const params = useLocalSearchParams<{
    journeyId: string;
    memberId: string;
    scope?: ReportingScope;
  }>();
  const headerHeight = useHeaderHeight();
  const [scope, setScope] = useState<ReportingScope>(
    params.scope === "GROUP" ? "GROUP" : "MINE",
  );
  const [view, setView] = useState<{
    dataset: AnalysisDataset;
    range: AnalysisRange;
  } | null>(null);
  const [updating, setUpdating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeDraft, setRangeDraft] = useState({ from: "", through: "" });
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const [biggestCategory, setBiggestCategory] = useState<string | null>(null);
  const [travellerCategory, setTravellerCategory] = useState<string | null>(null);
  const [payerCategory, setPayerCategory] = useState<string | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<
    "BIGGEST" | "TRAVELLER" | "PAYER" | null
  >(null);
  const [scopeHeight, setScopeHeight] = useState(52);
  const rangeRef = useRef<AnalysisRange>({});
  const repository = useRef<ReturnType<
    typeof getDefaultLedgerReportingRepository
  > | null>(null);
  const [request] = useState(createLatestRequest);
  const mainScroll = useRef<ScrollView>(null);
  const scopeOffsets = useRef<Record<ReportingScope, number>>({ MINE: 0, GROUP: 0 });
  useLayoutEffect(() => {
    mainScroll.current?.scrollTo({ y: scopeOffsets.current[scope], animated: false });
  }, [scope]);
  const today = localDateKey(new Date());

  const load = useCallback(
    async (range: AnalysisRange) => {
      if (!params.journeyId || !params.memberId) return;
      const id = request.begin();
      setUpdating(true);
      setError(null);
      try {
        repository.current ??= getDefaultLedgerReportingRepository();
        const data = await (
          await repository.current
        ).loadSpendingAnalysisProjection(params.journeyId, params.memberId, range);
        if (!request.isCurrent(id)) return;
        rangeRef.current = range;
        setView({ dataset: data, range });
      } catch {
        repository.current = null;
        if (request.isCurrent(id))
          setError(t("ui.spendingAnalysisCouldNotBeRefreshedYourPreviousViewIs"));
      } finally {
        if (request.isCurrent(id)) setUpdating(false);
      }
    },
    [params.journeyId, params.memberId, request],
  );

  useFocusEffect(
    useCallback(() => {
      void load(rangeRef.current);
      return () => request.cancel();
    }, [load, request]),
  );

  const dashboard = useMemo(
    () =>
      view
        ? buildSpendingAnalysis(view.dataset, params.memberId, scope, view.range, today)
        : null,
    [view, params.memberId, scope, today],
  );
  const travellers = useMemo(
    () =>
      view && travellerCategory
        ? aggregateAnalysisPeople(
            view.dataset.expenses,
            view.dataset.members,
            travellerCategory,
          ).travellers
        : (dashboard?.travellers ?? []),
    [view, dashboard, travellerCategory],
  );
  const payers = useMemo(
    () =>
      view && payerCategory
        ? aggregateAnalysisPeople(
            view.dataset.expenses,
            view.dataset.members,
            payerCategory,
          ).payers
        : (dashboard?.payers ?? []),
    [view, dashboard, payerCategory],
  );
  const categoryChoices = useMemo(
    () =>
      view
        ? [
            ...new Set(
              view.dataset.expenses
                .filter(
                  (expense) =>
                    expense.businessStatus === "ACCEPTED" &&
                    expense.totalMinor !== null &&
                    !expense.hasOpenConflict,
                )
                .map((expense) => expense.category),
            ),
          ].sort()
        : [],
    [view],
  );
  const presets = analysisRangePresets(dashboard?.duration ?? 0);
  const money = {
    currency: view?.dataset.journey.settlementCurrency ?? "NZD",
    scale: view?.dataset.journey.settlementScale ?? 2,
    format: (minor: number) =>
      formatLedgerMoney(
        minor,
        view?.dataset.journey.settlementCurrency ?? "NZD",
        view?.dataset.journey.settlementScale ?? 2,
      ),
  };
  const drilldown: AnalysisDrilldown = (filters, origin) => {
    const { categories, ...rest } = filters;
    router.push({
      pathname: "/expenses/search",
      params: {
        journeyId: params.journeyId,
        memberId: params.memberId,
        scope,
        analysisState: "INCLUDED",
        ...view?.range,
        ...rest,
        ...(categories ? { categories: JSON.stringify(categories) } : {}),
        origin,
      },
    });
  };
  const changeRange = (preset: AnalysisRangePreset) => {
    if (preset === "CUSTOM") {
      setRangeDraft({
        from:
          view?.range.from?.slice(0, 10) ??
          view?.dataset.journey.startDate?.slice(0, 10) ??
          today,
        through: view?.range.to
          ? addAnalysisDays(view.range.to.slice(0, 10), -1)
          : (view?.dataset.journey.endDate?.slice(0, 10) ?? today),
      });
      setRangeError(null);
      return;
    }
    setRangeOpen(false);
    void load(analysisPresetBounds(preset, today));
  };
  const scopeControl = (
    <View
      accessibilityRole="tablist"
      style={styles.segment}
      onLayout={(event) => setScopeHeight(event.nativeEvent.layout.height)}
    >
      {(["MINE", "GROUP"] as const).map((item) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: scope === item }}
          key={item}
          onPress={() => setScope(item)}
          style={[styles.segmentItem, scope === item && styles.segmentSelected]}
        >
          <AppIcon
            name={item === "MINE" ? "person.fill" : "person.2.fill"}
            size={19}
            color={
              scope === item
                ? segmentedControlTokens(colors).selectedLabel
                : segmentedControlTokens(colors).label
            }
          />
          <Text
            style={[styles.segmentText, scope === item && styles.segmentTextSelected]}
          >
            {item === "MINE" ? t("ui.mine") : t("ui.group")}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <NavigationContextTitle
              title={t("ui.spendingAnalysis")}
              subtitle={view?.dataset.journey.title}
            />
          ),
          headerTransparent: true,
          headerBlurEffect: Platform.OS === "ios" ? "systemMaterial" : undefined,
          headerStyle: {
            backgroundColor:
              Platform.OS === "ios" ? colors.transparent : colors.background,
          },
          headerShadowVisible: false,
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t("ui.chooseDateRange")}
          hidden={!presets.length}
          icon="calendar"
          selected={Boolean(view?.range.from)}
          onPress={() => {
            setRangeDraft({ from: "", through: "" });
            setRangeOpen(true);
          }}
        />
      </Stack.Toolbar>
      <ScrollView
        ref={mainScroll}
        onScroll={(event) => {
          scopeOffsets.current[scope] = Math.max(0, event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          mainScroll.current?.scrollTo({
            y: scopeOffsets.current[scope],
            animated: false,
          });
        }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: headerHeight + scopeHeight,
          paddingBottom: 20,
        }}
      >
        <View style={shared.body}>
          {!view ? (
            <>
              {updating ? <AnalysisSkeleton /> : null}
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load(rangeRef.current)}
                  style={styles.retry}
                >
                  <Text style={shared.error}>
                    {t("ui.analysisIsUnavailableTapToTryAgain")}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : dashboard ? (
            <>
              <View style={shared.summary}>
                <Text style={shared.eyebrow}>
                  {scope === "MINE" ? t("ui.mySpending") : t("ui.groupSpending")}
                </Text>
                {dashboard.state === "UNAVAILABLE" ? (
                  <Text style={shared.emptyTitle}>
                    {t("ui.spendingTotalUnavailable")}
                  </Text>
                ) : (
                  <MoneyText
                    variant="hero"
                    minor={dashboard.totalMinor}
                    currency={money.currency}
                    scale={money.scale}
                  />
                )}
                <View style={styles.countLine}>
                  <Text style={shared.meta}>
                    {scope === "MINE"
                      ? dashboard.incomplete.length
                        ? t("analysis.includedCount", { count: dashboard.expenseCount })
                        : formatExpenseCount(dashboard.expenseCount)
                      : t("analysis.groupCount", {
                          members: view.dataset.members.length,
                          count: dashboard.incomplete.length
                            ? t("analysis.includedCount", {
                                count: dashboard.expenseCount,
                              })
                            : formatExpenseCount(dashboard.expenseCount),
                        })}
                  </Text>
                  {dashboard.incomplete.length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("analysis.excludedDescription", {
                        count: dashboard.incomplete.length,
                      })}
                      hitSlop={12}
                      onPress={() => setCompletenessOpen(true)}
                    >
                      <Text style={shared.meta}>ⓘ</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={shared.meta}>
                  {t("analysis.elapsed", {
                    count: dashboard.elapsedDays,
                    average:
                      dashboard.averageMinor !== null && dashboard.state === "READY"
                        ? t("analysis.averageCaption", {
                            amount: money.format(dashboard.averageMinor),
                          })
                        : "",
                  })}
                </Text>
                {view.range.from ? (
                  <Text style={shared.meta}>
                    {formatLedgerDateFilter(view.range.from, view.range.to)}
                  </Text>
                ) : null}
              </View>
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load(rangeRef.current)}
                  style={styles.retry}
                >
                  <Text accessibilityLiveRegion="polite" style={shared.error}>
                    {systemMessage(error)} {t("ui.tapToTryAgain")}
                  </Text>
                </Pressable>
              ) : null}
              {dashboard.state === "READY" ? (
                <>
                  {scope === "GROUP" ? (
                    <>
                      <AnalysisPeople
                        title={t("ui.spendingByTraveller")}
                        traveller
                        rows={travellers}
                        totalMinor={travellers.reduce(
                          (sum, person) => sum + person.totalMinor,
                          0,
                        )}
                        money={money}
                        drilldown={drilldown}
                        category={travellerCategory}
                        action={
                          <AnalysisCategoryMenu
                            title={t("ui.travellers")}
                            value={travellerCategory}
                            onPress={() => setCategoryMenu("TRAVELLER")}
                          />
                        }
                      />
                      <AnalysisPeople
                        title={t("ui.whoPaid")}
                        rows={payers}
                        totalMinor={payers.reduce(
                          (sum, person) => sum + person.totalMinor,
                          0,
                        )}
                        money={money}
                        drilldown={drilldown}
                        category={payerCategory}
                        action={
                          <AnalysisCategoryMenu
                            title={t("ui.whoPaid")}
                            value={payerCategory}
                            onPress={() => setCategoryMenu("PAYER")}
                          />
                        }
                      />
                    </>
                  ) : null}
                  <AnalysisCategories
                    categories={dashboard.displayedCategories}
                    totalCategories={dashboard.categories.length}
                    scope={scope}
                    money={money}
                    drilldown={drilldown}
                  />
                  <AnalysisTimeline
                    key={`${scope}:${view.range.from ?? ""}:${view.range.to ?? ""}`}
                    dashboard={dashboard}
                    currencyScale={view.dataset.journey.settlementScale}
                    money={money}
                    drilldown={drilldown}
                  />
                  {scope === "MINE" ? (
                    <AnalysisSection
                      title={t("ui.biggestExpenses")}
                      action={
                        <AnalysisCategoryMenu
                          title={t("ui.biggestExpenses2")}
                          value={biggestCategory}
                          onPress={() => setCategoryMenu("BIGGEST")}
                        />
                      }
                    >
                      <View style={styles.surface}>
                        <AnalysisExpenseRows
                          expenses={dashboard.expenses
                            .filter(
                              (expense) =>
                                !biggestCategory || expense.category === biggestCategory,
                            )
                            .slice(0, 5)}
                          scope={scope}
                          money={money}
                        />
                        {biggestCategory &&
                        !dashboard.expenses.some(
                          (expense) => expense.category === biggestCategory,
                        ) ? (
                          <Text style={styles.tripContext}>
                            {t("ui.noSpendingInThisCategory")}
                          </Text>
                        ) : null}
                      </View>
                    </AnalysisSection>
                  ) : null}
                  <AnalysisInsights dashboard={dashboard} money={money} />
                </>
              ) : (
                <View style={shared.empty}>
                  <Text style={shared.emptyTitle}>
                    {dashboard.state === "EMPTY"
                      ? t("ui.noSpendingYet")
                      : dashboard.state === "EMPTY_RANGE"
                        ? t("ui.noSpendingInThisPeriod2")
                        : t("ui.spendingAnalysisIsntReadyYet")}
                  </Text>
                  <Text style={shared.meta}>
                    {dashboard.state === "EMPTY"
                      ? t("ui.expensesFromThisTripWillAppearHere")
                      : dashboard.state === "UNAVAILABLE"
                        ? t("ui.someExpensesAreStillWaitingForConfirmedValuesOrReview")
                        : t("ui.tryAnotherPeriodToSeeSpendingFromThisTrip")}
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.pinnedScope, { top: headerHeight }]}>{scopeControl}</View>
      {completenessOpen && dashboard ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCompletenessOpen(false)}
        >
          <View style={styles.modalPage}>
            <SheetHeader
              title={t("ui.notIncludedInTotal")}
              leftLabel={t("ui.close")}
              onLeft={() => setCompletenessOpen(false)}
            />
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={shared.meta}>
                {formatExpenseCount(dashboard.incomplete.length)} ·{" "}
                {scope === "MINE" ? t("ledger.mine") : t("ledger.group")}
              </Text>
              {dashboard.incomplete.map((expense) => (
                <Pressable
                  key={expense.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setCompletenessOpen(false);
                    router.push(`/expenses/expense/${expense.id}`);
                  }}
                  style={styles.excludedExpense}
                >
                  <Text numberOfLines={2} style={styles.excludedTitle}>
                    {expense.title}
                  </Text>
                  <Text style={shared.meta}>
                    {t("analysis.originalTotal", {
                      date: formatLedgerDate(expense.occurredAt),
                      amount: formatLedgerMoney(
                        expense.originalMinor,
                        expense.originalCurrency,
                        expense.originalScale,
                      ),
                    })}
                  </Text>
                  <Text style={shared.meta}>{exclusionReason(expense, scope)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
      <Modal
        visible={rangeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRangeOpen(false)}
      >
        <View style={styles.modalPage}>
          <SheetHeader
            title={t("ui.analysisDates")}
            leftLabel={t("ui.cancel")}
            onLeft={() => setRangeOpen(false)}
          />
          <ScrollView contentContainerStyle={styles.modalContent}>
            {presets.map((preset) => (
              <Pressable
                accessibilityRole="button"
                key={preset}
                onPress={() => changeRange(preset)}
                style={styles.rangeOption}
              >
                <Text style={shared.link}>{rangeLabels()[preset]}</Text>
              </Pressable>
            ))}
            {rangeDraft.from ? (
              <>
                <Text style={shared.meta}>{t("ui.startDate")}</Text>
                <TextInput
                  accessibilityLabel={t("ui.analysisStartDate")}
                  placeholder={t("ui.yyyymmdd")}
                  value={rangeDraft.from}
                  onChangeText={(from) => setRangeDraft((draft) => ({ ...draft, from }))}
                  style={styles.dateInput}
                />
                <Text style={shared.meta}>{t("ui.endDate")}</Text>
                <TextInput
                  accessibilityLabel={t("ui.analysisEndDate")}
                  placeholder={t("ui.yyyymmdd")}
                  value={rangeDraft.through}
                  onChangeText={(through) =>
                    setRangeDraft((draft) => ({ ...draft, through }))
                  }
                  style={styles.dateInput}
                />
                {rangeError ? (
                  <Text accessibilityLiveRegion="polite" style={shared.error}>
                    {rangeError}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const range = analysisDateBounds(rangeDraft.from, rangeDraft.through);
                    if (!range) {
                      setRangeError(t("ui.enterValidDatesAsYyyymmddWithTheEndOnOr"));
                      return;
                    }
                    setRangeOpen(false);
                    void load(range);
                  }}
                  style={styles.rangeOption}
                >
                  <Text style={shared.link}>{t("ui.applyCustomRange")}</Text>
                </Pressable>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={categoryMenu !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCategoryMenu(null)}
      >
        <View style={styles.modalPage}>
          <SheetHeader
            title={t("ui.chooseCategory")}
            onLeft={() => setCategoryMenu(null)}
          />
          <ScrollView contentContainerStyle={styles.modalContent}>
            {[null, ...categoryChoices].map((category) => (
              <Pressable
                accessibilityRole="button"
                key={category ?? "__all__"}
                onPress={() => {
                  if (categoryMenu === "BIGGEST") setBiggestCategory(category);
                  if (categoryMenu === "TRAVELLER") setTravellerCategory(category);
                  if (categoryMenu === "PAYER") setPayerCategory(category);
                  setCategoryMenu(null);
                }}
                style={styles.rangeOption}
              >
                <Text style={shared.link}>
                  {category ? categoryLabel(category) : t("ui.allCategories")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: UiColors) => {
  const segment = segmentedControlTokens(colors);
  return StyleSheet.create({
    page: { backgroundColor: colors.background, flex: 1 },
    tripContext: {
      color: colors.textSecondary,
      fontSize: 13,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    pinnedScope: {
      position: "absolute",
      left: 0,
      right: 0,
      backgroundColor: segment.trackSurface,
      zIndex: 2,
    },
    segment: {
      flexDirection: "row",
    },
    segmentItem: {
      alignItems: "center",
      borderBottomWidth: 3,
      borderBottomColor: colors.transparent,
      flexDirection: "row",
      gap: 7,
      flex: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingVertical: 7,
    },
    segmentSelected: {
      backgroundColor: segment.selectedSurface,
      borderBottomColor: segment.indicator,
    },
    segmentText: { color: segment.label, fontSize: 16, fontWeight: "600" },
    segmentTextSelected: { color: segment.selectedLabel },
    countLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
    excludedExpense: {
      padding: 12,
      gap: 5,
      backgroundColor: colors.surface,
      borderRadius: 10,
    },
    excludedTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    retry: { minHeight: 44, justifyContent: "center" },
    surface: { backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" },
    modalPage: { flex: 1, backgroundColor: colors.background },
    modalContent: { padding: 16, gap: 10 },
    rangeOption: {
      minHeight: 48,
      justifyContent: "center",
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 10,
    },
    dateInput: {
      minHeight: 48,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.separator,
      borderRadius: 10,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      fontSize: 16,
    },
  });
};
