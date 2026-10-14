import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripDayFeed,
  type createTripDayFeedReader,
} from "@/data/repositories/tripDayFeedRepository";
import { UiButton } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { boundaryZone, viewContext } from "./presentation";
import { DayFeed } from "./DayFeed";
import { createCoreExperienceRenderer } from "./coreExperienceRenderer";
import { acceptedHomeHeader, useTripView } from "./TripViewContext";
import { LocalTripWorkspace } from "./LocalTripWorkspace";
import type { TodayEntry } from "./MyTripsList";
import {
  resolvedWorkspaceKind,
  showTripContextualActions,
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
type Reader = ReturnType<typeof createTripDayFeedReader>;
type TripRead = Awaited<ReturnType<Reader["trip"]>>;
const value = (p: string | string[] | undefined) => (typeof p === "string" ? p : "");

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
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view, resumeView, select, switchTrip, entry, saveReading, enterHeader } =
    useTripView();
  const params = useLocalSearchParams<{
    tripId?: string;
    date?: string;
    zone?: string;
    view?: string;
  }>();
  const [key, setKey] = useState(value(params.tripId));
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
  const visibleTrip =
    trip?.scope.generation === generation &&
    trip.observed?.projection.tripId === requested
      ? trip
      : null;
  const [workspaceResolution, setWorkspaceResolution] =
    useState<WorkspaceResolution | null>(null);
  const knownTrip = useCallback(
    (kind: WorkspaceKind) => {
      setWorkspaceResolution({ tripId: requested, generation, kind });
    },
    [requested, generation],
  );
  const workspaceKind = resolvedWorkspaceKind(workspaceResolution, requested, generation);
  const localChecked = workspaceKind !== null;
  const knownWorkspaceTrip = workspaceKind === "LOCAL" || workspaceKind === "CACHED";
  const hideHomePrelude = !today && home && knownWorkspaceTrip;
  const showContextualActions =
    today ||
    showTripContextualActions(requested, workspaceKind, Boolean(visibleTrip?.observed));
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
        if (
          !today &&
          home &&
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
        }
        setStatus(result.observed ? "READY" : "UNAVAILABLE");
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
  }, [requested, today, home]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      request.current += 1;
      sub.remove();
    };
  }, [load, generation]);
  const open = (id: string) => {
    switchTrip(id.trim(), generation);
    router.setParams({ tripId: id.trim(), date: "", zone: "", view: "home" });
  };
  const backToTrips = () => {
    select(null);
    router.setParams({ tripId: "", date: "", zone: "", view: "" });
  };
  const createTrip = () => {
    select(null);
    router.setParams({ tripId: "", date: "", zone: "", view: "create" });
  };
  const openToday = (id: string, context: TodayEntry) => {
    if (generation !== getAccountGeneration()) return;
    enterHeader({ tripId: id, ...context, generation }, "EXPLICIT_TODAY_HEADER");
    router.navigate("/");
  };
  const enterDay = () => {
    try {
      const context = viewContext(date, zone);
      if (!visibleTrip?.observed) return;
      select({ tripId: requested, ...context, generation });
      router.setParams({ tripId: requested, ...context, view: "day" });
      setContextError(false);
    } catch {
      setContextError(true);
    }
  };
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
  const reviewZone =
    resumeView?.tripId === requested && resumeView.generation === generation
      ? resumeView.zone
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
  const widgetsForHome = (id: string) => {
    if (
      id !== requested ||
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
  const selected = today ? view : !home && view?.tripId === requested ? view : null;
  if (visibleTrip?.observed && selected)
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.heading}>{selected.date}</Text>
          <Text style={styles.meta}>{selected.zone}</Text>
          {visibleTrip.observed.sourceStatus === "HISTORICAL_ACCEPTED_PROJECTION" ? (
            <Text style={styles.meta}>{t("dayFeed.historical")}</Text>
          ) : null}
          <UiButton
            label={t("dayFeed.tripHome")}
            variant="text"
            onPress={() =>
              today
                ? router.navigate({
                    pathname: "/trip",
                    params: {
                      tripId: selected.tripId,
                      date: selected.date,
                      zone: selected.zone,
                      view: "home",
                    },
                  })
                : router.setParams({ view: "home" })
            }
          />
        </View>
        <DayFeed
          key={`${requested}/${selected.date}/${selected.zone}/${generation}`}
          entry={entry}
          onReadingChange={(reading) => saveReading(selected, reading)}
          projection={visibleTrip.observed.projection}
          date={selected.date}
          zone={selected.zone}
          services={visibleTrip.services}
          renderer={
            visibleTrip.observed.projection.version === 2
              ? createCoreExperienceRenderer(visibleTrip.observed.projection)
              : undefined
          }
        />
      </View>
    );
  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {!hideHomePrelude ? (
          <Text accessibilityRole="header" style={styles.heading}>
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
            tripId={requested || null}
            mode={params.view === "create" ? "CREATE" : "LIST"}
            onOpen={open}
            onCreate={createTrip}
            onOpenToday={openToday}
            onKnownTrip={knownTrip}
            onBackToTrips={backToTrips}
            widgetsForHome={widgetsForHome}
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
          <>
            {visibleTrip?.observed ? (
              <>
                <Text style={styles.meta}>
                  {t("dayFeed.admitted", { id: requested })}
                </Text>
                {visibleTrip.observed.sourceStatus ===
                "HISTORICAL_ACCEPTED_PROJECTION" ? (
                  <Text style={styles.meta}>{t("dayFeed.historical")}</Text>
                ) : null}
                <Text style={styles.meta}>{t("dayFeed.date")}</Text>
                <UiTextInput
                  accessibilityLabel={t("dayFeed.date")}
                  value={date}
                  onChangeText={setDate}
                  autoCapitalize="none"
                />
                <Text style={styles.meta}>{t("dayFeed.zone")}</Text>
                <UiTextInput
                  accessibilityLabel={t("dayFeed.zone")}
                  value={zone}
                  onChangeText={setZone}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.meta}>{t("dayFeed.contextHint")}</Text>
                {contextError ? (
                  <Text accessibilityRole="alert" style={styles.meta}>
                    {t("dayFeed.contextInvalid")}
                  </Text>
                ) : null}
                <UiButton label={t("dayFeed.openDay")} onPress={enterDay} />
                <UiButton
                  label={t("dayFeed.myTrips")}
                  variant="text"
                  onPress={backToTrips}
                />
              </>
            ) : knownWorkspaceTrip || !requested ? null : (
              <>
                <Text style={styles.meta}>{t("dayFeed.partial")}</Text>
                <Text style={styles.meta}>{t("dayFeed.explicitId")}</Text>
                <UiTextInput
                  accessibilityLabel={t("dayFeed.explicitId")}
                  value={key}
                  onChangeText={setKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <UiButton
                  label={t("dayFeed.lookup")}
                  onPress={() => open(key)}
                  disabled={!key.trim()}
                />
              </>
            )}
          </>
        )}
        {showContextualActions ? (
          <>
            <UiButton
              label={t("capture.activityRefresh")}
              variant="text"
              onPress={() => {
                void load();
              }}
            />
            <UiButton
              label={t("navigation.capture")}
              variant="text"
              onPress={() => router.navigate("/capture")}
            />
            <UiButton
              label={t("navigation.ledger")}
              variant="text"
              onPress={() => router.navigate("/expenses")}
            />
          </>
        ) : null}
        {__DEV__ && showContextualActions ? (
          <UiButton
            label={t("dayLab.title")}
            variant="text"
            onPress={() => router.push("/day-feed-lab")}
          />
        ) : null}
        {showContextualActions ? (
          <UiButton
            label={t("dayFeed.validation")}
            variant="text"
            onPress={() => router.push("/trip-validation")}
          />
        ) : null}
      </ScrollView>
      {visibleOverlay?.read.observed ? (
        <DayFeed
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
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.heading },
    header: { paddingHorizontal: visual.space.page, paddingTop: visual.space.heading },
    heading: { ...visual.type.metric, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
