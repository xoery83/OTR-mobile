import { readLocalSession, readLocalAuthSnapshot } from "@/data/auth/authRepository";
vi.mock("./CreateTripDestinations", () => ({
  CreateTripDestinations: (props: any) => {
    state.nodes.push({ destinations: props });
    return null;
  },
}));
vi.mock("./CreateTripV2Fields", () => ({
  CreateTripV2Fields: (props: any) => {
    state.nodes.push(
      { createFields: props },
      {
        accessibilityLabel: "createTripV2.name",
        value: props.name,
        onChangeText: props.onName,
      },
    );
    return props.destinationEntry;
  },
}));
vi.mock("./ManualItineraryContent", () => ({
  ManualItineraryContent: (props: any) => {
    state.nodes.push({ manualEntry: props });
    return null;
  },
}));
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { migrations } from "@/data/db/migrations";
import { createTripPersonRepository } from "@/data/repositories/tripPersonRepository";
import { beforeEach, expect, it, vi } from "vitest";
import type { TripHomeWidget } from "@/features/trip/TripHomeWidgetHost";
import type { Trip } from "@/domain/trip/types";
import type { TripRepository } from "@/data/repositories/tripRepository";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { LocalTripWorkspace } from "./LocalTripWorkspace";
import { router } from "expo-router";
vi.mock("@/features/ledger/CurrencySettingsScreen", () => ({
  CurrencySettingsScreen: (props: any) => {
    state.nodes.push({ currencyScreen: props });
    return null;
  },
}));
vi.mock("./TripCalendarRangeField", () => ({
  TripCalendarRangeField: () => null,
  tripRangeLabel: () => "range",
}));
vi.mock("./P1PlanEditor", () => ({
  P1PlanEditor: (props: any) => {
    state.nodes.push({ planEditor: props });
    return null;
  },
}));
vi.mock("./P3StayEditor", () => ({
  P3StayEditor: (props: any) => {
    state.nodes.push({ stayEditor: props });
    return null;
  },
}));
vi.mock("./P4RentalEditor", () => ({
  P4RentalEditor: (props: any) => {
    state.nodes.push({ rentalEditor: props });
    return null;
  },
}));
vi.mock("./P5TransportEditor", () => ({
  P5TransportEditor: (props: any) => {
    state.nodes.push({ transportEditor: props });
    return null;
  },
}));
vi.mock("./useTripPreparationWidget", () => ({
  useTripPreparationWidget: (props: any) => {
    state.preparation = props;
    return null;
  },
}));
vi.mock("./TripMembersSheet", () => ({
  TripMembersSheet: (props: any) => {
    state.nodes.push({ membersSheet: props });
    return null;
  },
}));

vi.mock("@/features/trip/TripHomeFrame", () => ({
  TripHomeFrame: (p: any) => {
    state.nodes.push({ frameWidgets: p.widgets ?? [], frame: p });
    if (p.canChooseCover && p.onChooseCover)
      state.nodes.push({ label: "myTrips.chooseCover", onPress: p.onChooseCover });
    if (p.onEdit) state.nodes.push({ label: "tripHome.edit", onPress: p.onEdit });
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
  focused: true,
  finance: null as TripHomeWidget | null,
  preparation: null as any,
  personal: { selection: null as any, open: vi.fn(), select: vi.fn() },
}));
vi.mock("./useTripPersonalCover", () => ({ useTripPersonalCover: () => state.personal }));
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
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock("@/data/files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: (p: any) => createElement("div", null, p.children),
  Platform: { OS: "ios" },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.children);
  },
  Alert: { alert: (...args: any[]) => state.alert(...args) },
  Modal: (p: any) => {
    if (p.visible) state.nodes.push({ modal: p });
    return p.visible ? createElement("div", null, p.children) : null;
  },
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
  t: (key: string, params?: Record<string, unknown>) =>
    params?.number ? `${key}:${params.number}` : key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
  formatUiNumber: String,
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: () => ({}),
  useUiTheme: () => ({ textSecondary: "currentColor" }),
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/domain/localId", async (original) => ({
  ...(await original<typeof import("@/domain/localId")>()),
  createUuid: () =>
    `00000000-0000-4000-8000-${(++state.serial).toString(16).padStart(12, "0")}`,
}));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  kickLedgerOperationalSync: vi.fn(),
}));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({
  clearLocalSession: vi.fn(),
  writeLocalSession: vi.fn(),
  requireActiveUserId: vi.fn(),
  readLocalSession: vi.fn(),
  readLocalAuthSnapshot: vi.fn(),
}));
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
vi.mock("./tripCovers", () => ({ tripCoverSource: () => 1, tripCoverId: () => "coast" }));

const trip = (id: string, name: string): Trip => ({
  id,
  selectedCoverAssetId: null,
  selectedCoverAssetIdRaw: null,
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
  readDeferredMetadataEditBase: vi.fn(),
  deferMetadataUpdate: vi.fn(),
  materializeDeferredMetadata: vi.fn(),
  readMetadataEditBase: vi.fn(async () => ({ confirmed: null, pendingOperationIds: [] })),
  retainMetadataSnapshot: vi.fn(async () => {}),
  canUpdateMetadata: vi.fn(async () => true),
  updateMetadata: vi.fn(async () => {}),
  acceptMetadataUpdate: vi.fn(async () => {}),
  resumeMetadataUpdates: vi.fn(async () => {}),
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
  vi.unstubAllEnvs();
  vi.mocked(readLocalSession).mockReset();
  vi.mocked(readLocalAuthSnapshot)
    .mockReset()
    .mockImplementation(
      async () =>
        ({
          session: await readLocalSession(),
          principal: { kind: "SIGNED_OUT" },
        }) as never,
    );
  state.cleanups.forEach((cleanup) => cleanup());
  state.cleanups = [];
  state.effects = [];
  state.hooks = [];
  state.refs = [];
  key = null;
  state.publish.mockReset();
  state.alert.mockReset();
  state.forceEffects = false;
  state.focused = true;
  state.repo.mockReset();
  state.discovery.mockReset();
  state.discovery.mockResolvedValue({
    readMerged: async () => ({ cachedAt: null, trips: [] }),
  });
  state.finance = null;
  state.personal.selection = null;
  state.personal.open.mockReset().mockResolvedValue(false);
  state.personal.select.mockReset().mockResolvedValue(undefined);
  props.widgetsForHome.mockReset();
  props.widgetsForHome.mockReturnValue([]);
  props.tripId = null;
  props.mode = "LIST";
  props.onOpen.mockReset();
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
  input("createTripV2.name", "A private draft");
  render();
  const old = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => old.promise);
  button("createTripV2.create").onPress();
  render();
  expect(button("createTripV2.create").disabled).toBe(true);
  const oldKey = key;
  advanceAccountGeneration();
  state.repo.mockResolvedValue(b);
  const immediate = render();
  expect(key).not.toBe(oldKey);
  expect(immediate).not.toContain("Account A old trip");
  expect(immediate).not.toContain("A private draft");
  await flush();
  render();
  input("createTripV2.name", "B own draft");
  render();
  const bSave = deferred<TripRepository>();
  state.repo.mockImplementationOnce(() => bSave.promise);
  button("createTripV2.create").onPress();
  render();
  old.resolve(b);
  await flush();
  render();
  expect(b.createTrip).not.toHaveBeenCalled();
  expect(button("createTripV2.create").disabled).toBe(true);
  bSave.resolve(b);
  await flush();
  render();
  expect(b.createTrip).toHaveBeenCalledOnce();
  expect(b.createTrip).toHaveBeenCalledWith(
    expect.objectContaining({ name: "B own draft" }),
  );
  expect(button("createTripV2.create").disabled).toBe(false);
  expect(props.onOpen).toHaveBeenCalledOnce();
});

it("remounts when navigation leaves a trip and rejects a late typed Stay save", async () => {
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
  const stayEditor = state.nodes.find((node) => node.manualEntry)?.manualEntry;
  expect(stayEditor).toMatchObject({ tripId: "local-a" });
  const generation = getAccountGeneration(),
    oldKey = key;
  props.tripId = null;
  render();
  expect(getAccountGeneration()).toBe(generation);
  expect(key).not.toBe(oldKey);
  stayEditor.onSaved("old-stay");
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

it("opens a remote member chooser only through the independent owning capability", async () => {
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  state.discovery.mockResolvedValue({
    readMerged: async () => ({
      cachedAt: null,
      trips: [
        {
          id: "remote-b",
          name: "Shared Trip",
          destination: null,
          startDate: null,
          endDate: null,
          createdAt: null,
          localStatus: null,
          remoteListed: true,
          selectedCoverAssetId: null,
        },
      ],
    }),
  });
  state.personal.selection = { raw: "coast" };
  state.personal.open.mockResolvedValue(true);
  props.tripId = "remote-b";
  render();
  await flush();
  render();
  const frame = state.nodes.find((node) => node.frame)!.frame;
  expect(frame.canChooseCover).toBe(true);
  expect(frame.onEdit).toBeUndefined();
  expect(repo.canUpdateMetadata).not.toHaveBeenCalled();
  await button("myTrips.chooseCover").onPress();
  render();
  const picker = state.nodes.find((node) => node.coverPicker)!.coverPicker;
  expect(picker.presentation).toBe("standalone");
  await picker.onSelect(null);
  expect(state.personal.select).toHaveBeenCalledExactlyOnceWith(null);
  expect(repo.createTrip).not.toHaveBeenCalled();
  expect(repo.updateMetadata).not.toHaveBeenCalled();
  expect(repo.selectBuiltInCover).not.toHaveBeenCalled();
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
  state.personal.selection = null;
  state.personal.open.mockReset().mockResolvedValue(false);
  state.personal.select.mockReset().mockResolvedValue(undefined);
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
  expect(props.widgetsForHome).toHaveBeenLastCalledWith("undated", "Undated", null);
});

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useFocusEffect: (callback: () => void | (() => void)) => {
    if (state.focused && (state.mount || state.forceEffects))
      state.effects.push(callback);
  },
}));
vi.mock("./TripViewContext", () => ({
  useTripView: () => ({ publishQuickActions: state.publish, localOutcome: null }),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel ?? "common.close", onPress: p.onLeft });
    if (p.onRight)
      state.nodes.push({
        label: p.rightLabel,
        onPress: p.onRight,
        disabled: p.rightDisabled,
      });
    return null;
  },
}));

it("the mounted local Quick Add opens the shared chooser with explicit Day context", async () => {
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
  const editor = state.nodes.find((node) => node.manualEntry)?.manualEntry;
  expect(editor).toMatchObject({ tripId: "local-a", initialDate: "2027-01-02" });
  editor.onSaved("item-a");
  expect(render()).toContain("actionIsland.savedLocally");
  expect(repo.addItem).not.toHaveBeenCalled();
});

it("opens the shared chooser from local Quick Add with the same Day context", async () => {
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
  actions.itinerary("2027-01-02");
  render();
  const stayEditor = state.nodes.find((node) => node.manualEntry)?.manualEntry;
  expect(stayEditor).toMatchObject({ tripId: "local-a", initialDate: "2027-01-02" });
  stayEditor.onSaved("stay-a");
  expect(render()).toContain("actionIsland.savedLocally");
  expect(repo.addItem).not.toHaveBeenCalled();
});

it("opens the shared chooser and refreshes the same Trip", async () => {
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
  actions.itinerary("2027-01-02");
  render();
  const rental = state.nodes.find((entry) => entry.manualEntry)?.manualEntry;
  expect(rental).toMatchObject({ tripId: "local-a", initialDate: "2027-01-02" });
  rental.onSaved("rental-a");
  expect(render()).toContain("actionIsland.savedLocally");
  expect(repo.addItem).not.toHaveBeenCalled();
});

it("opens the shared chooser with the same Day context", async () => {
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
  actions.itinerary("2027-01-02");
  render();
  const transport = state.nodes.find((entry) => entry.manualEntry)?.manualEntry;
  expect(transport).toMatchObject({ tripId: "local-a", initialDate: "2027-01-02" });
  transport.onSaved("transport-a");
  expect(render()).toContain("actionIsland.savedLocally");
  expect(repo.addItem).not.toHaveBeenCalled();
});

it("non-Creator Home opens the independent preference Gallery without metadata authority", async () => {
  const repo = repository([trip("local-a", "Local A")]);
  vi.mocked(repo.canUpdateMetadata).mockResolvedValue(false);
  state.personal.selection = { raw: "coast" };
  state.personal.open.mockResolvedValue(true);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  render();
  expect(state.nodes.some((node) => node.label === "tripHome.edit")).toBe(false);
  expect(state.nodes.find((node) => node.frame)!.frame.rawCoverSelection).toBe("coast");
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  expect(
    state.publish.mock.calls.find(([actions]) => actions?.tripId === "local-a")?.[0]
      .editTrip,
  ).toBeUndefined();
  await button("myTrips.chooseCover").onPress();
  render();
  const picker = state.nodes.find((node) => node.coverPicker)!.coverPicker;
  expect(picker.presentation).toBe("standalone");
  await picker.onSelect("city");
  expect(state.personal.select).toHaveBeenCalledWith("city");
  expect(repo.selectBuiltInCover).not.toHaveBeenCalled();
  expect(repo.updateMetadata).not.toHaveBeenCalled();
  picker.onClose();
  render();
  expect(state.nodes.some((node) => node.coverPicker)).toBe(false);
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  SafeAreaView: "div",
}));
it("normal Home Hero action opens the same Editor and saves through the owning metadata repository", async () => {
  const current = trip("local-a", "Original"),
    repo = repository([current]);
  state.repo.mockResolvedValue(repo);
  props.tripId = current.id;
  render();
  await flush();
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  const action = state.publish.mock.calls.find(
    (call) => call[0]?.tripId === current.id,
  )![0];
  action.editTrip();
  render();
  input("tripCreate.name", "Updated");
  render();
  const commit = button("ui.save").onPress;
  commit();
  commit();
  await flush();
  const html = render();
  expect(html).toContain("Updated");
  expect(state.nodes.some((node) => node.coverPicker)).toBe(false);
  expect(repo.updateMetadata).toHaveBeenCalledOnce();
  expect(repo.updateMetadata).toHaveBeenCalledWith(
    expect.objectContaining({
      tripId: current.id,
      before: { name: current.name, destination: null, startDate: null, endDate: null },
      after: { name: "Updated", destination: null, startDate: null, endDate: null },
    }),
    undefined,
    undefined,
  );
  expect(repo.getTrip).toHaveBeenCalledWith(current.id);
});

it("an unfocused retained Workspace cannot publish actions over another Trip", async () => {
  props.tripId = "trip-a";
  state.repo.mockResolvedValue(repository([trip("trip-a", "Trip A")]));
  render();
  await flush();
  render();
  state.publish.mockClear();
  state.focused = false;
  state.forceEffects = true;
  render();
  expect(state.publish).not.toHaveBeenCalled();
  state.focused = true;
  render();
  expect(state.publish.mock.calls.some(([actions]) => actions?.tripId === "trip-a")).toBe(
    true,
  );
});

it("Create is one native sheet, Cancel writes nothing, and immediate double tap saves one undated Trip", async () => {
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  expect(
    state.nodes.filter((node) => node.modal).map((node) => node.modal.presentationStyle),
  ).toEqual(["pageSheet"]);
  expect(
    state.nodes.some((node) => node.accessibilityLabel === "tripCreate.baseCurrency"),
  ).toBe(false);
  button("common.cancel").onPress();
  expect(props.onBackToTrips).toHaveBeenCalledOnce();
  expect(repo.createTrip).not.toHaveBeenCalled();
  input("createTripV2.name", "Name only");
  render();
  const pending = deferred<Trip>();
  vi.mocked(repo.createTrip).mockImplementationOnce(() => pending.promise);
  const create = button("createTripV2.create");
  create.onPress();
  create.onPress();
  await flush();
  expect(repo.createTrip).toHaveBeenCalledTimes(1);
  const payload = vi.mocked(repo.createTrip).mock.calls[0][0];
  expect(payload).toMatchObject({ name: "Name only", startDate: null, endDate: null });
  expect(payload).not.toHaveProperty("travelers");
  expect(payload).not.toHaveProperty("currency");
  expect(payload).not.toHaveProperty("cover");
  button("common.cancel").onPress();
  expect(props.onBackToTrips).toHaveBeenCalledTimes(1);
  pending.resolve(trip(payload.tripId, payload.name));
  await flush();
  expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(payload.tripId);
});

it("sends seven slots with three nonblank names through the real atomic Trip Repository and reads four distinct Persons", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    for (const migration of migrations) sql.exec(migration.sql);
    const database = {
      async getFirstAsync<T>(query: string, ...args: unknown[]) {
        return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
      },
      async getAllAsync<T>(query: string, ...args: unknown[]) {
        return sql.prepare(query).all(...(args as never[])) as T[];
      },
      async runAsync(query: string, ...args: unknown[]) {
        return sql.prepare(query).run(...(args as never[])) as never;
      },
      async withTransactionAsync(work: () => Promise<void>) {
        sql.exec("BEGIN");
        try {
          await work();
          sql.exec("COMMIT");
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      },
    };
    const { createTripRepository } = await vi.importActual<
      typeof import("@/data/repositories/tripRepository")
    >("@/data/repositories/tripRepository");
    const account = randomUUID();
    const identity = async () => account;
    const repo = createTripRepository(
      database,
      identity,
      { captureContext: vi.fn(), enqueue: vi.fn(), pending: vi.fn() },
      () => "2026-10-17T09:00:00Z",
      async () => "Account creator",
    );
    const create = vi.spyOn(repo, "createTrip");
    state.repo.mockResolvedValue(repo);
    props.mode = "CREATE";
    render();
    await vi.waitFor(() => expect(props.onKnownTrip).toHaveBeenCalledWith("NONE"));
    render();
    input("createTripV2.name", "Local Travelers");
    const slots = Array.from({ length: 7 }, (_, index) => ({
      personId: randomUUID(),
      operationId: randomUUID(),
      displayName:
        index === 0 ? " Tina " : index === 2 ? "同行者" : index === 6 ? "Tina" : "",
    }));
    state.nodes.find((node) => node.createFields)!.createFields.onTravelers(slots);
    render();
    props.onOpen.mockImplementationOnce(() => {
      throw new Error("navigation");
    });
    button("createTripV2.create").onPress();
    await vi.waitFor(() => expect(props.onOpen).toHaveBeenCalledOnce());
    const payload = create.mock.calls[0][0];
    expect(payload.travelers?.map((slot) => slot.displayName)).toEqual([
      "Tina",
      "同行者",
      "Tina",
    ]);
    const people = await createTripPersonRepository(database, identity).listTripPersons(
      payload.tripId,
    );
    expect(people).toHaveLength(4);
    expect(people.filter((person) => person.localState === "LOCAL_PENDING")).toHaveLength(
      3,
    );
    expect(
      people.filter((person) => person.displayName === "Account creator"),
    ).toHaveLength(1);
    render();
    button("createTripV2.create").onPress();
    await vi.waitFor(() => expect(props.onOpen).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0]).toEqual(payload);
    expect(
      await createTripPersonRepository(database, identity).listTripPersons(
        payload.tripId,
      ),
    ).toEqual(people);
    const proof = JSON.parse(
      String(
        sql
          .prepare("SELECT payload_json p FROM sync_operations WHERE id=?")
          .get(payload.operationId)?.p,
      ),
    );
    expect(proof).not.toHaveProperty("travelers");
  } finally {
    sql.close();
  }
});

it("preserves additional names and stable intent IDs on retry without a count stepper", async () => {
  const repo = repository();
  vi.mocked(repo.createTrip).mockRejectedValueOnce(new Error("disk"));
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "Retry trip");
  state.nodes
    .find((node) => node.createFields)!
    .createFields.onTravelers([
      { personId: randomUUID(), operationId: randomUUID(), displayName: "Last traveler" },
    ]);
  render();
  button("createTripV2.create").onPress();
  await flush();
  render();
  const first = vi.mocked(repo.createTrip).mock.calls[0][0];
  expect(first.travelers?.[0].displayName).toBe("Last traveler");
  button("createTripV2.create").onPress();
  await flush();
  expect(vi.mocked(repo.createTrip).mock.calls[1][0]).toEqual(first);
});
it("maps You nickname only to the lawful creator display field", async () => {
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "Name only");
  state.nodes.find((node) => node.createFields)!.createFields.onSelfNickname("Trip AKA");
  render();
  button("createTripV2.create").onPress();
  await flush();
  expect(repo.createTrip).toHaveBeenCalledWith(
    expect.objectContaining({ creatorDisplayName: "Trip AKA" }),
  );
  expect(vi.mocked(repo.createTrip).mock.calls[0][0].travelers).toBeUndefined();
});
it("clears private Traveler names and allocates new intent after account generation changes", async () => {
  const a = repository(),
    b = repository();
  vi.mocked(a.createTrip).mockRejectedValueOnce(new Error("disk"));
  state.repo.mockResolvedValue(a);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "A trip");
  const oldPerson = {
    personId: randomUUID(),
    operationId: randomUUID(),
    displayName: "A private name",
  };
  state.nodes.find((node) => node.createFields)!.createFields.onTravelers([oldPerson]);
  render();
  button("createTripV2.create").onPress();
  await flush();
  const old = vi.mocked(a.createTrip).mock.calls[0][0];
  advanceAccountGeneration();
  state.repo.mockResolvedValue(b);
  render();
  await flush();
  render();
  expect(state.nodes.find((node) => node.createFields)!.createFields.travelers).toEqual(
    [],
  );
  input("createTripV2.name", "B trip");
  state.nodes
    .find((node) => node.createFields)!
    .createFields.onTravelers([
      { personId: randomUUID(), operationId: randomUUID(), displayName: "B friend" },
    ]);
  render();
  button("createTripV2.create").onPress();
  await flush();
  const fresh = vi.mocked(b.createTrip).mock.calls[0][0];
  expect(fresh.tripId).not.toBe(old.tripId);
  expect(fresh.travelers?.[0].personId).not.toBe(old.travelers?.[0].personId);
});
it("Close confirms meaningful new Trip edits and never submits a create", async () => {
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "Unsaved trip");
  render();
  button("common.cancel").onPress();
  expect(props.onBackToTrips).not.toHaveBeenCalled();
  state.alert.mock.lastCall![2][1].onPress();
  expect(props.onBackToTrips).toHaveBeenCalledOnce();
  expect(repo.createTrip).not.toHaveBeenCalled();
});

it("Creator Close discards staged cover without an independent write and cannot dismiss an in-flight atomic save", async () => {
  const current = trip("local-a", "Original"),
    repo = repository([current]);
  state.repo.mockResolvedValue(repo);
  props.tripId = current.id;
  render();
  await flush();
  render();
  button("tripHome.edit").onPress();
  render();
  await state.nodes.find((node) => node.coverPicker)!.coverPicker.onSelect("coast");
  // This harness normally suppresses update effects; flush the new child guard registration.
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  render();
  const host = state.nodes.find(
    (node) => node.modal?.presentationStyle === "pageSheet",
  )!.modal;
  expect(host.allowSwipeDismissal).toBe(false);
  host.onRequestClose();
  render();
  expect(state.nodes.some((node) => node.coverPicker)).toBe(true);
  state.alert.mock.lastCall![2][1].onPress();
  render();
  expect(state.nodes.some((node) => node.coverPicker)).toBe(false);
  expect(repo.updateMetadata).not.toHaveBeenCalled();
  expect(repo.selectBuiltInCover).not.toHaveBeenCalled();
  button("tripHome.edit").onPress();
  render();
  input("tripCreate.name", "Saved name");
  render();
  const pending = deferred<void>();
  vi.mocked(repo.updateMetadata).mockReturnValueOnce(pending.promise);
  button("ui.save").onPress();
  await flush();
  render();
  button("common.cancel").onPress();
  render();
  expect(state.nodes.some((node) => node.coverPicker)).toBe(true);
  expect(
    state.nodes.find((node) => node.modal?.presentationStyle === "pageSheet")!.modal
      .allowSwipeDismissal,
  ).toBe(false);
  pending.resolve();
  await flush();
});

it("keeps an Editor draft after local failure and never closes a different Trip on late commit", async () => {
  const a = trip("local-a", "A"),
    b = trip("local-b", "B"),
    repo = repository([a, b]);
  state.repo.mockResolvedValue(repo);
  props.tripId = a.id;
  render();
  await flush();
  render();
  button("tripHome.edit").onPress();
  render();
  input("tripCreate.name", "Keep draft");
  render();
  vi.mocked(repo.updateMetadata).mockRejectedValueOnce(new Error("disk"));
  button("ui.save").onPress();
  await flush();
  let html = render();
  expect(html).toContain("tripCreate.saveFailed");
  expect(
    state.nodes.find((node) => node.accessibilityLabel === "tripCreate.name")!.value,
  ).toBe("Keep draft");
  const pending = deferred<void>();
  vi.mocked(repo.updateMetadata).mockReturnValueOnce(pending.promise);
  button("ui.save").onPress();
  await flush();
  props.tripId = b.id;
  render();
  await flush();
  render();
  button("tripHome.edit").onPress();
  render();
  pending.resolve();
  await flush();
  html = render();
  expect(html).toContain("B");
  expect(state.nodes.some((node) => node.coverPicker)).toBe(true);
});

it("opens the existing Members sheet from a scoped local menu only when real setup facts are available", async () => {
  const repo = repository([trip("local-a", "Local A")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  state.forceEffects = true;
  render();
  state.preparation.onSetup({
    context: {
      accountId: "actor",
      tripId: "local-a",
      generation: getAccountGeneration(),
    },
    currency: { state: "UNAVAILABLE" },
    members: {
      state: "AVAILABLE",
      namedCount: 1,
      people: [
        {
          personId: "person-a",
          displayName: "Local Name",
          isCurrentActor: true,
          localState: "LOCAL_PENDING",
        },
      ],
    },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  });
  render();
  const action = state.publish.mock.calls
    .filter(([actions]: any[]) => actions?.members)
    .at(-1)?.[0];
  expect(action).toBeDefined();
  action.members();
  render();
  const sheets = state.nodes.filter((node) => node.membersSheet?.visible);
  expect(sheets).toHaveLength(1);
  const sheet = sheets[0].membersSheet;
  expect(sheet.visible).toBe(true);
  expect(sheet.members.people[0].displayName).toBe("Local Name");
  props.tripId = "other";
  render();
  action.members();
  render();
  expect(state.nodes.some((node) => node.membersSheet?.visible)).toBe(false);
});

it("keeps the same Editor mounted beneath same-Trip Currency without saving", async () => {
  const repo = repository([trip("local-a", "Local A")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  render();
  state.preparation.onSetup({
    context: {
      accountId: "actor",
      tripId: "local-a",
      generation: getAccountGeneration(),
    },
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
  });
  render();
  button("tripHome.edit").onPress();
  render();
  const currency = state.nodes.find((node) => node.label === "tripForm.currency")!;
  expect(currency.disabled).toBe(false);
  vi.mocked(router.push).mockClear();
  currency.onPress();
  render();
  expect(router.push).not.toHaveBeenCalled();
  expect(state.nodes.some((node) => node.currencyScreen?.journeyId === "local-a")).toBe(
    true,
  );
  expect(state.nodes.some((node) => node.coverPicker)).toBe(true);
  expect(repo.updateMetadata).not.toHaveBeenCalled();
  advanceAccountGeneration();
  render();
  currency.onPress();
  render();
  expect(state.nodes.some((node) => node.currencyScreen)).toBe(false);
  expect(router.push).not.toHaveBeenCalled();
});

it("does not gate an authoritative local Home on unrelated discovery and retains the owning edit check", async () => {
  const repo = repository([trip("local-a", "Local Home")]);
  vi.mocked(repo.canUpdateMetadata).mockResolvedValue(false);
  state.repo.mockResolvedValue(repo);
  state.discovery.mockImplementation(() => new Promise(() => {}));
  props.tripId = "local-a";
  render();
  await flush();
  expect(render()).toContain("Local Home");
  expect(repo.getTrip).toHaveBeenCalledWith("local-a");
  expect(repo.canUpdateMetadata).toHaveBeenCalledWith("local-a");
  expect(state.discovery).not.toHaveBeenCalled();
  expect(state.nodes.some((node) => node.label === "tripHome.edit")).toBe(false);
  expect(state.preparation.onEdit).toBeUndefined();
  expect(repo.updateMetadata).not.toHaveBeenCalled();
});

it("P1 Home passes Trip Start only as picker navigation, not selected date", async () => {
  const repo = repository([{ ...trip("local-a", "Local A"), startDate: "2027-12-30" }]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  state.publish.mock.calls
    .find((call) => call[0]?.tripId === "local-a")![0]
    .itinerary(null);
  render();
  expect(state.nodes.find((node) => node.manualEntry)?.manualEntry).toMatchObject({
    tripId: "local-a",
    initialDate: null,
    tripStartDate: "2027-12-30",
  });
  expect(repo.addItem).not.toHaveBeenCalled();
});

it("P1 passes explicit Day context ahead of Trip Start without changing Trip dates", async () => {
  const repo = repository([
    { ...trip("local-a", "Local A"), startDate: "2027-12-30", endDate: "2028-01-03" },
  ]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  state.forceEffects = true;
  render();
  state.forceEffects = false;
  state.publish.mock.calls
    .find((call) => call[0]?.tripId === "local-a")![0]
    .itinerary("2027-12-29");
  render();
  expect(state.nodes.find((node) => node.manualEntry)?.manualEntry).toMatchObject({
    tripId: "local-a",
    initialDate: "2027-12-29",
    tripStartDate: "2027-12-30",
  });
  expect(repo.addItem).not.toHaveBeenCalled();
  expect(repo.updateMetadata).not.toHaveBeenCalled();
});

it("holds Create while a destination selection resolves and protects unselected query on Close", async () => {
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "My trip");
  render();
  const search = state.nodes.find((node) => node.destinations)!.destinations;
  search.onBusy(true);
  search.onQueryDirty(true);
  render();
  expect(button("createTripV2.create").disabled).toBe(true);
  button("createTripV2.create").onPress();
  await flush();
  expect(repo.createTrip).not.toHaveBeenCalled();
  button("common.cancel").onPress();
  expect(state.alert).toHaveBeenCalled();
  expect(props.onBackToTrips).not.toHaveBeenCalled();
});

it("submits ordered destination identities and creator nickname without flattening into legacy destination", async () => {
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "Japan trip");
  render();
  const destinations = [
    { localId: randomUUID(), text: "Tokyo", source: "MANUAL" },
    {
      localId: randomUUID(),
      text: "Kyoto",
      source: "APPLE",
      match: {
        provider: "apple",
        providerPlaceId: "real-kyoto-id",
        title: "Kyoto",
        secondary: "Japan",
        point: { latitude: 35, longitude: 135 },
      },
    },
  ];
  state.nodes.find((node) => node.destinations)!.destinations.onChange(destinations);
  render();
  button("createTripV2.create").onPress();
  await flush();
  const payload = vi.mocked(repo.createTrip).mock.calls[0][0];
  expect(payload.destination).toBeUndefined();
  expect(payload.destinations).toEqual([
    { destinationId: destinations[0].localId, displayLabel: "Tokyo", source: "MANUAL" },
    {
      destinationId: destinations[1].localId,
      displayLabel: "Kyoto",
      source: "APPLE_PLACE_ID",
      provider: "apple",
      providerPlaceId: "real-kyoto-id",
    },
  ]);
});

const structuredFixture = () => {
  const id = "10000000-0000-4000-8000-000000000002";
  const destination = {
    destinationId: "10000000-0000-4000-8000-000000000005",
    displayLabel: "Tokyo",
    source: "MANUAL" as const,
  };
  const current = {
    ...trip(id, "Original"),
    syncFormatVersion: 2 as const,
    destinations: [{ ...destination, ordinal: 0 }],
  };
  const confirmed = {
    formatVersion: 3 as const,
    actorAccountId: "10000000-0000-4000-8000-000000000001",
    tripId: id,
    metadataRevision: 7,
    metadata: {
      name: "Original",
      destination: null,
      startDate: null,
      endDate: null,
      destinations: [destination],
    },
  };
  return { current, confirmed };
};

it("captures the confirmed ordered-list baseline on opening, never rebases revision at Save", async () => {
  const { current, confirmed } = structuredFixture();
  const repo = repository([current]);
  vi.mocked(repo.readMetadataEditBase).mockResolvedValue({
    confirmed,
    pendingOperationIds: [],
  });
  state.repo.mockResolvedValue(repo);
  props.tripId = current.id;
  render();
  await flush();
  render();
  button("tripHome.edit").onPress();
  await flush();
  render();
  vi.mocked(repo.readMetadataEditBase).mockResolvedValue({
    confirmed: { ...confirmed, metadataRevision: 8 },
    pendingOperationIds: [],
  });
  input("tripCreate.name", "Updated");
  render();
  button("ui.save").onPress();
  await flush();
  render();
  expect(repo.readMetadataEditBase).toHaveBeenCalledTimes(1);
  expect(repo.updateMetadata).toHaveBeenCalledWith(
    expect.objectContaining({
      formatVersion: 3,
      tripId: current.id,
      expectedMetadataRevision: 7,
      before: confirmed.metadata,
      after: { ...confirmed.metadata, name: "Updated" },
    }),
    undefined,
  );
});

it.each(["missing", "pending", "different-local-list"])(
  "never falls back to scalar edit for %s structured baseline",
  async (kind) => {
    const { current, confirmed } = structuredFixture();
    const repo = repository([current]);
    vi.mocked(repo.readMetadataEditBase).mockResolvedValue({
      confirmed:
        kind === "missing"
          ? null
          : kind === "different-local-list"
            ? { ...confirmed, metadata: { ...confirmed.metadata, destinations: [] } }
            : confirmed,
      pendingOperationIds: kind === "pending" ? ["old-operation"] : [],
    });
    state.repo.mockResolvedValue(repo);
    props.tripId = current.id;
    render();
    await flush();
    render();
    button("tripHome.edit").onPress();
    await flush();
    const html = render();
    expect(html).toContain("tripMetadata.confirmedBaseUnavailable");
    expect(state.nodes.find((node) => node.label === "ui.save")).toBeUndefined();
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  },
);

it("opts new Native QA Create into the complete structured wire format without flattening", async () => {
  const accountId = "10000000-0000-4000-8000-000000000001";
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "dev");
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 1,
      accountId,
      startsAt: "2026-10-23T03:00:00Z",
      expiresAt: "2026-10-23T03:15:00Z",
      creates: [],
      edits: [],
    }),
  );
  vi.mocked(readLocalSession).mockResolvedValue({
    identity: { userId: accountId, displayName: "QA" },
  } as never);
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "QA cloud trip");
  render();
  state.nodes
    .find((node) => node.destinations)!
    .destinations.onChange([
      {
        localId: "10000000-0000-4000-8000-000000000005",
        text: "Tokyo",
        source: "MANUAL",
      },
    ]);
  render();
  button("createTripV2.create").onPress();
  await flush();
  expect(repo.createTrip).toHaveBeenCalledWith(
    expect.objectContaining({
      syncFormatVersion: 2,
      destinations: [
        {
          destinationId: "10000000-0000-4000-8000-000000000005",
          displayLabel: "Tokyo",
          source: "MANUAL",
        },
      ],
    }),
  );
  expect(vi.mocked(repo.createTrip).mock.calls[0][0].destination).toBeUndefined();
});

it.each(["missing", "pending"])(
  "uses one deferred local Save for %s confirmation, preserving ordered destinations",
  async (kind) => {
    const { current, confirmed } = structuredFixture();
    const repo = repository([current]);
    vi.mocked(repo.readMetadataEditBase).mockResolvedValue({
      confirmed: kind === "missing" ? null : confirmed,
      pendingOperationIds: kind === "pending" ? ["old-op"] : [],
    });
    vi.mocked(repo.readDeferredMetadataEditBase).mockResolvedValue({
      createOperationId: "create-parent",
      metadata: confirmed.metadata,
    });
    state.repo.mockResolvedValue(repo);
    props.tripId = current.id;
    render();
    await flush();
    render();
    button("tripHome.edit").onPress();
    await flush();
    render();
    input("tripCreate.name", "Offline newer");
    render();
    button("ui.save").onPress();
    await flush();
    render();
    expect(repo.deferMetadataUpdate).toHaveBeenCalledTimes(1);
    expect(repo.deferMetadataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        localActionVersion: 1,
        tripId: current.id,
        before: confirmed.metadata,
        after: { ...confirmed.metadata, name: "Offline newer" },
      }),
    );
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  },
);

it("authors current Add Traveler slots explicitly as shared only for sustained v2 scope", async () => {
  const accountId = "10000000-0000-4000-8000-000000000001";
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "dev");
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://api-dev.xoery.art");
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId,
      normal: { newTripsFrom: "2026-10-24T00:00:00.000Z" },
    }),
  );
  vi.mocked(readLocalSession).mockResolvedValue({
    identity: { userId: accountId, displayName: "QA" },
  } as never);
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  props.mode = "CREATE";
  render();
  await flush();
  render();
  input("createTripV2.name", "Current authored");
  render();
  const slot = {
    operationId: "10000000-0000-4000-8000-000000000006",
    personId: "10000000-0000-4000-8000-000000000007",
    displayName: "  New Traveler  ",
  };
  state.nodes.find((node) => node.createFields)!.createFields.onTravelers([slot]);
  render();
  button("createTripV2.create").onPress();
  await flush();
  const inputValue = vi.mocked(repo.createTrip).mock.calls[0][0];
  expect(inputValue).toMatchObject({
    syncFormatVersion: 2,
    cloudTravelers: {
      dataOwnership: "CLOUD_SHARED_AUTHORED",
      slots: [{ ...slot, displayName: "New Traveler" }],
    },
  });
  expect(inputValue).not.toHaveProperty("travelers");
});

it("forwards the saved-item revision to Preparation without remounting the workspace", async () => {
  const repo = repository([trip("local-a", "Local A")]);
  state.repo.mockResolvedValue(repo);
  props.tripId = "local-a";
  render();
  await flush();
  render();
  expect(state.preparation.refreshKey).toBe(0);
  const initial = state.refs;
  (props as any).refreshKey = 1;
  render();
  expect(state.preparation.refreshKey).toBe(1);
  expect(state.refs).toBe(initial);
  delete (props as any).refreshKey;
});

it("waits for the account apply snapshot before opening the new account Trip repository", async () => {
  let finish!: (value: any) => void;
  vi.mocked(readLocalAuthSnapshot).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const repo = repository();
  state.repo.mockResolvedValue(repo);
  render();
  await flush();
  expect(state.repo).not.toHaveBeenCalled();
  finish({ session: null, principal: { kind: "SIGNED_OUT" } });
  await flush();
  expect(repo.listTrips).toHaveBeenCalledOnce();
  expect(render()).not.toContain("localTrip.unavailable");
});
