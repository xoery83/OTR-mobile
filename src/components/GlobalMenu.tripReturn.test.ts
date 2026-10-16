import { beforeEach, expect, it, vi } from "vitest";
import { GlobalMenu } from "./GlobalMenu";
import type { GlobalMenuModule } from "./globalMenuModel";
const state = vi.hoisted(() => ({
  generation: 1,
  params: { tripId: "a", view: "home" },
  path: "/trip",
  actions: null as any,
  ref: { current: null as any },
  memo: [] as { deps: readonly unknown[]; value: unknown }[],
  cursor: 0,
  cleanup: null as null | (() => void),
  navigate: vi.fn(),
  alerts: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: () => {},
  useLayoutEffect: (effect: () => (() => void) | void) => {
    state.cleanup?.();
    state.cleanup = effect() ?? null;
  },
  useRef: () => state.ref,
  useSyncExternalStore: (_: unknown, get: () => unknown) => get(),
  useMemo: (make: () => unknown, deps: readonly unknown[]) => {
    const index = state.cursor++;
    const prior = state.memo[index];
    if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i])))
      state.memo[index] = { deps, value: make() };
    return state.memo[index].value;
  },
}));
vi.mock("expo-router", () => ({
  useGlobalSearchParams: () => state.params,
  usePathname: () => state.path,
  router: { navigate: state.navigate },
}));
vi.mock("react-native", () => ({ Alert: { alert: state.alerts } }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/native/uiLocalePreference", () => ({ chooseUiLocale: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ clear: vi.fn() }) }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/auth/authRepository", () => ({ readLocalSession: vi.fn() }));
vi.mock("@/data/auth/defaultAccountSwitchCoordinator", () => ({
  createDefaultAccountSwitchCoordinator: () => ({ logout: vi.fn() }),
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: vi.fn(),
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ quickActions: state.actions }),
}));
vi.mock("./AppNavigationMenu", () => ({ AppNavigationMenu: "Menu" }));
const render = (module: GlobalMenuModule = "TRIP") => {
  state.cursor = 0;
  return GlobalMenu({ module });
};
const back = () =>
  (render().props.sections as any[][])
    .flat()
    .find((item) => item.label === "navigation.allTrips");
beforeEach(() => {
  state.generation = 1;
  state.params = { tripId: "a", view: "home" };
  state.path = "/trip";
  state.actions = null;
  state.memo = [];
  state.cleanup = null;
  state.ref.current = null;
  state.navigate.mockReset();
  state.alerts.mockReset();
});
it("uses the existing Workspace return/dirty guard instead of bypassing it", () => {
  state.actions = { tripId: "a", generation: 1, backToTrips: vi.fn() };
  back().onPress();
  expect(state.actions.backToTrips).toHaveBeenCalledOnce();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("All Trips is hidden on My Trips and available from other modules without borrowing a previous Trip", () => {
  state.params.view = "trips";
  state.actions = { tripId: "a", generation: 1, backToTrips: vi.fn() };
  expect(back()).toBeUndefined();
  for (const module of ["LEDGER", "TODAY", "CAPTURE", "UPDATES"] as const) {
    state.path =
      module === "LEDGER"
        ? "/expenses"
        : module === "TODAY"
          ? "/"
          : module === "CAPTURE"
            ? "/capture"
            : "/updates";
    const item = (render(module).props.sections as any[][])
      .flat()
      .find((entry) => entry.label === "navigation.allTrips");
    item.onPress();
  }
  expect(state.actions.backToTrips).not.toHaveBeenCalled();
  expect(state.navigate).toHaveBeenCalledTimes(4);
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { view: "trips", tripId: "", date: "", zone: "" },
  });
});
it("Create return explicitly stays or discards, and a stale confirmation cannot leave a newer context", () => {
  state.params.view = "create";
  back().onPress();
  const buttons = state.alerts.mock.calls[0][2];
  expect(buttons.map((button: any) => button.text)).toEqual([
    "actionIsland.stay",
    "actionIsland.discard",
  ]);
  buttons[0].onPress?.();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.params.view).toBe("create");
  state.params = { tripId: "b", view: "home" };
  render();
  buttons[1].onPress();
  expect(state.navigate).not.toHaveBeenCalled();
  state.params.view = "create";
  back().onPress();
  state.alerts.mock.calls[1][2][1].onPress();
  expect(state.navigate).toHaveBeenCalledOnce();
});
it("old return callbacks cannot bypass newly committed dirty handlers or an account change", () => {
  state.actions = { tripId: "a", generation: 1, backToTrips: vi.fn() };
  const old = back();
  const previous = state.actions;
  state.actions = { tripId: "a", generation: 1, backToTrips: vi.fn() };
  render();
  old.onPress();
  expect(previous.backToTrips).not.toHaveBeenCalled();
  const current = back();
  state.generation = 2;
  current.onPress();
  expect(state.actions.backToTrips).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("unmounted Menu cannot navigate from a delayed return callback in the same account", () => {
  const retained = back();
  state.cleanup?.();
  retained.onPress();
  expect(state.navigate).not.toHaveBeenCalled();
});

it("Native Home All Trips preserves the current owner guard across a hot cross-Trip sequence", () => {
  for (const tripId of ["auckland", "nelson", "japan", "auckland"]) {
    state.path = "/trip-home";
    state.params = { tripId, view: "home" };
    const backToTrips = vi.fn();
    state.actions = { tripId, generation: 1, backToTrips };
    back().onPress();
    expect(backToTrips).toHaveBeenCalledOnce();
    expect(state.navigate).not.toHaveBeenCalled();
  }
});
