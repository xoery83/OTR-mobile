import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { DayFeed } from "./DayFeed";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { faroeNegativeFixtures, syntheticDate } from "./faroeNegative.test.fixtures";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  hooks: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  nodes: [] as any[],
  scrollTo: vi.fn(),
  window: null as any,
  anchor: null as any,
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
    ScrollView: (p: any) => primitive({ ...p, isScrollView: true }),
    Pressable: primitive,
    Modal: (p: any) => (p.visible ? primitive(p) : null),
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  };
});
// Component navigation tests use an explicit list port double. Native windowing has its own tests.
vi.mock("./WindowedDayList", () => ({
  WindowedDayList: (p: any) => {
    state.window = p;
    state.anchor ??= p.initialAnchor;
    const handle = {
      saveAnchor: () => state.anchor,
      restoreAnchor: (anchor: any) => {
        state.anchor = anchor;
        state.scrollTo(anchor);
        return true;
      },
      jumpToDayHeader: (date: string) => {
        state.anchor = { key: `day:${date}`, date, within: 0 };
        state.scrollTo(state.anchor);
        return true;
      },
    };
    if (typeof p.listRef === "function") p.listRef(handle);
    else if (p.listRef) p.listRef.current = handle;
    state.nodes.push({
      ...p,
      isOwningList: true,
      contentContainerStyle: [p.contentContainerStyle, { paddingBottom: p.bottomInset }],
      scrollIndicatorInsets: { bottom: p.bottomInset },
      onScroll: (event: any) => {
        p.onOffsetChange?.(event.nativeEvent.contentOffset.y);
        p.onAnchorChange?.(state.anchor);
      },
    });
    return createElement(
      "div",
      {},
      p.header,
      p.rows.map((row: any) => createElement("div", { key: row.key }, p.renderRow(row))),
    );
  },
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (create: any) => create({}) }));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiButton: () => null,
  UiText: (p: any) => createElement("span", {}, p.children),
  UiSection: (p: any) => createElement("section", {}, p.children),
}));
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
    return createElement(
      "div",
      {},
      `${p.event?.id ?? p.display?.id}:${p.depth} ${p.display?.title ?? ""}`,
    );
  },
}));
vi.mock("./FlightFidelityGrid", () => ({
  FlightFidelityGrid: (p: any) => {
    state.nodes.push(p);
    return createElement(
      "span",
      {},
      `FLIGHT ${p.flight?.authored?.flightNumberLiteral}:${p.focused ? "F" : "B"}`,
    );
  },
}));
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
  state.window = null;
  state.anchor = null;
});
vi.mock("./LocalManualDayFeed", () => ({
  LocalManualDayFeed: () => null,
  LocalManualDayRows: (p: any) => {
    const row = p.onlyRow;
    const focused = p.p1Focus === JSON.stringify(row.rowKey);
    const props = {
      ...p,
      isP6Local: true,
      focused,
      onDepth: (depth: string) =>
        depth === "I"
          ? p.onOpenItem?.(row.itemRef, p.read, {
              role: row.rowKey.projectionRole,
              date: p.date,
            })
          : p.onP1Focus?.(depth === "F" ? JSON.stringify(row.rowKey) : null),
    };
    state.nodes.push(props);
    return createElement("span", {}, `P6 ${row.itemRef}:${focused ? "F" : "B"}`);
  },
}));
function mixedP6() {
  const id = fixture.before.id;
  const rowKey = {
    itemId: id,
    projectionRole: "START",
    localDate: syntheticDate,
  };
  const item = {
    itemId: id,
    itemRevision: 1,
    tripId: fixture.day.tripId,
    family: "P6",
    title: "Pending activity",
    status: "planned",
    hidden: false,
    localState: "PENDING",
  };
  const row = {
    itemRef: id,
    rowKey,
    family: "P6",
    position: "TNS",
    title: item.title,
  };
  const local = {
    scope: {
      accountId: fixture.day.accountId,
      tripId: fixture.day.tripId,
      generation: 1,
    },
    source: { kind: "LOCAL_MANUAL_COMMITTED", fingerprint: "p6-focus-read" },
    items: [item],
    rows: (date: string) => (date === syntheticDate ? [row] : []),
  } as any;
  const open = vi.fn();
  const projection = {
    ...fixture.day,
    version: 2,
    items: [{ ...item, localState: "ACCEPTED" }],
    flightFacts: {},
    query: (date: string, zone: string) => itemsForLocalDate(fixture.day, date, zone),
  };
  return {
    id,
    local,
    open,
    props: { projection, localManual: local, onOpenLocalItem: open },
  };
}
it("mixed accepted v2 plus pending local P6 retains Focus through repeated renders and opens the original occurrence", () => {
  const { id, local, open, props } = mixedP6();
  render(props);
  // Same-ID accepted Event is suppressed by pendingIds; it cannot preserve Focus.
  expect(state.nodes.some((p) => p.event?.id === id)).toBe(false);
  state.nodes.find((p) => p.isP6Local).onDepth("F");
  expect(render(props)).toContain(`P6 ${id}:F`);
  expect(render(props)).toContain(`P6 ${id}:F`);
  state.nodes.find((p) => p.isP6Local).onDepth("I");
  expect(open).toHaveBeenCalledWith(id, local, {
    role: "START",
    date: syntheticDate,
  });
});
it.each([{ hidden: true }, { status: "cancelled" }, { status: "skipped" }])(
  "mixed local P6 cannot retain Focus after item becomes unavailable: %j",
  (changes) => {
    const { id, local, props } = mixedP6();
    render(props);
    state.nodes.find((p) => p.isP6Local).onDepth("F");
    render(props);
    render(props);
    Object.assign(local.items[0], changes);
    render(props);
    expect(render(props)).toContain(`P6 ${id}:B`);
  },
);
it("mixed local P6 row withdrawal clears Focus before that identity is shown again", () => {
  const { id, local, props } = mixedP6();
  render(props);
  state.nodes.find((p) => p.isP6Local).onDepth("F");
  render(props);
  render(props);
  const rows = local.rows;
  local.rows = () => [];
  render(props);
  render(props);
  local.rows = rows;
  expect(render(props)).toContain(`P6 ${id}:B`);
});
