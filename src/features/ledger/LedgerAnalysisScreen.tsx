import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

import { AppIcon } from "@/components/AppIcon";
import { HeaderIconAction, NavigationContextTitle } from "@/components/navigationChrome";
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
import { LedgerSheetHeader } from "./LedgerSheetHeader";
import {
  AnalysisCategories,
  AnalysisCategoryMenu,
  AnalysisExpenseRows,
  AnalysisInsights,
  AnalysisPeople,
  AnalysisSection,
  AnalysisSkeleton,
  AnalysisTimeline,
  analysisStyles as shared,
  type AnalysisDrilldown,
} from "./SpendingAnalysisSections";

const rangeLabels: Record<AnalysisRangePreset, string> = {
  ENTIRE: "Entire trip",
  LAST_30: "Last 30 days",
  MONTH: "This month",
  YEAR: "This year",
  CUSTOM: "Custom range",
};

function exclusionReason(expense: AnalysisExpense, scope: ReportingScope) {
  if (expense.hasOpenConflict) return "Changes need review";
  if (expense.businessStatus === "DRAFT") return "Draft expense";
  if (expense.businessStatus === "RATE_REQUIRED" || expense.totalMinor === null)
    return "Waiting for confirmed Journey currency value";
  if (scope === "MINE" && expense.personalMinor === null)
    return "Your share is not available yet";
  return "Not included in spending total";
}

export function LedgerAnalysisScreen() {
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
          setError(
            "Spending analysis could not be refreshed. Your previous view is still available.",
          );
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
  const money = (minor: number) =>
    formatLedgerMoney(
      minor,
      view?.dataset.journey.settlementCurrency ?? "NZD",
      view?.dataset.journey.settlementScale ?? 2,
    );
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
            color={scope === item ? "#0F766E" : "#64748B"}
          />
          <Text
            style={[styles.segmentText, scope === item && styles.segmentTextSelected]}
          >
            {item === "MINE" ? "Mine" : "Group"}
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
              title="Spending Analysis"
              subtitle={view?.dataset.journey.title}
            />
          ),
          headerTransparent: true,
          headerBlurEffect: Platform.OS === "ios" ? "systemMaterial" : undefined,
          headerStyle: {
            backgroundColor:
              Platform.OS === "ios" ? "transparent" : "rgba(246,247,249,0.97)",
          },
          headerShadowVisible: true,
          headerRight: () =>
            presets.length ? (
              <HeaderIconAction
                label="Choose date range"
                name="calendar"
                active={Boolean(view?.range.from)}
                onPress={() => {
                  setRangeDraft({ from: "", through: "" });
                  setRangeOpen(true);
                }}
              />
            ) : null,
        }}
      />
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
                    Analysis is unavailable. Tap to try again.
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : dashboard ? (
            <>
              <View style={shared.summary}>
                <Text style={shared.eyebrow}>
                  {scope === "MINE" ? "MY SPENDING" : "GROUP SPENDING"}
                </Text>
                <Text
                  style={
                    dashboard.state === "UNAVAILABLE" ? shared.emptyTitle : shared.total
                  }
                >
                  {dashboard.state === "UNAVAILABLE"
                    ? "Spending total unavailable"
                    : money(dashboard.totalMinor)}
                </Text>
                <View style={styles.countLine}>
                  <Text style={shared.meta}>
                    {scope === "MINE"
                      ? `${dashboard.expenseCount} ${dashboard.incomplete.length ? "included " : ""}${dashboard.expenseCount === 1 ? "expense" : "expenses"}`
                      : `${view.dataset.members.length} travellers · ${dashboard.expenseCount} ${dashboard.incomplete.length ? "included " : ""}expenses`}
                  </Text>
                  {dashboard.incomplete.length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View ${dashboard.incomplete.length} expenses not included in the total`}
                      hitSlop={12}
                      onPress={() => setCompletenessOpen(true)}
                    >
                      <Text style={shared.meta}>ⓘ</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={shared.meta}>
                  {dashboard.elapsedDays} {dashboard.elapsedDays === 1 ? "day" : "days"}
                  {dashboard.averageMinor !== null && dashboard.state === "READY"
                    ? ` · ${money(dashboard.averageMinor)}/day`
                    : ""}
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
                    {error} Tap to try again.
                  </Text>
                </Pressable>
              ) : null}
              {dashboard.state === "READY" ? (
                <>
                  {scope === "GROUP" ? (
                    <>
                      <AnalysisPeople
                        title="Spending by traveller"
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
                            title="travellers"
                            value={travellerCategory}
                            onPress={() => setCategoryMenu("TRAVELLER")}
                          />
                        }
                      />
                      <AnalysisPeople
                        title="Who paid"
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
                            title="Who paid"
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
                      title="Biggest expenses"
                      action={
                        <AnalysisCategoryMenu
                          title="biggest expenses"
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
                            No spending in this category.
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
                      ? "No spending yet"
                      : dashboard.state === "EMPTY_RANGE"
                        ? "No spending in this period"
                        : "Spending analysis isn’t ready yet"}
                  </Text>
                  <Text style={shared.meta}>
                    {dashboard.state === "EMPTY"
                      ? "Expenses from this trip will appear here."
                      : dashboard.state === "UNAVAILABLE"
                        ? "Some expenses are still waiting for confirmed values or review."
                        : "Try another period to see spending from this trip."}
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
      <AnalysisMaterial style={[styles.pinnedScope, { top: headerHeight }]}>
        {scopeControl}
      </AnalysisMaterial>
      {completenessOpen && dashboard ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCompletenessOpen(false)}
        >
          <View style={styles.modalPage}>
            <LedgerSheetHeader
              title="Not included in total"
              leftLabel="Close"
              onLeft={() => setCompletenessOpen(false)}
            />
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={shared.meta}>
                {dashboard.incomplete.length} expenses ·{" "}
                {scope === "MINE" ? "Mine" : "Group"}
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
                    {formatLedgerDate(expense.occurredAt)} · Original total{" "}
                    {formatLedgerMoney(
                      expense.originalMinor,
                      expense.originalCurrency,
                      expense.originalScale,
                    )}
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
          <LedgerSheetHeader
            title="Analysis dates"
            leftLabel="Cancel"
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
                <Text style={shared.link}>{rangeLabels[preset]}</Text>
              </Pressable>
            ))}
            {rangeDraft.from ? (
              <>
                <Text style={shared.meta}>Start date</Text>
                <TextInput
                  accessibilityLabel="Analysis start date"
                  placeholder="YYYY-MM-DD"
                  value={rangeDraft.from}
                  onChangeText={(from) => setRangeDraft((draft) => ({ ...draft, from }))}
                  style={styles.dateInput}
                />
                <Text style={shared.meta}>End date</Text>
                <TextInput
                  accessibilityLabel="Analysis end date"
                  placeholder="YYYY-MM-DD"
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
                      setRangeError(
                        "Enter valid dates as YYYY-MM-DD, with the end on or after the start.",
                      );
                      return;
                    }
                    setRangeOpen(false);
                    void load(range);
                  }}
                  style={styles.rangeOption}
                >
                  <Text style={shared.link}>Apply custom range</Text>
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
          <LedgerSheetHeader
            title="Choose category"
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
                <Text style={shared.link}>{category ?? "All categories"}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function AnalysisMaterial({
  children,
  style,
}: {
  children: React.ReactNode;
  style: import("react-native").StyleProp<import("react-native").ViewStyle>;
}) {
  return Platform.OS === "ios" && isLiquidGlassAvailable() ? (
    <GlassView
      colorScheme="light"
      glassEffectStyle="regular"
      tintColor="#F6F7F9"
      style={style}
    >
      {children}
    </GlassView>
  ) : (
    <View style={[style, styles.materialFallback]}>{children}</View>
  );
}
const styles = StyleSheet.create({
  page: { backgroundColor: "#F6F7F9", flex: 1 },
  tripContext: {
    color: "#64748B",
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pinnedScope: {
    position: "absolute",
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DDE3E7",
    zIndex: 2,
  },
  materialFallback: { backgroundColor: "rgba(246,247,249,0.98)", elevation: 3 },
  segment: {
    flexDirection: "row",
  },
  segmentItem: {
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    flexDirection: "row",
    gap: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingVertical: 7,
  },
  segmentSelected: { borderBottomColor: "#0F766E" },
  segmentText: { color: "#64748B", fontSize: 16, fontWeight: "600" },
  segmentTextSelected: { color: "#0F766E" },
  countLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  excludedExpense: { padding: 12, gap: 5, backgroundColor: "#FFFFFF", borderRadius: 10 },
  excludedTitle: { color: "#111827", fontSize: 15, fontWeight: "600" },
  retry: { minHeight: 44, justifyContent: "center" },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 14, overflow: "hidden" },
  modalPage: { flex: 1, backgroundColor: "#F6F7F9" },
  modalContent: { padding: 16, gap: 10 },
  rangeOption: {
    minHeight: 48,
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
  },
  dateInput: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    color: "#111827",
    fontSize: 16,
  },
});
