import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type {
  ReportingBucket,
  ReportingDimension,
  ReportingScope,
} from "@/domain/ledger/reporting";

import { formatLedgerDateFilter, formatLedgerMoney } from "./format";
import { createLatestRequest } from "./latestRequest";
import { formatExpenseCount, ledgerDateFilter } from "./searchFilters";

const dimensions: { key: ReportingDimension; label: string }[] = [
  { key: "CATEGORY", label: "Category" },
  { key: "DAY", label: "Time" },
  { key: "PAYER", label: "Payer" },
  { key: "PARTICIPANT", label: "Participant" },
  { key: "CURRENCY", label: "Currency" },
];

export function LedgerAnalysisScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const params = useLocalSearchParams<{
    journeyId: string;
    memberId: string;
    scope?: ReportingScope;
  }>();
  const initialScope: ReportingScope = params.scope === "GROUP" ? "GROUP" : "MINE";
  const [view, setView] = useState<{
    scope: ReportingScope;
    dimension: ReportingDimension;
    buckets: ReportingBucket[];
    currency: string;
    scale: number;
    filters: { from?: string; to?: string };
    journey:
      | Awaited<
          ReturnType<
            Awaited<
              ReturnType<typeof getDefaultLedgerReportingRepository>
            >["listJourneys"]
          >
        >[number]
      | null;
  } | null>(null);
  const [updating, setUpdating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request] = useState(createLatestRequest);
  const metadata = useRef<Promise<{
    currency: string;
    scale: number;
    journey:
      | Awaited<
          ReturnType<
            Awaited<
              ReturnType<typeof getDefaultLedgerReportingRepository>
            >["listJourneys"]
          >
        >[number]
      | null;
  }> | null>(null);

  const load = useCallback(
    async (
      scope: ReportingScope,
      dimension: ReportingDimension,
      filters: { from?: string; to?: string } = {},
    ) => {
      if (!params.journeyId || !params.memberId) return;
      const id = request.begin();
      setUpdating(true);
      setError(null);
      try {
        const repository = await getDefaultLedgerReportingRepository();
        metadata.current ??= repository.listJourneys().then((journeys) => {
          const journey = journeys.find((item) => item.journeyId === params.journeyId);
          return {
            currency: journey?.settlementCurrency ?? "NZD",
            scale: journey?.settlementScale ?? 2,
            journey: journey ?? null,
          };
        });
        const [money, buckets] = await Promise.all([
          metadata.current,
          repository.analyze(
            {
              journeyId: params.journeyId,
              memberId: params.memberId,
              scope,
              ...filters,
            },
            dimension,
          ),
        ]);
        if (!request.isCurrent(id)) return;
        setView({ scope, dimension, buckets, filters, ...money });
      } catch {
        metadata.current = null;
        if (request.isCurrent(id)) setError("Analysis could not be updated.");
      } finally {
        if (request.isCurrent(id)) setUpdating(false);
      }
    },
    [params.journeyId, params.memberId, request],
  );
  useEffect(() => {
    void Promise.resolve().then(() => load(initialScope, "CATEGORY"));
    return () => {
      request.cancel();
    };
  }, [initialScope, load, request]);

  const scope = view?.scope ?? initialScope;
  const dimension = view?.dimension ?? "CATEGORY";
  const filters = view?.filters ?? {};

  const chooseRange = () => {
    const values = [
      { label: "All trip", preset: "ANY" as const },
      { label: "Today", preset: "TODAY" as const },
      { label: "Yesterday", preset: "YESTERDAY" as const },
      { label: "This Trip", preset: "TRIP" as const },
      { label: "Last 30 days", preset: "LAST_30" as const },
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Analysis range",
        options: [...values.map((item) => item.label), "Cancel"],
        cancelButtonIndex: values.length,
      },
      (index) => {
        const selected = values[index];
        if (!selected) return;
        const next = ledgerDateFilter(selected.preset, view?.journey ?? null, "", "", "");
        if (next) void load(scope, dimension, next);
      },
    );
  };

  const openBucket = (bucket: ReportingBucket) => {
    const key =
      dimension === "CATEGORY"
        ? "category"
        : dimension === "PAYER"
          ? "payerMemberId"
          : dimension === "PARTICIPANT"
            ? "participantMemberId"
            : dimension === "CURRENCY"
              ? "currency"
              : null;
    const nextDay = new Date(`${bucket.key}T00:00:00.000Z`);
    if (dimension === "DAY") nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const label = bucketLabel(dimension, bucket);
    router.push({
      pathname: "/expenses/search",
      params: {
        journeyId: params.journeyId,
        memberId:
          dimension === "PARTICIPANT" && scope === "GROUP" ? bucket.key : params.memberId,
        scope: dimension === "PARTICIPANT" && scope === "GROUP" ? "MINE" : scope,
        authoritative: "1",
        origin: label,
        ...filters,
        ...(key ? { [key]: bucket.key } : {}),
        ...(dimension === "DAY"
          ? { from: `${bucket.key}T00:00:00.000Z`, to: nextDay.toISOString() }
          : {}),
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={chooseRange}
              style={styles.rangeButton}
            >
              <Text style={styles.rangeAction}>Range</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View accessibilityRole="tablist" style={styles.segment}>
          {(["MINE", "GROUP"] as const).map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === item }}
              key={item}
              onPress={() => void load(item, dimension, filters)}
              style={[styles.segmentItem, scope === item && styles.selected]}
            >
              <Text style={styles.segmentText}>{item === "MINE" ? "Mine" : "Group"}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroller}
          contentContainerStyle={styles.tabs}
        >
          {dimensions.map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: dimension === item.key }}
              key={item.key}
              onPress={() => void load(scope, item.key, filters)}
              style={[styles.tab, dimension === item.key && styles.tabSelected]}
            >
              <Text style={styles.tabText}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.note}>
          {filters.from ? formatLedgerDateFilter(filters.from, filters.to) : "All trip"}
          {" · Every bucket opens its exact Expenses."}
        </Text>
        {updating ? (
          <View style={styles.progress}>
            <ActivityIndicator />
            <Text accessibilityLiveRegion="polite" style={styles.note}>
              Updating analysis…
            </Text>
          </View>
        ) : null}
        {error ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void load(scope, dimension, filters)}
          >
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error} Tap to try again.
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.surface}>
          {(view?.buckets ?? []).map((bucket) => {
            const label = bucketLabel(dimension, bucket, false);
            return (
              <Pressable
                accessibilityLabel={`${label}, ${formatLedgerMoney(bucket.totalMinor, view?.currency ?? "NZD", view?.scale ?? 2)}, ${formatExpenseCount(bucket.expenseCount)}`}
                accessibilityRole="button"
                key={bucket.key}
                onPress={() => openBucket(bucket)}
                style={[styles.row, largeText && styles.stack]}
              >
                <View style={styles.grow}>
                  <Text style={styles.title}>{label}</Text>
                  <Text style={styles.meta}>
                    {formatExpenseCount(bucket.expenseCount)}
                  </Text>
                </View>
                <Text style={styles.amount}>
                  {formatLedgerMoney(
                    bucket.totalMinor,
                    view?.currency ?? "NZD",
                    view?.scale ?? 2,
                  )}
                </Text>
              </Pressable>
            );
          })}
          {!updating && (view?.buckets.length ?? 0) === 0 ? (
            <Text style={styles.empty}>
              No Expenses with a confirmed exchange value for this view.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </>
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
  segment: {
    backgroundColor: "#E5E7EB",
    borderRadius: 9,
    flexDirection: "row",
    padding: 2,
  },
  segmentItem: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  selected: { backgroundColor: "#FFFFFF" },
  segmentText: { color: "#111827", fontWeight: "600" },
  tabs: { gap: 8 },
  tabScroller: { flexGrow: 0 },
  tab: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  tabSelected: { borderColor: "#087E68", borderWidth: 2 },
  tabText: { color: "#334155", fontWeight: "600" },
  note: { color: "#64748B", fontSize: 13 },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 10, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 64,
    padding: 14,
  },
  grow: { flex: 1 },
  title: { color: "#111827", fontSize: 16, fontWeight: "600" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 3 },
  amount: { color: "#111827", fontWeight: "700" },
  progress: { alignItems: "center", flexDirection: "row", gap: 8 },
  error: { color: "#B91C1C", fontWeight: "600" },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  empty: { color: "#64748B", padding: 30, textAlign: "center" },
  rangeAction: { color: "#0F766E", fontWeight: "700" },
  rangeButton: { justifyContent: "center", minHeight: 44, paddingHorizontal: 8 },
});

function bucketLabel(
  dimension: ReportingDimension,
  bucket: ReportingBucket,
  includeDimension = true,
) {
  if (dimension === "DAY") {
    const nextDay = new Date(`${bucket.key}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return formatLedgerDateFilter(`${bucket.key}T00:00:00.000Z`, nextDay.toISOString());
  }
  return includeDimension
    ? `${dimensions.find((item) => item.key === dimension)?.label}: ${bucket.label}`
    : bucket.label;
}
