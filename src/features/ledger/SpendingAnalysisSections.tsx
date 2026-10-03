import { categoryLabel, domainLabel, analysisInsightValue } from "@/ui/domainLabels";
import { t, getFormatLocale } from "@/ui/locale";
import { useUiTheme, useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { OverlayDismissAction } from "@/components/OverlayDismissAction";
import { MoneyText } from "./MoneyText";
import { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import { visual as cv } from "@/ui/visual";
import {
  analysisPercentage,
  analysisUsesLogScale,
  analysisScaledFraction,
  type AnalysisCategory,
  type AnalysisExpense,
  type AnalysisPeriod,
  type buildSpendingAnalysis,
} from "@/domain/ledger/spendingAnalysis";
import type { ReportingScope } from "@/domain/ledger/reporting";
import { formatLedgerDate, formatLedgerDateFilter, localDateKey } from "./format";
import { formatExpenseCount } from "./searchFilters";

export type AnalysisDashboard = ReturnType<typeof buildSpendingAnalysis>;
export type AnalysisMoney = {
  format: (minor: number) => string;
  currency: string;
  scale: number;
};
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
const chartColors = (colors: UiColors) => [
  colors.chart1,
  colors.chart2,
  colors.chart3,
  colors.chart4,
  colors.chart5,
  colors.chart6,
];
function categoryColor(key: string, keys: string[], colors: UiColors) {
  const stackColors = chartColors(colors);
  return key === "__analysis_other_categories__"
    ? colors.textSecondary
    : stackColors[Math.max(0, keys.indexOf(key)) % stackColors.length]!;
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
  useUiLocale();

  const styles = useThemedStyles(createStyles);

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
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("analysis.filterCategory", {
        title,
        category: value ? categoryLabel(value) : t("ui.allCategories"),
      })}
      onPress={onPress}
      style={styles.menu}
    >
      <Text style={styles.meta}>
        {value ? categoryLabel(value) : t("ui.allCategories")}
      </Text>
      <AppIcon name="line.3.horizontal.decrease" size={18} color={colors.accent} />
    </Pressable>
  );
}

export function AnalysisExpenseRows({
  expenses,
  scope,
  money,
}: {
  expenses: AnalysisExpense[];
  scope: ReportingScope;
  money: AnalysisMoney;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  return (
    <>
      {expenses.map((expense, index) => (
        <Pressable
          key={expense.id}
          accessibilityRole="button"
          accessibilityLabel={t("analysis.expenseDescription", {
            title: expense.title,
            date: formatLedgerDate(expense.occurredAt),
            total: money.format(expense.totalMinor ?? 0),
            share:
              scope === "MINE"
                ? t("analysis.shareDescription", {
                    amount: money.format(expense.personalMinor ?? 0),
                  })
                : "",
          })}
          onPress={() => router.push(`/expenses/expense/${expense.id}`)}
          style={[
            styles.expenseRow,
            index === expenses.length - 1 && styles.lastExpenseRow,
          ]}
        >
          <View style={styles.rowHeading}>
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={[styles.rowTitle, styles.expenseMain]}
            >
              {expense.title}
            </Text>
            <MoneyText
              numberOfLines={2}
              style={styles.compactAmount}
              variant="compact"
              minor={(scope === "MINE" ? expense.personalMinor : expense.totalMinor) ?? 0}
              currency={money.currency}
              scale={money.scale}
            />
          </View>
          <View style={styles.rowHeading}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
              style={[styles.expenseMeta, styles.expenseMain]}
            >
              {formatLedgerDate(expense.occurredAt)}
              {scope === "MINE"
                ? t("analysis.totalCaption", {
                    amount: money.format(expense.totalMinor ?? 0),
                  })
                : ""}
            </Text>
            <Text style={styles.youLabel}>
              {scope === "MINE" ? t("ui.you") : t("ui.total")}
            </Text>
          </View>
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
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);

  const [expanded, setExpanded] = useState<string | null>(null);
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <AnalysisSection title={t("ui.spendingByCategory")}>
      <View style={styles.surface}>
        {categories.map((category) => (
          <View key={category.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: expanded === category.key }}
              accessibilityLabel={t("analysis.categoryDescription", {
                category: categoryLabel(category.label),
                amount: money.format(category.totalMinor),
                percent: category.percentage,
                scope: scope === "MINE" ? t("ledger.mine") : t("ledger.group"),
                count: formatExpenseCount(category.expenses.length),
              })}
              onPress={() => setExpanded(expanded === category.key ? null : category.key)}
              style={styles.categoryRow}
            >
              <View style={[styles.rowHeading, largeText && styles.vertical]}>
                <Text numberOfLines={2} style={styles.rowTitle}>
                  {categoryLabel(category.label)}
                </Text>
                <Text style={styles.amount}>
                  <MoneyText
                    accessible={false}
                    minor={category.totalMinor}
                    currency={money.currency}
                    scale={money.scale}
                  />
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
                  color={colors.textSecondary}
                />
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: categoryColor(
                        category.key,
                        categories.map((item) => item.key),
                        colors,
                      ),
                      width: `${Math.max(0, Math.min(100, category.percentage))}%`,
                    },
                  ]}
                />
              </View>
            </Pressable>
            {expanded === category.key ? (
              <View style={styles.expanded}>
                <Text style={styles.smallHeading}>{t("ui.recentlyUpdated")}</Text>
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
                      `Category: ${categoryLabel(category.label)}`,
                    )
                  }
                  style={styles.linkRow}
                >
                  <Text style={styles.link}>
                    {t("ui.viewAll")}
                    {formatExpenseCount(category.expenses.length).toLowerCase()}
                  </Text>
                  <AppIcon name="chevron.right" size={14} color={colors.accent} />
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
  currencyScale = 2,
}: {
  dashboard: AnalysisDashboard;
  money: AnalysisMoney;
  drilldown: AnalysisDrilldown;
  currencyScale?: number;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);

  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string | null>(null);
  const [viewport, setViewport] = useState(width - 32);
  const [zoomLevel, setZoom] = useState(1);
  const [pinching, setPinching] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const pendingOffset = useRef<number | null>(null);
  const pinch = useRef({ distance: 0, zoom: 1, offset: 0 });
  const keys = dashboard.displayedCategories.map((category) => category.key);
  const period = dashboard.periods.find((item) => item.key === selected);
  const maximum = Math.max(1, ...dashboard.periods.map((item) => item.totalMinor));
  const log = analysisUsesLogScale(dashboard.periods);
  const maxZoom = Math.max(1, (dashboard.periods.length * 44) / Math.max(1, viewport));
  const zoom = Math.min(zoomLevel, maxZoom);
  const columnWidth = (viewport * zoom) / Math.max(1, dashboard.periods.length);
  const labelStride = Math.max(1, Math.ceil(48 / columnWidth));
  // Reuse the category union; never fetch on chart gestures or selection.
  const stacks = useMemo(() => {
    const groups = new Map(
      dashboard.displayedCategories.flatMap((group) =>
        group.categories.map((category) => [category, group.key] as const),
      ),
    );
    return dashboard.periods.map((item) => {
      const totals = new Map<string, number>();
      for (const category of item.categories) {
        const key = groups.get(category.key)!;
        totals.set(key, (totals.get(key) ?? 0) + category.totalMinor);
      }
      return dashboard.displayedCategories.map((group) => ({
        key: group.key,
        totalMinor: totals.get(group.key) ?? 0,
      }));
    });
  }, [dashboard]);
  const periodLabel = (item: AnalysisPeriod) =>
    formatLedgerDateFilter(item.from, item.to);
  const details = (item: AnalysisPeriod, inline = false) => (
    <View style={styles.timeDetail}>
      {inline ? (
        <Text accessibilityRole="header" style={styles.rowTitle}>
          {periodLabel(item)}
        </Text>
      ) : null}
      <MoneyText
        style={styles.amount}
        variant="standard"
        minor={item.totalMinor}
        currency={money.currency}
        scale={money.scale}
      />
      <Text style={styles.meta}>{formatExpenseCount(item.expenseCount)}</Text>
      {item.categories.map((category) => (
        <View key={category.key} style={styles.rowHeading}>
          <Text style={styles.meta}>{categoryLabel(category.key)}</Text>
          <MoneyText
            style={styles.amount}
            variant="standard"
            minor={category.totalMinor}
            currency={money.currency}
            scale={money.scale}
          />
        </View>
      ))}
    </View>
  );
  const viewExpenses = (item: AnalysisPeriod) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setSelected(null);
        drilldown({ from: item.from, to: item.to }, periodLabel(item));
      }}
      style={styles.briefFooter}
    >
      <Text style={styles.link}>
        {t("ui.view")}
        {formatExpenseCount(item.expenseCount).toLowerCase()}
      </Text>
      <AppIcon name="chevron.right" size={14} color={colors.accent} />
    </Pressable>
  );
  const resetZoom = () => {
    setZoom(1);
    offset.current = 0;
    scroll.current?.scrollTo({ x: 0, animated: false });
  };
  return (
    <AnalysisSection title={t("ui.spendingOverTime")}>
      <View style={styles.chartControls}>
        <Text style={[styles.meta, styles.average]}>
          {t("analysis.average", {
            amount:
              dashboard.averageMinor === null
                ? t("ui.unavailable")
                : t("analysis.perDay", { amount: money.format(dashboard.averageMinor) }),
          })}
        </Text>
        {dashboard.calendarDays > 1 && maxZoom > 1 ? (
          <View style={styles.zoomControls}>
            {zoom > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ui.zoomOutTimeline")}
                onPress={() => setZoom(Math.max(1, zoom / 2))}
                style={styles.zoomButton}
              >
                <AppIcon name="minus.magnifyingglass" color={colors.accent} size={18} />
              </Pressable>
            ) : null}
            {zoom < maxZoom ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ui.zoomInTimeline")}
                onPress={() => setZoom(maxZoom)}
                style={styles.zoomButton}
              >
                <AppIcon name="plus.magnifyingglass" color={colors.accent} size={18} />
              </Pressable>
            ) : null}
            {zoom > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ui.showEntireTimeline")}
                onPress={resetZoom}
                style={styles.zoomButton}
              >
                <AppIcon name="arrow.uturn.backward" color={colors.accent} size={18} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      {dashboard.calendarDays === 1 ? (
        <>
          <Text style={styles.smallHeading}>
            {dashboard.periods[0]?.key === localDateKey(new Date())
              ? t("ui.spentToday")
              : t("ui.spentThisDay")}
          </Text>
          {dashboard.periods[0] ? (
            <>
              {details(dashboard.periods[0], true)}
              {viewExpenses(dashboard.periods[0])}
            </>
          ) : null}
        </>
      ) : (
        <>
          <View
            style={styles.chartFrame}
            onLayout={(event) => setViewport(event.nativeEvent.layout.width)}
            onStartShouldSetResponderCapture={(event) =>
              event.nativeEvent.touches.length === 2
            }
            onMoveShouldSetResponderCapture={(event) =>
              event.nativeEvent.touches.length === 2
            }
            onResponderGrant={(event) => {
              const touches = event.nativeEvent.touches;
              if (touches.length !== 2) return;
              pinch.current = {
                distance: Math.max(1, Math.abs(touches[0]!.pageX - touches[1]!.pageX)),
                zoom,
                offset: offset.current,
              };
              setPinching(true);
            }}
            onResponderMove={(event) => {
              const touches = event.nativeEvent.touches;
              if (touches.length !== 2 || !pinch.current.distance) return;
              const next = Math.max(
                1,
                Math.min(
                  maxZoom,
                  (pinch.current.zoom * Math.abs(touches[0]!.pageX - touches[1]!.pageX)) /
                    pinch.current.distance,
                ),
              );
              pendingOffset.current = Math.max(
                0,
                Math.min(
                  viewport * (next - 1),
                  ((pinch.current.offset + viewport / 2) * next) / pinch.current.zoom -
                    viewport / 2,
                ),
              );
              setZoom(next);
            }}
            onResponderRelease={() => {
              pinch.current.distance = 0;
              setPinching(false);
            }}
            onResponderTerminate={() => {
              pinch.current.distance = 0;
              setPinching(false);
            }}
            onResponderTerminationRequest={() => false}
          >
            <ScrollView
              ref={scroll}
              horizontal
              scrollEnabled={zoom > 1 && !pinching}
              showsHorizontalScrollIndicator={zoom > 1}
              accessibilityLabel={t("ui.spendingTimeline")}
              onScroll={(event) => {
                offset.current = event.nativeEvent.contentOffset.x;
              }}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (pendingOffset.current !== null) {
                  scroll.current?.scrollTo({ x: pendingOffset.current, animated: false });
                  pendingOffset.current = null;
                }
              }}
              contentContainerStyle={styles.chart}
            >
              {dashboard.periods.map((item, index) => {
                let cumulative = 0;
                const segments = stacks[index]!.map((category) => {
                  const lower = analysisScaledFraction(
                    cumulative,
                    maximum,
                    currencyScale,
                    log,
                  );
                  cumulative += category.totalMinor;
                  return {
                    ...category,
                    height:
                      136 *
                      (analysisScaledFraction(cumulative, maximum, currencyScale, log) -
                        lower),
                  };
                });
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.key === selected }}
                    accessibilityHint={t("ui.opensSpendingBrief")}
                    accessibilityLabel={t("analysis.periodDescription", {
                      period: periodLabel(item),
                      amount: money.format(item.totalMinor),
                      categories:
                        item.categories
                          .map(
                            (category) =>
                              `${categoryLabel(category.key)} ${money.format(category.totalMinor)}`,
                          )
                          .join(", ") || t("ui.noSpending"),
                      count: formatExpenseCount(item.expenseCount),
                    })}
                    onPress={() => {
                      if (!pinching) setSelected(item.key);
                    }}
                    style={[styles.chartColumn, { width: columnWidth }]}
                  >
                    <View style={styles.barSpace}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: Math.max(1, Math.min(30, columnWidth * 0.72)),
                            height: Math.max(
                              2,
                              analysisScaledFraction(
                                item.totalMinor,
                                maximum,
                                currencyScale,
                                log,
                              ) * 136,
                            ),
                            borderWidth: item.key === selected ? 1 : 0,
                            borderColor: colors.textPrimary,
                          },
                        ]}
                      >
                        {[...segments].reverse().map((category) => (
                          <View
                            key={category.key}
                            style={{
                              backgroundColor: categoryColor(category.key, keys, colors),
                              height: category.height,
                              width: "100%",
                            }}
                          />
                        ))}
                      </View>
                      <View style={styles.barTarget} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.axis,
                        {
                          width: 48,
                          position: "absolute",
                          bottom: 0,
                          left:
                            index === 0
                              ? 0
                              : index === dashboard.periods.length - 1
                                ? columnWidth - 48
                                : (columnWidth - 48) / 2,
                          textAlign:
                            index === 0
                              ? "left"
                              : index === dashboard.periods.length - 1
                                ? "right"
                                : "center",
                        },
                      ]}
                    >
                      {index % labelStride === 0
                        ? new Intl.DateTimeFormat(
                            getFormatLocale(),
                            dashboard.granularity === "Monthly"
                              ? { month: "short", year: "2-digit", timeZone: "UTC" }
                              : { day: "numeric", month: "short", timeZone: "UTC" },
                          ).format(new Date(item.from))
                        : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.legend}>
            {dashboard.displayedCategories.map((category) => (
              <View key={category.key} style={styles.legendItem}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: categoryColor(category.key, keys, colors) },
                  ]}
                />
                <Text style={styles.meta}>{categoryLabel(category.label)}</Text>
              </View>
            ))}
          </View>
          <Modal
            visible={!!period}
            transparent
            animationType="fade"
            onRequestClose={() => setSelected(null)}
          >
            <View style={styles.popupBackdrop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("ui.dismissSpendingBrief")}
                style={StyleSheet.absoluteFill}
                onPress={() => setSelected(null)}
              />
              <View accessibilityViewIsModal style={styles.popup}>
                <View style={styles.briefHeader}>
                  <Text
                    accessibilityRole="header"
                    style={[styles.rowTitle, styles.average]}
                  >
                    {period ? periodLabel(period) : ""}
                  </Text>
                  <OverlayDismissAction
                    label={t("ui.closeSpendingBrief")}
                    onPress={() => setSelected(null)}
                  />
                </View>
                <ScrollView style={styles.briefScroll}>
                  {period ? details(period) : null}
                </ScrollView>
                {period ? viewExpenses(period) : null}
              </View>
            </View>
          </Modal>
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
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);

  const [expanded, setExpanded] = useState<string | null>(null);
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <AnalysisSection title={title} action={action}>
      <View style={styles.surface}>
        {rows.map((person) => (
          <View key={person.key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={
                traveller && !category ? { expanded: expanded === person.key } : undefined
              }
              accessibilityLabel={t("analysis.personDescription", {
                rank: traveller
                  ? t("analysis.rankDescription", { rank: person.rank ?? "" })
                  : "",
                name: person.label,
                amount: money.format(person.totalMinor),
                count: formatExpenseCount(person.expenseCount),
              })}
              onPress={() => {
                if (traveller && !category)
                  setExpanded(expanded === person.key ? null : person.key);
                else
                  drilldown(
                    {
                      ...(traveller
                        ? { selectedMemberId: person.key }
                        : { payerMemberId: person.key }),
                      ...(category ? { categories: [category] } : {}),
                    },
                    traveller
                      ? t("analysis.personSpending", { name: person.label })
                      : t("analysis.paidBy", { name: person.label }),
                  );
              }}
              style={styles.categoryRow}
            >
              <View style={[styles.rowHeading, largeText && styles.vertical]}>
                <View style={styles.personName}>
                  {traveller ? (
                    <Text style={styles.rankBadge}>#{person.rank}</Text>
                  ) : null}
                  <Text numberOfLines={2} style={styles.rowTitle}>
                    {person.label}
                  </Text>
                </View>
                <MoneyText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={styles.amount}
                  variant="standard"
                  minor={person.totalMinor}
                  currency={money.currency}
                  scale={money.scale}
                />
              </View>
              {!traveller ? (
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
              ) : null}
            </Pressable>
            {traveller && !category && expanded === person.key ? (
              <View style={styles.expanded}>
                {person.categories?.map((item) => (
                  <View key={item.key} style={styles.rowHeading}>
                    <Text style={styles.meta}>{categoryLabel(item.label)}</Text>
                    <MoneyText
                      style={styles.amount}
                      variant="standard"
                      minor={item.totalMinor}
                      currency={money.currency}
                      scale={money.scale}
                    />
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
                        ? t("analysis.personSpending", { name: person.label })
                        : t("analysis.paidBy", { name: person.label }),
                    )
                  }
                  style={styles.linkRow}
                >
                  <Text style={styles.link}>
                    {t("analysis.viewPersonExpenses", { name: person.label })}
                  </Text>
                  <AppIcon name="chevron.right" size={14} color={colors.accent} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {!rows.length ? (
          <Text style={styles.empty}>{t("ui.noSpendingInThisCategory")}</Text>
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
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <AnalysisSection
      title={
        dashboard.scope === "MINE" ? t("ui.yourTripInNumbers") : t("ui.tripInNumbers")
      }
    >
      <View style={styles.insights}>
        {dashboard.insights.map((insight) => (
          <View
            key={insight.label}
            style={[styles.insight, largeText && { width: "100%" }]}
          >
            {insight.money ? (
              <MoneyText
                variant="headline"
                style={styles.insightValue}
                minor={Number(insight.value)}
                currency={money.currency}
                scale={money.scale}
              />
            ) : (
              <Text style={styles.insightValue}>
                {insight.label === "Biggest spending day"
                  ? formatLedgerDate(String(insight.value))
                  : analysisInsightValue(insight.label, insight.value)}
              </Text>
            )}
            <Text style={styles.meta}>{domainLabel(insight.label)}</Text>
          </View>
        ))}
      </View>
    </AnalysisSection>
  );
}

export function AnalysisSkeleton() {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  return (
    <View
      accessibilityLabel={t("ui.loadingSpendingAnalysis")}
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

export const useAnalysisStyles = () => useThemedStyles(createSharedStyles);
const createSharedStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { padding: cv.space.page, gap: cv.space.section, paddingBottom: 40 },
    summary: { gap: 5, paddingVertical: 6 },
    eyebrow: { color: colors.accent, ...cv.type.eyebrow },
    meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    link: { color: colors.accent, ...cv.type.action },
    error: { color: colors.destructive, fontSize: 14 },
    empty: { paddingVertical: 36, gap: 8 },
    emptyTitle: { color: colors.textTertiary, fontSize: 21, fontWeight: "600" },
  });
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    section: { gap: cv.space.heading },
    sectionHeading: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    sectionTitle: { color: colors.textPrimary, ...cv.type.section, flexShrink: 1 },
    surface: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      overflow: "hidden",
    },
    rowHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },
    vertical: { alignItems: "flex-start", flexDirection: "column" },
    rowTitle: { color: colors.textPrimary, ...cv.type.row, flexShrink: 1 },
    categoryRow: {
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 7,
      minHeight: 70,
      padding: cv.space.row,
    },
    amount: { color: colors.textPrimary, ...cv.type.rowAmount, flexShrink: 1 },
    meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, flexShrink: 1 },
    track: {
      backgroundColor: colors.separator,
      borderRadius: 2,
      height: 4,
      overflow: "hidden",
    },
    fill: { backgroundColor: colors.accent, borderRadius: 2, height: 4 },
    expanded: {
      backgroundColor: colors.expandedSurface,
      gap: 10,
      padding: cv.space.row,
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    smallHeading: { color: colors.textTertiary, fontSize: 13, fontWeight: "700" },
    lastExpenseRow: { borderBottomWidth: 0 },
    expenseRow: {
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingHorizontal: 14,
      paddingVertical: 13,
      minHeight: 66,
    },
    expenseMain: { flex: 1, minWidth: 0, gap: 4 },
    expenseMeta: { color: colors.textTertiary, ...cv.type.meta, lineHeight: 18 },
    compactAmount: {
      color: colors.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
      textAlign: "right",
      flexShrink: 0,
      minWidth: 64,
      maxWidth: "48%",
    },
    youLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
    },
    linkRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      minHeight: 44,
      justifyContent: "space-between",
    },
    link: { color: colors.accent, fontSize: 14, fontWeight: "600", flexShrink: 1 },
    menu: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      minHeight: 44,
      maxWidth: "100%",
    },
    chart: { alignItems: "flex-end", paddingVertical: 8 },
    chartColumn: {
      alignItems: "center",
      width: 38,
      minHeight: 180,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.onAccent,
      justifyContent: "flex-end",
    },
    barSpace: {
      marginBottom: 26,
      height: 144,
      width: "100%",
      alignItems: "center",
      justifyContent: "flex-end",
    },
    barTarget: {
      height: 3,
      backgroundColor: colors.accent,
      width: "72%",
      borderRadius: 2,
      marginTop: 3,
    },
    bar: {
      backgroundColor: colors.separator,
      width: 24,
      borderRadius: 3,
      overflow: "hidden",
      justifyContent: "flex-end",
    },
    axis: {
      color: colors.textSecondary,
      fontSize: 10,
      marginTop: 8,
      minHeight: 26,
      textAlign: "center",
    },
    chartFrame: { backgroundColor: colors.surface, borderRadius: 12, overflow: "hidden" },
    chartControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    average: { flex: 1, flexShrink: 1 },
    personName: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
    rankBadge: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "700",
      backgroundColor: colors.groupedBackground,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 4,
      overflow: "hidden",
    },
    briefHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
    briefScroll: { flexShrink: 1 },
    briefFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      minHeight: 48,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      flexShrink: 0,
    },
    zoomControls: { flexDirection: "row" },
    zoomButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    popupBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: 24,
    },
    popup: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 20,
      maxHeight: "75%",
    },
    timeDetail: { gap: 10, paddingVertical: 12 },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    legendItem: { alignItems: "center", flexDirection: "row", gap: 5, maxWidth: "100%" },
    swatch: { height: 9, width: 9, borderRadius: 2 },
    insights: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    insight: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      width: "48%",
      minHeight: 94,
      gap: 8,
    },
    insightValue: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "700",
      flexShrink: 1,
    },
    skeleton: { gap: 18 },
    placeholder: {
      backgroundColor: colors.separator,
      borderRadius: 5,
      height: 12,
      width: "90%",
    },
    skeletonRow: { gap: 14, padding: 18 },
    empty: { color: colors.textSecondary, padding: 20 },
  });
