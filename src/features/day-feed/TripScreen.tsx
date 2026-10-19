import {
  DayFeedIntroduction,
  DayFeedShellTitle,
  formatDayFeedVisibleDates,
  useDayFeedShellState,
} from "./DayFeedShell";
import { dayFeedCalendarBounds, DayFeedCalendarSheet } from "./DayFeedCalendarSheet";
import type { DayListHandle } from "./WindowedDayList";
import type { DaySummary } from "./dayFeedWindow";
import {
  readLocalTripDiscoveryRepository,
  type TripListSummary,
} from "@/data/repositories/tripDiscoveryRepository";
import { LocalCoreItemPreview } from "./LocalCoreItemPreview";
import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import {
  readTripTodaysJourney,
  type createTripTodaysJourneyReader,
} from "@/data/repositories/tripTodaysJourneyRepository";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { referenceTripHomePerspective } from "./referenceTripHomePerspective";
import { TodaysJourneyWidget } from "./TodaysJourneyWidget";
import { useBottomShellHeight } from "@/ui/useBottomShellHeight";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  router,
  useLocalSearchParams,
  useNavigation,
  usePathname,
  useFocusEffect,
} from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripDayFeed,
  type createTripDayFeedReader,
} from "@/data/repositories/tripDayFeedRepository";
import { UiButton, UiText as ThemedText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { t, formatUiDate, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { boundaryZone, viewContext } from "./presentation";
import { DayFeed } from "./DayFeed";
import { wholeTripCalendarDates } from "./tripListPresentation";
import { tripCoreDayNumber } from "./tripCoreDayNumber";
import { createCoreExperienceRenderer } from "./coreExperienceRenderer";
import { acceptedHomeHeader, useTripView } from "./TripViewContext";
import { LocalTripWorkspace } from "./LocalTripWorkspace";
import type { TodayEntry } from "./MyTripsList";
import {
  resolvedWorkspaceKind,
  type WorkspaceKind,
  type WorkspaceResolution,
} from "./tripWorkspaceRoute";
import { JourneySnapshotWidget } from "./JourneySnapshotWidget";
import {
  readTripJourneySnapshot,
  type createTripJourneySnapshotReader,
} from "@/data/repositories/tripJourneySnapshotRepository";
type SnapshotReader = ReturnType<typeof createTripJourneySnapshotReader>;
type SnapshotItem = NonNullable<Awaited<ReturnType<SnapshotReader["resolveItem"]>>>;
type SnapshotRead = NonNullable<Awaited<ReturnType<SnapshotReader["read"]>>>;
type LocalItem = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof createTripTodaysJourneyReader>["resolveLocalItem"]>
  >
>;
type Reader = ReturnType<typeof createTripDayFeedReader>;
type TripRead = Awaited<ReturnType<Reader["trip"]>>;
const value = (p: string | string[] | undefined) => (typeof p === "string" ? p : "");

function savedTripZone(
  view: { tripId: string; zone: string | null; generation: number } | null,
  tripId: string,
  generation: number,
) {
  if (!view || !view.zone || view.tripId !== tripId || view.generation !== generation)
    return null;
  try {
    return viewContext("2000-01-01", view.zone).zone;
  } catch {
    return null;
  }
}

export function TripScreen({ today = false }: { today?: boolean }) {
  const params = useLocalSearchParams();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view } = useTripView();
  return (
    <TripContent
      key={JSON.stringify([generation, today ? view : params])}
      today={today}
    />
  );
}
function TripContent({ today = false }: { today?: boolean }) {
  const pathname = usePathname();
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const insets = useSafeAreaInsets();
  const headerBottom = Math.max(useHeaderHeight(), insets.top);
  const heroHeight = useRef(0);
  const homeScrollOffset = useRef(0);
  const [heroBehindStatus, setHeroBehindStatus] = useState(true);
  const onHomeHeroHeight = useCallback(
    (height: number) => {
      heroHeight.current = height;
      setHeroBehindStatus(homeScrollOffset.current < height - headerBottom);
    },
    [headerBottom],
  );
  const navigation = useNavigation();
  const bottomBarHeight = useBottomShellHeight();
  const [headingHidden, setHeadingHidden] = useState(false);
  const headingBottom = useRef(0);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const {
    view,
    resumeView,
    select,
    switchTrip,
    entry,
    saveReading,
    enterHeader,
    publishDayShellChrome,
    quickActions,
  } = useTripView();
  const params = useLocalSearchParams<{
    tripId?: string;
    date?: string;
    zone?: string;
    viewMode?: string;
    view?: string;
    homeQaScenario?: string;
  }>();
  const [dayTripFacts, setDayTripFacts] = useState<{
    generation: number;
    trip: TripListSummary;
  } | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const dayList = useRef<DayListHandle>(null);
  const dayOffset = useRef(0);
  const dayOrigin = useRef(0);
  const dayIntroductionBottom = useRef<number | null>(null);
  const [dayPastIntroduction, setDayPastIntroduction] = useState(false);
  const [dayChromeOwner] = useState(() => Symbol("day-shell"));
  const [revision, setRevision] = useState(0);
  const [localItem, setLocalItem] = useState<LocalItem | null>(null);
  const [date, setDate] = useState(value(params.date));
  const [zone, setZone] = useState(value(params.zone));
  const [trip, setTrip] = useState<TripRead | null>(null);
  const [status, setStatus] = useState<"LOADING" | "UNAVAILABLE" | "READY">("LOADING");
  const [contextError, setContextError] = useState(false);
  const [homeItem, setHomeItem] = useState<{
    read: TripRead;
    date: string;
    zone: string;
    itemId: string;
    itemRevision: number;
  } | null>(null);
  const [homeSnapshot, setHomeSnapshot] = useState<SnapshotRead | null>(null);
  const home = params.view !== "day";
  const request = useRef(0);
  const requested = today
    ? (view?.tripId ?? "")
    : params.view === "trips" || params.view === "create"
      ? ""
      : value(params.tripId);
  const dayShell = useDayFeedShellState(JSON.stringify([requested, generation]));
  const dayFacts =
    dayTripFacts?.generation === generation && dayTripFacts.trip.id === requested
      ? dayTripFacts.trip
      : null;
  const dayName = dayFacts?.name ?? t("navigation.trip");
  const dayBounds = dayFeedCalendarBounds(dayFacts?.startDate, dayFacts?.endDate);
  const dayRangeLabel = dayBounds
    ? (() => {
        const days =
          Math.round(
            (Date.parse(dayBounds.end + "T00:00:00Z") -
              Date.parse(dayBounds.start + "T00:00:00Z")) /
              86400000,
          ) + 1;
        const format = (value: string) =>
          formatUiDate(new Date(value + "T12:00:00Z"), {
            dateStyle: "medium",
            timeZone: "UTC",
          });
        return t(days === 1 ? "dayShell.range.one" : "dayShell.range.many", {
          start: format(dayBounds.start),
          end: format(dayBounds.end),
          days: formatUiNumber(days),
        });
      })()
    : null;
  const dayActive = !!requested && (today || params.view === "day");
  const dayTitle =
    dayPastIntroduction && dayShell.visibleDates
      ? formatDayFeedVisibleDates(dayShell.visibleDates)
      : "";
  useLayoutEffect(() => {
    if (!dayActive || !navigation.isFocused()) return;
    publishDayShellChrome(
      {
        tripId: requested,
        generation,
        owner: dayChromeOwner,
        navigationVisible: dayShell.navigationVisible,
      },
      dayChromeOwner,
    );
    return () => publishDayShellChrome(null, dayChromeOwner);
  }, [
    dayActive,
    requested,
    generation,
    dayChromeOwner,
    dayShell.navigationVisible,
    publishDayShellChrome,
    navigation,
  ]);
  const isMyTrips = !today && !requested && params.view !== "create";
  const immersiveHome = !today && home && !!requested;
  const headerTitle = isMyTrips
    ? t(headingHidden ? "dayFeed.myTrips" : "myTrips.appTitle")
    : requested && home
      ? heroBehindStatus
        ? ""
        : quickActions?.tripId === requested && quickActions.generation === generation
          ? quickActions.tripName
          : (dayFacts?.name ?? "")
      : dayActive
        ? dayTitle
        : t("navigation.trip");
  useLayoutEffect(() => {
    if (today && !dayActive) return;
    navigation.setOptions({
      headerTransparent: true,
      fullScreenGestureEnabled: immersiveHome,
      headerStyle: {
        backgroundColor: dayActive
          ? colors.floatingSurface
          : immersiveHome
            ? colors.transparent
            : colors.surface,
      },
      headerShadowVisible: false,
      headerBlurEffect:
        dayActive || (immersiveHome && !heroBehindStatus) ? "systemMaterial" : undefined,
      statusBarStyle: immersiveHome && heroBehindStatus ? "light" : "auto",
      headerTitle: ({
        onLayout,
      }: {
        onLayout?: import("react-native").TextProps["onLayout"];
      }) =>
        dayActive ? (
          dayTitle ? (
            <DayFeedShellTitle
              label={dayTitle}
              openCalendarLabel={t("dayShell.calendar.open")}
              onOpenCalendar={() => setCalendarVisible(true)}
            />
          ) : null
        ) : (
          <ThemedText onLayout={onLayout} numberOfLines={1} style={styles.navTitle}>
            {headerTitle}
          </ThemedText>
        ),
    });
  }, [
    navigation,
    today,
    headerTitle,
    styles.navTitle,
    immersiveHome,
    colors,
    heroBehindStatus,
    dayActive,
    dayTitle,
  ]);
  const visibleTrip =
    trip?.scope.generation === generation &&
    (trip.observed?.projection.tripId === requested ||
      trip.localManual?.scope.tripId === requested)
      ? trip
      : null;
  const homePerspective = referenceTripHomePerspective(
    visibleTrip,
    params.homeQaScenario,
    generation,
  );
  const [workspaceResolution, setWorkspaceResolution] =
    useState<WorkspaceResolution | null>(null);
  const knownTrip = useCallback(
    (kind: WorkspaceKind) => {
      if (generation !== getAccountGeneration()) return;
      setWorkspaceResolution({ tripId: requested, generation, kind });
      if (navigation.isFocused() && requested && (kind === "LOCAL" || kind === "CACHED"))
        switchTrip(requested, generation);
    },
    [requested, generation, switchTrip, navigation],
  );
  const workspaceKind = resolvedWorkspaceKind(workspaceResolution, requested, generation);
  const localChecked = workspaceKind !== null;
  const knownWorkspaceTrip = workspaceKind === "LOCAL" || workspaceKind === "CACHED";
  const hideHomePrelude = !today && home && knownWorkspaceTrip;
  const load = useCallback(async () => {
    const captured = getAccountGeneration(),
      ticket = ++request.current;
    await Promise.resolve();
    setStatus("LOADING");
    try {
      if (requested) {
        const reader = await readTripDayFeed();
        const result = await reader.trip(requested);
        if (getAccountGeneration() !== captured || ticket !== request.current) return;
        setTrip(result);
        const rootFacts = await readLocalTripDiscoveryRepository()
          .then((reader) => reader.readMerged())
          .then((read) => read.trips.find((row) => row.id === requested))
          .catch(() => undefined);
        if (getAccountGeneration() !== captured || ticket !== request.current) return;
        setDayTripFacts(rootFacts ? { generation: captured, trip: rootFacts } : null);
        if (
          !result.observed &&
          result.localManual?.scope.tripId === requested &&
          result.scope.generation === captured
        )
          knownTrip("LOCAL");
        if (
          navigation.isFocused() &&
          result.observed?.sourceStatus === "CURRENTLY_MATCHES_SOURCE" &&
          result.observed.projection.tripId === requested &&
          result.scope.generation === captured &&
          (view?.tripId !== requested || view.generation !== captured)
        )
          switchTrip(requested, captured);
        if (
          result.observed?.projection.version === 2 &&
          result.observed.sourceStatus === "CURRENTLY_MATCHES_SOURCE"
        ) {
          const snapshot = await readTripJourneySnapshot()
            .then((reader) => reader.read(requested))
            .catch(() => null);
          if (getAccountGeneration() !== captured || ticket !== request.current) return;
          if (
            snapshot?.scope.accountId === result.scope.accountId &&
            snapshot.scope.tripId === requested &&
            snapshot.scope.generation === captured &&
            snapshot.epoch === result.observed.projection.source.epoch
          )
            setHomeSnapshot(snapshot);
          else setHomeSnapshot(null);
        } else setHomeSnapshot(null);
        setStatus(result.observed || result.localManual ? "READY" : "UNAVAILABLE");
        if (!today && result.observed)
          setZone(
            (previous) => previous || boundaryZone(result.observed!.projection) || "",
          );
      } else if (!today) {
        if (getAccountGeneration() !== captured || ticket !== request.current) return;
        setStatus("READY");
      } else setStatus("READY");
    } catch {
      if (getAccountGeneration() === captured && ticket === request.current) {
        setTrip(null);
        setStatus("UNAVAILABLE");
      }
    }
  }, [requested, today, view, switchTrip, knownTrip, navigation]);
  useFocusEffect(
    useCallback(() => {
      void Promise.resolve().then(load);
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      return () => {
        request.current += 1;
        sub.remove();
      };
    }, [load]),
  );
  const open = (id: string) => {
    if (generation !== getAccountGeneration()) return;
    switchTrip(id.trim(), generation);
    if (params.view === "create") router.setParams({ view: "trips" });
    router.push({
      pathname: "/trip-home",
      params: { tripId: id.trim(), view: "home" },
    });
  };
  const backToTrips = useCallback(() => {
    if (generation !== getAccountGeneration()) return;
    select(null);
    if (pathname === "/trip-home" && router.canGoBack()) router.back();
    else
      router.replace({
        pathname: "/trip",
        params: { view: "trips", tripId: "" },
      });
  }, [select, generation, pathname]);
  const createTrip = () => {
    select(null);
    router.setParams({ tripId: "", date: "", zone: "", view: "create" });
  };
  const openToday = (id: string, context: TodayEntry) => {
    if (generation !== getAccountGeneration()) return;
    enterHeader({ tripId: id, ...context, generation }, "EXPLICIT_TODAY_HEADER");
    router.navigate({
      pathname: "/trip-home",
      params: {
        view: "day",
        tripId: id,
        date: context.date,
        zone: context.zone,
        ...(homePerspective ? { homeQaScenario: value(params.homeQaScenario) } : {}),
      },
    });
  };
  const canChooseDay =
    !!visibleTrip?.localManual ||
    visibleTrip?.observed?.sourceStatus === "CURRENTLY_MATCHES_SOURCE";
  const enterDay = useCallback(
    async (requestedDate?: string | null, requestedZone: string | null = zone) => {
      if (generation !== getAccountGeneration() || !canChooseDay || !visibleTrip) return;
      try {
        const selectedDate = requestedDate || date;
        const dateValue = selectedDate ? validateCalendarDate(selectedDate) : "";
        const context = dateValue
          ? viewContext(dateValue, requestedZone || { zone: null, viewMode: "FLOATING" })
          : null;
        const ticket = request.current;
        const result = await (await readTripDayFeed()).trip(requested);
        if (
          ticket !== request.current ||
          generation !== getAccountGeneration() ||
          (result.observed?.projection.tripId !== requested &&
            result.localManual?.scope.tripId !== requested) ||
          result.scope.accountId !== visibleTrip.scope.accountId ||
          result.scope.generation !== generation ||
          (!result.localManual &&
            result.observed?.sourceStatus !== "CURRENTLY_MATCHES_SOURCE")
        )
          return;
        if (context?.zone === null && result.observed?.projection.version === 1) {
          setContextError(true);
          return;
        }
        setTrip(result);
        if (context) select({ tripId: requested, ...context, generation });
        router.setParams({
          tripId: requested,
          date: dateValue,
          zone: context?.zone ?? "",
          ...(context?.zone === null
            ? { viewMode: "FLOATING" }
            : { viewMode: "NAMED_ZONE" }),
          view: "day",
        });
        setContextError(false);
      } catch {
        setContextError(true);
      }
    },
    [generation, canChooseDay, visibleTrip, date, zone, requested, select],
  );
  const freshLocalRead = async (expected: Pick<LocalManualRead, "scope" | "source">) => {
    if (
      expected.scope.tripId !== requested ||
      expected.scope.generation !== generation ||
      generation !== getAccountGeneration()
    )
      throw new Error("LOCAL_NAV_SCOPE");
    const ticket = request.current;
    const result = await (await readTripDayFeed()).trip(requested);
    if (
      ticket !== request.current ||
      generation !== getAccountGeneration() ||
      result.scope.accountId !== expected.scope.accountId ||
      result.scope.generation !== generation ||
      result.localManual?.source.fingerprint !== expected.source.fingerprint
    )
      throw new Error("LOCAL_NAV_UNAVAILABLE");
    return result;
  };
  const openLocalItem = async (
    id: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
  ) => {
    const ticket = request.current;
    const resolved = await (
      await readTripTodaysJourney()
    ).resolveLocalItem(requested, id, expected);
    if (!resolved || ticket !== request.current || generation !== getAccountGeneration())
      throw new Error("LOCAL_ITEM_UNAVAILABLE");
    const current = await freshLocalRead(resolved);
    setTrip(current);
    setLocalItem(resolved);
  };
  const manualItemSaved = useCallback(
    (tripId: string, captured: number) => {
      if (
        tripId !== requested ||
        captured !== generation ||
        captured !== getAccountGeneration()
      )
        return;
      setRevision((value) => value + 1);
      setLocalItem(null);
      void load();
    },
    [requested, generation, load],
  );
  const freshHomeRead = async (scope: SnapshotRead["scope"], epoch: string) => {
    if (
      scope.tripId !== requested ||
      scope.generation !== getAccountGeneration() ||
      scope.generation !== generation
    )
      throw new Error("HOME_NAV_SCOPE");
    const ticket = request.current;
    const result = await (await readTripDayFeed()).trip(requested);
    if (
      ticket !== request.current ||
      !result.observed ||
      result.observed.sourceStatus !== "CURRENTLY_MATCHES_SOURCE" ||
      result.scope.accountId !== scope.accountId ||
      result.scope.generation !== scope.generation ||
      getAccountGeneration() !== scope.generation ||
      result.observed.projection.version !== 2 ||
      result.observed.projection.source.epoch !== epoch
    )
      throw new Error("HOME_NAV_UNAVAILABLE");
    return result;
  };
  const homeProjection =
    visibleTrip?.observed?.projection.version === 2
      ? visibleTrip.observed.projection
      : null;
  const reviewZone =
    resumeView?.tripId === requested && resumeView.generation === generation
      ? resumeView.zone
      : homeProjection
        ? (acceptedHomeHeader(homeProjection.events, (date, zone) =>
            homeProjection.query(date, zone),
          )?.zone ?? null)
        : null;
  const reviewItinerary = reviewZone
    ? async ({
        scope,
        epoch,
        candidateDays,
      }: Pick<SnapshotRead, "scope" | "epoch" | "candidateDays">) => {
        await freshHomeRead(scope, epoch);
        const date = candidateDays[0];
        if (!date) throw new Error("HOME_HEADER_UNAVAILABLE");
        const ticket = request.current;
        const resolved = await (
          await readTripJourneySnapshot()
        ).resolveDayContext(requested, epoch, date, reviewZone);
        if (
          !resolved ||
          ticket !== request.current ||
          resolved.scope.accountId !== scope.accountId ||
          resolved.scope.generation !== generation ||
          generation !== getAccountGeneration()
        )
          throw new Error("HOME_HEADER_UNAVAILABLE");
        enterHeader(
          { tripId: requested, date: resolved.date, zone: resolved.zone, generation },
          "FIRST_VALID_PAST_DAY_HEADER",
        );
        router.setParams({
          tripId: requested,
          date: resolved.date,
          zone: resolved.zone,
          view: "day",
        });
      }
    : undefined;
  const openHomeItem = async (value: SnapshotItem) => {
    const itemRevision = value.item.itemRevision;
    if (
      typeof itemRevision !== "number" ||
      !Number.isSafeInteger(itemRevision) ||
      itemRevision < 1
    )
      throw new Error("HOME_ITEM_REVISION_UNAVAILABLE");
    const result = await freshHomeRead(value.scope, value.certificate.epoch);
    const projection = result.observed!.projection;
    if (projection.version !== 2) throw new Error("HOME_ITEM_UNAVAILABLE");
    const current = projection.items.find(
      (item) =>
        item.itemId === value.item.itemId &&
        item.itemRevision === value.item.itemRevision,
    );
    if (!current) throw new Error("HOME_RENDERER_UNAVAILABLE");
    const header = acceptedHomeHeader(
      projection.events,
      (date, zone) => projection.query(date, zone),
      current.itemId,
      reviewZone ?? undefined,
    );
    if (!header) throw new Error("HOME_ITEM_DATE_UNAVAILABLE");
    setTrip(result);
    setHomeItem({
      read: result,
      ...header,
      itemId: current.itemId,
      itemRevision,
    });
  };
  const widgetsForHome = (
    id: string,
    lifecycle: "Upcoming" | "Active" | "Past" | "Undated",
    tripStartDate?: string | null,
  ) => {
    if (id !== requested) return [];
    if (lifecycle === "Active")
      return [
        {
          id: "todays-journey",
          title: t("tripHome.today.title"),
          content: (
            <TodaysJourneyWidget
              key={JSON.stringify([generation, requested])}
              tripId={requested}
              zone={
                homePerspective?.zone ??
                savedTripZone(view, requested, generation) ??
                savedTripZone(resumeView, requested, generation) ??
                (visibleTrip?.observed
                  ? boundaryZone(visibleTrip.observed.projection)
                  : null)
              }
              planningDate={
                homePerspective?.date ??
                (view?.tripId === requested && view.generation === generation
                  ? view.date
                  : null) ??
                (resumeView?.tripId === requested && resumeView.generation === generation
                  ? resumeView.date
                  : null) ??
                tripStartDate
              }
              now={homePerspective?.now}
              refreshKey={revision}
              onOpenDayChooser={canChooseDay ? chooseDay : undefined}
              onOpenLocalToday={async (read) => {
                const result = await freshLocalRead(read);
                if (read.today.zone) viewContext(read.today.date, read.today.zone);
                setTrip(result);
                openToday(requested, {
                  date: read.today.date,
                  zone: read.today.zone ?? "",
                });
              }}
              onOpenLocalItem={(value) => openLocalItem(value.item.itemId, value)}
              copy={{
                planningTitle: t("tripHome.today.planningTitle"),
                planningDate: t("tripHome.today.planningDate"),
                planningStay: t("tripHome.today.planningStay"),
                planningEmpty: t("tripHome.today.planningEmpty"),
                planningLater: t("tripHome.today.planningLater"),
                timezoneUnknown: t("tripHome.today.timezoneUnknown"),
                chooseDay: t("tripHome.today.chooseDay"),
                title: t("tripHome.today.title"),
                openToday: t("tripHome.today.open"),
                upcoming: t("tripHome.today.upcoming"),
                plans: t("tripHome.today.plans"),
                free: t("tripHome.today.free"),
                later: t("tripHome.today.later"),
                tonight: t("tripHome.today.tonight"),
                multipleStays: t("tripHome.today.multipleStays"),
                loading: t("tripHome.today.loading"),
                unavailable: t("tripHome.today.unavailable"),
              }}
              onOpenToday={async (read) => {
                await freshHomeRead(read.scope, read.source.epoch);
                openToday(requested, {
                  date: read.today.date,
                  zone: read.today.zone ?? "",
                });
              }}
              onOpenItem={openHomeItem}
            />
          ),
        },
      ];
    if (lifecycle !== "Past") return [];
    if (
      visibleTrip?.observed?.projection.version !== 2 ||
      visibleTrip.observed.sourceStatus !== "CURRENTLY_MATCHES_SOURCE" ||
      !homeSnapshot ||
      homeSnapshot.scope.generation !== generation ||
      homeSnapshot.scope.tripId !== requested ||
      homeSnapshot.epoch !== visibleTrip.observed.projection.source.epoch
    )
      return [];
    return [
      {
        id: "journey-snapshot",
        title: t("tripHome.snapshot.title"),
        content: (
          <JourneySnapshotWidget
            key={JSON.stringify([generation, requested])}
            tripId={requested}
            copy={{
              title: t("tripHome.snapshot.title"),
              days: t("tripHome.snapshot.days"),
              places: t("tripHome.snapshot.places"),
              activities: t("tripHome.snapshot.activities"),
              empty: t("tripHome.snapshot.empty"),
              loading: t("tripHome.snapshot.loading"),
              unavailable: t("tripHome.snapshot.unavailable"),
              review: t("tripHome.snapshot.review"),
            }}
            onOpenItem={openHomeItem}
            onReviewItinerary={reviewItinerary}
          />
        ),
      },
    ];
  };
  const overlayProjection = homeItem?.read.observed?.projection;
  const visibleOverlay =
    home &&
    visibleTrip?.observed &&
    homeItem?.read.scope.generation === generation &&
    overlayProjection?.tripId === requested &&
    overlayProjection.version === 2 &&
    visibleTrip.observed.sourceStatus === "CURRENTLY_MATCHES_SOURCE" &&
    visibleTrip.scope.accountId === homeItem.read.scope.accountId &&
    visibleTrip.observed.projection.version === 2 &&
    visibleTrip.observed.projection.items.some(
      (item) =>
        item.itemId === homeItem.itemId &&
        item.itemRevision === homeItem.itemRevision &&
        !item.hidden &&
        !["cancelled", "skipped"].includes(String(item.status)),
    ) &&
    overlayProjection.source.epoch === visibleTrip.observed.projection.source.epoch
      ? { ...homeItem, read: visibleTrip }
      : null;
  const savedDay = (() => {
    if (view?.tripId !== requested || view.generation !== generation) return null;
    try {
      validateCalendarDate(view.date);
      if (view.zone !== "") viewContext(view.date, view);
      return view;
    } catch {
      return null;
    }
  })();
  const currentSnapshot =
    homeSnapshot &&
    homeSnapshot.scope.tripId === requested &&
    homeSnapshot.scope.generation === generation &&
    homeSnapshot.scope.accountId === visibleTrip?.scope.accountId &&
    visibleTrip.observed?.projection.version === 2 &&
    homeSnapshot.epoch === visibleTrip.observed.projection.source.epoch
      ? homeSnapshot
      : null;
  const routeDay = (() => {
    if (today || home || !visibleTrip) return null;
    try {
      const routeDate = validateCalendarDate(
        value(params.date) ||
          (view?.tripId === requested && view.generation === generation
            ? view.date
            : "") ||
          (resumeView?.tripId === requested && resumeView.generation === generation
            ? resumeView.date
            : "") ||
          currentSnapshot?.trip?.startDate ||
          currentSnapshot?.candidateDays[0] ||
          visibleTrip.localManual?.items
            .flatMap((item) => {
              const schedule = item.schedule as { start?: { localDate?: string } };
              return schedule.start?.localDate ? [schedule.start.localDate] : [];
            })
            .sort()[0] ||
          "",
      );
      const routeZone = value(params.zone);
      if (routeZone)
        return { tripId: requested, ...viewContext(routeDate, routeZone), generation };
      if (visibleTrip.observed?.projection.version === 1)
        return params.viewMode === "FLOATING"
          ? null
          : { tripId: requested, date: routeDate, zone: "", generation };
      if (params.viewMode !== "FLOATING" && !visibleTrip.localManual) return null;
      return {
        tripId: requested,
        ...viewContext(routeDate, { zone: null, viewMode: "FLOATING" }),
        generation,
      };
    } catch {
      return null;
    }
  })();
  const candidateDay = today ? savedDay : !home ? (routeDay ?? savedDay) : null;
  const dayContext =
    candidateDay?.zone === null && visibleTrip?.observed?.projection.version === 1
      ? null
      : candidateDay;
  const selected =
    savedDay?.date === dayContext?.date &&
    savedDay?.zone === dayContext?.zone &&
    savedDay?.viewMode === dayContext?.viewMode
      ? savedDay
      : null;
  const visibleLocalItem =
    localItem &&
    visibleTrip?.localManual &&
    localItem.scope.tripId === requested &&
    localItem.scope.generation === generation &&
    localItem.scope.accountId === visibleTrip.scope.accountId &&
    localItem.source.fingerprint === visibleTrip.localManual.source.fingerprint
      ? localItem
      : null;
  const localPreview = visibleLocalItem ? (
    <LocalCoreItemPreview
      item={visibleLocalItem.item}
      onClose={() => setLocalItem(null)}
    />
  ) : null;
  const homeContextCurrent =
    homeSnapshot &&
    visibleTrip?.observed?.sourceStatus === "CURRENTLY_MATCHES_SOURCE" &&
    visibleTrip.observed.projection.version === 2 &&
    homeSnapshot.scope.accountId === visibleTrip.scope.accountId &&
    homeSnapshot.scope.generation === generation &&
    homeSnapshot.epoch === visibleTrip.observed.projection.source.epoch;
  const firstKnownDate =
    homeSnapshot?.candidateDays[0] ??
    homeSnapshot?.trip?.startDate ??
    homeSnapshot?.trip?.endDate;
  const dateChoices =
    homeContextCurrent && firstKnownDate
      ? wholeTripCalendarDates(
          homeSnapshot!.trip,
          homeSnapshot!.candidateDays,
          firstKnownDate,
        )
      : [
          ...new Set(
            visibleTrip?.localManual?.items.flatMap((item) => {
              const schedule = item.schedule as {
                start?: { localDate?: string };
                end?: { localDate?: string };
              };
              return [schedule.start?.localDate, schedule.end?.localDate].filter(
                (date): date is string => !!date,
              );
            }) ?? [],
          ),
        ].sort();
  const firstItemDate = String(dateChoices[0] ?? "");
  const routeDate = value(params.date);
  const chooseDay = useCallback(
    (tripStartDate?: string | null) => {
      const bookmark = [resumeView, view].find(
        (saved) => saved?.tripId === requested && saved.generation === generation,
      );
      void enterDay(
        bookmark?.date || routeDate || tripStartDate || firstItemDate,
        bookmark ? bookmark.zone : zone,
      );
    },
    [view, resumeView, requested, generation, routeDate, zone, firstItemDate, enterDay],
  );
  const calendarDates =
    dayContext &&
    homeSnapshot &&
    visibleTrip?.observed?.sourceStatus === "CURRENTLY_MATCHES_SOURCE" &&
    visibleTrip.observed.projection.version === 2 &&
    homeSnapshot.scope.accountId === visibleTrip.scope.accountId &&
    homeSnapshot.scope.generation === generation &&
    homeSnapshot.epoch === visibleTrip.observed.projection.source.epoch
      ? wholeTripCalendarDates(
          homeSnapshot.trip,
          homeSnapshot.candidateDays,
          dayContext.date,
        )
      : dayContext && dayFacts
        ? wholeTripCalendarDates(dayFacts, dateChoices, dayContext.date)
        : undefined;
  if (visibleTrip && dayContext && (visibleTrip.localManual || visibleTrip.observed))
    return (
      <>
        <View style={styles.root}>
          <DayFeed
            bottomInset={bottomBarHeight}
            presentation={{
              formatDayHeading: (date) => {
                const day = tripCoreDayNumber(date, dayFacts);
                const label = formatUiDate(new Date(`${date}T12:00:00Z`), {
                  dateStyle: "medium",
                  timeZone: "UTC",
                });
                return day === null
                  ? label
                  : t("dayShell.coreDay", {
                      day: formatUiNumber(day),
                      date: label,
                    });
              },
              listRef: (value) => {
                dayList.current = value;
              },
              topInset: headerBottom,
              header: (
                <View
                  style={{ paddingTop: headerBottom }}
                  onLayout={({ nativeEvent }) => {
                    dayIntroductionBottom.current = Math.max(
                      0,
                      nativeEvent.layout.height - headerBottom,
                    );
                    setDayPastIntroduction(
                      dayOrigin.current > 0 ||
                        dayOffset.current >= dayIntroductionBottom.current,
                    );
                  }}
                >
                  <DayFeedIntroduction
                    tripName={dayName}
                    rangeLabel={dayRangeLabel}
                    locationSummary={dayFacts?.destination}
                    openCalendarLabel={t("dayShell.calendar.open")}
                    onOpenCalendar={() => setCalendarVisible(true)}
                  />
                  {visibleTrip.observed?.sourceStatus ===
                  "HISTORICAL_ACCEPTED_PROJECTION" ? (
                    <Text style={styles.meta}>{t("dayFeed.historical")}</Text>
                  ) : null}
                </View>
              ),
              onSummaries: setDaySummaries,
              onMountedRowsChange:
                typeof __DEV__ !== "undefined" && __DEV__
                  ? (count) =>
                      console.info(
                        JSON.stringify({ event: "day_window_mount", mountedRows: count }),
                      )
                  : undefined,
              onReadingMotion: dayShell.observeReadingMotion,
              onReadingStopped: dayShell.observeReadingStopped,
              onOffsetChange: (value) => {
                if (dayIntroductionBottom.current !== null)
                  setDayPastIntroduction(
                    dayOrigin.current > 0 || value >= dayIntroductionBottom.current,
                  );
                dayOffset.current = value;
              },
              onViewportChange: (viewport) => {
                if (viewport.originIndex === 0 && viewport.scrollOffset <= 4)
                  dayShell.observeScroll(0, false);
                if (dayOrigin.current !== viewport.originIndex) {
                  dayOrigin.current = viewport.originIndex;
                  setDayPastIntroduction(
                    viewport.originIndex > 0 ||
                      (dayIntroductionBottom.current !== null &&
                        viewport.scrollOffset >= dayIntroductionBottom.current),
                  );
                }
                dayShell.observeVisibleDates({
                  first: viewport.firstVisibleDate,
                  last: viewport.lastVisibleDate,
                });
              },
            }}
            instant={homePerspective?.now}
            key={`${requested}/${generation}`}
            entry={entry}
            onReadingChange={
              selected ? (reading) => saveReading(selected, reading) : undefined
            }
            projection={visibleTrip.observed?.projection}
            localManual={visibleTrip.localManual}
            onOpenLocalItem={(id, expected) => {
              void openLocalItem(id, expected).catch(() => {
                setLocalItem(null);
                void load();
              });
            }}
            date={dayContext.date}
            dates={calendarDates ?? [dayContext.date]}
            zone={dayContext.zone}
            viewMode={dayContext.viewMode}
            services={visibleTrip.services}
            renderer={
              visibleTrip.observed?.projection.version === 2
                ? createCoreExperienceRenderer(visibleTrip.observed.projection)
                : undefined
            }
          />
        </View>
        <DayFeedCalendarSheet
          visible={calendarVisible}
          tripName={dayName}
          rangeLabel={dayRangeLabel ?? undefined}
          tripStart={dayFacts?.startDate}
          tripEnd={dayFacts?.endDate}
          selectedDate={dayShell.visibleDates?.first ?? dayContext.date}
          dates={calendarDates}
          summaries={daySummaries}
          copy={{
            unknownBounds: t("dayShell.calendar.unknownBounds"),
            markers: {
              Plans: t("dayShell.calendar.plans"),
              Stay: t("dayShell.calendar.stay"),
              Transport: t("dayShell.calendar.transport"),
            },
          }}
          onClose={() => setCalendarVisible(false)}
          onSelect={(target) => {
            setCalendarVisible(false);
            dayList.current?.jumpToDayHeader(target, target === dayFacts?.startDate);
          }}
        />
        {localPreview}
      </>
    );
  // Keep the requested Day shell while its local reader resolves; never paint the old Today root.
  if (dayActive && !visibleTrip)
    return (
      <View style={[styles.root, { paddingTop: headerBottom }]}>
        <ThemedText
          accessibilityRole={status === "UNAVAILABLE" ? "alert" : undefined}
          style={styles.meta}
        >
          {t(status === "UNAVAILABLE" ? "dayFeed.unavailable" : "dayFeed.loading")}
        </ThemedText>
      </View>
    );
  if (!home && !today && visibleTrip && canChooseDay)
    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomBarHeight + visual.space.page },
          ]}
        >
          <Text accessibilityRole="header" style={styles.heading}>
            {t("shell.day")}
          </Text>
          <Text style={styles.meta}>{t("dayFeed.timeUnspecified")}</Text>
          <Text style={styles.meta}>{t("dayFeed.date")}</Text>
          <UiTextInput
            accessibilityLabel={t("dayFeed.date")}
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
          {dateChoices.map((choice) => (
            <UiChoiceChip
              compact
              key={choice}
              label={choice}
              selected={date === choice}
              onPress={() => void enterDay(choice)}
            />
          ))}
          {contextError ? (
            <Text accessibilityRole="alert" style={styles.meta}>
              {t("dayFeed.contextInvalid")}
            </Text>
          ) : null}
          <UiButton label={t("dayFeed.openDay")} onPress={() => void enterDay()} />
        </ScrollView>
      </View>
    );
  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          immersiveHome && styles.homeContent,
          { paddingBottom: bottomBarHeight + visual.space.page },
        ]}
        scrollIndicatorInsets={{ bottom: bottomBarHeight }}
        scrollEventThrottle={16}
        onScroll={
          isMyTrips
            ? ({ nativeEvent }) => {
                const offset = nativeEvent.contentOffset.y;
                if (headingBottom.current > 0)
                  setHeadingHidden(offset >= headingBottom.current);
              }
            : immersiveHome
              ? ({ nativeEvent }) => {
                  homeScrollOffset.current = nativeEvent.contentOffset.y;
                  if (heroHeight.current > 0)
                    setHeroBehindStatus(
                      nativeEvent.contentOffset.y < heroHeight.current - headerBottom,
                    );
                }
              : undefined
        }
      >
        {!hideHomePrelude && !immersiveHome ? (
          <Text
            accessibilityRole="header"
            style={styles.heading}
            onLayout={
              isMyTrips
                ? ({ nativeEvent }) => {
                    headingBottom.current =
                      nativeEvent.layout.y + nativeEvent.layout.height;
                  }
                : undefined
            }
          >
            {t(
              today
                ? "navigation.today"
                : visibleTrip?.observed || knownWorkspaceTrip
                  ? "dayFeed.tripHome"
                  : "dayFeed.myTrips",
            )}
          </Text>
        ) : null}
        {!hideHomePrelude && status === "LOADING" ? (
          <Text style={styles.meta}>{t("dayFeed.loading")}</Text>
        ) : null}
        {!hideHomePrelude &&
        status === "UNAVAILABLE" &&
        (today || (localChecked && !knownWorkspaceTrip)) ? (
          <Text style={styles.meta}>{t("dayFeed.unavailable")}</Text>
        ) : null}
        {!today ? (
          <LocalTripWorkspace
            onHomeHeroHeight={onHomeHeroHeight}
            tripId={requested || null}
            mode={params.view === "create" ? "CREATE" : "LIST"}
            onOpen={open}
            onCreate={createTrip}
            onOpenToday={openToday}
            onKnownTrip={knownTrip}
            onManualItemSaved={manualItemSaved}
            onBackToTrips={backToTrips}
            onChooseDay={canChooseDay ? chooseDay : undefined}
            homePerspective={homePerspective}
            widgetsForHome={widgetsForHome}
            onOpenHomeItem={async (tripId, itemId, epoch) => {
              if (tripId !== requested || generation !== getAccountGeneration()) return;
              const item = await (
                await readTripJourneySnapshot()
              ).resolveItem(tripId, itemId, epoch);
              if (!item) throw new Error("HOME_ITEM_UNAVAILABLE");
              await openHomeItem(item);
            }}
          />
        ) : null}
        {today ? (
          <>
            <Text style={styles.meta}>{t("dayFeed.todayContext")}</Text>
            <UiButton
              label={t("dayFeed.myTrips")}
              onPress={() => router.navigate("/trip")}
            />
          </>
        ) : (
          <></>
        )}
      </ScrollView>
      {localPreview}
      {visibleOverlay?.read.observed ? (
        <DayFeed
          instant={homePerspective?.now}
          projection={visibleOverlay.read.observed.projection}
          date={visibleOverlay.date}
          zone={visibleOverlay.zone}
          services={visibleOverlay.read.services}
          renderer={
            visibleOverlay.read.observed.projection.version === 2
              ? createCoreExperienceRenderer(visibleOverlay.read.observed.projection)
              : undefined
          }
          directItem={{
            itemId: visibleOverlay.itemId,
            onClose: () => {
              setHomeItem(null);
              void load();
            },
          }}
        />
      ) : null}
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    modal: { flex: 1, backgroundColor: c.background },
    choices: { flexDirection: "row", gap: visual.space.heading },
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.heading },
    homeContent: { paddingHorizontal: 0, paddingTop: 0 },
    header: { paddingHorizontal: visual.space.page, paddingTop: visual.space.heading },
    navTitle: { ...visual.type.section, color: c.textPrimary },
    heading: { ...visual.type.metric, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
