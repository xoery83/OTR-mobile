import { it, expect, vi, beforeEach } from "vitest";
import { TripSearchEntry } from "./TripSearchEntry";
const state = vi.hoisted(() => ({
  generation: 1,
  view: null as any,
  resumeView: null as any,
  push: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
}));
vi.mock("expo-router", () => ({ router: { push: state.push } }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({ useTripView: () => state }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
beforeEach(() => {
  state.generation = 1;
  state.view = state.resumeView = null;
  state.push.mockReset();
});
it("opens the My Trips preset without silently binding a working Trip", () => {
  state.view = { tripId: "other", generation: 1 };
  TripSearchEntry({ entry: "MY_TRIPS" })!.props.onPress();
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/search",
    params: { entry: "MY_TRIPS" },
  });
  expect(state.view.tripId).toBe("other");
});
it("uses explicit Home inspection target without switching the working Trip", () => {
  state.view = { tripId: "working", generation: 1 };
  TripSearchEntry({ entry: "HOME", tripId: "inspected" })!.props.onPress();
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/search",
    params: { entry: "HOME", tripId: "inspected" },
  });
  expect(state.view.tripId).toBe("working");
});
it("Day uses only a current generation reading context and omits an unqualified entry", () => {
  expect(TripSearchEntry({ entry: "DAY" })).toBeNull();
  state.resumeView = {
    tripId: "saved",
    date: "2027-02-02",
    zone: "Asia/Tokyo",
    generation: 1,
    offset: 87,
  };
  TripSearchEntry({ entry: "DAY" })!.props.onPress();
  expect(state.push.mock.calls[0][0].params.tripId).toBe("saved");
  expect(state.resumeView.offset).toBe(87);
  state.generation = 2;
  expect(TripSearchEntry({ entry: "DAY" })).toBeNull();
});
it("an old entry callback cannot cross account generation", () => {
  const entry = TripSearchEntry({ entry: "HOME", tripId: "inspected" })!;
  state.generation++;
  entry.props.onPress();
  expect(state.push).not.toHaveBeenCalled();
});
