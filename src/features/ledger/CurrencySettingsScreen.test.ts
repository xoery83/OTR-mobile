import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CurrencySettingsScreen } from "./CurrencySettingsScreen";
const state = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  mount: true,
  cleanups: [] as (() => void)[],
  reporting: vi.fn(),
  trips: vi.fn(),
  tripRead: vi.fn(),
  sync: null as null | ((event: any) => void),
  settlement: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  classify: vi.fn(),
  principal: vi.fn(),
  guestRead: vi.fn(),
  guestSave: vi.fn(),
  refs: [] as any[],
  refCursor: 0,
  online: true,
  hosted: false,
  generation: 1,
  accountId: "account-a",
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: 20, right: 24 }) }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (v: any) => {
        state.values[i] = v;
      },
    ];
  },
  useRef: (v: any) => {
    const i = state.refCursor++;
    return state.refs[i] ?? (state.refs[i] = { current: v });
  },
  useLayoutEffect: (fn: any) => {
    if (state.mount) {
      const cleanup = fn();
      if (typeof cleanup === "function") state.cleanups.push(cleanup);
    }
  },
  useEffect: (fn: any) => {
    if (state.mount) {
      const cleanup = fn();
      if (typeof cleanup === "function") state.cleanups.push(cleanup);
    }
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  Modal: "Modal",
  Pressable: "Pressable",
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("expo-network", () => ({
  useNetworkState: () => ({
    isConnected: state.online,
    isInternetReachable: state.online,
  }),
}));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({}), useThemedStyles: () => ({}) }));
vi.mock("@/ui/locale", () => ({ t: (s: string) => s }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/domainLabels", () => ({ systemMessage: (s: string) => s }));
vi.mock("@/ui/controls", () => ({ UiButton: "UiButton" }));
vi.mock("@/data/operations/ledgerActivity", () => ({
  subscribeLedgerOperationalSyncCompletion: (listener: (event: any) => void) => {
    state.sync = listener;
    return () => {
      if (state.sync === listener) state.sync = null;
    };
  },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("./CurrencyPicker", () => ({ CurrencyPicker: "CurrencyPicker" }));
vi.mock("./ledgerCurrencySheet", () => ({ get hostedLedgerCurrencySheetEnabled() { return state.hosted; } }));
vi.mock("./ExchangeRateLookup", () => ({ ExchangeRateLookup: "ExchangeRateLookup" }));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({
    listTrips: state.trips,
    getTrip: state.tripRead,
  }),
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: () => state.reporting(),
}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({
  getDefaultLedgerSettlementRepository: () => state.settlement(),
}));
vi.mock("@/data/repositories/ledgerCurrencyRepository", () => ({
  classifyJourneyCurrencyPreviewFailure: (...a: any[]) => state.classify(...a),
  ledgerCurrencyRepository: {
    preview: (...a: any[]) => state.preview(...a),
    commit: (...a: any[]) => state.commit(...a),
  },
}));
vi.mock("@/data/auth/authRepository", () => ({
  readCommittedLocalPrincipal: () => state.principal(),
  requireActiveUserId: async () => state.accountId,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/guestTripCurrencyRepository", () => ({
  readGuestTripCurrencyRepository: async () => ({
    read: state.guestRead,
    save: state.guestSave,
  }),
}));
type Node = ReactElement<any>;
const nodes = (n: ReactNode): Node[] =>
  isValidElement(n)
    ? [n as Node, ...Children.toArray((n as Node).props.children).flatMap(nodes)]
    : [];
const b = {
  journeyId: "b",
  title: "Other Trip",
  settlementCurrency: "NZD",
  startDate: "2020-01-01",
  endDate: "2030-12-31",
  settlementScale: 2,
};
const actor = vi.fn().mockResolvedValue({ role: "owner" });
const render = (id?: string, hostLookupPickers = false) => {
  state.cursor = 0;
  state.refCursor = 0;
  const v = nodes(CurrencySettingsScreen({ journeyId: id, hostLookupPickers }));
  state.mount = false;
  return v;
};
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
beforeEach(() => {
  state.hosted = false;
  state.cleanups = [];
  state.refs = [];
  state.refCursor = 0;
  state.online = true;
  state.generation = 1;
  state.accountId = "account-a";
  state.principal
    .mockReset()
    .mockResolvedValue({ kind: "ACCOUNT", accountId: "account-a" });
  state.guestRead.mockReset();
  state.guestSave.mockReset();
  state.trips.mockReset().mockResolvedValue([]);
  state.tripRead.mockReset().mockResolvedValue(null);
  state.sync = null;
  state.values = [];
  state.cursor = 0;
  state.mount = true;
  actor.mockClear();
  state.preview.mockReset();
  state.commit.mockReset();
  state.classify.mockReset();
  state.reporting.mockResolvedValue({
    getSelectedJourneyId: async () => "b",
    listJourneys: async () => [b],
    getActorContext: actor,
  });
  state.settlement.mockResolvedValue({ hasFinalized: async () => false });
});
it("never falls back to another Trip or previews/commits its currency when explicit A is missing", async () => {
  render("a");
  await flush();
  const v = render("a");
  expect(actor).not.toHaveBeenCalled();
  expect(v.some((n) => n.props.children === "currencySettings.copy12")).toBe(true);
  await v.find((n) => n.type === "CurrencyPicker")!.props.onSelect("USD");
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
  expect(v.some((n) => n.props.children === "Other Trip")).toBe(false);
});
it("keeps explicit same-Trip lookup and existing owner authority", async () => {
  render("b");
  await flush();
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
  expect(render("b").some((n) => n.props.children === "Other Trip")).toBe(true);
});
it("retains the historical selected Journey fallback only when no explicit ID is supplied", async () => {
  render();
  await flush();
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
});

it("withholds a previously loaded B immediately when an explicit A is supplied", async () => {
  render("b");
  await flush();
  expect(render("b").some((n) => n.props.children === "Other Trip")).toBe(true);
  const v = render("a");
  expect(v.some((n) => n.props.children === "Other Trip")).toBe(false);
  await v.find((n) => n.type === "CurrencyPicker")!.props.onSelect("USD");
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
});

const failures = [
  ["CONFIG_UNAVAILABLE", "previewConfigUnavailable"],
  ["CONNECTIVITY", "copy1"],
  ["AUTH", "previewAuth"],
  ["FORBIDDEN", "previewForbidden"],
  ["CONFLICT", "previewConflict"],
  ["SERVICE", "previewService"],
  ["INVALID_RESPONSE", "previewInvalid"],
  ["UNKNOWN", "previewUnknown"],
];
it.each(failures)(
  "shows safe %s preview failure without committing or changing currency",
  async (kind, key) => {
    const error = new Error("private error details");
    state.preview.mockRejectedValue(error);
    state.classify.mockReturnValue({ kind });
    render("b");
    await flush();
    await render("b")
      .find((n) => n.type === "CurrencyPicker")!
      .props.onSelect("EUR");
    await flush();
    const v = render("b");
    expect(state.tripRead).toHaveBeenCalledWith("b");
    expect(state.preview).toHaveBeenCalledExactlyOnceWith("b", "EUR", {
      accountId: "account-a",
      generation: 1,
    });
    expect(state.classify).toHaveBeenCalledExactlyOnceWith(error);
    expect(v.some((n) => n.props.children === `currencySettings.${key}`)).toBe(true);
    expect(v.some((n) => n.props.children === "private error details")).toBe(false);
    expect(state.commit).not.toHaveBeenCalled();
    expect(state.values[2].settlementCurrency).toBe("NZD");
  },
);

it("uses the same local Trip's current name without changing Ledger identity/currency", async () => {
  state.trips.mockResolvedValue([
    { id: "a", name: "Wrong account Trip" },
    { id: "b", name: "Renamed Trip" },
  ]);
  render("b");
  await flush();
  const v = render("b");
  expect(v.some((n) => n.props.children === "Renamed Trip")).toBe(true);
  expect(v.some((n) => n.props.children === "Wrong account Trip")).toBe(false);
  expect(state.values[2]).toMatchObject({ journeyId: "b", settlementCurrency: "NZD" });
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
});
it("retains Ledger caption when the lawful local Trip reader is unavailable", async () => {
  state.trips.mockRejectedValue(new Error("TRIP_LOCAL_UNAVAILABLE"));
  render("b");
  await flush();
  expect(render("b").some((n) => n.props.children === "Other Trip")).toBe(true);
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
});

it("ignores an old Trip name read completing after another Journey has loaded", async () => {
  let finishOld!: (trips: { id: string; name: string }[]) => void;
  const oldRead = new Promise<{ id: string; name: string }[]>((resolve) => {
    finishOld = resolve;
  });
  state.reporting.mockResolvedValue({
    getSelectedJourneyId: async () => "b",
    listJourneys: async () => [{ ...b, journeyId: "a", title: "Old A" }, b],
    getActorContext: actor,
  });
  state.trips
    .mockReturnValueOnce(oldRead)
    .mockResolvedValueOnce([{ id: "b", name: "Current B" }]);
  render("a");
  await flush();
  expect(state.trips).toHaveBeenCalledTimes(1);
  state.cleanups[0]();
  state.mount = true;
  render("b");
  await flush();
  expect(state.values[2]).toMatchObject({ journeyId: "b", title: "Current B" });
  finishOld([{ id: "a", name: "Late A" }]);
  await flush();
  expect(state.values[2]).toMatchObject({ journeyId: "b", title: "Current B" });
  expect(render("b").some((n) => n.props.children === "Current B")).toBe(true);
});

it("changes a Guest local currency offline without Account reporting, preview, commit or FX lookup", async () => {
  state.online = false;
  state.principal.mockResolvedValue({ kind: "GUEST", localId: "guest-a" });
  const value = {
    context: { accountId: "guest-a", tripId: "b", generation: 1 },
    title: "Guest trip",
    code: "NZD",
    scale: 2,
    updatedAt: "old",
    historyLocked: 0,
  };
  state.guestRead.mockResolvedValue(value);
  state.guestSave.mockResolvedValue({
    ...value,
    code: "JPY",
    scale: 0,
    updatedAt: "new",
  });
  state.reporting.mockClear();
  state.settlement.mockClear();
  render("b");
  await flush();
  let v = render("b");
  expect(v.some((node) => node.props.children === "Guest trip")).toBe(true);
  expect(v.some((node) => node.type === "ExchangeRateLookup")).toBe(false);
  await v.find((node) => node.type === "CurrencyPicker")!.props.onSelect("JPY");
  await flush();
  v = render("b");
  expect(v.some((node) => node.props.children === "JPY")).toBe(true);
  expect(state.guestSave).toHaveBeenCalledExactlyOnceWith(value, "JPY");
  expect(state.reporting).not.toHaveBeenCalled();
  expect(state.settlement).not.toHaveBeenCalled();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
});

it("keeps the Guest currency when a local save fails and never falls back to Cloud", async () => {
  state.principal.mockResolvedValue({ kind: "GUEST", localId: "guest-a" });
  state.guestRead.mockResolvedValue({
    context: { accountId: "guest-a", tripId: "b", generation: 1 },
    title: "Guest trip",
    code: "NZD",
    scale: 2,
    updatedAt: "old",
    historyLocked: 0,
  });
  state.guestSave.mockRejectedValue(Error("GUEST_CURRENCY_CONFLICT"));
  render("b");
  await flush();
  await render("b")
    .find((node) => node.type === "CurrencyPicker")!
    .props.onSelect("JPY");
  await flush();
  const v = render("b");
  expect(v.some((node) => node.props.children === "NZD")).toBe(true);
  expect(
    v.some((node) => node.props.children === "ui.couldNotSave · common.tryAgain"),
  ).toBe(true);
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
});

const currencyPreview = {
  currentCurrency: "NZD",
  proposedCurrency: "AUD",
  settingsRevision: 4,
  previewDigest: "a".repeat(64),
  finalizedSettlementCount: 0,
  openSettlementCount: 0,
  conflictCount: 0,
};
const switchAccount = () => {
  state.accountId = "account-b";
  state.generation++;
  state.principal.mockResolvedValue({ kind: "ACCOUNT", accountId: state.accountId });
};
const restartPage = () => {
  state.cleanups.forEach((cleanup) => cleanup());
  state.cleanups = [];
  state.mount = true;
  render("b");
};
async function prepareConfirmation() {
  const { Alert } = await import("react-native");
  vi.mocked(Alert.alert).mockClear();
  state.preview.mockResolvedValue(currencyPreview);
  render("b");
  await flush();
  await render("b")
    .find((n) => n.type === "CurrencyPicker")!
    .props.onSelect("AUD");
  await flush();
  const button = render("b").find(
    (n) =>
      n.type === "Pressable" &&
      nodes(n.props.children).some(
        (child) => child.props.children === "currencySettings.copy28",
      ),
  )!;
  button.props.onPress();
  return vi
    .mocked(Alert.alert)
    .mock.calls.at(-1)![2]!
    .find((button) => button.text === "currencySettings.copy5")!.onPress!;
}
it("hides old Account metadata immediately and rejects retained taps even after a new Account loads", async () => {
  render("b");
  await flush();
  const oldSelect = render("b").find((n) => n.type === "CurrencyPicker")!.props.onSelect;
  switchAccount();
  const hidden = render("b");
  expect(hidden.some((n) => n.props.children === "Other Trip")).toBe(false);
  expect(hidden.some((n) => n.type === "CurrencyPicker")).toBe(false);
  restartPage();
  await flush();
  await oldSelect("AUD");
  expect(state.preview).not.toHaveBeenCalled();
});
it("does not publish an old Account's delayed Journey list", async () => {
  let finish!: (value: (typeof b)[]) => void;
  state.reporting.mockResolvedValueOnce({
    getSelectedJourneyId: async () => "b",
    listJourneys: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    getActorContext: actor,
  });
  render("b");
  await flush();
  switchAccount();
  restartPage();
  await flush();
  finish([{ ...b, title: "Private old account title" }]);
  await flush();
  expect(render("b").some((n) => n.props.children === "Private old account title")).toBe(
    false,
  );
  expect(state.values[2].title).toBe("Other Trip");
});
it.each(["switch", "unmount"])("discards a pending preview after %s", async (reason) => {
  let finish!: (value: typeof currencyPreview) => void;
  state.preview.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render("b");
  await flush();
  const request = render("b")
    .find((n) => n.type === "CurrencyPicker")!
    .props.onSelect("AUD");
  await flush();
  if (reason === "switch") switchAccount();
  else state.cleanups.forEach((cleanup) => cleanup());
  finish(currencyPreview);
  await request;
  await flush();
  expect(state.values[7]).toBeNull();
  expect(state.values[8]).toBeNull();
  expect(state.commit).not.toHaveBeenCalled();
});
it.each(["switch", "unmount"])(
  "never dispatches a delayed confirmation after %s",
  async (reason) => {
    const confirm = await prepareConfirmation();
    if (reason === "switch") switchAccount();
    else state.cleanups.forEach((cleanup) => cleanup());
    confirm();
    await flush();
    expect(state.commit).not.toHaveBeenCalled();
  },
);
it("keeps a new Account's state intact when an old commit/readback completes", async () => {
  let finish!: () => void;
  state.commit.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const confirm = await prepareConfirmation();
  confirm();
  await flush();
  expect(state.commit).toHaveBeenCalledWith("b", currencyPreview, expect.any(String), {
    accountId: "account-a",
    generation: 1,
  });
  switchAccount();
  restartPage();
  await flush();
  finish();
  await flush();
  expect(state.values[2]).toMatchObject({ journeyId: "b", settlementCurrency: "NZD" });
  expect(state.values[1]).toBeNull();
});

it("never dispatches a retained confirmation or picker tap for another provided Journey", async () => {
  const confirm = await prepareConfirmation();
  const oldSelect = render("b").find((n) => n.type === "CurrencyPicker")!.props.onSelect;
  state.reporting.mockResolvedValue({
    getSelectedJourneyId: async () => "b",
    listJourneys: async () => [{ ...b, journeyId: "a", title: "Current A" }, b],
    getActorContext: actor,
  });
  state.cleanups.forEach((cleanup) => cleanup());
  state.mount = true;
  render("a");
  await flush();
  state.preview.mockClear();
  await oldSelect("USD");
  confirm();
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
  expect(state.values[2]).toMatchObject({
    journeyId: "a",
    title: "Current A",
    settlementCurrency: "NZD",
  });
});

it("retains a selected currency until the same Trip accepts, then explicitly previews without auto-commit", async () => {
  const local = {
    id: "b",
    name: "Local Trip",
    serverId: null,
    syncStatus: "PENDING_CREATE",
  };
  state.trips.mockResolvedValue([local]);
  state.tripRead.mockResolvedValue(local);
  state.preview.mockResolvedValue({ ...currencyPreview, proposedCurrency: "USD" });
  render("b");
  await flush();
  await render("b")
    .find((n) => n.type === "CurrencyPicker")!
    .props.onSelect("USD");
  await flush();
  expect(state.values[2].settlementCurrency).toBe("NZD");
  expect(state.values[13]).toBe("USD");
  expect(render("b").some((n) => n.props.children === "tripCreate.pendingTrip")).toBe(
    true,
  );
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.classify).not.toHaveBeenCalled();
  const reads = state.tripRead.mock.calls.length;
  for (const event of [
    { accountId: "other", generation: 1, journeyIds: ["b"] },
    { accountId: "account-a", generation: 2, journeyIds: ["b"] },
    { accountId: "account-a", generation: 1, journeyIds: ["other"] },
  ])
    state.sync!(event);
  await flush();
  expect(state.tripRead).toHaveBeenCalledTimes(reads);
  state.tripRead.mockResolvedValue({
    ...local,
    serverId: "b",
    syncStatus: "PENDING_UPDATE",
  });
  state.sync!({ accountId: "account-a", generation: 1, journeyIds: ["b"] });
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  const continueButton = render("b").find(
    (n) => n.type === "UiButton" && n.props.label === "currencySettings.copy14",
  )!;
  continueButton.props.onPress();
  await flush();
  expect(state.preview).toHaveBeenCalledExactlyOnceWith("b", "USD", {
    accountId: "account-a",
    generation: 1,
  });
  expect(state.values[13]).toBeNull();
  expect(state.commit).not.toHaveBeenCalled();
});
it("keeps the local Trip and currency intent available when readiness cannot be read", async () => {
  state.tripRead.mockRejectedValue(Error("LOCAL_READ_UNAVAILABLE"));
  render("b");
  await flush();
  await render("b")
    .find((n) => n.type === "CurrencyPicker")!
    .props.onSelect("USD");
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.values[2]).toMatchObject({ journeyId: "b", settlementCurrency: "NZD" });
  expect(state.values[13]).toBe("USD");
  expect(
    render("b").some((n) => n.props.children === "currencySettings.loadFailed"),
  ).toBe(true);
  expect(state.classify).not.toHaveBeenCalled();
});
it("drops a waiting selection and its sync callback when the Account changes", async () => {
  state.tripRead.mockResolvedValue({ id: "b", serverId: null });
  render("b");
  await flush();
  await render("b")
    .find((n) => n.type === "CurrencyPicker")!
    .props.onSelect("USD");
  await flush();
  const oldSync = state.sync!;
  switchAccount();
  restartPage();
  await flush();
  expect(state.values[13]).toBeNull();
  state.tripRead.mockClear();
  oldSync({ accountId: "account-a", generation: 1, journeyIds: ["b"] });
  await flush();
  expect(state.tripRead).not.toHaveBeenCalled();
  expect(state.preview).not.toHaveBeenCalled();
});

it("keeps a hosted lookup inside the landscape safe area without changing its fallback", async () => {
  render("b", true);
  await flush();
  const scroll = () => render("b", true).find(node => node.type === "ScrollView");
  expect(scroll()?.props.contentContainerStyle[1]).toBeUndefined();
  state.hosted = true;
  expect(scroll()?.props.contentContainerStyle[1]).toEqual({ paddingLeft: 36, paddingRight: 40 });
});
