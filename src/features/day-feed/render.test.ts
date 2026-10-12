import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { DayEvent, DayProjection } from "@/domain/trip/dayReadModel";
import { DayFeed } from "./DayFeed";
import { P1Row } from "./P1Row";
import { FlightRows } from "./FlightRows";
import { flightPresentation } from "./presentation";
import { t } from "@/ui/locale";
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
  scrollTo: vi.fn(),
  platform: "ios",
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    return [
      state.hooks[i] ?? initial,
      (next: unknown) => {
        state.hooks[i] =
          typeof next === "function" ? next(state.hooks[i] ?? initial) : next;
      },
    ];
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
    Platform: {
      get OS() {
        return state.platform;
      },
    },
    View: primitive,
    Text: primitive,
    ScrollView: primitive,
    Pressable: primitive,
    Modal: (p: Record<string, any>) => (p.visible ? primitive(p) : null),
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: state.scale }),
    useColorScheme: () => state.scheme,
  };
});
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
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
  state.presses = [];
  state.nodes = [];
  return renderToStaticMarkup(node);
};
beforeEach(() => {
  state.instant = "2026-10-10T00:30:00Z";
  state.nodes = [];
  state.hooks = [];
  state.refs = [];
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
