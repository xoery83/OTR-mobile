import { beforeEach, expect, it, vi } from "vitest";
import { readLocalAuthSnapshot } from "@/data/auth/authRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { GlobalMenu } from "./GlobalMenu";
import type { GlobalMenuModule } from "./globalMenuModel";
const state = vi.hoisted(() => ({
  effects: [] as { run: () => (() => void) | void; deps: readonly unknown[] }[],
  generation: 1,
  params: { tripId: "a", view: "home" },
  path: "/trip",
  actions: null as any,
  ref: { current: null as any },
  requestRef: { current: 0 },
  refCursor: 0,
  setters: [] as any[],
  stateCursor: 0,
  memo: [] as { deps: readonly unknown[]; value: unknown }[],
  cursor: 0,
  cleanup: null as null | (() => void),
  navigate: vi.fn(),
  alerts: vi.fn(),
  readMembers: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (value: unknown) => {
    const i = state.stateCursor++;
    return [value, (state.setters[i] ??= vi.fn())];
  },
  useEffect: (run: () => (() => void) | void, deps: readonly unknown[]) => {
    state.effects.push({ run, deps });
  },
  useLayoutEffect: (effect: () => (() => void) | void) => {
    state.cleanup?.();
    state.cleanup = effect() ?? null;
  },
  useRef: () => (state.refCursor++ === 0 ? state.requestRef : state.ref),
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
vi.mock("@/data/auth/authRepository", () => ({ readLocalAuthSnapshot: vi.fn() }));
vi.mock("@/data/auth/defaultAccountSwitchCoordinator", () => ({
  createDefaultAccountSwitchCoordinator: () => ({ logout: vi.fn() }),
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: vi.fn(),
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ quickActions: state.actions }),
}));
vi.mock("@/features/day-feed/TripMembersSheet", () => ({
  TripMembersSheet: "MembersSheet",
}));
vi.mock("@/data/repositories/tripPreparationSetupRepository", () => ({
  readTripPreparationSetupRepository: async () => ({ read: state.readMembers }),
}));
vi.mock("./AppNavigationMenu", () => ({ AppNavigationMenu: "Menu" }));
const render = (module: GlobalMenuModule = "TRIP") => {
  state.cursor = 0;
  state.refCursor = 0;
  state.stateCursor = 0;
  return GlobalMenu({ module }).props.children[0];
};
const back = () =>
  (render().props.sections as any[][])
    .flat()
    .find((item) => item.label === "navigation.allTrips");
beforeEach(() => {
  state.effects = [];
  vi.mocked(readLocalAuthSnapshot)
    .mockReset()
    .mockResolvedValue({ session: null, principal: { kind: "SIGNED_OUT" } });
  vi.mocked(getDefaultLedgerReportingRepository).mockClear();
  state.generation = 1;
  state.params = { tripId: "a", view: "home" };
  state.path = "/trip";
  state.actions = null;
  state.memo = [];
  state.cleanup = null;
  state.ref.current = null;
  state.requestRef.current = 0;
  state.setters = [];
  state.navigate.mockReset();
  state.alerts.mockReset();
  state.readMembers.mockReset();
  state.readMembers.mockResolvedValue({
    context: { tripId: "a", generation: 1 },
    members: { state: "AVAILABLE", people: [] },
  });
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

it("Home and Day share the same scoped utility menu with disabled future Documents and Photos", () => {
  const editTrip = vi.fn(),
    chooseDay = vi.fn(),
    members = vi.fn();
  state.actions = { tripId: "a", generation: 1, editTrip, chooseDay, members };
  for (const view of ["home", "day"]) {
    state.params.view = view;
    if (view === "day") state.actions = null; // Home focus cleanup unregisters its actions.
    const items = (render().props.sections as any[][]).flat();
    expect(
      items.some((item) => ["tripHome.edit", "dayFeed.openDay"].includes(item.label)),
    ).toBe(false);
    expect(
      items
        .filter((item) => item.label.startsWith("tripHome."))
        .map((item) => item.label),
    ).toEqual(["tripHome.members", "tripHome.documents", "tripHome.photos"]);
    for (const label of ["tripHome.documents", "tripHome.photos"]) {
      const item = items.find((entry) => entry.label === label);
      expect(item.disabled).toBe(true);
      item.onPress();
    }
  }
  expect(editTrip).not.toHaveBeenCalled();
  expect(chooseDay).not.toHaveBeenCalled();
});

it("reads Members through the owning reader after Home actions unmount, with stale account callbacks fenced", async () => {
  state.params.view = "day";
  state.actions = null;
  const items = (render().props.sections as any[][]).flat();
  const entry = items.find((item) => item.label === "tripHome.members");
  entry.onPress();
  await vi.waitFor(() => expect(state.readMembers).toHaveBeenCalledWith("a"));
  state.readMembers.mockClear();
  state.generation = 2;
  entry.onPress();
  await Promise.resolve();
  expect(state.readMembers).not.toHaveBeenCalled();
});

it("drops delayed member reads after route changes and closes stale sheets on A to B to A", async () => {
  let resolve!: (value: any) => void;
  state.readMembers.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const entry = (render().props.sections as any[][])
    .flat()
    .find((item) => item.label === "tripHome.members");
  entry.onPress();
  await vi.waitFor(() => expect(state.readMembers).toHaveBeenCalledOnce());
  state.params = { tripId: "b", view: "day" };
  render();
  state.params = { tripId: "a", view: "day" };
  render();
  await Promise.resolve();
  for (const setter of state.setters) setter.mockClear();
  resolve({
    context: { tripId: "a", generation: 1 },
    members: { state: "AVAILABLE", people: [] },
  });
  await Promise.resolve();
  await Promise.resolve();
  for (const setter of state.setters) expect(setter).not.toHaveBeenCalled();
});

it("closing or unmounting invalidates an in-flight member read", async () => {
  for (const interrupt of ["close", "unmount"] as const) {
    let resolve!: (value: any) => void;
    state.readMembers.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    state.cursor = state.refCursor = state.stateCursor = 0;
    const tree = GlobalMenu({ module: "TRIP" });
    const children = tree.props.children;
    children[0].props.sections
      .flat()
      .find((item: any) => item.label === "tripHome.members")
      .onPress();
    await Promise.resolve();
    await Promise.resolve();
    if (interrupt === "close") children[1].props.onClose();
    else state.cleanup?.();
    for (const setter of state.setters) setter.mockClear();
    resolve({
      context: { tripId: "a", generation: 1 },
      members: { state: "AVAILABLE", people: [] },
    });
    await Promise.resolve();
    await Promise.resolve();
    for (const setter of state.setters) expect(setter).not.toHaveBeenCalled();
  }
});

it("reloads gated menu identity by generation without opening Ledger on My Trips", async () => {
  const identity = { userId: "b", displayName: "Account B", email: "b@example.invalid" };
  vi.mocked(readLocalAuthSnapshot).mockResolvedValue({
    session: { identity },
    principal: { kind: "SIGNED_OUT" },
  } as never);
  render();
  const effect = state.effects.at(-1)!;
  expect(effect.deps).toEqual([undefined, 1]);
  effect.run();
  await Promise.resolve();
  await Promise.resolve();
  expect(state.setters[2]).toHaveBeenCalledWith({ generation: 1, identity });
  expect(getDefaultLedgerReportingRepository).not.toHaveBeenCalled();
});
it("ignores a late identity snapshot from a superseded account generation", async () => {
  let finish!: (value: any) => void;
  vi.mocked(readLocalAuthSnapshot).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render();
  state.effects.at(-1)!.run();
  state.generation = 2;
  finish({ session: { identity: { userId: "a" } } });
  await Promise.resolve();
  await Promise.resolve();
  expect(state.setters[2]).not.toHaveBeenCalled();
});
