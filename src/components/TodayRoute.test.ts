import { beforeEach, expect, it, vi } from "vitest";
import TodayRoute from "../../app/(tabs)/index";

const state = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  generation: 3,
  view: null as null | {
    tripId: string;
    date: string;
    zone: string | null;
    viewMode?: "FLOATING" | "NAMED_ZONE";
    generation: number;
  },
  resumeView: null as null | {
    tripId: string;
    date: string;
    zone: string | null;
    viewMode?: "FLOATING" | "NAMED_ZONE";
    generation: number;
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
}));
vi.mock("expo-router", () => ({
  Redirect: "Redirect",
  useLocalSearchParams: () => state.params,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({ useTripView: () => state }));
vi.mock("@/components/Stage4BPhysicalSmokeScreen", () => ({
  Stage4BPhysicalSmokeScreen: "PhysicalSmoke",
}));
beforeEach(() => {
  vi.unstubAllEnvs();
  state.params = {};
  state.generation = 3;
  state.view = state.resumeView = null;
});
const href = () => TodayRoute().props.href;
const myTrips = { pathname: "/trip", params: { view: "trips", tripId: "" } };
const saved = {
  tripId: "saved",
  date: "2026-10-31",
  zone: "Pacific/Auckland",
  generation: 3,
};

it("keeps non-Day root entry on My Trips, even with a saved Day", () => {
  state.view = saved;
  for (const params of [{}, { tripId: "saved" }, { view: "home" }, { view: "trips" }]) {
    state.params = params;
    expect(href()).toEqual(myTrips);
  }
});
it("retains the physical smoke override", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_STAGE4B_PHYSICAL_SMOKE", "1");
  state.params = { view: "day" };
  expect(TodayRoute().type).toBe("PhysicalSmoke");
});
it("replaces the old Day Tab with the native Trip host and exact current context", () => {
  state.params = { view: "day" };
  state.view = saved;
  expect(href()).toEqual({
    pathname: "/trip-home",
    params: {
      tripId: "saved",
      view: "day",
      date: saved.date,
      zone: saved.zone,
      viewMode: "NAMED_ZONE",
    },
  });
});
it("preserves floating cold bookmark intent without inventing a named zone", () => {
  state.params = { view: "day" };
  state.resumeView = { ...saved, zone: null, viewMode: "FLOATING" };
  expect(href()).toMatchObject({
    pathname: "/trip-home",
    params: { tripId: "saved", date: saved.date, zone: "", viewMode: "FLOATING" },
  });
});
it("explicit deep-link Trip/date/zone wins over a different saved Trip", () => {
  state.view = saved;
  state.params = {
    tripId: "explicit",
    date: "2027-01-02",
    zone: "Asia/Tokyo",
    homeQaScenario: "existing-only",
  };
  expect(href()).toEqual({
    pathname: "/trip-home",
    params: { ...state.params, view: "day", viewMode: "NAMED_ZONE" },
  });
});
it("preserves explicit floating context over a previous named context", () => {
  state.view = saved;
  state.params = {
    view: "day",
    tripId: "saved",
    date: "2027-02-03",
    zone: "",
    viewMode: "FLOATING",
  };
  expect(href()).toEqual({ pathname: "/trip-home", params: state.params });
});
it("an explicit named zone does not inherit the saved floating mode", () => {
  state.view = { ...saved, zone: null, viewMode: "FLOATING" };
  state.params = { view: "day", tripId: "saved", zone: "Asia/Tokyo" };
  expect(href()).toMatchObject({
    params: { zone: "Asia/Tokyo", viewMode: "NAMED_ZONE" },
  });
});
it("only a matching generation-scoped bookmark can supply omitted context", () => {
  state.params = { view: "day", tripId: "resumed" };
  state.view = saved;
  state.resumeView = { ...saved, tripId: "resumed", zone: null, viewMode: "FLOATING" };
  const before = structuredClone(state.resumeView);
  expect(href()).toMatchObject({
    params: { tripId: "resumed", date: saved.date, zone: "", viewMode: "FLOATING" },
  });
  expect(state.resumeView).toEqual(before);
});
it("does not import a different Trip's date or zone when explicit identity alone is given", () => {
  state.view = saved;
  state.params = { view: "day", tripId: "different" };
  expect(href()).toMatchObject({ params: { tripId: "different", date: "", zone: "" } });
});
it("does not infer an identity when no current or saved target exists", () => {
  state.params = { view: "day" };
  expect(href()).toEqual(myTrips);
});
it("old-generation bookmarks do not route into the prior account", () => {
  state.params = { view: "day" };
  state.view = state.resumeView = { ...saved, generation: 2 };
  expect(href()).toEqual(myTrips);
  state.resumeView = { ...saved, tripId: "new-account" };
  expect(href()).toMatchObject({ params: { tripId: "new-account" } });
});
it.each(["tripId", "date", "zone", "viewMode"])(
  "malformed repeated %s never substitutes a saved identity",
  (key) => {
    state.view = saved;
    state.params = { view: "day", [key]: ["untrusted", "other"] };
    expect(href()).toEqual(myTrips);
  },
);
it("leaves invalid explicit date/zone to the existing owning reader, never substitutes saved facts", () => {
  state.view = saved;
  state.params = { view: "day", tripId: "saved", date: "invalid", zone: "invalid" };
  expect(href()).toMatchObject({ params: { date: "invalid", zone: "invalid" } });
});
