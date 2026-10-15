import { Children, isValidElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import PastTripsRoute from "../../../app/past-trips";

const state = vi.hoisted(() => ({
  captured: 5,
  current: 5,
  switchTrip: vi.fn(),
  navigate: vi.fn(),
  back: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: () => state.captured,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.current,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("./TripViewContext", () => ({
  useTripView: () => ({ switchTrip: state.switchTrip }),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: "Screen" },
  router: { navigate: state.navigate, back: state.back },
}));
vi.mock("./LocalTripWorkspace", () => ({ LocalTripWorkspace: "Workspace" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
beforeEach(() => {
  state.current = state.captured = 5;
  vi.clearAllMocks();
});
const children = () =>
  Children.toArray(PastTripsRoute().props.children).filter(isValidElement) as {
    props: any;
  }[];
it("enables native Back and uses the existing virtualized Past workspace", () => {
  const [screen, workspace] = children();
  expect(screen.props.options).toMatchObject({
    headerShown: true,
    title: "myTrips.past",
    headerBackTitle: "dayFeed.myTrips",
  });
  expect(workspace.props).toMatchObject({ mode: "PAST", tripId: null });
  workspace.props.onBackToTrips();
  expect(state.back).toHaveBeenCalledOnce();
});
it("selects the opened Past Trip for shared Home/Ledger before navigating and clears stale Day params", () => {
  const [, workspace] = children();
  workspace.props.onOpen("past-B");
  expect(state.switchTrip).toHaveBeenCalledWith("past-B", 5);
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { tripId: "past-B", date: "", zone: "", view: "home" },
  });
  expect(state.switchTrip.mock.invocationCallOrder[0]).toBeLessThan(
    state.navigate.mock.invocationCallOrder[0],
  );
});
it("ignores a stale Past selection after account generation changes", () => {
  const [, workspace] = children();
  state.current = 6;
  workspace.props.onOpen("past-B");
  expect(state.switchTrip).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});
