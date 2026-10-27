import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText } from "@/ui/controls";
import { formatUiDate, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { wholeTripCalendarDates } from "./tripListPresentation";

export type DayFeedCalendarMarker = "Plans" | "Stay" | "Transport";
export type DayFeedCalendarSummary = Readonly<{
  date: string;
  placeTransitionLabel?: string;
  markers: readonly DayFeedCalendarMarker[];
}>;
export type DayFeedCalendarCopy = Readonly<{
  unknownBounds: string;
  markers: Record<DayFeedCalendarMarker, string>;
}>;
type Bounds = { start: string; end: string };
export function dayFeedCalendarBounds(
  start?: string | null,
  end?: string | null,
): Bounds | null {
  try {
    if (!start || !end || validateCalendarDate(start) > validateCalendarDate(end))
      return null;
    return { start, end };
  } catch {
    return null;
  }
}
export function dayFeedCalendarMonths(bounds: Bounds): string[] {
  const first = +bounds.start.slice(0, 4) * 12 + +bounds.start.slice(5, 7) - 1;
  const last = +bounds.end.slice(0, 4) * 12 + +bounds.end.slice(5, 7) - 1;
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const month = first + offset;
    return `${String(Math.floor(month / 12)).padStart(4, "0")}-${String((month % 12) + 1).padStart(2, "0")}`;
  });
}
export function dayFeedCalendarCells(month: string): (string | null)[] {
  const first = new Date(`${month}-01T12:00:00Z`);
  const leading = (first.getUTCDay() + 6) % 7;
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const count = end.getUTCDate();
  return Array.from({ length: Math.ceil((leading + count) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day >= 1 && day <= count ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}
// Core bounds stay the confirmed Trip range; coverage only exposes supplied reader dates.
export function dayFeedCalendarCoverage(
  start: string | null | undefined,
  end: string | null | undefined,
  readerDates: readonly string[],
  selected?: string | null,
) {
  const core = dayFeedCalendarBounds(start, end);
  const candidates = readerDates.flatMap((date) => {
    try {
      return [validateCalendarDate(date)];
    } catch {
      return [];
    }
  });
  let anchor = core?.start ?? candidates[0];
  try {
    if (selected) anchor = validateCalendarDate(selected);
  } catch {
    // Invalid route state cannot create a selectable date.
  }
  const dates = anchor
    ? wholeTripCalendarDates(
        { startDate: core?.start ?? null, endDate: core?.end ?? null },
        candidates,
        anchor,
      )
    : [];
  return {
    core,
    dates: new Set(dates),
    months: dates.length
      ? dayFeedCalendarMonths({ start: dates[0], end: dates[dates.length - 1] })
      : [],
  };
}
const dateValue = (date: string) => new Date(`${date}T12:00:00Z`);
const accessibleDay = (date: string) =>
  formatUiDate(dateValue(date), { dateStyle: "full", timeZone: "UTC" });
const markers: readonly DayFeedCalendarMarker[] = ["Plans", "Stay", "Transport"];

// Summaries are already authorized and assigned by the owning Day reader, never inferred here.
export function DayFeedCalendarSheet({
  visible,
  onClose,
  onSelect,
  tripName,
  rangeLabel,
  tripStart,
  tripEnd,
  selectedDate,
  today,
  dates = [],
  summaries,
  copy,
}: {
  visible: boolean;
  onClose(): void;
  onSelect(date: string): void;
  tripName: string;
  rangeLabel?: string;
  tripStart?: string | null;
  tripEnd?: string | null;
  selectedDate?: string | null;
  today?: string | null;
  dates?: readonly string[];
  summaries: readonly DayFeedCalendarSummary[];
  copy: DayFeedCalendarCopy;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [sheetWidth, setSheetWidth] = useState(width);
  const gridWidth = Math.max(
    sheetWidth - visual.space.page * 2,
    Math.max(44, Math.ceil(24 * fontScale)) * 7,
  );
  const scroll = useRef<ScrollView>(null);
  const positioned = useRef(false);
  const offsets = useRef<Record<string, number>>({});
  const coverage = dayFeedCalendarCoverage(tripStart, tripEnd, dates, selectedDate);
  const bounds = coverage.core;
  const months = coverage.months;
  const selectedMonth = months.includes(selectedDate?.slice(0, 7) ?? "")
    ? selectedDate!.slice(0, 7)
    : months[0];
  const summaryByDate = new Map(summaries.map((summary) => [summary.date, summary]));
  useEffect(() => {
    positioned.current = false;
  }, [visible, selectedMonth, tripStart, tripEnd]);
  const position = () => {
    if (
      !visible ||
      positioned.current ||
      !scroll.current ||
      offsets.current[selectedMonth] === undefined
    )
      return;
    scroll.current.scrollTo({ y: offsets.current[selectedMonth], animated: false });
    positioned.current = true;
  };
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      allowSwipeDismissal
      onRequestClose={onClose}
      onShow={position}
    >
      <View
        style={styles.sheet}
        onLayout={({ nativeEvent }) => setSheetWidth(nativeEvent.layout.width)}
      >
        <SheetHeader title={tripName} onLeft={onClose} safeTop={false} />
        {rangeLabel ? <UiText style={styles.range}>{rangeLabel}</UiText> : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          ref={scroll}
          style={styles.sheet}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + visual.space.page },
          ]}
          onScrollBeginDrag={() => {
            positioned.current = true;
          }}
          onContentSizeChange={position}
        >
          {!bounds ? (
            <UiText style={styles.secondary}>{copy.unknownBounds}</UiText>
          ) : null}
          {months.map((month) => (
            <View
              key={month}
              style={styles.month}
              onLayout={({ nativeEvent }) => {
                offsets.current[month] = nativeEvent.layout.y;
                position();
              }}
            >
              <UiText accessibilityRole="header" style={styles.monthTitle}>
                {formatUiDate(dateValue(`${month}-01`), {
                  year: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </UiText>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                horizontal
                style={styles.horizontal}
                showsHorizontalScrollIndicator={
                  gridWidth > sheetWidth - visual.space.page * 2
                }
              >
                <View style={[styles.grid, { width: gridWidth }]}>
                  {Array.from({ length: 7 }, (_, day) => (
                    <UiText key={day} style={styles.weekday}>
                      {formatUiDate(dateValue(`2021-11-0${day + 1}`), {
                        weekday: "narrow",
                        timeZone: "UTC",
                      })}
                    </UiText>
                  ))}
                  {dayFeedCalendarCells(month).map((date, index) => {
                    if (!date)
                      return <View key={`blank-${index}`} style={styles.blank} />;
                    const allowed = coverage.dates.has(date);
                    const inCoreRange =
                      !!bounds && date >= bounds.start && date <= bounds.end;
                    const summary = allowed ? summaryByDate.get(date) : undefined;
                    const hints = markers.filter((marker) =>
                      summary?.markers.includes(marker),
                    );
                    const selected = allowed && date === selectedDate;
                    return (
                      <Pressable
                        key={date}
                        style={[
                          styles.cell,
                          inCoreRange && styles.inRange,
                          selected && styles.selected,
                          date === today && styles.today,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: !allowed }}
                        disabled={!allowed}
                        accessibilityLabel={[
                          accessibleDay(date),
                          summary?.placeTransitionLabel,
                          ...hints.map((marker) => copy.markers[marker]),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        onPress={() => {
                          if (!allowed) return;
                          onClose();
                          onSelect(date);
                        }}
                      >
                        {date === today ? (
                          <View pointerEvents="none" style={styles.todayTint} />
                        ) : null}
                        <UiText
                          style={[
                            styles.day,
                            !allowed && styles.muted,
                            selected && styles.selectedText,
                          ]}
                        >
                          {formatUiNumber(+date.slice(8))}
                        </UiText>
                        {summary?.placeTransitionLabel ? (
                          <UiText
                            numberOfLines={1}
                            style={[styles.place, selected && styles.selectedText]}
                          >
                            {summary.placeTransitionLabel}
                          </UiText>
                        ) : null}
                        {hints.length ? (
                          <View style={styles.markers}>
                            {hints.map((marker) => (
                              <View
                                key={marker}
                                style={[
                                  styles.marker,
                                  styles[marker],
                                  selected && styles.selectedMarker,
                                ]}
                              />
                            ))}
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: colors.surface },
    content: { paddingHorizontal: visual.space.page, gap: visual.space.section },
    range: {
      ...visual.type.meta,
      color: colors.textSecondary,
      paddingHorizontal: visual.space.page,
      paddingBottom: visual.space.card,
    },
    secondary: { ...visual.type.meta, color: colors.textSecondary },
    month: { gap: visual.space.card },
    monthTitle: { ...visual.type.section, color: colors.textPrimary },
    horizontal: { flexGrow: 0 },
    grid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch" },
    weekday: {
      ...visual.type.meta,
      color: colors.textSecondary,
      width: `${100 / 7}%`,
      textAlign: "center",
      paddingVertical: visual.space.heading,
    },
    blank: { width: `${100 / 7}%` },
    cell: {
      width: `${100 / 7}%`,
      minHeight: 60,
      paddingVertical: visual.space.heading,
      alignItems: "center",
      gap: 3,
    },
    inRange: { backgroundColor: colors.accentSurface },
    selected: { backgroundColor: colors.accent },
    today: {
      borderWidth: 1,
      borderColor: colors.separator,
    },
    todayTint: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.textPrimary,
      opacity: 0.08,
    },
    day: { ...visual.type.tripRowTitle, color: colors.textPrimary, textAlign: "center" },
    muted: { color: colors.disabled },
    place: { ...visual.type.navigation, color: colors.textSecondary, maxWidth: "100%" },
    markers: { flexDirection: "row", gap: 3 },
    marker: { width: 5, height: 5, borderRadius: visual.radius.pill },
    Plans: { backgroundColor: colors.chart1 },
    Stay: { backgroundColor: colors.chart2 },
    Transport: { backgroundColor: colors.textSecondary },
    selectedMarker: { backgroundColor: colors.onAccent },
    selectedText: { color: colors.onAccent },
  });
