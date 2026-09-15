import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";

import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import {
  myLedgerPeriodBounds,
  type MyLedgerPeriod,
} from "@/domain/ledger/journeyContext";
import { useLedgerReportingRefresh } from "@/hooks/useLedgerReportingRefresh";

import { formatLedgerDateRange, formatLedgerMoney } from "./format";
import { createLatestRequest } from "./latestRequest";

type Row = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getDefaultLedgerReportingRepository>>["listMyLedger"]
  >
>[number];

export function MyLedgerScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { refreshPersonal } = useLedgerReportingRefresh();
  const [view, setView] = useState<{ period: MyLedgerPeriod; rows: Row[] } | null>(null);
  const [offline, setOffline] = useState(false);
  const [updating, setUpdating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request] = useState(createLatestRequest);

  const load = useCallback(
    async (period: MyLedgerPeriod) => {
      const id = request.begin();
      setUpdating(true);
      setError(null);
      try {
        const repository = await getDefaultLedgerReportingRepository();
        const rows = await repository.listMyLedger(period);
        if (!request.isCurrent(id)) return;
        setView({ period, rows });
        setUpdating(false);
        const bounds = myLedgerPeriodBounds(period, new Date());
        try {
          await refreshPersonal(period, bounds);
          const refreshed = await repository.listMyLedger(period);
          if (!request.isCurrent(id)) return;
          setView({ period, rows: refreshed });
          setOffline(false);
        } catch {
          if (request.isCurrent(id)) setOffline(true);
        }
      } catch {
        if (request.isCurrent(id)) {
          setError("My Ledger could not be loaded. Tap to try again.");
          setUpdating(false);
        }
      }
    },
    [refreshPersonal, request],
  );

  useEffect(() => {
    void Promise.resolve().then(() => load("YEAR"));
    return () => {
      request.cancel();
    };
  }, [load, request]);

  const period = view?.period ?? "YEAR";
  const rows = view?.rows ?? [];

  const openJourney = async (journeyId: string) => {
    await (await getDefaultLedgerReportingRepository()).selectJourney(journeyId);
    router.replace("/expenses");
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View accessibilityRole="tablist" style={styles.segment}>
        {(["30D", "YEAR", "ALL"] as const).map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: period === item }}
            key={item}
            onPress={() => void load(item)}
            style={[styles.segmentItem, period === item && styles.selected]}
          >
            <Text style={styles.segmentText}>
              {item === "30D" ? "30 Days" : item === "YEAR" ? "This Year" : "All Time"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>
        Journey currencies stay separate. Before settling, a positive amount means you
        paid more than your share; a negative amount means you paid less.
      </Text>
      {offline ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          Offline · showing saved Ledger data
        </Text>
      ) : null}
      {updating ? (
        <View style={styles.progress}>
          <ActivityIndicator />
          <Text accessibilityLiveRegion="polite" style={styles.note}>
            Updating My Ledger…
          </Text>
        </View>
      ) : null}
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void load(period)}
          style={styles.retry}
        >
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.surface}>
        {rows.map((row) => (
          <Pressable
            accessibilityLabel={`${row.title}, my spending ${formatLedgerMoney(row.mySpendMinor, row.currency, row.scale)}, pre-settlement position ${formatLedgerMoney(row.positionMinor, row.currency, row.scale)}`}
            accessibilityRole="button"
            key={row.journeyId}
            onPress={() => void openJourney(row.journeyId)}
            style={[styles.row, largeText && styles.stack]}
          >
            <View style={styles.grow}>
              <Text style={styles.title}>{row.title}</Text>
              <Text style={styles.meta}>
                {formatLedgerDateRange(row.startDate, row.endDate)}
              </Text>
              <Text style={styles.meta}>
                My spending {formatLedgerMoney(row.mySpendMinor, row.currency, row.scale)}{" "}
                · Paid {formatLedgerMoney(row.paidMinor, row.currency, row.scale)}
              </Text>
              {row.unvaluedCount || row.conflictCount ? (
                <Text style={styles.warning}>
                  {row.unvaluedCount} unvalued · {row.conflictCount} conflicts
                </Text>
              ) : null}
            </View>
            <View style={largeText ? styles.largePosition : undefined}>
              <Text style={styles.position}>
                {formatLedgerMoney(row.positionMinor, row.currency, row.scale)}
              </Text>
              <Text style={styles.positionLabel}>Pre-settlement</Text>
            </View>
          </Pressable>
        ))}
        {!updating && rows.length === 0 ? (
          <Text style={styles.empty}>No Journey history for this period.</Text>
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
  segmentText: { color: "#111827", fontWeight: "600", textAlign: "center" },
  note: { color: "#475569", fontSize: 14, lineHeight: 20 },
  offline: { color: "#7C5B00", fontWeight: "600" },
  progress: { alignItems: "center", flexDirection: "row", gap: 8 },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: { justifyContent: "center", minHeight: 44 },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 10, overflow: "hidden" },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 92,
    padding: 14,
  },
  grow: { flex: 1 },
  title: { color: "#111827", fontSize: 17, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 4 },
  warning: { color: "#B45309", fontSize: 12, fontWeight: "700", marginTop: 4 },
  position: { color: "#111827", fontWeight: "700", textAlign: "right" },
  positionLabel: { color: "#64748B", fontSize: 11, marginTop: 3, textAlign: "right" },
  stack: { alignItems: "flex-start", flexDirection: "column" },
  largePosition: { alignSelf: "stretch" },
  empty: { color: "#64748B", padding: 30, textAlign: "center" },
});
