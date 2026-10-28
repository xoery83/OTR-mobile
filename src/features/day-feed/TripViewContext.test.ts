import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect, type ReactNode } from "react";
import { createRequire } from "node:module";
import type { DayEvent } from "@/domain/trip/dayReadModel";
import { dayNavigationBookmarkRepository } from "@/data/repositories/dayNavigationBookmarkRepository";
import {
  acceptedHomeHeader,
  emptyTripNavigation,
  enterTripDay,
  saveTripReading,
  switchWorkingTrip,
  hydrateDayReadingHints,
  dayReadingHint,
  TripViewProvider,
  useTripView,
} from "./TripViewContext";

// Same SSR/effect harness used by WindowedDayList: real Provider code/timers,
// explicit commits/cleanups; this is not ReactDOM or Native lifecycle acceptance.
const lifecycle = vi.hoisted(() => ({
  generation: 1,
  disk: [] as any[],
  states: [] as any[],
  refs: [] as any[],
  stateCursor: 0,
  refCursor: 0,
  memoCursor: 0,
  effectCursor: 0,
  memos: [] as { deps: readonly unknown[]; value: any }[],
  effects: [] as { deps: readonly unknown[]; cleanup?: () => void }[],
  pending: [] as {
    index: number;
    deps: readonly unknown[];
    run: () => void | (() => void);
  }[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = lifecycle.stateCursor++;
    if (!(index in lifecycle.states)) lifecycle.states[index] = initial;
    return [
      lifecycle.states[index],
      (value: any) => {
        lifecycle.states[index] =
          typeof value === "function" ? value(lifecycle.states[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = lifecycle.refCursor++;
    return lifecycle.refs[index] ?? (lifecycle.refs[index] = { current: initial });
  },
  useCallback: (value: unknown, deps: readonly unknown[]) => {
    const index = lifecycle.memoCursor++,
      previous = lifecycle.memos[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
      lifecycle.memos[index] = { deps, value };
    return lifecycle.memos[index].value;
  },
  useEffect: (run: () => void | (() => void), deps: readonly unknown[]) => {
    const index = lifecycle.effectCursor++,
      previous = lifecycle.effects[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
      lifecycle.pending.push({ index, deps, run });
  },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => number) => snapshot(),
}));
vi.mock("@/data/repositories/dayNavigationBookmarkRepository", () => ({
  dayNavigationBookmarkRepository: {
    list: vi.fn(async () => [...lifecycle.disk]),
    record: vi.fn(async (hint) => {
      lifecycle.disk = [
        hint,
        ...lifecycle.disk.filter((row) => row.tripId !== hint.tripId),
      ];
      return [...lifecycle.disk];
    }),
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => lifecycle.generation,
  subscribeAccountGeneration: () => () => {},
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
let provider: ReturnType<typeof useTripView>;
function Probe() {
  const value = useTripView();
  useEffect(() => {
    provider = value;
  }, [value]);
  return null;
}
function resetProvider() {
  lifecycle.states = [];
  lifecycle.refs = [];
  lifecycle.memos = [];
  lifecycle.effects = [];
  lifecycle.pending = [];
}
function renderProvider() {
  lifecycle.stateCursor =
    lifecycle.refCursor =
    lifecycle.memoCursor =
    lifecycle.effectCursor =
      0;
  lifecycle.pending = [];
  renderToStaticMarkup(createElement(TripViewProvider, null, createElement(Probe)));
  // React runs old passive cleanups before the corresponding new setups.
  for (const effect of lifecycle.pending) lifecycle.effects[effect.index]?.cleanup?.();
  for (const effect of lifecycle.pending)
    lifecycle.effects[effect.index] = {
      deps: effect.deps,
      cleanup: effect.run() || undefined,
    };
}
function unmountProvider() {
  for (const effect of lifecycle.effects) effect.cleanup?.();
  resetProvider();
}
async function bootProvider() {
  resetProvider();
  renderProvider();
  await Promise.resolve();
  await Promise.resolve();
  renderProvider();
}
beforeEach(() => {
  vi.useFakeTimers();
  lifecycle.generation = 1;
  lifecycle.disk = [];
  resetProvider();
  vi.clearAllMocks();
});
afterEach(() => {
  unmountProvider();
  vi.useRealTimers();
});
const a = { tripId: "a", date: "2026-10-14", zone: "Pacific/Auckland", generation: 1 };
const b = { ...a, tripId: "b", date: "2026-10-15" };
describe("cold reading hints are preferences, never navigation authority", () => {
  const hint = {
    tripId: "a",
    date: "2027-02-12",
    zone: null,
    viewMode: "FLOATING" as const,
    anchor: { key: "day-2027-02-12", date: "2027-02-12", within: 0 },
  };
  it("hydrates without navigating and restores on the normal same-Trip open", () => {
    const state = hydrateDayReadingHints(emptyTripNavigation, [hint], 1);
    expect(state.view).toBeNull();
    expect(state.lastTrip).toBeNull();
    expect(state.workingTrip).toBeUndefined();
    expect(state.entry).toBe(emptyTripNavigation.entry);
    const restored = enterTripDay(state, state.bookmarks.a.view);
    expect(restored.entry.reading.anchor).toEqual(hint.anchor);
    expect(restored.entry.reading.offset).toBe(0);
    expect(restored.view?.zone).toBeNull();
  });
  it("late disk hints cannot replace a current session bookmark", () => {
    const state = saveTripReading(enterTripDay(emptyTripNavigation, a), a, {
      offset: 77,
      focus: "local",
    });
    expect(hydrateDayReadingHints(state, [hint], 1).bookmarks.a).toBe(state.bookmarks.a);
  });
  it("explicit Today remains authoritative and is not persisted over saved reading", () => {
    const state = hydrateDayReadingHints(emptyTripNavigation, [hint], 1);
    const today = enterTripDay(state, a, "EXPLICIT_TODAY_HEADER");
    expect(today.view?.date).toBe(a.date);
    expect(today.entry.reading).toEqual({ offset: 0, focus: null });
    expect(dayReadingHint(today)).toBeNull();
  });
  it("stale account generation cannot hydrate the current account", () => {
    expect(hydrateDayReadingHints(emptyTripNavigation, [hint], 2)).toBe(
      emptyTripNavigation,
    );
  });
  it("persists actual confirmed anchor without focus, generation or absolute offset", () => {
    let state = enterTripDay(emptyTripNavigation, a);
    expect(dayReadingHint(state)).toBeNull();
    state = saveTripReading(state, a, {
      offset: 999,
      focus: "detail",
      layout: "WHOLE_TRIP",
      anchoredDate: hint.date,
      anchor: hint.anchor,
    });
    expect(dayReadingHint(state)).toEqual({ ...hint, zone: a.zone, viewMode: undefined });
  });
});
describe("single transient Day reading owner", () => {
  it("resumes each Trip's reading after Home and another Trip", () => {
    let state = enterTripDay(emptyTripNavigation, a);
    state = saveTripReading(state, a, { offset: 375, focus: "a-item" });
    state = enterTripDay(state, null);
    state = enterTripDay(state, b);
    state = saveTripReading(state, b, { offset: 82, focus: null });
    state = enterTripDay(state, a);
    expect(state.entry.reading).toEqual({ offset: 375, focus: "a-item" });
    expect(state.bookmarks.b.reading.offset).toBe(82);
  });
  it.each(["EXPLICIT_TODAY_HEADER", "FIRST_VALID_PAST_DAY_HEADER"] as const)(
    "%s clears visible focus/scroll without replacing Day bookmark",
    (kind) => {
      let state = enterTripDay(emptyTripNavigation, a);
      state = saveTripReading(state, a, { offset: 640, focus: "saved-item" });
      const saved = state.bookmarks;
      state = enterTripDay(state, { ...a, date: "2026-10-01" }, kind);
      expect(state.entry.reading).toEqual({ offset: 0, focus: null });
      state = saveTripReading(state, state.view!, { offset: 90, focus: "header-item" });
      expect(state.bookmarks).toBe(saved);
      expect(enterTripDay(state, saved.a.view).entry.reading).toEqual({
        offset: 640,
        focus: "saved-item",
      });
    },
  );
  it("does not restore another account generation or previous date/zone", () => {
    let state = enterTripDay(emptyTripNavigation, a);
    state = saveTripReading(state, a, { offset: 99, focus: "old" });
    expect(enterTripDay(state, { ...a, generation: 2 }).entry.reading).toEqual({
      offset: 0,
      focus: null,
    });
    expect(
      enterTripDay(state, { ...a, zone: "Europe/Paris" }).entry.reading.focus,
    ).toBeNull();
    expect(
      saveTripReading(state, { ...a, generation: 2 }, { offset: 1, focus: null }),
    ).toBe(state);
  });
  it("stale same-day callbacks cannot replace the resumed reading", () => {
    const old = enterTripDay(emptyTripNavigation, a);
    const current = enterTripDay(old, a);
    expect(
      saveTripReading(current, a, { offset: 999, focus: "stale" }, old.entry.revision),
    ).toBe(current);
  });
  it("same-date explicit entries have a fresh entry identity", () => {
    const state = enterTripDay(emptyTripNavigation, a);
    expect(enterTripDay(state, a, "EXPLICIT_TODAY_HEADER").entry.revision).toBe(
      state.entry.revision + 1,
    );
  });
});

describe("accepted Home header context", () => {
  const event = {
    id: "visible",
    status: "planned",
    boundaries: [
      { local_date: "2026-01-15", zone_id: "Pacific/Auckland", instant: null },
    ],
  } as unknown as DayEvent;
  const query = (date: string, zone: string) => ({
    date,
    zone,
    timed: [{ event, roles: [], occupancy: false, occupancyBasis: null, anchor: null }],
    nonComparable: [],
    unresolved: [],
  });
  it("uses an explicitly named accepted endpoint and authorized query, not the device date", () => {
    expect(acceptedHomeHeader([event], query)).toEqual({
      date: "2026-01-15",
      zone: "Pacific/Auckland",
    });
    expect(acceptedHomeHeader([event], query, "other")).toBeNull();
    expect(
      acceptedHomeHeader([event], (date, zone) => ({ ...query(date, zone), timed: [] })),
    ).toBeNull();
  });
  it("never guesses unknown civil dates/zones or routes skipped items", () => {
    for (const boundary of [
      { local_date: null, zone_id: "Pacific/Auckland", instant: null },
      { local_date: "2026-01-15", zone_id: null },
      { local_date: "2026-01-15", zone_id: "+01:00" },
      { local_date: "2026-02-30", zone_id: "Pacific/Auckland" },
    ])
      expect(
        acceptedHomeHeader(
          [{ ...event, boundaries: [boundary] } as unknown as DayEvent],
          query,
        ),
      ).toBeNull();
    expect(acceptedHomeHeader([{ ...event, status: "skipped" }], query)).toBeNull();
  });
});

it("explicit working Trip switch restores only that Trip bookmark and never crosses account generations", () => {
  let state = enterTripDay(emptyTripNavigation, a);
  state = saveTripReading(state, a, { offset: 91, focus: "a-item" });
  state = switchWorkingTrip(state, "b", 1);
  expect(state.view).toBeNull();
  expect(state.workingTrip?.tripId).toBe("b");
  state = switchWorkingTrip(state, "a", 1);
  expect(state.entry.reading).toEqual({ offset: 91, focus: "a-item" });
  state = switchWorkingTrip(state, "a", 2);
  expect(state.view).toBeNull();
  expect(state.entry.reading).toEqual({ offset: 0, focus: null });
});

it("temporary explicit target inspection preserves the prior working Trip and Day bookmark", () => {
  let state = enterTripDay(emptyTripNavigation, a);
  state = saveTripReading(state, a, { offset: 144, focus: "a-item" });
  state = switchWorkingTrip(state, "a", 1);
  const before = state.bookmarks;
  state = enterTripDay(state, b, "EXPLICIT_TODAY_HEADER");
  expect(state.workingTrip?.tripId).toBe("a");
  expect(state.bookmarks).toBe(before);
  expect(state.bookmarks.a.reading).toEqual({ offset: 144, focus: "a-item" });
});
it("uses an explicit saved view zone only for a null boundary zone and only with current query membership", () => {
  const event = {
    id: "booking",
    status: "planned",
    boundaries: [{ local_date: "2027-02-07", zone_id: null }],
  } as unknown as DayEvent;
  const query = (date: string, zone: string) => ({
    date,
    zone,
    timed: [],
    nonComparable: [
      { event, roles: [], occupancy: false, occupancyBasis: null, anchor: null },
    ],
    unresolved: [],
  });
  expect(acceptedHomeHeader([event], query, "booking", "Asia/Tokyo")).toEqual({
    date: "2027-02-07",
    zone: "Asia/Tokyo",
  });
  for (const zone of [undefined, "", "+09:00", "Not/AZone"])
    expect(acceptedHomeHeader([event], query, "booking", zone)).toBeNull();
  expect(
    acceptedHomeHeader(
      [event],
      (date, zone) => ({ ...query(date, zone), nonComparable: [] }),
      "booking",
      "Asia/Tokyo",
    ),
  ).toBeNull();
  expect(
    acceptedHomeHeader(
      [{ ...event, status: "cancelled" }],
      query,
      "booking",
      "Asia/Tokyo",
    ),
  ).toBeNull();
  expect(
    acceptedHomeHeader(
      [{ ...event, boundaries: [{ ...event.boundaries[0], zone_id: "+09:00" }] }],
      query,
      "booking",
      "Asia/Tokyo",
    ),
  ).toBeNull();
});

it("whole-Trip reading retains absolute offset and the observed civil anchor in the existing per-Trip bookmark", () => {
  const state = enterTripDay(emptyTripNavigation, a);
  const saved = saveTripReading(state, a, {
    offset: 720,
    focus: "occurrence",
    layout: "WHOLE_TRIP",
    anchoredDate: "2026-10-16",
  });
  expect(saved.bookmarks.a.view.date).toBe("2026-10-16");
  expect(saved.bookmarks.a.reading).toEqual({
    offset: 720,
    focus: "occurrence",
    layout: "WHOLE_TRIP",
    anchoredDate: "2026-10-16",
  });
  expect(saved.view?.date).toBe(a.date);
  const invalid = saveTripReading(state, a, {
    offset: 720,
    focus: null,
    layout: "WHOLE_TRIP",
    anchoredDate: "bad",
  });
  expect(invalid.bookmarks.a.view.date).toBe(a.date);
});

it("confirming the same working Trip cannot reset a newly opened Today header", () => {
  let state = switchWorkingTrip(emptyTripNavigation, "a", 1);
  state = enterTripDay(state, a, "EXPLICIT_TODAY_HEADER");
  expect(switchWorkingTrip(state, "a", 1)).toBe(state);
  expect(state.entry.kind).toBe("EXPLICIT_TODAY_HEADER");
  expect(switchWorkingTrip(state, "a", 2).view).toBeNull();
});

it("keeps a finite stable row anchor in its matching civil Day bookmark, without changing time facts", () => {
  const state = enterTripDay(emptyTripNavigation, a);
  const anchor = { key: "item:a:START", date: "2026-10-16", within: 37 };
  const saved = saveTripReading(state, a, {
    offset: 450,
    focus: null,
    layout: "WHOLE_TRIP",
    anchoredDate: anchor.date,
    anchor,
  });
  expect(saved.bookmarks.a.view.zone).toBe(a.zone);
  expect(saved.bookmarks.a.reading.anchor).toEqual(anchor);
  expect(
    saveTripReading(state, a, {
      offset: 450,
      focus: null,
      layout: "WHOLE_TRIP",
      anchoredDate: anchor.date,
      anchor: { ...anchor, date: "2026-10-17" },
    }).bookmarks.a.reading.anchor,
  ).toBeUndefined();
});

describe("accepted reading persistence across Provider lifecycle", () => {
  const lastDate = "2027-02-12";
  const anchor = { key: `day:${lastDate}`, date: lastDate, within: 0 };
  const reading = {
    offset: 0,
    focus: null,
    layout: "WHOLE_TRIP" as const,
    anchoredDate: lastDate,
    anchor,
  };
  async function saveBeforeDebounce() {
    await bootProvider();
    provider.select(a);
    renderProvider();
    provider.saveReading(a, reading);
    renderProvider();
    await vi.advanceTimersByTimeAsync(100);
    expect(dayNavigationBookmarkRepository.record).not.toHaveBeenCalled();
  }
  it.each(["switch", "null", "unmount"])(
    "flushes the accepted last date on %s and restores a cold hint",
    async (leave) => {
      await saveBeforeDebounce();
      if (leave === "switch") {
        provider.switchTrip(b.tripId, 1);
        renderProvider();
      }
      if (leave === "null") {
        provider.select(null);
        renderProvider();
      }
      if (leave === "unmount") unmountProvider();
      await Promise.resolve();
      expect(dayNavigationBookmarkRepository.record).toHaveBeenCalledTimes(1);
      expect(lifecycle.disk[0]).toMatchObject({
        tripId: a.tripId,
        date: lastDate,
        anchor,
      });
      if (leave !== "unmount") unmountProvider();
      await bootProvider();
      expect(provider.view).toBeNull();
      expect(provider.workingTrip).toBeNull();
      provider.switchTrip(a.tripId, 1);
      renderProvider();
      expect(provider.resumeView?.date).toBe(lastDate);
      provider.select(provider.resumeView);
      renderProvider();
      expect(provider.entry.reading.anchor).toEqual(anchor);
    },
  );
  it("coalesces same-Trip frames, then writes the newest accepted hint once", async () => {
    await saveBeforeDebounce();
    provider.saveReading(a, { ...reading, anchor: { ...anchor, within: 22 } });
    renderProvider();
    await vi.advanceTimersByTimeAsync(100);
    expect(dayNavigationBookmarkRepository.record).not.toHaveBeenCalled();
    provider.select(null);
    renderProvider();
    await vi.advanceTimersByTimeAsync(1000);
    expect(dayNavigationBookmarkRepository.record).toHaveBeenCalledTimes(1);
    expect(lifecycle.disk[0].anchor.within).toBe(22);
  });
  it.each(["generation-render", "generation-unmount"])(
    "discards stale accepted hints on %s",
    async (change) => {
      await saveBeforeDebounce();
      lifecycle.generation = 2;
      if (change === "generation-render") renderProvider();
      else unmountProvider();
      await vi.advanceTimersByTimeAsync(1000);
      expect(dayNavigationBookmarkRepository.record).not.toHaveBeenCalled();
      expect(lifecycle.disk).toEqual([]);
    },
  );
  it("does not repeat a completed timer write during later normal exit", async () => {
    await saveBeforeDebounce();
    await vi.advanceTimersByTimeAsync(350);
    expect(dayNavigationBookmarkRepository.record).toHaveBeenCalledTimes(1);
    provider.select(null);
    renderProvider();
    unmountProvider();
    expect(dayNavigationBookmarkRepository.record).toHaveBeenCalledTimes(1);
  });
});

it("preserves confirmed Floating anchor through Home/resume and rejects old revisions and modes", () => {
  const floating = { ...a, zone: null, viewMode: "FLOATING" as const };
  let state = enterTripDay(emptyTripNavigation, floating);
  const oldRevision = state.entry.revision;
  state = saveTripReading(state, floating, {
    offset: 22,
    focus: null,
    layout: "WHOLE_TRIP",
    anchoredDate: "2026-10-20",
    anchor: { key: "day:2026-10-20", date: "2026-10-20", within: 8 },
  });
  const saved = state.bookmarks.a;
  const resumed = enterTripDay(state, saved.view);
  expect(resumed.view).toMatchObject({
    date: "2026-10-20",
    zone: null,
    viewMode: "FLOATING",
  });
  expect(resumed.entry.reading.anchor).toEqual(saved.reading.anchor);
  expect(
    saveTripReading(resumed, floating, { offset: 0, focus: null }, oldRevision),
  ).toBe(resumed);
  expect(
    saveTripReading(
      resumed,
      { ...saved.view, zone: "UTC", viewMode: undefined },
      { offset: 0, focus: null },
    ),
  ).toBe(resumed);
  expect(dayReadingHint(resumed)).toMatchObject({
    date: "2026-10-20",
    zone: null,
    viewMode: "FLOATING",
  });
});
