import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { DayEvent, DayProjection } from "@/domain/trip/dayReadModel";
import { DayFeed } from "./DayFeed";
import { readTripDayFeedLab } from "@/data/repositories/tripDayFeedLabRepository";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "@/data/auth/accountGeneration";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { DayFeedLabScreen } from "../day-feed-lab/DayFeedLabScreen";
import { getLabFixtures } from "../day-feed-lab/fixtureRegistration";
import { rentalContribution } from "../day-feed-lab/rentalContribution";
import { stayContribution, stayTripId } from "../day-feed-lab/stayContribution";
import { flexibleContribution } from "../day-feed-lab/flexibleContribution";
import {
  flexibleReactiveContribution,
  flexibleFixtureUpdate,
} from "../day-feed-lab/flexibleReactiveContribution";
import { FlexibleBlockRow, type FlexibleBlockRendererProps } from "./FlexibleBlockRow";
import { FlexibleSnapshotFixtureRow } from "../day-feed-lab/FlexibleSnapshotFixtureRow";
import { ttrLabFixture } from "@/features/ttr/labFixtures";
import { projectTtr, reduceTtr } from "@/domain/trip/ttrState";
import { syntheticObservation } from "@/domain/trip/__fixtures__/ttr";
import { getFixtureCatalog } from "../day-feed-lab/fixtureCatalog";
import { P1Row } from "./P1Row";
import { StayRow, stayDirectionsUrl, stayMapUrl, type StayFacts } from "./StayRow";
import { createCoreExperienceRenderer } from "./coreExperienceRenderer";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { projectCoreP6Feed } from "@/domain/trip/tripCoreV2P6DayFeed";
import { createCoreStayRenderer } from "./coreStayRenderer";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { composeDayStream } from "./composition";
import { FlightRows } from "./FlightRows";
import { flightPresentation } from "./presentation";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
import { timeRailWidth } from "./visualTokens";
import { faroeNegativeFixtures, syntheticDate } from "./faroeNegative.test.fixtures";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => ({
  presses: [] as Record<string, any>[],
  nodes: [] as Record<string, any>[],
  instant: "2026-10-10T00:30:00Z",
  scale: 1,
  scheme: "light",
  hooks: [] as unknown[],
  cursor: 0,
  refs: [] as { current: any }[],
  refCursor: 0,
  memoCursor: 0,
  layoutCursor: 0,
  layouts: [] as (readonly unknown[] | undefined)[],
  memos: [] as { deps: readonly unknown[]; value: unknown }[],
  scrollTo: vi.fn(),
  platform: "ios",
  effects: [] as (() => unknown)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (callback: () => unknown) => {
    state.effects.push(callback);
  },
  useLayoutEffect: (callback: () => unknown, deps?: readonly unknown[]) => {
    const i = state.layoutCursor++;
    const previous = state.layouts[i];
    if (
      !deps ||
      !previous ||
      deps.length !== previous.length ||
      deps.some((value, index) => !Object.is(value, previous[index]))
    )
      callback();
    state.layouts[i] = deps;
  },
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (state.hooks[i] === undefined)
      state.hooks[i] = typeof initial === "function" ? initial() : initial;
    return [
      state.hooks[i] ?? initial,
      (next: unknown) => {
        state.hooks[i] =
          typeof next === "function" ? next(state.hooks[i] ?? initial) : next;
      },
    ];
  },
  useMemo: (create: () => unknown, deps: readonly unknown[]) => {
    const i = state.memoCursor++;
    const old = state.memos[i];
    if (
      !old ||
      old.deps.length !== deps.length ||
      !deps.every((v, n) => Object.is(v, old.deps[n]))
    )
      state.memos[i] = { deps, value: create() };
    return state.memos[i].value;
  },
  useRef: (initial: unknown) => {
    const i = state.refCursor++;
    return (state.refs[i] ??= { current: initial });
  },
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = (props: Record<string, any>) => {
    state.nodes.push(props);
    if (props.onPress) state.presses.push(props);
    if (props.ref) props.ref.current = { scrollTo: state.scrollTo };
    return createElement(
      "div",
      { "data-testid": props.testID, "aria-label": props.accessibilityLabel },
      props.children,
    );
  };
  return {
    AppState: { addEventListener: () => ({ remove: vi.fn() }) },
    Platform: {
      get OS() {
        return state.platform;
      },
    },
    View: primitive,
    Text: primitive,
    ScrollView: primitive,
    Pressable: primitive,
    Image: primitive,
    Linking: { openURL: vi.fn() },
    Modal: (p: Record<string, any>) => (p.visible ? primitive(p) : null),
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: state.scale }),
    useColorScheme: () => state.scheme,
  };
});
vi.mock("@/data/repositories/ttrLabSelectionRepository", () => ({
  openTtrLabSelectionRepository: vi.fn(async () => ({
    repository: {
      read: async () => null,
      confirm: async () => {
        throw new Error("TEST_USE_CONTROLLER_SUITE");
      },
    },
    close: async () => {},
  })),
}));
vi.mock("@/data/repositories/tripDayFeedLabRepository", () => ({
  readTripDayFeedLab: vi.fn(),
}));
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: vi.fn(async () => {
    throw new Error("TEST_NATIVE_STORAGE_FORBIDDEN");
  }),
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/features/flexible-native-gallery/Gallery", () => ({
  FlexibleRenderer: () => null,
}));
vi.mock("./useMinuteClock", () => ({
  useMinuteClock: () => ({ instant: state.instant }),
}));
const boundary = (role: "START" | "END" | "ORIGIN" | "DESTINATION", hour: string) => ({
  role,
  instant: `2026-10-10T${hour}:00:00Z`,
  source_instant: `2026-10-10T${hour}:00:00Z`,
  local_date: "2026-10-10",
  local_time: `${hour}:00:00`,
  quality: "EXACT",
  basis: "SOURCE_INSTANT",
  zone_id: "UTC",
  clock_precision: 0,
  source_instant_precision: 0,
});
const poi = {
  id: "poi",
  title: "Very long multilingual POI · Musée · 博物馆",
  temporal_shape: "SPAN",
  event_type: "activity",
  semantic_revision: 1,
  status: "planned",
  boundaries: [boundary("START", "00"), boundary("END", "01")],
} as DayEvent;
const flight = {
  ...poi,
  id: "flight",
  title: "Synthetic flight",
  event_type: "flight",
  temporal_shape: "TRANSPORT",
  boundaries: [boundary("ORIGIN", "02"), boundary("DESTINATION", "04")],
} as DayEvent;
const projection = {
  accountId: "a",
  tripId: "t",
  events: [poi, flight],
} as DayProjection;
const render = (node: ReactNode) => {
  state.cursor = 0;
  state.refCursor = 0;
  state.memoCursor = 0;
  state.layoutCursor = 0;
  state.presses = [];
  state.nodes = [];
  state.effects = [];
  return renderToStaticMarkup(node);
};
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  state.instant = "2026-10-10T00:30:00Z";
  state.nodes = [];
  state.hooks = [];
  state.refs = [];
  state.memos = [];
  state.layouts = [];
  state.scrollTo.mockClear();
  state.platform = "ios";
  state.cursor = 0;
  state.scale = 1;
  state.scheme = "light";
  state.presses = [];
});
it("composes actual production P1/P2/NOW without any supplemental fixture fields", () => {
  const html = render(
    createElement(DayFeed, { projection, date: "2026-10-10", zone: "UTC", services: {} }),
  );
  expect(html).toContain(poi.title);
  expect(html).toContain('data-testid="flight-browse-geometry"');
  expect(html).toContain('data-testid="now-within"');
  expect(html).not.toMatch(/fixtureDocument|synthetic|Booking|Boarding pass/);
});
it("P1 Browse, Focus, Immersive and close dispatch the correct depth", () => {
  const onDepth = vi.fn();
  render(createElement(P1Row, { event: poi, depth: "B", onDepth }));
  state.presses.find((p) => p.accessibilityLabel === poi.title)!.onPress();
  expect(onDepth).toHaveBeenLastCalledWith("F");
  render(createElement(P1Row, { event: poi, depth: "F", onDepth }));
  state.presses.find((p) => p.accessibilityLabel === t("p1r.richerDetails"))!.onPress();
  expect(onDepth).toHaveBeenLastCalledWith("I");
  render(createElement(P1Row, { event: poi, depth: "I", onDepth }));
  state.presses.find((p) => p.accessibilityLabel === t("common.close"))!.onPress();
  expect(onDepth).toHaveBeenLastCalledWith("F");
});
it("NOW ticks never set Focus and explicit collapse remains deselected", () => {
  const props = { projection, date: "2026-10-10", zone: "UTC", services: {} };
  render(createElement(DayFeed, props));
  state.presses.find((p) => p.accessibilityLabel === poi.title)!.onPress();
  expect(render(createElement(DayFeed, props))).toContain(
    'data-testid="focus-selected-region"',
  );
  state.presses.find((p) => p.accessibilityLabel === poi.title)!.onPress();
  const html = render(createElement(DayFeed, props));
  expect(html).not.toContain('data-testid="focus-selected-region"');
  expect(html).toContain('data-testid="now-within"');
});
it("P2 enlarged Focus uses the accepted stacked fallback and a separate collapse path", () => {
  state.scale = 2.4;
  const html = render(
    createElement(FlightRows, {
      fixture: flightPresentation(flight, [])!,
      focused: true,
    }),
  );
  expect(html).toContain('data-testid="flight-large-stacked"');
  expect(html).toContain("02:00");
  expect(html).toContain("04:00");
  const source = readFileSync(new URL("DayFeed.tsx", import.meta.url), "utf8");
  expect(source).toContain('label={t("feed.collapse")}');
});
it("both themes keep unsupported actions absent and expose full authored identity", () => {
  for (const scheme of ["light", "dark"]) {
    state.scheme = scheme;
    const html = render(
      createElement(P1Row, { event: poi, depth: "F", onDepth: vi.fn() }),
    );
    expect(html).toContain(poi.title);
    expect(
      state.presses.some((p) => /Move|Map|Navigate/.test(p.accessibilityLabel)),
    ).toBe(false);
  }
});

it("keeps Gallery factories, unsupported capabilities and write commands out of production readers/renderers", () => {
  for (const name of [
    "TripScreen.tsx",
    "DayFeed.tsx",
    "P1Row.tsx",
    "FlightRows.tsx",
    "presentation.ts",
  ]) {
    const source = readFileSync(new URL(name, import.meta.url), "utf8");
    expect(source).not.toMatch(
      /create(?:Gallery|MixedDays|P1Fixtures|FlightFixtures)|trip-experience-gallery|fixture:\/\/|synthetic:/,
    );
  }
  const reader = readFileSync(
    new URL("../../data/repositories/tripDayFeedRepository.ts", import.meta.url),
    "utf8",
  );
  expect(reader).not.toMatch(
    /\b(?:runAsync|rebuild|refreshCollection|INSERT|UPDATE|DELETE|openDatabase)\b/,
  );
});

// Faroe-derived patterns run through these same accepted components and native mocks.
it("F1 A1/A3/TC13: mixed historical P1/P2 keeps order, identities and planned state", () => {
  const f = faroeNegativeFixtures();
  state.instant = "2027-02-10T11:00:00Z";
  const bytes = JSON.stringify(f.day);
  const html = render(
    createElement(DayFeed, {
      projection: f.day,
      date: syntheticDate,
      zone: "UTC",
      services: f.services,
    }),
  );
  const positions = [f.before.title, f.segment.title, f.after.title].map((label, i) =>
    state.presses.findIndex(
      (p, n) =>
        p.accessibilityLabel === label &&
        (i !== 2 ||
          n > state.presses.findIndex((a) => a.accessibilityLabel === f.segment.title)),
    ),
  );
  expect(positions.every((n) => n >= 0)).toBe(true);
  expect(positions[0]).toBeLessThan(positions[1]);
  expect(positions[1]).toBeLessThan(positions[2]);
  expect(html).toContain("NZ901");
  expect(html).not.toMatch(
    /now-within|now-between|Connection|Boarding|confirmed|completed/,
  );
  expect(
    f.day.events.every(
      (e) => e.participant_scope === "UNASSIGNED" && e.status === "planned",
    ),
  ).toBe(true);
  expect(JSON.stringify(f.day)).toBe(bytes);
});
it("F1 A1/A2/B7: Browse is compact and P1/P2 Focus retains the subtle theme outline", () => {
  const f = faroeNegativeFixtures();
  for (const scheme of ["light", "dark"] as const) {
    state.scheme = scheme;
    state.hooks = [];
    let html = render(
      createElement(P1Row, { event: f.before, depth: "B", onDepth: vi.fn() }),
    );
    expect(html).not.toContain('data-testid="focus-selected-region"');
    expect(state.nodes.find((n) => n.children === f.before.title)?.numberOfLines).toBe(2);
    html = render(
      createElement(P1Row, { event: f.before, depth: "F", onDepth: vi.fn() }),
    );
    expect(html).toContain("Synthetic quay");
    expect(
      state.nodes.find((n) => n.testID === "focus-selected-region")!.style,
    ).toMatchObject({ borderWidth: 1, borderColor: uiPalette(scheme).separator });
    expect(
      state.nodes.find((n) => n.children === f.before.title)?.numberOfLines,
    ).toBeUndefined();
    state.hooks = [];
    const props = {
      projection: f.day,
      date: syntheticDate,
      zone: "UTC",
      services: f.services,
    };
    render(createElement(DayFeed, props));
    state.presses.find((p) => p.accessibilityLabel === f.segment.title)!.onPress();
    html = render(createElement(DayFeed, props));
    expect(
      state.nodes.some(
        (n) =>
          n.style?.borderWidth === 1 &&
          n.style?.borderColor === uiPalette(scheme).separator,
      ),
    ).toBe(true);
    expect(html).toContain("NZ901");
    expect(html).not.toMatch(/Move|Navigate|Boarding|Booking/);
  }
});
it("F1 A3/B5: P1/P2 rails share width for normal and enlarged text", () => {
  const f = faroeNegativeFixtures();
  for (const scale of [1, 2.4]) {
    state.scale = scale;
    state.hooks = [];
    render(createElement(P1Row, { event: f.before, depth: "B", onDepth: vi.fn() }));
    expect(
      state.nodes.some(
        (n) =>
          Array.isArray(n.style) &&
          n.style.some((s: Record<string, any>) => s?.width === timeRailWidth(scale)),
      ),
    ).toBe(true);
    state.hooks = [];
    render(
      createElement(FlightRows, {
        fixture: flightPresentation(f.segment, [f.services[f.segment.id][0]])!,
      }),
    );
    expect(
      state.nodes.some(
        (n) =>
          Array.isArray(n.style) &&
          n.style.some((s: Record<string, any>) => s?.width === timeRailWidth(scale)),
      ),
    ).toBe(true);
  }
});
it("F1 A4/TC16/TC22/B2: dangling Ledger hints and blank amounts never become financial rows", () => {
  const f = faroeNegativeFixtures();
  const event = Object.assign(structuredClone(f.before), {
    expenses: [
      {
        id: f.untrusted.ledgerReference,
        title: f.before.title,
        amount: f.untrusted.amount,
      },
    ],
    bookingStatus: f.untrusted.bookingStatus,
    travelerIds: f.untrusted.travelerIds,
  });
  const bytes = JSON.stringify(event);
  for (const depth of ["B", "F", "I"] as const) {
    state.hooks = [];
    const html = render(createElement(P1Row, { event, depth, onDepth: vi.fn() }));
    expect(html).not.toMatch(
      /L-0806-XX|CNY|1266\.87|¥|confirmed|F1_SYNTHETIC_PRIVATE_CANARY/,
    );
  }
  expect(JSON.stringify(event)).toBe(bytes);
  expect(event.expenses).toHaveLength(1);
  expect(event.expenses[0].amount).toBe("");
});
it("F1 TC17/B1/B6: incomplete Flight never invents clocks, terminal, travelers or booking status", () => {
  const f = faroeNegativeFixtures(),
    flight = flightPresentation(f.incomplete, [])!;
  for (const options of [{}, { focused: true }, { immersive: true }]) {
    state.hooks = [];
    const html = render(createElement(FlightRows, { fixture: flight, ...options }));
    expect(html).toContain(t("flight.unknownAirport"));
    expect(html).not.toMatch(
      /00:00|NZ901|Terminal|confirmed|Booking|Boarding|Traveler|CNY|¥/,
    );
    expect(state.presses).toHaveLength(0);
  }
  expect(f.untrusted.travelerIds).toBeNull();
  expect(flight.supplemental.endpoints.ORIGIN.terminal).toBeNull();
});
it("F1 A2: explicit test-only terminal renders, while the production adapter withholds it", () => {
  const f = faroeNegativeFixtures(),
    flight = flightPresentation(f.segment, f.services[f.segment.id])!;
  expect(flight.supplemental.endpoints.ORIGIN.terminal).toBeNull();
  flight.supplemental.endpoints.ORIGIN.terminal = "TEST-T1";
  const html = render(createElement(FlightRows, { fixture: flight, focused: true }));
  expect(html).toContain("TEST-T1");
  expect(html).not.toContain("TEST-T2");
});
it("F1 B7: long multilingual title keeps full identity and unbounded Focus in both themes", () => {
  const f = faroeNegativeFixtures();
  f.before.title = "Synthetic 博物馆 · Musée · long title ".repeat(8);
  for (const scheme of ["light", "dark"]) {
    state.scheme = scheme;
    state.scale = 2.4;
    state.hooks = [];
    render(createElement(P1Row, { event: f.before, depth: "F", onDepth: vi.fn() }));
    const title = state.nodes.find((n) => n.children === f.before.title)!;
    expect(title.numberOfLines).toBeUndefined();
    expect(state.presses.some((p) => p.accessibilityLabel === f.before.title)).toBe(true);
    title.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } });
    render(createElement(P1Row, { event: f.before, depth: "F", onDepth: vi.fn() }));
    expect(
      state.nodes.some(
        (n) =>
          Array.isArray(n.style) &&
          n.style.some((s: Record<string, any>) => s?.position === "relative"),
      ),
    ).toBe(true);
  }
});
it("F1 B7/TC17: unavailable Flight optional labels and the empty detail row are omitted", () => {
  const f = faroeNegativeFixtures();
  render(
    createElement(FlightRows, {
      fixture: flightPresentation(f.incomplete, [])!,
      focused: true,
    }),
  );
  expect(
    state.nodes.filter((n) =>
      ["departure-terminal", "arrival-terminal", "duration"].includes(n.testID),
    ),
  ).toHaveLength(0);
  expect(state.nodes.some((n) => n.testID === "flight-row-3")).toBe(false);
});

it.each(["ORIGIN", "DESTINATION"] as const)(
  "F1-R1: Focus preserves a %s-only terminal without empty optional labels",
  (role) => {
    const f = faroeNegativeFixtures();
    const flight = flightPresentation(f.incomplete, [])!;
    flight.supplemental.endpoints[role].terminal = "TEST-T1";
    const original = JSON.stringify(flight);
    const html = render(createElement(FlightRows, { fixture: flight, focused: true }));
    expect(html).toContain(t("flight.terminal", { terminal: "TEST-T1" }));
    const optional = state.nodes.filter((n) =>
      ["departure-terminal", "arrival-terminal", "duration"].includes(n.testID),
    );
    expect(optional.map((n) => n.testID)).toEqual([
      role === "ORIGIN" ? "departure-terminal" : "arrival-terminal",
    ]);
    expect(state.nodes.some((n) => n.testID === "flight-row-3")).toBe(true);
    expect(state.nodes.some((n) => n.testID === "arrival-time")).toBe(false);
    expect(state.nodes.some((n) => n.style?.width === 76)).toBe(true);
    expect(JSON.stringify(flight)).toBe(original);
  },
);
it("F1-R1: Focus duration-only optional facts retain qualified duration and arrival clock", () => {
  const f = faroeNegativeFixtures();
  const flight = flightPresentation(f.segment, f.services[f.segment.id])!;
  render(createElement(FlightRows, { fixture: flight, focused: true }));
  expect(state.nodes.find((n) => n.testID === "duration")?.children).toBe(
    t("flight.duration", { hours: 2, minutes: 0 }),
  );
  expect(state.nodes.find((n) => n.testID === "arrival-time")?.children).toBe("12:00");
  expect(state.nodes.some((n) => n.testID === "departure-terminal")).toBe(false);
  expect(state.nodes.some((n) => n.testID === "arrival-terminal")).toBe(false);
  expect(state.nodes.some((n) => n.testID === "flight-row-3")).toBe(true);
});
it("F1-R1: populated Focus keeps Compact A content and column styles in both themes", () => {
  const f = faroeNegativeFixtures();
  const flight = flightPresentation(f.segment, f.services[f.segment.id])!;
  flight.supplemental.endpoints.ORIGIN.terminal = "TEST-T1";
  flight.supplemental.endpoints.DESTINATION.terminal = "TEST-T2";
  for (const scheme of ["light", "dark"]) {
    state.scheme = scheme;
    const browse = render(createElement(FlightRows, { fixture: flight }));
    const columns = state.nodes
      .filter((n) =>
        ["arrival-time", "departure-terminal", "duration", "arrival-terminal"].includes(
          n.testID,
        ),
      )
      .map((n) => ({ id: n.testID, value: n.children, style: n.style }));
    const focus = render(createElement(FlightRows, { fixture: flight, focused: true }));
    expect(focus).toBe(browse);
    expect(
      state.nodes
        .filter((n) =>
          ["arrival-time", "departure-terminal", "duration", "arrival-terminal"].includes(
            n.testID,
          ),
        )
        .map((n) => ({ id: n.testID, value: n.children, style: n.style })),
    ).toEqual(columns);
    expect(columns.map((n) => n.value)).toEqual([
      "12:00",
      t("flight.terminal", { terminal: "TEST-T1" }),
      t("flight.duration", { hours: 2, minutes: 0 }),
      t("flight.terminal", { terminal: "TEST-T2" }),
    ]);
  }
});
it("F1-R1: arrival-only Focus retains meaningful third row without guessing duration", () => {
  const f = faroeNegativeFixtures();
  f.segment.boundaries[0] = structuredClone(f.incomplete.boundaries[0]);
  render(
    createElement(FlightRows, {
      fixture: flightPresentation(f.segment, [])!,
      focused: true,
    }),
  );
  expect(state.nodes.find((n) => n.testID === "arrival-time")?.children).toBe("12:00");
  expect(state.nodes.some((n) => n.testID === "flight-row-3")).toBe(true);
  expect(
    state.nodes.some((n) =>
      ["departure-terminal", "arrival-terminal", "duration"].includes(n.testID),
    ),
  ).toBe(false);
});
it("F1-R1: unqualified time evidence cannot become a displayed duration", () => {
  const f = faroeNegativeFixtures();
  f.segment.boundaries[0].quality = "ESTIMATED";
  render(
    createElement(FlightRows, {
      fixture: flightPresentation(f.segment, [])!,
      focused: true,
    }),
  );
  expect(state.nodes.some((n) => n.testID === "duration")).toBe(false);
  expect(state.nodes.find((n) => n.testID === "arrival-time")?.children).toBe("12:00");
});
it("F1-R1: incomplete Browse retains accepted Compact A three-row geometry", () => {
  const f = faroeNegativeFixtures();
  render(createElement(FlightRows, { fixture: flightPresentation(f.incomplete, [])! }));
  for (const id of [
    "flight-row-1",
    "flight-row-2",
    "flight-row-3",
    "arrival-time",
    "departure-terminal",
    "arrival-terminal",
    "duration",
  ])
    expect(state.nodes.some((n) => n.testID === id)).toBe(true);
});

it("Immersive dismissal restores nonzero scroll and keeps manual Focus/date across NOW ticks and enrichment", () => {
  const props = { projection, date: "2026-10-10", zone: "UTC", services: {} };
  render(createElement(DayFeed, props));
  state.nodes
    .find((n) => n.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 293.33 } } });
  state.presses
    .find(
      (p) =>
        p.accessibilityLabel === flight.title &&
        p.accessibilityHint === t("p1r.focusHint"),
    )!
    .onPress();
  render(createElement(DayFeed, props));
  state.presses
    .find(
      (p) =>
        p.accessibilityLabel === flight.title &&
        p.accessibilityHint === t("p1r.immersiveHint"),
    )!
    .onPress();
  render(createElement(DayFeed, props));
  const modal = state.nodes.find((n) => n.onDismiss)!;
  expect(modal.visible).toBe(true);
  state.instant = "2026-10-10T03:00:00Z";
  const enriched = {
    ...props,
    projection: {
      ...projection,
      events: projection.events.map((e) => ({
        ...e,
        semantic_revision: e.semantic_revision + 1,
      })),
    },
  };
  render(createElement(DayFeed, enriched));
  state.presses.find((p) => p.accessibilityLabel === t("common.close"))!.onPress();
  modal.onDismiss();
  const html = render(createElement(DayFeed, enriched));
  expect(state.scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 293.33, animated: false });
  expect(state.nodes.some((n) => n.onDismiss)).toBe(false);
  expect(
    state.presses.filter((p) => p.accessibilityHint === t("p1r.immersiveHint")),
  ).toHaveLength(1);
  expect(html).toContain('data-testid="now-within"');
  expect(props.date).toBe("2026-10-10");
});
it("switching Focus between P1/P2 never leaves two active Focus rows", () => {
  const props = { projection, date: "2026-10-10", zone: "UTC", services: {} };
  render(createElement(DayFeed, props));
  state.presses.find((p) => p.accessibilityLabel === poi.title)!.onPress();
  render(createElement(DayFeed, props));
  state.presses
    .find(
      (p) =>
        p.accessibilityLabel === flight.title &&
        p.accessibilityHint === t("p1r.focusHint"),
    )!
    .onPress();
  const html = render(createElement(DayFeed, props));
  expect(html).not.toContain('data-testid="focus-selected-region"');
  expect(
    state.presses.filter((p) => p.accessibilityHint === t("p1r.immersiveHint")),
  ).toHaveLength(1);
});
it("Android restores the captured offset even without a native Modal dismissal event", () => {
  state.platform = "android";
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
  try {
    const props = { projection, date: "2026-10-10", zone: "UTC", services: {} };
    render(createElement(DayFeed, props));
    state.nodes
      .find((n) => n.onScroll)!
      .onScroll({ nativeEvent: { contentOffset: { y: 120 } } });
    state.presses.find((p) => p.accessibilityLabel === flight.title)!.onPress();
    render(createElement(DayFeed, props));
    state.presses.find((p) => p.accessibilityLabel === flight.title)!.onPress();
    render(createElement(DayFeed, props));
    state.nodes.find((n) => n.onRequestClose)!.onRequestClose();
    expect(state.scrollTo).toHaveBeenCalledExactlyOnceWith({ y: 120, animated: false });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("v2 qualified unknown clocks and names omit empty rows in Browse, large Focus and Immersive", () => {
  const f = flightPresentation(
    {
      ...flight,
      boundaries: flight.boundaries.map((b) => ({
        ...b,
        local_time: null,
        instant: null,
        source_instant: null,
        quality: "UNKNOWN",
        clock_precision: null,
      })),
    },
    [],
    {
      qualification: "QUALIFIED",
      flightNumberLiteral: "NZ1",
      services: [],
      endpoints: {
        ORIGIN: { code: "AKL", name: null, terminal: null },
        DESTINATION: { code: "PVG", name: null, terminal: null },
      },
    },
  )!;
  let html = render(createElement(FlightRows, { fixture: f }));
  expect(html).toContain("AKL");
  expect(html).toContain("PVG");
  expect(html).not.toContain('data-testid="flight-row-2"');
  expect(html).not.toContain('data-testid="flight-row-3"');
  state.scale = 2;
  const focused = createElement(FlightRows, { fixture: f, focused: true });
  render(focused);
  state.nodes
    .find((p) => p.testID === "flight-responsive-focus")!
    .onLayout({ nativeEvent: { layout: { width: 360 } } });
  html = render(focused);
  expect(html).not.toContain('data-testid="flight-large-times"');
  expect(html).not.toContain("00:00");
  html = render(createElement(FlightRows, { fixture: f, immersive: true }));
  expect(html).not.toContain("00:00");
});

it("DL1 uses production NOW/P1 and retains Trip/date/Focus across Immersive and nonzero scroll return", () => {
  state.instant = "2040-01-01T00:00:00Z"; // The fixture clock owns only this explicit input.
  const fixture = getFixtureCatalog()[0];
  let html = render(createElement(DayFeedLabScreen));
  expect(html).toContain('data-testid="now-within"');
  state.nodes
    .find((n) => n.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 320 } } });
  state.presses
    .find((p) => p.accessibilityLabel === fixture.projection.events[0].title)!
    .onPress();
  render(createElement(DayFeedLabScreen));
  state.presses.find((p) => p.accessibilityLabel === t("p1r.richerDetails"))!.onPress();
  html = render(createElement(DayFeedLabScreen));
  expect(html).toContain(fixture.id);
  expect(html).toContain("2027-01-15");
  state.presses.find((p) => p.accessibilityLabel === t("common.close"))!.onPress();
  const onDismiss = state.nodes.find((n) => n.onDismiss)!.onDismiss;
  html = render(createElement(DayFeedLabScreen));
  onDismiss();
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 320, animated: false });
  expect(html).toContain('data-testid="focus-selected-region"');
  expect(html).toContain(fixture.id);
});
it("DL1 controls switch bounded dates and Trips using the same P2 renderer in either theme", () => {
  for (const scheme of ["light", "dark"]) {
    state.scheme = scheme;
    state.hooks = [];
    render(createElement(DayFeedLabScreen));
    state.presses.find((p) => p.accessibilityLabel === t("dayLab.next"))!.onPress();
    let html = render(createElement(DayFeedLabScreen));
    expect(html).toContain("2027-01-16");
    state.presses
      .find(
        (p) =>
          p.accessibilityLabel ===
          formatUiDate(new Date("2027-01-17T12:00:00Z"), {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }),
      )!
      .onPress();
    render(createElement(DayFeedLabScreen));
    expect(
      state.presses.find((p) => p.accessibilityLabel === t("dayLab.next"))!.disabled,
    ).toBe(true);
    state.presses
      .find((p) => p.accessibilityLabel.startsWith(t("dayLab.trip")))!
      .onPress();
    render(createElement(DayFeedLabScreen));
    state.presses
      .find((p) => p.accessibilityLabel === getFixtureCatalog()[1].title)!
      .onPress();
    html = render(createElement(DayFeedLabScreen));
    expect(html).toContain("day-lab-faroe");
    expect(html).toContain("2027-01-15");
    expect(html).toContain('data-testid="flight-browse-geometry"');
    expect(html).toContain(getFixtureCatalog()[1].projection.events[2].title);
  }
});

it("DL2 source selection uses one Feed, retains fixture context and withholds prior Account data immediately", async () => {
  const f = faroeNegativeFixtures();
  const scope = { accountId: "core-synthetic-actor", generation: getAccountGeneration() };
  const coreTrip = "core-synthetic-trip";
  const projection = {
    ...f.day,
    version: 2 as const,
    accountId: scope.accountId,
    tripId: coreTrip,
    items: [],
    flightFacts: {},
    source: {
      epoch: "synthetic",
      revision: "1",
      accessRevision: 1,
      actorPersonBindingHash: "synthetic",
      participatingRosterHash: "synthetic",
      manifestSha256: "synthetic",
    },
    query: (date: string, zone: string) => ({
      ...itemsForLocalDate(f.day, date, zone),
      coreRows: [],
    }),
  };
  vi.mocked(readTripDayFeedLab).mockResolvedValue({
    candidates: async () => ({ scope, tripIds: [coreTrip] }),
    trip: async () => ({
      scope,
      projection,
      dates: [syntheticDate],
      unsupportedFamilies: [],
    }),
  });
  render(createElement(DayFeedLabScreen));
  expect(
    state.presses.find((p) => p.accessibilityLabel === t("dayLab.coreSource"))!.disabled,
  ).toBe(true);
  state.effects[0]();
  await vi.waitFor(() => {
    render(createElement(DayFeedLabScreen));
    expect(
      state.presses.find((p) => p.accessibilityLabel === t("dayLab.coreSource"))!
        .disabled,
    ).toBe(false);
  });
  state.presses.find((p) => p.accessibilityLabel === t("dayLab.next"))!.onPress();
  render(createElement(DayFeedLabScreen));
  state.presses.find((p) => p.accessibilityLabel === t("dayLab.coreSource"))!.onPress();
  render(createElement(DayFeedLabScreen));
  state.effects.at(-1)!();
  await vi.waitFor(() => {
    const html = render(createElement(DayFeedLabScreen));
    expect(html).toContain(coreTrip);
    expect(html).toContain('data-testid="flight-browse-geometry"');
    expect(html).not.toContain("day-lab-nelson");
  });
  state.presses.find((p) => p.accessibilityLabel === f.segment.title)!.onPress();
  render(createElement(DayFeedLabScreen));
  state.presses
    .find((p) => p.accessibilityLabel === t("dayLab.fixtureSource"))!
    .onPress();
  let html = render(createElement(DayFeedLabScreen));
  expect(html).toContain("day-lab-nelson");
  expect(html).toContain("2027-01-16");
  expect(html).not.toContain(coreTrip);
  state.presses.find((p) => p.accessibilityLabel === t("dayLab.coreSource"))!.onPress();
  render(createElement(DayFeedLabScreen));
  state.effects.at(-1)!();
  await vi.waitFor(() =>
    expect(render(createElement(DayFeedLabScreen))).toContain(f.segment.title),
  );
  advanceAccountGeneration();
  html = render(createElement(DayFeedLabScreen));
  expect(html).not.toContain(coreTrip);
  expect(html).not.toContain(f.segment.title);
  expect(
    state.presses.find((p) => p.accessibilityLabel === t("dayLab.coreSource"))!.disabled,
  ).toBe(true);
});
it("DL2 denied capability never enables Core or replaces Fixture data", async () => {
  vi.mocked(readTripDayFeedLab).mockRejectedValue(new Error("CORE_LAB_AUTH_REQUIRED"));
  render(createElement(DayFeedLabScreen));
  state.effects[0]();
  await vi.waitFor(() => {
    const html = render(createElement(DayFeedLabScreen));
    expect(html).toContain(t("dayLab.read.AUTH_REQUIRED"));
    expect(html).toContain("day-lab-nelson");
    expect(
      state.presses.find((p) => p.accessibilityLabel === t("dayLab.coreSource"))!
        .disabled,
    ).toBe(true);
  });
});

it("DL4 Stay renderer uses shared Focus/Immersive, typed details and nonzero scroll return; missing renderer falls back", () => {
  const stay = getLabFixtures().find((entry) => entry.id === stayTripId)!;
  const props = {
    projection: stay.projection,
    services: stay.services,
    date: stay.selectedDate,
    zone: stay.zone,
    instant: stay.instant,
    query: stay.query,
    renderer: stay.renderer,
  };
  let html = render(createElement(DayFeed, props));
  const title = stay.projection.events[0].title;
  expect(html).toContain(title);
  expect(html).not.toContain(t("dayLab.stayInstructions"));
  state.nodes
    .find((n) => n.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 217 } } });
  state.presses.find((p) => p.accessibilityLabel === title)!.onPress();
  html = render(createElement(DayFeed, props));
  expect(html).toContain(t("p3.role.base"));
  expect(html).not.toContain(t("dayLab.stayInstructions"));
  state.presses.find((p) => p.accessibilityLabel === t("p1r.richerDetails"))!.onPress();
  html = render(createElement(DayFeed, props));
  expect(state.nodes.some((n) => n.contentInsetAdjustmentBehavior === "automatic")).toBe(
    true,
  );
  const onDismiss = state.nodes.find((n) => n.onDismiss)!.onDismiss;
  state.presses.find((p) => p.accessibilityLabel === t("common.close"))!.onPress();
  render(createElement(DayFeed, props));
  onDismiss();
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 217, animated: false });
  expect(render(createElement(DayFeed, { ...props, renderer: () => null }))).toContain(
    title,
  );
});

const p3 = (date: string, extra: Partial<StayFacts> = {}) => {
  const fixture = stayContribution();
  const row = composeDayStream(fixture.query!(date, fixture.zone), fixture.instant)
    .rows[0];
  return {
    row,
    container: undefined,
    facts: { ...fixture.supplemental!, ...extra },
    onDepth: vi.fn(),
  };
};

it("G2 passes its existing Future/Today/Past context to contributed rows", () => {
  const fixture = stayContribution();
  for (const [date, expected] of [
    ["2027-01-15", "PAST"],
    ["2027-01-16", "TODAY"],
    ["2027-01-18", "FUTURE"],
  ] as const) {
    const seen: string[] = [];
    render(
      createElement(DayFeed, {
        projection: fixture.projection,
        services: fixture.services,
        date,
        zone: fixture.zone,
        instant: "2027-01-16T12:00:00Z",
        query: fixture.query,
        renderer: (props) => {
          seen.push(props.context ?? "MISSING");
          return null;
        },
      }),
    );
    expect(seen).toContain(expected);
  }
});

it("P3 renders one end-of-day Base without a made-up time or instruction summary", () => {
  for (const date of ["2027-01-16", "2027-01-17"]) {
    const props = p3(date);
    expect(props.row.position).toBe("BASE");
    expect(
      props.row.coreRowKeys.every((key) =>
        ["TONIGHT", "BASE_FROM", "BASE_RETURN"].includes(key.projectionRole),
      ),
    ).toBe(true);
    const html = render(
      createElement(StayRow, { ...props, depth: "B", context: "TODAY" }),
    );
    expect(html).toContain(t("p3.role.base"));
    expect(html).not.toContain("00:00");
    expect(html).not.toContain(t("dayLab.stayInstructions"));
  }
});
it("P3 keeps the shared within-row NOW marker in Browse and Focus", () => {
  const props = p3("2027-01-15");
  const marker = createElement("span", { "data-testid": "p3-now-marker" }, "NOW");
  expect(
    render(
      createElement(StayRow, {
        ...props,
        depth: "B",
        context: "TODAY",
        withinMarker: marker,
      }),
    ),
  ).toContain('data-testid="p3-now-marker"');
  expect(
    render(
      createElement(StayRow, {
        ...props,
        depth: "F",
        context: "TODAY",
        withinMarker: marker,
      }),
    ),
  ).toContain('data-testid="p3-now-marker"');
  expect(
    render(
      createElement(StayRow, {
        ...props,
        depth: "I",
        context: "TODAY",
        withinMarker: marker,
      }),
    ),
  ).not.toContain('data-testid="p3-now-marker"');
});
it("P3 Browse shows only known role clocks and never reuses them for Daily Base", () => {
  const rendered = (date: string) => {
    const props = p3(date);
    const source = props.row.item.event.boundaries[0];
    const event = {
      ...props.row.item.event,
      boundaries: [
        {
          ...source,
          role: "START" as const,
          local_time: "14:00:00",
          quality: "EXACT" as const,
          clock_precision: 0,
        },
        {
          ...source,
          role: "END" as const,
          local_time: "10:00:00",
          quality: "EXACT" as const,
          clock_precision: 0,
        },
      ],
    };
    return render(
      createElement(StayRow, {
        ...props,
        row: { ...props.row, item: { ...props.row.item, event } },
        depth: "B",
        context: "FUTURE",
      }),
    );
  };
  expect(rendered("2027-01-15")).toContain("14:00");
  expect(rendered("2027-01-15")).not.toContain("10:00");
  expect(rendered("2027-01-18")).toContain("10:00");
  expect(rendered("2027-01-18")).not.toContain("14:00");
  expect(rendered("2027-01-16")).not.toMatch(/14:00|10:00/);
  const unknown = p3("2027-01-15");
  expect(
    render(createElement(StayRow, { ...unknown, depth: "B", context: "FUTURE" })),
  ).not.toMatch(/14:00|10:00/);
});

it("P3 single-night same-day roles use one Stay identity and singular date copy", () => {
  const props = p3("2027-01-15", { checkout: "2027-01-16", nights: 1 });
  const row = {
    ...props.row,
    coreRowKeys: [
      {
        itemId: props.row.item.event.id,
        projectionRole: "CHECKIN",
        localDate: "2027-01-15",
      },
      {
        itemId: props.row.item.event.id,
        projectionRole: "CHECKOUT",
        localDate: "2027-01-15",
      },
    ],
  };
  const html = render(
    createElement(StayRow, {
      ...props,
      row,
      depth: "F",
      context: "FUTURE",
    }),
  );
  expect(html).toContain(t("p3.role.sameDay"));
  expect(html).toContain("1 night");
  expect(html).not.toContain("1 nights");
});

it("P3 Future shows confirmed only with source evidence, and separates exact map from keyword search", () => {
  const props = p3("2027-01-15", { area: "Nelson" });
  expect(
    stayMapUrl(props.row.item.event, { ...props.facts, area: undefined }),
  ).toBeNull();
  expect(stayMapUrl(props.row.item.event, props.facts)).toContain(
    "Synthetic%20Harbour%20Lodge%20Nelson",
  );
  expect(
    stayMapUrl(
      { ...props.row.item.event, accepted_latitude: -41.27, accepted_longitude: 173.28 },
      props.facts,
    ),
  ).toContain("ll=-41.27,173.28");
  expect(stayDirectionsUrl(props.row.item.event)).toBeNull();
  const accepted = {
    ...props.row.item.event,
    accepted_address_line1: "4 Harbour Road",
    accepted_address: "4 Harbour Road, Nelson, New Zealand",
    accepted_address_locality: "Nelson",
  };
  expect(stayMapUrl(accepted, props.facts)).toContain(
    "4%20Harbour%20Road%2C%20Nelson%2C%20New%20Zealand",
  );
  expect(stayDirectionsUrl(accepted)).toContain(
    "4%20Harbour%20Road%2C%20Nelson%2C%20New%20Zealand",
  );
  expect(stayDirectionsUrl({ ...accepted, accepted_address: null })).toContain(
    "4%20Harbour%20Road%2C%20Nelson",
  );
  expect(
    stayDirectionsUrl({
      ...accepted,
      accepted_address: null,
      accepted_address_locality: null,
    }),
  ).toBeNull();
  expect(
    stayDirectionsUrl({
      ...props.row.item.event,
      accepted_latitude: -41.27,
      accepted_longitude: 173.28,
    }),
  ).toContain("daddr=-41.27,173.28");
  let html = render(createElement(StayRow, { ...props, depth: "B", context: "FUTURE" }));
  expect(html).not.toContain(t("p3.confirmed"));
  html = render(
    createElement(StayRow, {
      ...props,
      facts: { ...props.facts, confirmedBySource: true },
      depth: "F",
      context: "FUTURE",
    }),
  );
  expect(html).toContain(t("p3.confirmed"));
  expect(html).toContain(t("p3.viewMap"));
  expect(html).not.toContain(t("p3.directions"));
});

it("P3 Focus opens one original directly and offers a chooser for several originals", () => {
  const one = vi.fn(),
    other = vi.fn();
  const props = p3("2027-01-15", {
    instructionOriginals: [{ id: "a", title: "Original check-in PDF", onOpen: one }],
    bookingOriginals: [
      { id: "b", title: "Room A confirmation", onOpen: one },
      { id: "c", title: "Room B confirmation", onOpen: other },
    ],
  });
  let html = render(createElement(StayRow, { ...props, depth: "F", context: "TODAY" }));
  expect(html).toContain(t("p3.instructions"));
  expect(html).not.toContain("Room A confirmation");
  state.presses.find((p) => p.accessibilityLabel === t("p3.instructions"))!.onPress();
  expect(one).toHaveBeenCalledTimes(1);
  state.presses.find((p) => p.accessibilityLabel === t("p3.booking"))!.onPress();
  html = render(createElement(StayRow, { ...props, depth: "F", context: "TODAY" }));
  expect(html).toContain("Room A confirmation");
  expect(html).toContain("Room B confirmation");
  state.presses.find((p) => p.accessibilityLabel === "Room B confirmation")!.onPress();
  expect(other).toHaveBeenCalledTimes(1);
});

it("P3 Today quick actions follow the selected Stay role and omit absent originals", () => {
  const checkin = p3("2027-01-15", {
    instructionOriginals: [{ id: "in", title: "Arrival PDF", onOpen: vi.fn() }],
    checkoutOriginals: [{ id: "out", title: "Departure PDF", onOpen: vi.fn() }],
    checkoutBy: "10:00",
  });
  let html = render(createElement(StayRow, { ...checkin, depth: "F", context: "TODAY" }));
  expect(html).toContain(t("p3.instructions"));
  expect(html).not.toContain(t("p3.checkoutInstructions"));
  const base = p3("2027-01-16", checkin.facts);
  html = render(createElement(StayRow, { ...base, depth: "F", context: "TODAY" }));
  expect(html).not.toContain(t("p3.instructions"));
  expect(html).not.toContain(t("p3.checkoutInstructions"));
  const checkout = p3("2027-01-18", checkin.facts);
  html = render(createElement(StayRow, { ...checkout, depth: "F", context: "TODAY" }));
  expect(html).toContain(t("p3.checkoutInstructions"));
  expect(html).toContain(t("p3.checkoutBy", { time: "10:00" }));
  expect(html).not.toContain(t("p3.instructions"));
});

it("P3 Past counts are conditional and Immersive limits previews to three without attendance claims", () => {
  const props = p3("2027-01-18", {
    photos: {
      count: 4,
      previews: [1, 2, 3, 4].map((n) => ({ id: String(n), uri: `file:///photo-${n}` })),
      onViewAll: vi.fn(),
    },
    expenses: { count: 2 },
    registeredGuests: ["Sourced guest"],
    bookingOriginals: [
      { id: "booking", title: "Original confirmation", onOpen: vi.fn() },
    ],
  });
  let html = render(createElement(StayRow, { ...props, depth: "B", context: "PAST" }));
  expect(html).toContain(t("p3.photoCount", { count: 4 }));
  expect(html).not.toContain(t("p3.expenseCount", { count: 2 }));
  html = render(createElement(StayRow, { ...props, depth: "F", context: "PAST" }));
  expect(html).toContain(t("p3.photoCount", { count: 4 }));
  expect(html).toContain(t("p3.expenseCount", { count: 2 }));
  expect(html).toContain(t("p3.booking"));
  html = render(createElement(StayRow, { ...props, depth: "I", context: "PAST" }));
  expect(html).toContain(t("p3.expenseCount", { count: 2 }));
  expect(html).toContain("Sourced guest");
  expect(
    state.nodes.filter((n) => n.source?.uri?.startsWith("file:///photo")),
  ).toHaveLength(3);
  expect(html).not.toMatch(/Stayed|Completed|Visited|Total Cost|My Share/);
  html = render(
    createElement(StayRow, { ...p3("2027-01-18"), depth: "I", context: "PAST" }),
  );
  expect(html).not.toContain(t("p3.viewAllPhotos"));
  expect(html).not.toContain(t("p3.photoCount", { count: 0 }));
});

it("P3 lower actions and management appear only when owning callbacks are supplied", () => {
  const props = p3("2027-01-16");
  let html = render(createElement(StayRow, { ...props, depth: "I", context: "TODAY" }));
  expect(html).not.toContain(t("p3.manage"));
  expect(html).not.toContain(t("p3.addPhoto"));
  html = render(
    createElement(StayRow, {
      ...props,
      facts: { ...props.facts, onManage: vi.fn(), onAddPhoto: vi.fn() },
      depth: "I",
      context: "TODAY",
    }),
  );
  expect(html).toContain(t("p3.manage"));
  expect(html).toContain(t("p3.addPhoto"));
  expect(html).not.toContain(t("p3.addExpense"));
});

it("P3 accepted Core adapter uses only owned Stay dates/name and withholds unsupported actions", () => {
  const props = p3("2027-01-16");
  const projection = {
    tripId: "c0000000-0000-4000-8000-000000000003",
    events: [stayContribution().projection.events[0]],
    items: [
      {
        itemId: props.row.item.event.id,
        tripId: "c0000000-0000-4000-8000-000000000003",
        itemRevision: stayContribution().projection.events[0].semantic_revision,
        title: "Owned Lodge",
        status: "planned",
        participation: { mode: "SELF", personIds: [] },
        documentSummaries: [],
        family: "P3",
        hidden: false,
        schedule: {
          start: { localDate: "2027-01-15" },
          end: { localDate: "2027-01-18" },
        },
        details: { propertyName: "Owned Lodge", nights: 3, permittedCheckoutBy: "10:00" },
        bookingSummaries: [{ status: "CONFIRMED" }],
        instructionShortcuts: [{ entryId: "unavailable-original" }],
      },
    ],
  } as unknown as CoreFlightDayProjection;
  const renderer = createCoreStayRenderer(projection);
  const element = renderer({ ...props, depth: "F", context: "TODAY" });
  const html = render(element);
  expect(html).toContain("Owned Lodge");
  expect(html).not.toContain(t("p3.confirmed"));
  expect(html).not.toContain(t("p3.instructions"));
  expect(html).not.toContain(t("p3.booking"));
  expect(html).not.toContain(t("p3.addExpense"));
  expect(
    createCoreStayRenderer({
      ...projection,
      items: [
        {
          ...projection.items[0],
          schedule: {
            shape: "STAY",
            start: { localDate: "2027-01-16", comparable: false },
            end: { localDate: "2027-01-15", comparable: false },
          },
          details: { nights: -1 },
        },
      ],
    })({ ...props, depth: "B", context: "TODAY" }),
  ).toBeNull();
});

it("G2 Flexible empty header opens Immersive directly; Choice and Item share Focus and scroll return", () => {
  const fixture = flexibleContribution();
  const props = {
    projection: fixture.projection,
    date: fixture.selectedDate,
    zone: fixture.zone,
    services: fixture.services,
    instant: fixture.instant,
    ports: fixture.ports,
  };
  let html = render(createElement(DayFeed, props));
  expect(html).toContain(t("dayLab.flexibleEmpty"));
  expect(html).toContain(t("dayLab.flexibleChoices"));
  expect(html.match(/flexible-block-row/g)).toHaveLength(3);
  expect(
    state.presses.filter((p) => p.accessibilityLabel === t("dayLab.flexibleItem")),
  ).toHaveLength(1);
  state.nodes
    .find((node) => node.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 188 } } });
  state.presses
    .find((p) => p.accessibilityLabel === t("dayLab.flexibleEmpty"))!
    .onPress();
  render(createElement(DayFeed, props));
  expect(state.nodes.find((node) => node.onDismiss)?.visible).toBe(true);
  state.presses.find((p) => p.accessibilityLabel === t("common.close"))!.onPress();
  const dismiss = state.nodes.find((node) => node.onDismiss)!.onDismiss;
  render(createElement(DayFeed, props));
  dismiss();
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 188, animated: false });
  state.presses
    .find((p) => p.accessibilityLabel === t("dayLab.flexibleMyChoice"))!
    .onPress();
  render(createElement(DayFeed, props));
  expect(
    state.presses.find((p) => p.accessibilityLabel === t("dayLab.flexibleMyChoice"))
      ?.accessibilityState?.selected,
  ).toBe(true);
  state.presses.find((p) => p.accessibilityLabel === t("dayLab.flexibleItem"))!.onPress();
  render(createElement(DayFeed, props));
  expect(
    state.presses.find((p) => p.accessibilityLabel === t("dayLab.flexibleMyChoice"))
      ?.accessibilityState?.selected,
  ).toBe(false);
  state.presses.find((p) => p.accessibilityLabel === t("flexible.group"))!.onPress();
  html = render(createElement(DayFeed, props));
  expect(html).toContain(t("dayLab.flexibleGroupChoice"));
  expect(html).not.toContain(t("dayLab.flexibleMyChoice"));
});

it("G2 presents CP01A's blank Block title with localized fallback", () => {
  const fixture = flexibleContribution();
  render(
    createElement(DayFeed, {
      projection: fixture.projection,
      date: fixture.selectedDate,
      zone: fixture.zone,
      services: fixture.services,
      instant: fixture.instant,
      ports: {
        ...fixture.ports!,
        flexible: fixture.ports!.flexible!.map((block) =>
          block.id === "flex-empty" ? { ...block, title: "" } : block,
        ),
      },
    }),
  );
  expect(
    state.presses.some(
      (press) => press.accessibilityLabel === t("flexible.untitledBlock"),
    ),
  ).toBe(true);
});

it("renders synthetic TTR distance, mode, route status and NOW without exposing ETA, and emits the exact intent", () => {
  for (const [caseId, expected] of [
    ["STRAIGHT_LINE", t("ttr.straightLine")],
    ["WALKING_NO_ETA", t("ttr.mode.walking")],
    ["DRIVING_PENDING", t("ttr.route.PENDING")],
    ["TRANSIT_FAILED", t("ttr.route.FAILED")],
    ["NOW_COLLISION", t("ttr.straightLine")],
  ] as const) {
    const fixture = ttrLabFixture(caseId);
    const onOpenTtr = vi.fn();
    const distance = t("ttr.straightLineDistance", {
      distance: formatUiNumber(
        fixture.supplemental!.projection.geometricDistance!.meters / 1000,
        { maximumFractionDigits: 1 },
      ),
    });
    const html = render(
      createElement(DayFeed, {
        projection: fixture.projection,
        date: fixture.selectedDate,
        zone: fixture.zone,
        services: fixture.services,
        instant: fixture.instant,
        query: fixture.query,
        ports: fixture.ports,
        onOpenTtr,
      }),
    );
    expect(html).toContain(expected);
    expect(html).toContain(distance);
    expect(html).not.toContain("ETA");
    if (caseId === "NOW_COLLISION") expect(html).toContain("now-between");
    const control = state.presses.find((press) =>
      press.accessibilityLabel?.includes(distance),
    );
    expect(control).toBeDefined();
    control!.onPress();
    expect(onOpenTtr).toHaveBeenCalledWith(
      fixture.supplemental!.projection.actions.openTtr,
      {
        key: expect.any(String),
        inputFingerprint: fixture.supplemental!.projection.inputFingerprint,
      },
    );
  }
  const hidden = ttrLabFixture("PAST");
  const html = render(
    createElement(DayFeed, {
      projection: hidden.projection,
      date: hidden.selectedDate,
      zone: hidden.zone,
      services: hidden.services,
      instant: hidden.instant,
      query: hidden.query,
      ports: hidden.ports,
    }),
  );
  expect(html).not.toContain(t("ttr.straightLineDistance", { distance: "0" }));
});

it("renders suggested mode distinctly and synthetic permitted availability without ETA metrics", () => {
  const straight = ttrLabFixture("STRAIGHT_LINE");
  let html = render(
    createElement(DayFeed, {
      projection: straight.projection,
      date: straight.selectedDate,
      zone: straight.zone,
      services: straight.services,
      instant: straight.instant,
      query: straight.query,
      ports: {
        ...straight.ports,
        transitions: [
          {
            ...straight.supplemental!.projection,
            visibility: "SUGGESTED_MODE",
            modeOrigin: "SYSTEM_SUGGESTED",
            mode: "walking",
          },
        ],
      },
    }),
  );
  expect(html).toContain(t("ttr.suggestedMode", { mode: t("ttr.mode.walking") }));

  const pending = ttrLabFixture("DRIVING_PENDING");
  const state = pending.supplemental!.state;
  if (state.route.status !== "PENDING") throw new Error("Expected pending TTR fixture");
  const available = projectTtr(
    reduceTtr(state, {
      type: "FIXTURE_RESULT",
      ticket: state.route.ticket,
      observation: {
        ...syntheticObservation("driving"),
        observedAt: pending.instant,
      },
    }),
    { now: pending.instant, displayPermission: "SYNTHETIC_ALLOWED" },
  );
  html = render(
    createElement(DayFeed, {
      projection: pending.projection,
      date: pending.selectedDate,
      zone: pending.zone,
      services: pending.services,
      instant: pending.instant,
      query: pending.query,
      ports: { ...pending.ports, transitions: [available] },
    }),
  );
  expect(html).toContain(t("ttr.route.AVAILABLE"));
  expect(html).not.toContain("600");
});

it("dispatches current synthetic TTR intent to owning Sheet Content and keeps Trip/date on close", async () => {
  vi.stubGlobal("__DEV__", true);
  render(createElement(DayFeedLabScreen));
  state.presses
    .find((press) => press.accessibilityLabel.startsWith(t("dayLab.trip")))!
    .onPress();
  render(createElement(DayFeedLabScreen));
  state.presses
    .find((press) => press.accessibilityLabel === t("dayLab.ttr.DRIVING_PENDING"))!
    .onPress();
  let html = render(createElement(DayFeedLabScreen));
  const fixture = ttrLabFixture("DRIVING_PENDING");
  expect(html).toContain(fixture.id);
  for (const effect of state.effects) effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = render(createElement(DayFeedLabScreen));
  state.presses
    .find((press) => press.accessibilityLabel?.includes(t("ttr.route.PENDING")))!
    .onPress();
  html = render(createElement(DayFeedLabScreen));
  await new Promise((resolve) => setTimeout(resolve, 0));
  html = render(createElement(DayFeedLabScreen));
  expect(html).toContain(t("ttr.lab.noMode"));
  expect(html).toContain(t("ttr.lab.confirm"));
  state.nodes.find((node) => node.onRequestClose && node.visible)!.onRequestClose();
  html = render(createElement(DayFeedLabScreen));
  expect(html).toContain(fixture.id);
  expect(html).toContain(fixture.selectedDate);
  expect(html).not.toContain(t("ttr.lab.noMode"));
});

it("rejects a queued old TTR tap after switching A to B to A", () => {
  const select = (name: string) => {
    state.presses
      .find((press) => press.accessibilityLabel.startsWith(t("dayLab.trip")))!
      .onPress();
    render(createElement(DayFeedLabScreen));
    state.presses.find((press) => press.accessibilityLabel === name)!.onPress();
    render(createElement(DayFeedLabScreen));
  };
  render(createElement(DayFeedLabScreen));
  select(t("dayLab.ttr.DRIVING_PENDING"));
  const oldTap = state.presses.find((press) =>
    press.accessibilityLabel?.includes(t("ttr.route.PENDING")),
  )!.onPress;
  select(t("dayLab.ttr.WALKING_NO_ETA"));
  select(t("dayLab.ttr.DRIVING_PENDING"));
  oldTap();
  const html = render(createElement(DayFeedLabScreen));
  expect(html).toContain(t("dayLab.ttr.DRIVING_PENDING"));
  expect(html).not.toContain(t("ttr.lab.noMode"));
});

function reactiveFeed() {
  const fixture = flexibleReactiveContribution();
  const seen: FlexibleBlockRendererProps[] = [];
  const Renderer = (props: FlexibleBlockRendererProps) => {
    seen.push(props);
    return createElement(FlexibleBlockRow, props);
  };
  const props = {
    projection: fixture.projection,
    date: fixture.selectedDate,
    zone: fixture.zone,
    services: fixture.services,
    instant: fixture.instant,
    query: fixture.query,
    ports: fixture.ports,
    flexiblePublication: fixture.flexiblePublication,
    flexibleRenderer: Renderer,
  };
  const draw = () => {
    seen.length = 0;
    return render(createElement(DayFeed, props));
  };
  const latest = () => seen.at(-1)!;
  return { fixture, props, draw, latest };
}

it("suspends Choice Focus, blocks background interaction, replaces snapshots without remounting and restores Focus/scroll", () => {
  const { draw, latest } = reactiveFeed();
  draw();
  state.presses
    .find((press) => press.accessibilityLabel === t("dayLab.flexibleMyChoice"))!
    .onPress();
  draw();
  state.nodes
    .find((node) => node.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 271 } } });
  const originalRefs = [...state.refs];
  state.presses
    .find((press) => press.accessibilityLabel === t("dayLab.snapshotBlock"))!
    .onPress();
  draw();
  expect(latest().immersive).toBe(true);
  expect(latest().block.focusedChoiceKey).toBeNull();
  expect(
    state.nodes.some(
      (node) => node.pointerEvents === "none" && node.accessibilityElementsHidden,
    ),
  ).toBe(true);
  const snapshot = latest().flexibleSnapshot!;
  expect(
    latest().onReplaceFlexibleSnapshot!(flexibleFixtureUpdate(snapshot, "COPY")),
  ).toBe(true);
  draw();
  expect(latest().flexibleSnapshot!.revision).toBe(1);
  expect(latest().block.choices.some((choice) => choice.id === "copied")).toBe(true);
  expect(state.refs).toEqual(originalRefs);
  latest().onClose();
  const dismiss = state.nodes.find((node) => node.onDismiss)!.onDismiss;
  draw();
  dismiss();
  expect(latest().block.focusedChoiceKey).toContain("garden");
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 271, animated: false });
});

it("clears deleted/hidden suspended Focus and deleted Block Immersive without losing canonical Items", () => {
  const { draw, latest, fixture } = reactiveFeed();
  draw();
  state.presses
    .find((press) => press.accessibilityLabel === t("dayLab.flexibleMyChoice"))!
    .onPress();
  draw();
  latest().onBlockImmersiveIntent();
  draw();
  const original = latest().flexibleSnapshot!;
  latest().onReplaceFlexibleSnapshot!(flexibleFixtureUpdate(original, "REMOVE"));
  draw();
  latest().onClose();
  draw();
  expect(latest().block.focusedChoiceKey).toBeNull();
  expect(latest().block.choiceScope).toBe("GROUP");
  latest().onReplaceFlexibleSnapshot!({ ...original, revision: 2 });
  draw();
  expect(latest().block.focusedChoiceKey).toBeNull();
  latest().onBlockImmersiveIntent();
  draw();
  latest().onReplaceFlexibleSnapshot!(
    flexibleFixtureUpdate(latest().flexibleSnapshot!, "DELETE"),
  );
  const html = draw();
  expect(html).not.toContain('data-testid="flexible-block-row"');
  expect(state.nodes.some((node) => node.onDismiss)).toBe(false);
  for (const event of fixture.projection.events) expect(html).toContain(event.title);
});

it("accepts rapid revisions and rejects stale callbacks across Account/Trip/date/generation and A→B→A", () => {
  const { draw, latest, props, fixture } = reactiveFeed();
  draw();
  const publish = latest().onReplaceFlexibleSnapshot!;
  const first = flexibleFixtureUpdate(latest().flexibleSnapshot!, "COPY");
  expect(publish(first)).toBe(true);
  expect(publish(flexibleFixtureUpdate(first, "RESIZE"))).toBe(true);
  expect(publish(first)).toBe(false);
  draw();
  expect(latest().flexibleSnapshot!.revision).toBe(2);
  for (const field of ["accountId", "tripId", "localDate", "generation"] as const) {
    const original = fixture.flexiblePublication;
    props.flexiblePublication = {
      ...original,
      scope: { ...original.scope, [field]: field === "generation" ? 2 : "wrong" },
    };
    draw();
    draw();
    expect(publish({ ...first, revision: 99 })).toBe(false);
    props.flexiblePublication = original;
    draw();
    draw();
    expect(publish({ ...first, revision: 99 })).toBe(false);
  }
});

it("feature-owned local expansion selects one resource while Feed Focus stays suspended", () => {
  const { props, draw, latest } = reactiveFeed();
  draw();
  latest().onBlockImmersiveIntent();
  draw();
  state.hooks = [];
  state.refs = [];
  const html = render(createElement(FlexibleSnapshotFixtureRow, latest()));
  expect(html).toContain(t("dayLab.snapshotResource.POOL"));
  state.presses
    .find((press) => press.accessibilityLabel === t("dayLab.snapshotResource.POOL"))!
    .onPress();
  render(createElement(FlexibleSnapshotFixtureRow, latest()));
  state.presses
    .find((press) => press.accessibilityLabel === t("dayLab.snapshotResource.SAVED"))!
    .onPress();
  const expanded = render(createElement(FlexibleSnapshotFixtureRow, latest()));
  expect(expanded).toContain(
    t("dayLab.snapshotExpanded", { resource: t("dayLab.snapshotResource.SAVED") }),
  );
  expect(expanded).not.toContain(
    t("dayLab.snapshotExpanded", { resource: t("dayLab.snapshotResource.POOL") }),
  );
  expect(latest().block.focusedChoiceKey).toBeNull();
  expect(props.flexiblePublication.snapshot.revision).toBe(0);
});

it("consumes host prop replacements, preserves Item Focus through My/Group and clears lost Item access without resurrection", () => {
  const { draw, latest, props, fixture } = reactiveFeed();
  draw();
  const title = fixture.projection.events.find(
    (event) => event.id === "reactive-item",
  )!.title;
  state.presses.find((press) => press.accessibilityLabel === title)!.onPress();
  expect(draw()).toContain('data-testid="focus-selected-region"');
  latest().onChoiceScopeIntent("GROUP");
  expect(draw()).toContain('data-testid="focus-selected-region"');
  const refs = [...state.refs];
  const original = fixture.flexiblePublication.snapshot;
  props.flexiblePublication = {
    ...props.flexiblePublication,
    snapshot: flexibleFixtureUpdate(original, "COPY"),
  };
  draw();
  expect(draw()).toContain('data-testid="focus-selected-region"');
  expect(latest().flexibleSnapshot!.revision).toBe(1);
  expect(state.refs).toEqual(refs);
  latest().onBlockImmersiveIntent();
  expect(draw()).not.toContain('data-testid="focus-selected-region"');
  const authorized = fixture.query(fixture.selectedDate, fixture.zone);
  props.query = () => ({
    ...authorized,
    timed: authorized.timed.filter((row) => row.event.id !== "reactive-item"),
  });
  draw();
  latest().onClose();
  expect(draw()).not.toContain('data-testid="focus-selected-region"');
  props.query = fixture.query;
  expect(draw()).not.toContain('data-testid="focus-selected-region"');
});

it("same-day Rental Return retains its own Focus/Immersive endpoint and nonzero scroll return", () => {
  const fixture = rentalContribution("SAME_DAY");
  const props = {
    projection: fixture.projection,
    date: fixture.selectedDate,
    zone: fixture.zone,
    instant: fixture.instant,
    query: fixture.query,
    renderer: fixture.renderer,
    services: fixture.services,
  };
  const draw = () => render(createElement(DayFeed, props));
  draw();
  const title = t("p4Lab.actualA");
  state.nodes
    .find((node) => node.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 281 } } });
  const vehicleRows = state.presses.filter((press) => press.accessibilityLabel === title);
  expect(vehicleRows).toHaveLength(2);
  vehicleRows[1].onPress();
  draw();
  expect(
    state.presses.filter((press) => press.accessibilityLabel === t("p1r.richerDetails")),
  ).toHaveLength(1);
  state.presses
    .find((press) => press.accessibilityLabel === t("p1r.richerDetails"))!
    .onPress();
  draw();
  const immersive = state.nodes.find(
    (node) => node.contentInsetAdjustmentBehavior === "automatic",
  )!;
  expect(renderToStaticMarkup(immersive.children)).toContain("18:00");
  expect(renderToStaticMarkup(immersive.children)).toContain(t("p4Lab.returnAddress"));
  const dismiss = state.nodes.find((node) => node.onDismiss)!.onDismiss;
  state.presses
    .find((press) => press.accessibilityLabel === t("common.close"))!
    .onPress();
  draw();
  dismiss();
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 281, animated: false });
  expect(
    state.presses.filter((press) => press.accessibilityLabel === t("p1r.richerDetails")),
  ).toHaveLength(1);
});

it("production renderer chain opens both same-day roles into one Rental detail without granting unavailable actions", () => {
  const tripId = "a0000000-0000-4000-8000-000000000001",
    accountId = "a0000000-0000-4000-8000-000000000002",
    id = "a0000000-0000-4000-8000-000000000003";
  const actor = {
    tripId,
    accountId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const clock = (hour: string) => ({
    ...coreDateBoundary("2027-01-15"),
    instant: `2027-01-15T${hour}:00:00Z`,
    local_time: `${hour}:00:00`,
    clock_precision: 0,
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
    zone_id: "UTC",
    source_instant: `2027-01-15T${hour}:00:00Z`,
    source_instant_precision: 0,
  });
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: "a0000000-0000-4000-8000-000000000004",
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P4",
        core: { title: "Contract Rental" },
        schedule: { start: clock("09"), end: clock("18") },
        ...coreDefaults("member"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  // Pure presentation contract input; owning SQLite certificate verification is tested in the repository suite.
  const projection = projectCoreP6Feed(
    graph,
    actor,
    {
      generation: 1,
      epoch: "fixture",
      revision: "1",
      accessRevision: 1,
      actorPersonBindingHash: "fixture",
      participatingRosterHash: "fixture",
      manifestSha256: "fixture",
    },
    [],
  );
  const props = {
    projection,
    date: "2027-01-15",
    zone: "UTC",
    instant: "2027-01-15T12:00:00Z",
    services: {},
    renderer: createCoreExperienceRenderer(projection),
  };
  const draw = () => render(createElement(DayFeed, props));
  let html = draw();
  expect(html).toContain(t("p4.pickup"));
  expect(html).toContain(t("p4.return"));
  const rows = state.presses.filter(
    (press) => press.accessibilityLabel === "Contract Rental",
  );
  expect(rows).toHaveLength(2);
  for (const index of [0, 1]) {
    draw();
    state.presses
      .filter((press) => press.accessibilityLabel === "Contract Rental")
      [index].onPress();
    draw();
    expect(
      state.presses.filter(
        (press) => press.accessibilityLabel === t("p1r.richerDetails"),
      ),
    ).toHaveLength(1);
    state.presses
      .find((press) => press.accessibilityLabel === t("p1r.richerDetails"))!
      .onPress();
    draw();
    html = renderToStaticMarkup(
      state.nodes.find((node) => node.contentInsetAdjustmentBehavior === "automatic")!
        .children,
    );
    expect(html).toContain("Contract Rental");
    expect(html).toContain("09:00");
    expect(html).toContain("18:00");
    expect(html).not.toContain(t("p4.booking"));
    expect(html).not.toContain(t("p4.addExpense"));
    expect(html).not.toContain(t("p4.edit"));
    state.presses
      .find((press) => press.accessibilityLabel === t("common.close"))!
      .onPress();
    draw();
    state.presses
      .find(
        (press) =>
          press.accessibilityLabel === "Contract Rental" &&
          press.accessibilityHint === t("p1r.collapseHint"),
      )!
      .onPress();
  }
  expect(projection.items).toHaveLength(1);
});

it("normal P1 first body tap visibly focuses, richer details opens and closes into the same focused scroll", () => {
  const props = { projection, date: "2026-10-10", zone: "UTC", services: {} };
  const draw = () => render(createElement(DayFeed, props));
  draw();
  state.nodes
    .find((node) => node.onScroll)!
    .onScroll({ nativeEvent: { contentOffset: { y: 172 } } });
  state.presses
    .find(
      (press) =>
        press.accessibilityLabel === poi.title &&
        press.accessibilityHint === t("p1r.focusHint"),
    )!
    .onPress();
  expect(draw()).toContain('data-testid="focus-selected-region"');
  state.presses
    .find((press) => press.accessibilityLabel === t("p1r.richerDetails"))!
    .onPress();
  draw();
  const dismiss = state.nodes.find((node) => node.onDismiss)!.onDismiss;
  expect(state.nodes.find((node) => node.onDismiss)!.visible).toBe(true);
  state.presses
    .find((press) => press.accessibilityLabel === t("common.close"))!
    .onPress();
  expect(draw()).toContain('data-testid="focus-selected-region"');
  dismiss();
  expect(state.scrollTo).toHaveBeenLastCalledWith({ y: 172, animated: false });
});

it("P1 displays known estimated minute and named place without presenting a resolved rail", () => {
  const event = {
    ...poi,
    authored_label: "Named temple",
    is_estimated_time: true,
    boundaries: [
      {
        ...poi.boundaries[0],
        quality: "ESTIMATED" as const,
        clock_precision: -1,
        local_time: "09:15:00",
        instant: null,
        source_instant: null,
        source_instant_precision: null,
      },
    ],
  };
  const html = render(createElement(P1Row, { event, depth: "B", onDepth: () => {} }));
  expect(html).toContain("09:15");
  expect(html).toContain("Named temple");
  expect(html).toContain(t("p6.plannedUnresolved"));
  expect(html.split("09:15")).toHaveLength(2);
});

it("accepted Sparse Flight stays a Flight in Browse, Focus and Immersive without guessed airport/time facts", () => {
  const sparse: DayEvent = {
    ...flight,
    id: "formal-sparse",
    title: "ZZ2701",
    temporal_shape: "POINT",
    boundaries: [
      {
        ...flight.boundaries[0],
        role: "ORIGIN",
        local_time: null,
        clock_precision: null,
        quality: "UNKNOWN",
        zone_id: null,
        instant: null,
        source_instant: null,
      },
    ],
  };
  const facts = {
    qualification: "SPARSE" as const,
    flightNumberLiteral: "ZZ2701",
    services: [],
    endpoints: {
      ORIGIN: { code: null, name: null, terminal: null },
      DESTINATION: { code: null, name: null, terminal: null },
    },
  };
  const p = {
    ...projection,
    version: 2,
    events: [sparse],
    items: [{ itemId: sparse.id, family: "P2" }],
    flightFacts: { [sparse.id]: facts },
    source: {},
    query: (date: string, zone: string) =>
      itemsForLocalDate({ ...projection, events: [sparse] }, date, zone),
  } as unknown as CoreFlightDayProjection;
  const before = JSON.stringify([sparse, facts]);
  const browse = render(
    createElement(DayFeed, {
      projection: p,
      date: "2026-10-10",
      zone: "Pacific/Auckland",
      services: {},
    }),
  );
  expect(browse).toContain("flight-sparse-summary");
  const read = flightPresentation(sparse, [], facts)!;
  for (const options of [{}, { focused: true }, { immersive: true }]) {
    state.hooks = [];
    const html = render(createElement(FlightRows, { fixture: read, ...options }));
    expect(html).toContain("ZZ2701");
    expect(html).toContain(
      formatUiDate(new Date("2026-10-10T12:00:00Z"), {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    );
    expect(html).not.toContain(t("flight.unknownAirport"));
    expect(html).not.toMatch(/undefined|NaN/);
    expect(
      state.nodes.some((n) =>
        ["duration", "arrival-time", "flight-origin", "flight-destination"].includes(
          n.testID,
        ),
      ),
    ).toBe(false);
  }
  expect(JSON.stringify([sparse, facts])).toBe(before);
});
