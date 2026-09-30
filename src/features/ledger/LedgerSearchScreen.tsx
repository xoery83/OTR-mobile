import { MoneyText } from "./MoneyText";
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
import { router, Stack, useLocalSearchParams } from "expo-router";

import { HeaderIconAction } from "@/components/navigationChrome";
import { contentVisual as cv } from "./contentVisual";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type { LedgerJourneyContext } from "@/domain/ledger/journeyContext";
import type {
  ReportingAggregate,
  ReportingFilters,
  ReportingScope,
} from "@/domain/ledger/reporting";

import { formatLedgerDate, formatLedgerMoney, ledgerExpenseAttention } from "./format";
import { createLatestRequest } from "./latestRequest";
import { LedgerSheetHeader } from "./LedgerSheetHeader";
import { expenseSearchAmounts, expenseSearchView } from "./expenseSearchModel";
import {
  countLedgerFilters,
  formatExpenseCount,
  ledgerDateFilter,
  searchDateLabel,
  type LedgerDatePreset,
} from "./searchFilters";

const pageSize = 50;

type Options = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getDefaultLedgerReportingRepository>>["listFilterOptions"]
  >
>;

type SearchView = {
  key: string;
  filters: ReportingFilters;
  query: string;
  rows: LedgerReportListItem[];
  resultCount: number;
  hasMore: boolean;
  summary: ReportingAggregate;
};

export function LedgerSearchScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const params = useLocalSearchParams<{
    journeyId: string;
    memberId: string;
    selectedMemberId?: string;
    shareOnly?: string;
    paidMemberId?: string;
    scope?: ReportingScope;
    category?: string;
    categories?: string;
    analysisState?: "INCLUDED" | "INCOMPLETE";
    payerMemberId?: string;
    participantMemberId?: string;
    currency?: string;
    valuation?: "RATE_REQUIRED" | "VALUED";
    from?: string;
    to?: string;
    authoritative?: string;
    origin?: string;
  }>();
  const searchView = expenseSearchView(params);
  const scope: ReportingScope = searchView.type === "group" ? "GROUP" : "MINE";
  const memberId = searchView.memberId;
  const authoritativeOnly = params.authoritative === "1";
  const positiveShare = searchView.type !== "group";
  const paidMemberId = searchView.type === "group" ? searchView.paidMemberId : undefined;
  const [initialFilters] = useState<ReportingFilters>(() => ({
    category: params.category,
    categories: parseAnalysisCategories(params.categories),
    analysisState: params.analysisState,
    payerMemberId: paidMemberId ? undefined : params.payerMemberId,
    participantMemberId: scope === "GROUP" ? params.participantMemberId : undefined,
    currency: params.currency,
    valuation: params.valuation,
    from: params.from,
    to: params.to,
  }));
  const [queryText, setQueryText] = useState("");
  const [view, setView] = useState<SearchView | null>(null);
  const [updating, setUpdating] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [journey, setJourney] = useState<LedgerJourneyContext | null>(null);
  const [options, setOptions] = useState<Options>({
    categories: [],
    currencies: [],
    members: [],
  });
  const [request] = useState(createLatestRequest);
  const [moreRequest] = useState(createLatestRequest);
  const retryRequest = useRef({ filters: initialFilters, query: "" });

  const load = useCallback(
    async (filters: ReportingFilters, query: string) => {
      if (!params.journeyId || !memberId) return false;
      const id = request.begin();
      retryRequest.current = { filters, query };
      moreRequest.cancel();
      setLoadingMore(false);
      const key = JSON.stringify({
        filters,
        query,
        scope,
        authoritativeOnly,
        positiveShare,
        paidMemberId,
      });
      setUpdating(true);
      setError(null);
      setMoreError(null);
      try {
        const repository = await getDefaultLedgerReportingRepository();
        const reportQuery = {
          journeyId: params.journeyId,
          memberId,
          scope,
          authoritativeOnly,
          positiveShare,
          ...filters,
          payerMemberId: paidMemberId ?? filters.payerMemberId,
          query,
        };
        const [rows, summary, resultCount] = await Promise.all([
          repository.listExpenses(reportQuery, pageSize),
          repository.summarize(reportQuery),
          repository.countExpenses(reportQuery),
        ]);
        if (!request.isCurrent(id)) return false;
        setView({
          key,
          filters,
          query,
          rows,
          resultCount,
          hasMore: rows.length === pageSize,
          summary,
        });
        return true;
      } catch {
        if (request.isCurrent(id)) setError("Expenses could not be updated.");
        return false;
      } finally {
        if (request.isCurrent(id)) setUpdating(false);
      }
    },
    [
      authoritativeOnly,
      memberId,
      moreRequest,
      paidMemberId,
      params.journeyId,
      request,
      scope,
      positiveShare,
    ],
  );

  useEffect(() => {
    let active = true;
    if (!params.journeyId) return;
    void getDefaultLedgerReportingRepository()
      .then((repository) =>
        Promise.all([
          repository.listFilterOptions(params.journeyId),
          repository.listJourneys(),
        ]),
      )
      .then(([nextOptions, journeys]) => {
        if (!active) return;
        setOptions(nextOptions);
        setJourney(journeys.find((item) => item.journeyId === params.journeyId) ?? null);
      })
      .catch(() => {
        if (active)
          setError("Filters are unavailable. Cached Expenses remain searchable.");
      });
    return () => {
      active = false;
    };
  }, [params.journeyId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load(view?.filters ?? initialFilters, queryText);
    }, 200);
    return () => clearTimeout(timeout);
    // A committed filter change is loaded explicitly, not by this typing debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, queryText]);

  useEffect(
    () => () => {
      request.cancel();
      moreRequest.cancel();
    },
    [moreRequest, request],
  );

  const filters = view?.filters ?? initialFilters;
  const filterCount = countLedgerFilters(filters);
  const resultsPending = !view || view.query !== queryText;
  const labels = useMemo(() => activeLabels(filters, options), [filters, options]);

  const applyFilters = async (next: ReportingFilters) => {
    const applied = await load(next, queryText);
    if (applied) setFilterOpen(false);
    return applied;
  };

  const removeFilter = (key: keyof ReportingFilters) => {
    const next = { ...filters };
    if (key === "from") {
      delete next.from;
      delete next.to;
    } else {
      delete next[key];
    }
    void applyFilters(next);
  };

  const loadMore = async () => {
    if (!params.journeyId || !memberId || !view || updating || loadingMore) return;
    const current = view;
    const id = moreRequest.begin();
    setLoadingMore(true);
    setMoreError(null);
    try {
      const repository = await getDefaultLedgerReportingRepository();
      const nextRows = await repository.listExpenses(
        {
          journeyId: params.journeyId,
          memberId,
          scope,
          authoritativeOnly,
          positiveShare,
          ...current.filters,
          payerMemberId: paidMemberId ?? current.filters.payerMemberId,
          query: current.query,
        },
        pageSize,
        current.rows.length,
      );
      if (!moreRequest.isCurrent(id)) return;
      setView((latest) =>
        latest?.key === current.key
          ? {
              ...latest,
              rows: [...latest.rows, ...nextRows],
              hasMore: nextRows.length === pageSize,
            }
          : latest,
      );
    } catch {
      if (moreRequest.isCurrent(id)) setMoreError("More Expenses could not be loaded.");
    } finally {
      if (moreRequest.isCurrent(id)) setLoadingMore(false);
    }
  };

  const renderRow = ({ item }: { item: LedgerReportListItem }) => {
    const attention = ledgerExpenseAttention(item, scope);
    const amounts = expenseSearchAmounts(item, searchView);
    const group = searchView.type === "group";
    const hasDistinctShare =
      !group &&
      item.originalComponentMinor !== null &&
      item.originalComponentMinor !== item.originalMinor;
    return (
      <Pressable
        accessibilityLabel={`${item.title}, ${group ? "total" : "share"} ${amounts.primary}${amounts.secondary ? `, original ${amounts.secondary}` : ""}${attention ? `, ${attention}` : ""}`}
        accessibilityRole="button"
        onPress={() => router.push(`/expenses/expense/${item.id}`)}
        style={[styles.row, largeText && styles.stack]}
      >
        <View style={styles.grow}>
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.title}>
            {item.title}
          </Text>
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.meta}>
            {item.category} · {formatLedgerDate(item.occurredAt)}
            {group ? ` · ${item.payerName} paid` : ""}
          </Text>
          {group ? (
            <Text maxFontSizeMultiplier={2} style={styles.meta}>
              {item.participantCount} {item.participantCount === 1 ? "person" : "people"}
              {item.unevenSplit ? " · Uneven split" : ""}
            </Text>
          ) : hasDistinctShare ? (
            <Text maxFontSizeMultiplier={2} style={styles.meta}>
              Total{" "}
              {formatLedgerMoney(
                item.originalMinor,
                item.originalCurrency,
                item.originalScale,
              )}
              {item.participantCount > 1 ? ` · Split ${item.participantCount}` : ""}
            </Text>
          ) : null}
          {attention ? (
            <Text maxFontSizeMultiplier={2} style={styles.warning}>
              {attention}
            </Text>
          ) : null}
        </View>
        <View style={[styles.amountBlock, largeText && styles.largeAmount]}>
          <MoneyText
            style={styles.amount}
            minor={group ? item.settlementMinor : item.componentMinor}
            currency={item.settlementCurrency}
            scale={item.settlementScale}
            placeholder="Journey value unavailable"
          />
          {amounts.secondary ? (
            <MoneyText
              variant="compact"
              style={styles.secondaryAmount}
              minor={group ? item.originalMinor : item.originalComponentMinor}
              currency={item.originalCurrency}
              scale={item.originalScale}
            />
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerTitle: "Search",
          headerRight: () => (
            <View>
              <HeaderIconAction
                label={`Filter expenses${filterCount ? `, ${filterCount} active` : ""}`}
                name="line.3.horizontal.decrease"
                onPress={() => setFilterOpen(true)}
              />
              {filterCount ? (
                <Text
                  maxFontSizeMultiplier={1}
                  pointerEvents="none"
                  style={styles.filterBadge}
                >
                  {filterCount}
                </Text>
              ) : null}
            </View>
          ),
        }}
      />
      <TextInput
        accessibilityLabel="Search Expenses"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={setQueryText}
        placeholder="Search Expenses"
        returnKeyType="search"
        style={styles.search}
        value={queryText}
      />
      {labels.length ? (
        <ScrollView
          contentContainerStyle={styles.chips}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={[styles.chipBar, largeText && styles.chipBarLarge]}
        >
          {labels.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              onPress={() => removeFilter(item.key)}
            />
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        contentContainerStyle={styles.content}
        data={resultsPending ? [] : (view?.rows ?? [])}
        initialNumToRender={12}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          resultsPending && error ? (
            <View style={styles.errorCard}>
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void load(retryRequest.current.filters, retryRequest.current.query)
                }
                style={styles.linkButton}
              >
                <Text style={styles.link}>Try Again</Text>
              </Pressable>
            </View>
          ) : resultsPending ? (
            <StatusCard busy text="Updating results…" />
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.empty}>No matching Expenses.</Text>
              {filterCount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void applyFilters({})}
                  style={styles.linkButton}
                >
                  <Text style={styles.link}>Clear Filters</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} />
          ) : moreError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMore()}
              style={styles.footer}
            >
              <Text style={styles.error}>{moreError} Try Again</Text>
            </Pressable>
          ) : null
        }
        ListHeaderComponent={
          !resultsPending && view ? (
            <>
              {error ? (
                <View style={[styles.errorCard, styles.headerError]}>
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {error}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      void load(retryRequest.current.filters, retryRequest.current.query)
                    }
                    style={styles.linkButton}
                  >
                    <Text style={styles.link}>Try Again</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.summary}>
                <Text maxFontSizeMultiplier={2} style={styles.origin}>
                  {paidMemberId
                    ? `Paid by ${options.members.find((item) => item.id === paidMemberId)?.label ?? "selected traveller"}`
                    : searchView.type === "person"
                      ? `${options.members.find((item) => item.id === memberId)?.label ?? "Traveller"}'s spending`
                      : scope === "GROUP"
                        ? "Group spending"
                        : "My spending"}
                  {params.origin ? ` · ${params.origin}` : ""}
                </Text>
                <Text
                  accessibilityLiveRegion="polite"
                  maxFontSizeMultiplier={2}
                  style={styles.summaryText}
                >
                  {formatExpenseCount(view.resultCount).toLowerCase()}
                  {view.resultCount !== view.summary.expenseCount
                    ? ` · ${view.summary.expenseCount} included`
                    : ""}
                  {view.summary.unresolvedRateCount
                    ? ` · ${view.summary.unresolvedRateCount} without journey value`
                    : ""}
                  {view.summary.openConflictCount
                    ? ` · ${view.summary.openConflictCount} ${view.summary.openConflictCount === 1 ? "conflict" : "conflicts"}`
                    : ""}
                </Text>
                <MoneyText
                  maxFontSizeMultiplier={2}
                  style={[styles.total, largeText && styles.largeTotal]}
                  variant="headline"
                  minor={view.summary.totalMinor}
                  currency={journey?.settlementCurrency ?? "NZD"}
                  scale={journey?.settlementScale ?? 2}
                />
                {updating ? (
                  <Text accessibilityLiveRegion="polite" style={styles.context}>
                    Updating…
                  </Text>
                ) : authoritativeOnly ? (
                  <Text maxFontSizeMultiplier={2} style={styles.context}>
                    Matches the Expenses included in analysis.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null
        }
        onEndReached={() => {
          if (view?.hasMore) void loadMore();
        }}
        onEndReachedThreshold={0.5}
        renderItem={renderRow}
        windowSize={7}
      />
      {filterOpen ? (
        <FilterSheet
          initial={filters}
          lockedPayer={Boolean(paidMemberId)}
          scope={scope}
          onApply={applyFilters}
          onCancel={() => setFilterOpen(false)}
          options={options}
        />
      ) : null}
    </View>
  );
}

function activeLabels(filters: ReportingFilters, options: Options) {
  const member = (id: string | undefined) =>
    options.members.find((item) => item.id === id)?.label ?? "Selected traveller";
  return [
    filters.from && {
      key: "from" as const,
      label: searchDateLabel(filters.from, filters.to),
    },
    filters.category && {
      key: "category" as const,
      label: `Category: ${filters.category}`,
    },
    filters.categories?.length && {
      key: "categories" as const,
      label: `Categories: ${filters.categories.join(", ")}`,
    },
    filters.analysisState && {
      key: "analysisState" as const,
      label:
        filters.analysisState === "INCLUDED" ? "Included spending" : "Not included yet",
    },
    filters.payerMemberId && {
      key: "payerMemberId" as const,
      label: `Paid by: ${member(filters.payerMemberId)}`,
    },
    filters.participantMemberId && {
      key: "participantMemberId" as const,
      label: `Includes: ${member(filters.participantMemberId)}`,
    },
    filters.currency && {
      key: "currency" as const,
      label: `Currency: ${filters.currency}`,
    },
    filters.valuation === "RATE_REQUIRED" && {
      key: "valuation" as const,
      label: "Needs exchange rate",
    },
    filters.valuation === "VALUED" && {
      key: "valuation" as const,
      label: "Has exchange value",
    },
    filters.conflict === "OPEN" && {
      key: "conflict" as const,
      label: "Conflict needs review",
    },
  ].filter(Boolean) as { key: keyof ReportingFilters; label: string }[];
}

function parseAnalysisCategories(value?: string): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((category) => typeof category === "string")
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function FilterSheet({
  initial,
  lockedPayer,
  scope,
  onApply,
  onCancel,
  options,
}: {
  initial: ReportingFilters;
  lockedPayer: boolean;
  scope: ReportingScope;
  onApply: (filters: ReportingFilters) => Promise<boolean>;
  onCancel: () => void;
  options: Options;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  const [draft, setDraft] = useState(initial);
  const [dateMode, setDateMode] = useState<LedgerDatePreset>(
    initial.from ? "RANGE" : "ANY",
  );
  const [rangeStart, setRangeStart] = useState(initial.from?.slice(0, 10) ?? "");
  const [rangeEnd, setRangeEnd] = useState(() => inclusiveEnd(initial.to));
  const [dateError, setDateError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [page, setPage] = useState<"main" | "currency" | "attention">("main");

  const choose = (
    title: string,
    values: { label: string; value: string | undefined }[],
    key: keyof ReportingFilters,
  ) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...values.map((item) => item.label), "Cancel"],
        cancelButtonIndex: values.length,
      },
      (index) => {
        const selected = values[index];
        if (selected)
          setDraft((current) => ({
            ...current,
            [key]: selected.value,
            ...(key === "category" ? { categories: undefined } : {}),
          }));
      },
    );
  };

  const apply = async () => {
    const date = ledgerDateFilter(dateMode, null, "", rangeStart, rangeEnd);
    if (!date) {
      setDateError("Enter valid dates in YYYY-MM-DD order.");
      return;
    }
    setApplying(true);
    await onApply({ ...draft, from: date.from, to: date.to });
    setApplying(false);
  };

  return (
    <Modal
      allowSwipeDismissal
      animationType="slide"
      onRequestClose={onCancel}
      presentationStyle="pageSheet"
    >
      <View style={styles.sheet}>
        <LedgerSheetHeader
          leftLabel={page === "main" ? "Cancel" : "Back"}
          onLeft={page === "main" ? onCancel : () => setPage("main")}
          onRight={page === "main" ? () => void apply() : () => setPage("main")}
          rightDisabled={applying}
          rightLabel={page === "main" ? (applying ? "Applying…" : "Apply") : "Done"}
          title={
            page === "main"
              ? "Filters"
              : page === "currency"
                ? "Currency"
                : "Needs attention"
          }
        />
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {page === "main" ? (
            <>
              <FilterSection title="Time">
                <View style={styles.wrap}>
                  {(
                    [
                      ["ANY", "All"],
                      ["TODAY", "Today"],
                      ["YESTERDAY", "Yesterday"],
                      ["LAST_30", "Last 30 days"],
                      ["RANGE", "Custom…"],
                    ] as [LedgerDatePreset, string][]
                  ).map(([value, label]) => (
                    <Choice
                      key={value}
                      label={label}
                      onPress={() => {
                        setDateMode(value);
                        setDateError(null);
                      }}
                      selected={value !== "ANY" && dateMode === value}
                    />
                  ))}
                </View>
                {dateMode === "RANGE" ? (
                  <View style={[styles.dateRow, largeText && styles.dateRowLarge]}>
                    <DateInput
                      label="Start"
                      onChange={setRangeStart}
                      value={rangeStart}
                    />
                    <DateInput label="End" onChange={setRangeEnd} value={rangeEnd} />
                  </View>
                ) : null}
                {dateError ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {dateError}
                  </Text>
                ) : null}
              </FilterSection>
              <FilterSection title="Details">
                <FilterRow
                  active={!!draft.category}
                  label="Category"
                  onPress={() =>
                    choose(
                      "Category",
                      [
                        { label: "Any", value: undefined },
                        ...options.categories.map((value) => ({ label: value, value })),
                      ],
                      "category",
                    )
                  }
                  value={draft.category ?? "Any"}
                />
                {!lockedPayer ? (
                  <FilterRow
                    active={!!draft.payerMemberId}
                    label="Paid by"
                    onPress={() =>
                      choose("Paid by", memberChoices(options), "payerMemberId")
                    }
                    value={optionLabel(options, draft.payerMemberId)}
                  />
                ) : null}
                {scope === "GROUP" ? (
                  <FilterRow
                    active={!!draft.participantMemberId}
                    label="Participant"
                    onPress={() =>
                      choose("Participant", memberChoices(options), "participantMemberId")
                    }
                    value={optionLabel(options, draft.participantMemberId)}
                  />
                ) : null}
              </FilterSection>
              <FilterSection title="More">
                <FilterRow
                  active={!!draft.currency}
                  label="Currency"
                  onPress={() => setPage("currency")}
                  value={draft.currency ?? "Any"}
                />
                <FilterRow
                  active={!!draft.valuation || !!draft.conflict}
                  label="Needs attention"
                  onPress={() => setPage("attention")}
                  value={
                    [
                      draft.valuation === "RATE_REQUIRED" ? "Journey value" : null,
                      draft.conflict === "OPEN" ? "Conflict" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "None"
                  }
                />
              </FilterSection>
            </>
          ) : page === "currency" ? (
            <FilterSection title="Currency">
              {[
                { label: "Any", value: undefined },
                ...options.currencies.map((value) => ({ label: value, value })),
              ].map((item) => (
                <FilterRow
                  active={item.value !== undefined && draft.currency === item.value}
                  key={item.label}
                  label={item.label}
                  value={draft.currency === item.value ? "✓" : ""}
                  onPress={() =>
                    setDraft((current) => ({ ...current, currency: item.value }))
                  }
                />
              ))}
            </FilterSection>
          ) : (
            <FilterSection title="Needs attention">
              <View style={styles.attentionChoices}>
                <Choice
                  label="Journey value unavailable"
                  checkbox
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      valuation:
                        current.valuation === "RATE_REQUIRED"
                          ? undefined
                          : "RATE_REQUIRED",
                    }))
                  }
                  selected={draft.valuation === "RATE_REQUIRED"}
                />
                <Choice
                  label="Conflict needs review"
                  checkbox
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      conflict: current.conflict === "OPEN" ? undefined : "OPEN",
                    }))
                  }
                  selected={draft.conflict === "OPEN"}
                />
              </View>
            </FilterSection>
          )}
          {page === "main" && countLedgerFilters(draft) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraft({});
                setDateMode("ANY");
                setDateError(null);
              }}
              style={styles.clearButton}
            >
              <Text style={styles.error}>Clear All</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function inclusiveEnd(to?: string) {
  if (!to) return "";
  const date = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function memberChoices(options: Options) {
  return [
    { label: "Any", value: undefined },
    ...options.members.map((item) => ({ label: item.label, value: item.id })),
  ];
}

function optionLabel(options: Options, id?: string) {
  return id
    ? (options.members.find((item) => item.id === id)?.label ?? "Selected traveller")
    : "Any";
}

function FilterSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FilterRow({
  active = false,
  label,
  onPress,
  value,
}: {
  active?: boolean;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const largeText = useWindowDimensions().fontScale > 2;
  return (
    <Pressable
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.filterRow, largeText && styles.filterRowLarge]}
    >
      <Text style={styles.filterRowLabel}>{label}</Text>
      <Text
        style={[
          styles.filterRowValue,
          active && styles.filterRowValueActive,
          largeText && styles.filterRowValueLarge,
        ]}
      >
        {value} ›
      </Text>
    </Pressable>
  );
}

function Choice({
  checkbox,
  label,
  onPress,
  selected,
}: {
  checkbox?: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={checkbox ? "checkbox" : "button"}
      accessibilityState={checkbox ? { checked: selected } : { selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DateInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.dateInput}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={`${label}, YYYY-MM-DD`}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityHint="Removes this filter"
      accessibilityRole="button"
      onPress={onPress}
      style={styles.chip}
    >
      <Text style={styles.chipText}>{label} ×</Text>
    </Pressable>
  );
}

function StatusCard({ busy, text }: { busy?: boolean; text: string }) {
  return (
    <View style={styles.statusCard}>
      {busy ? <ActivityIndicator /> : null}
      <Text accessibilityLiveRegion="polite" style={styles.summaryText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { backgroundColor: "#F6F7F9", flex: 1 },
  search: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: 1,
    color: "#111827",
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  chipBar: { backgroundColor: "#F6F7F9", flexGrow: 0, maxHeight: 58 },
  chipBarLarge: { maxHeight: 96 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 7 },
  chip: {
    backgroundColor: "#DDF4EF",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  chipText: { color: "#0F766E", fontWeight: "700" },
  filterBadge: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    minWidth: 18,
    overflow: "hidden",
    position: "absolute",
    right: 6,
    textAlign: "center",
    top: 8,
  },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  summary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    gap: 4,
    marginBottom: 12,
    padding: 14,
  },
  origin: { color: "#0F766E", fontWeight: "700" },
  summaryText: { color: "#64748B", fontSize: 13 },
  context: { color: "#64748B", fontSize: 12 },
  total: { color: "#111827", fontSize: 24, fontWeight: "800" },
  largeTotal: { fontSize: 20 },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    padding: 14,
  },
  grow: { flex: 1, minWidth: 0 },
  title: { color: cv.color.text, ...cv.type.row },
  meta: { color: cv.color.secondary, ...cv.type.meta, marginTop: 3 },
  warning: { color: "#B45309", fontSize: 12, fontWeight: "700", marginTop: 3 },
  amountBlock: { alignItems: "flex-end", flexShrink: 0, maxWidth: "42%" },
  amount: {
    color: cv.color.text,
    ...cv.type.rowAmount,
    textAlign: "right",
  },
  secondaryAmount: { color: cv.color.secondary, ...cv.type.meta, textAlign: "right" },
  largeAmount: { maxWidth: "100%" },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  statusCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    padding: 18,
  },
  errorCard: { backgroundColor: "#FEF2F2", borderRadius: 12, gap: 12, padding: 18 },
  headerError: { marginBottom: 12 },
  emptyCard: { alignItems: "center", gap: 12, padding: 40 },
  empty: { color: "#64748B", textAlign: "center" },
  error: { color: "#B91C1C", fontWeight: "600" },
  link: { color: "#0F766E", fontWeight: "700", paddingVertical: 8 },
  linkButton: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  footer: { alignItems: "center", justifyContent: "center", minHeight: 56, padding: 14 },
  sheet: { backgroundColor: "#F6F7F9", flex: 1 },
  form: { gap: 16, padding: 16, paddingBottom: 40 },
  section: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 10, padding: 14 },
  sectionTitle: { color: "#111827", fontSize: 16, fontWeight: "700" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  attentionChoices: { gap: 8 },
  choice: {
    backgroundColor: "#F1F5F9",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  choiceSelected: { backgroundColor: "#0F766E" },
  choiceText: { color: "#334155", fontWeight: "600" },
  choiceTextSelected: { color: "#FFFFFF" },
  dateRow: { flexDirection: "row", gap: 10 },
  dateRowLarge: { flexDirection: "column" },
  dateInput: { flex: 1, gap: 5 },
  inputLabel: { color: "#475569", fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  filterRow: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
  },
  filterRowLarge: {
    alignItems: "flex-start",
    flexDirection: "column",
    paddingVertical: 8,
  },
  filterRowLabel: { color: "#111827", fontWeight: "600" },
  filterRowValue: { color: "#64748B", flexShrink: 1, marginLeft: 16 },
  filterRowValueActive: { color: "#0F766E" },
  filterRowValueLarge: { marginLeft: 0 },
  clearButton: { alignItems: "center", justifyContent: "center", minHeight: 48 },
});
