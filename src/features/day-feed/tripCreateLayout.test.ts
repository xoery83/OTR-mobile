import { beforeEach, expect, it, vi } from "vitest";
import TripCreateLayout from "../../../app/trip-create/_layout";

const qa = vi.hoisted(() => ({
  generation: 7,
  activeRoute: "create",
  push: vi.fn(),
  switchTrip: vi.fn(),
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("expo-router", () => ({
  router: { push: qa.push },
  useNavigationContainerRef: () => ({ getCurrentRoute: () => ({ key: qa.activeRoute }) }),
}));
vi.mock("@/components/SheetRouteLayout", () => ({ SheetRouteLayout: "sheet-layout" }));
vi.mock("@/features/day-feed/hostedTripCreate", () => ({
  TripCreateSheetContext: { Provider: "create-provider" },
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ switchTrip: qa.switchTrip }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => qa.generation,
}));

beforeEach(() => {
  qa.generation = 7;
  qa.activeRoute = "create";
  qa.push.mockClear();
  qa.switchTrip.mockClear();
});

it("opens the created trip once after dismissal returns to the original My Trips", () => {
  const { value, children } = TripCreateLayout().props;
  value.recordCreatedTrip("new-trip", { originRouteKey: "my-trips", generation: 7 });
  expect(qa.push).not.toHaveBeenCalled();
  qa.activeRoute = "my-trips";
  children.props.onDismiss();
  children.props.onDismiss();
  expect(qa.switchTrip).toHaveBeenCalledExactlyOnceWith("new-trip", 7);
  expect(qa.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/trip-home",
    params: { tripId: "new-trip", view: "home" },
  });
});

it.each([
  { activeRoute: "different-list", generation: 7 },
  { activeRoute: "my-trips", generation: 8 },
])("retires the recorded result after returning to a different route or account: %o", (after) => {
  const { value, children } = TripCreateLayout().props;
  value.recordCreatedTrip("new-trip", { originRouteKey: "my-trips", generation: 7 });
  Object.assign(qa, after);
  children.props.onDismiss();
  qa.activeRoute = "my-trips";
  qa.generation = 7;
  children.props.onDismiss();
  expect(qa.switchTrip).not.toHaveBeenCalled();
  expect(qa.push).not.toHaveBeenCalled();
});
