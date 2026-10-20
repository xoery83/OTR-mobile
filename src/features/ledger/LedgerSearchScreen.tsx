import { systemMessage, categoryLabel } from "@/ui/domainLabels";
import { UiTextInput as TextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
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
  useWindowDimensions,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { visual as cv } from "@/ui/visual";
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
import { SheetHeader } from "@/components/SheetHeader";
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
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
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
        if (request.isCurrent(id)) setError(t("search.updateFailed"));
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
        if (active) setError(t("search.filtersUnavailable"));
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
      if (moreRequest.isCurrent(id)) setMoreError(t("search.moreFailed"));
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
        accessibilityLabel={t("search.rowDescription", {
          title: item.title,
          kind: group ? t("search.totalLower") : t("search.share"),
          amount: amounts.primary,
          original: amounts.secondary
            ? t("search.originalDescription", { amount: amounts.secondary })
            : "",
          attention: attention ? `, ${attention}` : "",
        })}
        accessibilityRole="button"
        onPress={() => router.push(`/expenses/expense/${item.id}`)}
        style={[styles.row, largeText && styles.stack]}
      >
        <View style={styles.grow}>
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.title}>
            {item.title}
          </Text>
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.meta}>
            {categoryLabel(item.category)} · {formatLedgerDate(item.occurredAt)}
            {group ? t("search.payerPaid", { name: item.payerName }) : ""}
          </Text>
          {group ? (
            <Text maxFontSizeMultiplier={2} style={styles.meta}>
              {item.participantCount}{" "}
              {item.participantCount === 1 ? t("search.person") : t("search.people")}
              {item.unevenSplit ? t("search.uneven") : ""}
            </Text>
          ) : hasDistinctShare ? (
            <Text maxFontSizeMultiplier={2} style={styles.meta}>
              {t("search.total")}{" "}
              {formatLedgerMoney(
                item.originalMinor,
                item.originalCurrency,
                item.originalScale,
              )}
              {item.participantCount > 1
                ? t("search.splitCount", { count: item.participantCount })
                : ""}
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
            placeholder={t("search.journeyValueUnavailable")}
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
          headerTitle: t("search.search"),
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t("search.filterAction", {
            active: filterCount ? t("search.activeFilters", { count: filterCount }) : "",
          })}
          icon="line.3.horizontal.decrease"
          onPress={() => setFilterOpen(true)}
        >
          {filterCount ? (
            <Stack.Toolbar.Badge
              style={{
                backgroundColor: colors.accent,
                color: colors.onAccent,
                fontSize: 10,
                fontWeight: "700",
              }}
            >
              {String(filterCount)}
            </Stack.Toolbar.Badge>
          ) : null}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <TextInput
        accessibilityLabel={t("ledger.searchExpenses")}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={setQueryText}
        placeholder={t("ledger.searchExpenses")}
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
                {systemMessage(error)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  void load(retryRequest.current.filters, retryRequest.current.query)
                }
                style={styles.linkButton}
              >
                <Text style={styles.link}>{t("common.tryAgain")}</Text>
              </Pressable>
            </View>
          ) : resultsPending ? (
            <StatusCard busy text={t("search.updatingResults")} />
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.empty}>{t("search.noMatches")}</Text>
              {filterCount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void applyFilters({})}
                  style={styles.linkButton}
                >
                  <Text style={styles.link}>{t("search.clearFilters")}</Text>
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
              <Text style={styles.error}>
                {moreError} {t("common.tryAgain")}
              </Text>
            </Pressable>
          ) : null
        }
        ListHeaderComponent={
          !resultsPending && view ? (
            <>
              {error ? (
                <View style={[styles.errorCard, styles.headerError]}>
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {systemMessage(error)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      void load(retryRequest.current.filters, retryRequest.current.query)
                    }
                    style={styles.linkButton}
                  >
                    <Text style={styles.link}>{t("common.tryAgain")}</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.summary}>
                <Text maxFontSizeMultiplier={2} style={styles.origin}>
                  {paidMemberId
                    ? t("search.paidByName", {
                        name:
                          options.members.find((item) => item.id === paidMemberId)
                            ?.label ?? t("search.selectedTraveller"),
                      })
                    : searchView.type === "person"
                      ? t("search.memberSpending", {
                          name:
                            options.members.find((item) => item.id === memberId)?.label ??
                            t("common.traveller"),
                        })
                      : scope === "GROUP"
                        ? t("search.groupSpending")
                        : t("search.mySpending")}
                  {params.origin ? ` · ${params.origin}` : ""}
                </Text>
                <Text
                  accessibilityLiveRegion="polite"
                  maxFontSizeMultiplier={2}
                  style={styles.summaryText}
                >
                  {formatExpenseCount(view.resultCount).toLowerCase()}
                  {view.resultCount !== view.summary.expenseCount
                    ? t("search.includedCount", { count: view.summary.expenseCount })
                    : ""}
                  {view.summary.unresolvedRateCount
                    ? t("search.withoutValueCount", {
                        count: view.summary.unresolvedRateCount,
                      })
                    : ""}
                  {view.summary.openConflictCount
                    ? t(
                        view.summary.openConflictCount === 1
                          ? "search.conflictCountOne"
                          : "search.conflictCount",
                        { count: view.summary.openConflictCount },
                      )
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
                    {t("common.updating")}
                  </Text>
                ) : authoritativeOnly ? (
                  <Text maxFontSizeMultiplier={2} style={styles.context}>
                    {t("search.matchesAnalysis")}
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
    options.members.find((item) => item.id === id)?.label ??
    t("search.selectedTraveller");
  return [
    filters.from && {
      key: "from" as const,
      label: searchDateLabel(filters.from, filters.to),
    },
    filters.category && {
      key: "category" as const,
      label: t("search.categoryLabel", { name: categoryLabel(filters.category!) }),
    },
    filters.categories?.length && {
      key: "categories" as const,
      label: t("search.categoriesLabel", { names: filters.categories!.join(", ") }),
    },
    filters.analysisState && {
      key: "analysisState" as const,
      label:
        filters.analysisState === "INCLUDED"
          ? t("search.included")
          : t("search.notIncluded"),
    },
    filters.payerMemberId && {
      key: "payerMemberId" as const,
      label: t("search.payerLabel", { name: member(filters.payerMemberId) }),
    },
    filters.participantMemberId && {
      key: "participantMemberId" as const,
      label: t("search.includesLabel", { name: member(filters.participantMemberId) }),
    },
    filters.currency && {
      key: "currency" as const,
      label: t("search.currencyLabel", { currency: filters.currency! }),
    },
    filters.valuation === "RATE_REQUIRED" && {
      key: "valuation" as const,
      label: t("search.rateRequired"),
    },
    filters.valuation === "VALUED" && {
      key: "valuation" as const,
      label: t("search.hasValue"),
    },
    filters.conflict === "OPEN" && {
      key: "conflict" as const,
      label: t("search.conflictReview"),
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
  useUiLocale();
  const styles = useThemedStyles(createStyles);
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
        options: [...values.map((item) => item.label), t("common.cancel")],
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
      setDateError(t("search.invalidDates"));
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
        <SheetHeader
          leftLabel={page === "main" ? t("common.cancel") : t("common.back")}
          onLeft={page === "main" ? onCancel : () => setPage("main")}
          onRight={page === "main" ? () => void apply() : () => setPage("main")}
          rightDisabled={applying}
          rightLabel={
            page === "main"
              ? applying
                ? t("common.applying")
                : t("common.apply")
              : t("common.done")
          }
          title={
            page === "main"
              ? t("search.filters")
              : page === "currency"
                ? t("navigation.currency")
                : t("ledger.needsAttention")
          }
        />
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          {page === "main" ? (
            <>
              <FilterSection title={t("search.time")}>
                <View style={styles.wrap}>
                  {(
                    [
                      ["ANY", t("search.all")],
                      ["TODAY", t("search.today")],
                      ["YESTERDAY", t("search.yesterday")],
                      ["LAST_30", t("search.last30")],
                      ["RANGE", t("search.custom")],
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
                      label={t("search.start")}
                      onChange={setRangeStart}
                      value={rangeStart}
                    />
                    <DateInput
                      label={t("search.end")}
                      onChange={setRangeEnd}
                      value={rangeEnd}
                    />
                  </View>
                ) : null}
                {dateError ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {dateError}
                  </Text>
                ) : null}
              </FilterSection>
              <FilterSection title={t("search.details")}>
                <FilterRow
                  active={!!draft.category}
                  label={t("search.category")}
                  onPress={() =>
                    choose(
                      t("search.category"),
                      [
                        { label: t("common.any"), value: undefined },
                        ...options.categories.map((value) => ({
                          label: categoryLabel(value),
                          value,
                        })),
                      ],
                      "category",
                    )
                  }
                  value={draft.category ? categoryLabel(draft.category) : t("common.any")}
                />
                {!lockedPayer ? (
                  <FilterRow
                    active={!!draft.payerMemberId}
                    label={t("search.paidBy")}
                    onPress={() =>
                      choose(t("search.paidBy"), memberChoices(options), "payerMemberId")
                    }
                    value={optionLabel(options, draft.payerMemberId)}
                  />
                ) : null}
                {scope === "GROUP" ? (
                  <FilterRow
                    active={!!draft.participantMemberId}
                    label={t("search.participant")}
                    onPress={() =>
                      choose(
                        t("search.participant"),
                        memberChoices(options),
                        "participantMemberId",
                      )
                    }
                    value={optionLabel(options, draft.participantMemberId)}
                  />
                ) : null}
              </FilterSection>
              <FilterSection title={t("search.more")}>
                <FilterRow
                  active={!!draft.currency}
                  label={t("navigation.currency")}
                  onPress={() => setPage("currency")}
                  value={draft.currency ?? t("common.any")}
                />
                <FilterRow
                  active={!!draft.valuation || !!draft.conflict}
                  label={t("ledger.needsAttention")}
                  onPress={() => setPage("attention")}
                  value={
                    [
                      draft.valuation === "RATE_REQUIRED"
                        ? t("search.journeyValue")
                        : null,
                      draft.conflict === "OPEN" ? t("search.conflict") : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || t("search.none")
                  }
                />
              </FilterSection>
            </>
          ) : page === "currency" ? (
            <FilterSection title={t("navigation.currency")}>
              {[
                { label: t("common.any"), value: undefined },
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
            <FilterSection title={t("ledger.needsAttention")}>
              <View style={styles.attentionChoices}>
                <Choice
                  label={t("search.journeyValueUnavailable")}
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
                  label={t("search.conflictReview")}
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
              <Text style={styles.error}>{t("search.clearAll")}</Text>
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
    { label: t("common.any"), value: undefined },
    ...options.members.map((item) => ({ label: item.label, value: item.id })),
  ];
}

function optionLabel(options: Options, id?: string) {
  return id
    ? (options.members.find((item) => item.id === id)?.label ??
        t("search.selectedTraveller"))
    : "Any";
}

function FilterSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
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
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.dateInput}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={t("search.dateLabel", { label })}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        onChangeText={onChange}
        placeholder={t("search.dateFormat")}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityHint={t("search.removeFilter")}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.chip}
    >
      <Text style={styles.chipText}>{label} ×</Text>
    </Pressable>
  );
}

function StatusCard({ busy, text }: { busy?: boolean; text: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statusCard}>
      {busy ? <ActivityIndicator /> : null}
      <Text accessibilityLiveRegion="polite" style={styles.summaryText}>
        {text}
      </Text>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    flex: { backgroundColor: colors.background, flex: 1 },
    search: {
      backgroundColor: colors.surface,
      borderBottomColor: colors.separator,
      borderBottomWidth: 1,
      color: colors.textPrimary,
      fontSize: 17,
      minHeight: 54,
      paddingHorizontal: 16,
    },
    chipBar: { backgroundColor: colors.background, flexGrow: 0, maxHeight: 58 },
    chipBarLarge: { maxHeight: 96 },
    chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 7 },
    chip: {
      backgroundColor: colors.selected,
      borderRadius: 18,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    chipText: { color: colors.accent, fontWeight: "700" },
    content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
    summary: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      gap: 4,
      marginBottom: 12,
      padding: 14,
    },
    origin: { color: colors.accent, fontWeight: "700" },
    summaryText: { color: colors.textSecondary, fontSize: 13 },
    context: { color: colors.textSecondary, fontSize: 12 },
    total: { color: colors.textPrimary, fontSize: 24, fontWeight: "800" },
    largeTotal: { fontSize: 20 },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 10,
      minHeight: 76,
      padding: 14,
    },
    grow: { flex: 1, minWidth: 0 },
    title: { color: colors.textPrimary, ...cv.type.row },
    meta: { color: colors.textSecondary, ...cv.type.meta, marginTop: 3 },
    warning: {
      color: colors.warningIndicator,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 3,
    },
    amountBlock: { alignItems: "flex-end", flexShrink: 0, maxWidth: "42%" },
    amount: {
      color: colors.textPrimary,
      ...cv.type.rowAmount,
      textAlign: "right",
    },
    secondaryAmount: { color: colors.textSecondary, ...cv.type.meta, textAlign: "right" },
    largeAmount: { maxWidth: "100%" },
    stack: { alignItems: "flex-start", flexDirection: "column" },
    statusCard: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      flexDirection: "row",
      gap: 8,
      padding: 18,
    },
    errorCard: {
      backgroundColor: colors.destructiveSurface,
      borderRadius: 12,
      gap: 12,
      padding: 18,
    },
    headerError: { marginBottom: 12 },
    emptyCard: { alignItems: "center", gap: 12, padding: 40 },
    empty: { color: colors.textSecondary, textAlign: "center" },
    error: { color: colors.destructive, fontWeight: "600" },
    link: { color: colors.accent, fontWeight: "700", paddingVertical: 8 },
    linkButton: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
    footer: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 56,
      padding: 14,
    },
    sheet: { backgroundColor: colors.background, flex: 1 },
    form: { gap: 16, padding: 16, paddingBottom: 40 },
    section: { backgroundColor: colors.surface, borderRadius: 12, gap: 10, padding: 14 },
    sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    attentionChoices: { gap: 8 },
    choice: {
      backgroundColor: colors.groupedBackground,
      borderRadius: 18,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    choiceSelected: { backgroundColor: colors.accent },
    choiceText: { color: colors.textTertiary, fontWeight: "600" },
    choiceTextSelected: { color: colors.onAccent },
    dateRow: { flexDirection: "row", gap: 10 },
    dateRowLarge: { flexDirection: "column" },
    dateInput: { flex: 1, gap: 5 },
    inputLabel: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
    input: {
      backgroundColor: colors.groupedBackground,
      borderColor: colors.separator,
      borderRadius: 8,
      borderWidth: 1,
      color: colors.textPrimary,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: 10,
    },
    filterRow: {
      alignItems: "center",
      borderBottomColor: colors.separator,
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
    filterRowLabel: { color: colors.textPrimary, fontWeight: "600" },
    filterRowValue: { color: colors.textSecondary, flexShrink: 1, marginLeft: 16 },
    filterRowValueActive: { color: colors.accent },
    filterRowValueLarge: { marginLeft: 0 },
    clearButton: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  });
