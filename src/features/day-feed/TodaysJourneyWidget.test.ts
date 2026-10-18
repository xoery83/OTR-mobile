import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TodaysJourneyWidget } from "./TodaysJourneyWidget";
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  cursor: 0,
  refs: [] as { current: any }[],
  refCursor: 0,
  generation: 1,
  effects: [] as (() => () => void)[],
  cleanups: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (next: unknown) => {
        state.hooks[i] = typeof next === "function" ? next(state.hooks[i]) : next;
      },
    ];
  },
  useRef: (value: unknown) => (state.refs[state.refCursor++] ??= { current: value }),
  useSyncExternalStore: () => state.generation,
  useEffect: (effect: () => () => void) => {
    state.effects.push(effect);
  },
}));
vi.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "Icon" }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "Text" }));
vi.mock("@/ui/locale", () => ({ t: (k: string) => k, formatUiDate: () => "date" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/tripTodaysJourneyRepository", () => ({
  readTripTodaysJourney: vi.fn(),
}));
beforeEach(() => {
  state.hooks = [];
  state.refs = [];
  state.effects = [];
  state.cleanups = [];
  state.cursor = state.refCursor = 0;
  state.generation = 1;
  vi.useFakeTimers();
});
afterEach(() => {
  state.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
});
function buttons(node: ReactNode): any[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return [
      ...(child.type === "Button" ? [child.props] : []),
      ...buttons(child.props.children),
    ];
  });
}
it("opens accepted-only unknown-zone plans directly through the normal reader", async () => {
  const choose = vi.fn(),
    open = vi.fn();
  state.cursor = 0;
  state.hooks = [
    "trip/null/2026-10-16/",
    {
      scope: { tripId: "trip", generation: 1 },
      source: { epoch: "accepted" },
      today: {
        date: "2026-10-16",
        zone: null,
        primary: null,
        primaryKind: "FREE",
        later: [],
        tonight: null,
      },
    },
    "READY",
  ];
  const { readTripTodaysJourney } =
    await import("@/data/repositories/tripTodaysJourneyRepository");
  vi.mocked(readTripTodaysJourney).mockResolvedValue({
    read: async () => state.hooks[1],
  } as any);
  const renderWidget = () =>
    TodaysJourneyWidget({
      tripId: "trip",
      zone: null,
      planningDate: "2026-10-16",
      onOpenDayChooser: choose,
      onOpenToday: open,
      onOpenItem: vi.fn(),
      copy: {
        title: "Today",
        openToday: "Open Today",
        upcoming: "Next",
        plans: "Plans",
        free: "Free",
        later: "Later",
        tonight: "Stay",
        multipleStays: "Many",
        loading: "Loading",
        unavailable: "Unavailable",
        chooseDay: "Choose date",
        timezoneUnknown: "Internal timezone diagnostic",
        planningDate: "Internal planning diagnostic",
      },
    });
  const actions = buttons(renderWidget());
  state.cursor = 0;
  expect(JSON.stringify(renderWidget())).not.toContain("Internal timezone diagnostic");
  state.cursor = 0;
  expect(JSON.stringify(renderWidget())).not.toContain("Internal planning diagnostic");
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({
    label: "tripHome.preparation.day",
    disabled: false,
  });
  await actions[0].onPress();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(choose).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledOnce();
  (state.hooks[1] as any).today.tonight = { itemRef: "hotel", title: "Sky City Hotel" };
  state.cursor = 0;
  const withStay = JSON.stringify(renderWidget());
  expect(withStay).toContain("Sky City Hotel");
  expect(withStay).not.toContain('"Free"');
});

const copy = {
  title: "Today",
  openToday: "Open Today",
  upcoming: "Next",
  plans: "Plans",
  free: "Free",
  later: "Later",
  tonight: "Stay",
  multipleStays: "Many",
  loading: "Loading",
  unavailable: "Unavailable",
};
const snapshot = () => ({
  scope: { tripId: "trip", generation: 1 },
  source: { epoch: "accepted" },
  today: {
    date: "2026-10-16",
    zone: null,
    primary: null,
    primaryKind: "FREE",
    later: [],
    tonight: { itemRef: "hotel", title: "Sky City Hotel" },
  },
});
function renderRefresh(
  overrides: Partial<Parameters<typeof TodaysJourneyWidget>[0]> = {},
) {
  state.cursor = state.refCursor = 0;
  return TodaysJourneyWidget({
    tripId: "trip",
    zone: null,
    planningDate: "2026-10-16",
    onOpenToday: vi.fn(),
    onOpenItem: vi.fn(),
    copy,
    ...overrides,
  });
}
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function runEffect() {
  state.cleanups.push(state.effects.at(-1)!());
}
async function loadReady() {
  const { readTripTodaysJourney } =
    await import("@/data/repositories/tripTodaysJourneyRepository");
  const reader = {
    readLocal: vi.fn(async (): Promise<any> => snapshot()),
    read: vi.fn(async () => null),
  };
  vi.mocked(readTripTodaysJourney).mockResolvedValue(reader as any);
  renderRefresh();
  runEffect();
  await settle();
  expect(JSON.stringify(renderRefresh())).toContain("Sky City Hotel");
  return reader;
}
it("keeps the mounted same-scope projection while an explicit refresh is pending and still runs minute refresh", async () => {
  const reader = await loadReady();
  reader.readLocal.mockImplementation(() => new Promise(() => {}));
  state.cleanups.pop()!();
  expect(JSON.stringify(renderRefresh({ refreshKey: 1 }))).toContain("Sky City Hotel");
  runEffect();
  await settle();
  expect(reader.readLocal).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(renderRefresh({ refreshKey: 1 }))).toContain("Sky City Hotel");
  vi.advanceTimersByTime(60000);
  await settle();
  expect(reader.readLocal).toHaveBeenCalledTimes(3);
});
it("hides a cached projection immediately on Trip, planning-date, zone or generation change", async () => {
  await loadReady();
  for (const props of [
    { tripId: "other" },
    { planningDate: "2026-10-17" },
    { zone: "Pacific/Auckland" },
    { now: "2026-10-17T00:00:00Z" },
  ])
    expect(JSON.stringify(renderRefresh(props))).not.toContain("Sky City Hotel");
  state.generation = 2;
  expect(JSON.stringify(renderRefresh())).not.toContain("Sky City Hotel");
});
it.each(["null", "error"])(
  "clears the retained result after a confirmed %s refresh",
  async (outcome) => {
    const reader = await loadReady();
    if (outcome === "null") reader.readLocal.mockResolvedValue(null);
    else reader.readLocal.mockRejectedValue(new Error("Reader unavailable"));
    state.cleanups.pop()!();
    renderRefresh({ refreshKey: 1 });
    runEffect();
    await settle();
    const result = JSON.stringify(renderRefresh({ refreshKey: 1 }));
    expect(result).not.toContain("Sky City Hotel");
    expect(result).toContain("Unavailable");
  },
);

it("ignores the old refresh completion after the mounted Trip identity changes", async () => {
  const reader = await loadReady();
  let complete!: (value: any) => void;
  reader.readLocal.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  state.cleanups.pop()!();
  renderRefresh({ refreshKey: 1 });
  runEffect();
  await settle();
  state.cleanups.pop()!();
  reader.readLocal.mockResolvedValue(null);
  renderRefresh({ tripId: "other" });
  runEffect();
  await settle();
  complete(snapshot());
  await settle();
  expect(JSON.stringify(renderRefresh({ tripId: "other" }))).not.toContain(
    "Sky City Hotel",
  );
  expect(state.hooks[1]).toBeNull();
});
