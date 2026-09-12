import { useCallback, useEffect, useState } from "react";
import {
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

import { formatLedgerMoney } from "./format";

type Row = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof getDefaultLedgerReportingRepository>>["listMyLedger"]
  >
>[number];

export function MyLedgerScreen() {
  const largeText = useWindowDimensions().fontScale > 2;
  const { refreshPersonal } = useLedgerReportingRefresh();
  const [period, setPeriod] = useState<MyLedgerPeriod>("YEAR");
  const [rows, setRows] = useState<Row[]>([]);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const repository = await getDefaultLedgerReportingRepository();
    setRows(await repository.listMyLedger(period));
  }, [period]);

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .then(() => {
        const bounds = myLedgerPeriodBounds(period, new Date());
        void refreshPersonal(period, bounds)
          .then(() => {
            setOffline(false);
            return load();
          })
          .catch(() => setOffline(true));
      });
  }, [load, period, refreshPersonal]);

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
            onPress={() => setPeriod(item)}
            style={[styles.segmentItem, period === item && styles.selected]}
          >
            <Text style={styles.segmentText}>
              {item === "30D" ? "30 Days" : item === "YEAR" ? "This Year" : "All Time"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>
        Journey currencies stay separate. Position means paid value minus your exact
        allocated shares before settlement.
      </Text>
      {offline ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          Offline · showing the last SQLite snapshot
        </Text>
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
                {row.startDate ?? "Open start"} – {row.endDate ?? "Open end"}
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
        {rows.length === 0 ? (
          <Text style={styles.empty}>No cached Journey history for this period.</Text>
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
