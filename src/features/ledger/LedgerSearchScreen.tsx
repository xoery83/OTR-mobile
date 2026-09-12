import { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type { LedgerReportListItem } from "@/data/repositories/ledgerReportingRepository";
import type {
  ReportingAggregate,
  ReportingFilters,
  ReportingScope,
} from "@/domain/ledger/reporting";

import { formatLedgerMoney } from "./format";

type Options = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getDefaultLedgerReportingRepository>>["listFilterOptions"]
  >
>;

export function LedgerSearchScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const params = useLocalSearchParams<{
    journeyId: string;
    memberId: string;
    scope?: ReportingScope;
    category?: string;
    payerMemberId?: string;
    participantMemberId?: string;
    currency?: string;
    from?: string;
    to?: string;
    authoritative?: string;
  }>();
  const scope: ReportingScope = params.scope === "GROUP" ? "GROUP" : "MINE";
  const authoritativeOnly = params.authoritative === "1";
  const [filters, setFilters] = useState<ReportingFilters>({
    category: params.category,
    payerMemberId: params.payerMemberId,
    participantMemberId: params.participantMemberId,
    currency: params.currency,
    from: params.from,
    to: params.to,
  });
  const [queryText, setQueryText] = useState("");
  const [rows, setRows] = useState<LedgerReportListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [summary, setSummary] = useState<ReportingAggregate | null>(null);
  const [settlementMoney, setSettlementMoney] = useState({ currency: "NZD", scale: 2 });
  const [options, setOptions] = useState<Options>({
    categories: [],
    currencies: [],
    members: [],
  });

  const load = useCallback(async () => {
    if (!params.journeyId || !params.memberId) return;
    const repository = await getDefaultLedgerReportingRepository();
    const reportQuery = {
      journeyId: params.journeyId,
      memberId: params.memberId,
      scope,
      authoritativeOnly,
      ...filters,
      query: queryText,
    };
    const [nextRows, nextSummary, nextOptions, journeys] = await Promise.all([
      repository.listExpenses(reportQuery, 100),
      repository.summarize(reportQuery),
      repository.listFilterOptions(params.journeyId),
      repository.listJourneys(),
    ]);
    setRows(nextRows);
    setHasMore(nextRows.length === 100);
    setSummary(nextSummary);
    setOptions(nextOptions);
    const journey = journeys.find((item) => item.journeyId === params.journeyId);
    if (journey)
      setSettlementMoney({
        currency: journey.settlementCurrency,
        scale: journey.settlementScale,
      });
  }, [authoritativeOnly, filters, params.journeyId, params.memberId, queryText, scope]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const loadMore = async () => {
    if (!params.journeyId || !params.memberId) return;
    const repository = await getDefaultLedgerReportingRepository();
    const nextRows = await repository.listExpenses(
      {
        journeyId: params.journeyId,
        memberId: params.memberId,
        scope,
        authoritativeOnly,
        ...filters,
        query: queryText,
      },
      100,
      rows.length,
    );
    setRows((current) => [...current, ...nextRows]);
    setHasMore(nextRows.length === 100);
  };

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
        if (selected) setFilters((current) => ({ ...current, [key]: selected.value }));
      },
    );
  };

  const memberChoices = [
    { label: "Any", value: undefined },
    ...options.members.map((member) => ({ label: member.label, value: member.id })),
  ];
  return (
    <View style={styles.flex}>
      <TextInput
        accessibilityLabel="Search Expenses"
        autoCapitalize="none"
        onChangeText={setQueryText}
        placeholder="Title, description, category or traveller"
        style={styles.search}
        value={queryText}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label={filters.from ? "Last 30 days" : "Any date"}
            onPress={() =>
              setFilters((current) =>
                current.from
                  ? { ...current, from: undefined, to: undefined }
                  : {
                      ...current,
                      from: new Date(Date.now() - 30 * 86400000).toISOString(),
                      to: new Date().toISOString(),
                    },
              )
            }
          />
          <Chip
            label={filters.category ?? "Category"}
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
          />
          <Chip
            label={
              filters.payerMemberId
                ? `Payer: ${options.members.find((item) => item.id === filters.payerMemberId)?.label ?? "Selected"}`
                : "Payer"
            }
            onPress={() => choose("Payer", memberChoices, "payerMemberId")}
          />
          <Chip
            label={
              filters.participantMemberId
                ? `Member: ${options.members.find((item) => item.id === filters.participantMemberId)?.label ?? "Selected"}`
                : "Member"
            }
            onPress={() => choose("Participant", memberChoices, "participantMemberId")}
          />
          <Chip
            label={filters.currency ?? "Currency"}
            onPress={() =>
              choose(
                "Currency",
                [
                  { label: "Any", value: undefined },
                  ...options.currencies.map((value) => ({ label: value, value })),
                ],
                "currency",
              )
            }
          />
          <Chip
            label={filters.businessStatus ?? "Business"}
            onPress={() =>
              choose(
                "Business status",
                ["Any", "ACCEPTED", "RATE_REQUIRED", "DRAFT", "DELETED"].map((value) => ({
                  label: value,
                  value: value === "Any" ? undefined : value,
                })),
                "businessStatus",
              )
            }
          />
          <Chip
            label={filters.syncStatus ?? "Sync"}
            onPress={() =>
              choose(
                "Sync status",
                [
                  "Any",
                  "SYNCED",
                  "PENDING_CREATE",
                  "PENDING_UPDATE",
                  "PENDING_DELETE",
                  "FAILED",
                  "CONFLICT",
                ].map((value) => ({
                  label: value,
                  value: value === "Any" ? undefined : value,
                })),
                "syncStatus",
              )
            }
          />
          <Chip
            label={
              filters.conflict === "OPEN"
                ? "Open conflict"
                : filters.conflict === "NONE"
                  ? "No conflict"
                  : "Conflict"
            }
            onPress={() =>
              choose(
                "Conflict",
                [
                  { label: "Any", value: undefined },
                  { label: "Open", value: "OPEN" },
                  { label: "None", value: "NONE" },
                ],
                "conflict",
              )
            }
          />
          <Chip
            label={
              filters.valuation === "RATE_REQUIRED"
                ? "Rate required"
                : filters.valuation === "VALUED"
                  ? "Valued"
                  : "Valuation"
            }
            onPress={() =>
              choose(
                "Valuation",
                [
                  { label: "Any", value: undefined },
                  { label: "Valued", value: "VALUED" },
                  { label: "Rate required", value: "RATE_REQUIRED" },
                ],
                "valuation",
              )
            }
          />
          <Chip
            label={
              filters.receipt === "HAS"
                ? "Has receipt"
                : filters.receipt === "HAS_NOT"
                  ? "No receipt"
                  : "Receipt"
            }
            onPress={() =>
              choose(
                "Receipt",
                [
                  { label: "Any", value: undefined },
                  { label: "Has receipt", value: "HAS" },
                  { label: "No receipt", value: "HAS_NOT" },
                ],
                "receipt",
              )
            }
          />
        </ScrollView>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {summary?.expenseCount ?? 0} included · {summary?.unresolvedRateCount ?? 0}{" "}
            unvalued · {summary?.openConflictCount ?? 0} conflicts
          </Text>
          <Text style={[styles.total, largeText && styles.largeTotal]}>
            {summary
              ? formatLedgerMoney(
                  summary.totalMinor,
                  settlementMoney.currency,
                  settlementMoney.scale,
                )
              : "—"}
          </Text>
        </View>
        <View style={styles.surface}>
          {rows.map((row) => (
            <Pressable
              accessibilityRole="button"
              key={row.id}
              onPress={() => router.push(`/expenses/expense/${row.id}`)}
              style={[styles.row, largeText && styles.stack]}
            >
              <View style={styles.grow}>
                <Text style={styles.title}>{row.title}</Text>
                <Text style={styles.meta}>
                  {row.category} · {row.occurredAt.slice(0, 10)} · {row.payerName}
                </Text>
                {!row.isAuthoritative ? (
                  <Text style={styles.warning}>
                    {row.hasOpenConflict
                      ? "Open conflict"
                      : row.businessStatus === "RATE_REQUIRED"
                        ? "Rate required"
                        : "Excluded"}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.amount}>
                {formatLedgerMoney(
                  row.originalMinor,
                  row.originalCurrency,
                  row.originalScale,
                )}
              </Text>
            </Pressable>
          ))}
          {rows.length === 0 ? (
            <Text style={styles.empty}>No matching Expenses.</Text>
          ) : null}
          {hasMore ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMore()}
              style={styles.more}
            >
              <Text style={styles.moreText}>Load more Expenses</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F6F7F9" },
  search: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: 1,
    color: "#111827",
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  chips: { gap: 8 },
  chip: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  chipText: { color: "#334155", fontWeight: "600" },
  summary: { backgroundColor: "#FFFFFF", borderRadius: 10, gap: 4, padding: 14 },
  summaryText: { color: "#64748B", fontSize: 13 },
  total: { color: "#111827", fontSize: 24, fontWeight: "800" },
  largeTotal: { fontSize: 20 },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 10, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 14,
  },
  grow: { flex: 1 },
  title: { color: "#111827", fontSize: 16, fontWeight: "600" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 3 },
  warning: { color: "#B45309", fontSize: 12, fontWeight: "700", marginTop: 3 },
  amount: { color: "#111827", fontWeight: "700" },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  empty: { color: "#64748B", padding: 30, textAlign: "center" },
  more: { alignItems: "center", minHeight: 48, padding: 14 },
  moreText: { color: "#2563EB", fontWeight: "700" },
});
