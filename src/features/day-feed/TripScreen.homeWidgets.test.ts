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
  mount: true,
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
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: () => state.renderedGeneration,
  useCallback: (callback: unknown) => callback,
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
vi.mock("@/ui/useBottomShellHeight", () => ({ useBottomShellHeight: () => 90 }));
vi.mock("expo-router", () => ({
  usePathname: () => "/trip-home",
  useNavigation: () => ({ setOptions: state.setOptions }),
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
  useUiTheme: () => ({ transparent: "transparent", surface: "surface" }),
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
  }),
}));
function render() {
  state.cursor = state.refCursor = 0;
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
  for (let i = 0; i < 12; i++) await Promise.resolve();
  return render();
}
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  state.appActive = null;
  state.routeMode = "home";
  state.routeTrip = null;
  state.hooks = [];
  state.refs = [];
  state.cursor = state.refCursor = 0;
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
    pathname: "/",
    params: { view: "day", tripId: reference },
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

it("normal Home hides internal accepted IDs and defers date inputs to the Day action sheet", async () => {
  const node = await loaded();
  expect(find(node, "Modal")?.visible).toBe(false);
  expect(JSON.stringify(node)).not.toContain("dayFeed.admitted");
  expect(JSON.stringify(node)).not.toContain("dayFeed.explicitId");
  const workspace = find(node, LocalTripWorkspace);
  expect(workspace.onChooseDay).toBeTypeOf("function");
  workspace.onChooseDay();
  expect(find(render(), "Modal")?.visible).toBe(true);
  expect(state.select).not.toHaveBeenCalled();
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "div",
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

function choices(node: ReactNode): any[] {
  if (!isValidElement(node)) return [];
  if (node.type === "Choice") return [node.props];
  return Children.toArray((node.props as { children?: ReactNode }).children).flatMap(
    choices,
  );
}
function buttons(node: ReactNode): any[] {
  if (!isValidElement(node)) return [];
  if (node.type === "Button") return [node.props];
  return Children.toArray((node.props as { children?: ReactNode }).children).flatMap(
    buttons,
  );
}
it("explicit date and named-zone choices never move the Day bookmark before Open Day", async () => {
  state.snapshot.trip = { startDate: "2027-02-01", endDate: "2027-02-12" };
  state.snapshot.candidateDays = ["2027-02-01", "2027-02-12"];
  state.result.observed.projection.events = [
    { boundaries: [{ zone_id: "Asia/Tokyo", instant: null }] },
  ];
  const options = choices(await loaded());
  expect(options).toHaveLength(13);
  options[5].onPress();
  options.find((option) => option.label === "Asia/Tokyo").onPress();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.params).not.toHaveBeenCalled();
  expect(state.saveReading).not.toHaveBeenCalled();
  expect(choices(render()).filter((option) => option.selected)).toHaveLength(2);
  const opens = buttons(render()).filter((button) => button.label === "dayFeed.openDay");
  opens[opens.length - 1].onPress();
  for (let i = 0; i < 24; i++) await Promise.resolve();
  expect(state.select).toHaveBeenCalledWith({
    tripId: reference,
    date: "2027-02-06",
    zone: "Asia/Tokyo",
    generation: 5,
  });
  expect(state.saveReading).not.toHaveBeenCalled();
  state.params.mockClear();
  state.liveGeneration = 6;
  opens[opens.length - 1].onPress();
  expect(state.params).not.toHaveBeenCalled();
  state.liveGeneration = 5;
  state.snapshot.scope.accountId = "foreign";
  state.appActive!();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(choices(render()).filter((option) => option.label !== "Asia/Tokyo")).toEqual([]);
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
it("a genuine local read enables Day chooser without accepted projection and date-only route does not create a timezone bookmark", async () => {
  state.result.observed = null;
  state.result.localManual = localRead();
  state.result.localManualStatus = "AVAILABLE";
  state.view.zone = "";
  const workspace = find(await loaded(), LocalTripWorkspace);
  expect(workspace.onChooseDay).toBeTypeOf("function");
  workspace.onChooseDay();
  const page = render();
  const buttons: any[] = [];
  function collect(node: ReactNode) {
    if (!isValidElement(node)) return;
    if (node.type === "Button") buttons.push(node.props);
    Children.forEach((node.props as any).children, collect);
  }
  collect(page);
  await buttons.find((button) => button.label === "dayFeed.openDay").onPress();
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
  expect(feed.localManual).toBe(state.result.localManual);
  expect(feed.projection).toBeUndefined();
  expect(feed.zone).toBe("");
  expect(feed.onReadingChange).toBeUndefined();
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
