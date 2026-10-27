import { beforeEach, expect, it, vi } from "vitest";
import { useTripPreparationWidget } from "./useTripPreparationWidget";
import { router } from "expo-router";
const state = vi.hoisted(() => ({
  generation: 1,
  memo: false,
  callbackCursor: 0,
  callbacks: [] as { deps: readonly unknown[]; fn: unknown }[],
  cursor: 0,
  values: [] as unknown[],
  read: vi.fn(),
  resolveSource: vi.fn(),
  setup: vi.fn(),
  effects: [] as (() => () => void)[],
  completion: null as
    | ((event: { accountId: string; generation: number; journeyIds: string[] }) => void)
    | null,
  active: null as ((value: string) => void) | null,
}));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  subscribeLedgerOperationalSyncCompletion: (callback: typeof state.completion) => {
    state.completion = callback;
    return () => {
      state.completion = null;
    };
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (i === 0) state.callbackCursor = 0;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (next: unknown) => {
        state.values[i] = typeof next === "function" ? next(state.values[i]) : next;
      },
    ];
  },
  useRef: () => ({ current: 0 }),
  useCallback: (fn: unknown, deps: readonly unknown[]) => {
    if (!state.memo) return fn;
    const i = state.callbackCursor++;
    const previous = state.callbacks[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index])))
      state.callbacks[i] = { deps, fn };
    return state.callbacks[i].fn;
  },
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
  readTripPreparation: async () => ({
    read: state.read,
    resolveItemFromSource: state.resolveSource,
  }),
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
  state.memo = false;
  state.callbacks = [];
  state.read.mockReset();
  state.resolveSource.mockReset();
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
  const facts = {
    context: view.read.scope,
    currency: { state: "AVAILABLE", permission: "OWNER", lock: "NOT_OBSERVED" },
  };
  state.setup.mockResolvedValue(facts);
  state.cursor = 0;
  state.values = [view.read, "READY", facts];
  CurrencyHarness()();
  await vi.waitFor(() =>
    expect(router.push).toHaveBeenCalledExactlyOnceWith({
      pathname: "/trip-currency",
      params: { journeyId: "trip" },
    }),
  );
  vi.mocked(router.push).mockClear();
  let resolve!: (value: typeof facts) => void;
  state.setup.mockReturnValue(new Promise((done) => (resolve = done)));
  state.cursor = 0;
  state.values = [view.read, "READY", facts];
  CurrencyHarness()();
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  state.generation = 2;
  resolve(facts);
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

function RecentNavigationHarness(
  kind: "LOCAL_MANUAL" | "ACCEPTED" | "MIXED" = "LOCAL_MANUAL",
) {
  const scope = { tripId: "trip", accountId: "actor", generation: 1 };
  const token =
    kind === "LOCAL_MANUAL"
      ? { kind, scope, fingerprint: "rendered" }
      : kind === "MIXED"
        ? { kind, scope, fingerprint: "rendered", certificate: { epoch: "real-epoch" } }
        : { kind, scope, certificate: { epoch: "real-epoch" } };
  const read = {
    scope,
    epoch: kind === "LOCAL_MANUAL" ? null : "real-epoch",
    sourceToken: token,
    canPlan: true,
    preparation: { itemCount: 1, counts: [{ family: "P1", count: 1 }], recent: [] },
  };
  const local = vi.fn(),
    accepted = vi.fn();
  state.cursor = 0;
  state.values = [read, "READY"];
  const widget = useTripPreparationWidget({
    tripId: "trip",
    undated: false,
    onOpenItem: accepted,
    onOpenLocalItem: local,
  });
  const props = (
    widget!.content as import("react").ReactElement<{ onOpenItem?: (id: string) => void }>
  ).props;
  return { read, token, scope, local, accepted, props };
}
it("opens a pending Recent using the rendered fingerprint and existing local-detail callback, never a null epoch", async () => {
  const view = RecentNavigationHarness();
  state.resolveSource.mockResolvedValue({
    scope: view.scope,
    epoch: null,
    sourceToken: view.token,
    item: { itemId: "item", localState: "PENDING" },
  });
  view.props.onOpenItem!("item");
  await vi.waitFor(() =>
    expect(view.local).toHaveBeenCalledExactlyOnceWith("trip", "item", {
      scope: view.scope,
      source: { kind: "LOCAL_MANUAL_COMMITTED", fingerprint: "rendered" },
    }),
  );
  expect(state.resolveSource).toHaveBeenCalledExactlyOnceWith("trip", "item", view.token);
  expect(state.read).not.toHaveBeenCalled();
  expect(view.accepted).not.toHaveBeenCalled();
});
it("preserves the accepted detail callback with the actual epoch after source resolution", async () => {
  const view = RecentNavigationHarness("ACCEPTED");
  state.resolveSource.mockResolvedValue({
    epoch: "real-epoch",
    item: { localState: "ACCEPTED" },
  });
  view.props.onOpenItem!("item");
  await vi.waitFor(() =>
    expect(view.accepted).toHaveBeenCalledExactlyOnceWith("trip", "item", "real-epoch"),
  );
  expect(view.local).not.toHaveBeenCalled();
});
it("routes pending in a mixed read to local details rather than the accepted epoch path", async () => {
  const view = RecentNavigationHarness("MIXED");
  state.resolveSource.mockResolvedValue({
    epoch: "real-epoch",
    item: { localState: "PENDING" },
  });
  view.props.onOpenItem!("item");
  await vi.waitFor(() => expect(view.local).toHaveBeenCalledOnce());
  expect(view.accepted).not.toHaveBeenCalled();
});
it("does not navigate when source/permission/recent membership revalidation fails", async () => {
  const view = RecentNavigationHarness();
  state.resolveSource.mockResolvedValue(null);
  view.props.onOpenItem!("item");
  await vi.waitFor(() => expect(state.resolveSource).toHaveBeenCalledOnce());
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(view.local).not.toHaveBeenCalled();
  expect(view.accepted).not.toHaveBeenCalled();
});
it("drops a late source resolution after account generation changes", async () => {
  const view = RecentNavigationHarness();
  let done!: (value: unknown) => void;
  state.resolveSource.mockReturnValue(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  view.props.onOpenItem!("item");
  await vi.waitFor(() => expect(done).toBeTypeOf("function"));
  state.generation = 3;
  done({ epoch: null, item: { localState: "PENDING" } });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(view.local).not.toHaveBeenCalled();
  expect(view.accepted).not.toHaveBeenCalled();
});
it("drops a late source resolution after the widget leaves focus", async () => {
  const view = RecentNavigationHarness();
  state.read.mockReturnValue(new Promise(() => {}));
  const blur = state.effects.at(-1)!();
  let done!: (value: unknown) => void;
  state.resolveSource.mockReturnValue(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  view.props.onOpenItem!("item");
  await vi.waitFor(() => expect(done).toBeTypeOf("function"));
  blur();
  done({ epoch: null, item: { localState: "PENDING" } });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(view.local).not.toHaveBeenCalled();
  expect(view.accepted).not.toHaveBeenCalled();
});

it.each(["absent", "unavailable"])(
  "keeps Ledger setup independent when itinerary is %s",
  async (mode) => {
    const receive = vi.fn();
    const view = PreparationHarness(false, receive);
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
    };
    if (mode === "absent") state.read.mockResolvedValue(null);
    else state.read.mockRejectedValue(new Error("CORE_READER_UNAVAILABLE"));
    state.setup.mockResolvedValue(facts);
    state.effects[0]();
    await vi.waitFor(() => expect(receive).toHaveBeenCalledExactlyOnceWith(facts));
    expect(state.values[0]).toBeNull();
    state.cursor = 0;
    const widget = useTripPreparationWidget({ tripId: "trip", undated: true });
    const props = (widget!.content as import("react").ReactElement<any>).props;
    expect(props.setup).toEqual(facts);
    expect(props.onImport).toBeUndefined();
    expect(props.onBuildItinerary).toBeUndefined();
    props.onCurrency();
    await vi.waitFor(() =>
      expect(router.push).toHaveBeenCalledExactlyOnceWith({
        pathname: "/trip-currency",
        params: { journeyId: "trip" },
      }),
    );
  },
);

it.each(["READ_ONLY", "FINALIZED", "OTHER_ACCOUNT", "OTHER_TRIP"])(
  "does not open currency after Ledger qualification changes: %s",
  async (denial) => {
    const view = PreparationHarness(false);
    const facts = {
      context: view.read.scope,
      currency: { state: "AVAILABLE", permission: "OWNER", lock: "NOT_OBSERVED" },
    };
    state.cursor = 0;
    state.values = [null, "UNAVAILABLE", facts];
    const widget = useTripPreparationWidget({ tripId: "trip", undated: true });
    const changed = {
      ...facts,
      context: { ...facts.context },
      currency: { ...facts.currency },
    };
    if (denial === "READ_ONLY") changed.currency.permission = "READ_ONLY";
    if (denial === "FINALIZED") changed.currency.lock = "FINALIZED";
    if (denial === "OTHER_ACCOUNT") changed.context.accountId = "other";
    if (denial === "OTHER_TRIP") changed.context.tripId = "other";
    state.setup.mockResolvedValue(changed);
    (widget!.content as import("react").ReactElement<any>).props.onCurrency();
    await vi.waitFor(() => expect(state.setup).toHaveBeenCalled());
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(router.push).not.toHaveBeenCalled();
  },
);

it("refreshes retained pending Preparation on same scoped cache completion and releases its listener on blur", async () => {
  const harness = PreparationHarness(true);
  state.read.mockResolvedValue({
    ...harness.read,
    epoch: "accepted-epoch",
    preparation: { itemCount: 1, counts: [], recent: [] },
  });
  state.setup.mockResolvedValue(null);
  const blur = state.effects[0]();
  await vi.waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
  state.read.mockClear();
  for (const event of [
    { accountId: "other", generation: 1, journeyIds: ["trip"] },
    { accountId: "actor", generation: 2, journeyIds: ["trip"] },
    { accountId: "actor", generation: 1, journeyIds: ["other"] },
  ])
    state.completion!(event);
  await Promise.resolve();
  expect(state.read).not.toHaveBeenCalled();
  state.completion!({ accountId: "actor", generation: 1, journeyIds: ["trip"] });
  await vi.waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
  expect((state.values[0] as typeof harness.read).epoch).toBe("accepted-epoch");
  blur();
  expect(state.completion).toBeNull();
});
it("Pending→accepted completion makes the next Recent click use the fresh accepted Source token", async () => {
  const view = RecentNavigationHarness();
  state.read.mockResolvedValue(view.read);
  state.setup.mockResolvedValue(null);
  state.effects.at(-1)!();
  await vi.waitFor(() => expect(state.read).toHaveBeenCalledOnce());
  const token = {
    kind: "ACCEPTED",
    scope: view.scope,
    certificate: { epoch: "new-epoch" },
  };
  const accepted = { ...view.read, epoch: "new-epoch", sourceToken: token };
  state.read.mockResolvedValue(accepted);
  state.completion!({ accountId: "actor", generation: 1, journeyIds: ["trip"] });
  await vi.waitFor(() => expect(state.values[0]).toEqual(accepted));
  state.cursor = 0;
  const widget = useTripPreparationWidget({
    tripId: "trip",
    undated: false,
    onOpenItem: view.accepted,
    onOpenLocalItem: view.local,
  });
  state.resolveSource.mockResolvedValue({
    scope: view.scope,
    epoch: "new-epoch",
    sourceToken: token,
    item: { itemId: "item", localState: "ACCEPTED" },
  });
  (
    widget!.content as import("react").ReactElement<{ onOpenItem(id: string): void }>
  ).props.onOpenItem("item");
  await vi.waitFor(() =>
    expect(view.accepted).toHaveBeenCalledExactlyOnceWith("trip", "item", "new-epoch"),
  );
  expect(state.resolveSource).toHaveBeenLastCalledWith("trip", "item", token);
  expect(view.local).not.toHaveBeenCalled();
});

it.each(["P1", "P2", "P3", "P4", "P5", "P6"])(
  "saved %s name refreshes Recent in place while unchanged renders keep the same read effect",
  async (family) => {
    state.memo = true;
    state.values = [null, "LOADING", null];
    const scope = { tripId: "trip", accountId: "actor", generation: 1 };
    const value = (title: string) => ({
      scope,
      epoch: null,
      canPlan: true,
      preparation: {
        itemCount: 1,
        counts: [{ family, count: 1 }],
        recent: [{ itemId: "same-id", family, title }],
      },
    });
    const onSetup = vi.fn();
    const Render = (refreshKey: number) => {
      state.cursor = 0;
      const widget = useTripPreparationWidget({
        tripId: "trip",
        undated: true,
        refreshKey,
        onSetup,
      });
      return (widget!.content as import("react").ReactElement<any>).props;
    };
    state.values = [value("Original name"), "READY", null];
    state.read.mockResolvedValue(value("Original name"));
    Render(0);
    const firstEffect = state.effects.at(-1)!;
    const blur = firstEffect();
    await vi.waitFor(() => expect(onSetup).toHaveBeenCalledOnce());
    expect(Render(0).value.recent[0].title).toBe("Original name");
    expect(state.effects.at(-1)).toBe(firstEffect);
    expect(state.read).toHaveBeenCalledOnce();
    state.read.mockResolvedValue(value("Edited name"));
    Render(1);
    const editedEffect = state.effects.at(-1)!;
    expect(editedEffect).not.toBe(firstEffect);
    blur();
    editedEffect();
    await vi.waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(Render(1).value.recent[0].title).toBe("Edited name"));
    expect(state.values[1]).toBe("READY");
    expect(state.read).toHaveBeenCalledTimes(2);
  },
);
it("drops an edited Recent read completing after the actor generation changes", async () => {
  const view = PreparationHarness(true);
  let done!: (value: unknown) => void;
  state.read.mockReturnValue(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  state.effects[0]();
  await vi.waitFor(() => expect(done).toBeTypeOf("function"));
  state.generation = 2;
  done({
    ...view.read,
    preparation: { itemCount: 1, counts: [], recent: [{ title: "Other actor edit" }] },
  });
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.values[0]).toBe(view.read);
});
