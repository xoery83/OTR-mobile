import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiText } from "@/ui/controls";
import { getFormatLocale } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  initialDayFeedShellDates,
  initialDayFeedShellScroll,
  updateDayFeedShellDates,
  updateDayFeedShellScroll,
  updateDayFeedShellReadingMotion,
  type DayFeedShellVisibleDates,
} from "./dayFeedShellState";

// Root keeps native Menu/Search/material and existing Capture action ownership.
export function DayFeedShellTitle({
  label,
  openCalendarLabel,
  onOpenCalendar,
}: {
  label: string;
  openCalendarLabel: string;
  onOpenCalendar(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={openCalendarLabel}
      onPress={onOpenCalendar}
      style={styles.titleTarget}
    >
      <UiText
        style={styles.title}
        numberOfLines={1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </UiText>
      <AppIcon name="chevron.down" size={12} color={colors.textSecondary} />
    </Pressable>
  );
}

// This belongs inside the owning virtualized list header, not a second vertical ScrollView.
export function DayFeedIntroduction({
  tripName,
  rangeLabel,
  locationSummary,
  openCalendarLabel,
  onOpenCalendar,
}: {
  tripName: string;
  rangeLabel?: string | null;
  locationSummary?: string | null;
  openCalendarLabel?: string;
  onOpenCalendar?(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  return (
    <View style={styles.introduction}>
      <UiText accessibilityRole="header" style={styles.heading}>
        {tripName}
      </UiText>
      {rangeLabel ? (
        onOpenCalendar ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={openCalendarLabel}
            onPress={onOpenCalendar}
            style={styles.rangeTarget}
          >
            <UiText style={styles.meta}>{rangeLabel}</UiText>
            <AppIcon name="chevron.down" size={12} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <UiText style={styles.meta}>{rangeLabel}</UiText>
        )
      ) : null}
      {locationSummary ? <UiText style={styles.meta}>{locationSummary}</UiText> : null}
    </View>
  );
}

export function formatDayFeedVisibleDates(range: DayFeedShellVisibleDates): string {
  const date = (value: string) => new Date(`${value}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat(getFormatLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (range.first === range.last) return formatter.format(date(range.first));
  if (range.first.slice(0, 4) !== range.last.slice(0, 4))
    return `${formatter.format(date(range.first))} – ${formatter.format(date(range.last))}`;
  // Native formatRange can repeat Chinese years/months; share parts in locale order.
  const parts = (value: string): Intl.DateTimeFormatPart[] => {
    const raw = formatter.formatToParts(date(value));
    if (
      !getFormatLocale().startsWith("zh") ||
      (raw.some((part) => part.type === "month") &&
        raw.some((part) => part.type === "day"))
    )
      return raw;
    // Native can label the whole Chinese date as year; retain Intl literals and verify civil fields.
    const match = formatter.format(date(value)).match(/^(\d+)(\D+)(\d+)(\D+)(\d+)(\D*)$/);
    const civil = value.split("-").map(Number);
    if (!match || [1, 3, 5].some((at, i) => Number(match[at]) !== civil[i])) return raw;
    return [
      { type: "year", value: match[1] },
      { type: "literal", value: match[2] },
      { type: "month", value: match[3] },
      { type: "literal", value: match[4] },
      { type: "day", value: match[5] },
      { type: "literal", value: match[6] },
    ];
  };
  const first = parts(range.first);
  const last = parts(range.last);
  const sameMonth = range.first.slice(0, 7) === range.last.slice(0, 7);
  const shared = (a: Intl.DateTimeFormatPart, b: Intl.DateTimeFormatPart) =>
    a.type === b.type &&
    a.value === b.value &&
    (a.type === "literal" || a.type === "year" || (sameMonth && a.type === "month"));
  let head = 0,
    tail = 0;
  while (head < first.length && head < last.length && shared(first[head], last[head]))
    head++;
  while (
    tail < first.length - head &&
    tail < last.length - head &&
    shared(first[first.length - tail - 1], last[last.length - tail - 1])
  )
    tail++;
  const text = (parts: Intl.DateTimeFormatPart[]) =>
    parts.map((part) => part.value).join("");
  return (
    text(first.slice(0, head)) +
    text(first.slice(head, first.length - tail)) +
    (sameMonth ? "–" : " – ") +
    text(last.slice(head, last.length - tail)) +
    text(first.slice(first.length - tail))
  );
}

export function useDayFeedShellState(resetKey: string) {
  const scroll = useRef({ key: resetKey, value: initialDayFeedShellScroll });
  const dates = useRef({ key: resetKey, value: initialDayFeedShellDates });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navigation, setNavigation] = useState({ key: resetKey, visible: true });
  const [visible, setVisible] = useState({
    key: resetKey,
    range: initialDayFeedShellDates.visible,
  });
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [resetKey],
  );
  const observeScroll = useCallback(
    (offset: number, userDriven: boolean) => {
      const previous = scroll.current;
      const next = updateDayFeedShellScroll(
        previous.key === resetKey ? previous.value : initialDayFeedShellScroll,
        offset,
        userDriven,
      );
      scroll.current = { key: resetKey, value: next };
      if (
        previous.key !== resetKey ||
        previous.value.navigationVisible !== next.navigationVisible
      )
        setNavigation({ key: resetKey, visible: next.navigationVisible });
    },
    [resetKey],
  );
  const observeVisibleDates = useCallback(
    (range: DayFeedShellVisibleDates | null, immediate = false) => {
      if (timer.current !== null) clearTimeout(timer.current);
      const publish = () => {
        const previous = dates.current;
        const next = range
          ? updateDayFeedShellDates(
              previous.key === resetKey ? previous.value : initialDayFeedShellDates,
              range,
              Date.now(),
              immediate,
            )
          : initialDayFeedShellDates;
        dates.current = { key: resetKey, value: next };
        if (previous.key !== resetKey || previous.value.visible !== next.visible)
          setVisible({ key: resetKey, range: next.visible });
      };
      publish();
      if (range && dates.current.value.pending)
        timer.current = setTimeout(() => {
          if (dates.current.key === resetKey) publish();
        }, 120);
    },
    [resetKey],
  );
  return {
    observeScroll,
    observeReadingMotion: (delta: number) => {
      const previous = scroll.current;
      const next = updateDayFeedShellReadingMotion(
        previous.key === resetKey ? previous.value : initialDayFeedShellScroll,
        delta,
      );
      scroll.current = { key: resetKey, value: next };
      if (
        previous.key !== resetKey ||
        previous.value.navigationVisible !== next.navigationVisible
      )
        setNavigation({ key: resetKey, visible: next.navigationVisible });
    },
    observeReadingStopped: () => {
      const previous = scroll.current;
      if (previous.key !== resetKey) return;
      scroll.current = {
        key: resetKey,
        value: {
          ...initialDayFeedShellScroll,
          offset: previous.value.offset,
          turnOffset: previous.value.offset,
        },
      };
      if (!previous.value.navigationVisible)
        setNavigation({ key: resetKey, visible: true });
    },
    observeVisibleDates,
    navigationVisible: navigation.key === resetKey ? navigation.visible : true,
    visibleDates: visible.key === resetKey ? visible.range : null,
  };
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    titleTarget: {
      minHeight: 44,
      minWidth: 44,
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: visual.space.heading,
    },
    title: {
      ...visual.type.tripRowTitle,
      color: colors.textPrimary,
      textAlign: "center",
      flexShrink: 1,
    },
    introduction: {
      paddingHorizontal: visual.space.page,
      paddingVertical: visual.space.card,
      gap: visual.space.heading,
    },
    rangeTarget: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: visual.space.heading,
    },
    heading: { ...visual.type.section, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
