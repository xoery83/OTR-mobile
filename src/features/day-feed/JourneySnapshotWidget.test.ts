import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { JourneySnapshotWidget } from "./JourneySnapshotWidget";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  presses: [] as any[],
  reader: { read: vi.fn(), resolveItem: vi.fn() },
  generation: 1,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (state.hooks[i] === undefined) state.hooks[i] = initial;
    return [
      state.hooks[i],
      (value: unknown) => {
        state.hooks[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useSyncExternalStore: () => state.generation,
  useEffect: (fn: () => void) => {
    state.effects.push(fn);
  },
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = (props: any) => {
    if (props.onPress) state.presses.push(props);
    return createElement(
      "div",
      { "aria-label": props.accessibilityLabel },
      props.children,
    );
  };
  return {
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
    View: primitive,
    Text: primitive,
    Pressable: primitive,
    StyleSheet: { create: (value: unknown) => value },
    useColorScheme: () => "light",
    useWindowDimensions: () => ({ fontScale: 1, width: 402, height: 874 }),
  };
});
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/tripJourneySnapshotRepository", () => ({
  readTripJourneySnapshot: async () => state.reader,
}));
const scope = { accountId: "account", tripId: "trip", generation: 1 };
const copy = {
  title: "Journey Snapshot",
  days: "Days",
  places: "Places",
  activities: "Activities",
  empty: "No formal itinerary",
  loading: "Loading",
  unavailable: "Unavailable",
  review: "Review Full Itinerary",
};
const observed = {
  scope,
  trip: null,
  epoch: "accepted-epoch",
  candidateDays: ["2027-01-01", "2027-01-12"],
  snapshot: {
    days: 12,
    places: null,
    activities: 28,
    itemCount: 28,
    tags: [
      {
        itemId: "item",
        title: "Long current activity title",
        family: "P1",
        date: "2027-01-01",
        slot: 0,
      },
    ],
  },
};
const render = (props: Parameters<typeof JourneySnapshotWidget>[0]) => {
  state.cursor = 0;
  state.effects = [];
  state.presses = [];
  return renderToStaticMarkup(createElement(JourneySnapshotWidget, props));
};
beforeEach(() => {
  state.hooks = [];
  state.generation = 1;
  state.reader.read.mockReset().mockResolvedValue(observed);
  state.reader.resolveItem.mockReset();
});
it("reads the normal owning repository and re-resolves stale tags before dispatch, with no navigation on rejection", async () => {
  const onOpenItem = vi.fn(),
    onReviewItinerary = vi.fn();
  const props = { tripId: "trip", copy, onOpenItem, onReviewItinerary };
  render(props);
  state.effects[0]();
  await vi.waitFor(() => expect(state.reader.read).toHaveBeenCalledWith("trip"));
  let html = render(props);
  expect(html).toContain("Long current activity title");
  expect(html).toContain("28");
  expect(html).not.toContain("Places");
  state.reader.resolveItem.mockResolvedValue(null);
  state.presses
    .find((press) => press.accessibilityLabel === "Long current activity title")
    .onPress();
  await vi.waitFor(() =>
    expect(state.reader.resolveItem).toHaveBeenCalledWith(
      "trip",
      "item",
      "accepted-epoch",
    ),
  );
  expect(onOpenItem).not.toHaveBeenCalled();
  html = render(props);
  expect(html).toContain("Unavailable");
  expect(html).not.toContain("Long current activity title");
});
it("dispatches the current authorized Item separately from full-itinerary intent and withholds changed Account output", async () => {
  const current = {
    scope,
    item: { itemId: "item" },
    certificate: { epoch: "accepted-epoch" },
  };
  state.reader.resolveItem.mockResolvedValue(current);
  const onOpenItem = vi.fn(),
    onReviewItinerary = vi.fn(),
    props = { tripId: "trip", copy, onOpenItem, onReviewItinerary };
  render(props);
  state.effects[0]();
  await vi.waitFor(() => expect(state.reader.read).toHaveBeenCalled());
  render(props);
  state.presses
    .find((press) => press.accessibilityLabel === "Long current activity title")
    .onPress();
  await vi.waitFor(() => expect(onOpenItem).toHaveBeenCalledWith(current));
  expect(onReviewItinerary).not.toHaveBeenCalled();
  state.presses.find((press) => press.accessibilityLabel === copy.review).onPress();
  await vi.waitFor(() =>
    expect(onReviewItinerary).toHaveBeenCalledWith({
      scope,
      epoch: "accepted-epoch",
      candidateDays: ["2027-01-01", "2027-01-12"],
    }),
  );
  state.generation = 2;
  expect(render(props)).not.toContain("Long current activity title");
});
