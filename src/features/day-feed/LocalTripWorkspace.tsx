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
import {
  readLocalTripRepository,
  type TripRepository,
} from "@/data/repositories/tripRepository";
import {
  readLocalTripDiscoveryRepository,
  type TripListSummary,
} from "@/data/repositories/tripDiscoveryRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText as Text } from "@/ui/controls";
import { UiChoiceChip, UiDatePicker, UiFormRow, UiTextInput } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import { boundaryZone } from "./presentation";
import { groupLocalTrips, possibleTodayTrips } from "./tripListPresentation";
import { MyTripsList, type TodayEntry } from "./MyTripsList";
import { TripCoverPicker } from "./TripCoverPicker";
import { LocalTripPhotos } from "./LocalTripPhotos";
import { tripCoverSource } from "./tripCovers";

type Pending = Awaited<ReturnType<TripRepository["pendingItems"]>>;
const calendarDate = (value: Date) =>
  [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
const pickerDate = (value: string) =>
  value
    ? new Date(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10), 12)
    : new Date();
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
function CalendarField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(pickerDate(value));
  return (
    <View>
      <UiFormRow
        label={label}
        value={value ? displayDate(value) : t("tripCreate.notSet")}
        stacked
        onPress={() => {
          setSelected(pickerDate(value));
          setOpen(true);
        }}
      />
      {open ? (
        <View>
          <UiDatePicker
            value={selected}
            mode="date"
            display="spinner"
            onChange={(_, date) => {
              if (date) setSelected(date);
            }}
            accessibilityLabel={label}
          />
          <UiButton
            label={t("common.done")}
            onPress={() => {
              onChange(calendarDate(selected));
              setOpen(false);
            }}
          />
          <UiButton
            label={t("tripCreate.clearDate")}
            variant="text"
            onPress={() => {
              onChange("");
              setOpen(false);
            }}
          />
          <UiButton
            label={t("common.cancel")}
            variant="text"
            onPress={() => setOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

type Props = {
  widgetsForHome?: (tripId: string) => readonly TripHomeWidget[];
  tripId: string | null;
  mode?: "LIST" | "CREATE";
  onOpen(id: string): void;
  onCreate(): void;
  onOpenToday(id: string, context: TodayEntry): void;
  onKnownTrip(kind: "LOCAL" | "CACHED" | "NONE"): void;
  onBackToTrips(): void;
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
  widgetsForHome,
  generation,
}: Props & { generation: number }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [trips, setTrips] = useState<Trip[]>([]),
    [remoteTrips, setRemoteTrips] = useState<TripListSummary[]>([]),
    [selected, setSelected] = useState<Trip | null>(null),
    [remoteSelected, setRemoteSelected] = useState<TripListSummary | null>(null),
    [pending, setPending] = useState<Pending>([]),
    [eligibleToday, setEligibleToday] = useState<Record<string, TodayEntry>>({});
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [name, setName] = useState(""),
    [destination, setDestination] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
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
      const intents = local ? await repo.pendingItems(local.id) : [];
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
      setPending(intents);
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
      setPending([]);
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
  const leaveHome = () => {
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
          setItemTitle("");
          setItemStart("");
          setItemEnd("");
          onBackToTrips();
        },
      },
    ]);
  };
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
  }, [selected, status, generation, photosReady, publishQuickActions, quickActionsOwner]);
  const remoteStart = knownDate(remoteSelected?.startDate ?? null);
  const remoteEnd = knownDate(remoteSelected?.endDate ?? null);
  const metadata = selected ?? remoteSelected;
  const lifecycleGroups = metadata
    ? groupLocalTrips([metadata], calendarDate(new Date()))
    : null;
  const lifecycle = lifecycleGroups?.past.length
    ? "Past"
    : lifecycleGroups?.active.length
      ? "Active"
      : lifecycleGroups?.upcoming.length
        ? "Upcoming"
        : null;
  const finance = useTripHomeFinanceWidget(metadata?.id ?? null, lifecycle);
  const pages = [
    ...(lifecycle === "Past" && metadata ? (widgetsForHome?.(metadata.id) ?? []) : []),
    ...(finance ? [finance] : []),
  ];
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
            widgets={pages}
            title={selected.name}
            onBack={leaveHome}
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
                <UiFormRow
                  label={t("cleanup.documents")}
                  value={t("cleanup.unavailable")}
                  disabled
                  onPress={() => {}}
                />
                <UiFormRow
                  label={t("actionIsland.member")}
                  value={t("cleanup.unavailable")}
                  disabled
                  onPress={() => {}}
                />
                <LocalTripPhotos
                  tripId={selected.id}
                  registerAdd={registerPhotos}
                  onSaved={photosSaved}
                />
                <UiFormRow
                  label={t("tripHome.coverTools")}
                  value=""
                  onPress={() => setCoverOpen(true)}
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
                title={t("tripHome.coverTools")}
                onLeft={() => setCoverOpen(false)}
              />
              <ScrollView contentContainerStyle={styles.form}>
                <TripCoverPicker
                  selected={selected.selectedCoverAssetId}
                  onSelect={selectCover}
                />
              </ScrollView>
            </SafeAreaProvider>
          </Modal>
          {pending.length ? (
            <UiSection title={t("tripCreate.pendingItems")}>
              {pending.map((p) => {
                return (
                  <View key={p.command.operationId}>
                    <Text style={styles.body}>{p.payload.core.title}</Text>
                    {p.payload.schedule.start.local_date ? (
                      <Text style={styles.body}>
                        {displayDate(p.payload.schedule.start.local_date)}
                      </Text>
                    ) : null}
                    {p.payload.schedule.end?.local_date ? (
                      <Text style={styles.body}>
                        {displayDate(p.payload.schedule.end.local_date)}
                      </Text>
                    ) : null}
                    <Text style={styles.status}>
                      {t(
                        ["FAILED", "CONFLICT", "DENIED"].includes(p.state)
                          ? "tripCreate.itemNeedsAttention"
                          : "tripCreate.itemPending",
                      )}
                    </Text>
                  </View>
                );
              })}
            </UiSection>
          ) : null}
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
            widgets={pages}
            title={remoteSelected.name}
            onBack={leaveHome}
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
    root: { gap: visual.space.section },
    body: { color: colors.textPrimary, ...visual.type.row },
    status: { color: colors.textSecondary, ...visual.type.meta },
  });
