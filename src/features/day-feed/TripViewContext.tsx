import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  localCalendarDate,
  validateCalendarDate,
  type DayEvent,
  type DayQuery,
} from "@/domain/trip/dayReadModel";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
export type TripView = { tripId: string; date: string; zone: string; generation: number };
export type DayReading = {
  offset: number;
  focus: string | null;
  layout?: "WHOLE_TRIP";
  anchoredDate?: string;
};
export type DayEntryKind =
  "RESUME" | "EXPLICIT_TODAY_HEADER" | "FIRST_VALID_PAST_DAY_HEADER";
export type DayEntry = { revision: number; kind: DayEntryKind; reading: DayReading };
type Bookmark = { view: TripView; reading: DayReading };
export type TripNavigation = {
  view: TripView | null;
  entry: DayEntry;
  bookmarks: Record<string, Bookmark>;
  lastTrip: string | null;
  workingTrip?: { tripId: string; generation: number };
};
export const emptyTripNavigation: TripNavigation = {
  view: null,
  entry: { revision: 0, kind: "RESUME", reading: { offset: 0, focus: null } },
  bookmarks: {},
  lastTrip: null,
};
export function enterTripDay(
  state: TripNavigation,
  view: TripView | null,
  kind: DayEntryKind = "RESUME",
): TripNavigation {
  if (!view) return { ...state, view: null };
  const saved = state.bookmarks[view.tripId];
  const reading =
    kind === "RESUME" &&
    saved?.view.generation === view.generation &&
    saved.view.date === view.date &&
    saved.view.zone === view.zone
      ? saved.reading
      : { offset: 0, focus: null };
  return {
    ...state,
    view,
    entry: { revision: state.entry.revision + 1, kind, reading },
    ...(kind === "RESUME"
      ? {
          bookmarks: { ...state.bookmarks, [view.tripId]: { view, reading } },
          lastTrip: view.tripId,
        }
      : {}),
  };
}
export function saveTripReading(
  state: TripNavigation,
  view: TripView,
  reading: DayReading,
  revision = state.entry.revision,
) {
  if (
    state.entry.revision !== revision ||
    state.entry.kind !== "RESUME" ||
    state.view?.tripId !== view.tripId ||
    state.view.generation !== view.generation ||
    state.view.date !== view.date ||
    state.view.zone !== view.zone
  )
    return state;
  let anchoredDate: string | undefined;
  try {
    if (reading.layout === "WHOLE_TRIP" && reading.anchoredDate)
      anchoredDate = validateCalendarDate(reading.anchoredDate);
  } catch {
    /* Invalid layout hints never replace the known view date. */
  }
  return {
    ...state,
    bookmarks: {
      ...state.bookmarks,
      [view.tripId]: {
        view: anchoredDate ? { ...view, date: anchoredDate } : view,
        reading: {
          offset: Number.isFinite(reading.offset) ? Math.max(0, reading.offset) : 0,
          focus: reading.focus,
          ...(reading.layout === "WHOLE_TRIP"
            ? { layout: reading.layout, ...(anchoredDate ? { anchoredDate } : {}) }
            : {}),
        },
      },
    },
  };
}
export function switchWorkingTrip(
  state: TripNavigation,
  tripId: string,
  generation: number,
): TripNavigation {
  const saved = state.bookmarks[tripId];
  return {
    ...state,
    workingTrip: { tripId, generation },
    view: saved?.view.generation === generation ? saved.view : null,
    entry: {
      revision: state.entry.revision + 1,
      kind: "RESUME",
      reading:
        saved?.view.generation === generation
          ? saved.reading
          : { offset: 0, focus: null },
    },
  };
}
export type TripQuickActions = {
  backToTrips?: () => void;
  chooseDay?: () => void;
  tripName: string;
  tripId: string;
  generation: number;
  owner: symbol;
  itinerary(date: string | null): void;
  photos?: () => void;
};
const Context = createContext<{
  localOutcome: { tripId: string; generation: number; id: string } | null;
  reportLocalOutcome: (tripId: string, generation: number, id: string) => void;
  quickActions: TripQuickActions | null;
  publishQuickActions: (
    actions: TripQuickActions | null,
    owner: string,
    generation: number,
    token: symbol,
  ) => void;
  workingTrip: { tripId: string; generation: number } | null;
  switchTrip: (tripId: string, generation: number) => void;
  view: TripView | null;
  resumeView: TripView | null;
  entry: DayEntry;
  select: (view: TripView | null) => void;
  enterHeader: (view: TripView, kind: Exclude<DayEntryKind, "RESUME">) => void;
  resume: () => void;
  saveReading: (view: TripView, reading: DayReading) => void;
}>({
  localOutcome: null,
  reportLocalOutcome: () => {},
  quickActions: null,
  publishQuickActions: () => {},
  workingTrip: null,
  switchTrip: () => {},
  view: null,
  resumeView: null,
  entry: emptyTripNavigation.entry,
  select: () => {},
  enterHeader: () => {},
  resume: () => {},
  saveReading: () => {},
});
export function TripViewProvider({ children }: { children: ReactNode }) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [state, setState] = useState(emptyTripNavigation);
  const [localOutcome, setLocalOutcome] = useState<{
    tripId: string;
    generation: number;
    id: string;
  } | null>(null);
  const reportLocalOutcome = useCallback(
    (tripId: string, captured: number, id: string) => {
      if (captured === getAccountGeneration())
        setLocalOutcome({ tripId, generation: captured, id });
    },
    [],
  );
  const [quickActions, setQuickActions] = useState<TripQuickActions | null>(null);
  const publishQuickActions = useCallback(
    (
      actions: TripQuickActions | null,
      owner: string,
      captured: number,
      token: symbol,
    ) => {
      if (captured !== getAccountGeneration()) return;
      setQuickActions(
        (previous) =>
          actions ??
          (previous?.tripId === owner && previous.owner === token ? null : previous),
      );
    },
    [],
  );
  const select = useCallback((view: TripView | null) => {
    if (view && view.generation !== getAccountGeneration()) return;
    setState((previous) =>
      enterTripDay(
        view
          ? {
              ...previous,
              workingTrip: { tripId: view.tripId, generation: view.generation },
            }
          : previous,
        view,
      ),
    );
  }, []);
  const current = state.view?.generation === generation ? state.view : null;
  const workingTrip =
    state.workingTrip?.generation === generation ? state.workingTrip : null;
  const saved = workingTrip
    ? state.bookmarks[workingTrip.tripId]?.view
    : state.lastTrip
      ? state.bookmarks[state.lastTrip]?.view
      : null;
  const resumeView = saved?.generation === generation ? saved : null;
  const switchTrip = useCallback((tripId: string, captured: number) => {
    if (captured !== getAccountGeneration() || !tripId) return;
    setState((previous) => switchWorkingTrip(previous, tripId, captured));
  }, []);
  // One generation-fenced transient navigation owner; never canonical/business persistence.
  return (
    <Context.Provider
      value={{
        localOutcome: localOutcome?.generation === generation ? localOutcome : null,
        reportLocalOutcome,
        quickActions: quickActions?.generation === generation ? quickActions : null,
        publishQuickActions,
        workingTrip,
        switchTrip,
        view: current,
        resumeView,
        entry: state.entry,
        select,
        enterHeader: (view, kind) => {
          if (view.generation !== getAccountGeneration()) return;
          setState((previous) => enterTripDay(previous, view, kind));
        },
        resume: () => {
          const target = resumeView ?? current;
          if (target) setState((previous) => enterTripDay(previous, target));
        },
        saveReading: (view, reading) => {
          if (view.generation !== getAccountGeneration()) return;
          setState((previous) =>
            saveTripReading(previous, view, reading, state.entry.revision),
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTripView = () => useContext(Context);
// Only explicit accepted endpoint zones/dates; this is not a Trip-today producer.
export function acceptedHomeHeader(
  events: readonly DayEvent[],
  query: (date: string, zone: string) => DayQuery,
  itemId?: string,
  viewZone?: string,
): { date: string; zone: string } | null {
  const candidates = events
    .filter(
      (event) =>
        (!itemId || event.id === itemId) &&
        !["cancelled", "skipped"].includes(event.status),
    )
    .flatMap((event) =>
      event.boundaries.flatMap((boundary) => {
        const zone = boundary.zone_id ?? viewZone;
        if (!zone || /^[+-]/.test(zone)) return [];
        try {
          const date = boundary.local_date
            ? validateCalendarDate(boundary.local_date)
            : boundary.instant
              ? localCalendarDate(boundary.instant, zone)
              : null;
          if (!date) return [];
          new Intl.DateTimeFormat("en", { timeZone: zone }).format(0);
          const result = query(date, zone);
          if (
            ![...result.timed, ...result.nonComparable].some(
              (row) => row.event.id === event.id,
            )
          )
            return [];
          return [{ date, zone }];
        } catch {
          return [];
        }
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.zone.localeCompare(b.zone));
  return candidates[0] ?? null;
}
