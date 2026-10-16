import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import type { TripHomeWidget } from "@/features/trip/TripHomeWidgetHost";
import type { Trip } from "@/domain/trip/types";
import type { TripRepository } from "@/data/repositories/tripRepository";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { LocalTripWorkspace } from "./LocalTripWorkspace";
vi.mock("./useTripPreparationWidget", () => ({ useTripPreparationWidget: () => null }));

vi.mock("@/features/trip/TripHomeFrame", () => ({
  TripHomeFrame: (p: any) => {
    state.nodes.push({ frameWidgets: p.widgets ?? [] });
    if (p.onBack) state.nodes.push({ label: "dayFeed.myTrips", onPress: p.onBack });
    return createElement(
      "div",
      { "data-trip-home-frame": p.title },
      p.title,
      ...p.metadata,
      p.notice,
      p.modules,
    );
  },
}));
vi.mock("@/features/ledger/TripHomeFinanceWidget", () => ({
  useTripHomeFinanceWidget: () => state.finance,
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
// Same scoped hook/SSR technique as render.test.ts. A changed React key unmounts
// the old content before mounting fresh hooks; keep the old cleanup/closures live
// so deferred repository completion exercises the real component save callback.
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  effects: [] as (() => void | (() => void))[],
  cleanups: [] as (() => void)[],
  nodes: [] as Record<string, any>[],
  mount: false,
  repo: vi.fn(),
  discovery: vi.fn(),
  serial: 0,
  alert: vi.fn(),
  publish: vi.fn(),
  forceEffects: false,
  finance: null as TripHomeWidget | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void | (() => void)) => {
    if (state.mount || state.forceEffects) state.effects.push(callback);
  },
  useLayoutEffect: (callback: () => void | (() => void)) => {
    if (state.mount) {
      const cleanup = callback();
      if (cleanup) state.cleanups.push(cleanup);
    }
  },
  useState: (initial: unknown) => {
    const i = state.cursor++,
      hooks = state.hooks;
    if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      hooks[i],
      (next: unknown) => {
        hooks[i] = typeof next === "function" ? next(hooks[i]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: (...args: any[]) => state.alert(...args) },
  Modal: (p: any) => (p.visible ? createElement("div", null, p.children) : null),
  ScrollView: (p: any) => createElement("div", null, p.children),
  View: (p: any) => createElement("div", null, p.children),
  Text: (p: any) => createElement("span", null, p.children),
  StyleSheet: { create: (styles: unknown) => styles },
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
  UiSection: (p: any) => createElement("section", null, p.title, p.children),
}));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return createElement("input", { value: p.value, readOnly: true });
  },
  UiFormRow: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiDatePicker: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiChoiceChip: () => null,
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/domain/localId", () => ({ createUuid: () => `test-uuid-${++state.serial}` }));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: () => state.repo(),
}));
vi.mock("@/data/repositories/tripDiscoveryRepository", () => ({
  readLocalTripDiscoveryRepository: () => state.discovery(),
}));
vi.mock("@/data/repositories/tripDayFeedRepository", () => ({
  readTripDayFeed: vi.fn(),
}));
vi.mock("./MyTripsList", () => ({
  MyTripsList: (p: any) =>
    createElement(
      "div",
      null,
      p.trips.map((trip: Trip) => {
        const node = { label: trip.name, onPress: () => p.onOpen(trip.id) };
        state.nodes.push(node);
        return createElement("button", { key: trip.id }, trip.name);
      }),
      p.remoteTrips.map((trip: { id: string; name: string }) => {
        const node = { label: trip.name, onPress: () => p.onOpen(trip.id) };
        state.nodes.push(node);
        return createElement("button", { key: trip.id }, trip.name);
      }),
    ),
}));
vi.mock("./LocalTripPhotos", () => ({
  LocalTripPhotos: (p: { tripId: string }) =>
    createElement("div", { "data-trip-photos": p.tripId }),
}));
vi.mock("./TripCoverPicker", () => ({
  TripCoverPicker: (p: any) => {
    state.nodes.push({ coverPicker: p });
    return null;
  },
}));
vi.mock("./TripCoverVisual", () => ({ TripCoverVisual: () => null }));
vi.mock("./tripCovers", () => ({ tripCoverSource: () => 1 }));

const trip = (id: string, name: string): Trip => ({
  id,
  name,
  destination: null,
  startDate: null,
  endDate: null,
  baseCurrency: null,
  ownerPersonId: null,
  serverId: null,
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
  createdAt: "2026-10-13T00:00:00Z",
  updatedAt: "2026-10-13T00:00:00Z",
  deletedAt: null,
});
const repository = (list: Trip[] = []): TripRepository => ({
  listTrips: vi.fn(async () => list),
  getTrip: vi.fn(async (id) => list.find((t) => t.id === id) ?? null),
  selectBuiltInCover: vi.fn(async () => {}),
  createTrip: vi.fn(async (input) => trip(input.tripId, input.name)),
  addItem: vi.fn(async (_tripId, input) => ({
    localStatus: "PENDING" as const,
    itemId: input.itemId,
    operationId: input.operationId,
  })),
  pendingItems: vi.fn(async () => []),
  acceptCreate: vi.fn(async (result) => trip(result.tripId, result.name)),
  resumeCreateTrips: vi.fn(async () => {}),
  initializeLocalLedger: vi.fn(async () => {}),
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let key: string | null;
const props = {
  tripId: null as string | null,
  mode: "LIST" as "LIST" | "CREATE",
  onOpen: vi.fn(),
  onCreate: vi.fn(),
  onOpenToday: vi.fn(),
  onKnownTrip: vi.fn(),
  onBackToTrips: vi.fn(),
  widgetsForHome: vi.fn(
    (_id: string, _lifecycle: string): readonly TripHomeWidget[] => [],
  ),
};
function render() {
  const element = LocalTripWorkspace(props);
  const next = String(element.key);
  state.mount = next !== key;
  if (state.mount) {
    state.cleanups.forEach((cleanup) => cleanup());
    state.cleanups = [];
    state.hooks = [];
    state.refs = [];
    key = next;
  }
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(element);
  for (const effect of state.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) state.cleanups.push(cleanup);
  }
  state.mount = false;
  return html;
}
const button = (label: string) => state.nodes.find((node) => node.label === label)!;
function input(label: string, value: string) {
  state.nodes.find((node) => node.accessibilityLabel === label)!.onChangeText(value);
}
beforeEach(() => {
  state.cleanups.forEach((cleanup) => cleanup());
  state.cleanups = [];
  state.effects = [];
  state.hooks = [];
  state.refs = [];
  key = null;
  state.publish.mockReset();
  state.alert.mockReset();
  state.forceEffects = false;
  state.repo.mockReset();
  state.discovery.mockReset();
  state.discovery.mockResolvedValue({
    readMerged: async () => ({ cachedAt: null, trips: [] }),
  });
  state.finance = null;
  props.widgetsForHome.mockReset();
  props.widgetsForHome.mockReturnValue([]);
  props.tripId = null;
  props.mode = "LIST";
  props.onOpen.mockClear();
  props.onKnownTrip.mockClear();
  props.onBackToTrips.mockClear();
  advanceAccountGeneration();
});

it("fences a deferred A save before mutation, clears stale account UI, and lets B save", async () => {
  const a = repository([trip("a-old", "Account A old trip")]),
    b = repository();
  state.repo.mockResolvedValue(a);
  render();
  await flush();
  expect(render()).toContain("Account A old trip");
  props.mode = "CREATE";
  render();
  await flush();
  input("tripCreate.name", "A private draft");
  render();
  const old = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => old.promise);
  button("tripCreate.saveTrip").onPress();
  render();
  expect(button("tripCreate.saveTrip").disabled).toBe(true);
  const oldKey = key;
  advanceAccountGeneration();
  state.repo.mockResolvedValue(b);
  const immediate = render();
  expect(key).not.toBe(oldKey);
  expect(immediate).not.toContain("Account A old trip");
  expect(immediate).not.toContain("A private draft");
  await flush();
  render();
  input("tripCreate.name", "B own draft");
  render();
  const bSave = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => bSave.promise);
  button("tripCreate.saveTrip").onPress();
  render();
  old.resolve(b);
  await flush();
  render();
  expect(b.createTrip).not.toHaveBeenCalled();
  expect(button("tripCreate.saveTrip").disabled).toBe(true);
  bSave.resolve(b);
  await flush();
  render();
  expect(b.createTrip).toHaveBeenCalledOnce();
  expect(b.createTrip).toHaveBeenCalledWith(
    expect.objectContaining({ name: "B own draft" }),
  );
  expect(button("tripCreate.saveTrip").disabled).toBe(false);
  expect(props.onOpen).toHaveBeenCalledOnce();
});

it("remounts when the owning navigation leaves a trip and rejects its late item save", async () => {
  const repo = repository([trip("local-a", "Local pending trip")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  expect(render()).toContain("Local pending trip");
  props.onBackToTrips();
  expect(props.onBackToTrips).toHaveBeenCalledOnce();
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  state.publish.mock.calls
    .find((call) => call[0]?.tripId === "local-a")![0]
    .itinerary(null);
  render();
  input("tripCreate.itemTitle", "Old trip draft");
  render();
  button("tripCreate.itemDate").onPress();
  render();
  state.nodes
    .find((node) => node.mode === "date")!
    .onChange(undefined, new Date(2026, 9, 13, 12));
  render();
  button("common.done").onPress();
  render();
  expect(button("tripCreate.saveItem").disabled).toBe(false);
  const old = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => old.promise);
  button("tripCreate.saveItem").onPress();
  const generation = getAccountGeneration(),
    oldKey = key;
  props.tripId = null;
  expect(render()).not.toContain("Old trip draft");
  expect(getAccountGeneration()).toBe(generation);
  expect(key).not.toBe(oldKey);
  old.resolve(repo);
  await flush();
  render();
  expect(repo.addItem).not.toHaveBeenCalled();
  expect(button("Local pending trip")).toBeDefined();
  button("Local pending trip").onPress();
  expect(props.onOpen).toHaveBeenCalledWith("local-a");
});

it("shows an accepted local Trip without calling its creation pending", async () => {
  const accepted = {
    ...trip("accepted-local", "Accepted Trip"),
    syncStatus: "SYNCED" as const,
  };
  state.repo.mockResolvedValue(repository([accepted]));
  props.tripId = accepted.id;
  render();
  await flush();
  const html = render();
  expect(html).not.toContain("tripCreate.acceptedTrip");
  expect(html).not.toContain("tripCreate.pendingItems");
  expect(html).not.toContain("tripCreate.pendingTrip");
});

it("opens a cached remote-only summary without local write controls and clears it on account switch", async () => {
  const local = trip("local-a", "Local pending Trip");
  const remote = {
    id: "remote-b",
    name: "Cached shared Trip",
    destination: "Wellington",
    startDate: "invalid-date",
    endDate: null,
    createdAt: null,
    localStatus: null,
    selectedCoverAssetId: null,
    remoteListed: true,
  };
  state.repo.mockResolvedValue(repository([local]));
  state.discovery.mockResolvedValue({
    readMerged: async () => ({ cachedAt: "2026-10-13T00:00:00Z", trips: [remote] }),
  });
  render();
  await flush();
  expect(render()).toContain("Local pending Trip");
  expect(render()).toContain("Cached shared Trip");
  button("Cached shared Trip").onPress();
  expect(props.onOpen).toHaveBeenCalledWith("remote-b");
  props.tripId = "remote-b";
  render();
  await flush();
  const summary = render();
  expect(summary).toContain("Cached shared Trip");
  expect(summary).toContain("myTrips.cachedDetails");
  expect(summary).not.toContain("data-trip-photos");
  expect(summary).not.toContain("tripCreate.addItem");
  expect(summary).not.toContain("myTrips.chooseCover");
  expect(props.onKnownTrip).toHaveBeenLastCalledWith("CACHED");
  advanceAccountGeneration();
  state.repo.mockResolvedValue(repository());
  state.discovery.mockResolvedValue({
    readMerged: async () => ({ cachedAt: null, trips: [] }),
  });
  expect(render()).not.toContain("Cached shared Trip");
});

it("mounts trusted Photos only for the currently selected local Trip", async () => {
  state.repo.mockResolvedValue(
    repository([trip("local-a", "Local A"), trip("local-b", "Local B")]),
  );
  props.tripId = "local-a";
  render();
  await flush();
  expect(render()).toContain('data-trip-photos="local-a"');
  props.tripId = "local-b";
  render();
  await flush();
  const next = render();
  expect(next).toContain('data-trip-photos="local-b"');
  expect(next).not.toContain('data-trip-photos="local-a"');
});

it("appends only a qualified finance page after the Past Snapshot", async () => {
  state.repo.mockResolvedValue(
    repository([
      { ...trip("past", "Past"), startDate: "2026-01-01", endDate: "2026-01-02" },
    ]),
  );
  props.tripId = "past";
  props.widgetsForHome.mockReturnValue([
    { id: "journey-snapshot", title: "Snapshot", content: null },
  ]);
  state.finance = { id: "ledger-finance", title: "Spending", content: null };
  render();
  await flush();
  render();
  expect(
    state.nodes
      .find((node) => node.frameWidgets)
      ?.frameWidgets.map((page: TripHomeWidget) => page.id),
  ).toEqual(["journey-snapshot", "ledger-finance"]);
  state.finance = null;
  render();
  expect(
    state.nodes
      .find((node) => node.frameWidgets)
      ?.frameWidgets.map((page: TripHomeWidget) => page.id),
  ).toEqual(["journey-snapshot"]);
});

it("unknown and Upcoming lifecycles do not invent a Past Snapshot or empty Finance page", async () => {
  state.repo.mockResolvedValue(
    repository([
      { ...trip("future", "Future"), startDate: "9999-01-01", endDate: "9999-01-02" },
      trip("undated", "Undated"),
    ]),
  );
  props.widgetsForHome.mockImplementation((_id: string, lifecycle: string) =>
    lifecycle === "Past"
      ? [{ id: "journey-snapshot", title: "Snapshot", content: null }]
      : [],
  );
  for (const id of ["future", "undated"]) {
    props.tripId = id;
    render();
    await flush();
    render();
    expect(state.nodes.find((node) => node.frameWidgets)?.frameWidgets).toEqual([]);
  }
  expect(props.widgetsForHome).toHaveBeenLastCalledWith("undated", "Undated");
});

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("./TripViewContext", () => ({
  useTripView: () => ({ publishQuickActions: state.publish, localOutcome: null }),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
    return null;
  },
}));

it("the mounted local Quick Add callback opens the existing form with an editable weak date and real local save", async () => {
  const repo = repository([trip("local-a", "Local A")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  const actions = state.publish.mock.calls.find(
    (call) => call[0]?.tripId === "local-a",
  )![0];
  expect(actions.photos).toBeUndefined();
  actions.itinerary("2027-01-02");
  render();
  input("tripCreate.itemTitle", "Explicit activity");
  render();
  button("tripCreate.saveItem").onPress();
  await flush();
  expect(repo.addItem).toHaveBeenCalledWith(
    "local-a",
    expect.objectContaining({ title: "Explicit activity", startDate: "2027-01-02" }),
  );
  expect(render()).toContain("actionIsland.savedLocally");
});

it("normal Home keeps cover editing behind its action and preserves the owning selection", async () => {
  const repo = repository([trip("local-a", "Local A")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  const html = render();
  expect(html).not.toContain("tripCreate.pendingItems");
  expect(state.nodes.some((node) => node.coverPicker)).toBe(false);
  button("tripHome.coverTools").onPress();
  render();
  const picker = state.nodes.find((node) => node.coverPicker)!.coverPicker;
  await picker.onSelect("coast");
  expect(repo.selectBuiltInCover).toHaveBeenCalledWith("local-a", "coast");
});

vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "div" }));
