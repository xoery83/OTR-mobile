import { dayFeedPhaseColor } from "@/features/day-feed/dayFeedAppearance";
import { useEffect, useRef, useState } from "react";
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
import { itemsForLocalDate, localCalendarDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
import { p1InsertionTime } from "@/features/day-feed/p1InsertionTime";
import { UiButton, UiText } from "@/ui/controls";
import { UiGlassSurface } from "@/ui/UiGlassSurface";
import { t, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { useP1FixtureMove, P1MeasuredMoveRegion } from "./useP1FixtureMove";
import { ManualItineraryChooser } from "@/features/day-feed/ManualItineraryContent";
import { P1PlanEditor } from "@/features/day-feed/P1PlanEditor";
import type { ManualPlanFields } from "@/data/repositories/manualPlanRepository";
import {
  p1FidelityFixture,
  p1FidelityFocusKey,
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
  const [sheet, setSheet] = useState<"CONTROLS" | "ADD" | "PLAN" | "ACTION" | null>(null);
  const [calendar, setCalendar] = useState(false),
    [scrollOffset, setScrollOffset] = useState(0),
    [originIndex, setOriginIndex] = useState(0),
    [introductionHeight, setIntroductionHeight] = useState(111),
    [summaries, setSummaries] = useState<DaySummary[]>([]);
  const pastIntroduction = originIndex > 0 || scrollOffset > introductionHeight;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarRevision, setCalendarRevision] = useState(1);
  const [insertion, setInsertion] = useState<{
    side: "BEFORE" | "AFTER";
    itemId: string;
    date: string;
    startTime: string | null;
  } | null>(null);
  const list = useRef<DayListHandle | null>(null);
  const key = JSON.stringify([clock, depth, target]);

  const [sceneKey, setSceneKey] = useState(key);
  // Keep Stack.Screen mounted: remounting it during a virtualized deep jump loses the iOS title.
  if (sceneKey !== key) {
    setSceneKey(key);
    setSheet(null);
    setCalendar(false);
    setScrollOffset(0);
    setOriginIndex(0);
    setIntroductionHeight(111);
    setSummaries([]);
    setSelectedDate(null);
    setCalendarRevision(1);
    setInsertion(null);
  }
  const targetFocusKey = p1FidelityFocusKey(initialFixture, target);
  const targetDate =
    p1FidelityPack.items.find((item) => item.id === target)?.date ??
    initialFixture.selectedDate;
  const shell = useDayFeedShellState(key);
  const move = useP1FixtureMove(
    list,
    `${key}:visual-grounded-v7`,
    insets.top,
    insets.bottom,
    () => shell.observeReadingStopped(),
  );
  const preview = () => setSheet("ACTION");
  const openDetail = (itemId: string) =>
    router.push({
      pathname: "/p1-fidelity-detail",
      params: {
        clock,
        item: itemId,
        ...(move.previews[itemId]
          ? {
              placement: JSON.stringify({
                date: move.previews[itemId].date,
                time: move.previews[itemId].time,
              }),
            }
          : {}),
      },
    });
  const directDetail = useRef<string | null>(null);
  useEffect(() => {
    if (depth === "I" && directDetail.current !== key) {
      directDetail.current = key;
      router.push({ pathname: "/p1-fidelity-detail", params: { clock, item: target } });
    }
  }, [depth, key, clock, target]);
  const insertionLabel = insertion
    ? t(
        insertion.side === "BEFORE"
          ? "fidelity.insertBeforeContext"
          : "fidelity.insertAfterContext",
        {
          title: p1FidelityPack.items.find((x) => x.id === insertion.itemId)?.title ?? "",
          date: insertion.date,
        },
      )
    : undefined;
  const insertionContext = insertion?.startTime
    ? `${insertionLabel} · ${t("fidelity.suggestedStart", { time: insertion.startTime })}`
    : insertionLabel;
  const newPlanFields: ManualPlanFields = {
    title: "",
    startDate: insertion?.date ?? selectedDate ?? initialFixture.selectedDate,
    startTime: insertion?.startTime ?? null,
    endDate: null,
    endTime: null,
    location: null,
    description: null,
    participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  };

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
    (side, itemId, date) => {
      const rows = composeDayStream(
        itemsForLocalDate(fixture.projection, date, fixture.zone),
        fixture.instant,
      ).rows.map((row) => row.item.event);
      const suggested = p1InsertionTime(rows, itemId, side, date);
      setInsertion({ side, itemId, date, startTime: suggested.startTime });
      setSheet("ADD");
    },
    openDetail,
    move,
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
  const phase = (date: string) => dayFeedPhaseColor(date, today, colors);
  return (
    <>
      <Stack.Screen
        options={{
          ...navigationContentFrameOptions,
          headerShown: true,
          headerBackVisible: false,
          headerShadowVisible: false,
          title: move.active ? "" : fixture.title,
          headerTitle: move.active ? "" : () => title,
          headerStyle: {
            backgroundColor:
              move.active || pastIntroduction
                ? colors.transparent
                : colors.tripIntroduction,
          },
          headerBlurEffect:
            !move.active && pastIntroduction && shell.navigationVisible
              ? "systemUltraThinMaterial"
              : undefined,
        }}
      />
      {!move.active && (!pastIntroduction || shell.navigationVisible) ? (
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
      <View style={styles.stage} {...move.touchHandlers}>
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
              revision: calendarRevision,
              kind: "RESUME",
              reading: {
                offset: 0,
                focus:
                  calendarRevision > 1 || depth === "B" ? null : (targetFocusKey ?? null),
                ...(calendarRevision === 1 &&
                depth !== "B" &&
                targetFocusKey &&
                (targetDate !== fixture.selectedDate || !params.depth)
                  ? { anchor: { key: targetFocusKey, date: targetDate, within: 0 } }
                  : {}),
                ...(calendarRevision > 1 && selectedDate
                  ? {
                      anchor: {
                        key: `day:${selectedDate}`,
                        date: selectedDate,
                        within: 0,
                      },
                    }
                  : {}),
              },
            }}
            presentation={{
              scrollEnabled: !move.active,
              listRef: (value) => {
                list.current = value;
              },
              header: (
                <View
                  onLayout={({ nativeEvent }) =>
                    setIntroductionHeight(
                      Math.max(0, nativeEvent.layout.height - headerHeight),
                    )
                  }
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
              renderDayHeading: (date, empty) => (
                <P1MeasuredMoveRegion
                  regionKey={`day:${date}`}
                  date={date}
                  register={move.register}
                  unregister={move.unregister}
                >
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
                    onAdd={
                      date >= today
                        ? () => {
                            setInsertion(null);
                            setSelectedDate(date);
                            setSheet("ADD");
                          }
                        : undefined
                    }
                  />
                </P1MeasuredMoveRegion>
              ),
              wrapDayRow: (date, content) => (
                <View
                  style={{
                    backgroundColor: phase(date),
                    paddingHorizontal: visual.space.feedGutter,
                  }}
                >
                  {content}
                </View>
              ),
              onOffsetChange: (offset) => {
                shell.observeScroll(offset, false);
                if (
                  !move.active ||
                  offset > introductionHeight !== scrollOffset > introductionHeight
                )
                  setScrollOffset(offset);
              },
              onReadingMotion: shell.observeReadingMotion,
              onViewportChange: (viewport) => {
                setOriginIndex(viewport.originIndex);
                shell.observeVisibleDates({
                  first: viewport.firstVisibleDate,
                  last: viewport.lastVisibleDate,
                });
              },
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
              visible={!move.active && (!pastIntroduction || shell.navigationVisible)}
              pathname="/"
            />
          </View>
        </NavigationContentFrame>
        {move.overlay}
      </View>
      {move.confirmation}
      <DayFeedCalendarSheet
        visible={calendar}
        onClose={() => setCalendar(false)}
        onSelect={(date) => {
          setCalendar(false);
          setSelectedDate(date);
          setCalendarRevision((revision) => revision + 1);
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
        transparent
        presentationStyle="overFullScreen"
        animationType="slide"
        onRequestClose={() => setSheet(null)}
      >
        <View style={sheet === "ADD" ? styles.transparentSheet : styles.modalBackdrop}>
          {sheet === "ADD" ? (
            <ManualItineraryChooser
              contextLabel={insertionContext}
              onClose={() => setSheet(null)}
              onChoose={(id) => setSheet(id === "P1" ? "PLAN" : "ACTION")}
            />
          ) : sheet === "PLAN" ? (
            <View style={styles.modalBody}>
              <P1PlanEditor
                embedded
                tripId={fixture.id}
                previewFields={newPlanFields}
                previewContextLabel={insertionContext}
                onClose={() => setSheet(null)}
                onSaved={() => {}}
              />
            </View>
          ) : (
            <View style={styles.modalBody}>
              <SheetHeader
                category="action"
                title={t("dayLab.title")}
                onLeft={() => setSheet(null)}
              />
              <ScrollView
                style={styles.sheet}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.controls}
              >
                {sheet === "CONTROLS" ? (
                  <>
                    <UiButton
                      label={t("fidelity.moveLayoutPreview")}
                      variant="secondary"
                      onPress={() => {
                        setSheet(null);
                        move.showConfirmationPreview("syn-p1-exact");
                      }}
                    />
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
                ) : (
                  <UiText style={styles.meta}>{t("fidelity.previewOnly")}</UiText>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    stage: { flex: 1 },
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
    transparentSheet: { flex: 1, backgroundColor: c.transparent },
    modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay },
    modalBody: {
      height: "90%",
      backgroundColor: c.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      overflow: "hidden",
    },
    controls: { padding: 16, gap: 12 },
    matrix: { gap: 8 },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
