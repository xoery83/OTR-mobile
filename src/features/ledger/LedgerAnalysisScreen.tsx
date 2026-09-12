import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import type {
  ReportingBucket,
  ReportingDimension,
  ReportingScope,
} from "@/domain/ledger/reporting";

import { formatLedgerMoney } from "./format";

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
  const [scope, setScope] = useState<ReportingScope>(
    params.scope === "GROUP" ? "GROUP" : "MINE",
  );
  const [dimension, setDimension] = useState<ReportingDimension>("CATEGORY");
  const [buckets, setBuckets] = useState<ReportingBucket[]>([]);
  const [currency, setCurrency] = useState("NZD");
  const [scale, setScale] = useState(2);

  const load = useCallback(async () => {
    if (!params.journeyId || !params.memberId) return;
    const repository = await getDefaultLedgerReportingRepository();
    const journeys = await repository.listJourneys();
    const journey = journeys.find((item) => item.journeyId === params.journeyId);
    setCurrency(journey?.settlementCurrency ?? "NZD");
    setScale(journey?.settlementScale ?? 2);
    setBuckets(
      await repository.analyze(
        { journeyId: params.journeyId, memberId: params.memberId, scope },
        dimension,
      ),
    );
  }, [dimension, params.journeyId, params.memberId, scope]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

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
    router.push({
      pathname: "/expenses/search",
      params: {
        journeyId: params.journeyId,
        memberId:
          dimension === "PARTICIPANT" && scope === "GROUP" ? bucket.key : params.memberId,
        scope: dimension === "PARTICIPANT" && scope === "GROUP" ? "MINE" : scope,
        authoritative: "1",
        ...(key ? { [key]: bucket.key } : {}),
        ...(dimension === "DAY"
          ? { from: `${bucket.key}T00:00:00.000Z`, to: nextDay.toISOString() }
          : {}),
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View accessibilityRole="tablist" style={styles.segment}>
        {(["MINE", "GROUP"] as const).map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === item }}
            key={item}
            onPress={() => setScope(item)}
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
            onPress={() => setDimension(item.key)}
            style={[styles.tab, dimension === item.key && styles.tabSelected]}
          >
            <Text style={styles.tabText}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.note}>
        Every bucket opens the exact Expense set used to calculate it.
      </Text>
      <View style={styles.surface}>
        {buckets.map((bucket) => (
          <Pressable
            accessibilityLabel={`${bucket.label}, ${formatLedgerMoney(bucket.totalMinor, currency, scale)}, ${bucket.expenseCount} Expenses`}
            accessibilityRole="button"
            key={bucket.key}
            onPress={() => openBucket(bucket)}
            style={[styles.row, largeText && styles.stack]}
          >
            <View style={styles.grow}>
              <Text style={styles.title}>{bucket.label}</Text>
              <Text style={styles.meta}>{bucket.expenseCount} Expenses</Text>
            </View>
            <Text style={styles.amount}>
              {formatLedgerMoney(bucket.totalMinor, currency, scale)}
            </Text>
          </Pressable>
        ))}
        {buckets.length === 0 ? (
          <Text style={styles.empty}>
            No authoritative valued Expenses for this view.
          </Text>
        ) : null}
      </View>
    </ScrollView>
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
  stack: { alignItems: "flex-start", flexDirection: "column" },
  empty: { color: "#64748B", padding: 30, textAlign: "center" },
});
