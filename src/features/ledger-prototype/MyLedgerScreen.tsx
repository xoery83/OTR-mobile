import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type Href, router } from "expo-router";

import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import { formatMoney, Icon, PrototypeBanner, ValueBlock } from "./ui";

type Period = "30D" | "YEAR" | "ALL";

export function MyLedgerScreen() {
  const { journeys, selectJourney } = useLedgerPrototype();
  const [period, setPeriod] = useState<Period>("YEAR");

  const openJourney = (id: string) => {
    selectJourney(id);
    router.back();
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PrototypeBanner />
      <View accessibilityRole="tablist" style={styles.segmented}>
        {(["30D", "YEAR", "ALL"] as const).map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: period === item }}
            key={item}
            onPress={() => setPeriod(item)}
            style={[styles.segment, period === item ? styles.selected : null]}
          >
            <Text
              style={[styles.segmentText, period === item ? styles.selectedText : null]}
            >
              {item === "30D" ? "30 Days" : item === "YEAR" ? "This Year" : "All Time"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ValueBlock
        detail="Your allocated shares across Journeys · NZD report view"
        label="MY SPENDING"
        value={
          period === "30D" ? "$2,128.40" : period === "YEAR" ? "$4,497.80" : "$12,846.55"
        }
      />
      <View style={styles.twoColumn}>
        <ValueBlock
          detail="Actual outlay"
          label="I PAID"
          value="$7,362.10"
          style={styles.column}
        />
        <ValueBlock
          detail="Never netted across trips"
          label="OUTSTANDING"
          tone="warning"
          value="$225.45"
          style={styles.column}
        />
      </View>
      <Text style={styles.note}>
        Debts remain attached to each Journey and are never offset against unrelated
        travel groups.
      </Text>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>BY JOURNEY</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/expenses/search" as Href)}
          style={styles.search}
        >
          <Icon color={colors.blue} name="magnifyingglass" />
          <Text style={styles.link}>Search all</Text>
        </Pressable>
      </View>
      <View style={styles.surface}>
        {journeys
          .filter((journey) => journey.status !== "UPCOMING")
          .map((journey, index) => (
            <View key={journey.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openJourney(journey.id)}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <View style={styles.grow}>
                  <Text style={styles.title}>{journey.title}</Text>
                  <Text style={styles.meta}>
                    {journey.dates} · My spend {formatMoney(journey.mySpendMinor, "NZD")}
                  </Text>
                  <Text
                    style={[
                      styles.status,
                      journey.outstandingMinor === 0 ? styles.settled : styles.open,
                    ]}
                  >
                    {journey.outstandingMinor === 0
                      ? "Settled"
                      : journey.outstandingMinor > 0
                        ? `You are owed ${formatMoney(journey.outstandingMinor, "NZD")}`
                        : `You owe ${formatMoney(Math.abs(journey.outstandingMinor), "NZD")}`}
                  </Text>
                </View>
                <Icon name="chevron.right" size={14} />
              </Pressable>
            </View>
          ))}
      </View>
      <View style={styles.info}>
        <Icon color={colors.blue} name="info.circle.fill" />
        <Text style={styles.infoText}>
          Cross-Journey totals use a report currency for comparison. Opening a Journey
          always restores its original currencies, rate evidence and settlement currency.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  segmented: {
    backgroundColor: "#E3E3E8",
    borderRadius: 8,
    flexDirection: "row",
    padding: 2,
  },
  segment: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 38,
  },
  selected: { backgroundColor: colors.surface },
  segmentText: { color: colors.secondaryLabel, fontSize: 14, fontWeight: "600" },
  selectedText: { color: colors.label },
  twoColumn: { flexDirection: "row", gap: 10 },
  column: { flex: 1 },
  note: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  sectionTitle: { color: colors.secondaryLabel, fontSize: 13 },
  search: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 44 },
  link: { color: colors.blue, fontSize: 16, fontWeight: "600" },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  row: { alignItems: "center", flexDirection: "row", minHeight: 86, padding: 14 },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  title: { color: colors.label, fontSize: 17, fontWeight: "700" },
  meta: { color: colors.secondaryLabel, fontSize: 13, marginTop: 4 },
  status: { fontSize: 13, fontWeight: "600", marginTop: 5 },
  settled: { color: colors.accent },
  open: { color: colors.warning },
  info: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingHorizontal: 4 },
  infoText: { color: colors.secondaryLabel, flex: 1, fontSize: 14, lineHeight: 20 },
});
