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
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
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
import { SettlementReadinessScreen } from "./SettlementReadinessScreen";
import {
  expenseAmountPresentation,
  journeyPickerSections,
  settlementPositionLabel,
  spendingPercentage,
} from "./dashboardPresentation";
import { createLatestRequest } from "./latestRequest";

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
  expenses: LedgerReportListItem[];
  settlement: SettlementSnapshot;
};

const syncStatusCopy = {
  SYNCING: "Syncing",
  UP_TO_DATE: "Up to date",
  OFFLINE: "Offline · saved data is available",
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

export function LedgerStage6Screen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { refreshPersonal } = useLedgerReportingRefresh();
  const manualJourneyId = useRef<string | undefined>(undefined);
  const [request] = useState(createLatestRequest);
  const scopeRef = useRef<ReportingScope>("MINE");
  const [journeys, setJourneys] = useState<LedgerJourneyOption[]>([]);
  const [projection, setProjection] = useState<SpendingProjection | null>(null);
  const [mode, setMode] = useState<Mode>("SPENDING");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journeyPickerOpen, setJourneyPickerOpen] = useState(false);
  const [journeyQuery, setJourneyQuery] = useState("");
  const [selectingJourneyId, setSelectingJourneyId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const journey = projection?.journey ?? null;
  const memberId = projection?.memberId ?? null;
  const scope = projection?.scope ?? "MINE";
  const summary = projection?.summary ?? null;
  const categories = projection?.categories ?? [];
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
        const settlementRepository = await getDefaultLedgerSettlementRepository();
        const [nextSummary, nextCategories, nextExpenses, settlements] =
          await Promise.all([
            repository.summarize(query),
            repository.analyze(query, "CATEGORY"),
            repository.listExpenses(query, 12),
            settlementRepository.listFinalized(nextJourney.journeyId),
          ]);
        if (!request.isCurrent(id)) return false;
        scopeRef.current = nextScope;
        setProjection({
          journey: nextJourney,
          memberId: nextMemberId,
          scope: nextScope,
          summary: nextSummary,
          categories: nextCategories.slice(0, 5),
          expenses: nextExpenses,
          settlement: summarizeSettlement(settlements, nextMemberId),
        });
        return true;
      } catch (error) {
        if (request.isCurrent(id))
          setMessage(
            error instanceof Error ? error.message : "Ledger could not be updated.",
          );
        return false;
      }
    },
    [request],
  );

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
      if (entry.kind === "CHOOSE") setMessage("Choose a current Journey to continue.");
      else setMessage("No Journey is current today. My Ledger remains available.");
    }
    setLoading(false);
  }, [loadProjection, request]);

  const handleLedgerChanged = useCallback(async () => {
    await loadContext();
  }, [loadContext]);

  const syncStatus = useLedgerActiveSync(
    (journey?.journeyId ?? fallbackJourneyId) || null,
    handleLedgerChanged,
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getDefaultLedgerReportingRepository()
        .then((repository) => repository.getPreferences())
        .then((preferences) => {
          if (active) setDebugMode(preferences.debugMode);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    void Promise.resolve()
      .then(() => loadContext())
      .catch(() => {
        setLoading(false);
        setMessage("Ledger cache is unavailable.");
      });
  }, [loadContext]);

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
          headerTitle: "Ledger",
          headerLeft: () => <GlobalMenu journeyId={journey?.journeyId} module="LEDGER" />,
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderButton
                disabled={!journey}
                label="Search Expenses"
                name="magnifyingglass"
                onPress={() => openSearch()}
              />
              <HeaderButton label="Add Expense" name="plus" onPress={openNewExpense} />
            </View>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, largeText && styles.largeContent]}
        contentInsetAdjustmentBehavior="automatic"
        stickyHeaderIndices={[0]}
      >
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
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.contextTitle}>
              {journey?.title ?? "Choose Trip"}
            </Text>
            <AppIcon color="#64748B" name="chevron.right" size={15} />
          </Pressable>
        </View>

        {journey ? (
          <Segment value={mode} options={["SPENDING", "SETTLEMENT"]} onChange={setMode} />
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
                    onChange={(nextScope) => void loadProjection(journey, nextScope)}
                  />
                </View>
                <Text
                  accessibilityLabel={`${
                    scope === "MINE" ? "You spent" : "Group spent"
                  } ${
                    summary
                      ? formatLedgerMoney(
                          summary.totalMinor,
                          journey.settlementCurrency,
                          journey.settlementScale,
                        )
                      : "unavailable"
                  }`}
                  maxFontSizeMultiplier={2}
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

              <DashboardSection
                action="See analysis"
                onAction={() =>
                  router.push({
                    pathname: "/expenses/analysis",
                    params: {
                      journeyId: journey.journeyId,
                      memberId: memberId ?? "",
                      scope,
                    },
                  })
                }
                title="Categories"
              >
                {categories.map((category) => {
                  const percentage = spendingPercentage(
                    category.totalMinor,
                    summary?.totalMinor ?? 0,
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
                {categories.length === 0 ? (
                  <Text style={styles.empty}>No category totals yet.</Text>
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
                  const amounts = expenseAmountPresentation(expense, scope);
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
                              <Text maxFontSizeMultiplier={2} style={styles.splitTagText}>
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
                        style={[styles.amountColumn, largeText && styles.largeRowAmount]}
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
            <SettlementReadinessScreen embedded journeyId={journey.journeyId} />
          )
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
        {debugMode ? (
          <View style={styles.debugSection}>
            <Text accessibilityRole="header" style={styles.debugTitle}>
              Debug Information
            </Text>
            <View style={styles.debugSurface}>
              <DebugRow
                label="Network"
                value={
                  syncStatus
                    ? syncStatus === "OFFLINE"
                      ? "Offline"
                      : "Online"
                    : "Checking"
                }
              />
              <DebugRow
                attention={syncStatus === "OFFLINE" || syncStatus === "CHANGES_WAITING"}
                label="Sync"
                value={syncStatus ? syncStatusCopy[syncStatus] : "Starting"}
              />
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
                <Pressable
                  accessibilityLabel={`${item.title}, ${formatLedgerDateRange(
                    item.startDate,
                    item.endDate,
                  )}, ${item.memberCount} members, ${item.status}${selected ? ", selected" : ""}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected, busy: selecting }}
                  disabled={selectingJourneyId !== null}
                  onPress={() => void chooseJourney(item)}
                  style={[
                    styles.journeyRow,
                    selected && styles.selectedJourneyRow,
                    largeText && styles.stack,
                  ]}
                >
                  <View style={styles.grow}>
                    <Text
                      maxFontSizeMultiplier={2}
                      numberOfLines={2}
                      style={styles.rowTitle}
                    >
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
                    {selecting ? (
                      <ActivityIndicator />
                    ) : selected ? (
                      <AppIcon color="#0F766E" name="checkmark" />
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
            stickySectionHeadersEnabled={false}
          />
        </View>
      </Modal>
    </>
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
  content: {
    backgroundColor: "#F6F7F9",
    flexGrow: 1,
    gap: 14,
    padding: 16,
    paddingBottom: 40,
    paddingTop: 0,
  },
  largeContent: { paddingBottom: 140 },
  stickyContext: {
    backgroundColor: "#EEF2F5",
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
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
  sectionBlock: { gap: 8 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 32,
  },
  section: { color: "#334155", fontSize: 17, fontWeight: "700" },
  sectionAction: { justifyContent: "center", minHeight: 44, paddingLeft: 16 },
  link: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
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
  pickerCancelText: { color: "#0F766E", fontSize: 17, fontWeight: "700" },
  pickerLedgerText: { color: "#0F766E", fontSize: 17, fontWeight: "700" },
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
