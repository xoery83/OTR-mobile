// TEMP QA-tool caller test: explicit mocked normal-reader inputs, not certificate/Auth evidence.
import { Children, isValidElement, type ReactNode, type ReactElement } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { TripScreen } from "./TripScreen";
import { DayFeed } from "./DayFeed";
import { JourneySnapshotWidget } from "./JourneySnapshotWidget";
import { LocalTripWorkspace } from "./LocalTripWorkspace";
import { createDefaultManualPlanRepository } from "@/data/repositories/manualPlanRepository";
import { createDefaultManualStayRepository } from "@/data/repositories/manualStayRepository";
vi.mock("@/data/repositories/dayNavigationBookmarkRepository", () => ({
  dayNavigationBookmarkRepository: {
    list: vi.fn(async () => []),
    record: vi.fn(async () => []),
  },
}));
const reference = "b61a0000-0061-4000-8000-000000000001";
const actor = "3a44420f-ec2b-4d7e-9770-410a5ed5e77e";
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  setOptions: vi.fn(),
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  callbackCursor: 0,
  callbacks: [] as { deps: readonly unknown[]; callback: unknown }[],
  mount: true,
  focused: true,
  navigation: null as any,
  effects: [] as (() => void)[],
  liveGeneration: 5,
  renderedGeneration: 5,
  view: { tripId: "", date: "2027-02-06", zone: "Asia/Tokyo", generation: 5 },
  result: null as any,
  read: vi.fn(),
  discovery: [] as any[],
  snapshot: null as any,
  snapshotRead: vi.fn(),
  resolveLocalItem: vi.fn(),
  resolveDay: vi.fn(),
  select: vi.fn(),
  enterHeader: vi.fn(),
  saveReading: vi.fn(),
  switchTrip: vi.fn(),
  params: vi.fn(),
  push: vi.fn(),
  navigate: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  canGoBack: true,
  routeTrip: null as string | null,
  routeMode: "home" as "home" | "day",
  headerHeight: 103,
  shellVisibleDates: null as null | { first: string; last: string },
  appActive: null as (() => void) | null,
  resume: null as any,
  quickActions: null as any,
  observeShellScroll: vi.fn(),
  observeReadingMotion: vi.fn(),
}));
vi.mock("@/data/repositories/tripDiscoveryRepository", () => ({
  readLocalTripDiscoveryRepository: async () => ({
    readMerged: async () => ({ trips: state.discovery }),
  }),
}));
vi.mock("./DayFeedCalendarSheet", () => ({
  DayFeedCalendarSheet: () => null,
  dayFeedCalendarBounds: (start?: string, end?: string) =>
    start && end && start <= end ? { start, end } : null,
}));
vi.mock("./DayFeedShell", () => ({
  DayFeedIntroduction: () => null,
  DayFeedShellTitle: () => null,
  formatDayFeedVisibleDates: () => "visible dates",
  useDayFeedShellState: () => ({
    navigationVisible: true,
    visibleDates: state.shellVisibleDates,
    observeScroll: state.observeShellScroll,
    observeReadingMotion: state.observeReadingMotion,
    observeVisibleDates: vi.fn(),
  }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: () => state.renderedGeneration,
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    const i = state.callbackCursor++;
    const previous = state.callbacks[i];
    if (
      !previous ||
      previous.deps.length !== deps.length ||
      deps.some((value, index) => !Object.is(value, previous.deps[index]))
    )
      state.callbacks[i] = { callback, deps };
    return state.callbacks[i].callback;
  },
  useLayoutEffect: (callback: () => void) => {
    if (state.mount) state.effects.push(callback);
  },
  useEffect: (callback: () => void) => {
    if (state.mount) state.effects.push(callback);
  },
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks))
      state.hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      state.hooks[i],
      (next: unknown) => {
        state.hooks[i] = typeof next === "function" ? next(state.hooks[i]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  Modal: "Modal",
  StyleSheet: { create: (s: unknown) => s },
  AppState: {
    addEventListener: (_: string, onChange: (state: string) => void) => {
      state.appActive = () => onChange("active");
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: () => state.headerHeight,
}));
vi.mock("@/ui/useBottomShellHeight", () => ({ useBottomShellHeight: () => 90 }));
vi.mock("expo-router", () => ({
  usePathname: () => "/trip-home",
  useNavigation: () => state.navigation,
  useFocusEffect: (callback: () => void) => {
    if (state.mount && state.focused) state.effects.push(callback);
  },
  useLocalSearchParams: () => ({
    tripId: state.routeTrip ?? state.view.tripId,
    date: state.view.date,
    zone: state.view.zone ?? "",
    viewMode: (state.view as any).viewMode,
    view: state.routeMode,
  }),
  router: {
    setParams: (...args: any[]) => state.params(...args),
    navigate: (...args: any[]) => state.navigate(...args),
    push: (...args: any[]) => state.push(...args),
    back: () => state.back(),
    replace: (...args: any[]) => state.replace(...args),
    canGoBack: () => state.canGoBack,
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.liveGeneration,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/tripDayFeedRepository", () => ({
  readTripDayFeed: async () => ({ trip: state.read }),
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiNumber: (value: number) => String(value),
  formatUiDate: (value: Date) => value.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: () => ({}),
  useUiTheme: () => ({
    transparent: "transparent",
    surface: "surface",
    floatingSurface: "floatingSurface",
    background: "background",
  }),
}));
vi.mock("./TodaysJourneyWidget", () => ({ TodaysJourneyWidget: "TodaysJourney" }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "ThemedText" }));
vi.mock("@/ui/forms", () => ({ UiTextInput: "Input", UiChoiceChip: "Choice" }));
vi.mock("./LocalTripWorkspace", () => ({ LocalTripWorkspace: "Workspace" }));
vi.mock("./coreExperienceRenderer", () => ({
  createCoreExperienceRenderer: () => undefined,
}));
vi.mock("./JourneySnapshotWidget", () => ({ JourneySnapshotWidget: "Snapshot" }));
vi.mock("@/data/repositories/tripJourneySnapshotRepository", () => ({
  readTripJourneySnapshot: async () => ({
    read: state.snapshotRead,
    resolveDayContext: state.resolveDay,
  }),
}));
vi.mock("./LocalCoreItemPreview", () => ({ LocalCoreItemPreview: "LocalItemPreview" }));
vi.mock("./P1PlanEditor", () => ({ P1PlanEditor: "PlanEditor" }));
vi.mock("./P3StayEditor", () => ({ P3StayEditor: "StayEditor" }));
vi.mock("@/data/repositories/manualPlanRepository", () => ({
  createDefaultManualPlanRepository: vi.fn(),
}));
vi.mock("@/data/repositories/manualStayRepository", () => ({
  createDefaultManualStayRepository: vi.fn(),
}));
vi.mock("@/data/repositories/tripTodaysJourneyRepository", () => ({
  readTripTodaysJourney: async () => ({ resolveLocalItem: state.resolveLocalItem }),
}));
vi.mock("./DayFeed", () => ({ DayFeed: () => null }));
vi.mock("./TripViewContext", async (original) => ({
  ...(await original<typeof import("./TripViewContext")>()),
  useTripView: () => ({
    view: state.view,
    select: state.select,
    switchTrip: state.switchTrip,
    resumeView: state.resume,
    entry: undefined,
    saveReading: state.saveReading,
    enterHeader: state.enterHeader,
    publishDayShellChrome: vi.fn(),
    quickActions: state.quickActions,
  }),
}));
function render(contentFrameManaged = false) {
  state.cursor = state.refCursor = state.callbackCursor = 0;
  const outer = TripScreen({ contentFrameManaged });
  const content = outer.type as (props: typeof outer.props) => ReactElement;
  const node = content(outer.props);
  for (const effect of state.effects.splice(0)) effect();
  state.mount = false;
  return node;
}
function find(node: ReactNode, type: any): any {
  if (!isValidElement(node)) return null;
  if (node.type === type) return node.props;
  for (const child of Children.toArray(
    (node.props as { children?: ReactNode }).children,
  )) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}
async function loaded(contentFrameManaged = false) {
  render(contentFrameManaged);
  await new Promise<void>((resolve) => setImmediate(resolve));
  return render(contentFrameManaged);
}
beforeEach(() => {
  state.observeShellScroll.mockClear();
  state.observeReadingMotion.mockClear();
  vi.stubGlobal("__DEV__", true);
  state.appActive = null;
  state.discovery = [];
  state.quickActions = null;
  state.focused = true;
  state.navigation = { setOptions: state.setOptions, isFocused: () => state.focused };
  state.routeMode = "home";
  state.headerHeight = 103;
  state.shellVisibleDates = null;
  state.routeTrip = null;
  state.hooks = [];
  state.callbacks = [];
  state.refs = [];
  state.cursor = state.refCursor = state.callbackCursor = 0;
  state.mount = true;
  state.effects = [];
  state.liveGeneration = state.renderedGeneration = 5;
  state.view = {
    tripId: reference,
    date: "2027-02-06",
    zone: "Asia/Tokyo",
    generation: 5,
  };
  state.result = {
    scope: { accountId: actor, generation: 5 },
    observed: {
      sourceStatus: "CURRENTLY_MATCHES_SOURCE",
      projection: {
        version: 2,
        accountId: actor,
        tripId: reference,
        generation: 1,
        source: { epoch: "epoch" },
        events: [],
        items: [],
        flightFacts: {},
        query: (date: string, zone: string) => ({
          date,
          zone,
          timed: [],
          nonComparable: [],
          unresolved: [],
        }),
      },
    },
    services: {},
  };
  state.read.mockReset().mockImplementation(async () => state.result);
  state.snapshot = {
    scope: { accountId: actor, tripId: reference, generation: 5 },
    epoch: "epoch",
    candidateDays: ["2026-01-01"],
    snapshot: { tags: [] },
  };
  state.snapshotRead.mockReset().mockImplementation(async () => state.snapshot);
  state.resolveDay.mockReset().mockResolvedValue({
    scope: state.snapshot.scope,
    date: "2026-01-01",
    zone: "Asia/Tokyo",
  });
  state.resolveLocalItem.mockReset();
  state.select.mockReset();
  state.enterHeader.mockReset();
  state.saveReading.mockReset();
  state.switchTrip.mockReset();
  state.params.mockReset();
  state.push.mockReset();
  state.navigate.mockReset();
  state.back.mockReset();
  state.replace.mockReset();
  state.canGoBack = true;
  state.resume = null;
});
afterEach(() => vi.unstubAllGlobals());

const page = (node: ReactNode) =>
  find(node, LocalTripWorkspace)?.widgetsForHome(reference, "Past")[0];
it("pushes Home without replacing My Trips params and returns through the native stack", async () => {
  state.view.tripId = "";
  const workspace = find(await loaded(), LocalTripWorkspace);
  workspace.onOpen(reference);
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: { tripId: reference, view: "home" },
  });
  expect(state.params).not.toHaveBeenCalled();
  workspace.onBackToTrips();
  expect(state.back).toHaveBeenCalledOnce();
  state.canGoBack = false;
  workspace.onBackToTrips();
  expect(state.replace).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { view: "trips", tripId: "" },
  });
});
it("marks the Today destination explicitly so the ordinary root stays My Trips", async () => {
  const workspace = find(await loaded(), LocalTripWorkspace);
  workspace.onOpenToday(reference, { date: "2027-02-06", zone: "Asia/Tokyo" });
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/trip-home",
    params: { view: "day", tripId: reference, date: "2027-02-06", zone: "Asia/Tokyo" },
  });
  expect(state.saveReading).not.toHaveBeenCalled();
});
it("connects only a current owning Snapshot page and disables Review without a lawful saved zone", async () => {
  const p = page(await loaded());
  expect(p.id).toBe("journey-snapshot");
  expect(p.content.type).toBe(JourneySnapshotWidget);
  expect(p.content.props.onReviewItinerary).toBeUndefined();
});
it.each(["null", "epoch", "foreign"])(
  "omits the Snapshot when owning data is %s",
  async (kind) => {
    if (kind === "null") state.snapshot = null;
    if (kind === "epoch") state.snapshot.epoch = "stale";
    if (kind === "foreign") state.snapshot.scope.accountId = "other";
    expect(page(await loaded())).toBeUndefined();
  },
);
it("Review rechecks whole candidate graph and enters its first qualified header without writing Day reading", async () => {
  state.resume = { tripId: reference, zone: "Asia/Tokyo", generation: 5 };
  const p = page(await loaded());
  await p.content.props.onReviewItinerary(state.snapshot);
  expect(state.resolveDay).toHaveBeenCalledWith(
    reference,
    "epoch",
    "2026-01-01",
    "Asia/Tokyo",
  );
  expect(state.enterHeader).toHaveBeenCalledWith(
    { tripId: reference, date: "2026-01-01", zone: "Asia/Tokyo", generation: 5 },
    "FIRST_VALID_PAST_DAY_HEADER",
  );
  expect(state.saveReading).not.toHaveBeenCalled();
  expect(state.select).not.toHaveBeenCalled();
});
it("direct current P6 Item uses the existing Immersive port and closes without changing Home or Day bookmark", async () => {
  const event = {
    id: "item",
    status: "planned",
    boundaries: [{ zone_id: "Asia/Tokyo", local_date: "2026-01-01" }],
  };
  state.result.observed.projection.events = [event];
  state.result.observed.projection.items = [
    { itemId: "item", itemRevision: 1, family: "P6" },
  ];
  state.result.observed.projection.query = () => ({
    timed: [{ event }],
    nonComparable: [],
  });
  const p = page(await loaded());
  await p.content.props.onOpenItem({
    scope: state.snapshot.scope,
    certificate: { epoch: "epoch" },
    item: { itemId: "item", itemRevision: 1 },
  });
  const overlay = find(render(), DayFeed);
  expect(overlay.directItem.itemId).toBe("item");
  overlay.directItem.onClose();
  expect(find(render(), DayFeed)).toBeNull();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.saveReading).not.toHaveBeenCalled();
  expect(state.switchTrip).not.toHaveBeenCalled();
  expect(state.params).not.toHaveBeenCalled();
});
it("a generation drift after async target read refuses an old tag without navigation", async () => {
  const p = page(await loaded());
  state.read.mockImplementation(async () => {
    state.liveGeneration = 6;
    return state.result;
  });
  await expect(
    p.content.props.onOpenItem({
      scope: state.snapshot.scope,
      certificate: { epoch: "epoch" },
      item: { itemId: "item", itemRevision: 1 },
    }),
  ).rejects.toThrow("HOME_NAV_UNAVAILABLE");
  expect(state.params).not.toHaveBeenCalled();
});

it("reviewer: current same-epoch access/item removal closes the Home direct Immersive", async () => {
  const event = {
    id: "item",
    status: "planned",
    boundaries: [{ zone_id: "Asia/Tokyo", local_date: "2026-01-01" }],
  };
  state.result.observed.projection.events = [event];
  state.result.observed.projection.items = [
    { itemId: "item", itemRevision: 1, family: "P6" },
  ];
  state.result.observed.projection.query = () => ({
    timed: [{ event }],
    nonComparable: [],
  });
  const p = page(await loaded());
  await p.content.props.onOpenItem({
    scope: state.snapshot.scope,
    certificate: { epoch: "epoch" },
    item: { itemId: "item", itemRevision: 1 },
  });
  expect(find(render(), DayFeed)).not.toBeNull();
  // Current owning reader returns a newly authorized snapshot in the SAME Trip epoch.
  state.result = {
    ...state.result,
    observed: {
      ...state.result.observed,
      projection: {
        ...state.result.observed.projection,
        items: [],
        events: [],
        query: () => ({ timed: [], nonComparable: [] }),
      },
    },
  };
  state.appActive!();
  for (let i = 0; i < 24; i++) await Promise.resolve();
  expect(find(render(), DayFeed)).toBeNull();
});

it.each(["revision", "hidden", "historical"])(
  "current same-epoch %s change withholds old Home Immersive",
  async (kind) => {
    const event = {
      id: "item",
      status: "planned",
      boundaries: [{ zone_id: "Asia/Tokyo", local_date: "2026-01-01" }],
    };
    state.result.observed.projection.events = [event];
    state.result.observed.projection.items = [
      { itemId: "item", itemRevision: 1, family: "P6" },
    ];
    state.result.observed.projection.query = () => ({
      timed: [{ event }],
      nonComparable: [],
    });
    const p = page(await loaded());
    await p.content.props.onOpenItem({
      scope: state.snapshot.scope,
      certificate: { epoch: "epoch" },
      item: { itemId: "item", itemRevision: 1 },
    });
    state.result = {
      ...state.result,
      observed: {
        ...state.result.observed,
        sourceStatus:
          kind === "historical"
            ? "HISTORICAL_ACCEPTED_PROJECTION"
            : "CURRENTLY_MATCHES_SOURCE",
        projection: {
          ...state.result.observed.projection,
          items: [
            {
              itemId: "item",
              itemRevision: kind === "revision" ? 2 : 1,
              family: "P6",
              hidden: kind === "hidden",
            },
          ],
        },
      },
    };
    state.appActive!();
    for (let i = 0; i < 24; i++) await Promise.resolve();
    expect(find(render(), DayFeed)).toBeNull();
    expect(state.saveReading).not.toHaveBeenCalled();
  },
);
it("same-epoch authorized overlay uses the refreshed owning projection and services", async () => {
  const event = {
    id: "item",
    status: "planned",
    boundaries: [{ zone_id: "Asia/Tokyo", local_date: "2026-01-01" }],
  };
  state.result.observed.projection.events = [event];
  state.result.observed.projection.items = [
    { itemId: "item", itemRevision: 1, family: "P6" },
  ];
  state.result.observed.projection.query = () => ({
    timed: [{ event }],
    nonComparable: [],
  });
  const p = page(await loaded());
  await p.content.props.onOpenItem({
    scope: state.snapshot.scope,
    certificate: { epoch: "epoch" },
    item: { itemId: "item", itemRevision: 1 },
  });
  state.result = {
    ...state.result,
    services: { updated: [] },
    observed: {
      ...state.result.observed,
      projection: { ...state.result.observed.projection },
    },
  };
  state.appActive!();
  for (let i = 0; i < 24; i++) await Promise.resolve();
  const overlay = find(render(), DayFeed);
  expect(overlay.projection).toBe(state.result.observed.projection);
  expect(overlay.services).toBe(state.result.services);
  expect(state.saveReading).not.toHaveBeenCalled();
});
it("opens a cross-date civil-only P6 using the same-Trip saved presentation zone, without changing its facts or bookmark", async () => {
  state.resume = { tripId: reference, zone: "Asia/Tokyo", generation: 5 };
  const event = {
    id: "booking",
    status: "planned",
    boundaries: [{ zone_id: null, local_date: "2027-02-07" }],
  };
  state.result.observed.projection.events = [event];
  state.result.observed.projection.items = [
    { itemId: "booking", itemRevision: 1, family: "P6" },
  ];
  state.result.observed.projection.query = (date: string, zone: string) => ({
    timed: [],
    nonComparable: date === "2027-02-07" && zone === "Asia/Tokyo" ? [{ event }] : [],
  });
  const p = page(await loaded());
  await p.content.props.onOpenItem({
    scope: state.snapshot.scope,
    certificate: { epoch: "epoch" },
    item: { itemId: "booking", itemRevision: 1 },
  });
  const overlay = find(render(), DayFeed);
  expect(overlay.date).toBe("2027-02-07");
  expect(overlay.zone).toBe("Asia/Tokyo");
  expect(overlay.directItem.itemId).toBe("booking");
  expect(event.boundaries[0].zone_id).toBeNull();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.saveReading).not.toHaveBeenCalled();
  expect(state.params).not.toHaveBeenCalled();
});
it.each([
  null,
  { tripId: "foreign", zone: "Asia/Tokyo", generation: 5 },
  { tripId: reference, zone: "Asia/Tokyo", generation: 4 },
])(
  "does not borrow a missing, foreign or stale saved zone for civil-only tags",
  async (resume) => {
    state.resume = resume;
    const event = {
      id: "booking",
      status: "planned",
      boundaries: [{ zone_id: null, local_date: "2027-02-07" }],
    };
    state.result.observed.projection.events = [event];
    state.result.observed.projection.items = [{ itemId: "booking", itemRevision: 1 }];
    const p = page(await loaded());
    await expect(
      p.content.props.onOpenItem({
        scope: state.snapshot.scope,
        certificate: { epoch: "epoch" },
        item: { itemId: "booking", itemRevision: 1 },
      }),
    ).rejects.toThrow("HOME_ITEM_DATE_UNAVAILABLE");
    expect(find(render(), DayFeed)).toBeNull();
  },
);

it("normal Day uses the full owning calendar only for current matching actor/generation/epoch", async () => {
  state.routeMode = "day";
  state.snapshot.trip = { startDate: "2027-02-01", endDate: "2027-02-12" };
  state.snapshot.candidateDays = ["2027-02-01", "2027-02-12"];
  const feed = find(await loaded(), DayFeed);
  expect(feed?.dates).toHaveLength(12);
  expect(feed?.dates[0]).toBe("2027-02-01");
  expect(feed?.dates[11]).toBe("2027-02-12");
  expect(feed?.zone).toBe("Asia/Tokyo");
  expect(state.saveReading).not.toHaveBeenCalled();
  state.snapshot.scope.accountId = "foreign";
  state.appActive!();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(find(render(), DayFeed)?.dates).toEqual([state.view.date]);
});

vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));

it("Home Day action enters the saved plan directly without a date/zone sheet", async () => {
  const node = await loaded();
  expect(find(node, "Modal")).toBeNull();
  expect(JSON.stringify(node)).not.toContain("dayFeed.admitted");
  const workspace = find(node, LocalTripWorkspace);
  workspace.onChooseDay();
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.params).toHaveBeenCalledWith({
    tripId: reference,
    date: "2027-02-06",
    zone: "Asia/Tokyo",
    viewMode: "NAMED_ZONE",
    view: "day",
  });
  expect(find(render(), "Modal")).toBeNull();
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

it("Day entry prefers Trip start over item dates when no saved or explicit date exists", async () => {
  state.view = { ...state.view, tripId: "other", date: "", zone: "" };
  state.routeTrip = reference;
  const workspace = find(await loaded(), LocalTripWorkspace);
  workspace.onChooseDay("2026-10-16");
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.params).toHaveBeenCalledWith({
    tripId: reference,
    date: "2026-10-16",
    zone: "",
    viewMode: "FLOATING",
    view: "day",
  });
  expect(state.select).toHaveBeenCalledWith({
    tripId: reference,
    date: "2026-10-16",
    zone: null,
    viewMode: "FLOATING",
    generation: 5,
  });
  state.view = state.select.mock.lastCall![0];
  state.params.mockClear();
  state.liveGeneration = 6;
  workspace.onChooseDay("2026-10-16");
  expect(state.params).not.toHaveBeenCalled();
});
it("unknown-zone legacy accepted Day retains its owning projection and renderer", async () => {
  state.routeMode = "day";
  state.view.zone = "";
  state.result.observed.projection.version = 1;
  const feed = find(await loaded(), DayFeed);
  expect(feed.projection).toBe(state.result.observed.projection);
  expect(feed.zone).toBe("");
  expect(feed.date).toBe("2027-02-06");
});
it("an undated Trip opens an empty Day page with date selection inside the page", async () => {
  state.routeMode = "day";
  state.view = { ...state.view, date: "", zone: "" };
  state.snapshot = null;
  const page = await loaded();
  expect(find(page, "Modal")).toBeNull();
  expect(find(page, LocalTripWorkspace)).toBeNull();
  expect(find(page, "Input").accessibilityLabel).toBe("dayFeed.date");
});

it("switches the My Trips native title only after the body heading leaves, reverses on return, and reserves shell space", async () => {
  state.view.tripId = "";
  state.setOptions.mockClear();
  const node = await loaded();
  const scroll = find(node, "ScrollView");
  const heading = find(node, "Text");
  expect(
    scroll.contentContainerStyle.find((style: any) => style?.paddingBottom)
      ?.paddingBottom,
  ).toBe(106);
  expect(scroll.scrollIndicatorInsets.bottom).toBe(90);
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "myTrips.appTitle",
  );
  heading.onLayout({ nativeEvent: { layout: { y: 16, height: 32 } } });
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 47 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "myTrips.appTitle",
  );
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 48 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "dayFeed.myTrips",
  );
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "myTrips.appTitle",
  );
});

it("keeps status information readable after the measured Hero scrolls away and on return", async () => {
  state.discovery = [{ id: reference, name: "Actual saved Trip" }];
  const node = await loaded();
  find(node, LocalTripWorkspace).onHomeHeroHeight(300);
  const scroll = find(node, "ScrollView");
  expect(state.setOptions.mock.lastCall?.[0].statusBarStyle).toBe("light");
  expect(state.setOptions.mock.lastCall?.[0].headerTransparent).toBe(true);
  expect(state.setOptions.mock.lastCall?.[0].headerStyle.backgroundColor).toBe(
    "transparent",
  );
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 196 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerStyle.backgroundColor).toBe(
    "transparent",
  );
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 197 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerStyle.backgroundColor).toBe(
    "transparent",
  );
  expect(state.setOptions.mock.lastCall?.[0].headerBlurEffect).toBeUndefined();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "Actual saved Trip",
  );
  expect(state.setOptions.mock.lastCall?.[0].headerTransparent).toBe(true);
  state.quickActions = {
    tripId: reference,
    generation: 5,
    tripName: "Locally edited Trip",
  };
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "Locally edited Trip",
  );
  state.quickActions = { tripId: "other-trip", generation: 5, tripName: "Other Trip" };
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe(
    "Actual saved Trip",
  );
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 242 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].statusBarStyle).toBe("auto");
  find(node, LocalTripWorkspace).onHomeHeroHeight(500);
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].statusBarStyle).toBe("light");
  find(node, LocalTripWorkspace).onHomeHeroHeight(300);
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].statusBarStyle).toBe("auto");
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].statusBarStyle).toBe("light");
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({}).props.children).toBe("");
  expect(state.setOptions.mock.lastCall?.[0].headerBlurEffect).toBeUndefined();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.saveReading).not.toHaveBeenCalled();
});

function localRead() {
  return {
    scope: { accountId: actor, tripId: reference, generation: 5 },
    source: { kind: "LOCAL_MANUAL_COMMITTED", fingerprint: "pending-fingerprint" },
    items: [
      {
        itemId: "manual-hotel",
        itemRevision: 1,
        family: "P3",
        title: "Actual saved hotel",
        localState: "PENDING",
        schedule: {
          start: { localDate: "2026-10-16" },
          end: { localDate: "2026-10-17" },
        },
        details: {},
      },
    ],
    rows: () => [],
  };
}
it("a genuine local read selects explicit Floating context and connects actual reading", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.result.localManualStatus = "AVAILABLE";
  state.view.zone = "";
  const workspace = find(await loaded(), LocalTripWorkspace);
  expect(workspace.onChooseDay).toBeTypeOf("function");
  workspace.onChooseDay();
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.params).toHaveBeenCalledWith({
    tripId: reference,
    date: "2027-02-06",
    zone: "",
    viewMode: "FLOATING",
    view: "day",
  });
  expect(state.select).toHaveBeenCalledWith({
    tripId: reference,
    date: "2027-02-06",
    zone: null,
    viewMode: "FLOATING",
    generation: 5,
  });
  state.view = state.select.mock.lastCall![0];
  state.routeMode = "day";
  const feed = find(render(), DayFeed);
  expect(feed.bottomInset).toBe(90);
  expect(feed.localManual).toBe(state.result.localManual);
  expect(feed.projection).toBeUndefined();
  expect(feed.zone).toBeNull();
  expect(feed.viewMode).toBe("FLOATING");
  expect(feed.onReadingChange).toBeTypeOf("function");
});
it("accepted Day passes pending increments into the original normal feed and save refreshes Today with generation fence", async () => {
  state.result.localManual = localRead();
  const workspace = find(await loaded(), LocalTripWorkspace);
  const before = workspace.widgetsForHome(reference, "Active")[0].content.props;
  expect(before.refreshKey).toBe(0);
  workspace.onManualItemSaved(reference, 5);
  for (let i = 0; i < 16; i++) await Promise.resolve();
  const after = find(render(), LocalTripWorkspace).widgetsForHome(reference, "Active")[0]
    .content.props;
  expect(after.refreshKey).toBe(1);
  workspace.onManualItemSaved(reference, 4);
  expect(
    find(render(), LocalTripWorkspace).widgetsForHome(reference, "Active")[0].content
      .props.refreshKey,
  ).toBe(1);
  state.routeMode = "day";
  const feed = find(render(), DayFeed);
  expect(feed.projection).toBe(state.result.observed.projection);
  expect(feed.bottomInset).toBe(90);
  expect(feed.localManual).toBe(state.result.localManual);
});
it("Today reuses only same Trip/generation saved zone and rejects stale local source before navigation", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.view.zone = "Asia/Tokyo";
  const workspace = find(await loaded(), LocalTripWorkspace);
  const today = workspace.widgetsForHome(reference, "Active")[0].content.props;
  expect(today.zone).toBe("Asia/Tokyo");
  state.result = {
    ...state.result,
    localManual: {
      ...state.result.localManual,
      source: { ...state.result.localManual.source, fingerprint: "changed" },
    },
  };
  await expect(
    today.onOpenLocalToday({
      ...localRead(),
      today: { date: "2026-10-16", zone: "Asia/Tokyo" },
    }),
  ).rejects.toThrow("LOCAL_NAV_UNAVAILABLE");
  expect(state.navigate).not.toHaveBeenCalled();
});
it("local Day Item opens actual readonly Core Item preview after owning reread, and refresh removes a stale preview", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.routeMode = "day";
  state.view.zone = "";
  const resolved = { ...localRead(), item: localRead().items[0] };
  state.resolveLocalItem.mockResolvedValue(resolved);
  const feed = find(await loaded(), DayFeed);
  feed.onOpenLocalItem("manual-hotel", localRead());
  for (let i = 0; i < 24; i++) await Promise.resolve();
  expect(state.resolveLocalItem).toHaveBeenCalledWith(
    reference,
    "manual-hotel",
    expect.objectContaining({ scope: localRead().scope, source: localRead().source }),
  );
  expect(find(render(), "LocalItemPreview").item.title).toBe("Actual saved hotel");
  state.result = {
    ...state.result,
    localManual: {
      ...localRead(),
      source: { kind: "LOCAL_MANUAL_COMMITTED", fingerprint: "changed" },
    },
  };
  state.appActive!();
  for (let i = 0; i < 24; i++) await Promise.resolve();
  expect(find(render(), "LocalItemPreview")).toBeNull();
});
it("normal accepted deep-link read establishes Shell Trip scope only after repository validation", async () => {
  state.routeTrip = reference;
  state.view = { ...state.view, tripId: "other-trip" };
  await loaded();
  expect(state.switchTrip).toHaveBeenCalledWith(reference, 5);
  expect(state.switchTrip).not.toHaveBeenCalledWith("other-trip", 5);
});
it("unvalidated raw Trip URL never establishes Shell context or local Day capability", async () => {
  state.routeTrip = reference;
  state.view = { ...state.view, tripId: "other-trip" };
  state.result.observed = null;
  const workspace = find(await loaded(), LocalTripWorkspace);
  expect(state.switchTrip).not.toHaveBeenCalled();
  expect(workspace.onChooseDay).toBeUndefined();
});

it("Today saved-zone fallback accepts only same Trip/current generation and never raw URL timezone", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.routeTrip = reference;
  state.view = { ...state.view, tripId: "other-trip", zone: "America/New_York" };
  state.resume = { tripId: reference, generation: 5, zone: "Pacific/Auckland" };
  let node = await loaded();
  expect(
    find(node, LocalTripWorkspace).widgetsForHome(reference, "Active")[0].content.props
      .zone,
  ).toBe("Pacific/Auckland");
  state.resume = { ...state.resume, generation: 4 };
  node = render();
  expect(
    find(node, LocalTripWorkspace).widgetsForHome(reference, "Active")[0].content.props
      .zone,
  ).toBeNull();
});

it("opens an explicitly planned local Day without inventing a timezone-bearing context", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.view.zone = "";
  state.view.date = "2026-10-16";
  const workspace = find(await loaded(), LocalTripWorkspace);
  const today = workspace.widgetsForHome(reference, "Active", "2026-10-01")[0].content
    .props;
  expect(today.zone).toBeNull();
  expect(today.planningDate).toBe("2026-10-16");
  await today.onOpenLocalToday({
    ...localRead(),
    today: { date: "2026-10-16", zone: null },
  });
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      params: expect.objectContaining({ date: "2026-10-16", zone: "", view: "day" }),
    }),
  );
});

it("keeps the Day action stable across quick-action publication rerenders", async () => {
  const initial = find(await loaded(), LocalTripWorkspace).onChooseDay;
  expect(initial).toBeTypeOf("function");
  for (let i = 0; i < 8; i++)
    expect(find(render(), LocalTripWorkspace).onChooseDay).toBe(initial);
  state.view = { ...state.view, date: "2027-02-07" };
  const changed = find(render(), LocalTripWorkspace).onChooseDay;
  expect(changed).not.toBe(initial);
  changed();
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.params).toHaveBeenCalledWith(
    expect.objectContaining({ date: "2027-02-07", view: "day" }),
  );
});

it("a retained unfocused Trip cannot replace the active working Trip", async () => {
  const workspace = find(await loaded(), LocalTripWorkspace);
  state.switchTrip.mockClear();
  state.focused = false;
  workspace.onKnownTrip("LOCAL");
  expect(state.switchTrip).not.toHaveBeenCalled();
  state.focused = true;
  find(render(), LocalTripWorkspace).onKnownTrip("LOCAL");
  expect(state.switchTrip).toHaveBeenCalledWith(reference, 5);
});
it("a blurred Trip with a late Day read cannot switch the new active Trip", async () => {
  let finish!: (value: unknown) => void;
  state.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  state.switchTrip.mockClear();
  state.view.tripId = "new-active-trip";
  state.routeTrip = reference;
  render();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  state.focused = false;
  finish(state.result);
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.switchTrip).not.toHaveBeenCalled();
});

it("keeps native compensation out of Shell direction and resets only at the whole-feed top", async () => {
  state.routeMode = "day";
  const feed = find(await loaded(), DayFeed);
  feed.presentation.onOffsetChange(899.6667);
  const viewport = {
    firstVisibleDate: "2027-02-06",
    lastVisibleDate: "2027-02-06",
    originIndex: 34,
    scrollOffset: 0,
  };
  feed.presentation.onViewportChange(viewport);
  expect(state.observeShellScroll).not.toHaveBeenCalled();
  feed.presentation.onReadingMotion(40);
  expect(state.observeReadingMotion).toHaveBeenCalledWith(40);
  feed.presentation.onViewportChange({ ...viewport, originIndex: 0 });
  expect(state.observeShellScroll).toHaveBeenCalledWith(0, false);
});

it("local-only calendar range has a real empty Header target, without optimistic date acknowledgement", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.routeMode = "day";
  state.view.zone = "";
  state.discovery = [
    {
      id: reference,
      name: "Local trip",
      startDate: "2027-02-01",
      endDate: "2027-02-12",
      destination: null,
    },
  ];
  const tree = await loaded();
  const feed = find(tree, DayFeed);
  expect(feed.dates).toContain("2027-02-07");
  expect(feed.dates.filter((date: string) => date.startsWith("2027-02-"))).toHaveLength(
    12,
  );
  expect(feed.dates).toContain("2026-10-16");
});
it("historical accepted Day keeps the original localized disclosure", async () => {
  state.routeMode = "day";
  state.result.observed.sourceStatus = "HISTORICAL_ACCEPTED_PROJECTION";
  const feed = find(await loaded(), DayFeed);
  expect(feed.projection).toBe(state.result.observed.projection);
  expect(JSON.stringify(feed.presentation.header)).toContain("dayFeed.historical");
});

it("keeps unresolved Day entry in its loading shell rather than the legacy Today/Home fallback", () => {
  state.routeMode = "day";
  const node = render();
  expect(find(node, "ScrollView")).toBeNull();
  expect(find(node, LocalTripWorkspace)).toBeNull();
  expect(find(node, "ThemedText").children).toBe("dayFeed.loading");
});

it("keeps Day header title blank until the actual textual introduction has scrolled off", async () => {
  state.routeMode = "day";
  const feed = find(await loaded(), DayFeed);
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].title).toBe("");
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({})).toBeNull();
  feed.presentation.header.props.onLayout({ nativeEvent: { layout: { height: 303 } } });
  feed.presentation.onOffsetChange(199);
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({})).toBeNull();
  feed.presentation.onOffsetChange(200);
  // Visible dates are supplied by the real list; unresolved dates must not fall back to duplicate Trip name.
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall?.[0].headerTitle({})).toBeNull();
  expect(state.setOptions.mock.lastCall?.[0].headerBlurEffect).toBeUndefined();
});

it("Home returns to the current same-Trip Floating bookmark before its stale entry date", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.view = {
    tripId: reference,
    date: "2027-02-01",
    zone: "Asia/Tokyo",
    generation: 5,
  } as any;
  state.resume = { ...state.view, date: "2027-02-12", zone: null, viewMode: "FLOATING" };
  find(await loaded(), LocalTripWorkspace).onChooseDay();
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.select).toHaveBeenCalledWith({ ...state.resume });
  expect(state.params).toHaveBeenCalledWith({
    tripId: reference,
    date: "2027-02-12",
    zone: "",
    viewMode: "FLOATING",
    view: "day",
  });
});
it("does not discard accepted v1 when a local read coexists with an explicit Floating selection", async () => {
  state.result.observed.projection.version = 1;
  state.result.localManual = localRead();
  state.view = {
    tripId: reference,
    date: "2027-02-06",
    zone: null,
    viewMode: "FLOATING",
    generation: 5,
  } as any;
  const workspace = find(await loaded(), LocalTripWorkspace);
  workspace.onChooseDay();
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.params).not.toHaveBeenCalled();
  state.routeMode = "day";
  expect(find(render(), DayFeed)).toBeNull();
});

it("keeps the native toolbar transparent with a single measured Day boundary", async () => {
  state.routeMode = "day";
  const node = await loaded();
  const options = state.setOptions.mock.lastCall![0];
  expect(options.headerTransparent).toBe(true);
  expect(options.fullScreenGestureEnabled).toBe(false);
  expect(options.headerBlurEffect).toBeUndefined();
  expect(options.headerStyle.backgroundColor).toBe("transparent");
  expect(find(node, DayFeed).presentation.topInset).toBe(103);
});

it("enables the existing native right-swipe only on immersive Home, preserving Day gesture ownership", async () => {
  await loaded();
  expect(state.setOptions.mock.lastCall![0].fullScreenGestureEnabled).toBe(true);
  state.routeMode = "day";
  state.mount = true;
  render();
  expect(state.setOptions.mock.lastCall![0].fullScreenGestureEnabled).toBe(false);
});

it("Preparation local Recent reuses the existing current local detail and Close returns to Home", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  const resolved = { ...localRead(), item: localRead().items[0] };
  state.resolveLocalItem.mockResolvedValue(resolved);
  const workspace = find(await loaded(), LocalTripWorkspace);
  await workspace.onOpenLocalHomeItem(reference, "manual-hotel", localRead());
  expect(state.resolveLocalItem).toHaveBeenCalledWith(
    reference,
    "manual-hotel",
    expect.objectContaining({ scope: localRead().scope, source: localRead().source }),
  );
  const preview = find(render(), "LocalItemPreview");
  expect(preview.item.title).toBe("Actual saved hotel");
  expect(preview.onEdit).toBeTypeOf("function");
  preview.onClose();
  expect(find(render(), "LocalItemPreview")).toBeNull();
  expect(find(render(), LocalTripWorkspace)).not.toBeNull();
  expect(state.push).not.toHaveBeenCalled();
});
it("opens same-ID P1 edit only after the owning repository returns an editable draft", async () => {
  state.result.observed = null;
  const plan = {
    ...localRead().items[0],
    itemId: "manual-plan",
    family: "P1",
    title: "Actual saved plan",
  };
  state.result.localManual = { ...localRead(), items: [plan] };
  state.resolveLocalItem.mockResolvedValue({ ...localRead(), item: plan });
  const draft = {
    mode: "EDIT",
    itemId: "manual-plan",
    fields: {},
    participantOptions: [],
  };
  const repository = { read: vi.fn(async () => draft) };
  vi.mocked(createDefaultManualPlanRepository).mockResolvedValue(repository as any);
  const workspace = find(await loaded(), LocalTripWorkspace);
  await workspace.onOpenLocalHomeItem(reference, "manual-plan", localRead());
  const preview = find(render(), "LocalItemPreview");
  expect(preview.item.itemId).toBe("manual-plan");
  preview.onEdit();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(repository.read).toHaveBeenCalledWith(reference, "manual-plan");
  expect(find(render(), "LocalItemPreview")).toBeNull();
  const editor = find(render(), "PlanEditor");
  expect(editor).toMatchObject({
    tripId: reference,
    itemId: "manual-plan",
    opened: { draft, repository },
  });
  editor.onClose();
  expect(find(render(), "LocalItemPreview").item.itemId).toBe("manual-plan");
});
it("opens same-ID P3 edit only after the owning stay repository returns an editable draft", async () => {
  state.result.observed = null;
  const stay = localRead().items[0];
  state.result.localManual = localRead();
  state.resolveLocalItem.mockResolvedValue({ ...localRead(), item: stay });
  const draft = {
    mode: "EDIT",
    itemId: stay.itemId,
    fields: {},
    participantOptions: [],
  };
  const repository = { read: vi.fn(async () => draft) };
  vi.mocked(createDefaultManualStayRepository).mockResolvedValue(repository as any);
  const workspace = find(await loaded(), LocalTripWorkspace);
  await workspace.onOpenLocalHomeItem(reference, stay.itemId, localRead());
  const preview = find(render(), "LocalItemPreview");
  preview.onEdit();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(repository.read).toHaveBeenCalledWith(reference, stay.itemId);
  expect(find(render(), "LocalItemPreview")).toBeNull();
  const editor = find(render(), "StayEditor");
  expect(editor).toMatchObject({
    tripId: reference,
    itemId: stay.itemId,
    opened: { draft, repository },
  });
  editor.onClose();
  expect(find(render(), "LocalItemPreview").item.itemId).toBe(stay.itemId);
});
it("Preparation local Recent rejects a foreign Trip or late account before invoking local details", async () => {
  const workspace = find(await loaded(), LocalTripWorkspace);
  await workspace.onOpenLocalHomeItem("foreign", "manual-hotel", localRead());
  state.liveGeneration = 6;
  await workspace.onOpenLocalHomeItem(reference, "manual-hotel", localRead());
  expect(state.resolveLocalItem).not.toHaveBeenCalled();
  expect(find(render(), "LocalItemPreview")).toBeNull();
});

it.each([103, 147])(
  "reserves the measured %s native boundary once when the owning Frame is present",
  async (height) => {
    state.routeMode = "day";
    state.headerHeight = height;
    state.shellVisibleDates = { first: "2027-02-01", last: "2027-02-01" };
    const feed = find(await loaded(true), DayFeed);
    expect(feed.presentation.topInset).toBe(0);
    expect(feed.presentation.header.props.style.paddingTop).toBe(0);
    feed.presentation.header.props.onLayout({ nativeEvent: { layout: { height: 92 } } });
    expect(find(render(true), DayFeed).presentation.topInset).toBe(0);
    feed.presentation.onOffsetChange(91);
    state.mount = true;
    render(true);
    expect(state.setOptions.mock.lastCall?.[0].title).toBe("");
    feed.presentation.onOffsetChange(92);
    state.mount = true;
    render(true);
    expect(state.setOptions.mock.lastCall?.[0].title).toBe("visible dates");
    feed.presentation.onOffsetChange(0);
    state.mount = true;
    render(true);
    expect(state.setOptions.mock.lastCall?.[0].title).toBe("");
  },
);
it("retains the measured boundary for a route without an owning Frame", async () => {
  state.routeMode = "day";
  state.headerHeight = 147;
  const feed = find(await loaded(false), DayFeed);
  expect(feed.presentation.topInset).toBe(147);
  expect(feed.presentation.header.props.style.paddingTop).toBe(147);
});
