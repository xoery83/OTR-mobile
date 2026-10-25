import { useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NavigationContentFrame,
  navigationContentFrameOptions,
  NavigationContextTitle,
} from "@/components/navigationChrome";
import { ExperienceBottomShell } from "@/components/ExperienceBottomShell";
import { SheetHeader } from "@/components/SheetHeader";
import { DayFeed } from "@/features/day-feed/DayFeed";
import {
  DayFeedIntroduction,
  DayFeedShellTitle,
  formatDayFeedVisibleDates,
  useDayFeedShellState,
} from "@/features/day-feed/DayFeedShell";
import { DayFeedFidelityHeading } from "@/features/day-feed/DayFeedFidelityHeading";
import { DayFeedCalendarSheet } from "@/features/day-feed/DayFeedCalendarSheet";
import type { DayListHandle } from "@/features/day-feed/WindowedDayList";
import type { DaySummary } from "@/features/day-feed/dayFeedWindow";
import { p1FreshEntryFocus } from "@/features/day-feed/p1ReadPresentation";
import { localCalendarDate } from "@/domain/trip/dayReadModel";
import { UiButton, UiText } from "@/ui/controls";
import { UiGlassSurface } from "@/ui/UiGlassSurface";
import { t, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";
import {
  p1FidelityFixture,
  p1FidelityPack,
  type P1FidelityClock,
} from "./p1FidelityFixture";

// DEV fixture host: the existing DayFeed/composer/list/header/calendar/material render it.
// It never adopts fixture identities into TripView, creates business records or dispatches actions.
export function P1FidelityPreview() {
  useUiLocale();
  const params = useLocalSearchParams<{
    clock?: string;
    depth?: string;
    item?: string;
  }>();
  const clock: P1FidelityClock =
    params.clock === "future" || params.clock === "past" ? params.clock : "today";
  const initialFixture = p1FidelityFixture(clock);
  const freshFocus = p1FreshEntryFocus(
    initialFixture.projection.events,
    initialFixture.instant,
    new Set(
      p1FidelityPack.items
        .filter((item) => item.availability === "PENDING")
        .map((item) => item.id),
    ),
  );
  const depth =
    params.depth === "F" || params.depth === "I"
      ? params.depth
      : params.depth === "B"
        ? "B"
        : freshFocus
          ? "F"
          : "B";
  const target =
    p1FidelityPack.items.find(
      (item) => item.id === params.item && item.availability !== "UNAVAILABLE",
    )?.id ?? (params.depth ? "syn-p1-exact" : (freshFocus ?? "syn-p1-exact"));
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles),
    insets = useSafeAreaInsets(),
    headerHeight = useHeaderHeight();
  const [sheet, setSheet] = useState<"CONTROLS" | "ADD" | "ACTION" | null>(null);
  const [calendar, setCalendar] = useState(false),
    [pastIntroduction, setPastIntroduction] = useState(false),
    [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const list = useRef<DayListHandle | null>(null);
  const key = JSON.stringify([clock, depth, target]);
  const shell = useDayFeedShellState(key);
  const preview = () => setSheet("ACTION");
  const fixture = p1FidelityFixture(
    clock,
    {
      map: preview,
      navigate: preview,
      participants: preview,
      photos: preview,
      attachments: preview,
      expenses: preview,
      addPhoto: preview,
      addAttachment: preview,
      addExpense: preview,
      linkExpense: preview,
    },
    () => setSheet("ADD"),
  );
  const today = localCalendarDate(fixture.instant, fixture.zone);
  const range = formatDayFeedVisibleDates({
    first: fixture.dateRange.start,
    last: fixture.dateRange.end,
  });
  const tripRange = t("fidelity.tripRange", {
    range,
    days: formatUiNumber(fixture.dates.length),
  });
  const label = selectedDate ?? shell.visibleDates?.first ?? fixture.selectedDate;
  const visibleRange = shell.visibleDates ?? {
    first: fixture.selectedDate,
    last: fixture.selectedDate,
  };
  const title = pastIntroduction ? (
    <UiGlassSurface style={styles.dateIsland}>
      <DayFeedShellTitle
        label={formatDayFeedVisibleDates(visibleRange)}
        openCalendarLabel={t("dayShell.calendar.open")}
        onOpenCalendar={() => setCalendar(true)}
      />
    </UiGlassSurface>
  ) : (
    <NavigationContextTitle title={fixture.title} />
  );
  const phase = (date: string) =>
    date < today ? colors.dayPast : date === today ? colors.surface : colors.dayFuture;
  return (
    <>
      <Stack.Screen
        options={{
          ...navigationContentFrameOptions,
          headerShown: true,
          headerBackVisible: false,
          headerShadowVisible: false,
          headerTitle: () => title,
          headerStyle: {
            backgroundColor: pastIntroduction
              ? colors.transparent
              : colors.tripIntroduction,
          },
          headerBlurEffect:
            pastIntroduction && shell.navigationVisible
              ? "systemUltraThinMaterial"
              : undefined,
        }}
      />
      {!pastIntroduction || shell.navigationVisible ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="line.3.horizontal"
              accessibilityLabel={t("dayLab.title")}
              onPress={() => setSheet("CONTROLS")}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="magnifyingglass"
              accessibilityLabel={t("search.search")}
              onPress={() => setSheet("CONTROLS")}
            />
          </Stack.Toolbar>
        </>
      ) : null}
      <NavigationContentFrame underlapHeader>
        <DayFeed
          key={key}
          projection={fixture.projection}
          date={fixture.selectedDate}
          dates={fixture.dates}
          zone={fixture.zone}
          instant={fixture.instant}
          services={fixture.services}
          renderer={fixture.renderer}
          bottomInset={insets.bottom + 90}
          entry={{
            revision: 1,
            kind: "RESUME",
            reading: { offset: 0, focus: depth === "B" ? null : target },
          }}
          directItem={
            depth === "I"
              ? { itemId: target, onClose: () => router.setParams({ depth: "F" }) }
              : undefined
          }
          presentation={{
            listRef: (value) => {
              list.current = value;
            },
            header: (
              <View
                style={{
                  paddingTop: headerHeight,
                  backgroundColor: colors.tripIntroduction,
                }}
              >
                <DayFeedIntroduction
                  fidelity
                  tripName={fixture.title}
                  rangeLabel={tripRange}
                  locationSummary={p1FidelityPack.trip.destinations[0].displayLabel}
                  openCalendarLabel={t("dayShell.calendar.open")}
                  onOpenCalendar={() => setCalendar(true)}
                />
              </View>
            ),
            topInset: headerHeight,
            listStyle: styles.mint,
            listContentStyle: { backgroundColor: phase(fixture.dateRange.end) },
            showTimeUnspecified: false,
            immersiveContentStyle: { paddingHorizontal: 0, paddingBottom: 0 },
            renderImmersiveHeader: (onClose) => (
              <SheetHeader title="" leftLabel={t("common.back")} onLeft={onClose} />
            ),
            renderDayHeading: (date, empty) => (
              <DayFeedFidelityHeading
                date={date}
                start={fixture.dateRange.start}
                today={today}
                empty={empty}
                dayColor={phase(date)}
                previousColor={
                  date === fixture.dateRange.start
                    ? colors.tripIntroduction
                    : phase(
                        new Date(Date.parse(date + "T12:00:00Z") - 86400000)
                          .toISOString()
                          .slice(0, 10),
                      )
                }
                onAdd={date >= today ? () => setSheet("ADD") : undefined}
              />
            ),
            wrapDayRow: (date, content) => (
              <View style={{ backgroundColor: phase(date), paddingHorizontal: 21 }}>
                {content}
              </View>
            ),
            onOffsetChange: (offset) => {
              shell.observeScroll(offset, false);
              setPastIntroduction(offset > 111);
            },
            onReadingMotion: shell.observeReadingMotion,
            onViewportChange: (viewport) =>
              shell.observeVisibleDates({
                first: viewport.firstVisibleDate,
                last: viewport.lastVisibleDate,
              }),
            onInteraction: () => setSelectedDate(null),
            onSummaries: setSummaries,
          }}
        />
        {pastIntroduction ? (
          <View
            pointerEvents="none"
            style={[styles.statusCover, { height: insets.top }]}
          />
        ) : null}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          <ExperienceBottomShell
            visible={!pastIntroduction || shell.navigationVisible}
            pathname="/"
          />
        </View>
      </NavigationContentFrame>
      <DayFeedCalendarSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        onSelect={(date) => {
          setCalendar(false);
          setSelectedDate(date);
          list.current?.jumpToDayHeader(date);
        }}
        tripName={fixture.title}
        rangeLabel={tripRange}
        tripStart={fixture.dateRange.start}
        tripEnd={fixture.dateRange.end}
        dates={fixture.dates}
        selectedDate={label}
        summaries={summaries}
        copy={{
          unknownBounds: t("dayShell.calendar.unknownBounds"),
          markers: {
            Plans: t("dayShell.calendar.plans"),
            Stay: t("dayShell.calendar.stay"),
            Transport: t("dayShell.calendar.transport"),
          },
        }}
      />
      <Modal
        visible={!!sheet}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.sheet}>
          <SheetHeader
            category="action"
            title={t(sheet === "ADD" ? "formEntry.title" : "dayLab.title")}
            onLeft={() => setSheet(null)}
          />
          <ScrollView
            style={styles.sheet}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.controls}
          >
            {sheet === "CONTROLS" ? (
              <>
                {(["future", "today", "past"] as const).map((c) => (
                  <View key={c} style={styles.matrix}>
                    {(["B", "F", "I"] as const).map((d) => (
                      <UiButton
                        key={d}
                        label={t("fidelity.cell", {
                          context: t(`fidelity.${c}`),
                          depth: t(`fidelity.depth${d}`),
                        })}
                        variant="secondary"
                        onPress={() => {
                          setSheet(null);
                          router.setParams({ clock: c, depth: d });
                        }}
                      />
                    ))}
                  </View>
                ))}
                {p1FidelityPack.items
                  .filter((x) => x.availability !== "UNAVAILABLE")
                  .map((item) => (
                    <UiButton
                      key={item.id}
                      label={item.title}
                      variant="text"
                      onPress={() => {
                        setSheet(null);
                        router.setParams({ item: item.id, depth: "F" });
                      }}
                    />
                  ))}
              </>
            ) : sheet === "ADD" ? (
              <>
                {manualItineraryTypes.map((type) => (
                  <UiButton
                    key={type.id}
                    label={t(type.labelKey)}
                    variant="secondary"
                    onPress={preview}
                  />
                ))}
              </>
            ) : (
              <UiText style={styles.meta}>{t("fidelity.previewOnly")}</UiText>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    mint: { backgroundColor: c.tripIntroduction },
    dateIsland: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: visual.radius.pill,
    },
    statusCover: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: c.background,
    },
    sheet: { flex: 1, backgroundColor: c.background },
    controls: { padding: 16, gap: 12 },
    matrix: { gap: 8 },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
