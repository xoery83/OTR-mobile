import { segmentedControlTokens } from "@/ui/segmented";
import { formatExpenseCount } from "./searchFilters";
import { systemMessage } from "@/ui/domainLabels";
import { t } from "@/ui/locale";
import { AnalysisExcludedExpenses } from "./AnalysisExcludedExpenses";
import { AnalysisPickerFields } from "./AnalysisPickerFields";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
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
import { Stack, router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";

import { AppIcon } from "@/components/AppIcon";
import { MoneyText } from "./MoneyText";
import { NavigationContextTitle } from "@/components/navigationChrome";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import {
  aggregateAnalysisPeople,
  addAnalysisDays,
  analysisRangePresets,
  buildSpendingAnalysis,
  type AnalysisDataset,
  type AnalysisRange,
} from "@/domain/ledger/spendingAnalysis";
import type { ReportingScope } from "@/domain/ledger/reporting";
import { createLatestRequest } from "./latestRequest";
import {
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

import {
  hostedLedgerAnalysisPickerEnabled,
  openAnalysisPicker,
  readAnalysisPicker,
  releaseAnalysisPicker,
  type AnalysisPicker,
} from "./analysisPickerInvocation";

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
    projectionOwner: { generation: number; journeyId: string; memberId: string };
  } | null>(null);
  const [updating, setUpdating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const [biggestCategory, setBiggestCategory] = useState<string | null>(null);
  const [travellerCategory, setTravellerCategory] = useState<string | null>(null);
  const [payerCategory, setPayerCategory] = useState<string | null>(null);
  const [categoryMenu, setCategoryMenu] = useState<
    "BIGGEST" | "TRAVELLER" | "PAYER" | null
  >(null);
  const [scopeHeight, setScopeHeight] = useState(52);
  const rangeRef = useRef<AnalysisRange>({});
  const pendingRange = useRef<AnalysisRange | null>(null);
  const refreshFocused = useRef<(() => void) | null>(null);
  const pickerId = useRef<string>(undefined);
  const owningNavigation = useNavigation();
  const generation = getAccountGeneration();
  const projectionOwner = useMemo(
    () => ({ generation, journeyId: params.journeyId, memberId: params.memberId }),
    [generation, params.journeyId, params.memberId],
  );
  const reportOwner = useMemo(() => ({ projectionOwner, scope }), [projectionOwner, scope]);
  const pickerOwner = useRef<typeof reportOwner | null>(null);
  useLayoutEffect(() => {
    pickerOwner.current = reportOwner;
    pendingRange.current = null;
    return () => {
      pickerOwner.current = null;
      releaseAnalysisPicker(pickerId.current);
    };
  }, [reportOwner]);
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
      if (!params.journeyId || !params.memberId || generation !== getAccountGeneration()) return;
      const id = request.begin();
      const isCurrent = () => request.isCurrent(id) && generation === getAccountGeneration();
      setUpdating(true);
      setError(null);
      try {
        repository.current ??= getDefaultLedgerReportingRepository();
        const data = await (
          await repository.current
        ).loadSpendingAnalysisProjection(params.journeyId, params.memberId, range);
        if (!isCurrent()) return;
        rangeRef.current = range;
        setView({ dataset: data, range, projectionOwner });
      } catch {
        if (isCurrent()) {
          repository.current = null;
          setError(t("ui.spendingAnalysisCouldNotBeRefreshedYourPreviousViewIs"));
        }
      } finally {
        if (isCurrent()) {
          if (pendingRange.current === range) pendingRange.current = null;
          setUpdating(false);
        }
      }
    },
    [generation, params.journeyId, params.memberId, projectionOwner, request],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let scheduled = false;
      const refresh = () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (!active) return;
          const range = pendingRange.current ?? rangeRef.current;
          void load(range);
        });
      };
      if (hostedLedgerAnalysisPickerEnabled) {
        refreshFocused.current = refresh;
        refresh();
      } else void load(rangeRef.current);
      return () => {
        active = false;
        refreshFocused.current = null;
        request.cancel();
      };
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
  function openHostedPicker(picker: AnalysisPicker) {
    const owner = pickerOwner.current;
    if (
      owner !== reportOwner ||
      !owningNavigation.isFocused() ||
      generation !== getAccountGeneration() ||
      (picker.kind === "period" &&
        (pendingRange.current !== null ||
          rangeRef.current !== view?.range ||
          view.projectionOwner !== projectionOwner)) ||
      readAnalysisPicker(pickerId.current)
    )
      return;
    const invocation = openAnalysisPicker(
      picker,
      () => pickerOwner.current === owner,
      () => owningNavigation.isFocused(),
    );
    pickerId.current = invocation;
    router.push({ pathname: "/ledger-analysis-picker", params: { invocation } });
  }

  const rangePicker: AnalysisPicker = {
    kind: "range",
    presets,
    today,
    initial: {
      from:
        view?.range.from?.slice(0, 10) ??
        view?.dataset.journey.startDate?.slice(0, 10) ??
        today,
      through: view?.range.to
        ? addAnalysisDays(view.range.to.slice(0, 10), -1)
        : (view?.dataset.journey.endDate?.slice(0, 10) ?? today),
    },
    choose: (range) => {
      if (hostedLedgerAnalysisPickerEnabled) {
        pendingRange.current = range;
        refreshFocused.current?.();
      } else {
        setRangeOpen(false);
        void load(range);
      }
    },
  };
  function categoryPicker(menu: NonNullable<typeof categoryMenu>): Extract<AnalysisPicker, { kind: "category" }> {
    const { selected, setSelected } =
      menu === "BIGGEST"
        ? { selected: biggestCategory, setSelected: setBiggestCategory }
        : menu === "TRAVELLER"
          ? { selected: travellerCategory, setSelected: setTravellerCategory }
          : { selected: payerCategory, setSelected: setPayerCategory };
    return {
      kind: "category",
      options: categoryChoices,
      selected,
      choose: (category) => {
        setSelected(category);
        setCategoryMenu(null);
      },
    };
  }
  function chooseCategory(menu: NonNullable<typeof categoryMenu>) {
    if (hostedLedgerAnalysisPickerEnabled) openHostedPicker(categoryPicker(menu));
    else setCategoryMenu(menu);
  }

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
            if (hostedLedgerAnalysisPickerEnabled) openHostedPicker(rangePicker);
            else setRangeOpen(true);
          }}
        />
      </Stack.Toolbar>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
                      onPress={() => {
                        if (hostedLedgerAnalysisPickerEnabled) openHostedPicker({
                          kind: "excluded",
                          scope,
                          expenses: dashboard.incomplete,
                          open: id => router.push(`/expenses/expense/${id}`),
                        });
                        else setCompletenessOpen(true);
                      }}
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
                            onPress={() => chooseCategory("TRAVELLER")}
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
                            onPress={() => chooseCategory("PAYER")}
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
                    periodDisabled={hostedLedgerAnalysisPickerEnabled && updating}
                    onOpenPeriod={hostedLedgerAnalysisPickerEnabled
                      ? (period, title) =>
                          openHostedPicker({
                            kind: "period",
                            period,
                            title,
                            money,
                            open: () => drilldown({ from: period.from, to: period.to }, title),
                          })
                      : undefined}
                  />
                  {scope === "MINE" ? (
                    <AnalysisSection
                      title={t("ui.biggestExpenses")}
                      action={
                        <AnalysisCategoryMenu
                          title={t("ui.biggestExpenses2")}
                          value={biggestCategory}
                          onPress={() => chooseCategory("BIGGEST")}
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
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              <AnalysisExcludedExpenses
                expenses={dashboard.incomplete}
                scope={scope}
                onOpen={id => {
                  setCompletenessOpen(false);
                  router.push(`/expenses/expense/${id}`);
                }}
              />
            </ScrollView>
          </View>
        </Modal>
      ) : null}
      {rangeOpen ? (
        <Modal
          visible
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
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              <AnalysisPickerFields picker={rangePicker} />
            </ScrollView>
          </View>
        </Modal>
      ) : null}
      {categoryMenu ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCategoryMenu(null)}
        >
          <View style={styles.modalPage}>
            <SheetHeader
              title={t("ui.chooseCategory")}
              onLeft={() => setCategoryMenu(null)}
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              <AnalysisPickerFields picker={categoryPicker(categoryMenu)} />
            </ScrollView>
          </View>
        </Modal>
      ) : null}
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
    retry: { minHeight: 44, justifyContent: "center" },
    surface: { backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" },
    modalPage: { flex: 1, backgroundColor: colors.background },
    modalContent: { padding: 16, gap: 10 },
  });
};
