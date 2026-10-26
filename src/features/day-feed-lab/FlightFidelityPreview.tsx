import { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NavigationContentFrame,
  NavigationContextTitle,
} from "@/components/navigationChrome";
import { ExperienceBottomShell } from "@/components/ExperienceBottomShell";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton } from "@/ui/controls";
import { t, setUiLocale } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { DayFeed } from "@/features/day-feed/DayFeed";
import {
  DayFeedIntroduction,
  DayFeedShellTitle,
  formatDayFeedVisibleDates,
  useDayFeedShellState,
} from "@/features/day-feed/DayFeedShell";
import { DayFeedFidelityHeading } from "@/features/day-feed/DayFeedFidelityHeading";
import { ManualItineraryChooser } from "@/features/day-feed/ManualItineraryContent";
import { UiGlassSurface } from "@/ui/UiGlassSurface";
import { dayFeedPhaseColor } from "@/features/day-feed/dayFeedAppearance";
import {
  flightFidelityFixture,
  flightSamples,
  flightFidelityFocusKey,
  type FidelityAction,
} from "./flightFidelityFixture";
import { stayFidelityFixture, staySamples } from "./stayFidelityFixture";
import { useStayFixtureMove } from "./useStayFixtureMove";
import type { StayRole } from "@/features/day-feed/StayReadView";
import { composeDayStream } from "@/features/day-feed/composition";
import type { DayListHandle } from "@/features/day-feed/WindowedDayList";
import { FixtureActionSheet, type FixtureAction } from "./FixtureActionSheet";
export function FlightFidelityPreview() {
  const params = useLocalSearchParams<{
    locale?: string;
    item?: string;
    fidelity?: string;
    role?: string;
    scenario?: string;
    clock?: string;
    depth?: string;
    leg?: string;
  }>();
  return <FlightScene params={params} />;
}
function FlightScene({
  params,
}: {
  params: {
    locale?: string;
    item?: string;
    fidelity?: string;
    role?: string;
    scenario?: string;
    clock?: string;
    depth?: string;
    leg?: string;
  };
}) {
  useUiLocale();
  const s = useThemedStyles(styles),
    c = useUiTheme(),
    measuredHeader = useHeaderHeight(),
    safe = useSafeAreaInsets();
  const [retainedHeader, setRetainedHeader] = useState(
    Math.max(measuredHeader, safe.top),
  );
  if (measuredHeader > safe.top && measuredHeader !== retainedHeader)
    setRetainedHeader(measuredHeader);
  const header = Math.max(measuredHeader, retainedHeader, safe.top);
  const [controls, setControls] = useState(false),
    [action, setAction] = useState<FixtureAction | null>(null),
    [add, setAdd] = useState<{
      legId: string;
      date: string;
      side: "BEFORE" | "AFTER";
    } | null>(null),
    [offset, setOffset] = useState(0),
    [intro, setIntro] = useState(111);
  const { locale: qaLocale, ...sceneParams } = params;
  useEffect(() => {
    if (qaLocale === "en" || qaLocale === "zh-Hans") setUiLocale(qaLocale);
  }, [qaLocale]);
  const key = JSON.stringify(sceneParams),
    isStay = params.fidelity === "p3";
  const role: StayRole =
    params.role === "CHECKOUT" ? "CHECKOUT" : params.role === "BASE" ? "BASE" : "CHECKIN";
  const shell = useDayFeedShellState(key);
  const list = useRef<DayListHandle | null>(null);
  const move = useStayFixtureMove(
    list,
    params.scenario ?? "syn-stay-full",
    params.clock ?? "today",
    role,
    safe.top,
    safe.bottom,
    () => shell.observeReadingStopped(),
  );
  const preview: FidelityAction = (title, text, choices) =>
    setAction({ title, text, choices });
  const open = (leg: string) =>
    router.push({ pathname: "/flight-fidelity-detail", params: { ...params, leg } });
  const flight = isStay
    ? null
    : flightFidelityFixture(
        params.scenario ?? "syn-p2-full",
        params.clock ?? "today",
        preview,
        open,
        (legId, date, side) => setAdd({ legId, date, side }),
      );
  const stay = isStay
    ? stayFidelityFixture(
        params.scenario ?? "syn-stay-full",
        params.clock ?? "today",
        preview,
        (role, date, item) =>
          router.push({
            pathname: "/stay-fidelity-detail",
            params: { ...params, role, date, item },
          }),
        (role, date, side) => setAdd({ legId: role, date, side }),
        role,
        {
          previews: move.previews,
          start: move.handlers.start,
          wrapRow: move.wrapRow,
          wrapClock: move.wrapClock,
        },
        (role, focused) => router.setParams({ role, depth: focused ? "F" : "B" }),
      )
    : null;
  const fixture = stay ?? flight!;
  const selectedStay = stay?.stays.find((s) => s.id === params.item) ?? stay?.stay;
  const target =
    flight?.journey.legs.find((l) => l.id === params.leg) ?? flight?.journey.legs[0];
  const targetDate = stay
    ? role === "CHECKOUT"
      ? selectedStay!.end
      : role === "BASE"
        ? (stay.dates.find((d) => d > selectedStay!.start && d < selectedStay!.end) ??
          selectedStay!.start)
        : selectedStay!.start
    : (target?.flight.canonical.boundaries[0].local_date ?? fixture.selectedDate);
  const focusKey = stay
    ? composeDayStream(stay.query!(targetDate, stay.zone), stay.instant, {
        occurrenceFocus: true,
      }).rows.find((row) => row.item.event.id === selectedStay?.id)?.focusKey
    : flightFidelityFocusKey(flight!, target!.id);
  const directDetail = useRef<string | null>(null);
  useEffect(() => {
    if (params.depth === "I" && directDetail.current !== key) {
      directDetail.current = key;
      if (isStay)
        router.push({
          pathname: "/stay-fidelity-detail",
          params: { ...params, role, date: targetDate, item: selectedStay!.id },
        });
      else
        router.push({
          pathname: "/flight-fidelity-detail",
          params: { ...params, leg: target!.id },
        });
    }
    // Params pin the fixture and origin; Back must not reopen the detail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const reading = offset >= intro && !shell.navigationVisible;
  const [sceneKey, setSceneKey] = useState(key);
  if (sceneKey !== key) {
    setSceneKey(key);
    setOffset(0);
    setIntro(111);
    setAdd(null);
    setControls(false);
    setAction(null);
  }
  const today = fixture.instant.slice(0, 10);
  const dateTitle = formatDayFeedVisibleDates(
    shell.visibleDates ?? { first: fixture.selectedDate, last: fixture.selectedDate },
  );
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: !reading && !(isStay && move.active),
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: offset < intro ? c.tripIntroduction : c.transparent,
          },
          title: "",
          headerTitle: () =>
            offset < intro ? (
              <NavigationContextTitle title={fixture.title} />
            ) : (
              <UiGlassSurface style={s.island}>
                <DayFeedShellTitle
                  label={dateTitle}
                  openCalendarLabel={t("dayShell.calendar.open")}
                  onOpenCalendar={() => setControls(true)}
                />
              </UiGlassSurface>
            ),
        }}
      />
      {!reading && !(isStay && move.active) ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="line.3.horizontal"
              accessibilityLabel={t("dayLab.title")}
              onPress={() => setControls(true)}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="magnifyingglass"
              accessibilityLabel={t("search.search")}
              onPress={() => setControls(true)}
            />
          </Stack.Toolbar>
        </>
      ) : null}
      <NavigationContentFrame underlapHeader>
        <View style={{ flex: 1 }} {...(isStay ? move.touchHandlers : {})}>
          <DayFeed
            key={key}
            projection={fixture.projection}
            date={fixture.selectedDate}
            dates={fixture.dates}
            zone={fixture.zone}
            instant={fixture.instant}
            services={fixture.services}
            query={fixture.query}
            ports={{ occurrenceFocus: true }}
            renderer={fixture.renderer}
            bottomInset={90}
            entry={{
              revision: 1,
              kind: "RESUME",
              reading: {
                offset: 0,
                focus: params.depth === "B" ? null : (focusKey ?? null),
                anchor: {
                  key: `day:${targetDate}`,
                  date: targetDate,
                  within: 0,
                },
              },
            }}
            presentation={{
              topInset: header,
              listRef: (value) => {
                list.current = value;
              },
              scrollEnabled: !isStay || !move.active,
              listStyle: { backgroundColor: c.tripIntroduction },
              listContentStyle: {
                backgroundColor: dayFeedPhaseColor(fixture.dateRange.end, today, c),
              },
              showTimeUnspecified: false,
              header: (
                <View
                  onLayout={(e) =>
                    setIntro(Math.max(0, e.nativeEvent.layout.height - header))
                  }
                  style={{ paddingTop: header }}
                >
                  <DayFeedIntroduction
                    fidelity
                    onOpenCalendar={() => setControls(true)}
                    locationSummary={flight?.locationSummary}
                    tripName={fixture.title}
                    rangeLabel={formatDayFeedVisibleDates({
                      first: fixture.dateRange.start,
                      last: fixture.dateRange.end,
                    })}
                  />
                </View>
              ),
              renderDayHeading: (date, empty) =>
                isStay ? (
                  move.wrapRow(
                    `day:${date}`,
                    date,
                    <DayFeedFidelityHeading
                      date={date}
                      start={fixture.dateRange.start}
                      today={today}
                      empty={empty}
                      previousColor={
                        fixture.dates.indexOf(date) > 0
                          ? dayFeedPhaseColor(
                              fixture.dates[fixture.dates.indexOf(date) - 1],
                              today,
                              c,
                            )
                          : c.tripIntroduction
                      }
                      dayColor={dayFeedPhaseColor(date, today, c)}
                    />,
                  )
                ) : (
                  <DayFeedFidelityHeading
                    date={date}
                    start={fixture.dateRange.start}
                    today={today}
                    empty={empty}
                    previousColor={
                      fixture.dates.indexOf(date) > 0
                        ? dayFeedPhaseColor(
                            fixture.dates[fixture.dates.indexOf(date) - 1],
                            today,
                            c,
                          )
                        : c.tripIntroduction
                    }
                    dayColor={dayFeedPhaseColor(date, today, c)}
                  />
                ),
              wrapDayRow: (date, child) => (
                <View
                  style={{
                    backgroundColor: dayFeedPhaseColor(date, today, c),
                    paddingHorizontal: visual.space.feedGutter,
                  }}
                >
                  {child}
                </View>
              ),
              onOffsetChange: setOffset,
              onReadingMotion: shell.observeReadingMotion,
              onViewportChange: (v) =>
                shell.observeVisibleDates({
                  first: v.firstVisibleDate,
                  last: v.lastVisibleDate,
                }),
            }}
          />
          {isStay ? move.overlay : null}
        </View>
        {reading && !(isStay && move.active) ? (
          <View pointerEvents="box-none" style={[s.dateOverlay, { top: safe.top }]}>
            <UiGlassSurface style={s.island}>
              <DayFeedShellTitle
                label={dateTitle}
                openCalendarLabel={t("dayShell.calendar.open")}
                onOpenCalendar={() => setControls(true)}
              />
            </UiGlassSurface>
          </View>
        ) : null}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          style={StyleSheet.absoluteFill}
        >
          <ExperienceBottomShell
            visible={!reading && !(isStay && move.active)}
            pathname="/"
          />
        </View>
      </NavigationContentFrame>
      {isStay ? move.confirmation : null}
      <FixtureActionSheet value={action} onClose={() => setAction(null)} />
      <Modal transparent visible={add !== null} onRequestClose={() => setAdd(null)}>
        <ManualItineraryChooser
          onClose={() => setAdd(null)}
          onChoose={() => {
            const context = add;
            setAdd(null);
            preview(
              t("fidelity.previewOnly"),
              context
                ? `${context.date} · ${t(context.side === "BEFORE" ? "fidelity.addAbove" : "fidelity.addBelow")} · ${flight?.journey.legs.find((leg) => leg.id === context.legId)?.flight.numberLiteral ?? ""}`
                : undefined,
            );
          }}
        />
      </Modal>
      <Modal transparent visible={controls} onRequestClose={() => setControls(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <SheetHeader
              category="action"
              surface="background"
              safeTop={false}
              title={t("dayLab.title")}
              onLeft={() => setControls(false)}
            />
            <ScrollView contentContainerStyle={s.content}>
              <View style={s.row}>
                <UiButton
                  variant="text"
                  label={t("navigation.english")}
                  onPress={() => {
                    setUiLocale("en");
                    setControls(false);
                  }}
                />
                <UiButton
                  variant="text"
                  label={t("navigation.chinese")}
                  onPress={() => {
                    setUiLocale("zh-Hans");
                    setControls(false);
                  }}
                />
              </View>
              {(isStay ? staySamples : flightSamples).map((item) => (
                <UiButton
                  key={item.id}
                  variant="text"
                  label={item.label ?? item.title}
                  onPress={() => {
                    setControls(false);
                    router.setParams({ scenario: item.id });
                  }}
                />
              ))}
              {isStay ? (
                <View style={s.row}>
                  {(["CHECKIN", "BASE", "CHECKOUT"] as const).map((role) => (
                    <UiButton
                      key={role}
                      variant="text"
                      label={t(
                        role === "CHECKIN"
                          ? "p3.role.checkin"
                          : role === "CHECKOUT"
                            ? "p3.role.checkout"
                            : "p3.role.base",
                      )}
                      onPress={() => {
                        setControls(false);
                        router.setParams({ role, depth: "F" });
                      }}
                    />
                  ))}
                </View>
              ) : null}
              {(["future", "today", "past"] as const).map((clock) => (
                <View key={clock} style={s.row}>
                  {["B", "F", "I"].map((depth) => (
                    <UiButton
                      key={depth}
                      variant="text"
                      label={`${t(`fidelity.${clock}`)} · ${depth}`}
                      onPress={() => {
                        setControls(false);
                        router.setParams({ clock, depth });
                      }}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    island: { minHeight: 44, paddingHorizontal: 12, borderRadius: visual.radius.pill },
    dateOverlay: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
    sheet: {
      maxHeight: "85%",
      backgroundColor: c.background,
      borderRadius: visual.radius.sheet,
    },
    content: { padding: 16 },
    row: { flexDirection: "row", flexWrap: "wrap" },
  });
