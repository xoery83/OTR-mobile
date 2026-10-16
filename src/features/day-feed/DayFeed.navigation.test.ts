import { visual } from "@/ui/visual";
import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { DayFeed } from "./DayFeed";
import { wholeTripCalendarDates } from "./tripListPresentation";
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
  state.window = null;
  state.anchor = null;
});
it("passes the saved stable anchor to the owning list and resets explicit header focus", () => {
  const anchor = { key: `day:${syntheticDate}`, date: syntheticDate, within: 385 };
  render({
    entry: {
      revision: 1,
      kind: "RESUME",
      reading: { offset: 385, focus: fixture.before.id, anchor },
    },
  });
  expect(state.window.initialAnchor).toEqual(anchor);
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
  expect(state.window.initialAnchor).toEqual({
    key: `day:${syntheticDate}`,
    date: syntheticDate,
    within: 0,
  });
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
  expect(reading).toHaveBeenLastCalledWith(
    expect.objectContaining({ offset: 385, focus: fixture.before.id }),
  );
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

it("whole owning calendar retains all twelve days and known outlying candidates without device-time inference", () => {
  const dates = wholeTripCalendarDates(
    { startDate: "2027-02-01", endDate: "2027-02-12" },
    ["2027-02-15"],
    "2027-02-02",
  );
  expect(dates).toHaveLength(13);
  expect(dates[11]).toBe("2027-02-12");
  expect(dates[12]).toBe("2027-02-15");
  expect(wholeTripCalendarDates(null, [], "2027-02-02")).toEqual(["2027-02-02"]);
  expect(
    wholeTripCalendarDates(
      { startDate: "bad", endDate: "2027-02-12" },
      ["bad", "2027-02-04"],
      "2027-02-02",
    ),
  ).toEqual(["2027-02-02", "2027-02-04"]);
});
it("continuous dated sections share one Focus and one scroll; legacy reading restores relative to its explicit header", () => {
  const otherDate = "2027-02-04";
  const baseQuery = itemsForLocalDate(fixture.day, syntheticDate, "UTC");
  const reading = vi.fn();
  const props = {
    dates: [syntheticDate, otherDate],
    date: otherDate,
    query: (date: string) => ({ ...baseQuery, date }),
    entry: { revision: 1, kind: "RESUME", reading: { offset: 172, focus: null } },
    onReadingChange: reading,
  };
  render(props);
  expect(state.nodes.filter((p) => p.onScroll)).toHaveLength(1);
  expect(state.window.initialAnchor).toEqual({
    key: `day:${otherDate}`,
    date: otherDate,
    within: 172,
  });
  state.anchor = { key: `day:${otherDate}`, date: otherDate, within: 172 };
  const occurrences = state.nodes.filter((p) => p.event?.id === fixture.before.id);
  expect(occurrences).toHaveLength(2);
  occurrences[1].onDepth("F");
  render(props);
  expect(state.nodes.filter((p) => p.depth === "F")).toHaveLength(1);
  state.nodes
    .find((p) => p.onScroll)
    .onScroll({ nativeEvent: { contentOffset: { y: 672 } } });
  expect(reading).toHaveBeenLastCalledWith(
    expect.objectContaining({
      offset: 672,
      layout: "WHOLE_TRIP",
      anchoredDate: otherDate,
    }),
  );
});

it("reviewer: unplaced accepted events retain an unknown-schedule cue in the continuous feed", () => {
  const projection = {
    ...fixture.day,
    events: fixture.day.events.map((event) => ({
      ...event,
      boundaries: event.boundaries.map((boundary) => ({
        ...boundary,
        instant: null,
        source_instant: null,
        local_date: null,
        local_time: null,
        zone_id: null,
        quality: "UNKNOWN" as const,
        civil_resolution: "PENDING" as const,
        resolution_offset_seconds: null,
      })),
    })),
  };
  const output = render({ projection, dates: [syntheticDate, "2027-02-04"] });
  expect(output).toContain("dayFeed.timeUnspecified");
  for (const event of projection.events)
    expect(output.split(event.title)).toHaveLength(
      1 + projection.events.filter((other) => other.title === event.title).length,
    );
  expect(output).not.toContain("dayFeed.unresolvedCount");
  expect(state.nodes.some((node) => node.event?.id === projection.events[0].id)).toBe(
    false,
  );
});

it("date-only placed occurrences never reappear in the unplaced notice", () => {
  const query = itemsForLocalDate(fixture.day, syntheticDate, "UTC");
  const item = query.timed[0];
  const html = render({
    dates: [syntheticDate],
    query: () => ({ ...query, unresolved: [item.event] }),
  });
  expect(html).not.toContain(item.event.title);
  expect(html).not.toContain("dayFeed.unresolvedCount");
  expect(state.nodes.some((node) => node.event?.id === item.event.id)).toBe(true);
});

function localManual(changedId = fixture.before.id) {
  const row = (id: string) => ({
    itemRef: id,
    rowKey: { itemId: id, projectionRole: "START", localDate: syntheticDate },
    itemRevision: 1,
    projectionVersion: 2,
    certificateGeneration: 0,
    family: "P1",
    title: `LOCAL ${id}`,
    status: "planned",
    position: "TNS",
    localState: "PENDING",
  });
  return {
    scope: { accountId: "account", tripId: "trip", generation: 0 },
    source: { kind: "LOCAL_MANUAL_COMMITTED", fingerprint: "local-read-pin" },
    items: [{ itemId: changedId }, { itemId: "new-local" }],
    rows: (date: string) =>
      date === syntheticDate ? [row(changedId), row("new-local")] : [],
  } as any;
}
it("accepted plus local keeps the normal renderer, Focus/Immersive and a single owning scroll", () => {
  const local = localManual(),
    openLocal = vi.fn(),
    reading = vi.fn();
  const props = {
    localManual: local,
    onOpenLocalItem: openLocal,
    onReadingChange: reading,
  };
  const html = render(props);
  expect(html).toContain(`${fixture.after.id}:B`);
  expect(html).toContain(`LOCAL ${fixture.before.id}`);
  expect(html).toContain("LOCAL new-local");
  expect(state.nodes.some((p) => p.event?.id === fixture.before.id)).toBe(false);
  expect(state.nodes.filter((p) => p.isOwningList)).toHaveLength(1);
  state.nodes
    .find((p) => p.accessibilityLabel === `LOCAL ${fixture.before.id}`)
    .onPress();
  expect(openLocal).toHaveBeenLastCalledWith(fixture.before.id, local);
  state.nodes
    .find((p) => p.event?.id === fixture.after.id && p.depth === "B")
    .onDepth("F");
  expect(render(props)).toContain(`${fixture.after.id}:F`);
  state.nodes
    .find((p) => p.event?.id === fixture.after.id && p.depth === "F")
    .onDepth("I");
  expect(render(props)).toContain(`${fixture.after.id}:I`);
  expect(openLocal).toHaveBeenCalledTimes(1);
  expect(reading).toHaveBeenCalled();
});
it("pending replacements remove accepted unresolved duplicates and suppress false empty copy", () => {
  const local = localManual();
  const query = itemsForLocalDate(fixture.day, syntheticDate, "UTC");
  const html = render({
    localManual: local,
    query: () => ({
      ...query,
      timed: query.timed.filter((item) => item.event.id === fixture.before.id),
      nonComparable: query.nonComparable.filter(
        (item) => item.event.id === fixture.before.id,
      ),
      unresolved: [fixture.before],
      coreRows: [],
    }),
  });
  expect(html).toContain(`LOCAL ${fixture.before.id}`);
  expect(html).not.toContain("dayFeed.dayEmpty");
  expect(html).not.toContain("dayFeed.timeUnspecified");
  expect(html.split(`LOCAL ${fixture.before.id}`)).toHaveLength(2);
  expect(state.nodes.some((p) => p.event?.id === fixture.before.id)).toBe(false);
});
it("without accepted projection only local date-only feed owns one scroll and no accepted callbacks", () => {
  const local = localManual();
  const html = render({ projection: undefined, localManual: local, zone: "" });
  expect(html).toContain("LOCAL new-local");
  expect(state.nodes.filter((p) => p.isOwningList)).toHaveLength(1);
  expect(state.nodes.some((p) => p.event)).toBe(false);
});

it.each(["accepted", "local"])(
  "%s Day leaves canonical Shell clearance after its last row",
  (kind) => {
    render({
      bottomInset: 94,
      ...(kind === "local"
        ? { projection: undefined, localManual: localManual(), zone: "" }
        : {}),
    });
    const scrolls = state.nodes.filter((p) => p.isOwningList);
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paddingBottom: visual.space.section + 94 }),
      ]),
    );
    expect(scrolls[0].scrollIndicatorInsets.bottom).toBeGreaterThanOrEqual(94);
  },
);

it("explicit date entry supplies a header anchor without rendering preceding dates to locate it", () => {
  const otherDate = "2027-02-04";
  render({
    dates: [syntheticDate, otherDate],
    date: otherDate,
    entry: {
      revision: 4,
      kind: "EXPLICIT_TODAY_HEADER",
      reading: { offset: 0, focus: null },
    },
  });
  expect(state.window.initialAnchor).toEqual({
    key: `day:${otherDate}`,
    date: otherDate,
    within: 0,
  });
  expect(
    state.window.rows.find((row: any) => row.key === `day:${otherDate}`),
  ).toBeDefined();
  state.window.onInteraction();
  state.window.onOffsetChange(1300);
  expect(state.scrollTo).not.toHaveBeenCalled();
});

it.each(["accepted", "local"])(
  "fresh %s RESUME preserves the initial Introduction",
  (kind) => {
    render({
      ...(kind === "local" ? { projection: undefined, localManual: localManual() } : {}),
      presentation: { header: createElement("span", {}, "introduction") },
      entry: { revision: 1, kind: "RESUME", reading: { offset: 0, focus: null } },
    });
    expect(state.window.initialAnchor).toBeNull();
  },
);
it("unknown-schedule prefix cannot replace the explicit first date Header index", async () => {
  render({
    query: (date: string, zone: string) => ({
      date,
      zone,
      timed: [],
      nonComparable: [],
      unresolved: [fixture.before],
    }),
  });
  const { indexDayRows } = await import("./dayFeedWindow");
  const index = indexDayRows(state.window.rows);
  expect(state.window.rows[index.dates.get(syntheticDate)!].key).toBe(
    `day:${syntheticDate}`,
  );
});
