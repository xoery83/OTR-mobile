import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, Stack } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { refreshJourneyLedger } from "@/data/operations/kickLedgerSync";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
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
import { journeyLifecycleLabel, settlementPositionLabel } from "./dashboardPresentation";
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
  const [journeys, setJourneys] = useState<LedgerJourneyContext[]>([]);
  const [projection, setProjection] = useState<SpendingProjection | null>(null);
  const [mode, setMode] = useState<Mode>("SPENDING");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [journeyPickerOpen, setJourneyPickerOpen] = useState(false);
  const [journeyQuery, setJourneyQuery] = useState("");
  const [selectingJourneyId, setSelectingJourneyId] = useState<string | null>(null);
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
  const visibleJourneys = useMemo(() => {
    const query = journeyQuery.trim().toLocaleLowerCase();
    return query
      ? journeys.filter((item) => item.title.toLocaleLowerCase().includes(query))
      : journeys;
  }, [journeyQuery, journeys]);

  const loadProjection = useCallback(
    async (nextJourney: LedgerJourneyContext, nextScope: ReportingScope) => {
      const id = request.begin();
      setUpdating(true);
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
      } finally {
        if (request.isCurrent(id)) setUpdating(false);
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
      setUpdating(false);
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

  const openLedgerMenu = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Ledger",
        options: ["My Ledger", "Review", "Ledger Settings", "Cancel"],
        cancelButtonIndex: 3,
      },
      (index) => {
        if (index === 0) router.push("/expenses/all-journeys");
        if (index === 1)
          router.push({
            pathname: "/expenses/review",
            params: journey ? { journeyId: journey.journeyId } : {},
          } as never);
        if (index === 2) router.push("/expenses/settings" as never);
      },
    );
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
          headerLeft: () => (
            <HeaderButton
              label="Ledger menu"
              name="line.3.horizontal"
              onPress={openLedgerMenu}
            />
          ),
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
            <View style={styles.grow}>
              <Text
                maxFontSizeMultiplier={2}
                numberOfLines={largeText ? undefined : 1}
                style={styles.contextTitle}
              >
                {journey?.title ?? "Choose Journey"}
              </Text>
              <Text maxFontSizeMultiplier={2} style={styles.meta}>
                {journey
                  ? formatLedgerDateRange(journey.startDate, journey.endDate)
                  : "Select a Journey Ledger"}
              </Text>
            </View>
            <AppIcon color="#64748B" name="chevron.up.chevron.down" size={16} />
          </Pressable>
          {journey ? (
            <Segment
              value={mode}
              options={["SPENDING", "SETTLEMENT"]}
              onChange={setMode}
            />
          ) : null}
        </View>

        {syncStatus ? (
          <Text
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={2}
            style={[
              styles.syncStatus,
              (syncStatus === "OFFLINE" || syncStatus === "CHANGES_WAITING") &&
                styles.syncStatusAttention,
            ]}
          >
            {syncStatusCopy[syncStatus]}
          </Text>
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
        {updating && !loading ? (
          <View style={styles.updating}>
            <ActivityIndicator />
            <Text accessibilityLiveRegion="polite" style={styles.meta}>
              Updating Ledger…
            </Text>
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
                {categories.map((category, index) => (
                  <Pressable
                    accessibilityLabel={`${category.label}, ${formatLedgerMoney(
                      category.totalMinor,
                      journey.settlementCurrency,
                      journey.settlementScale,
                    )}`}
                    accessibilityRole="button"
                    key={category.key}
                    onPress={() =>
                      openSearch({
                        authoritative: "1",
                        category: category.key,
                        origin: `Category: ${category.label}`,
                      })
                    }
                    style={[styles.categoryRow, largeText && styles.stack]}
                  >
                    <Text
                      maxFontSizeMultiplier={2}
                      numberOfLines={2}
                      style={styles.rowTitle}
                    >
                      {index + 1}. {category.label}
                    </Text>
                    <Text style={[styles.rowAmount, largeText && styles.largeRowAmount]}>
                      {formatLedgerMoney(
                        category.totalMinor,
                        journey.settlementCurrency,
                        journey.settlementScale,
                      )}
                    </Text>
                  </Pressable>
                ))}
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

              {summary?.unresolvedRateCount || summary?.openConflictCount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    summary.openConflictCount
                      ? router.push("/expenses/review" as never)
                      : openSearch({ valuation: "RATE_REQUIRED" })
                  }
                  style={styles.attention}
                >
                  <Text maxFontSizeMultiplier={2} style={styles.attentionTitle}>
                    Needs attention
                  </Text>
                  <Text maxFontSizeMultiplier={2} style={styles.meta}>
                    {summary.unresolvedRateCount} need an exchange rate ·{" "}
                    {summary.openConflictCount} conflicts need review
                  </Text>
                </Pressable>
              ) : null}

              <DashboardSection
                action="See All"
                onAction={() => openSearch({ origin: "All Expenses" })}
                title="Recent Expenses"
              >
                {expenses.map((expense) => {
                  const attention = ledgerExpenseAttention(expense, scope);
                  return (
                    <Pressable
                      accessibilityLabel={`${expense.title}, ${formatLedgerMoney(
                        expense.originalMinor,
                        expense.originalCurrency,
                        expense.originalScale,
                      )}${expense.hasReceipt ? ", receipt attached" : ""}${
                        attention ? `, ${attention}` : ""
                      }`}
                      accessibilityRole="button"
                      key={expense.id}
                      onPress={() => router.push(`/expenses/expense/${expense.id}`)}
                      style={[styles.row, largeText && styles.stack]}
                    >
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
                        <Text maxFontSizeMultiplier={2} style={styles.meta}>
                          {expense.category} · {formatLedgerDate(expense.occurredAt)} ·{" "}
                          {expense.payerName} paid
                        </Text>
                        {attention ? (
                          <Text maxFontSizeMultiplier={2} style={styles.warning}>
                            {attention}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.rowAmount, largeText && styles.largeRowAmount]}
                      >
                        {formatLedgerMoney(
                          expense.originalMinor,
                          expense.originalCurrency,
                          expense.originalScale,
                        )}
                      </Text>
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
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setJourneyPickerOpen(false)}
        presentationStyle="pageSheet"
        visible={journeyPickerOpen}
      >
        <View style={styles.picker}>
          <View style={[styles.pickerHeader, largeText && styles.pickerHeaderLarge]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setJourneyPickerOpen(false)}
              style={styles.headerButton}
            >
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.pickerTitle}>
              Choose Journey
            </Text>
            {largeText ? null : <View style={styles.headerButton} />}
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
          <FlatList
            contentContainerStyle={styles.pickerList}
            data={visibleJourneys}
            keyExtractor={(item) => item.journeyId}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No matching Journeys.</Text>}
            renderItem={({ item }) => {
              const lifecycle = journeyLifecycleLabel(item, localToday());
              const selected = item.journeyId === journey?.journeyId;
              const selecting = item.journeyId === selectingJourneyId;
              return (
                <Pressable
                  accessibilityLabel={`${item.title}, ${formatLedgerDateRange(
                    item.startDate,
                    item.endDate,
                  )}${lifecycle ? `, ${lifecycle}` : ""}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected, busy: selecting }}
                  disabled={selectingJourneyId !== null}
                  onPress={() => void chooseJourney(item)}
                  style={styles.journeyRow}
                >
                  <View style={styles.grow}>
                    <Text
                      maxFontSizeMultiplier={2}
                      numberOfLines={2}
                      style={styles.rowTitle}
                    >
                      {item.title}
                    </Text>
                    <Text maxFontSizeMultiplier={2} style={styles.meta}>
                      {formatLedgerDateRange(item.startDate, item.endDate)}
                      {lifecycle ? ` · ${lifecycle}` : ""}
                    </Text>
                  </View>
                  {selecting ? (
                    <ActivityIndicator />
                  ) : selected ? (
                    <AppIcon color="#0F766E" name="checkmark" />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
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
  },
  largeContent: { paddingBottom: 140 },
  stickyContext: { backgroundColor: "#F6F7F9", gap: 8, paddingBottom: 8 },
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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    padding: 12,
  },
  contextTitle: { color: "#111827", fontSize: 17, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 13 },
  syncStatus: { color: "#64748B", fontSize: 12, paddingHorizontal: 2 },
  syncStatusAttention: { color: "#7C5B00" },
  message: { color: "#7C5B00", fontSize: 14 },
  updating: { alignItems: "center", flexDirection: "row", gap: 8 },
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
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
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
  attention: { backgroundColor: "#FFF7DB", borderRadius: 10, minHeight: 64, padding: 13 },
  attentionTitle: { color: "#7C5B00", fontWeight: "700" },
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
  grow: { flex: 1 },
  rowTitle: { color: "#111827", flexShrink: 1, fontSize: 16, fontWeight: "600" },
  rowAmount: { color: "#111827", fontSize: 15, fontWeight: "700" },
  largeRowAmount: { alignSelf: "flex-start" },
  warning: { color: "#B45309", fontSize: 12, fontWeight: "700", marginTop: 3 },
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
  picker: { backgroundColor: "#F6F7F9", flex: 1, paddingTop: 12 },
  pickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  pickerHeaderLarge: {
    alignItems: "flex-start",
    flexDirection: "column",
    paddingHorizontal: 16,
  },
  pickerTitle: { color: "#111827", fontSize: 17, fontWeight: "700" },
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
});
