import { beforeEach, expect, it, vi } from "vitest";
import RootEntry from "../../app/(tabs)/index";
const state = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  saved: null as null | {
    tripId: string;
    date: string;
    zone: string;
    generation: number;
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => 5,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ view: state.saved, resumeView: state.saved }),
}));
vi.mock("expo-router", () => ({
  Redirect: "Redirect",
  useLocalSearchParams: () => state.params,
}));
vi.mock("@/features/day-feed/TripScreen", () => ({ TripScreen: "TripScreen" }));
vi.mock("@/components/Stage4BPhysicalSmokeScreen", () => ({
  Stage4BPhysicalSmokeScreen: "Smoke",
}));
beforeEach(() => {
  state.params = {};
  state.saved = null;
  vi.stubEnv("EXPO_PUBLIC_OTR_STAGE4B_PHYSICAL_SMOKE", "0");
});
it("normal entry selects My Trips without reading network/session or an old Day bookmark", () => {
  const result = RootEntry();
  expect(result.type).toBe("Redirect");
  expect(result.props.href).toEqual({
    pathname: "/trip",
    params: { view: "trips", tripId: "" },
  });
  state.params = { homeQaScenario: "Today" };
  expect(RootEntry().type).toBe("Redirect");
});
it("preserves explicit Trip Day through the native Trip stack", () => {
  state.params = {
    tripId: "a",
    date: "2026-10-16",
    zone: "Pacific/Auckland",
    view: "day",
  };
  const result = RootEntry();
  expect(result.type).toBe("Redirect");
  expect(result.props.href).toEqual({
    pathname: "/trip-home",
    params: { ...state.params, viewMode: "NAMED_ZONE" },
  });
});
it("does not invent a Trip for an incomplete Day link or reuse a stale Account bookmark", () => {
  state.params = { view: "day" };
  state.saved = {
    tripId: "stale",
    date: "2026-10-16",
    zone: "Pacific/Auckland",
    generation: 4,
  };
  expect(RootEntry().props.href).toEqual({
    pathname: "/trip",
    params: { view: "trips", tripId: "" },
  });
});
