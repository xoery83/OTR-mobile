import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { composeDayStream } from "./composition";
import { scheduledTransportContribution } from "../day-feed-lab/scheduledTransportContribution";
import {
  ScheduledTransportRow,
  transportMapUrl,
  type ScheduledTransportFacts,
} from "./ScheduledTransportRow";
import { knownTransportClock } from "./coreScheduledTransportRenderer";
import { formatUiDate, getUiLocale, setUiLocale, t } from "@/ui/locale";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const primitive = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return {
    Image: ({ source }: { source: { uri: string } }) =>
      createElement("img", { src: source.uri }),
    Pressable: primitive,
    Text: primitive,
    View: primitive,
    Linking: { openURL: vi.fn() },
    StyleSheet: { create: (value: unknown) => value, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 812, fontScale: 1 }),
    useColorScheme: () => "light",
  };
});
vi.mock("@/features/ledger/MoneyText", async () => {
  const { createElement } = await import("react");
  return {
    MoneyText: ({ minor, currency }: { minor: number; currency: string }) =>
      createElement("span", null, `${minor} ${currency}`),
  };
});

const facts: ScheduledTransportFacts = {
  family: "P5",
  title: "Train segment A",
  subtype: "TRAIN",
  origin: {
    date: "2027-01-15",
    time: "09:00",
    place: { qualification: "TEXT_ONLY", authoredLabel: "Origin station" },
  },
  destination: {
    date: "2027-01-16",
    time: "11:00",
    place: { qualification: "TEXT_ONLY", authoredLabel: "Destination station" },
  },
  operator: "Rail operator",
  service: "R1",
  bookingMarker: "Shared booking",
  boarding: { platform: "4", coach: "A", seat: "12" },
  tickets: [{ id: "ticket-1", title: "Own Ticket", onOpen: () => {} }],
  bookings: [{ id: "booking-1", title: "Booking original", onOpen: () => {} }],
  passengers: [
    { id: "p1", name: "Own passenger", seat: "12", coach: "A" },
    { id: "p2", name: "Other authorized passenger", seat: "13" },
  ],
  relatedSegments: [{ id: "segment-b", title: "Related segment B", onOpen: () => {} }],
  photos: {
    count: 4,
    previews: [
      { id: "a", uri: "data:image/png;base64,YQ==" },
      { id: "b", uri: "data:image/png;base64,Yg==" },
      { id: "c", uri: "data:image/png;base64,Yw==" },
      { id: "d", uri: "data:image/png;base64,ZA==" },
    ],
    onViewAll: () => {},
  },
  expenseCount: 2,
  expenseSummary: {
    total: { minor: 22000, currency: "NZD", scale: 2 },
    myShare: { minor: 11000, currency: "NZD", scale: 2 },
    originals: [{ minor: 15000, currency: "USD", scale: 2 }],
    coverage: "Shared Booking covers segments A and B",
  },
  onEdit: () => {},
  onUpdateFromDocument: () => {},
  onEditExpense: () => {},
  onAddAttachment: () => {},
  onAddPhoto: () => {},
  onAddExpense: () => {},
};
const render = (
  period: "FUTURE" | "TODAY" | "PAST",
  depth: "B" | "F" | "I",
  value: ScheduledTransportFacts = facts,
) => {
  const fixture = scheduledTransportContribution(period);
  const stream = composeDayStream(
    fixture.query!(fixture.selectedDate, fixture.zone),
    fixture.instant,
  );
  expect(stream.rows).toHaveLength(2);
  return renderToStaticMarkup(
    createElement(ScheduledTransportRow, {
      row: stream.rows[0],
      container: stream.containers[0],
      context: period,
      depth,
      onDepth: () => {},
      facts: value,
    }),
  );
};

it("keeps independent Future Segment Browse sparse and maps both endpoints in Focus", () => {
  const browse = render("FUTURE", "B");
  expect(browse).toContain("Train segment A");
  expect(browse).toContain(t("p5.mode.train"));
  expect(browse).toContain("Origin station");
  expect(browse).toContain("Destination station");
  expect(browse).toContain(t("p5.bookingMarker", { name: "Shared booking" }));
  expect(browse).not.toContain(t("p5.ticket"));
  expect(browse).not.toContain("Related segment B");
  expect(browse).not.toMatch(/connection|transfer gap/i);
  const focus = render("FUTURE", "F");
  expect(focus.match(/View on Map/g)).toHaveLength(2);
  expect(focus).toContain(t("p5.ticket"));
  expect(focus).toContain(t("p5.booking"));
  expect(focus).not.toContain("Related segment B");
  expect(render("FUTURE", "I")).toContain("Related segment B");
});

it("shows one known boarding line in Today Browse and Ticket only after boarding in Focus", () => {
  const browse = render("TODAY", "B");
  expect(browse).toContain(t("p5.platform", { value: "4" }));
  expect(browse).toContain(t("p5.coach", { value: "A" }));
  expect(browse).not.toContain(t("p5.showTicket"));
  const focus = render("TODAY", "F");
  expect(focus.indexOf(t("p5.boarding"))).toBeLessThan(focus.indexOf(t("p5.showTicket")));
  expect(focus).not.toContain(t("p5.chooseTicket"));
  const multiple = render("TODAY", "F", {
    ...facts,
    tickets: [
      ...facts.tickets!,
      { id: "ticket-2", title: "Second eligible Ticket", onOpen: () => {} },
    ],
  });
  expect(multiple).toContain(t("p5.chooseTicket"));
  expect(multiple).not.toContain(t("p5.showTicket"));
  const shared = render("TODAY", "F", {
    ...facts,
    tickets: [{ ...facts.tickets![0], requiresSelection: true }],
  });
  expect(shared).toContain(t("p5.chooseTicket"));
  const repeated = render("TODAY", "F", {
    ...facts,
    tickets: [facts.tickets![0], facts.tickets![0]],
  });
  expect(repeated).toContain(t("p5.showTicket"));
  expect(render("TODAY", "I")).toContain("Related segment B");
});

it("keeps the synthetic platform value separate from its localized label", () => {
  const fixture = scheduledTransportContribution("TODAY");
  const stream = composeDayStream(
    fixture.query!(fixture.selectedDate, fixture.zone),
    fixture.instant,
  );
  const html = renderToStaticMarkup(
    createElement(fixture.renderer!, {
      row: stream.rows[0],
      container: stream.containers[0],
      context: "TODAY",
      depth: "B",
      onDepth: () => {},
    }),
  );
  expect(html).toContain(t("p5.platform", { value: "4" }));
  expect(html).not.toContain("Platform Platform 4");
});

it("retains scheduled Past route, conditional counts, collapsed people and current-Segment photos", () => {
  const browse = render("PAST", "B");
  expect(browse).toContain("Origin station");
  expect(browse).toContain("Destination station");
  expect(browse).toContain(t("p5.photoCount", { count: 4 }));
  expect(browse).not.toContain("data:image/png");
  expect(browse).not.toMatch(/completed|travelled/i);
  const focus = render("PAST", "F", {
    ...facts,
    passengers: [
      ...facts.passengers!,
      { id: "p3", name: "Third" },
      { id: "p4", name: "Fourth" },
    ],
  });
  expect(focus).toContain(t("p5.seat", { value: "12" }));
  expect(focus).toContain(t("p5.morePassengers", { count: 1 }));
  expect(focus).toContain(t("p5.ticketOriginal"));
  expect(focus).toContain(t("p5.booking"));
  expect(focus).toContain(t("p5.expenseCount", { count: 2 }));
  const immersive = render("PAST", "I");
  expect(immersive.match(/data:image\/png/g)).toHaveLength(3);
  expect(immersive).toContain(t("p5.viewAllPhotos"));
  expect(immersive).toContain("22000 NZD");
  expect(immersive).toContain("11000 NZD");
  expect(immersive).toContain("15000 USD");
  expect(immersive).toContain("Shared Booking covers segments A and B");
  expect(immersive).toContain(t("p5.updateFromDocument"));
  expect(immersive).toContain(t("p5.addAttachment"));
});

it("omits unowned private capabilities and refuses imprecise clocks or directions", () => {
  const sparse: ScheduledTransportFacts = {
    family: "P5",
    title: "Sparse bus",
    origin: {
      date: "2027-01-15",
      place: { qualification: "TEXT_ONLY", authoredLabel: "Station" },
    },
    destination: { date: "2027-01-16" },
  };
  const focus = render("TODAY", "F", sparse);
  expect(focus).not.toContain(t("p5.showTicket"));
  expect(focus).not.toContain(t("p5.boarding"));
  expect(focus).not.toContain(t("p5.directions"));
  expect(render("PAST", "I", sparse)).not.toContain(t("p5.total"));
  expect(transportMapUrl(sparse.origin, true)).toBeNull();
  expect(transportMapUrl(sparse.origin, false)).toContain("q=Station");
  expect(
    knownTransportClock({
      quality: "ESTIMATED",
      precision: -1,
      localTime: "09:00:00",
      comparable: false,
    }),
  ).toBe("09:00");
  expect(
    knownTransportClock({
      quality: "EXACT",
      precision: 0,
      localTime: "09:00:00",
      comparable: true,
    }),
  ).toBe("09:00");
});

it("keeps known overnight civil dates beside named Browse endpoints without adding missing clocks", () => {
  const date = (value: string) =>
    formatUiDate(new Date(`${value}T12:00:00Z`), {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  for (const period of ["TODAY", "FUTURE", "PAST"] as const) {
    const overnight = render(period, "B");
    expect(overnight).toContain(`Origin station · ${date("2027-01-15")} · 09:00`);
    expect(overnight).toContain(`Destination station · ${date("2027-01-16")} · 11:00`);
    expect(overnight).not.toContain(t("p5.showTicket"));
    const unknownClock = render(period, "B", {
      ...facts,
      destination: { ...facts.destination, time: undefined },
    });
    expect(unknownClock).toContain(`Destination station · ${date("2027-01-16")}`);
    expect(unknownClock).not.toContain("11:00");
    expect(unknownClock).not.toContain("00:00");
    const sameDay = render(period, "B", {
      ...facts,
      destination: { ...facts.destination, date: facts.origin.date },
    });
    expect(sameDay).toContain("Origin station · 09:00");
    expect(sameDay).toContain("Destination station · 11:00");
    expect(sameDay).not.toContain(date("2027-01-15"));
  }
});

it("preserves known planned endpoint minutes and labels unresolved ordering", () => {
  const value = {
    ...facts,
    origin: { ...facts.origin, time: "09:15", plannedUnresolved: true },
  };
  const html = render("FUTURE", "B", value);
  expect(html).toContain("09:15");
  expect(html).toContain(t("p6.plannedUnresolved"));
});

it("reviewer: unresolved Destination is labelled even when current Origin is comparable", () => {
  const value = {
    ...facts,
    destination: { ...facts.destination, plannedUnresolved: true },
  };
  const html = render("FUTURE", "I", value);
  expect(html).toContain("11:00");
  expect(html).toContain(t("p6.plannedUnresolved"));
});

it("each displayed planned endpoint keeps a natural qualifier in both locales without exposing sort diagnostics", () => {
  const originalLocale = getUiLocale();
  const value = {
    ...facts,
    origin: { ...facts.origin, plannedUnresolved: true },
    destination: { ...facts.destination, plannedUnresolved: true },
  };
  try {
    for (const [locale, caption] of [
      ["en", "Planned local time"],
      ["zh-Hans", "计划当地时间"],
    ] as const) {
      setUiLocale(locale);
      const html = render("FUTURE", "I", value);
      expect(html).toContain("11:00");
      expect(html.split(caption).length).toBeGreaterThanOrEqual(3);
      expect(html).not.toContain("order not yet resolved");
      expect(html).not.toContain("排序依据尚未确定");
    }
  } finally {
    setUiLocale(originalLocale);
  }
});
