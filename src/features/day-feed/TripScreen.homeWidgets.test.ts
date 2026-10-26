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
  resolveDay: vi.fn(),
  select: vi.fn(),
  enterHeader: vi.fn(),
  saveReading: vi.fn(),
  switchTrip: vi.fn(),
  params: vi.fn(),
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
  useNavigation: () => ({ setOptions: state.setOptions }),
  useLocalSearchParams: () => ({
    tripId: state.view.tripId,
    date: state.view.date,
    zone: state.view.zone,
    view: state.routeMode,
  }),
  router: { setParams: (...args: any[]) => state.params(...args), navigate: vi.fn() },
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
function find(
  node: ReactNode,
  type: any,
  match: (props: any) => boolean = () => true,
): any {
  if (!isValidElement(node)) return null;
  if (node.type === type && match(node.props)) return node.props;
  for (const child of Children.toArray(
    (node.props as { children?: ReactNode }).children,
  )) {
    const found = find(child, type, match);
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
  state.select.mockReset();
  state.enterHeader.mockReset();
  state.saveReading.mockReset();
  state.switchTrip.mockReset();
  state.params.mockReset();
  state.resume = null;
});
afterEach(() => vi.unstubAllGlobals());

const page = (node: ReactNode) =>
  find(node, LocalTripWorkspace)?.widgetsForHome(reference, "Past")[0];
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
it("asks for an explicit Day view zone for an accepted date-only P1 without changing its facts", async () => {
  const event = {
    id: "activity",
    status: "planned",
    boundaries: [{ zone_id: null, local_date: "2026-11-01" }],
  };
  const item = {
    itemId: "activity",
    itemRevision: 1,
    family: "P1",
    schedule: { start: { localDate: "2026-11-01", localTime: null, zoneId: null } },
  };
  state.result.observed.projection.events = [event];
  state.result.observed.projection.items = [item];
  const p = page(await loaded());
  await p.content.props.onOpenItem({
    scope: state.snapshot.scope,
    certificate: { epoch: "epoch" },
    item,
  });
  const node = render();
  expect(find(node, "Modal")?.visible).toBe(true);
  expect(find(node, "Input")?.value).toBe("2026-11-01");
  expect(find(node, DayFeed)).toBeNull();
  expect(state.select).not.toHaveBeenCalled();
  expect(state.saveReading).not.toHaveBeenCalled();
  expect(item.schedule.start).toEqual({
    localDate: "2026-11-01",
    localTime: null,
    zoneId: null,
  });
});

function acceptedCivilStay() {
  const event = {
    id: "accepted-stay",
    status: "planned",
    boundaries: [
      {
        role: "START",
        local_date: "2026-11-02",
        local_time: null,
        zone_id: null,
        instant: null,
      },
      {
        role: "END",
        local_date: "2026-11-03",
        local_time: null,
        zone_id: null,
        instant: null,
      },
    ],
  };
  const item = {
    itemId: event.id,
    itemRevision: 1,
    family: "P3",
    hidden: false,
    status: "planned",
    schedule: {
      start: { localDate: "2026-11-02", localTime: null, zoneId: null, instant: null },
      end: { localDate: "2026-11-03", localTime: null, zoneId: null, instant: null },
    },
  };
  state.result.observed.projection.events = [event];
  state.result.observed.projection.items = [item];
  state.result.observed.projection.query = (date: string, zone: string) => ({
    date,
    zone,
    timed: [],
    nonComparable:
      date === "2026-11-02" && zone === "Pacific/Auckland" ? [{ event }] : [],
    unresolved: [],
  });
  return {
    event,
    item,
    target: { scope: state.snapshot.scope, certificate: { epoch: "epoch" }, item },
  };
}
it("date-only accepted P3 opens explicit viewing context instead of failing Home, without filling Item clocks/zones", async () => {
  const { event, item, target } = acceptedCivilStay();
  const before = JSON.stringify({ event, item });
  const p = page(await loaded());
  await p.content.props.onOpenItem(target);
  const dialog = find(render(), "Modal");
  expect(dialog.visible).toBe(true);
  expect(
    find(dialog.children, "Input", (p) => p.accessibilityLabel === "dayFeed.date").value,
  ).toBe("2026-11-02");
  const zone = find(
    dialog.children,
    "Input",
    (p) => p.accessibilityLabel === "dayFeed.zone",
  );
  expect(zone.value).toBe("");
  expect(state.select).not.toHaveBeenCalled();
  zone.onChangeText("not/a-zone");
  find(render(), "Button", (p) => p.label === "dayFeed.openDay").onPress();
  expect(state.select).not.toHaveBeenCalled();
  zone.onChangeText("Pacific/Auckland");
  find(render(), "Button", (p) => p.label === "dayFeed.openDay").onPress();
  expect(state.select).toHaveBeenCalledWith({
    tripId: reference,
    date: "2026-11-02",
    zone: "Pacific/Auckland",
    generation: 5,
  });
  expect(state.params).toHaveBeenCalledWith({
    tripId: reference,
    date: "2026-11-02",
    zone: "Pacific/Auckland",
    view: "day",
  });
  expect(JSON.stringify({ event, item })).toBe(before);
});
it("accepted date-only P3 uses a legitimate saved viewing zone for the same Item's existing Details", async () => {
  const { event, item, target } = acceptedCivilStay();
  state.resume = { tripId: reference, zone: "Pacific/Auckland", generation: 5 };
  const p = page(await loaded());
  await p.content.props.onOpenItem(target);
  const detail = find(render(), DayFeed);
  expect(detail).toMatchObject({
    date: "2026-11-02",
    zone: "Pacific/Auckland",
    directItem: { itemId: item.itemId },
  });
  expect(
    event.boundaries.every(
      (b) => b.zone_id === null && b.local_time === null && b.instant === null,
    ),
  ).toBe(true);
  detail.directItem.onClose();
  expect(find(render(), DayFeed)).toBeNull();
  expect(state.select).not.toHaveBeenCalled();
});
it.each(["account", "trip", "generation", "epoch", "revision"])(
  "accepted P3 still rejects stale/foreign %s before offering navigation",
  async (kind) => {
    const { target } = acceptedCivilStay();
    const p = page(await loaded());
    if (kind === "account") target.scope = { ...target.scope, accountId: "other" };
    if (kind === "trip") target.scope = { ...target.scope, tripId: "other" };
    if (kind === "generation") target.scope = { ...target.scope, generation: 4 };
    if (kind === "epoch") target.certificate.epoch = "old";
    if (kind === "revision") target.item = { ...target.item, itemRevision: 2 };
    await expect(p.content.props.onOpenItem(target)).rejects.toThrow();
    expect(find(render(), "Modal").visible).toBe(false);
    expect(find(render(), DayFeed)).toBeNull();
    expect(state.select).not.toHaveBeenCalled();
    expect(state.params).not.toHaveBeenCalled();
  },
);
