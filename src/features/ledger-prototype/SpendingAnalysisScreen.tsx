import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "./theme";
import { formatMoney, Icon, PrototypeBanner, Section, Separator, ValueBlock } from "./ui";

type Scope = "MINE" | "GROUP";
const categoryData = [
  ["Food & Drink", 58960, 32, colors.accent],
  ["Accommodation", 51590, 28, colors.blue],
  ["Transport", 35010, 19, colors.warning],
  ["Tickets", 23950, 13, "#7748A8"],
  ["Shopping", 14750, 8, colors.danger],
] as const;
const days = [32, 55, 38, 82, 64, 100, 71];

export function SpendingAnalysisScreen() {
  const [scope, setScope] = useState<Scope>("MINE");
  const multiplier = scope === "MINE" ? 1 : 3.48;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PrototypeBanner />
      <View accessibilityRole="tablist" style={styles.segmented}>
        {(["MINE", "GROUP"] as const).map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === item }}
            key={item}
            onPress={() => setScope(item)}
            style={[styles.segment, scope === item ? styles.selected : null]}
          >
            <Text
              style={[styles.segmentText, scope === item ? styles.selectedText : null]}
            >
              {item === "MINE" ? "My Spending" : "Group Spending"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ValueBlock
        detail={
          scope === "MINE"
            ? "Exact shares allocated to Leon"
            : "Complete Journey merchant cost"
        }
        label="EUROPE 2026"
        value={scope === "MINE" ? "$1,842.60" : "$6,423.25"}
      />
      <Section title="Categories">
        {categoryData.map(([label, amount, percent, color], index) => (
          <View key={label}>
            {index > 0 ? <Separator /> : null}
            <View style={styles.categoryRow}>
              <View style={[styles.swatch, { backgroundColor: color }]} />
              <View style={styles.grow}>
                <View style={styles.heading}>
                  <Text style={styles.title}>{label}</Text>
                  <Text style={styles.amount}>
                    {formatMoney(Math.round(amount * multiplier), "NZD")}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { backgroundColor: color, width: `${percent}%` },
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.percent}>{percent}%</Text>
            </View>
          </View>
        ))}
      </Section>
      <Section title="Spending over time">
        <View style={styles.chart}>
          {days.map((height, index) => (
            <View key={index} style={styles.barColumn}>
              <View
                accessibilityLabel={`Day ${index + 1}, relative spend ${height} percent`}
                style={[styles.dayBar, { height: `${height}%` }]}
              />
              <Text style={styles.dayLabel}>{index + 3}</Text>
            </View>
          ))}
        </View>
        <View style={styles.chartCaption}>
          <Icon color={colors.blue} name="calendar" />
          <Text style={styles.caption}>Peak: 8 Sep · Accommodation and dinner</Text>
        </View>
      </Section>
      <Section title="Traveller view">
        <View style={styles.personRow}>
          <Text style={styles.title}>Leon</Text>
          <Text style={styles.amount}>$1,842.60</Text>
        </View>
        <Separator />
        <View style={styles.personRow}>
          <Text style={styles.title}>May</Text>
          <Text style={styles.amount}>$1,626.45</Text>
        </View>
        <Separator />
        <View style={styles.personRow}>
          <Text style={styles.title}>Mum</Text>
          <Text style={styles.amount}>$1,214.30</Text>
        </View>
      </Section>
      <Text style={styles.note}>
        Personal totals use saved member allocations. Group totals use each expense once,
        so participant counts never multiply the same purchase.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  grow: { flex: 1 },
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
  categoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    padding: 12,
  },
  swatch: { borderRadius: 3, height: 12, width: 12 },
  heading: { flexDirection: "row", justifyContent: "space-between" },
  title: { color: colors.label, fontSize: 16, fontWeight: "600" },
  amount: { color: colors.label, fontSize: 15, fontWeight: "600" },
  track: {
    backgroundColor: "#E9E9ED",
    borderRadius: 3,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
  },
  fill: { borderRadius: 3, height: 6 },
  percent: { color: colors.secondaryLabel, fontSize: 13, width: 34 },
  chart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
    height: 150,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  barColumn: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  dayBar: { backgroundColor: colors.accent, borderRadius: 4, minHeight: 6, width: "70%" },
  dayLabel: { color: colors.secondaryLabel, fontSize: 12, marginTop: 7 },
  chartCaption: { alignItems: "center", flexDirection: "row", gap: 8, padding: 14 },
  caption: { color: colors.secondaryLabel, flex: 1, fontSize: 14 },
  personRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
  },
  note: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
});
