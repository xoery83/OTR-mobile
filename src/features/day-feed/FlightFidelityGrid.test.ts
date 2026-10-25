import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { FlightFidelityGrid } from "./FlightFidelityGrid";
import type { FlightPresentation } from "./presentation";
import { place, boundary } from "@/features/day-feed-lab/fixtureFacts";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ nodes: [] as any[], scale: 1 }));
vi.mock("react-native", () => ({
  View: (p: any) => {
    state.nodes.push(p);
    return createElement("div", null, p.children);
  },
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
  useWindowDimensions: () => ({ fontScale: state.scale }),
}));
vi.mock("@/components/AppIcon", () => ({
  AppIcon: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => {
    state.nodes.push(p);
    return createElement("span", null, p.children);
  },
}));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => lightPalette,
  useThemedStyles: (fn: any) => fn(lightPalette),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const empty = () => ({ code: null, name: null, terminal: null });
const sparse = (): FlightPresentation => ({
  canonical: {
    ...place("leg", "Private read title", "2027-01-16"),
    event_type: "flight",
    temporal_shape: "TRANSPORT",
    boundaries: [
      {
        ...boundary("ORIGIN", "2027-01-16"),
        local_time: null,
        instant: null,
        source_instant: null,
        zone_id: null,
      },
    ],
  },
  services: [],
  supplemental: { endpoints: { ORIGIN: empty(), DESTINATION: empty() } },
});
const full = (): FlightPresentation => ({
  ...sparse(),
  canonical: {
    ...sparse().canonical,
    boundaries: [
      {
        ...boundary("ORIGIN", "2027-01-16", "20:00"),
        zone_id: "Pacific/Auckland",
        instant: "2027-01-16T07:00:00Z",
        source_instant: "2027-01-16T07:00:00Z",
      },
      {
        ...boundary("DESTINATION", "2027-01-16", "11:00"),
        zone_id: "America/Los_Angeles",
        instant: "2027-01-16T19:00:00Z",
        source_instant: "2027-01-16T19:00:00Z",
      },
    ],
  },
  supplemental: {
    endpoints: {
      ORIGIN: { code: "AKL", name: "Auckland International Airport", terminal: "D" },
      DESTINATION: {
        code: "LAX",
        name: "Los Angeles International Airport",
        terminal: "A",
      },
    },
  },
});
const render = (flight: FlightPresentation, options = {}) =>
  renderToStaticMarkup(
    createElement(FlightFidelityGrid, { flight, numberLiteral: "ZZ901", ...options }),
  );
beforeEach(() => {
  state.nodes = [];
  state.scale = 1;
});
it("renders sparse literal/date without fabricated airport, clocks or booking facts", () => {
  const html = render(sparse());
  expect(html).toContain("ZZ901");
  expect(html).toContain("Jan 16, 2027");
  expect(html).not.toMatch(/Unknown|00:00|Terminal|Seat|Booking|Timezone|NTC/);
  expect(state.nodes.find((n) => n.name === "airplane")).toBeDefined();
});
it("keeps original Floating clocks without deriving an instant or duration", () => {
  const flight = full();
  flight.canonical.boundaries = flight.canonical.boundaries.slice(0, 1).map((b) => ({
    ...b,
    local_time: "09:00:00",
    instant: null,
    source_instant: null,
    zone_id: null,
  }));
  const bytes = JSON.stringify(flight),
    html = render(flight);
  expect(html).toContain("09:00");
  expect(html).not.toMatch(/12h|Timezone|NTC/);
  expect(JSON.stringify(flight)).toBe(bytes);
});
it("keeps endpoint-local clocks across the date line and uses only qualified duration", () => {
  const html = render(full());
  expect(html).toContain("20:00");
  expect(html).toContain("11:00");
  expect(html).toContain("12h 0m");
  expect(html).not.toMatch(/Booking|Seat|Private read title/);
});
it("puts both Terminal values in the same row even with long airport names", () => {
  render(full());
  const row = state.nodes.find((n) => n.testID === "flight-terminal-grid");
  expect(renderToStaticMarkup(createElement("div", null, row.children))).toContain(
    "Terminal D",
  );
  expect(renderToStaticMarkup(createElement("div", null, row.children))).toContain(
    "Terminal A",
  );
});
it("retains actual arrival date and independently named zones in Immersive", () => {
  const flight = full();
  flight.canonical.boundaries[1].local_date = "2027-01-17";
  const html = render(flight, { immersive: true });
  expect(html).toContain("Jan 17, 2027");
  expect(html).toContain("Pacific/Auckland");
  expect(html).toContain("America/Los_Angeles");
});
it("provides an untruncated stacked layout for large text", () => {
  state.scale = 2.4;
  render(full(), { focused: true });
  expect(
    state.nodes.some(
      (n) =>
        Array.isArray(n.style) && n.style.some((s: any) => s?.flexDirection === "column"),
    ),
  ).toBe(true);
  expect(
    state.nodes
      .filter((n) => n.children === "Auckland International Airport")
      .every((n) => n.numberOfLines === undefined),
  ).toBe(true);
});

it("does not drop known sparse arrival dates/zones when airport identity is absent", () => {
  const flight = full();
  flight.supplemental.endpoints = { ORIGIN: empty(), DESTINATION: empty() };
  flight.canonical.boundaries[1].local_date = "2027-01-17";
  expect(render(flight)).toContain("Jan 17, 2027");
  const html = render(flight, { immersive: true });
  expect(html).toContain("Pacific/Auckland");
  expect(html).toContain("America/Los_Angeles");
});
