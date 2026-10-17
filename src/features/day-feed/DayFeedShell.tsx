import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiText } from "@/ui/controls";
import { formatUiDate } from "@/ui/locale";
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
      <UiText style={styles.title} numberOfLines={2}>
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
}: {
  tripName: string;
  rangeLabel?: string | null;
  locationSummary?: string | null;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.introduction}>
      <UiText accessibilityRole="header" style={styles.heading}>
        {tripName}
      </UiText>
      {rangeLabel ? <UiText style={styles.meta}>{rangeLabel}</UiText> : null}
      {locationSummary ? <UiText style={styles.meta}>{locationSummary}</UiText> : null}
    </View>
  );
}

export function formatDayFeedVisibleDates(range: DayFeedShellVisibleDates): string {
  const date = (value: string) =>
    formatUiDate(new Date(`${value}T12:00:00Z`), {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return range.first === range.last
    ? date(range.first)
    : `${date(range.first)} – ${date(range.last)}`;
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
    heading: { ...visual.type.section, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
