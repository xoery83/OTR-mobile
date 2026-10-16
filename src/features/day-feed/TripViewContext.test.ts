import { describe, expect, it, vi } from "vitest";
import type { DayEvent } from "@/domain/trip/dayReadModel";
import {
  acceptedHomeHeader,
  emptyTripNavigation,
  enterTripDay,
  saveTripReading,
  switchWorkingTrip,
} from "./TripViewContext";

vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => 1,
  subscribeAccountGeneration: () => () => {},
}));
const a = { tripId: "a", date: "2026-10-14", zone: "Pacific/Auckland", generation: 1 };
const b = { ...a, tripId: "b", date: "2026-10-15" };
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
