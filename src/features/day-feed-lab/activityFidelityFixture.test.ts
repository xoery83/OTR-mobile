import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import {
  activityFidelityFacts,
  activityFidelityScenarios,
} from "./activityFidelityFixture";
import {
  TicketedActivityContent,
  type TicketedActivityFacts,
} from "@/features/day-feed/TicketedActivityRow";
import { t } from "@/ui/locale";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const actions: any[] = [];
vi.mock("react-native", () => ({
  Text: (p: any) => createElement("span", null, p.children),
  View: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => {
    actions.push(p);
    return createElement("button", null, p.children);
  },
  Image: (p: any) => createElement("img", { src: p.source.uri }),
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  useWindowDimensions: () => ({ fontScale: 1 }),
  Linking: { openURL: vi.fn(async () => {}) },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    actions.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/features/ledger/MoneyText", () => ({
  MoneyText: (p: any) => createElement("span", null, `${p.minor} ${p.currency}`),
}));
vi.mock("@/features/day-feed/BookingReadUi", () => ({
  BookingCard: (p: any) => createElement("section", null, p.title, p.children),
  BookingGlyph: (p: any) => createElement("button", null, p.kind),
  BookingInsert: (p: any) => createElement("button", null, p.side),
}));
vi.mock("@/features/day-feed/ImmersiveActions", () => ({
  ImmersiveActions: (p: any) =>
    createElement("footer", null, Object.keys(p.actions).join(",")),
}));
const render = (
  facts: TicketedActivityFacts,
  context: "TODAY" | "FUTURE" | "PAST",
  depth: "B" | "F" | "I",
) => {
  actions.length = 0;
  return renderToStaticMarkup(
    createElement(TicketedActivityContent, {
      facts,
      context,
      depth,
      onDepth: () => {},
      onInsert: () => {},
    }),
  );
};
for (const scenario of activityFidelityScenarios)
  for (const context of ["FUTURE", "TODAY", "PAST"] as const)
    for (const depth of ["B", "F", "I"] as const) {
      it(`${scenario.id} ${context}/${depth} preserves authorized Activity and common action bounds`, () => {
        for (const activity of scenario.activities) {
          const facts = activityFidelityFacts(scenario, activity.id);
          if (!activity.visible) {
            expect(facts).toBeNull();
            continue;
          }
          expect(facts).not.toBeNull();
          const html = render(facts!, context, depth);
          expect(html).toContain(activity.name.replaceAll("&", "&amp;"));
          expect(html).not.toContain("00:00");
          if (depth === "B") {
            expect(html).not.toContain(t("p6.showTicket"));
            expect(html).not.toContain("<img");
            expect(html).not.toContain(
              t("p6.photoCount", { count: facts!.photos?.count ?? 0 }),
            );
          }
          if (context === "PAST" && depth === "F") {
            expect(html).not.toContain(">map<");
            expect(html).not.toContain(">navigate<");
            expect(html).not.toContain(">BEFORE<");
          }
          if (depth === "I") {
            expect(html).toContain("<footer>");
            expect(html).not.toContain("Synthetic photo");
          }
        }
      });
    }
it("real classified Ticket identities are unique; Voucher/Booking never become Ticket", () => {
  for (const scenario of activityFidelityScenarios)
    for (const activity of scenario.activities) {
      const facts = activityFidelityFacts(scenario, activity.id);
      if (!facts) continue;
      expect(new Set(facts.tickets?.map((t) => t.id)).size).toBe(facts.tickets?.length);
      for (const ticket of facts.tickets ?? [])
        expect(scenario.tickets.find((t) => t.id === ticket.id)?.classification).toBe(
          "TICKET",
        );
    }
});
it("only a matched viewer receives Focus seat; authorized others remain in detail", () => {
  const full = activityFidelityScenarios.find((s) => s.id === "full")!;
  const raw = structuredClone(full),
    activity = raw.activities[0];
  activity.attendees!.forEach((p) => {
    p.matched = false;
  });
  const facts = activityFidelityFacts(raw, activity.id)!;
  expect(facts.ownAdmission).toBeUndefined();
  expect(facts.participants!.length).toBeGreaterThan(0);
  const focus = render(facts, "TODAY", "F");
  expect(focus).not.toContain(t("p6.seat", { value: "18" }));
});
it("minimal Activity hides empty information cards and does not invent Ticket, clock or venue", () => {
  const scenario = activityFidelityScenarios.find((s) => s.id === "minimal")!;
  const facts = activityFidelityFacts(scenario, scenario.activities[0].id)!;
  const html = render(facts, "TODAY", "I");
  expect(html).not.toContain("<section");
  expect(html).not.toContain(t("p6.start"));
  expect(html).not.toContain(t("p6.showTicket"));
});
it("past identity precedes compact photos; historical admission is collapsed", () => {
  const facts: TicketedActivityFacts = {
    family: "P6",
    title: "Archive",
    start: { date: "2027-01-16", time: "10:00" },
    instructions: "Hidden history",
    photos: {
      count: 4,
      previews: [1, 2, 3, 4].map((i) => ({
        id: String(i),
        uri: `data:image/png;base64,${i}`,
      })),
      onViewAll: () => {},
    },
  };
  const html = render(facts, "PAST", "I");
  expect(html.indexOf("Archive")).toBeLessThan(html.indexOf("<img"));
  expect(html.match(/<img/g)).toHaveLength(3);
  expect(html).not.toContain("Hidden history");
  expect(html).toContain(t("p6.showAdmission"));
});
it("four original readiness states preserve disabled real open capability", () => {
  for (const access of [
    "availableOffline",
    "onlineRequired",
    "notDownloaded",
    "unavailable",
  ] as const) {
    const open = vi.fn();
    render(
      {
        family: "P6",
        title: "Original",
        start: { date: "2027-01-16" },
        tickets: [{ id: "ticket", title: "Original", access, onOpen: open }],
      },
      "TODAY",
      "F",
    );
    const button = actions.find((a) => a.label === t("p6.showTicket"));
    expect(button.disabled).toBe(access === "unavailable" || access === "notDownloaded");
    button.onPress();
    expect(open).toHaveBeenCalledTimes(button.disabled ? 0 : 1);
  }
});
