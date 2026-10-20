import { Children, isValidElement, type ReactElement } from "react";
import { expect, it, vi } from "vitest";
import TripRoute from "../../app/(tabs)/trip";
const route = vi.hoisted(() => ({ params: {} as { tripId?: string; view?: string } }));
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
