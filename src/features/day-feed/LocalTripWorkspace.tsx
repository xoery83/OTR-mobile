import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import { localCalendarDate } from "@/domain/trip/dayReadModel";
import { createUuid } from "@/domain/localId";
import {
  readLocalTripRepository,
  type TripRepository,
} from "@/data/repositories/tripRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection } from "@/ui/controls";
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
  tripId: string | null;
  mode?: "LIST" | "CREATE";
  onOpen(id: string): void;
  onCreate(): void;
  onOpenToday(id: string, context: TodayEntry): void;
  onKnownTrip(known: boolean): void;
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
  generation,
}: Props & { generation: number }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [trips, setTrips] = useState<Trip[]>([]),
    [selected, setSelected] = useState<Trip | null>(null),
    [pending, setPending] = useState<Pending>([]),
    [eligibleToday, setEligibleToday] = useState<Record<string, TodayEntry>>({});
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [name, setName] = useState(""),
    [destination, setDestination] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [family, setFamily] = useState<"P1" | "P3">("P1"),
    [itemTitle, setItemTitle] = useState(""),
    [itemStart, setItemStart] = useState(""),
    [itemEnd, setItemEnd] = useState("");
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
      if (
        !alive.current ||
        captured !== getAccountGeneration() ||
        ticket !== request.current
      )
        return;
      setTrips(list);
      setEligibleToday({});
      setSelected(local);
      setPending(intents);
      setStatus("READY");
      onKnownTrip(local !== null);
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
      setSelected(null);
      setPending([]);
      setEligibleToday({});
      setStatus("UNAVAILABLE");
      onKnownTrip(false);
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
  if (tripId && !selected) return null;
  return (
    <View style={styles.root}>
      {error ? (
        <Text accessibilityRole="alert" style={styles.status}>
          {t("tripCreate.saveFailed")}
        </Text>
      ) : null}
      {selected ? (
        <>
          <UiButton label={t("dayFeed.myTrips")} variant="text" onPress={onBackToTrips} />
          <UiSection title={selected.name}>
            <TripCoverPicker
              selected={selected.selectedCoverAssetId}
              onSelect={selectCover}
            />
            {selected.destination ? (
              <Text style={styles.body}>{selected.destination}</Text>
            ) : null}
            {selected.startDate ? (
              <Text style={styles.body}>{displayDate(selected.startDate)}</Text>
            ) : null}
            {selected.endDate ? (
              <Text style={styles.body}>{displayDate(selected.endDate)}</Text>
            ) : null}
            {selected.syncStatus === "PENDING_CREATE" ||
            selected.syncStatus === "SYNCED" ? (
              <Text style={styles.status}>
                {t(
                  selected.syncStatus === "SYNCED"
                    ? "tripCreate.acceptedTrip"
                    : "tripCreate.pendingTrip",
                )}
              </Text>
            ) : null}
          </UiSection>
          <UiSection title={t("tripCreate.pendingItems")}>
            <Text style={styles.status}>{t("tripCreate.pendingHint")}</Text>
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
              label={t(family === "P3" ? "tripCreate.checkin" : "tripCreate.itemDate")}
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
                saving || !itemTitle.trim() || !itemStart || (family === "P3" && !itemEnd)
              }
              onPress={() => void save(true)}
            />
          </UiSection>
        </>
      ) : mode === "LIST" ? (
        status === "READY" ? (
          <MyTripsList
            trips={trips}
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
    root: { gap: visual.space.section },
    body: { color: colors.textPrimary, ...visual.type.row },
    status: { color: colors.textSecondary, ...visual.type.meta },
  });
