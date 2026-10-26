import { ManualFlightEditor } from "./ManualFlightForm";
import { localInsertionTime } from "./localInsertionTime";
import { UiGlassSurface } from "@/ui/UiGlassSurface";
import { dayFeedAppearanceDate, dayFeedPhaseColor } from "./dayFeedAppearance";
import { useMinuteClock } from "./useMinuteClock";
import { useP1CivilMove } from "./useP1CivilMove";
import { P1MeasuredMoveRegion } from "./useP1Move";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import { tripDestinationDisplay } from "./tripDestinationDisplay";
import type { Trip } from "@/domain/trip/types";
import { ManualItineraryContent } from "./ManualItineraryContent";
import { DayFeedFidelityHeading } from "./DayFeedFidelityHeading";
import { p1InsertionTime } from "./p1InsertionTime";
import { subscribeLedgerOperationalSyncCompletion } from "@/data/sync/ledgerOperationalSync";
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
import { P1PlanEditor } from "./P1PlanEditor";
import { P3StayEditor } from "./P3StayEditor";
import { P4RentalEditor } from "./P4RentalEditor";
import { P5TransportEditor } from "./P5TransportEditor";
import {
  createDefaultManualPlanRepository,
  type ManualPlanDraft,
  type ManualPlanRepository,
} from "@/data/repositories/manualPlanRepository";
import {
  createDefaultManualStayRepository,
  type ManualStayDraft,
  type ManualStayRepository,
} from "@/data/repositories/manualStayRepository";
import {
  createDefaultManualRentalRepository,
  type ManualRentalDraft,
  type ManualRentalRepository,
} from "@/data/repositories/manualRentalRepository";
import {
  createDefaultManualTransportRepository,
  type ManualTransportDraft,
  type ManualTransportRepository,
} from "@/data/repositories/manualTransportRepository";
import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import {
  readTripTodaysJourney,
  type createTripTodaysJourneyReader,
} from "@/data/repositories/tripTodaysJourneyRepository";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { referenceTripHomePerspective } from "./referenceTripHomePerspective";
import { TodaysJourneyWidget } from "./TodaysJourneyWidget";
import { useBottomShellHeight } from "@/ui/useBottomShellHeight";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

export function TripScreen({
  today = false,
  contentFrameManaged = false,
}: {
  today?: boolean;
  contentFrameManaged?: boolean;
}) {
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
      contentFrameManaged={contentFrameManaged}
    />
  );
}
function TripContent({
  today = false,
  contentFrameManaged = false,
}: {
  today?: boolean;
  contentFrameManaged?: boolean;
}) {
  const pathname = usePathname();
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const insets = useSafeAreaInsets();
  const measuredHeader = useHeaderHeight();
  const [retainedHeader, setRetainedHeader] = useState(
    Math.max(measuredHeader, insets.top),
  );
  // UIKit reports zero after hiding the bar; keep the measured list boundary.
  if (measuredHeader > insets.top && measuredHeader !== retainedHeader)
    setRetainedHeader(measuredHeader);
  const headerBottom = Math.max(measuredHeader, retainedHeader, insets.top);
  const dayTopInset = contentFrameManaged ? 0 : headerBottom;
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
    manualOutcome,
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
    trip: TripListSummary & Pick<Trip, "destinations">;
  } | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [insertion, setInsertion] = useState<{
    date: string;
    startTime: string | null;
  } | null>(null);
  const insertionDismiss = useRef<(() => void) | null>(null);
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const dayList = useRef<DayListHandle>(null);
  const dayOffset = useRef(0);
  const dayOrigin = useRef(0);
  const dayIntroductionBottom = useRef<number | null>(null);
  const [dayPastIntroduction, setDayPastIntroduction] = useState(false);
  const [dayChromeOwner] = useState(() => Symbol("day-shell"));
  const [revision, setRevision] = useState(0);
  const [flightEdit, setFlightEdit] = useState<{
    tripId: string;
    itemId: string;
    revision: number;
    generation: number;
  } | null>(null);
  const [localItem, setLocalItem] = useState<LocalItem | null>(null);
  const [planEditError, setPlanEditError] = useState(false);
  const [planEdit, setPlanEdit] = useState<{
    tripId: string;
    generation: number;
    repository: ManualPlanRepository;
    draft: ManualPlanDraft;
  } | null>(null);
  const [stayEdit, setStayEdit] = useState<{
    tripId: string;
    generation: number;
    repository: ManualStayRepository;
    draft: ManualStayDraft;
  } | null>(null);
  const [rentalEdit, setRentalEdit] = useState<{
    tripId: string;
    generation: number;
    repository: ManualRentalRepository;
    draft: ManualRentalDraft;
  } | null>(null);
  const [transportEdit, setTransportEdit] = useState<{
    tripId: string;
    generation: number;
    repository: ManualTransportRepository;
    draft: ManualTransportDraft;
  } | null>(null);
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
        return t(days === 1 ? "dayShell.range.one" : "dayShell.range.many", {
          range: formatDayFeedVisibleDates({
            first: dayBounds.start,
            last: dayBounds.end,
          }),
          days: formatUiNumber(days),
        });
      })()
    : null;
  const dayActive = !!requested && (today || params.view === "day");
  const dayTitle =
    dayPastIntroduction && dayShell.visibleDates
      ? formatDayFeedVisibleDates(dayShell.visibleDates)
      : dayName;
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
        const [rootFacts, localMetadata] = await Promise.all([
          readLocalTripDiscoveryRepository()
            .then((reader) => reader.readMerged())
            .then((read) => read.trips.find((row) => row.id === requested))
            .catch(() => undefined),
          readLocalTripRepository()
            .then((reader) => reader.getTrip(requested))
            .catch(() => null),
        ]);
        if (getAccountGeneration() !== captured || ticket !== request.current) return;
        setDayTripFacts(
          rootFacts
            ? {
                generation: captured,
                trip: {
                  ...rootFacts,
                  ...(localMetadata ? { destinations: localMetadata.destinations } : {}),
                },
              }
            : null,
        );
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
      const stopSync = subscribeLedgerOperationalSyncCompletion((event) => {
        if (
          event.generation === generation &&
          generation === getAccountGeneration() &&
          event.accountId === trip?.scope.accountId &&
          requested &&
          event.journeyIds.includes(requested)
        ) {
          setRevision((value) => value + 1);
          void load();
        }
      });
      return () => {
        stopSync();
        request.current += 1;
        sub.remove();
      };
    }, [load, generation, trip?.scope.accountId, requested]),
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
    occurrence?: { role: string; date: string },
  ) => {
    const ticket = request.current;
    const resolved = await (
      await readTripTodaysJourney()
    ).resolveLocalItem(requested, id, expected);
    if (!resolved || ticket !== request.current || generation !== getAccountGeneration())
      throw new Error("LOCAL_ITEM_UNAVAILABLE");
    const current = await freshLocalRead(resolved);
    setTrip(current);
    if (resolved.item.family === "P1") {
      router.push({ pathname: "/p1-detail", params: { tripId: requested, itemId: id } });
      return;
    }
    if (resolved.item.family === "P3") {
      router.push({
        pathname: "/p3-detail",
        params: {
          tripId: requested,
          itemId: id,
          occurrence:
            occurrence?.role === "CHECKOUT"
              ? "CHECKOUT"
              : occurrence?.role === "CHECKIN"
                ? "CHECKIN"
                : "BASE",
          ...(occurrence?.date ? { date: occurrence.date } : {}),
        },
      });
      return;
    }
    setLocalItem(resolved);
    setPlanEditError(false);
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
  const handledManualOutcome = useRef<typeof manualOutcome>(null);
  useEffect(() => {
    if (
      manualOutcome?.tripId === requested &&
      manualOutcome.generation === generation &&
      handledManualOutcome.current !== manualOutcome
    ) {
      handledManualOutcome.current = manualOutcome;
      manualItemSaved(requested, generation);
    }
  }, [manualOutcome, requested, generation, manualItemSaved]);
  const freshHomeRead = async (scope: SnapshotRead["scope"], epoch: string | null) => {
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
  const openAcceptedPlan = async (
    itemId: string,
    expectedRevision: number,
    knownRead?: TripRead,
  ) => {
    const ticket = request.current;
    const result = knownRead ?? (await (await readTripDayFeed()).trip(requested));
    const projection = result.observed?.projection;
    if (
      projection?.version !== 2 ||
      result.observed?.sourceStatus !== "CURRENTLY_MATCHES_SOURCE" ||
      projection.tripId !== requested ||
      result.scope.generation !== generation ||
      generation !== getAccountGeneration()
    )
      return;
    const item = projection.items.find(
      (i) =>
        i.itemId === itemId &&
        i.itemRevision === expectedRevision &&
        i.family === "P1" &&
        !i.hidden &&
        !["cancelled", "skipped"].includes(String(i.status)),
    );
    if (!item) return;
    if (ticket !== request.current || generation !== getAccountGeneration()) return;
    setTrip(result);
    setPlanEditError(false);
    router.push({ pathname: "/p1-detail", params: { tripId: requested, itemId } });
  };
  const openHomeItem = async (value: SnapshotItem) => {
    const itemRevision = value.item.itemRevision;
    if (
      typeof itemRevision !== "number" ||
      !Number.isSafeInteger(itemRevision) ||
      itemRevision < 1
    )
      throw new Error("HOME_ITEM_REVISION_UNAVAILABLE");
    const result = await freshHomeRead(value.scope, value.certificate?.epoch ?? null);
    const projection = result.observed!.projection;
    if (projection.version !== 2) throw new Error("HOME_ITEM_UNAVAILABLE");
    const current = projection.items.find(
      (item) =>
        item.itemId === value.item.itemId &&
        item.itemRevision === value.item.itemRevision,
    );
    if (!current) throw new Error("HOME_RENDERER_UNAVAILABLE");
    if (current.family === "P1")
      return openAcceptedPlan(current.itemId, itemRevision, result);
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
              const schedule = item.schedule as {
                start?: { localDate?: string };
                origin?: { time?: { localDate?: string } };
              };
              const first = schedule.start?.localDate ?? schedule.origin?.time?.localDate;
              return first ? [first] : [];
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
  const localPreview =
    visibleLocalItem &&
    !flightEdit &&
    !planEdit &&
    !stayEdit &&
    !rentalEdit &&
    !transportEdit ? (
      <LocalCoreItemPreview
        item={visibleLocalItem.item}
        onClose={() => setLocalItem(null)}
        editError={planEditError}
        onEdit={
          ["P1", "P2", "P3", "P4", "P5"].includes(visibleLocalItem.item.family) &&
          visibleLocalItem.item.localState === "PENDING"
            ? () => {
                setPlanEditError(false);
                const ticket = request.current;
                void (async () => {
                  try {
                    const itemId = visibleLocalItem.item.itemId;
                    const current = (draftId: string) =>
                      ticket === request.current &&
                      generation === getAccountGeneration() &&
                      draftId === itemId;
                    if (visibleLocalItem.item.family === "P2") {
                      if (!current(itemId)) return;
                      setFlightEdit({
                        tripId: requested,
                        itemId,
                        revision: Number(visibleLocalItem.item.itemRevision),
                        generation,
                      });
                    } else if (visibleLocalItem.item.family === "P5") {
                      const repository = await createDefaultManualTransportRepository();
                      const draft = await repository.read(requested, itemId);
                      if (!current(draft.itemId)) return;
                      setTransportEdit({
                        tripId: requested,
                        generation,
                        repository,
                        draft,
                      });
                    } else if (visibleLocalItem.item.family === "P4") {
                      const repository = await createDefaultManualRentalRepository();
                      const draft = await repository.read(requested, itemId);
                      if (!current(draft.itemId)) return;
                      setRentalEdit({
                        tripId: requested,
                        generation,
                        repository,
                        draft,
                      });
                    } else if (visibleLocalItem.item.family === "P3") {
                      const repository = await createDefaultManualStayRepository();
                      const draft = await repository.read(requested, itemId);
                      if (!current(draft.itemId)) return;
                      setStayEdit({
                        tripId: requested,
                        generation,
                        repository,
                        draft,
                      });
                    } else {
                      const repository = await createDefaultManualPlanRepository();
                      const draft = await repository.read(requested, itemId);
                      if (!current(draft.itemId)) return;
                      setPlanEdit({
                        tripId: requested,
                        generation,
                        repository,
                        draft,
                      });
                    }
                  } catch {
                    if (
                      ticket === request.current &&
                      generation === getAccountGeneration()
                    )
                      setPlanEditError(true);
                  }
                })();
              }
            : undefined
        }
      />
    ) : null;
  const flightEditor =
    flightEdit?.tripId === requested && flightEdit.generation === generation ? (
      <ManualFlightEditor
        key={`${flightEdit.tripId}:${flightEdit.itemId}:${generation}`}
        embedded={false}
        tripId={flightEdit.tripId}
        itemId={flightEdit.itemId}
        expectedRevision={flightEdit.revision}
        initialDate={null}
        onClose={() => setFlightEdit(null)}
        onSaved={() => {
          if (generation !== getAccountGeneration()) return;
          setFlightEdit(null);
          setLocalItem(null);
          setRevision((value) => value + 1);
          void load();
        }}
      />
    ) : null;
  const planEditor =
    planEdit?.tripId === requested && planEdit.generation === generation ? (
      <P1PlanEditor
        key={`${planEdit.tripId}:${planEdit.draft.itemId}:${generation}`}
        tripId={planEdit.tripId}
        itemId={planEdit.draft.itemId}
        opened={planEdit}
        onClose={() => setPlanEdit(null)}
        onSaved={() => {
          if (generation !== getAccountGeneration()) return;
          setPlanEdit(null);
          setLocalItem(null);
          setRevision((value) => value + 1);
          void load();
        }}
      />
    ) : null;
  const stayEditor =
    stayEdit?.tripId === requested && stayEdit.generation === generation ? (
      <P3StayEditor
        key={`${stayEdit.tripId}:${stayEdit.draft.itemId}:${generation}`}
        tripId={stayEdit.tripId}
        itemId={stayEdit.draft.itemId}
        opened={stayEdit}
        onClose={() => setStayEdit(null)}
        onSaved={() => {
          if (generation !== getAccountGeneration()) return;
          setStayEdit(null);
          setLocalItem(null);
          setRevision((value) => value + 1);
          void load();
        }}
      />
    ) : null;
  const rentalEditor =
    rentalEdit?.tripId === requested && rentalEdit.generation === generation ? (
      <P4RentalEditor
        key={`${rentalEdit.tripId}:${rentalEdit.draft.itemId}:${generation}`}
        tripId={rentalEdit.tripId}
        itemId={rentalEdit.draft.itemId}
        opened={rentalEdit}
        onClose={() => setRentalEdit(null)}
        onSaved={() => {
          if (generation !== getAccountGeneration()) return;
          setRentalEdit(null);
          setLocalItem(null);
          setRevision((value) => value + 1);
          void load();
        }}
      />
    ) : null;
  const transportEditor =
    transportEdit?.tripId === requested && transportEdit.generation === generation ? (
      <P5TransportEditor
        key={`${transportEdit.tripId}:${transportEdit.draft.itemId}:${generation}`}
        tripId={transportEdit.tripId}
        itemId={transportEdit.draft.itemId}
        opened={transportEdit}
        onClose={() => setTransportEdit(null)}
        onSaved={() => {
          if (generation !== getAccountGeneration()) return;
          setTransportEdit(null);
          setLocalItem(null);
          setRevision((value) => value + 1);
          void load();
        }}
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
                origin?: { time?: { localDate?: string } };
                destination?: { time?: { localDate?: string } };
              };
              return [
                schedule.start?.localDate,
                schedule.end?.localDate,
                schedule.origin?.time?.localDate,
                schedule.destination?.time?.localDate,
              ].filter((date): date is string => !!date);
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
  const displayClock = useMinuteClock(dayContext?.zone ?? null);
  const appearanceToday = dayFeedAppearanceDate(
    displayClock.instant,
    dayContext?.zone,
    displayClock.deviceZone,
  );
  const phase = (date: string) => dayFeedPhaseColor(date, appearanceToday, colors);
  const move = useP1CivilMove(
    dayList,
    dayActive ? visibleTrip : null,
    requested,
    generation,
    calendarDates ?? [],
    insets.top,
    insets.bottom,
    () => manualItemSaved(requested, generation),
    () => dayShell.observeReadingStopped(),
  );
  const moveActive = move.active;
  const readingOnly = dayActive && dayPastIntroduction && !dayShell.navigationVisible;
  useLayoutEffect(() => {
    if (!dayActive || !navigation.isFocused()) return;
    publishDayShellChrome(
      {
        tripId: requested,
        generation,
        owner: dayChromeOwner,
        navigationVisible:
          !moveActive && (!dayPastIntroduction || dayShell.navigationVisible),
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
    dayPastIntroduction,
    moveActive,
    publishDayShellChrome,
    navigation,
  ]);
  useLayoutEffect(() => {
    if (today && !dayActive) return;
    const blurHeader =
      (dayActive && dayShell.navigationVisible) || (immersiveHome && !heroBehindStatus);
    const nativeEdge =
      Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;
    navigation.setOptions({
      // Native Stack falls back to the route name when a custom title renders null.
      title: moveActive ? "" : headerTitle,
      headerTransparent: true,
      headerShown: !dayActive || (!readingOnly && !moveActive),
      fullScreenGestureEnabled: immersiveHome,
      headerStyle: {
        backgroundColor:
          dayActive && !dayPastIntroduction && !moveActive
            ? colors.tripIntroduction
            : colors.transparent,
      },
      headerShadowVisible: false,
      // Modern UIKit uses its soft scroll edge instead of the legacy rectangular bar blur.
      headerBlurEffect:
        dayActive && (moveActive || !dayShell.navigationVisible)
          ? "none"
          : !moveActive && blurHeader && !nativeEdge
            ? "systemUltraThinMaterial"
            : undefined,
      scrollEdgeEffects:
        dayActive && (moveActive || !dayShell.navigationVisible)
          ? { top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" }
          : blurHeader
            ? {
                top: nativeEdge ? "soft" : "hidden",
                bottom: "hidden",
                left: "hidden",
                right: "hidden",
              }
            : undefined,
      statusBarStyle: immersiveHome && heroBehindStatus ? "light" : "auto",
      headerTitle: moveActive
        ? () => null
        : ({ onLayout }: { onLayout?: import("react-native").TextProps["onLayout"] }) =>
            dayActive ? (
              dayTitle ? (
                dayPastIntroduction ? (
                  <UiGlassSurface style={styles.dateIsland}>
                    <DayFeedShellTitle
                      label={dayTitle}
                      openCalendarLabel={t("dayShell.calendar.open")}
                      onOpenCalendar={() => setCalendarVisible(true)}
                    />
                  </UiGlassSurface>
                ) : (
                  <ThemedText
                    onLayout={onLayout}
                    numberOfLines={1}
                    style={styles.navTitle}
                  >
                    {dayTitle}
                  </ThemedText>
                )
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
    styles.dateIsland,
    readingOnly,
    immersiveHome,
    colors,
    heroBehindStatus,
    dayActive,
    dayTitle,
    dayShell.navigationVisible,
    dayPastIntroduction,
    moveActive,
  ]);
  const moveInteraction = {
    canMove: move.canMove,
    start: move.handlers.start,
    wrapRow: move.wrapRow,
    wrapClock: move.wrapClock,
  };
  if (visibleTrip && dayContext && (visibleTrip.localManual || visibleTrip.observed))
    return (
      <>
        <View style={styles.root} {...move.touchHandlers}>
          <DayFeed
            bottomInset={bottomBarHeight}
            presentation={{
              scrollEnabled: !move.active,
              p1Move: moveInteraction,
              onLocalInsert: (itemId, role, date, side) => {
                if (!visibleTrip.localManual) return;
                const suggestion = localInsertionTime(
                  visibleTrip.localManual,
                  itemId,
                  role,
                  date,
                  side,
                );
                setInsertion({
                  date: suggestion.startDate,
                  startTime: suggestion.startTime,
                });
              },
              listStyle: { backgroundColor: colors.tripIntroduction },
              listContentStyle: {
                backgroundColor: calendarDates?.length
                  ? phase(calendarDates[calendarDates.length - 1])
                  : colors.background,
              },
              showTimeUnspecified: false,
              renderDayHeading: dayFacts?.startDate
                ? (date, empty) => (
                    <P1MeasuredMoveRegion
                      regionKey={`day:${date}`}
                      date={date}
                      register={move.register}
                      unregister={move.unregister}
                    >
                      <DayFeedFidelityHeading
                        date={date}
                        start={dayFacts.startDate!}
                        today={appearanceToday ?? ""}
                        empty={empty}
                        dayColor={phase(date)}
                        previousColor={
                          date === dayFacts.startDate
                            ? colors.tripIntroduction
                            : phase(
                                new Date(Date.parse(date + "T12:00:00Z") - 86400000)
                                  .toISOString()
                                  .slice(0, 10),
                              )
                        }
                        onAdd={() => setInsertion({ date, startTime: null })}
                      />
                    </P1MeasuredMoveRegion>
                  )
                : undefined,
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
              topInset: dayTopInset,
              header: (
                <View
                  style={{
                    paddingTop: dayTopInset,
                    backgroundColor: colors.tripIntroduction,
                  }}
                  onLayout={({ nativeEvent }) => {
                    dayIntroductionBottom.current = Math.max(
                      0,
                      nativeEvent.layout.height - dayTopInset,
                    );
                    setDayPastIntroduction(
                      dayOrigin.current > 0 ||
                        dayOffset.current >= dayIntroductionBottom.current,
                    );
                  }}
                >
                  <DayFeedIntroduction
                    fidelity
                    tripName={dayName}
                    rangeLabel={dayRangeLabel}
                    locationSummary={dayFacts ? tripDestinationDisplay(dayFacts) : null}
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
              onOffsetChange: (value) => {
                if (
                  dayIntroductionBottom.current !== null &&
                  (!move.active ||
                    dayOffset.current >= dayIntroductionBottom.current !==
                      value >= dayIntroductionBottom.current)
                )
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
            onOpenLocalItem={(id, expected, occurrence) => {
              void openLocalItem(id, expected, occurrence).catch(() => {
                setLocalItem(null);
                void load();
              });
            }}
            date={dayContext.date}
            dates={calendarDates ?? [dayContext.date]}
            zone={dayContext.zone}
            viewMode={dayContext.viewMode}
            onOpenAcceptedP1={(id, revision) => {
              void openAcceptedPlan(id, revision).catch(() => {
                void load();
              });
            }}
            services={visibleTrip.services}
            renderer={
              visibleTrip.observed?.projection.version === 2
                ? createCoreExperienceRenderer(visibleTrip.observed.projection, {
                    instant: new Date().toISOString(),
                    onOpenStay: (itemId, occurrence, date) =>
                      router.push({
                        pathname: "/p3-detail",
                        params: { tripId: requested, itemId, occurrence, date },
                      }),
                    onInsertStay: (itemId, role, date, side) => {
                      const projection = visibleTrip.observed!.projection;
                      if (projection.version !== 2) return;
                      const suggestion = localInsertionTime(
                        {
                          items: projection.items,
                          rows: (day) => projection.query(day, dayContext).coreRows ?? [],
                        },
                        itemId,
                        role,
                        date,
                        side,
                      );
                      setInsertion({
                        date: suggestion.startDate,
                        startTime: suggestion.startTime,
                      });
                    },
                    onInsert: (itemId, side, date) => {
                      const projection = visibleTrip.observed!.projection;
                      if (projection.version !== 2) return;
                      const query = projection.query(date, dayContext);
                      const rows = [...query.timed, ...query.nonComparable].map(
                        (item) => item.event,
                      );
                      const suggestion = p1InsertionTime(rows, itemId, side, date);
                      setInsertion({
                        date: suggestion.startDate,
                        startTime: suggestion.startTime,
                      });
                    },
                  })
                : undefined
            }
          />
          {readingOnly && !moveActive && dayTitle ? (
            <View
              pointerEvents="box-none"
              style={[styles.dateOverlay, { top: insets.top }]}
            >
              <UiGlassSurface style={styles.dateIsland}>
                <DayFeedShellTitle
                  label={dayTitle}
                  openCalendarLabel={t("dayShell.calendar.open")}
                  onOpenCalendar={() => setCalendarVisible(true)}
                />
              </UiGlassSurface>
            </View>
          ) : null}
          {move.overlay}
        </View>
        {move.confirmation}
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
        <Modal
          visible={!!insertion}
          animationType="slide"
          transparent
          presentationStyle="overFullScreen"
          onRequestClose={() =>
            insertionDismiss.current ? insertionDismiss.current() : setInsertion(null)
          }
        >
          <SafeAreaProvider style={{ flex: 1 }}>
            {insertion ? (
              <ManualItineraryContent
                tripId={requested}
                generation={generation}
                initialDate={insertion.date}
                initialStartTime={insertion.startTime}
                tripStartDate={dayFacts?.startDate}
                tripEndDate={dayFacts?.endDate}
                registerDismissHandler={(handler) => {
                  insertionDismiss.current = handler;
                  return () => {
                    if (insertionDismiss.current === handler)
                      insertionDismiss.current = null;
                  };
                }}
                onClose={() => setInsertion(null)}
                onSaved={() => {
                  setInsertion(null);
                  manualItemSaved(requested, generation);
                }}
              />
            ) : null}
          </SafeAreaProvider>
        </Modal>
        {localPreview}
        {flightEditor}
        {planEditor}
        {stayEditor}
        {rentalEditor}
        {transportEditor}
      </>
    );
  // Keep the requested Day shell while its local reader resolves; never paint the old Today root.
  if (dayActive && !visibleTrip)
    return (
      <View style={[styles.root, { paddingTop: dayTopInset }]}>
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
          keyboardShouldPersistTaps="handled"
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
        keyboardShouldPersistTaps="handled"
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
            onOpenLocalHomeItem={async (tripId, itemId, expected) => {
              if (tripId !== requested || generation !== getAccountGeneration()) return;
              await openLocalItem(itemId, expected);
            }}
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
      {flightEditor}
      {planEditor}
      {stayEditor}
      {rentalEditor}
      {transportEditor}
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
    dateOverlay: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    dateIsland: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: visual.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      overflow: "hidden",
    },
    navTitle: { ...visual.type.section, color: c.textPrimary },
    heading: { ...visual.type.metric, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
