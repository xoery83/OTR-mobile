import { beforeEach, expect, it, vi } from "vitest";
import { useTripPreparationWidget } from "./useTripPreparationWidget";
import { router } from "expo-router";
const state = vi.hoisted(() => ({
  generation: 1,
  cursor: 0,
  values: [] as unknown[],
  read: vi.fn(),
  setup: vi.fn(),
  effects: [] as (() => () => void)[],
  active: null as ((value: string) => void) | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (next: unknown) => {
        state.values[i] = typeof next === "function" ? next(state.values[i]) : next;
      },
    ];
  },
  useRef: () => ({ current: 0 }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => () => void) => {
    state.effects.push(fn);
  },
  useSyncExternalStore: () => state.generation,
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, callback: (s: string) => void) => {
      state.active = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useFocusEffect: (fn: () => () => void) => {
    state.effects.push(fn);
  },
}));
vi.mock("@/data/repositories/tripPreparationSetupRepository", () => ({
  readTripPreparationSetupRepository: async () => ({ read: state.setup }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/data/repositories/tripPreparationRepository", () => ({
  readTripPreparation: async () => ({ read: state.read }),
}));
vi.mock("./TripPreparationWidget", () => ({ TripPreparationWidget: () => null }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
function PreparationHarness(canPlan: boolean, onSetup = vi.fn()) {
  const read = {
    scope: { tripId: "trip", accountId: "actor", generation: 1 },
    epoch: "epoch",
    canPlan,
    preparation: { itemCount: 0, counts: [], recent: [] },
  };
  state.cursor = 0;
  state.values = [read, "READY"];
  const onImport = vi.fn(),
    onBuild = vi.fn();
  const widget = useTripPreparationWidget({
    tripId: "trip",
    undated: true,
    onImport,
    onBuild,
    onSetup,
  });
  return {
    read,
    onImport,
    onBuild,
    props: (
      widget!.content as import("react").ReactElement<{
        onImport?: () => void;
        onBuildItinerary?: () => void;
      }>
    ).props,
  };
}
beforeEach(() => {
  state.generation = 1;
  state.read.mockReset();
  state.setup.mockReset();
  state.effects = [];
  state.active = null;
  vi.mocked(router.push).mockReset();
});

it("opens currency on the parent Stack with the same Trip, rejecting a late account change", async () => {
  const view = PreparationHarness(true);
  const CurrencyHarness = () => {
    return (
      useTripPreparationWidget({ tripId: "trip", undated: true })!
        .content as import("react").ReactElement<{ onCurrency(): void }>
    ).props.onCurrency;
  };
  state.read.mockResolvedValue(view.read);
  state.cursor = 0;
  state.values = [view.read, "READY", { context: view.read.scope }];
  CurrencyHarness()();
  await vi.waitFor(() =>
    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      pathname: "/trip-currency",
      params: { journeyId: "trip" },
    }),
  );
  vi.mocked(router.push).mockClear();
  let resolve!: (value: typeof view.read) => void;
  state.read.mockReturnValue(new Promise((done) => (resolve = done)));
  state.cursor = 0;
  state.values = [view.read, "READY", { context: view.read.scope }];
  CurrencyHarness()();
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  state.generation = 2;
  resolve(view.read);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(router.push).not.toHaveBeenCalled();
});

it("keeps real setup facts in the same request fence and drops late refresh or account results", async () => {
  const receive = vi.fn();
  const view = PreparationHarness(true, receive);
  state.read.mockResolvedValue(view.read);
  let resolveFirst!: (value: any) => void;
  const first = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const latest = {
    context: view.read.scope,
    currency: {
      state: "AVAILABLE",
      code: "JPY",
      scale: 0,
      permission: "OWNER",
      lock: "NOT_OBSERVED",
    },
    members: { state: "UNKNOWN" },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  };
  state.setup.mockReturnValueOnce(first).mockResolvedValueOnce(latest);
  state.effects[0]();
  await vi.waitFor(() => expect(state.setup).toHaveBeenCalledOnce());
  state.active!("active");
  await vi.waitFor(() => expect(receive).toHaveBeenCalledExactlyOnceWith(latest));
  resolveFirst({ ...latest, currency: { ...latest.currency, code: "NZD" } });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(receive).toHaveBeenCalledTimes(1);
  let resolveNext!: (value: any) => void;
  state.setup.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveNext = resolve;
    }),
  );
  state.active!("active");
  await vi.waitFor(() => expect(state.setup).toHaveBeenCalledTimes(3));
  state.generation = 2;
  resolveNext(latest);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(receive).toHaveBeenCalledTimes(1);
});

it("leaves itinerary and its actions available when setup facts cannot be read", async () => {
  const receive = vi.fn();
  const view = PreparationHarness(true, receive);
  state.read.mockResolvedValue(view.read);
  state.setup.mockRejectedValue(new Error("unavailable"));
  state.effects[0]();
  await vi.waitFor(() => expect(receive).toHaveBeenCalledExactlyOnceWith(null));
  expect(state.values[0]).toEqual(view.read);
  expect(state.values[1]).toBe("READY");
});
it("hides write actions from read-only participants and preserves them for authorized local planning", () => {
  expect(PreparationHarness(false).props.onImport).toBeUndefined();
  expect(PreparationHarness(false).props.onBuildItinerary).toBeUndefined();
  expect(PreparationHarness(true).props.onImport).toBeTypeOf("function");
  expect(PreparationHarness(true).props.onBuildItinerary).toBeTypeOf("function");
});
it("rechecks permissions before a visible action and rejects a changed account", async () => {
  const view = PreparationHarness(true);
  state.read.mockResolvedValue({ ...view.read, canPlan: false });
  view.props.onImport!();
  await vi.waitFor(() => expect(state.read).toHaveBeenCalled());
  expect(view.onImport).not.toHaveBeenCalled();
  state.generation = 2;
  view.props.onBuildItinerary!();
  await Promise.resolve();
  expect(view.onBuild).not.toHaveBeenCalled();
});

it("refreshes actual currency on route focus after returning from Ledger settings", async () => {
  const receive = vi.fn();
  const view = PreparationHarness(true, receive);
  state.read.mockResolvedValue(view.read);
  const facts = {
    context: view.read.scope,
    currency: {
      state: "AVAILABLE",
      code: "NZD",
      scale: 2,
      permission: "OWNER",
      lock: "NOT_OBSERVED",
    },
    members: { state: "UNKNOWN" },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  };
  state.setup.mockResolvedValueOnce(facts).mockResolvedValueOnce({
    ...facts,
    currency: { ...facts.currency, code: "JPY", scale: 0 },
  });
  const blur = state.effects[0]();
  await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
  blur();
  state.effects[0]();
  await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(2));
  expect(receive.mock.calls[1][0].currency.code).toBe("JPY");
});

it("retains the scoped ready projection while a local focus refresh is pending", async () => {
  const view = PreparationHarness(true);
  state.read.mockReturnValue(new Promise(() => {}));
  state.effects[0]();
  await vi.waitFor(() => expect(state.read).toHaveBeenCalledOnce());
  expect(state.values[0]).toBe(view.read);
  expect(state.values[1]).toBe("READY");
});
