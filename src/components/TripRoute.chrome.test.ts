import { Children, isValidElement, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import TripRoute from "../../app/(tabs)/trip";
const route = vi.hoisted(() => ({
  params: {} as { tripId?: string; view?: string },
  chrome: null as null | {
    tripId: string;
    generation: number;
    navigationVisible: boolean;
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: () => 5,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => 5,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ dayShellChrome: route.chrome }),
}));
beforeEach(() => {
  route.chrome = null;
});
vi.mock("expo-router", () => ({ useLocalSearchParams: () => route.params }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("@/features/day-feed/TripScreen", () => ({ TripScreen: "TripScreen" }));
vi.mock("@/components/GlobalMenu", () => ({ GlobalMenu: "Menu" }));
vi.mock("@/features/trip-search/TripSearchEntry", () => ({ TripSearchEntry: "Search" }));
vi.mock("@/components/navigationChrome", () => ({ NavigationContentFrame: "Frame" }));
function children() {
  return Children.toArray(TripRoute().props.children).filter(
    isValidElement,
  ) as ReactElement<any>[];
}
it("Day assigns its measured inset to the scrolling header and retains native controls", () => {
  route.params = { tripId: "actual", view: "day" };
  const [menu, search, frame] = children();
  expect(menu.props.nativeToolbar).toBe(true);
  expect(search.props.nativeToolbar).toBe(true);
  expect(frame.type).toBe("Frame");
  expect(frame.props.underlapHeader).toBe(true);
  expect(frame.props.children.props.contentFrameManaged).toBe(false);
});
it("My Trips and Create retain the default Frame's sole inset ownership", () => {
  for (const view of ["trips", "create"]) {
    route.params = { view };
    const frame = children()[2];
    expect(frame.props.underlapHeader).toBe(false);
    expect(frame.props.children.props.contentFrameManaged).toBe(true);
  }
});
it("Home still uses its existing immersive view and independent native edit action", () => {
  route.params = { tripId: "actual", view: "home" };
  const [, search, container] = children();
  expect(container.type).toBe("View");
  expect(container.props.children.props.contentFrameManaged).toBeUndefined();
  expect(search.props.showUnavailableTripEdit).toBe(true);
});

it("hides native Menu/Search only for the current Day scope and restores them on reversal", () => {
  route.params = { tripId: "actual", view: "day" };
  route.chrome = { tripId: "actual", generation: 5, navigationVisible: false };
  expect(children().map((n) => n.type)).toEqual(["Frame"]);
  route.chrome.navigationVisible = true;
  expect(children()).toHaveLength(3);
  route.chrome = { tripId: "other", generation: 5, navigationVisible: false };
  expect(children()).toHaveLength(3);
  route.chrome = { tripId: "actual", generation: 4, navigationVisible: false };
  expect(children()).toHaveLength(3);
  route.chrome.generation = 5;
  route.params.view = "home";
  expect(children()).toHaveLength(3);
});
