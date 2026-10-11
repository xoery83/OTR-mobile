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
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: ReactNode) => string;
};
const state = vi.hoisted(() => ({
  presses: [] as Record<string, any>[],
  scale: 1,
  scheme: "light",
  hooks: [] as unknown[],
  cursor: 0,
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
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = (props: Record<string, any>) => {
    if (props.onPress) state.presses.push(props);
    return createElement(
      "div",
      { "data-testid": props.testID, "aria-label": props.accessibilityLabel },
      props.children,
    );
  };
  return {
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
  useMinuteClock: () => ({ instant: "2026-10-10T00:30:00Z" }),
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
  state.presses = [];
  return renderToStaticMarkup(node);
};
beforeEach(() => {
  state.hooks = [];
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
