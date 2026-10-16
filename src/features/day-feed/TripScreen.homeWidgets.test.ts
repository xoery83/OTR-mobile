// TEMP QA-tool caller test: explicit mocked normal-reader inputs, not certificate/Auth evidence.
import { Children, isValidElement, type ReactNode, type ReactElement } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { TripScreen } from "./TripScreen";
import { DayFeed } from "./DayFeed";
import { JourneySnapshotWidget } from "./JourneySnapshotWidget";
import { LocalTripWorkspace } from "./LocalTripWorkspace";
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
  appActive: null as (() => void) | null,
  resume: null as any,
}));
vi.mock("@/data/repositories/tripDiscoveryRepository", () => ({
  readLocalTripDiscoveryRepository: async () => ({
    readMerged: async () => ({ trips: [] }),
  }),
}));
vi.mock("./DayFeedCalendarSheet", () => ({ DayFeedCalendarSheet: () => null }));
vi.mock("./DayFeedShell", () => ({
  DayFeedIntroduction: () => null,
  DayFeedShellTitle: () => null,
  formatDayFeedVisibleDates: () => "visible dates",
  useDayFeedShellState: () => ({
    navigationVisible: true,
    visibleDates: null,
    observeScroll: vi.fn(),
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
vi.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 103 }));
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
    zone: state.view.zone,
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
  formatUiDate: (value: Date) => value.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: () => ({}),
  useUiTheme: () => ({
    transparent: "transparent",
    surface: "surface",
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
  }),
}));
function render() {
  state.cursor = state.refCursor = state.callbackCursor = 0;
  const outer = TripScreen({});
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
async function loaded() {
  render();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return render();
}
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  state.appActive = null;
  state.focused = true;
  state.navigation = { setOptions: state.setOptions, isFocused: () => state.focused };
  state.routeMode = "home";
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
    view: "day",
  });
  expect(state.select).not.toHaveBeenCalled();
  state.params.mockClear();
  state.liveGeneration = 6;
  workspace.onChooseDay("2026-10-16");
  expect(state.params).not.toHaveBeenCalled();
});
it("unknown-zone accepted Day retains its owning projection and renderer", async () => {
  state.routeMode = "day";
  state.view.zone = "";
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
    "background",
  );
  expect(state.setOptions.mock.lastCall?.[0].headerTransparent).toBe(true);
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
it("a genuine local read enters Day directly without accepted projection and date-only route does not create a timezone bookmark", async () => {
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
    view: "day",
  });
  expect(state.select).not.toHaveBeenCalled();
  state.routeMode = "day";
  const feed = find(render(), DayFeed);
  expect(feed.bottomInset).toBe(90);
  expect(feed.localManual).toBe(state.result.localManual);
  expect(feed.projection).toBeUndefined();
  expect(feed.zone).toBe("");
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
