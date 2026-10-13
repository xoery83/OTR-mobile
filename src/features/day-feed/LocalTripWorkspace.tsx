import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import type { Trip } from "@/domain/trip/types";
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
  onOpen(id: string): void;
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
      key={JSON.stringify([generation, props.tripId])}
      {...props}
      generation={generation}
    />
  );
}
function LocalTripContent({
  tripId,
  onOpen,
  onKnownTrip,
  onBackToTrips,
  generation,
}: Props & { generation: number }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [trips, setTrips] = useState<Trip[]>([]),
    [selected, setSelected] = useState<Trip | null>(null),
    [pending, setPending] = useState<Pending>([]);
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
      setSelected(local);
      setPending(intents);
      setStatus("READY");
      onKnownTrip(local !== null);
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
            {selected.destination ? (
              <Text style={styles.body}>{selected.destination}</Text>
            ) : null}
            {selected.startDate ? (
              <Text style={styles.body}>{displayDate(selected.startDate)}</Text>
            ) : null}
            {selected.endDate ? (
              <Text style={styles.body}>{displayDate(selected.endDate)}</Text>
            ) : null}
            <Text style={styles.status}>{t("tripCreate.pendingTrip")}</Text>
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
      ) : (
        <>
          <UiSection title={t("tripCreate.savedTrips")}>
            {status === "UNAVAILABLE" ? (
              <Text style={styles.status}>{t("tripCreate.unavailable")}</Text>
            ) : (
              trips.map((trip) => (
                <UiButton
                  key={trip.id}
                  label={trip.name}
                  variant="secondary"
                  onPress={() => onOpen(trip.id)}
                />
              ))
            )}
          </UiSection>
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
