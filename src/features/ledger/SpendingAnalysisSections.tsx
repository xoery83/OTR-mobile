import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import {
  analysisPercentage,
  type AnalysisCategory,
  type AnalysisExpense,
  type AnalysisPeriod,
  type buildSpendingAnalysis,
} from "@/domain/ledger/spendingAnalysis";
import type { ReportingScope } from "@/domain/ledger/reporting";
import {
  formatLedgerDate,
  formatLedgerDateFilter,
  formatLedgerMoney,
  localDateKey,
} from "./format";
import { formatExpenseCount } from "./searchFilters";

export type AnalysisDashboard = ReturnType<typeof buildSpendingAnalysis>;
export type AnalysisMoney = (minor: number) => string;
export type AnalysisDrilldown = (
  filters: {
    categories?: string[];
    from?: string;
    to?: string;
    selectedMemberId?: string;
    payerMemberId?: string;
    analysisState?: "INCLUDED" | "INCOMPLETE";
  },
  origin: string,
) => void;
const stackColors = [
  "#0F766E",
  "#3B82A0",
  "#B57B36",
  "#7872AF",
  "#A14E6F",
  "#526B3D",
  "#4A6178",
  "#98664B",
];
function categoryColor(key: string, keys: string[]) {
  return stackColors[Math.max(0, keys.indexOf(key)) % stackColors.length]!;
}

export function AnalysisSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function AnalysisCategoryMenu({
  value,
  onPress,
  title,
}: {
  value: string | null;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filter ${title} by category, ${value ?? "All categories"}`}
      onPress={onPress}
      style={styles.menu}
    >
      <Text style={styles.meta}>{value ?? "All categories"}</Text>
      <AppIcon name="line.3.horizontal.decrease" size={18} color="#0F766E" />
    </Pressable>
  );
}

export function AnalysisExpenseRows({
  expenses,
  scope,
  money,
  shareLabel = "My share",
}: {
  expenses: AnalysisExpense[];
  scope: ReportingScope;
  money: AnalysisMoney;
  shareLabel?: string;
}) {
  return (
    <>
      {expenses.map((expense) => (
        <Pressable
          key={expense.id}
          accessibilityRole="button"
          accessibilityLabel={`${expense.title}, total ${money(expense.totalMinor ?? 0)}${scope === "MINE" ? `, ${shareLabel} ${money(expense.personalMinor ?? 0)}` : ""}`}
          onPress={() => router.push(`/expenses/expense/${expense.id}`)}
          style={styles.expenseRow}
        >
          <Text style={styles.rowTitle}>{expense.title}</Text>
          <Text style={styles.meta}>
            {expense.category} · {formatLedgerDate(expense.occurredAt)}
          </Text>
          <View style={styles.amounts}>
            <Text style={styles.meta}>Total {money(expense.totalMinor ?? 0)}</Text>
            {scope === "MINE" ? (
              <Text style={styles.amount}>
                {shareLabel} {money(expense.personalMinor ?? 0)}
              </Text>
            ) : null}
          </View>
          {expense.originalCurrency && (
            <Text style={styles.original}>
              {formatLedgerMoney(
                expense.originalMinor,
                expense.originalCurrency,
                expense.originalScale,
              )}{" "}
              original
            </Text>
          )}
        </Pressable>
      ))}
    </>
  );
}

export function AnalysisCategories({
  categories,
  totalCategories,
  scope,
  money,
  drilldown,
}: {
  categories: AnalysisCategory[];
  totalCategories: number;
  scope: ReportingScope;
  money: AnalysisMoney;
  drilldown: AnalysisDrilldown;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <AnalysisSection title="Spending by category">
      <View style={styles.surface}>
        {categories.map((category) => (
          <View key={category.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: expanded === category.key }}
              accessibilityLabel={`${category.label}, ${money(category.totalMinor)}, ${category.percentage} percent of ${scope === "MINE" ? "your" : "group"} spending, ${formatExpenseCount(category.expenses.length)}`}
              onPress={() => setExpanded(expanded === category.key ? null : category.key)}
              style={styles.categoryRow}
            >
              <View style={[styles.rowHeading, largeText && styles.vertical]}>
                <Text style={styles.rowTitle}>{category.label}</Text>
                <Text style={styles.amount}>
                  {money(category.totalMinor)}
                  {totalCategories > 1 ? (
                    <Text style={styles.meta}> · {category.percentage}%</Text>
                  ) : null}
                </Text>
              </View>
              <View style={styles.rowHeading}>
                <Text style={styles.meta}>
                  {formatExpenseCount(category.expenses.length)}
                </Text>
                <AppIcon
                  name={expanded === category.key ? "chevron.up" : "chevron.down"}
                  size={14}
                  color="#64748B"
                />
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.max(0, Math.min(100, category.percentage))}%` },
                  ]}
                />
              </View>
            </Pressable>
            {expanded === category.key ? (
              <View style={styles.expanded}>
                <Text style={styles.smallHeading}>Largest expenses</Text>
                <AnalysisExpenseRows
                  expenses={category.expenses.slice(0, 3)}
                  scope={scope}
                  money={money}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    drilldown(
                      { categories: category.categories },
                      `Category: ${category.label}`,
                    )
                  }
                  style={styles.linkRow}
                >
                  <Text style={styles.link}>
                    View all {formatExpenseCount(category.expenses.length).toLowerCase()}
                  </Text>
                  <AppIcon name="chevron.right" size={14} color="#0F766E" />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </AnalysisSection>
  );
}

export function AnalysisTimeline({
  dashboard,
  money,
  drilldown,
}: {
  dashboard: AnalysisDashboard;
  money: AnalysisMoney;
  drilldown: AnalysisDrilldown;
}) {
  const { fontScale } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const keys = dashboard.categories.map((category) => category.key);
  const period = dashboard.periods.find((item) => item.key === selected);
  const maximum = Math.max(1, ...dashboard.periods.map((item) => item.totalMinor));
  const periodLabel = (item: AnalysisPeriod) =>
    formatLedgerDateFilter(item.from, item.to);
  const details = (item: AnalysisPeriod) => (
    <View style={styles.timeDetail}>
      <Text style={styles.rowTitle}>{periodLabel(item)}</Text>
      <Text style={styles.amount}>{money(item.totalMinor)}</Text>
      {item.categories.map((category) => (
        <View
          key={category.key}
          style={[styles.rowHeading, fontScale > 1.5 && styles.vertical]}
        >
          <Text style={styles.meta}>{category.key}</Text>
          <Text style={styles.amount}>{money(category.totalMinor)}</Text>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => drilldown({ from: item.from, to: item.to }, periodLabel(item))}
        style={styles.linkRow}
      >
        <Text style={styles.link}>
          View {formatExpenseCount(item.expenseCount).toLowerCase()}
        </Text>
        <AppIcon name="chevron.right" size={14} color="#0F766E" />
      </Pressable>
    </View>
  );
  return (
    <AnalysisSection title="Spending over time">
      <View style={styles.timelineStats}>
        <Text style={styles.meta}>
          Average{" "}
          {dashboard.averageMinor === null
            ? "unavailable"
            : `${money(dashboard.averageMinor)}/day`}
        </Text>
        {dashboard.highestDay ? (
          <View>
            <Text style={styles.meta}>Highest day</Text>
            <Text style={styles.amount}>
              {formatLedgerDate(dashboard.highestDay.date)} ·{" "}
              {money(dashboard.highestDay.totalMinor)}
            </Text>
          </View>
        ) : null}
      </View>
      {dashboard.calendarDays === 1 ? (
        <>
          <Text style={styles.smallHeading}>
            {dashboard.periods[0]?.key === localDateKey(new Date())
              ? "Spent today"
              : "Spent this day"}
          </Text>
          {dashboard.periods[0] ? details(dashboard.periods[0]) : null}
        </>
      ) : (
        <>
          <Text style={styles.meta}>
            {dashboard.granularity} spending · Tap a bar for details
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            accessibilityLabel="Spending timeline"
            contentContainerStyle={styles.chart}
          >
            {dashboard.periods.map((item, index) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: item.key === selected }}
                accessibilityLabel={`${periodLabel(item)}, ${money(item.totalMinor)} total spending, ${item.categories.map((category) => `${category.key} ${money(category.totalMinor)}`).join(", ") || "No spending"}, ${formatExpenseCount(item.expenseCount)}`}
                onPress={() => setSelected(selected === item.key ? null : item.key)}
                style={[styles.chartColumn, { width: 38 * Math.max(1, fontScale) }]}
              >
                <View style={styles.barSpace}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(2, (item.totalMinor / maximum) * 136),
                        borderWidth: item.key === selected ? 2 : 0,
                        borderColor: "#111827",
                      },
                    ]}
                  >
                    {[...item.categories].reverse().map((category) => (
                      <View
                        key={category.key}
                        style={{
                          backgroundColor: categoryColor(category.key, keys),
                          height: `${(category.totalMinor / Math.max(1, item.totalMinor)) * 100}%`,
                          width: "100%",
                        }}
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.axis}>
                  {dashboard.granularity === "Monthly"
                    ? new Intl.DateTimeFormat(undefined, {
                        month: "short",
                        year: "2-digit",
                        timeZone: "UTC",
                      }).format(new Date(item.from))
                    : new Intl.DateTimeFormat(undefined, {
                        day: "numeric",
                        month:
                          index === 0 || item.key.endsWith("-01") ? "short" : undefined,
                        timeZone: "UTC",
                      }).format(new Date(item.from))}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.legend}>
            {keys.map((key) => (
              <View key={key} style={styles.legendItem}>
                <View
                  style={[styles.swatch, { backgroundColor: categoryColor(key, keys) }]}
                />
                <Text style={styles.meta}>{key}</Text>
              </View>
            ))}
          </View>
          {period ? details(period) : null}
        </>
      )}
    </AnalysisSection>
  );
}

export function AnalysisPeople({
  title,
  rows,
  totalMinor,
  money,
  drilldown,
  action,
  traveller = false,
  category,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    totalMinor: number;
    expenseCount: number;
    rank?: number;
    categories?: { key: string; label: string; totalMinor: number }[];
  }[];
  totalMinor: number;
  money: AnalysisMoney;
  drilldown: AnalysisDrilldown;
  action: React.ReactNode;
  traveller?: boolean;
  category: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <AnalysisSection title={title} action={action}>
      <Text style={styles.meta}>
        {traveller
          ? "Each traveller’s share of spending"
          : "Full expense amounts paid, before any repayments"}
      </Text>
      <View style={styles.surface}>
        {rows.map((person) => (
          <View key={person.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: expanded === person.key }}
              accessibilityLabel={`${person.label}, ${money(person.totalMinor)}, ${analysisPercentage(person.totalMinor, totalMinor)} percent, ${formatExpenseCount(person.expenseCount)}`}
              onPress={() => setExpanded(expanded === person.key ? null : person.key)}
              style={styles.categoryRow}
            >
              <View style={[styles.rowHeading, largeText && styles.vertical]}>
                <Text style={styles.rowTitle}>
                  {traveller ? `${person.rank}  ` : ""}
                  {person.label}
                </Text>
                <Text style={styles.amount}>
                  {money(person.totalMinor)}
                  {traveller ? (
                    <Text style={styles.meta}>
                      {" "}
                      · {analysisPercentage(person.totalMinor, totalMinor)}%
                    </Text>
                  ) : null}
                </Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.max(0, Math.min(100, analysisPercentage(person.totalMinor, totalMinor)))}%`,
                    },
                  ]}
                />
              </View>
            </Pressable>
            {expanded === person.key ? (
              <View style={styles.expanded}>
                {person.categories?.map((item) => (
                  <View key={item.key} style={styles.rowHeading}>
                    <Text style={styles.meta}>{item.label}</Text>
                    <Text style={styles.amount}>{money(item.totalMinor)}</Text>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    drilldown(
                      {
                        ...(traveller
                          ? { selectedMemberId: person.key }
                          : { payerMemberId: person.key }),
                        ...(category ? { categories: [category] } : {}),
                      },
                      traveller
                        ? `${person.label}'s spending`
                        : `Paid by ${person.label}`,
                    )
                  }
                  style={styles.linkRow}
                >
                  <Text style={styles.link}>View {person.label}&apos;s expenses</Text>
                  <AppIcon name="chevron.right" size={14} color="#0F766E" />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {!rows.length ? (
          <Text style={styles.empty}>No spending in this category.</Text>
        ) : null}
      </View>
    </AnalysisSection>
  );
}

export function AnalysisInsights({
  dashboard,
  money,
}: {
  dashboard: AnalysisDashboard;
  money: AnalysisMoney;
}) {
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <AnalysisSection
      title={dashboard.scope === "MINE" ? "Your trip in numbers" : "Trip in numbers"}
    >
      <View style={styles.insights}>
        {dashboard.insights.map((insight) => (
          <View
            key={insight.label}
            style={[styles.insight, largeText && { width: "100%" }]}
          >
            <Text style={styles.insightValue}>
              {insight.money
                ? money(Number(insight.value))
                : insight.label === "Biggest spending day"
                  ? formatLedgerDate(String(insight.value))
                  : insight.value}
            </Text>
            <Text style={styles.meta}>{insight.label}</Text>
          </View>
        ))}
      </View>
    </AnalysisSection>
  );
}

export function AnalysisSkeleton() {
  return (
    <View
      accessibilityLabel="Loading spending analysis"
      accessibilityRole="progressbar"
      style={styles.skeleton}
    >
      <View style={[styles.placeholder, { width: "45%", height: 18 }]} />
      <View style={[styles.placeholder, { width: "70%", height: 40 }]} />
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.surface}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.skeletonRow}>
              <View style={[styles.placeholder, { width: "55%" }]} />
              <View style={styles.placeholder} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export const analysisStyles = StyleSheet.create({
  body: { padding: 16, gap: 28, paddingBottom: 40 },
  summary: { gap: 5, paddingVertical: 6 },
  eyebrow: { color: "#0F766E", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  total: { color: "#111827", fontSize: 38, fontWeight: "800", flexShrink: 1 },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  link: { color: "#0F766E", fontSize: 14, fontWeight: "600" },
  error: { color: "#B91C1C", fontSize: 14 },
  empty: { paddingVertical: 36, gap: 8 },
  emptyTitle: { color: "#334155", fontSize: 21, fontWeight: "600" },
  completeness: { gap: 8, paddingTop: 12 },
});
const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#334155", fontSize: 18, fontWeight: "700", flexShrink: 1 },
  surface: { backgroundColor: "#FFFFFF", borderRadius: 14, overflow: "hidden" },
  rowHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  vertical: { alignItems: "flex-start", flexDirection: "column" },
  rowTitle: { color: "#111827", fontSize: 16, fontWeight: "600", flexShrink: 1 },
  categoryRow: {
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 7,
    minHeight: 70,
    padding: 14,
  },
  amount: { color: "#111827", fontSize: 14, fontWeight: "700", flexShrink: 1 },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 19, flexShrink: 1 },
  track: { backgroundColor: "#E5E7EB", borderRadius: 2, height: 4, overflow: "hidden" },
  fill: { backgroundColor: "#0F766E", borderRadius: 2, height: 4 },
  expanded: { backgroundColor: "#F0F8F5", gap: 10, padding: 14 },
  smallHeading: { color: "#334155", fontSize: 13, fontWeight: "700" },
  expenseRow: {
    borderBottomColor: "#E5E7EB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 80,
  },
  amounts: {
    gap: 5,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  original: { color: "#64748B", fontSize: 11 },
  linkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    justifyContent: "space-between",
  },
  link: { color: "#0F766E", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  menu: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    maxWidth: "100%",
  },
  chart: { alignItems: "flex-end", paddingVertical: 12, gap: 4 },
  chartColumn: {
    alignItems: "center",
    width: 38,
    minHeight: 180,
    justifyContent: "flex-end",
  },
  barSpace: { height: 144, alignItems: "center", justifyContent: "flex-end" },
  bar: {
    backgroundColor: "#E2E8F0",
    width: 24,
    borderRadius: 3,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  axis: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 8,
    minHeight: 26,
    textAlign: "center",
  },
  timelineStats: { gap: 8 },
  timeDetail: { gap: 10, paddingVertical: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 5, maxWidth: "100%" },
  swatch: { height: 9, width: 9, borderRadius: 2 },
  insights: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  insight: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    width: "48%",
    minHeight: 94,
    gap: 8,
  },
  insightValue: { color: "#111827", fontSize: 20, fontWeight: "700", flexShrink: 1 },
  skeleton: { gap: 18 },
  placeholder: { backgroundColor: "#E2E8F0", borderRadius: 5, height: 12, width: "90%" },
  skeletonRow: { gap: 14, padding: 18 },
  empty: { color: "#64748B", padding: 20 },
});
