import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  ScheduledTransportContent,
  transportMode,
} from "@/features/day-feed/ScheduledTransportRow";
import { getUiLocale, setUiLocale, t } from "@/ui/locale";
import {
  transportFidelityFacts,
  transportFidelityScenarios,
} from "./transportFidelityFixture";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = ({
    children,
    disabled,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "div",
      { "data-disabled": disabled, "data-label": accessibilityLabel },
      children,
    );
  return {
    View: primitive,
    Text: primitive,
    Pressable: primitive,
    Image: primitive,
    Linking: { openURL: vi.fn() },
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ fontScale: 1, width: 402, height: 874 }),
    useColorScheme: () => "light",
  };
});
vi.mock("@/features/day-feed/BookingReadUi", async () => {
  const { createElement } = await import("react");
  return {
    BookingGlyph: ({ kind }: { kind: string }) =>
      createElement("i", {
        "data-icon":
          kind === "detail"
            ? "arrow.up.left.and.arrow.down.right"
            : kind === "navigate"
              ? "location"
              : kind === "contact"
                ? "phone"
                : "map",
      }),
    BookingInsert: ({ side }: { side: string }) =>
      createElement("button", { "data-insert": side }),
  };
});
vi.mock("@/components/AppIcon", async () => {
  const { createElement } = await import("react");
  return {
    AppIcon: ({ name }: { name: string }) => createElement("i", { "data-icon": name }),
  };
});
vi.mock("@/features/ledger/MoneyText", async () => {
  const { createElement } = await import("react");
  return { MoneyText: () => createElement("span") };
});
const render = (
  scenario: string,
  context: "FUTURE" | "TODAY" | "PAST",
  depth: "B" | "F" | "I",
  arrival = false,
) =>
  renderToStaticMarkup(
    createElement(ScheduledTransportContent, {
      facts: transportFidelityFacts(scenario, undefined, vi.fn()),
      context,
      depth,
      arrival,
      onDepth: vi.fn(),
    }),
  );
describe("frozen P5 nine-state content matrix", () => {
  for (const scenario of transportFidelityScenarios)
    for (const context of ["FUTURE", "TODAY", "PAST"] as const)
      for (const depth of ["B", "F", "I"] as const) {
        it(`${scenario.id} ${context} ${depth}`, () => {
          const html = render(scenario.id, context, depth);
          expect(html).not.toMatch(/undefined|Invalid Date|NaN/);
          const facts = transportFidelityFacts(scenario.id);
          if (depth === "B") {
            expect(html).not.toContain(t("p5.showTicket"));
            expect(html).not.toContain(t("p5.boarding"));
            expect(html).not.toContain(
              t("p5.bookingMarker", { name: facts.bookingMarker ?? "absent" }),
            );
          } else expect(html).toContain(facts.title);
          if (context === "PAST" && depth === "F")
            expect(html).not.toMatch(/data-icon="(?:map|location|phone)"/);
          if (depth === "I") expect(html).toContain(t("fidelity.addExpense"));
        });
      }
});
for (const context of ["FUTURE", "TODAY", "PAST"] as const)
  for (const depth of ["B", "F", "I"] as const)
    it(`arrival ${context} ${depth} preserves one Segment and end rail`, () => {
      const html = render("overnight", context, depth, true),
        facts = transportFidelityFacts("overnight");
      if (depth !== "I") {
        expect(html).toContain(t("fidelity.endAt"));
        expect(html).toContain(facts.destination.time!);
        expect(html).not.toContain(facts.origin.time!);
        expect(html).not.toContain("+1");
      } else {
        expect(html).toContain(facts.origin.time!);
        expect(html).toContain(facts.destination.time!);
      }
    });
it("keeps sparse optional arrival unknown and does not calculate duration from clocks", () => {
  const facts = transportFidelityFacts("minimal");
  expect(facts.destination.date).toBeUndefined();
  expect(facts.destination.time).toBeUndefined();
  expect(facts.duration).toBeUndefined();
  expect(render("minimal", "TODAY", "F")).not.toContain("00:00");
});
it("keeps explicit mode semantics and source-language boarding evidence", () => {
  const icons = transportFidelityScenarios
    .filter((s) => s.id.startsWith("mode-"))
    .map((s) => transportMode(transportFidelityFacts(s.id).subtype).icon);
  expect(new Set(icons).size).toBe(5);
  const facts = transportFidelityFacts("dynamic");
  expect(facts.dynamicBoarding?.length).toBeGreaterThan(0);
  const source = transportFidelityScenarios
    .find((s) => s.id === "dynamic")!
    .segments[0].facts!.filter((f) => f.visible);
  expect(facts.dynamicBoarding).toEqual(
    source.map(({ visible: _visible, ...field }) => field),
  );
});
it("keeps Booking-only originals out of Ticket identity and never opens missing custody", () => {
  expect(transportFidelityFacts("booking-only").tickets).toHaveLength(0);
  for (const id of ["notDownloaded", "unavailable"]) {
    const facts = transportFidelityFacts(id, undefined, vi.fn());
    expect(facts.tickets?.every((ticket) => !ticket.onOpen)).toBe(true);
    expect(render(id, "TODAY", "F")).toContain(
      t(`p5.access.${id as "notDownloaded" | "unavailable"}`),
    );
  }
  const shared = transportFidelityFacts("shared-selection", undefined, vi.fn());
  expect(shared.tickets).toHaveLength(1);
  expect(shared.tickets![0].requiresSelection).toBe(true);
  expect(render("shared-selection", "TODAY", "F")).toContain(t("p5.chooseTicket"));
});
it("preserves source clocks and localized chrome in Chinese without a new instant claim", () => {
  const previous = getUiLocale();
  try {
    setUiLocale("zh-Hans");
    expect(render("floating", "TODAY", "I")).not.toContain("undefined");
    expect(render("full", "TODAY", "F")).toContain(t("p5.boarding"));
  } finally {
    setUiLocale(previous);
  }
});
