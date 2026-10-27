import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { LocalManualDayRows } from "./LocalManualDayFeed";
import { createCoreTicketedActivityRenderer } from "./coreTicketedActivityRenderer";
import { lightPalette } from "@/ui/palette";
const state = vi.hoisted(() => ({ nodes: [] as any[], scale: 1, activity: null as any }));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  useWindowDimensions: () => ({ fontScale: state.scale }),
  StyleSheet: { create: (s: any) => s, hairlineWidth: 1 },
}));
vi.mock("./ScheduledTransportRow", () => ({ ScheduledTransportContent: () => null }));
vi.mock("./RentalRow", () => ({ RentalContent: () => null }));
vi.mock("./FlightJourneyView", () => ({ FlightLegRow: () => null }));
vi.mock("./StayReadView", () => ({ StayReadRow: () => null }));
vi.mock("./WindowedDayList", () => ({ WindowedDayList: () => null }));
vi.mock("./TripCalendarField", () => ({ calendarDate: () => "2026-10-28" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiButton: (p: any) => {
    state.nodes.push({ ...p, accessibilityLabel: p.label });
    return createElement("button", null, p.label);
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
vi.mock("./TicketedActivityRow", () => ({
  TicketedActivityContent: (p: any) => {
    state.activity = p;
    return null;
  },
  TicketedActivityRow: (p: any) => {
    state.activity = p;
    return null;
  },
}));
const date = "2027-02-08";
const item = () => ({
  itemId: "activity",
  tripId: "trip",
  itemRevision: 2,
  family: "P6",
  title: "Museum",
  status: "planned",
  hidden: false,
  details: {},
  participation: { mode: "WHOLE_GROUP" },
  schedule: { start: { localDate: date, localTime: null } },
});
beforeEach(() => {
  state.activity = null;
});
it.each(["START", "END"])(
  "real local P6 %s forwards Focus, add and detail using the original item identity",
  (role) => {
    const rowKey = { itemId: "activity", projectionRole: role, localDate: date };
    const row = { itemRef: "activity", rowKey, family: "P6", position: "TNS" };
    const read = {
      items: [item()],
      rows: () => [row],
      scope: { accountId: "account", tripId: "trip", generation: 5 },
      source: { fingerprint: "current" },
    };
    const onOpenItem = vi.fn(),
      onInsert = vi.fn(),
      onP1Focus = vi.fn();
    renderToStaticMarkup(
      createElement(LocalManualDayRows, {
        read,
        onlyRow: row,
        date,
        p1Focus: JSON.stringify(rowKey),
        onOpenItem,
        onInsert,
        onP1Focus,
      } as any),
    );
    expect(state.activity.depth).toBe("F");
    expect(state.activity.ending).toBe(role === "END");
    expect(state.activity.facts.start.time).toBeUndefined();
    state.activity.onInsert("BEFORE");
    state.activity.onInsert("AFTER");
    expect(onInsert.mock.calls).toEqual([
      ["activity", role, date, "BEFORE"],
      ["activity", role, date, "AFTER"],
    ]);
    state.activity.onDepth("I");
    expect(onOpenItem).toHaveBeenCalledWith("activity", read, { role, date });
    state.activity.onDepth("B");
    expect(onP1Focus).toHaveBeenCalledWith(null);
  },
);
it.each(["START", "END"])(
  "accepted P6 %s routes explicit actions without synthesizing a second item",
  (role) => {
    const onOpenActivity = vi.fn(),
      onInsertActivity = vi.fn();
    const projection = {
      tripId: "trip",
      items: [item()],
      events: [{ id: "activity", semantic_revision: 2 }],
      source: {},
    };
    const render = createCoreTicketedActivityRenderer(projection as any, {
      onOpenActivity,
      onInsertActivity,
    });
    const props = {
      row: {
        item: { event: { id: "activity" } },
        coreRowKeys: [{ itemId: "activity", projectionRole: role, localDate: date }],
      },
      onDepth: vi.fn(),
      depth: "F",
    };
    renderToStaticMarkup(render(props as any));
    state.activity.onDepth("I");
    state.activity.onInsert("AFTER");
    expect(onOpenActivity).toHaveBeenCalledWith("activity", role, date);
    expect(onInsertActivity).toHaveBeenCalledWith("activity", role, date, "AFTER");
    expect(props.onDepth).not.toHaveBeenCalled();
  },
);
it.each([{ tripId: "foreign" }, { itemRevision: 3 }, { hidden: true }])(
  "accepted P6 does not expose stale or unavailable facts: %j",
  (changes) => {
    const projection = {
      tripId: "trip",
      items: [{ ...item(), ...changes }],
      events: [{ id: "activity", semantic_revision: 2 }],
      source: {},
    };
    const render = createCoreTicketedActivityRenderer(projection as any);
    expect(
      render({ row: { item: { event: { id: "activity" } }, coreRowKeys: [] } } as any),
    ).toBeNull();
  },
);
