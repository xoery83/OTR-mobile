import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TripSearchScreen } from "./TripSearchScreen";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  actions: [] as any[],
  input: null as any,
  params: { entry: "HOME", tripId: "trip" },
  generation: 1,
  direct: null as any,
  push: vi.fn(),
  select: vi.fn(),
  reader: { page: vi.fn(), validate: vi.fn(), resolve: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.hooks))
      state.hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      state.hooks[i],
      (next: any) => {
        state.hooks[i] = typeof next === "function" ? next(state.hooks[i]) : next;
      },
    ];
  },
  useRef: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.hooks)) state.hooks[i] = { current: initial };
    return state.hooks[i];
  },
  useCallback: (fn: any) => fn,
  useSyncExternalStore: () => state.generation,
  useLayoutEffect: (fn: () => void) => fn(),
  useEffect: (fn: () => void) => {
    state.effects.push(fn);
  },
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  return {
    View: (p: any) => createElement("div", {}, p.children),
    Text: (p: any) => createElement("span", {}, p.children),
    StyleSheet: { create: (v: any) => v },
    FlatList: (p: any) =>
      createElement(
        "main",
        {},
        p.ListHeaderComponent,
        p.data.length
          ? p.data.map((item: any) =>
              createElement("div", { key: p.keyExtractor(item) }, p.renderItem({ item })),
            )
          : p.ListEmptyComponent,
        p.ListFooterComponent,
      ),
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  };
});
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => state.params,
  router: { push: state.push },
  Stack: { Screen: () => null },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/tripSearchRepository", () => ({
  readTripSearchRepository: async () => state.reader,
}));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({
    resumeView: { tripId: "trip", zone: "Pacific/Auckland", generation: 1 },
    select: state.select,
  }),
}));
vi.mock("@/features/day-feed/DayFeed", () => ({
  DayFeed: (p: any) => {
    state.direct = p;
    return createElement("aside", {}, p.directItem.itemId);
  },
}));
vi.mock("@/features/day-feed/coreExperienceRenderer", () => ({
  createCoreExperienceRenderer: () => null,
}));
vi.mock("@/ui/controls", () => ({
  UiButton: (p: any) => {
    state.actions.push(p);
    return createElement("button", {}, p.label);
  },
  UiText: (p: any) => createElement("span", {}, p.children),
}));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: (p: any) => {
    state.actions.push(p);
    return createElement("button", {}, p.label);
  },
  UiTextInput: (p: any) => {
    state.input = p;
    return createElement("input", { value: p.value, readOnly: true });
  },
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
function render() {
  state.cursor = 0;
  state.actions = [];
  state.effects = [];
  state.direct = null;
  return renderToStaticMarkup(createElement(TripSearchScreen));
}
const scope = { accountId: "account", generation: 1 },
  proof = {
    scope,
    tripId: "trip",
    fingerprint: "fixture-ui-proof",
    inventory: "fixture",
  };
const result = {
  category: "ITINERARY",
  id: "item",
  tripId: "trip",
  tripName: "Original Trip",
  title: "Museum",
  date: "2027-01-27",
  family: "P1",
  rank: 1,
};
const page = {
  scope,
  key: JSON.stringify(["Museum", "trip", "ALL"]),
  inventory: "fixture",
  results: [result],
  proofs: [proof],
  cursor: null,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.hooks = [];
  state.cursor = 0;
  state.effects = [];
  state.params = { entry: "HOME", tripId: "trip" };
  state.generation = 1;
  state.reader.validate.mockResolvedValue(true);
  state.reader.page.mockImplementation(async (input: any) => ({
    ...page,
    key: JSON.stringify([input.query, input.tripId, input.category]),
    results: input.query ? [result] : [],
  }));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function query() {
  render();
  state.input.onChangeText("Museum");
  render();
  state.effects[0]();
  await vi.advanceTimersByTimeAsync(200);
  render();
}
it("real screen presets keep query, omit redundant Trips category, and group All before See all", async () => {
  await query();
  expect(state.input.value).toBe("Museum");
  expect(state.actions.some((p) => p.label.startsWith("Trips ("))).toBe(false);
  state.actions.find((p) => p.label === "All Trips").onPress();
  render();
  expect(state.input.value).toBe("Museum");
  expect(state.actions.some((p) => p.label.startsWith("Trips ("))).toBe(true);
  state.effects[0]();
  await vi.advanceTimersByTimeAsync(200);
  render();
  state.actions.find((p) => p.label === "See all Itinerary").onPress();
  render();
  expect(state.input.value).toBe("Museum");
  expect(state.actions.find((p) => p.label.startsWith("Itinerary (")).selected).toBe(
    true,
  );
});
it("fresh normal resolution uses existing directItem overlay; close preserves query/scope/category and never selects active Trip", async () => {
  state.reader.resolve.mockResolvedValue({
    kind: "ITEM",
    itemId: "item",
    proof,
    projection: { version: 2 },
    date: "2027-01-27",
    zone: "Pacific/Auckland",
    services: {},
  });
  await query();
  await state.actions.find((p) => p.label === "Museum").onPress();
  render();
  expect(state.reader.resolve).toHaveBeenCalledWith(result, proof, {
    tripId: "trip",
    zone: "Pacific/Auckland",
    generation: 1,
  });
  expect(state.direct.directItem.itemId).toBe("item");
  state.direct.directItem.onClose();
  render();
  expect(state.direct).toBeNull();
  expect(state.input.value).toBe("Museum");
  expect(state.select).not.toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
});
it("deleted/unavailable resolution cannot route; Account generation remount key prevents ABA state reuse", async () => {
  state.reader.resolve.mockResolvedValue(null);
  await query();
  await state.actions.find((p) => p.label === "Museum").onPress();
  render();
  expect(state.direct).toBeNull();
  expect(state.push).not.toHaveBeenCalled();
  const a = TripSearchScreen().key;
  state.generation = 2;
  const b = TripSearchScreen().key;
  state.generation = 3;
  const again = TripSearchScreen().key;
  expect(a).not.toBe(b);
  expect(a).not.toBe(again);
});
it("Trip resolution uses the existing route with target scope without active-Trip or bookmark writes", async () => {
  state.reader.page.mockImplementation(async (input: any) => ({
    ...page,
    key: JSON.stringify([input.query, input.tripId, input.category]),
    results: [{ ...result, category: "TRIPS", id: "trip" }],
  }));
  state.params = { entry: "MY_TRIPS", tripId: "trip" };
  state.reader.resolve.mockResolvedValue({ kind: "TRIP", tripId: "trip" });
  await query();
  await state.actions.find((p) => p.label === "Museum").onPress();
  expect(state.push).toHaveBeenCalledWith({
    pathname: "/trip",
    params: { tripId: "trip", view: "home" },
  });
  expect(state.select).not.toHaveBeenCalled();
});
it("a delayed earlier Item tap cannot replace the latest detail or reopen after Close", async () => {
  state.reader.page.mockImplementation(async (input: any) => ({
    ...page,
    key: JSON.stringify([input.query, input.tripId, input.category]),
    results: [result, { ...result, id: "later", title: "Later Museum" }],
  }));
  let finish!: (value: unknown) => void;
  state.reader.resolve
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValueOnce({
      kind: "ITEM",
      itemId: "later",
      proof,
      projection: { version: 2 },
      date: "2027-01-27",
      zone: "Pacific/Auckland",
      services: {},
    });
  await query();
  state.actions.find((p) => p.label === "Museum").onPress();
  state.actions.find((p) => p.label === "Later Museum").onPress();
  await Promise.resolve();
  render();
  expect(state.direct.directItem.itemId).toBe("later");
  state.direct.directItem.onClose();
  finish({
    kind: "ITEM",
    itemId: "item",
    proof,
    projection: { version: 2 },
    date: "2027-01-27",
    zone: "Pacific/Auckland",
    services: {},
  });
  await Promise.resolve();
  render();
  expect(state.direct).toBeNull();
  expect(state.input.value).toBe("Museum");
});

it("review: selected zero Trips category remains explicit after All→Current scope", async () => {
  await query();
  state.actions.find((p) => p.label === "All Trips").onPress();
  render();
  state.actions.find((p) => p.label.startsWith("Trips (")).onPress();
  render();
  state.actions.find((p) => p.label === "Current Trip").onPress();
  render();
  expect(state.actions.some((p) => p.label.startsWith("Trips (") && p.selected)).toBe(
    true,
  );
});
it("review: late target resolution cannot push after account-generation unmount", async () => {
  state.params = { entry: "MY_TRIPS", tripId: "trip" };
  state.reader.page.mockImplementation(async (input: any) => ({
    ...page,
    key: JSON.stringify([input.query, input.tripId, input.category]),
    results: [{ ...result, category: "TRIPS", id: "trip" }],
  }));
  let finish!: (v: unknown) => void;
  state.reader.resolve.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await query();
  const pending = state.actions.find((p) => p.label === "Museum").onPress();
  const cleanup = state.effects[0]() as unknown as () => void;
  cleanup();
  state.generation = 2;
  finish({ kind: "TRIP", tripId: "trip" });
  await pending;
  expect(state.push).not.toHaveBeenCalled();
});

it("review: malformed-but-schema-accepted cached Trip date must not crash Search", async () => {
  state.reader.page.mockImplementation(async (input: any) => ({
    ...page,
    key: JSON.stringify([input.query, input.tripId, input.category]),
    results: [{ ...result, category: "TRIPS", id: "trip", date: "unknown-date" }],
  }));
  await expect(query()).resolves.toBeUndefined();
});
