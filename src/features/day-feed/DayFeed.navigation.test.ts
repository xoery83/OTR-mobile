import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { DayFeed } from "./DayFeed";
import { faroeNegativeFixtures, syntheticDate } from "./faroeNegative.test.fixtures";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  nodes: [] as any[],
  scrollTo: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useLayoutEffect: (callback: () => void) => callback(),
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
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("react-native", () => {
  const primitive = (p: any) => {
    state.nodes.push(p);
    if (p.ref) p.ref.current = { scrollTo: state.scrollTo };
    return createElement("div", {}, p.children);
  };
  return {
    View: primitive,
    Text: primitive,
    ScrollView: primitive,
    Pressable: primitive,
    Modal: (p: any) => (p.visible ? primitive(p) : null),
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  };
});
vi.mock("@/ui/theme", () => ({ useThemedStyles: (create: any) => create({}) }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/controls", () => ({ UiButton: () => null }));
vi.mock("./useMinuteClock", () => ({
  useMinuteClock: () => ({ instant: `${syntheticDate}T09:30:00Z` }),
}));
vi.mock("./flexibleSnapshot", () => ({
  useFlexibleSnapshot: () => ({ snapshot: null }),
}));
vi.mock("./FlexibleBlockRow", () => ({ FlexibleBlockRow: () => null }));
vi.mock("./P1Row", () => ({
  P1Row: (p: any) => {
    state.nodes.push(p);
    return createElement("div", {}, `${p.event.id}:${p.depth}`);
  },
}));
vi.mock("./FlightRows", () => ({ FlightRows: () => null }));
vi.mock("./NowMarker", () => ({ NowMarker: () => null }));
vi.mock("./TransitionRow", () => ({ TransitionRow: () => null }));
const fixture = faroeNegativeFixtures();
const render = (props: Record<string, unknown>) => {
  state.cursor = state.refCursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(
    createElement(DayFeed, {
      projection: fixture.day,
      date: syntheticDate,
      zone: "UTC",
      services: {},
      ...props,
    }),
  );
};
beforeEach(() => {
  state.hooks = [];
  state.refs = [];
  state.scrollTo.mockClear();
});
it("restores reading scroll and clears it on same-day explicit header entry", () => {
  render({
    entry: {
      revision: 1,
      kind: "RESUME",
      reading: { offset: 385, focus: fixture.before.id },
    },
  });
  state.nodes.find((p) => p.onContentSizeChange).onContentSizeChange();
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 385, animated: false });
  render({
    entry: {
      revision: 2,
      kind: "FIRST_VALID_PAST_DAY_HEADER",
      reading: { offset: 0, focus: null },
    },
  });
  render({
    entry: {
      revision: 2,
      kind: "FIRST_VALID_PAST_DAY_HEADER",
      reading: { offset: 0, focus: null },
    },
  });
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  expect(state.nodes.filter((p) => p.depth === "F")).toHaveLength(0);
});
it("direct existing Immersive has no timeline and closes without emitting a Day reading", () => {
  const close = vi.fn(),
    reading = vi.fn();
  const html = render({
    directItem: { itemId: fixture.before.id, onClose: close },
    onReadingChange: reading,
  });
  expect(html).toContain(`${fixture.before.id}:I`);
  expect(state.nodes.some((p) => p.onScroll)).toBe(false);
  state.nodes.find((p) => p.depth === "I").onDepth("B");
  expect(close).toHaveBeenCalledOnce();
  expect(reading).not.toHaveBeenCalled();
});
it("unavailable direct target closes instead of opening another item", () => {
  const close = vi.fn();
  render({ directItem: { itemId: "missing", onClose: close } });
  expect(close).toHaveBeenCalledOnce();
  expect(state.nodes.some((p) => p.depth === "I")).toBe(false);
});

it("first P1 intent focuses, explicit richer detail opens Immersive, Close retains focus and reading", () => {
  const reading = vi.fn();
  const props = {
    entry: { revision: 1, kind: "RESUME", reading: { offset: 385, focus: null } },
    onReadingChange: reading,
  };
  render(props);
  state.nodes
    .find((p) => p.event?.id === fixture.before.id && p.depth === "B")
    .onDepth("F");
  expect(reading).toHaveBeenLastCalledWith({ offset: 385, focus: fixture.before.id });
  expect(render(props)).toContain(`${fixture.before.id}:F`);
  state.nodes
    .find((p) => p.event?.id === fixture.before.id && p.depth === "F")
    .onDepth("I");
  expect(render(props)).toContain(`${fixture.before.id}:I`);
  state.nodes
    .find((p) => p.event?.id === fixture.before.id && p.depth === "I")
    .onDepth("B");
  expect(render(props)).toContain(`${fixture.before.id}:F`);
  expect(reading).toHaveBeenCalledTimes(1);
});
