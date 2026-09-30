import { MoneyText } from "./MoneyText";
import { ExpenseConflictList } from "./ExpenseConflictList";
import { readLastApiFailure } from "@/data/api/client";
import { useNetworkState } from "expo-network";
import { getDefaultLedgerFxSnapshotRepository } from "@/data/repositories/defaultLedgerFxSnapshotRepository";
import { refreshLedgerFxSnapshotCache } from "@/data/sync/ledgerFxSnapshotCoordinator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import PagerView from "react-native-pager-view";

import { AppIcon } from "@/components/AppIcon";
import { contentVisual as cv } from "./contentVisual";
import { GlobalMenu } from "@/components/GlobalMenu";
import { HeaderIconAction, NavigationContextTitle } from "@/components/navigationChrome";
import { refreshJourneyLedger } from "@/data/operations/kickLedgerSync";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerReviewRepository } from "@/data/repositories/defaultLedgerReviewRepository";
import { subscribeLedgerReview } from "@/data/repositories/ledgerReviewRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import type {
  LedgerJourneyOption,
  LedgerReportListItem,
} from "@/data/repositories/ledgerReportingRepository";
import {
  chooseJourneyEntry,
  type LedgerJourneyContext,
} from "@/domain/ledger/journeyContext";
import type {
  ReportingAggregate,
  ReportingBucket,
  ReportingScope,
} from "@/domain/ledger/reporting";
import { stage3JourneyId } from "@/hooks/useLedgerStage3";
import { useLedgerActiveSync } from "@/hooks/useLedgerActiveSync";
import { settlementLoadMetrics } from "@/hooks/settlementLoadMetrics";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

import {
  formatLedgerDate,
  formatLedgerDateRange,
  formatLedgerMoney,
  ledgerExpenseAttention,
} from "./format";
import {
  displayTotalProjection,
  estimatedComponent,
  type DisplayEstimate,
} from "./displayEstimate";
import { loadDisplayEstimates } from "./loadDisplayEstimates";
import { loadEstimatedSettlement } from "./loadEstimatedSettlement";
import { savedSettlementCardProjection } from "./settlementSummaryProjection";
import {
  SettlementReadinessScreen,
  SettlementSectionTabs,
  type SettlementSectionName,
} from "./SettlementReadinessScreen";
import {
  expenseAmountPresentation,
  journeyPickerSections,
  settlementPositionLabel,
  shortMemberName,
  spendingMembers,
  spendingPercentage,
} from "./dashboardPresentation";
import { createLatestRequest } from "./latestRequest";
import { retrySQLiteRollbackOnce } from "./retryLedgerRead";
import { LedgerSheetHeader } from "./LedgerSheetHeader";
import { advanceScrollAnchor, restoredScrollY } from "./settlementScrollAnchor";

type Mode = "SPENDING" | "SETTLEMENT";
const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);
type SettlementSnapshot = ReturnType<typeof savedSettlementCardProjection>;
type SpendingProjection = {
  journey: LedgerJourneyContext;
  memberId: string;
  scope: ReportingScope;
  summary: ReportingAggregate;
  categories: ReportingBucket[];
  members: { id: string; label: string }[];
  memberSpending: ReportingBucket[];
  reviewCount: number;
  selectedMember: {
    id: string;
    summary: ReportingAggregate;
    categories: ReportingBucket[];
  } | null;
  expenses: LedgerReportListItem[];
  estimatedMinor: number;
  estimatedCount: number;
  estimates: Map<string, DisplayEstimate>;
  estimateComponents: Map<string, number>;
  settlement: SettlementSnapshot;
};

const syncStatusCopy = {
  SYNCING: "Syncing",
  UP_TO_DATE: "Up to date",
  OFFLINE: "Offline · saved data is available",
  SYNC_FAILED: "Sync temporarily unavailable · saved data is available",
  CHANGES_WAITING: "Changes waiting · saved on this device",
} as const;

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const categoryIcons: Record<string, Parameters<typeof AppIcon>[0]["name"]> = {
  car: "car.fill",
  flight: "airplane",
  food: "fork.knife",
  fuel: "fuelpump.fill",
  hotel: "bed.double.fill",
  insurance: "shield.fill",
  shopping: "bag.fill",
  ticket: "ticket.fill",
  tickets: "ticket.fill",
  transport: "car.fill",
};

function categoryIcon(category: string) {
  return categoryIcons[category.toLowerCase()] ?? "tag.fill";
}

export function LedgerStage6Screen({
  scopedJourneyId,
}: { scopedJourneyId?: string } = {}) {
  const largeText = useWindowDimensions().fontScale > 1.5;
  const spendingScroll = useRef<ScrollView>(null);
  const spendingAnchor = useRef({ y: 0, body: 0 });
  const sharedCollapse = useRef(0);
  const [spendingHeaderHeight, setSpendingHeaderHeight] = useState(0);
  const [modeTransitionSeq, setModeTransitionSeq] = useState(0);
  const journeySearch = useRef<TextInput>(null);
  const manualJourneyId = useRef<string | undefined>(undefined);
  useEffect(() => {
    manualJourneyId.current = undefined;
  }, [scopedJourneyId]);
  const [request] = useState(createLatestRequest);
  const [memberRequest] = useState(createLatestRequest);
  const [accountGeneration, setAccountGeneration] = useState(getAccountGeneration);
  const accountGenerationRef = useRef(accountGeneration);
  const scopeRef = useRef<ReportingScope>("MINE");
  const selectedMemberIdRef = useRef<string | null>(null);
  const selectedJourneyIdRef = useRef<string | null>(null);
  const [journeys, setJourneys] = useState<LedgerJourneyOption[]>([]);
  const [projection, setProjection] = useState<SpendingProjection | null>(null);
  const [mode, setMode] = useState<Mode>("SPENDING");
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const modePager = useRef<PagerView>(null);
  const [modePageProgress] = useState(() => ({
    position: new Animated.Value(0),
    offset: new Animated.Value(0),
  }));
  const [settlementActivatedJourneyId, setSettlementActivatedJourneyId] = useState<
    string | null
  >(null);
  const [settlementPageProgress] = useState(() => ({
    position: new Animated.Value(0),
    offset: new Animated.Value(0),
  }));
  const [settlementHeaderOffset] = useState(() => new Animated.Value(0));
  const [settlementHeaderHeight, setSettlementHeaderHeight] = useState(0);
  const [settlementViewportHeight, setSettlementViewportHeight] = useState(0);
  const [modeNavHidden, setModeNavHidden] = useState(false);
  const [settlementSection, setSettlementSection] =
    useState<SettlementSectionName>("Summary");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journeyPickerOpen, setJourneyPickerOpen] = useState(false);
  const [journeyQuery, setJourneyQuery] = useState("");
  const [journeySearchVisible, setJourneySearchVisible] = useState(false);
  const [selectingJourneyId, setSelectingJourneyId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [ledgerChangeSeq, setLedgerChangeSeq] = useState(0);
  const journey = projection?.journey ?? null;
  const collapseDistance = spendingHeaderHeight;
  useEffect(() => {
    if (collapseDistance > 0)
      setModeNavHidden(sharedCollapse.current >= collapseDistance - 1);
  }, [collapseDistance]);
  useEffect(() => {
    settlementHeaderOffset.setValue(0);
    modePageProgress.position.setValue(modeRef.current === "SPENDING" ? 0 : 1);
    modePageProgress.offset.setValue(0);
    sharedCollapse.current = 0;
    spendingAnchor.current = { y: 0, body: 0 };
  }, [accountGeneration, journey?.journeyId, modePageProgress, settlementHeaderOffset]);
  const memberId = projection?.memberId ?? null;
  const scope = projection?.scope ?? "MINE";
  const summary = projection?.summary ?? null;
  const categories = projection?.categories ?? [];
  const categorySelection = scope === "GROUP" ? projection?.selectedMember : null;
  const displayedCategories = categorySelection?.categories ?? categories;
  const categorySummary = categorySelection?.summary ?? summary;
  const expenses = projection?.expenses ?? [];
  const settlement = projection?.settlement ?? ({ kind: "PREVIEW" } as const);
  const fallbackJourneyId =
    journeys.length === 0 || journeys.some((item) => item.journeyId === stage3JourneyId)
      ? stage3JourneyId
      : "";
  const journeySections = useMemo(
    () =>
      journeyPickerSections(
        journeys,
        localToday(),
        journey?.journeyId ?? null,
        journeyQuery,
        debugMode,
      ),
    [debugMode, journey?.journeyId, journeyQuery, journeys],
  );

  const loadProjection = useCallback(
    async (nextJourney: LedgerJourneyContext, nextScope: ReportingScope) => {
      const id = request.begin();
      setMessage(null);
      try {
        return await retrySQLiteRollbackOnce(async () => {
          const repository = await getDefaultLedgerReportingRepository();
          const actor = await repository.getActorMemberId(nextJourney.journeyId);
          const nextMemberId = actor?.memberId ?? null;
          if (!nextMemberId)
            throw new Error(
              "This Journey needs an authenticated bootstrap before reporting is available.",
            );
          const query = {
            journeyId: nextJourney.journeyId,
            memberId: nextMemberId,
            scope: nextScope,
          };
          const selectedMemberId =
            nextScope === "GROUP" &&
            selectedJourneyIdRef.current === nextJourney.journeyId
              ? selectedMemberIdRef.current
              : null;
          const settlementRepository = await getDefaultLedgerSettlementRepository();
          const [
            nextSummary,
            nextCategories,
            nextExpenses,
            settlements,
            options,
            memberSpending,
            reviewCounts,
            selectedMember,
          ] = await Promise.all([
            repository.summarize(query),
            repository.analyze(query, "CATEGORY"),
            repository.listExpenses({ ...query, order: "UPDATED" }, 12),
            settlementRepository.listFinalized(nextJourney.journeyId),
            repository.listFilterOptions(nextJourney.journeyId),
            nextScope === "GROUP"
              ? repository.analyze({ ...query, scope: "GROUP" }, "PARTICIPANT")
              : Promise.resolve([]),
            getDefaultLedgerReviewRepository().then((review) =>
              review.counts(nextJourney.journeyId),
            ),
            selectedMemberId
              ? Promise.all([
                  repository.summarize({
                    ...query,
                    memberId: selectedMemberId,
                    scope: "MINE",
                  }),
                  repository.analyze(
                    { ...query, memberId: selectedMemberId, scope: "MINE" },
                    "CATEGORY",
                  ),
                ]).then(([summary, categories]) => ({
                  id: selectedMemberId,
                  summary,
                  categories: categories.slice(0, 5),
                }))
              : Promise.resolve(null),
          ]);
          const allRows = await repository.listExpenses(
            query,
            await repository.countExpenses(query),
          );
          const rawExpenses = await (
            await getDefaultLedgerExpenseRepository()
          ).listExpensesForJourney(nextJourney.journeyId);
          const rawById = new Map(rawExpenses.map((expense) => [expense.id, expense]));
          const estimates = await loadDisplayEstimates(
            nextJourney.journeyId,
            nextJourney.settlementCurrency,
            nextJourney.settlementScale,
            rawExpenses,
          );
          const display = displayTotalProjection(
            allRows,
            rawById,
            estimates,
            nextScope,
            nextMemberId,
          );
          if (!Number.isSafeInteger(nextSummary.totalMinor + display.estimatedMinor))
            throw new Error("Display total is unsafe.");
          const estimateComponents = new Map(
            nextExpenses.flatMap((row) => {
              if (row.hasOpenConflict || row.businessStatus !== "RATE_REQUIRED")
                return [];
              const raw = rawById.get(row.id);
              const estimate = estimates.get(row.id);
              const minor =
                raw && estimate
                  ? nextScope === "GROUP"
                    ? estimate.money.minor
                    : estimatedComponent(raw, estimate, nextMemberId)
                  : null;
              return minor === null ? [] : [[row.id, minor] as const];
            }),
          );
          const [settlementPreview, pendingFinancialOperations] = await Promise.all([
            loadEstimatedSettlement(nextJourney.journeyId).catch(() => null),
            settlementRepository.hasPendingFinancialOperations(nextJourney.journeyId),
          ]);
          if (!request.isCurrent(id)) return false;
          memberRequest.cancel();
          scopeRef.current = nextScope;
          selectedJourneyIdRef.current = nextJourney.journeyId;
          selectedMemberIdRef.current =
            selectedMember &&
            options.members.some((member) => member.id === selectedMember.id)
              ? selectedMember.id
              : null;
          setProjection({
            journey: nextJourney,
            memberId: nextMemberId,
            scope: nextScope,
            summary: nextSummary,
            categories: nextCategories.slice(0, 5),
            members: options.members,
            memberSpending,
            reviewCount: reviewCounts.pending,
            selectedMember: selectedMemberIdRef.current ? selectedMember : null,
            expenses: nextExpenses,
            estimatedMinor: display.estimatedMinor,
            estimatedCount: display.estimatedCount,
            estimates,
            estimateComponents,
            settlement: savedSettlementCardProjection(
              settlements,
              nextMemberId,
              settlementPreview,
              pendingFinancialOperations,
            ),
          });
          return true;
        });
      } catch {
        if (request.isCurrent(id))
          setMessage("Ledger could not refresh. Saved data is still available.");
        return false;
      }
    },
    [memberRequest, request],
  );

  const selectCategoryMember = async (selectedId: string | null) => {
    if (!journey || scope !== "GROUP" || !projection) return;
    request.cancel();
    const id = memberRequest.begin();
    const previousId = selectedMemberIdRef.current;
    selectedMemberIdRef.current = selectedId;
    if (!selectedId) {
      setProjection((current) =>
        current ? { ...current, selectedMember: null } : current,
      );
      return;
    }
    try {
      const repository = await getDefaultLedgerReportingRepository();
      const query = {
        journeyId: journey.journeyId,
        memberId: selectedId,
        scope: "MINE" as const,
      };
      const [memberSummary, memberCategories] = await Promise.all([
        repository.summarize(query),
        repository.analyze(query, "CATEGORY"),
      ]);
      if (!memberRequest.isCurrent(id)) return;
      selectedMemberIdRef.current = selectedId;
      setProjection((current) =>
        current?.journey.journeyId === journey.journeyId && current.scope === "GROUP"
          ? {
              ...current,
              selectedMember: {
                id: selectedId,
                summary: memberSummary,
                categories: memberCategories.slice(0, 5),
              },
            }
          : current,
      );
    } catch {
      if (memberRequest.isCurrent(id)) {
        selectedMemberIdRef.current = previousId;
        setMessage("Member spending could not be updated.");
      }
    }
  };

  const loadContext = useCallback(async () => {
    const repository = await getDefaultLedgerReportingRepository();
    const [available, selected] = await Promise.all([
      repository.listJourneys(),
      repository.getSelectedJourneyId(),
    ]);
    const entry = chooseJourneyEntry(
      available,
      localToday(),
      selected,
      scopedJourneyId,
      manualJourneyId.current,
    );
    setJourneys(available);
    const nextJourney =
      entry.kind === "JOURNEY"
        ? (available.find((item) => item.journeyId === entry.journeyId) ?? null)
        : null;
    if (nextJourney) await loadProjection(nextJourney, scopeRef.current);
    else {
      request.cancel();
      setProjection(null);
      setMessage(null);
    }
    setLoading(false);
  }, [loadProjection, request, scopedJourneyId]);

  const handleLedgerChanged = useCallback(async () => {
    setLedgerChangeSeq((value) => value + 1);
    await loadContext();
  }, [loadContext]);

  useEffect(
    () =>
      subscribeLedgerReview((changedJourneyId) => {
        if (changedJourneyId !== journey?.journeyId) return;
        void getDefaultLedgerReviewRepository()
          .then((repository) => repository.counts(changedJourneyId))
          .then(({ pending }) =>
            setProjection((current) =>
              current?.journey.journeyId === changedJourneyId
                ? { ...current, reviewCount: pending }
                : current,
            ),
          )
          .catch(() => undefined);
      }),
    [journey?.journeyId],
  );

  const network = useNetworkState();
  const syncStatus = useLedgerActiveSync(
    (journey?.journeyId ?? fallbackJourneyId) || null,
    handleLedgerChanged,
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const generation = getAccountGeneration();
      if (generation !== accountGenerationRef.current) {
        accountGenerationRef.current = generation;
        request.cancel();
        memberRequest.cancel();
        selectedJourneyIdRef.current = null;
        selectedMemberIdRef.current = null;
        manualJourneyId.current = undefined;
        setAccountGeneration(generation);
        setProjection(null);
        setJourneys([]);
        setSettlementActivatedJourneyId(null);
        setSettlementSection("Summary");
        setMode("SPENDING");
        setModeNavHidden(false);
        setSpendingHeaderHeight(0);
        setSettlementHeaderHeight(0);
        setSettlementViewportHeight(0);
        setLoading(true);
      }
      void loadContext().catch(() => setMessage("Ledger cache is unavailable."));
      void getDefaultLedgerFxSnapshotRepository()
        .then(async (repository) => {
          const before = await repository.list();
          const updated = await refreshLedgerFxSnapshotCache();
          if (
            active &&
            updated?.snapshots[0]?.observedAt !== before?.snapshots[0]?.observedAt
          )
            await loadContext();
        })
        .catch(() => undefined);
      void getDefaultLedgerReportingRepository()
        .then((repository) => repository.getPreferences())
        .then((preferences) => {
          if (active) setDebugMode(preferences.debugMode);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [loadContext, memberRequest, request]),
  );

  useEffect(
    () => () => {
      request.cancel();
    },
    [request],
  );

  const chooseJourney = async (selected: LedgerJourneyContext) => {
    setSettlementSection("Summary");
    setModeNavHidden(false);
    const previous = projection;
    const previousManualJourneyId = manualJourneyId.current;
    manualJourneyId.current = selected.journeyId;
    setSelectingJourneyId(selected.journeyId);
    let loaded = await loadProjection(selected, scopeRef.current);
    if (!loaded) {
      await refreshJourneyLedger(selected.journeyId).catch(() => false);
      loaded = await loadProjection(selected, scopeRef.current);
    }
    if (!loaded) {
      manualJourneyId.current = previousManualJourneyId;
      setSelectingJourneyId(null);
      return;
    }
    try {
      const repository = await getDefaultLedgerReportingRepository();
      await repository.selectJourney(selected.journeyId);
      if (scopedJourneyId) router.setParams({ journeyId: selected.journeyId });
      setJourneyPickerOpen(false);
      setJourneyQuery("");
    } catch {
      manualJourneyId.current = previousManualJourneyId;
      request.cancel();
      setProjection(previous);
      setMessage("Journey selection could not be saved.");
    } finally {
      setSelectingJourneyId(null);
    }
  };

  const openSearch = (extra: Record<string, string> = {}) => {
    if (!journey || !memberId) return;
    router.push({
      pathname: "/expenses/search",
      params: { journeyId: journey.journeyId, memberId, scope, ...extra },
    });
  };

  const openJourneyLedger = (journeyId: string) =>
    router.push({
      pathname: "/expenses/journey/[journeyId]",
      params: { journeyId },
    } as never);

  const openNewExpense = () =>
    router.push({
      pathname: "/expenses/new",
      params: journey ? { journeyId: journey.journeyId } : {},
    });

  const changeMode = (nextMode: Mode) => {
    if (nextMode === "SETTLEMENT" && journey)
      setSettlementActivatedJourneyId(journey.journeyId);
    if (nextMode === "SPENDING" && journey) {
      const y = restoredScrollY(sharedCollapse.current, spendingAnchor.current.body);
      spendingAnchor.current.y = y;
      spendingScroll.current?.scrollTo({ y, animated: false });
    }
    if (nextMode === "SETTLEMENT") setModeTransitionSeq((value) => value + 1);
    if (journey) modePager.current?.setPage(nextMode === "SPENDING" ? 0 : 1);
    else setMode(nextMode);
  };

  return (
    <>
      <Stack.Screen
        options={{
          gestureEnabled: !journey,
          headerShown: true,
          headerTitle: () => (
            <NavigationContextTitle
              title="Ledger"
              subtitle={
                journey && modeNavHidden
                  ? mode === "SPENDING"
                    ? "Spending"
                    : "Settlement"
                  : null
              }
            />
          ),
          headerLeft: () => <GlobalMenu journeyId={journey?.journeyId} module="LEDGER" />,
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton
                label={
                  journey
                    ? "Search Expenses"
                    : journeySearchVisible
                      ? "Hide Journey Search"
                      : "Search Journeys"
                }
                name="magnifyingglass"
                onPress={() => {
                  if (journey) {
                    openSearch();
                    return;
                  }
                  if (journeySearchVisible) {
                    journeySearch.current?.blur();
                    setJourneyQuery("");
                    setJourneySearchVisible(false);
                    return;
                  }
                  setJourneySearchVisible(true);
                  requestAnimationFrame(() => journeySearch.current?.focus());
                }}
              />
              {journey ? (
                <HeaderButton label="Add Expense" name="plus" onPress={openNewExpense} />
              ) : null}
            </View>
          ),
        }}
      />
      <View style={styles.page}>
        <AnimatedPagerView
          initialPage={mode === "SPENDING" ? 0 : 1}
          key={`${accountGeneration}:${journey?.journeyId ?? "no-journey"}`}
          onPageScroll={Animated.event(
            [
              {
                nativeEvent: {
                  position: modePageProgress.position,
                  offset: modePageProgress.offset,
                },
              },
            ],
            { useNativeDriver: true },
          )}
          onPageScrollStateChanged={(event) => {
            if (event.nativeEvent.pageScrollState !== "dragging" || !journey) return;
            if (mode === "SPENDING") {
              setSettlementActivatedJourneyId(journey.journeyId);
              setModeTransitionSeq((value) => value + 1);
            } else {
              const y = restoredScrollY(
                sharedCollapse.current,
                spendingAnchor.current.body,
              );
              spendingAnchor.current.y = y;
              spendingScroll.current?.scrollTo({ y, animated: false });
            }
          }}
          onPageSelected={(event) => {
            const nextMode = event.nativeEvent.position === 0 ? "SPENDING" : "SETTLEMENT";
            setMode(nextMode);
            setModeNavHidden(
              collapseDistance > 0 && sharedCollapse.current >= collapseDistance - 1,
            );
          }}
          overdrag={false}
          ref={modePager}
          scrollEnabled={Boolean(journey) && collapseDistance > 0 && !modeNavHidden}
          style={styles.modePager}
        >
          <View collapsable={false} style={styles.modePage}>
            <ScrollView
              contentContainerStyle={[
                styles.content,
                largeText && styles.largeContent,
                journey && { paddingTop: spendingHeaderHeight + 14 },
              ]}
              contentInsetAdjustmentBehavior="automatic"
              directionalLockEnabled
              onScroll={(event) => {
                const y = Math.max(0, event.nativeEvent.contentOffset.y);
                const anchor = spendingAnchor.current;
                const delta = y - anchor.y;
                anchor.y = y;
                if (mode !== "SPENDING" || collapseDistance <= 0 || Math.abs(delta) < 0.5)
                  return;
                const next = advanceScrollAnchor(
                  { collapse: sharedCollapse.current, body: anchor.body },
                  delta,
                  collapseDistance,
                );
                anchor.body = next.body;
                sharedCollapse.current = next.collapse;
                settlementHeaderOffset.setValue(next.collapse);
                setModeNavHidden(next.collapse >= collapseDistance - 1);
              }}
              ref={spendingScroll}
              scrollEventThrottle={16}
              style={styles.modePage}
            >
              <View style={styles.topControls}>
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
              </View>
              {journey ? (
                <>
                  <View style={styles.spendingSections}>
                    <View style={styles.total}>
                      <View style={[styles.totalHeader, largeText && styles.stack]}>
                        <Text
                          maxFontSizeMultiplier={2}
                          style={[styles.eyebrow, styles.totalEyebrow]}
                        >
                          {scope === "MINE" ? "YOU SPENT" : "GROUP SPENT"}
                        </Text>
                        <Segment
                          compact
                          value={scope}
                          options={["MINE", "GROUP"]}
                          onChange={(nextScope) => {
                            selectedMemberIdRef.current = null;
                            memberRequest.cancel();
                            void loadProjection(journey, nextScope);
                          }}
                        />
                      </View>
                      <MoneyText
                        variant="hero"
                        accessibilityLabel={`${
                          scope === "MINE" ? "You spent" : "Group spent"
                        } ${projection?.estimatedCount ? "approximately " : ""}${
                          summary
                            ? formatLedgerMoney(
                                summary.totalMinor + (projection?.estimatedMinor ?? 0),
                                journey.settlementCurrency,
                                journey.settlementScale,
                              )
                            : "unavailable"
                        }`}
                        style={styles.totalValue}
                        minor={
                          summary
                            ? summary.totalMinor + (projection?.estimatedMinor ?? 0)
                            : null
                        }
                        currency={journey.settlementCurrency}
                        scale={journey.settlementScale}
                        prefix={projection?.estimatedCount ? "≈ " : ""}
                      />
                      <Text maxFontSizeMultiplier={2} style={styles.meta}>
                        {summary?.expenseCount ?? 0} valued Expenses
                        {projection?.estimatedCount
                          ? ` · ${projection.estimatedCount} estimated`
                          : ""}
                      </Text>
                    </View>

                    <DashboardSection
                      action="See analysis"
                      onAction={() =>
                        router.push({
                          pathname: "/expenses/analysis",
                          params: {
                            journeyId: journey.journeyId,
                            memberId: memberId ?? "",
                            scope,
                            ...(categorySelection
                              ? { selectedMemberId: categorySelection.id }
                              : {}),
                          },
                        })
                      }
                      title={scope === "GROUP" ? "Spending by Member" : "Categories"}
                    >
                      {scope === "GROUP" ? (
                        <ScrollView
                          contentContainerStyle={styles.memberSelector}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.memberScroller}
                        >
                          {[
                            { id: "", label: "Group" },
                            ...spendingMembers(
                              projection?.members ?? [],
                              projection?.memberSpending ?? [],
                            ),
                          ].map((item) => {
                            const selected = (categorySelection?.id ?? "") === item.id;
                            return (
                              <Pressable
                                accessibilityLabel={item.label}
                                accessibilityRole="tab"
                                accessibilityState={{ selected }}
                                key={item.id || "group"}
                                onPress={() => void selectCategoryMember(item.id || null)}
                                style={[
                                  styles.memberTab,
                                  selected && styles.memberTabSelected,
                                ]}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.memberTabText,
                                    selected && styles.memberTabTextSelected,
                                  ]}
                                >
                                  {item.id ? shortMemberName(item.label) : item.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      ) : null}
                      <View
                        style={scope === "GROUP" ? styles.groupCategories : undefined}
                      >
                        {displayedCategories.map((category) => {
                          const percentage = spendingPercentage(
                            category.totalMinor,
                            categorySummary?.totalMinor ?? 0,
                          );
                          return (
                            <Pressable
                              accessibilityLabel={`${category.label}, ${formatLedgerMoney(
                                category.totalMinor,
                                journey.settlementCurrency,
                                journey.settlementScale,
                              )}, ${percentage} percent`}
                              accessibilityRole="button"
                              key={category.key}
                              onPress={() =>
                                openSearch({
                                  authoritative: "1",
                                  category: category.key,
                                  ...(categorySelection
                                    ? { selectedMemberId: categorySelection.id }
                                    : {}),
                                  origin: `Category: ${category.label}`,
                                })
                              }
                              style={styles.categoryRow}
                            >
                              <View
                                style={[
                                  styles.categoryHeading,
                                  largeText && styles.stack,
                                ]}
                              >
                                <Text
                                  maxFontSizeMultiplier={2}
                                  numberOfLines={2}
                                  style={styles.rowTitle}
                                >
                                  {category.label}
                                </Text>
                                <Text
                                  adjustsFontSizeToFit
                                  maxFontSizeMultiplier={1.35}
                                  minimumFontScale={0.7}
                                  numberOfLines={1}
                                  style={styles.categoryAmount}
                                >
                                  <MoneyText
                                    accessible={false}
                                    style={styles.categoryAmount}
                                    minor={category.totalMinor}
                                    currency={journey.settlementCurrency}
                                    scale={journey.settlementScale}
                                  />
                                  <Text style={styles.categoryPercentage}>
                                    {` · ${percentage}%`}
                                  </Text>
                                </Text>
                              </View>
                              <View style={styles.categoryTrack}>
                                <View
                                  style={[
                                    styles.categoryFill,
                                    { width: `${percentage}%` },
                                  ]}
                                />
                              </View>
                            </Pressable>
                          );
                        })}
                        {displayedCategories.length === 0 ? (
                          <Text style={styles.empty}>No category totals yet.</Text>
                        ) : null}
                      </View>
                      {scope === "GROUP" ? (
                        <View style={styles.categoryTotal}>
                          <Text style={styles.categoryTotalLabel}>
                            {categorySelection
                              ? "Total Spending"
                              : "Total Group Spending"}
                          </Text>
                          <MoneyText
                            style={styles.categoryTotalAmount}
                            variant="standard"
                            minor={categorySummary?.totalMinor ?? 0}
                            currency={journey.settlementCurrency}
                            scale={journey.settlementScale}
                          />
                        </View>
                      ) : null}
                    </DashboardSection>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => changeMode("SETTLEMENT")}
                      style={styles.snapshot}
                    >
                      <View style={styles.grow}>
                        <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>
                          SETTLEMENT
                        </Text>
                        {settlement.kind === "FINAL" ? (
                          <>
                            <Text maxFontSizeMultiplier={2} style={styles.snapshotTitle}>
                              {settlement.positionMinor === null
                                ? "Current balance unavailable"
                                : settlementPositionLabel(settlement.positionMinor)}
                            </Text>
                            {settlement.positionMinor !== null ? (
                              <MoneyText
                                maxFontSizeMultiplier={2}
                                style={styles.snapshotAmount}
                                variant="standard"
                                minor={Math.abs(settlement.positionMinor)}
                                currency={settlement.currency}
                                scale={settlement.scale}
                              />
                            ) : null}
                            <Text maxFontSizeMultiplier={2} style={styles.meta}>
                              {settlement.positionMinor === null
                                ? "Open Settlement for details"
                                : settlement.needsUpdate
                                  ? "Final settlement needs an update"
                                  : "Showing saved latest calculation"}
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text maxFontSizeMultiplier={2} style={styles.snapshotTitle}>
                              Settlement preview
                            </Text>
                            <Text maxFontSizeMultiplier={2} style={styles.meta}>
                              Check readiness and prepare a preview
                            </Text>
                          </>
                        )}
                      </View>
                      <AppIcon color="#0F766E" name="chevron.right" size={16} />
                    </Pressable>

                    {projection?.reviewCount ? (
                      <Pressable
                        accessibilityLabel={`${projection.reviewCount} items need review`}
                        accessibilityRole="button"
                        onPress={() =>
                          router.push({
                            pathname: "/expenses/review",
                            params: {
                              journeyId: journey.journeyId,
                              journeyTitle: journey.title,
                            },
                          })
                        }
                        style={styles.attention}
                      >
                        <View style={styles.grow}>
                          <Text maxFontSizeMultiplier={2} style={styles.attentionTitle}>
                            Needs attention
                          </Text>
                          <Text maxFontSizeMultiplier={2} style={styles.attentionMeta}>
                            {projection.reviewCount} things may affect the final amount
                          </Text>
                          <Text maxFontSizeMultiplier={2} style={styles.reviewLink}>
                            Review {projection.reviewCount} items ›
                          </Text>
                        </View>
                      </Pressable>
                    ) : null}

                    <ExpenseConflictList
                      journeyId={journey.journeyId}
                      title="Needs attention · Review changes"
                    />

                    <DashboardSection
                      action="See All"
                      onAction={() => openSearch({ origin: "All Expenses" })}
                      title="Recent Expenses"
                    >
                      {expenses.map((expense) => {
                        const attention = ledgerExpenseAttention(expense, scope);
                        const amounts = expenseAmountPresentation(
                          expense,
                          scope,
                          projection?.estimateComponents.get(expense.id) ?? null,
                        );
                        return (
                          <Pressable
                            accessibilityLabel={`${expense.title}, ${amounts.primary}${amounts.total ? `, ${amounts.total}` : ""}${amounts.original ? `, ${amounts.original}` : ""}${amounts.splitLabel ? ", split expense" : ""}${expense.hasReceipt ? ", receipt attached" : ""}${
                              attention ? `, ${attention}` : ""
                            }`}
                            accessibilityRole="button"
                            key={expense.id}
                            onPress={() => router.push(`/expenses/expense/${expense.id}`)}
                            style={[styles.row, largeText && styles.stack]}
                          >
                            <View style={styles.categoryIcon}>
                              <AppIcon
                                color="#0F766E"
                                name={categoryIcon(expense.category)}
                                size={18}
                              />
                            </View>
                            <View style={styles.grow}>
                              <View style={styles.rowTitleLine}>
                                <Text
                                  maxFontSizeMultiplier={2}
                                  numberOfLines={2}
                                  style={styles.rowTitle}
                                >
                                  {expense.title}
                                </Text>
                                {expense.hasReceipt ? (
                                  <AppIcon color="#64748B" name="paperclip" size={14} />
                                ) : null}
                              </View>
                              <View style={styles.rowMetaLine}>
                                <Text maxFontSizeMultiplier={2} style={styles.meta}>
                                  {formatLedgerDate(expense.occurredAt)}
                                  {amounts.total ? ` · ${amounts.total}` : ""}
                                </Text>
                                {amounts.splitLabel ? (
                                  <View style={styles.splitTag}>
                                    <Text
                                      maxFontSizeMultiplier={2}
                                      style={styles.splitTagText}
                                    >
                                      {amounts.splitLabel}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                              {attention ? (
                                <Text maxFontSizeMultiplier={2} style={styles.warning}>
                                  {attention}
                                </Text>
                              ) : null}
                            </View>
                            <View
                              style={[
                                styles.amountColumn,
                                largeText && styles.largeRowAmount,
                              ]}
                            >
                              <MoneyText
                                style={styles.rowAmount}
                                minor={
                                  (scope === "MINE"
                                    ? expense.componentMinor
                                    : expense.settlementMinor) ??
                                  projection?.estimateComponents.get(expense.id) ??
                                  null
                                }
                                currency={expense.settlementCurrency}
                                scale={expense.settlementScale}
                                prefix={
                                  (scope === "MINE"
                                    ? expense.componentMinor
                                    : expense.settlementMinor) === null &&
                                  projection?.estimateComponents.has(expense.id)
                                    ? "≈ "
                                    : ""
                                }
                              />
                              {amounts.original ? (
                                <MoneyText
                                  variant="compact"
                                  style={styles.amountMeta}
                                  minor={
                                    scope === "MINE"
                                      ? expense.originalComponentMinor
                                      : expense.originalMinor
                                  }
                                  currency={expense.originalCurrency}
                                  scale={expense.originalScale}
                                />
                              ) : null}
                            </View>
                          </Pressable>
                        );
                      })}
                      {expenses.length === 0 ? (
                        <View style={styles.emptyState}>
                          <Text maxFontSizeMultiplier={2} style={styles.empty}>
                            No Expenses yet.
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            onPress={openNewExpense}
                            style={styles.primary}
                          >
                            <Text maxFontSizeMultiplier={2} style={styles.primaryText}>
                              Add Expense
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {expenses.length ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => openSearch({ origin: "All Expenses" })}
                          style={styles.viewMore}
                        >
                          <Text maxFontSizeMultiplier={2} style={styles.link}>
                            View more
                          </Text>
                          <AppIcon color="#0F766E" name="chevron.right" size={15} />
                        </Pressable>
                      ) : null}
                    </DashboardSection>
                  </View>
                </>
              ) : (
                <View style={styles.destinationList}>
                  <Pressable
                    accessibilityLabel="My Ledger, all Journeys"
                    accessibilityRole="button"
                    onPress={() => router.push("/expenses/all-journeys")}
                    style={styles.myLedgerRow}
                  >
                    <View style={styles.destinationIcon}>
                      <AppIcon color="#0F766E" name="list.bullet.rectangle" size={20} />
                    </View>
                    <View style={styles.grow}>
                      <Text maxFontSizeMultiplier={2} style={styles.destinationTitle}>
                        My Ledger
                      </Text>
                      <Text maxFontSizeMultiplier={2} style={styles.meta}>
                        Spending across all Journeys
                      </Text>
                    </View>
                    <AppIcon color="#64748B" name="chevron.right" size={15} />
                  </Pressable>
                  {journeySearchVisible ? (
                    <TextInput
                      accessibilityLabel="Search Journeys"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setJourneyQuery}
                      placeholder="Search Journeys"
                      ref={journeySearch}
                      returnKeyType="search"
                      style={styles.landingSearch}
                      value={journeyQuery}
                    />
                  ) : null}
                  {journeySections.map((section) => (
                    <View key={section.title} style={styles.sectionBlock}>
                      <Text accessibilityRole="header" style={styles.journeySectionTitle}>
                        {section.title}
                      </Text>
                      <View style={styles.surface}>
                        {section.data.map((item) => (
                          <JourneyRow
                            item={item}
                            key={item.journeyId}
                            largeText={largeText}
                            onPress={() => openJourneyLedger(item.journeyId)}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                  {!loading && journeySections.length === 0 ? (
                    <Text style={styles.empty}>
                      {journeyQuery ? "No matching Journeys." : "No saved Journeys."}
                    </Text>
                  ) : null}
                </View>
              )}
              {debugMode ? (
                <View style={styles.debugSection}>
                  <Text accessibilityRole="header" style={styles.debugTitle}>
                    Debug Information
                  </Text>
                  <View style={styles.debugSurface}>
                    <DebugRow
                      label="Settlement loads"
                      value={`controller ${settlementLoadMetrics.controller} · pull ${settlementLoadMetrics.ledgerPull} · preview ${settlementLoadMetrics.serverPreview} · sections ${settlementLoadMetrics.sections} · review ${settlementLoadMetrics.personalReview}`}
                    />
                    <DebugRow
                      label="Network"
                      value={
                        network.isConnected === false ||
                        network.isInternetReachable === false
                          ? "Offline"
                          : network.isConnected === true
                            ? "Online"
                            : "Checking"
                      }
                    />
                    <DebugRow
                      attention={
                        syncStatus === "OFFLINE" ||
                        syncStatus === "SYNC_FAILED" ||
                        syncStatus === "CHANGES_WAITING"
                      }
                      label="Sync"
                      value={syncStatus ? syncStatusCopy[syncStatus] : "Starting"}
                    />
                    {readLastApiFailure() ? (
                      <DebugRow
                        label="Last API failure"
                        value={`${readLastApiFailure()!.method} ${readLastApiFailure()!.route} · ${readLastApiFailure()!.code ?? readLastApiFailure()!.kind} · ${readLastApiFailure()!.at}`}
                      />
                    ) : null}
                    <DebugRow
                      label="Environment"
                      value={
                        process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev"
                          ? "Development"
                          : "Local"
                      }
                    />
                    {journey ? <DebugRow label="Journey" value={journey.title} /> : null}
                  </View>
                </View>
              ) : null}
            </ScrollView>
            {journey ? (
              <Animated.View
                onLayout={(event) =>
                  setSpendingHeaderHeight(event.nativeEvent.layout.height)
                }
                style={[
                  styles.settlementHeader,
                  {
                    transform: [
                      { translateY: Animated.multiply(settlementHeaderOffset, -1) },
                    ],
                  },
                ]}
              >
                <View style={styles.stickyContext}>
                  <Pressable
                    accessibilityHint="Choose a Journey"
                    accessibilityLabel={`${journey.title}, ${formatLedgerDateRange(journey.startDate, journey.endDate)}`}
                    accessibilityRole="button"
                    onPress={() => setJourneyPickerOpen(true)}
                    style={styles.context}
                  >
                    <View style={styles.tripBadge}>
                      <Text style={styles.tripBadgeText}>TRIP</Text>
                    </View>
                    <Text
                      maxFontSizeMultiplier={2}
                      numberOfLines={1}
                      style={styles.contextTitle}
                    >
                      {journey.title}
                    </Text>
                    <AppIcon color="#64748B" name="chevron.right" size={15} />
                  </Pressable>
                </View>
                <View style={styles.settlementModeNav}>
                  <Segment
                    value={mode}
                    options={["SPENDING", "SETTLEMENT"]}
                    onChange={changeMode}
                    progress={modePageProgress}
                  />
                </View>
              </Animated.View>
            ) : null}
          </View>
          <View collapsable={false} style={styles.modePage}>
            {journey &&
            (mode === "SETTLEMENT" ||
              settlementActivatedJourneyId === journey.journeyId) ? (
              <View
                key={`${accountGeneration}:${journey.journeyId}`}
                onLayout={(event) =>
                  setSettlementViewportHeight(event.nativeEvent.layout.height)
                }
                style={styles.settlementShell}
              >
                <SettlementReadinessScreen
                  activeSection={settlementSection}
                  collapseDistance={collapseDistance}
                  debugMode={debugMode}
                  embedded
                  headerHeight={settlementHeaderHeight}
                  journeyId={journey.journeyId}
                  journeyTitle={journey.title}
                  ledgerChangeSeq={ledgerChangeSeq}
                  modeTransitionSeq={modeTransitionSeq}
                  onCollapseChange={(collapsed) => {
                    if (mode === "SETTLEMENT") setModeNavHidden(collapsed);
                  }}
                  onSectionChange={setSettlementSection}
                  pageProgress={settlementPageProgress}
                  sharedHeaderOffset={settlementHeaderOffset}
                  sharedCollapseRef={sharedCollapse}
                  showNavigation={false}
                  viewportHeight={settlementViewportHeight}
                />
                <Animated.View
                  onLayout={(event) =>
                    setSettlementHeaderHeight(event.nativeEvent.layout.height)
                  }
                  style={[
                    styles.settlementHeader,
                    {
                      transform: [
                        {
                          translateY: Animated.multiply(settlementHeaderOffset, -1),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.stickyContext}>
                    <Pressable
                      accessibilityLabel={`${journey.title}, ${formatLedgerDateRange(journey.startDate, journey.endDate)}`}
                      accessibilityRole="button"
                      onPress={() => setJourneyPickerOpen(true)}
                      style={styles.context}
                    >
                      <View style={styles.tripBadge}>
                        <Text style={styles.tripBadgeText}>TRIP</Text>
                      </View>
                      <Text
                        maxFontSizeMultiplier={2}
                        numberOfLines={1}
                        style={styles.contextTitle}
                      >
                        {journey.title}
                      </Text>
                      <AppIcon color="#64748B" name="chevron.right" size={15} />
                    </Pressable>
                  </View>
                  <View style={styles.settlementModeNav}>
                    <Segment
                      value={mode}
                      options={["SPENDING", "SETTLEMENT"]}
                      onChange={changeMode}
                      progress={modePageProgress}
                    />
                  </View>
                  <View>
                    <SettlementSectionTabs
                      active={settlementSection}
                      onChange={setSettlementSection}
                      progress={settlementPageProgress}
                    />
                  </View>
                </Animated.View>
              </View>
            ) : null}
          </View>
        </AnimatedPagerView>
      </View>

      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setJourneyPickerOpen(false)}
        presentationStyle="pageSheet"
        visible={journeyPickerOpen}
      >
        <View style={styles.picker}>
          <LedgerSheetHeader
            leftLabel="Cancel"
            onLeft={() => setJourneyPickerOpen(false)}
            onRight={() => {
              setJourneyPickerOpen(false);
              router.push("/expenses/all-journeys");
            }}
            rightLabel="My Ledger"
            title="Choose Journey"
          />
          <TextInput
            accessibilityLabel="Search Journeys"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setJourneyQuery}
            placeholder="Search Journeys"
            returnKeyType="search"
            style={styles.search}
            value={journeyQuery}
          />
          <SectionList
            contentContainerStyle={styles.pickerList}
            sections={journeySections}
            keyExtractor={(item) => item.journeyId}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No matching Journeys.</Text>}
            renderSectionHeader={({ section }) => (
              <Text style={styles.journeySectionTitle}>{section.title}</Text>
            )}
            renderItem={({ item }) => {
              const selected = item.journeyId === journey?.journeyId;
              const selecting = item.journeyId === selectingJourneyId;
              return (
                <JourneyRow
                  busy={selecting}
                  disabled={selectingJourneyId !== null}
                  item={item}
                  largeText={largeText}
                  onPress={() => void chooseJourney(item)}
                  selected={selected}
                />
              );
            }}
            stickySectionHeadersEnabled={false}
          />
        </View>
      </Modal>
    </>
  );
}

function JourneyRow({
  busy = false,
  disabled = false,
  item,
  largeText,
  onPress,
  selected = false,
}: {
  busy?: boolean;
  disabled?: boolean;
  item: ReturnType<typeof journeyPickerSections>[number]["data"][number];
  largeText: boolean;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${item.title}, ${formatLedgerDateRange(
        item.startDate,
        item.endDate,
      )}, ${item.memberCount} members, ${item.status}${selected ? ", selected" : ""}`}
      accessibilityRole="button"
      accessibilityState={{ selected, busy }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.journeyRow,
        selected && styles.selectedJourneyRow,
        largeText && styles.stack,
      ]}
    >
      <View style={styles.grow}>
        <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.rowTitle}>
          {item.title}
        </Text>
        <View style={styles.journeyMetaLine}>
          <Text maxFontSizeMultiplier={2} style={styles.meta}>
            {formatLedgerDateRange(item.startDate, item.endDate)}
          </Text>
          <AppIcon color="#64748B" name="person.2.fill" size={12} />
          <Text maxFontSizeMultiplier={2} style={styles.meta}>
            {item.memberCount}
          </Text>
        </View>
      </View>
      <View style={styles.journeyStatusColumn}>
        <JourneyStatusTag status={item.status} />
        {busy ? (
          <ActivityIndicator />
        ) : selected ? (
          <AppIcon color="#0F766E" name="checkmark" />
        ) : null}
      </View>
    </Pressable>
  );
}

function JourneyStatusTag({ status }: { status: "ACTIVE" | "UPCOMING" | "PAST" }) {
  return (
    <View
      style={[
        styles.journeyStatusTag,
        status === "ACTIVE"
          ? styles.activeStatus
          : status === "UPCOMING"
            ? styles.upcomingStatus
            : styles.pastStatus,
      ]}
    >
      <Text
        style={[
          styles.journeyStatusText,
          status === "ACTIVE"
            ? styles.activeStatusText
            : status === "UPCOMING"
              ? styles.upcomingStatusText
              : styles.pastStatusText,
        ]}
      >
        {status}
      </Text>
    </View>
  );
}

function DebugRow({
  attention,
  label,
  value,
}: {
  attention?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.debugRow}>
      <Text style={styles.debugLabel}>{label}</Text>
      <Text style={[styles.debugValue, attention && styles.debugAttention]}>{value}</Text>
    </View>
  );
}

function HeaderButton({
  disabled,
  label,
  name,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  name: "line.3.horizontal" | "magnifyingglass" | "plus";
  onPress: () => void;
}) {
  return (
    <HeaderIconAction disabled={disabled} label={label} name={name} onPress={onPress} />
  );
}

function DashboardSection({
  action,
  children,
  onAction,
  title,
}: {
  action: string;
  children: React.ReactNode;
  onAction: () => void;
  title: string;
}) {
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <View style={styles.sectionBlock}>
      <View style={[styles.sectionHeader, largeText && styles.stack]}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={2} style={styles.section}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.sectionAction}
        >
          <Text maxFontSizeMultiplier={2} style={styles.link}>
            {action}
          </Text>
        </Pressable>
      </View>
      <View style={styles.surface}>{children}</View>
    </View>
  );
}

function Segment<T extends string>({
  compact,
  value,
  options,
  onChange,
  progress,
}: {
  compact?: boolean;
  value: T;
  options: T[];
  onChange: (value: T) => void;
  progress?: { position: Animated.Value; offset: Animated.Value };
}) {
  const largeText = useWindowDimensions().fontScale > 1.5;
  const page =
    progress && !largeText ? Animated.add(progress.position, progress.offset) : null;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.segment,
        compact && styles.compactSegment,
        largeText && styles.segmentLarge,
      ]}
    >
      {options.map((option, index) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          key={option}
          onPress={() => onChange(option)}
          style={[
            styles.segmentItem,
            compact && styles.compactSegmentItem,
            !page && value === option && styles.segmentSelected,
          ]}
        >
          {page ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.segmentSelectedOverlay,
                {
                  opacity: Animated.subtract(page, index).interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [0, 1, 0],
                    extrapolate: "clamp",
                  }),
                },
              ]}
            />
          ) : null}
          <View style={styles.segmentLabel}>
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.35}
              minimumFontScale={0.75}
              numberOfLines={1}
              style={[
                styles.segmentText,
                !page && value === option && styles.segmentTextSelected,
              ]}
            >
              {option === "MINE"
                ? "Mine"
                : option === "GROUP"
                  ? "Group"
                  : option === "SPENDING"
                    ? "Spending"
                    : "Settlement"}
            </Text>
            {page ? (
              <Animated.Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.35}
                minimumFontScale={0.75}
                numberOfLines={1}
                pointerEvents="none"
                style={[
                  styles.segmentText,
                  styles.segmentTextOverlay,
                  {
                    opacity: Animated.subtract(page, index).interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [0, 1, 0],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              >
                {option === "SPENDING" ? "Spending" : "Settlement"}
              </Animated.Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F6F7F9", flex: 1 },
  modePager: { flex: 1 },
  modePage: { flex: 1 },
  hiddenPage: { display: "none" },
  content: {
    backgroundColor: "#F6F7F9",
    flexGrow: 1,
    gap: cv.space.section,
    padding: cv.space.page,
    paddingBottom: 40,
    paddingTop: 14,
  },
  destinationIcon: {
    alignItems: "center",
    backgroundColor: "#E7F5F1",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  destinationList: { gap: 14 },
  destinationTitle: { color: "#111827", fontSize: 17, fontWeight: "700" },
  largeContent: { paddingBottom: 140 },
  stickyContext: {
    backgroundColor: "#EEF2F5",
    paddingHorizontal: 16,
  },
  topControls: { gap: 14 },
  settlementShell: { flex: 1 },
  settlementHeader: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  settlementModeNav: { backgroundColor: "#F6F7F9", padding: 16 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
  disabled: { opacity: 0.35 },
  context: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingVertical: 10,
  },
  contextTitle: { color: "#111827", flex: 1, fontSize: 15, fontWeight: "700" },
  tripBadge: {
    borderColor: "#94A3B8",
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  tripBadgeText: { color: "#64748B", fontSize: 10, fontWeight: "800" },
  meta: { color: "#64748B", fontSize: 13 },
  message: { color: "#7C5B00", fontSize: 14 },
  segment: {
    backgroundColor: "#E5E7EB",
    borderRadius: 9,
    flexDirection: "row",
    padding: 2,
  },
  segmentLarge: { alignSelf: "stretch", flexDirection: "column" },
  compactSegment: { alignSelf: "flex-start", minWidth: 146 },
  segmentItem: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactSegmentItem: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 5 },
  segmentSelected: { backgroundColor: "#FFFFFF" },
  segmentSelectedOverlay: {
    backgroundColor: "#FFFFFF",
    borderRadius: 7,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  segmentLabel: { alignSelf: "stretch" },
  segmentText: { color: "#64748B", fontWeight: "600", textAlign: "center" },
  segmentTextOverlay: {
    bottom: 0,
    color: "#111827",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  segmentTextSelected: { color: "#111827" },
  total: { backgroundColor: cv.color.card, borderRadius: cv.radius.hero, padding: 18 },
  totalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  totalEyebrow: { color: cv.color.accent, ...cv.type.eyebrow },
  totalValue: {
    marginVertical: 6,
  },
  sectionBlock: { gap: cv.space.heading, width: "100%" },
  spendingSections: { gap: cv.space.section },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 32,
  },
  section: { color: cv.color.text, ...cv.type.section },
  sectionAction: { justifyContent: "center", minHeight: 44, paddingLeft: 16 },
  link: { color: cv.color.accent, ...cv.type.action },
  landingSearch: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    color: "#111827",
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  surface: {
    backgroundColor: cv.color.card,
    borderRadius: cv.radius.card,
    overflow: "hidden",
  },
  memberScroller: { flexGrow: 0, width: "100%" },
  memberSelector: { gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  memberTab: {
    backgroundColor: "#F1F5F9",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 14,
  },
  memberTabSelected: { backgroundColor: "#E7F5F1" },
  memberTabText: { color: "#64748B", fontSize: 13, fontWeight: "600", maxWidth: 100 },
  memberTabTextSelected: { color: "#0F766E", fontWeight: "700" },
  groupCategories: { minHeight: 290 },
  categoryTotal: {
    alignItems: "center",
    borderTopColor: "#E5E7EB",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  categoryTotalLabel: { color: "#334155", fontSize: 14, fontWeight: "600" },
  categoryTotalAmount: { color: "#111827", fontSize: 14, fontWeight: "700" },
  categoryRow: {
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 7,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  categoryAmount: { color: cv.color.text, ...cv.type.rowAmount },
  categoryPercentage: { color: cv.color.secondary, ...cv.type.percent },
  categoryTrack: {
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    height: 4,
    overflow: "hidden",
  },
  categoryFill: { backgroundColor: "#0F766E", borderRadius: 2, height: 4 },
  snapshot: {
    alignItems: "center",
    backgroundColor: cv.color.card,
    borderRadius: cv.radius.card,
    flexDirection: "row",
    gap: 12,
    minHeight: 96,
    padding: 16,
  },
  snapshotTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "600",
    marginTop: 4,
  },
  snapshotAmount: {
    color: cv.color.text,
    ...cv.type.metric,
    marginVertical: 2,
  },
  attention: {
    alignItems: "center",
    backgroundColor: cv.color.warning,
    borderRadius: cv.radius.card,
    flexDirection: "row",
    gap: 6,
    minHeight: 64,
    padding: 14,
  },
  attentionTitle: { color: "#9A3412", fontSize: 16, fontWeight: "700" },
  attentionMeta: { color: "#334155", fontSize: 15, lineHeight: 22, marginTop: 2 },
  reviewLink: { color: cv.color.accent, ...cv.type.action, marginTop: 4 },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: cv.space.row,
  },
  rowTitleLine: { alignItems: "center", flexDirection: "row", gap: 6 },
  rowMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 1,
  },
  grow: { flex: 1 },
  rowTitle: { color: cv.color.text, flexShrink: 1, ...cv.type.row },
  rowAmount: { color: cv.color.text, ...cv.type.rowAmount, textAlign: "right" },
  largeRowAmount: { alignSelf: "flex-start" },
  categoryIcon: {
    alignItems: "center",
    backgroundColor: "#E7F5F1",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  amountColumn: { alignItems: "flex-end", flexShrink: 0, maxWidth: "48%" },
  amountMeta: {
    color: cv.color.secondary,
    ...cv.type.secondaryAmount,
    marginTop: 2,
    textAlign: "right",
  },
  splitTag: {
    backgroundColor: "#EEF2F5",
    borderColor: "#CBD5E1",
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  splitTagText: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  warning: { color: "#B45309", fontSize: 12, fontWeight: "700", marginTop: 3 },
  viewMore: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  emptyState: { alignItems: "center", gap: 12, padding: 20 },
  empty: { color: "#64748B", padding: 20, textAlign: "center" },
  stack: { alignItems: "stretch", flexDirection: "column" },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  debugSection: { gap: 6, marginTop: 14 },
  debugTitle: { color: "#64748B", fontSize: 13, fontWeight: "700" },
  debugSurface: {
    backgroundColor: "#EEF2F5",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  debugRow: {
    alignItems: "center",
    borderBottomColor: "#DCE2E8",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 38,
  },
  debugLabel: { color: "#64748B", fontSize: 12 },
  debugValue: { color: "#475569", flex: 1, fontSize: 12, textAlign: "right" },
  debugAttention: { color: "#7C5B00" },
  myLedgerRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 14,
  },
  picker: { backgroundColor: "#F6F7F9", flex: 1 },
  search: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    color: "#111827",
    fontSize: 16,
    marginHorizontal: 16,
    marginVertical: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  pickerList: { padding: 16, paddingBottom: 40 },
  journeySectionTitle: {
    backgroundColor: "#F6F7F9",
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
    paddingBottom: 7,
    paddingTop: 12,
    textTransform: "uppercase",
  },
  journeyRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    padding: 14,
  },
  selectedJourneyRow: { backgroundColor: "#ECFDF9" },
  journeyMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
  },
  journeyStatusColumn: { alignItems: "flex-end", gap: 8 },
  journeyStatusTag: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  journeyStatusText: { fontSize: 10, fontWeight: "800" },
  activeStatus: { backgroundColor: "#DCFCE7" },
  activeStatusText: { color: "#166534" },
  upcomingStatus: { backgroundColor: "#DBEAFE" },
  upcomingStatusText: { color: "#1D4ED8" },
  pastStatus: { backgroundColor: "#E2E8F0" },
  pastStatusText: { color: "#64748B" },
});
