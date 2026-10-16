import { useTripPreparationWidget } from "./useTripPreparationWidget";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTripHomeFinanceWidget } from "@/features/ledger/TripHomeFinanceWidget";
import type { TripHomeWidget } from "@/features/trip/TripHomeWidgetHost";
import { router } from "expo-router";
import { SheetHeader } from "@/components/SheetHeader";
import { useTripView } from "./TripViewContext";
import { TripHomeFrame } from "@/features/trip/TripHomeFrame";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Alert, AppState, Modal, ScrollView, StyleSheet, View } from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import { createUuid } from "@/domain/localId";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import {
  readLocalTripDiscoveryRepository,
  type TripListSummary,
} from "@/data/repositories/tripDiscoveryRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText as Text } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import { boundaryZone } from "./presentation";
import { groupLocalTrips, possibleTodayTrips } from "./tripListPresentation";
import { MyTripsList, type TodayEntry } from "./MyTripsList";
import { CalendarField, calendarDate } from "./TripCalendarField";
import { TripBasicEditor } from "./TripBasicEditor";
import { LocalTripPhotos } from "./LocalTripPhotos";
import { tripCoverSource } from "./tripCovers";

const displayDate = (value: string) =>
  formatUiDate(new Date(`${value}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const knownDate = (value: string | null) => {
  if (!value) return null;
  try {
    return validateCalendarDate(value);
  } catch {
    return null;
  }
};

type Props = {
  widgetsForHome?: (
    tripId: string,
    lifecycle: "Upcoming" | "Active" | "Past" | "Undated",
    planningDate?: string | null,
  ) => readonly TripHomeWidget[];
  onOpenHomeItem?: (tripId: string, itemId: string, epoch: string) => Promise<void>;
  tripId: string | null;
  homePerspective?: { now: string; date: string; zone: string };
  mode?: "LIST" | "CREATE" | "PAST";
  onOpen(id: string): void;
  onCreate(): void;
  onOpenToday(id: string, context: TodayEntry): void;
  onKnownTrip(kind: "LOCAL" | "CACHED" | "NONE"): void;
  onBackToTrips(): void;
  onHomeHeroHeight?: (height: number) => void;
  onChooseDay?: (date?: string | null) => void;
  onManualItemSaved?: (tripId: string, generation: number) => void;
};
export function LocalTripWorkspace(props: Props) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return (
    <LocalTripContent
      key={JSON.stringify([generation, props.tripId, props.mode])}
      {...props}
      generation={generation}
    />
  );
}
function LocalTripContent({
  tripId,
  mode = "LIST",
  onOpen,
  onCreate,
  onOpenToday,
  onKnownTrip,
  onBackToTrips,
  onHomeHeroHeight,
  onChooseDay,
  onManualItemSaved,
  widgetsForHome,
  onOpenHomeItem,
  homePerspective,
  generation,
}: Props & { generation: number }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [trips, setTrips] = useState<Trip[]>([]),
    [remoteTrips, setRemoteTrips] = useState<TripListSummary[]>([]),
    [selected, setSelected] = useState<Trip | null>(null),
    [remoteSelected, setRemoteSelected] = useState<TripListSummary | null>(null),
    [eligibleToday, setEligibleToday] = useState<Record<string, TodayEntry>>({});
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [name, setName] = useState(""),
    [destination, setDestination] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  const [metadataEditable, setMetadataEditable] = useState(false);
  const [family, setFamily] = useState<"P1" | "P3">("P1"),
    [itemTitle, setItemTitle] = useState(""),
    [itemStart, setItemStart] = useState(""),
    [itemEnd, setItemEnd] = useState("");
  const { publishQuickActions, localOutcome } = useTripView();
  const [quickActionsOwner] = useState(() => Symbol("mounted-trip-quick-actions"));
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [photosReady, setPhotosReady] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const photoAdd = useRef<(() => void) | null>(null);
  const registerPhotos = useCallback((add: (() => void) | null) => {
    photoAdd.current = add;
    setPhotosReady(Boolean(add));
  }, []);
  const photosSaved = useCallback(() => setSavedNotice(true), []);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(false);
  const request = useRef(0),
    busy = useRef(false),
    tripOperation = useRef({ operationId: createUuid(), tripId: createUuid() }),
    itemOperation = useRef({ operationId: createUuid(), itemId: createUuid() });
  const alive = useRef(true),
    saveOwner = useRef<symbol | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      saveOwner.current = null;
      request.current += 1;
    };
  }, []);
  const load = useCallback(async () => {
    const captured = generation,
      ticket = ++request.current;
    try {
      const repo = await readLocalTripRepository();
      const local = tripId ? await repo.getTrip(tripId) : null;
      const list = tripId ? [] : await repo.listTrips();
      const canEditMetadata = local ? await repo.canUpdateMetadata(local.id) : false;
      const discovery = await readLocalTripDiscoveryRepository()
        .then((reader) => reader.readMerged())
        .catch(() => null);
      const cached =
        tripId && !local
          ? (discovery?.trips.find(
              (trip) => trip.id === tripId && trip.localStatus === null,
            ) ?? null)
          : null;
      const localIds = new Set(list.map((trip) => trip.id));
      if (
        !alive.current ||
        captured !== getAccountGeneration() ||
        ticket !== request.current
      )
        return;
      setMetadataEditable(canEditMetadata);
      setTrips(list);
      setRemoteTrips(
        tripId
          ? []
          : (discovery?.trips.filter(
              (trip) => trip.localStatus === null && !localIds.has(trip.id),
            ) ?? []),
      );
      setEligibleToday({});
      setSelected(local);
      setRemoteSelected(cached);
      setStatus("READY");
      onKnownTrip(local ? "LOCAL" : cached ? "CACHED" : "NONE");
      if (!tripId && list.length) {
        const possible = possibleTodayTrips(list, calendarDate(new Date()));
        if (possible.length) {
          void (async () => {
            try {
              const reader = await readTripDayFeed();
              const matches = await Promise.all(
                possible.map(async (trip) => {
                  try {
                    const result = await reader.trip(trip.id);
                    if (result.scope.generation !== captured || !result.observed)
                      return null;
                    const zone = boundaryZone(result.observed.projection);
                    if (!zone) return null;
                    const date = localCalendarDate(new Date().toISOString(), zone);
                    if (!groupLocalTrips([trip], date).active.length) return null;
                    return [trip.id, { date, zone }] as const;
                  } catch {
                    return null;
                  }
                }),
              );
              if (
                alive.current &&
                captured === getAccountGeneration() &&
                ticket === request.current
              )
                setEligibleToday(
                  Object.fromEntries(matches.filter((entry) => entry !== null)),
                );
            } catch {
              // A missing accepted Day never hides the local Trip list.
            }
          })();
        }
      }
    } catch {
      if (
        !alive.current ||
        captured !== getAccountGeneration() ||
        ticket !== request.current
      )
        return;
      setTrips([]);
      setRemoteTrips([]);
      setSelected(null);
      setRemoteSelected(null);
      setEligibleToday({});
      setStatus("UNAVAILABLE");
      onKnownTrip("NONE");
    }
  }, [tripId, onKnownTrip, generation]);
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
  const save = async (item: boolean) => {
    if (busy.current || !alive.current || generation !== getAccountGeneration()) return;
    busy.current = true;
    setSaving(true);
    setError(false);
    const captured = generation,
      owner = Symbol("trip-ui-save");
    saveOwner.current = owner;
    const current = () =>
      alive.current && saveOwner.current === owner && captured === getAccountGeneration();
    try {
      const repo = await readLocalTripRepository();
      if (!current()) return;
      if (item && selected) {
        await repo.addItem(selected.id, {
          ...itemOperation.current,
          family,
          title: itemTitle,
          startDate: itemStart,
          ...(family === "P3" ? { endDate: itemEnd } : {}),
        });
        if (!current()) return;
        onManualItemSaved?.(selected.id, captured);
        itemOperation.current = { operationId: createUuid(), itemId: createUuid() };
        setItemTitle("");
        setItemStart("");
        setItemEnd("");
        await load();
        if (current()) {
          setItemFormOpen(false);
          setSavedNotice(true);
        }
      } else {
        const trip = await repo.createTrip({
          ...tripOperation.current,
          name,
          destination,
          startDate: start || null,
          endDate: end || null,
        });
        if (!current()) return;
        tripOperation.current = { operationId: createUuid(), tripId: createUuid() };
        onOpen(trip.id);
      }
    } catch {
      if (current()) setError(true);
    } finally {
      if (saveOwner.current === owner) {
        saveOwner.current = null;
        busy.current = false;
        if (alive.current && captured === getAccountGeneration()) setSaving(false);
      }
    }
  };
  const openToday = async (id: string) => {
    const prior = eligibleToday[id];
    if (!prior || generation !== getAccountGeneration()) return;
    try {
      const reader = await readTripDayFeed();
      const result = await reader.trip(id);
      if (
        !alive.current ||
        generation !== getAccountGeneration() ||
        result.scope.generation !== generation ||
        !result.observed
      )
        return;
      const zone = boundaryZone(result.observed.projection);
      if (!zone || zone !== prior.zone) return;
      const date = localCalendarDate(new Date().toISOString(), zone);
      if (date !== prior.date) return;
      const repo = await readLocalTripRepository();
      const local = await repo.getTrip(id);
      if (
        !local ||
        !groupLocalTrips([local], date).active.length ||
        !alive.current ||
        generation !== getAccountGeneration()
      )
        return;
      onOpenToday(id, { date, zone });
    } catch {
      // A stale or revoked Day action simply stays on My Trips.
    }
  };
  const selectCover = async (id: BuiltInTripCoverId) => {
    const trip = selected;
    if (!trip || !alive.current || generation !== getAccountGeneration()) return;
    const repo = await readLocalTripRepository();
    if (!alive.current || generation !== getAccountGeneration()) return;
    await repo.selectBuiltInCover(trip.id, id);
    if (alive.current && generation === getAccountGeneration()) await load();
  };
  const leaveHome = useCallback(() => {
    if (!alive.current || generation !== getAccountGeneration()) return;
    if (!itemTitle && !itemStart && !itemEnd) {
      onBackToTrips();
      return;
    }
    if (saving) return;
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          if (!alive.current || generation !== getAccountGeneration()) return;
          setItemTitle("");
          setItemStart("");
          setItemEnd("");
          onBackToTrips();
        },
      },
    ]);
  }, [generation, itemTitle, itemStart, itemEnd, saving, onBackToTrips]);
  const closeItemForm = () => {
    if (saving) return;
    if (!itemTitle && !itemStart && !itemEnd) {
      setItemFormOpen(false);
      return;
    }
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          setItemTitle("");
          setItemStart("");
          setItemEnd("");
          setItemFormOpen(false);
        },
      },
    ]);
  };
  useEffect(() => {
    if (!selected || status !== "READY") return;
    const owner = selected.id;
    publishQuickActions(
      {
        tripName: selected.name,
        tripId: owner,
        generation,
        owner: quickActionsOwner,
        backToTrips: leaveHome,
        editTrip: () => {
          if (alive.current && generation === getAccountGeneration()) setCoverOpen(true);
        },
        ...(onChooseDay ? { chooseDay: () => onChooseDay(selected.startDate) } : {}),
        itinerary: (date) => {
          if (!alive.current || generation !== getAccountGeneration()) return;
          if (date) setItemStart((previous) => previous || date);
          setItemFormOpen(true);
        },
        ...(photosReady
          ? {
              photos: () => {
                if (alive.current && generation === getAccountGeneration())
                  photoAdd.current?.();
              },
            }
          : {}),
      },
      owner,
      generation,
      quickActionsOwner,
    );
    return () => publishQuickActions(null, owner, generation, quickActionsOwner);
  }, [
    selected,
    status,
    generation,
    photosReady,
    publishQuickActions,
    quickActionsOwner,
    leaveHome,
    onChooseDay,
  ]);
  const remoteStart = knownDate(remoteSelected?.startDate ?? null);
  const remoteEnd = knownDate(remoteSelected?.endDate ?? null);
  const metadata = selected ?? remoteSelected;
  const lifecycleGroups = metadata
    ? groupLocalTrips([metadata], homePerspective?.date ?? calendarDate(new Date()))
    : null;
  const lifecycle = lifecycleGroups?.past.length
    ? "Past"
    : lifecycleGroups?.active.length
      ? "Active"
      : lifecycleGroups?.upcoming.length
        ? "Upcoming"
        : metadata
          ? "Undated"
          : null;
  const preparation = useTripPreparationWidget({
    tripId:
      lifecycle === "Upcoming" || lifecycle === "Undated" ? (metadata?.id ?? null) : null,
    undated: lifecycle === "Undated",
    onImport: selected
      ? () => {
          if (generation === getAccountGeneration())
            router.push({ pathname: "/capture", params: { tripId: selected.id } });
        }
      : undefined,
    onBuild: selected
      ? () => {
          if (generation === getAccountGeneration()) setItemFormOpen(true);
        }
      : undefined,
    onOpenDay: onChooseDay ? () => onChooseDay(metadata?.startDate) : undefined,
    onOpenItem: onOpenHomeItem,
  });
  const finance = useTripHomeFinanceWidget(metadata?.id ?? null, lifecycle);
  const pages = [
    ...(preparation ? [preparation] : []),
    ...(metadata && lifecycle
      ? (widgetsForHome?.(metadata.id, lifecycle, metadata.startDate) ?? [])
      : []),
    ...(finance ? [finance] : []),
  ];
  if (mode === "PAST")
    return status === "READY" ? (
      <MyTripsList
        pastOnly
        trips={trips}
        remoteTrips={remoteTrips}
        today={calendarDate(new Date())}
        eligibleToday={eligibleToday}
        onOpen={onOpen}
        onOpenToday={(id) => void openToday(id)}
        onCreate={onCreate}
      />
    ) : (
      <View style={styles.pastRoot}>
        <Text style={styles.status}>
          {t(status === "LOADING" ? "dayFeed.loading" : "tripCreate.unavailable")}
        </Text>
      </View>
    );
  if (tripId && !selected && !remoteSelected) return null;
  return (
    <View style={styles.root}>
      {error && !selected && !remoteSelected ? (
        <Text accessibilityRole="alert" style={styles.status}>
          {t("tripCreate.saveFailed")}
        </Text>
      ) : null}
      {selected ? (
        <>
          <TripHomeFrame
            onEdit={() => {
              if (alive.current && generation === getAccountGeneration())
                setCoverOpen(true);
            }}
            onHeroHeight={onHomeHeroHeight}
            widgets={pages}
            title={selected.name}
            cover={tripCoverSource(selected)}
            metadata={[
              ...(selected.destination ? [selected.destination] : []),
              ...(selected.startDate && selected.endDate
                ? [
                    t("myTrips.dateRange", {
                      start: displayDate(selected.startDate),
                      end: displayDate(selected.endDate),
                    }),
                  ]
                : selected.startDate
                  ? [t("myTrips.starts", { date: displayDate(selected.startDate) })]
                  : selected.endDate
                    ? [t("myTrips.ends", { date: displayDate(selected.endDate) })]
                    : [t("myTrips.datesToBeDecided")]),
            ]}
            modules={
              <View style={styles.root}>
                <LocalTripPhotos
                  compact
                  tripId={selected.id}
                  registerAdd={registerPhotos}
                  onSaved={photosSaved}
                />
              </View>
            }
          />
          {savedNotice ||
          (localOutcome?.tripId === selected.id &&
            localOutcome.generation === generation) ? (
            <Text style={styles.status}>{t("actionIsland.savedLocally")}</Text>
          ) : null}
          {localOutcome?.tripId === selected.id &&
          localOutcome.generation === generation ? (
            <UiButton
              label={t("actionIsland.openSavedExpense")}
              variant="text"
              onPress={() =>
                router.push({
                  pathname: "/expenses/expense/[id]",
                  params: { id: localOutcome.id },
                })
              }
            />
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.status}>
              {t("tripCreate.saveFailed")}
            </Text>
          ) : null}
          <Modal
            visible={coverOpen}
            onRequestClose={() => setCoverOpen(false)}
            animationType="slide"
          >
            <SafeAreaProvider style={styles.modal}>
              <SheetHeader
                title={t("tripHome.edit")}
                onLeft={() => setCoverOpen(false)}
              />
              <ScrollView contentContainerStyle={styles.form}>
                <TripBasicEditor
                  trip={selected}
                  metadataEditable={metadataEditable}
                  onSelectCover={selectCover}
                  onSaveMetadata={async (before, after) => {
                    if (!alive.current || generation !== getAccountGeneration())
                      throw new Error("TRIP_METADATA_CONTEXT_CHANGED");
                    const repo = await readLocalTripRepository();
                    if (!alive.current || generation !== getAccountGeneration())
                      throw new Error("TRIP_METADATA_CONTEXT_CHANGED");
                    await repo.updateMetadata({
                      operationId: createUuid(),
                      tripId: selected.id,
                      before,
                      after,
                    });
                    if (alive.current && generation === getAccountGeneration())
                      await load();
                  }}
                />
              </ScrollView>
            </SafeAreaProvider>
          </Modal>
          <Modal
            visible={itemFormOpen}
            onRequestClose={closeItemForm}
            animationType="slide"
          >
            <View style={styles.modal}>
              <SheetHeader
                title={t("tripCreate.addItem")}
                leftLabel={t("common.cancel")}
                onLeft={closeItemForm}
              />
              <ScrollView contentContainerStyle={styles.form}>
                {error ? (
                  <Text accessibilityRole="alert" style={styles.status}>
                    {t("tripCreate.saveFailed")}
                  </Text>
                ) : null}
                <UiSection title={t("tripCreate.addItem")}>
                  <UiChoiceChip
                    label={t("tripCreate.activity")}
                    selected={family === "P1"}
                    onPress={() => setFamily("P1")}
                  />
                  <UiChoiceChip
                    label={t("tripCreate.stay")}
                    selected={family === "P3"}
                    onPress={() => setFamily("P3")}
                  />
                  <UiTextInput
                    accessibilityLabel={t("tripCreate.itemTitle")}
                    placeholder={t("tripCreate.itemTitle")}
                    value={itemTitle}
                    onChangeText={setItemTitle}
                    editable={!saving}
                  />
                  <CalendarField
                    label={t(
                      family === "P3" ? "tripCreate.checkin" : "tripCreate.itemDate",
                    )}
                    value={itemStart}
                    onChange={setItemStart}
                  />
                  {family === "P3" ? (
                    <CalendarField
                      label={t("tripCreate.checkout")}
                      value={itemEnd}
                      onChange={setItemEnd}
                    />
                  ) : null}
                  <UiButton
                    label={t("tripCreate.saveItem")}
                    disabled={
                      saving ||
                      !itemTitle.trim() ||
                      !itemStart ||
                      (family === "P3" && !itemEnd)
                    }
                    onPress={() => void save(true)}
                  />
                </UiSection>
              </ScrollView>
            </View>
          </Modal>
        </>
      ) : remoteSelected ? (
        <>
          <TripHomeFrame
            onHeroHeight={onHomeHeroHeight}
            widgets={pages}
            title={remoteSelected.name}
            cover={tripCoverSource(remoteSelected)}
            notice={t("myTrips.cachedDetails")}
            metadata={[
              ...(remoteSelected.destination ? [remoteSelected.destination] : []),
              ...(remoteStart && remoteEnd
                ? [
                    t("myTrips.dateRange", {
                      start: displayDate(remoteStart),
                      end: displayDate(remoteEnd),
                    }),
                  ]
                : remoteStart
                  ? [t("myTrips.starts", { date: displayDate(remoteStart) })]
                  : remoteEnd
                    ? [t("myTrips.ends", { date: displayDate(remoteEnd) })]
                    : [t("myTrips.datesToBeDecided")]),
            ]}
          />
          {localOutcome?.tripId === remoteSelected.id &&
          localOutcome.generation === generation ? (
            <>
              <Text style={styles.status}>{t("actionIsland.savedLocally")}</Text>
              <UiButton
                label={t("actionIsland.openSavedExpense")}
                variant="text"
                onPress={() =>
                  router.push({
                    pathname: "/expenses/expense/[id]",
                    params: { id: localOutcome.id },
                  })
                }
              />
            </>
          ) : null}
        </>
      ) : mode === "LIST" ? (
        status === "READY" ? (
          <MyTripsList
            trips={trips}
            remoteTrips={remoteTrips}
            today={calendarDate(new Date())}
            eligibleToday={eligibleToday}
            onOpen={onOpen}
            onOpenToday={(id) => void openToday(id)}
            onCreate={onCreate}
          />
        ) : (
          <Text style={styles.status}>
            {t(status === "LOADING" ? "dayFeed.loading" : "tripCreate.unavailable")}
          </Text>
        )
      ) : (
        <>
          <UiSection title={t("tripCreate.newTrip")}>
            <UiTextInput
              accessibilityLabel={t("tripCreate.name")}
              placeholder={t("tripCreate.name")}
              value={name}
              onChangeText={setName}
              editable={!saving}
            />
            <UiTextInput
              accessibilityLabel={t("tripCreate.destination")}
              placeholder={t("tripCreate.destination")}
              value={destination}
              onChangeText={setDestination}
              editable={!saving}
            />
            <CalendarField
              label={t("tripCreate.start")}
              value={start}
              onChange={setStart}
            />
            <CalendarField label={t("tripCreate.end")} value={end} onChange={setEnd} />
            <UiButton
              label={t("tripCreate.saveTrip")}
              disabled={saving || status !== "READY" || !name.trim()}
              onPress={() => void save(false)}
            />
          </UiSection>
        </>
      )}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    modal: { flex: 1, backgroundColor: colors.background },
    form: { padding: visual.space.page, gap: visual.space.card },
    pastRoot: { flex: 1, backgroundColor: colors.background, padding: visual.space.page },
    root: { gap: visual.space.section },
    body: { color: colors.textPrimary, ...visual.type.row },
    status: { color: colors.textSecondary, ...visual.type.meta },
  });
