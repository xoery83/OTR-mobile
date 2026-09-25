import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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

import { AppIcon } from "@/components/AppIcon";
import { GlobalMenu } from "@/components/GlobalMenu";
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
import { buildSettlementStatement } from "@/domain/ledger/settlementStatement";
import { stage3JourneyId } from "@/hooks/useLedgerStage3";
import { useLedgerActiveSync } from "@/hooks/useLedgerActiveSync";
import { useLedgerReportingRefresh } from "@/hooks/useLedgerReportingRefresh";

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
import {
  SettlementReadinessScreen,
  SettlementSectionTabs,
  type SettlementSectionName,
} from "./SettlementReadinessScreen";
import {
  expenseAmountPresentation,
  isLedgerModeNavHidden,
  journeyPickerSections,
  settlementPositionLabel,
  shortMemberName,
  spendingMembers,
  spendingPercentage,
} from "./dashboardPresentation";
import { createLatestRequest } from "./latestRequest";
import { retrySQLiteRollbackOnce } from "./retryLedgerRead";

type Mode = "SPENDING" | "SETTLEMENT";
type FinalizedRows = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getDefaultLedgerSettlementRepository>>["listFinalized"]
  >
>;
type SettlementSnapshot =
  | { kind: "PREVIEW" }
  | {
      kind: "FINAL";
      positionMinor: number | null;
      currency: string;
      scale: number;
      needsUpdate: boolean;
    };
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

function summarizeSettlement(rows: FinalizedRows, memberId: string): SettlementSnapshot {
  if (!rows.length) return { kind: "PREVIEW" };
  const root = rows.find((row) => row.kind !== "ADJUSTMENT") ?? rows[0];
  const statement = buildSettlementStatement(
    rows.filter((row) => row.id === root.id || row.rootSettlementId === root.id),
  );
  const current = statement.outstandingBalances.find(
    (item) => item.memberId === memberId,
  );
  const finalized = statement.lineage
    .at(-1)
    ?.balances.find((item) => item.memberId === memberId);
  return {
    kind: "FINAL",
    positionMinor: current?.amount.minor ?? finalized?.netMinor ?? null,
    currency:
      current?.amount.currency ?? finalized?.currency ?? statement.settlementCurrency,
    scale: current?.amount.scale ?? finalized?.scale ?? statement.settlementScale,
    needsUpdate:
      statement.adjustmentState !== null && statement.adjustmentState !== "CURRENT",
  };
}

export function LedgerStage6Screen({
  scopedJourneyId,
}: { scopedJourneyId?: string } = {}) {
  const largeText = useWindowDimensions().fontScale > 2;
  const modeNavBottom = useRef(0);
  const journeySearch = useRef<TextInput>(null);
  const { refreshPersonal } = useLedgerReportingRefresh();
  const manualJourneyId = useRef<string | undefined>(undefined);
  const [request] = useState(createLatestRequest);
  const [memberRequest] = useState(createLatestRequest);
  const scopeRef = useRef<ReportingScope>("MINE");
  const selectedMemberIdRef = useRef<string | null>(null);
  const selectedJourneyIdRef = useRef<string | null>(null);
  const [journeys, setJourneys] = useState<LedgerJourneyOption[]>([]);
  const [projection, setProjection] = useState<SpendingProjection | null>(null);
  const [mode, setMode] = useState<Mode>("SPENDING");
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
  const journey = projection?.journey ?? null;
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
            repository.listExpenses(query, 12),
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
            settlement: summarizeSettlement(settlements, nextMemberId),
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
      scopedJourneyId ?? manualJourneyId.current,
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

  useLedgerActiveSync(
    (journey?.journeyId ?? fallbackJourneyId) || null,
    handleLedgerChanged,
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadContext().catch(() => setMessage("Ledger cache is unavailable."));
      void getDefaultLedgerReportingRepository()
        .then((repository) => repository.getPreferences())
        .then((preferences) => {
          if (active) setDebugMode(preferences.debugMode);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [loadContext]),
  );

  useEffect(() => {
    const id = journey?.journeyId ?? fallbackJourneyId;
    if (!id) return;
    void refreshPersonal("ALL", { from: null, to: null }).catch(() => undefined);
  }, [journey?.journeyId, fallbackJourneyId, refreshPersonal]);

  useEffect(
    () => () => {
      request.cancel();
    },
    [request],
  );

  const chooseJourney = async (selected: LedgerJourneyContext) => {
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

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => (
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitleText}>Ledger</Text>
              {journey && modeNavHidden ? (
                <Text style={styles.headerSubtitle}>
                  {mode === "SPENDING" ? "Spending" : "Settlement"}
                </Text>
              ) : null}
            </View>
          ),
          headerLeft: scopedJourneyId
            ? undefined
            : () => <GlobalMenu journeyId={journey?.journeyId} module="LEDGER" />,
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
        {journey ? (
          <View style={styles.stickyContext}>
            <Pressable
              accessibilityHint="Choose a Journey"
              accessibilityLabel={
                journey
                  ? `${journey.title}, ${formatLedgerDateRange(journey.startDate, journey.endDate)}`
                  : "No current Journey selected"
              }
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
                {journey?.title ?? "Choose Trip"}
              </Text>
              <AppIcon color="#64748B" name="chevron.right" size={15} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={[styles.content, largeText && styles.largeContent]}
          contentInsetAdjustmentBehavior="automatic"
          onScroll={(event) => {
            const hidden = isLedgerModeNavHidden(
              event.nativeEvent.contentOffset.y,
              modeNavBottom.current,
            );
            setModeNavHidden((current) => (current === hidden ? current : hidden));
          }}
          scrollEventThrottle={16}
          stickyHeaderIndices={journey && mode === "SETTLEMENT" ? [1] : undefined}
        >
          <View style={styles.topControls}>
            {journey ? (
              <View
                onLayout={(event) => {
                  modeNavBottom.current = event.nativeEvent.layout.height + 14;
                }}
              >
                <Segment
                  value={mode}
                  options={["SPENDING", "SETTLEMENT"]}
                  onChange={setMode}
                />
              </View>
            ) : null}

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
          {journey && mode === "SETTLEMENT" ? (
            <View style={styles.settlementNavSticky}>
              <SettlementSectionTabs
                active={settlementSection}
                onChange={setSettlementSection}
              />
            </View>
          ) : null}
          {journey ? (
            mode === "SPENDING" ? (
              <>
                <View style={styles.total}>
                  <View style={[styles.totalHeader, largeText && styles.stack]}>
                    <Text maxFontSizeMultiplier={2} style={styles.eyebrow}>
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
                  <Text
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
                    maxFontSizeMultiplier={2}
                    style={styles.totalValue}
                  >
                    {summary
                      ? `${projection?.estimatedCount ? "≈ " : ""}${formatLedgerMoney(
                          summary.totalMinor + (projection?.estimatedMinor ?? 0),
                          journey.settlementCurrency,
                          journey.settlementScale,
                        )}`
                      : "—"}
                  </Text>
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
                  <View style={scope === "GROUP" ? styles.groupCategories : undefined}>
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
                          <View style={styles.categoryHeading}>
                            <Text
                              maxFontSizeMultiplier={2}
                              numberOfLines={1}
                              style={styles.rowTitle}
                            >
                              {category.label}
                            </Text>
                            <Text style={styles.categoryAmount}>
                              {formatLedgerMoney(
                                category.totalMinor,
                                journey.settlementCurrency,
                                journey.settlementScale,
                              )}
                              <Text style={styles.categoryPercentage}>
                                {` · ${percentage}%`}
                              </Text>
                            </Text>
                          </View>
                          <View style={styles.categoryTrack}>
                            <View
                              style={[styles.categoryFill, { width: `${percentage}%` }]}
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
                        {categorySelection ? "Total Spending" : "Total Group Spending"}
                      </Text>
                      <Text style={styles.categoryTotalAmount}>
                        {formatLedgerMoney(
                          categorySummary?.totalMinor ?? 0,
                          journey.settlementCurrency,
                          journey.settlementScale,
                        )}
                      </Text>
                    </View>
                  ) : null}
                </DashboardSection>

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/expenses/settlement",
                      params: { journeyId: journey.journeyId },
                    })
                  }
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
                            ? "Final settlement available"
                            : settlementPositionLabel(settlement.positionMinor)}
                        </Text>
                        {settlement.positionMinor !== null ? (
                          <Text maxFontSizeMultiplier={2} style={styles.snapshotAmount}>
                            {formatLedgerMoney(
                              Math.abs(settlement.positionMinor),
                              settlement.currency,
                              settlement.scale,
                            )}
                          </Text>
                        ) : null}
                        <Text maxFontSizeMultiplier={2} style={styles.meta}>
                          {settlement.needsUpdate
                            ? "Final settlement needs an update"
                            : "Final settlement snapshot"}
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
                        params: { journeyId: journey.journeyId },
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

                {summary?.openConflictCount ? (
                  <Pressable
                    accessibilityLabel={`${summary.openConflictCount} conflicts need review`}
                    accessibilityRole="button"
                    onPress={() => router.push("/expenses/review" as never)}
                    style={styles.attention}
                  >
                    <View style={styles.grow}>
                      <Text maxFontSizeMultiplier={2} style={styles.attentionTitle}>
                        Needs attention
                      </Text>
                      <Text maxFontSizeMultiplier={2} style={styles.attentionMeta}>
                        {summary.openConflictCount} conflicts need review
                      </Text>
                    </View>
                    <AppIcon color="#A16207" name="chevron.right" size={16} />
                  </Pressable>
                ) : null}

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
                          <Text style={styles.rowAmount}>{amounts.primary}</Text>
                          {amounts.original ? (
                            <Text style={styles.amountMeta}>{amounts.original}</Text>
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
              </>
            ) : (
              <SettlementReadinessScreen
                activeSection={settlementSection}
                debugMode={debugMode}
                embedded
                journeyId={journey.journeyId}
                showNavigation={false}
              />
            )
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
        </ScrollView>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setJourneyPickerOpen(false)}
        presentationStyle="pageSheet"
        visible={journeyPickerOpen}
      >
        <View style={styles.picker}>
          <View style={styles.pickerHeader}>
            <Pressable
              accessibilityLabel="Cancel Journey selection"
              accessibilityRole="button"
              onPress={() => setJourneyPickerOpen(false)}
              style={styles.pickerHeaderAction}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.pickerTitle}>
              Choose Journey
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setJourneyPickerOpen(false);
                router.push("/expenses/all-journeys");
              }}
              style={styles.pickerHeaderAction}
            >
              <Text style={styles.pickerLedgerText}>My Ledger</Text>
            </Pressable>
          </View>
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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={[styles.headerButton, disabled && styles.disabled]}
    >
      <AppIcon color="#0F766E" name={name} />
    </Pressable>
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
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
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
}: {
  compact?: boolean;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.segment,
        compact && styles.compactSegment,
        largeText && styles.segmentLarge,
      ]}
    >
      {options.map((option) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          key={option}
          onPress={() => onChange(option)}
          style={[
            styles.segmentItem,
            compact && styles.compactSegmentItem,
            value === option && styles.segmentSelected,
          ]}
        >
          <Text
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
  page: { backgroundColor: "#F6F7F9", flex: 1 },
  content: {
    backgroundColor: "#F6F7F9",
    flexGrow: 1,
    gap: 14,
    padding: 16,
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
  settlementNavSticky: { marginHorizontal: -16 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
  headerTitleBlock: { alignItems: "center" },
  headerTitleText: { color: "#111827", fontSize: 17, fontWeight: "700" },
  headerSubtitle: { color: "#94A3B8", fontSize: 11, fontWeight: "600" },
  headerButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
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
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactSegmentItem: { minHeight: 34, paddingHorizontal: 10, paddingVertical: 5 },
  segmentSelected: { backgroundColor: "#FFFFFF" },
  segmentText: { color: "#64748B", fontWeight: "600" },
  segmentTextSelected: { color: "#111827" },
  total: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 18 },
  totalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  totalValue: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "800",
    marginVertical: 6,
  },
  sectionBlock: { gap: 8, width: "100%" },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 32,
  },
  section: { color: "#334155", fontSize: 17, fontWeight: "700" },
  sectionAction: { justifyContent: "center", minHeight: 44, paddingLeft: 16 },
  link: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  landingSearch: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    color: "#111827",
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
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
  categoryAmount: { color: "#111827", fontSize: 14, fontWeight: "700" },
  categoryPercentage: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  categoryTrack: {
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    height: 4,
    overflow: "hidden",
  },
  categoryFill: { backgroundColor: "#0F766E", borderRadius: 2, height: 4 },
  snapshot: {
    alignItems: "center",
    backgroundColor: "#E7F5F1",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    minHeight: 96,
    padding: 16,
  },
  snapshotTitle: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "700",
    marginTop: 4,
  },
  snapshotAmount: {
    color: "#0F766E",
    fontSize: 24,
    fontWeight: "800",
    marginVertical: 2,
  },
  attention: {
    alignItems: "center",
    backgroundColor: "#FFF7DB",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    padding: 13,
  },
  attentionTitle: { color: "#7C5B00", fontWeight: "700" },
  attentionMeta: { color: "#8A6500", fontSize: 13, marginTop: 2 },
  reviewLink: { color: "#0F766E", fontSize: 14, fontWeight: "700", marginTop: 4 },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 14,
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
  rowTitle: { color: "#111827", flexShrink: 1, fontSize: 16, fontWeight: "600" },
  rowAmount: { color: "#111827", fontSize: 15, fontWeight: "700" },
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
  amountMeta: { color: "#64748B", fontSize: 12, marginTop: 2, textAlign: "right" },
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
  myLedgerRow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    padding: 14,
  },
  picker: { backgroundColor: "#F6F7F9", flex: 1, paddingTop: 12 },
  pickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  pickerHeaderAction: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 86,
    paddingHorizontal: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  pickerTitle: {
    color: "#111827",
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  pickerCancelText: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  pickerLedgerText: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
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
