import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { composeDayStream } from "./composition";
import { ticketedActivityContribution } from "../day-feed-lab/ticketedActivityContribution";
import { TicketedActivityRow, type TicketedActivityFacts } from "./TicketedActivityRow";
import { activityPlannedClock } from "./coreTicketedActivityRenderer";
import { t } from "@/ui/locale";

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
vi.mock("./BookingReadUi", () => ({
  BookingCard: (p: any) => createElement("section", null, p.title, p.children),
  BookingGlyph: (p: any) =>
    createElement(
      "button",
      null,
      p.kind === "detail"
        ? t("p1r.richerDetails")
        : t(p.kind === "navigate" ? "fidelity.navigate" : "fidelity.map"),
    ),
  BookingInsert: () => null,
}));
vi.mock("./ImmersiveActions", () => ({
  ImmersiveActions: () =>
    createElement(
      "div",
      null,
      t("fidelity.addPhoto"),
      t("fidelity.addAttachment"),
      t("fidelity.addExpense"),
      t("fidelity.linkExpense"),
    ),
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/features/ledger/MoneyText", async () => {
  const { createElement } = await import("react");
  return {
    MoneyText: ({ minor, currency }: { minor: number; currency: string }) =>
      createElement("span", null, `${minor} ${currency}`),
  };
});

const facts: TicketedActivityFacts = {
  family: "P6",
  title: "Museum visit",
  start: { date: "2027-01-15", time: "09:00" },
  venue: { qualification: "TEXT_ONLY", authoredLabel: "Museum" },
  entryPlace: { qualification: "TEXT_ONLY", authoredLabel: "Entry gate" },
  requiredArrival: { date: "2027-01-15", time: "08:30", label: "Meet at gate" },
  ownAdmission: { entrance: "2", section: "A", seat: "12" },
  tickets: [
    {
      id: "shared",
      title: "Shared Ticket",
      onOpen: () => {},
      coveredParticipants: ["A", "B"],
    },
  ],
  bookings: [{ id: "booking", title: "Booking confirmation", onOpen: () => {} }],
  participants: [
    { id: "p1", name: "A", seat: "12" },
    { id: "p2", name: "B", seat: "13" },
    { id: "p3", name: "C" },
    { id: "p4", name: "D" },
  ],
  photos: {
    count: 4,
    previews: ["a", "b", "c", "d"].map((id) => ({
      id,
      uri: `data:image/png;base64,${id}`,
    })),
    onViewAll: () => {},
  },
  expenseCount: 2,
  expenseSummary: {
    total: { minor: 22000, currency: "NZD", scale: 2 },
    myShare: { minor: 11000, currency: "NZD", scale: 2 },
    originals: [{ minor: 15000, currency: "USD", scale: 2 }],
  },
  onEdit: () => {},
  onUpdateFromDocument: () => {},
  onEditExpense: () => {},
  onAddPhoto: () => {},
  onAddAttachment: () => {},
  onAddExpense: () => {},
};

const render = (
  period: "FUTURE" | "TODAY" | "PAST" | "TNS",
  depth: "B" | "F" | "I",
  value: TicketedActivityFacts = facts,
) => {
  const fixture = ticketedActivityContribution(period);
  const stream = composeDayStream(
    fixture.query!(fixture.selectedDate, fixture.zone),
    fixture.instant,
  );
  expect(stream.rows).toHaveLength(1);
  return renderToStaticMarkup(
    createElement(TicketedActivityRow, {
      row: stream.rows[0],
      container: stream.containers[0],
      context: period === "TNS" ? "FUTURE" : period,
      depth,
      onDepth: () => {},
      facts: value,
    }),
  );
};

it("prioritizes explicit Today arrival and keeps Ticket out of Browse", () => {
  const browse = render("TODAY", "B");
  expect(browse.indexOf("08:30")).toBeLessThan(browse.indexOf("09:00"));
  expect(browse).toContain(t("p6.entrance", { value: "2" }));
  expect(browse).not.toContain(t("p6.showTicket"));
  const focus = render("TODAY", "F");
  expect(focus.indexOf(t("p6.arrive"))).toBeLessThan(focus.indexOf(t("p6.showTicket")));
  expect(focus).toContain(t("p6.showTicket"));
  expect(focus).not.toContain(t("p6.chooseTicket"));
  const multiple = render("TODAY", "F", {
    ...facts,
    tickets: [
      ...facts.tickets!,
      { id: "other", title: "Other Ticket", onOpen: () => {} },
    ],
  });
  expect(multiple).toContain(t("p6.chooseTicket"));
  expect(
    render("TODAY", "F", {
      ...facts,
      tickets: [{ ...facts.tickets![0], requiresSelection: true }],
    }),
  ).toContain(t("p6.chooseTicket"));
  const immersive = render("TODAY", "I", {
    ...facts,
    tickets: [facts.tickets![0], facts.tickets![0]],
  });
  expect(immersive.match(/Shared Ticket/g)).toHaveLength(1);
  expect(immersive).toContain("22000 NZD");
  expect(immersive).toContain("11000 NZD");
});

it("keeps the synthetic explicit meeting instruction in Today and Future Browse", () => {
  for (const period of ["TODAY", "FUTURE"] as const) {
    const fixture = ticketedActivityContribution(period);
    const stream = composeDayStream(
      fixture.query!(fixture.selectedDate, fixture.zone),
      fixture.instant,
    );
    const html = renderToStaticMarkup(
      createElement(fixture.renderer!, {
        row: stream.rows[0],
        container: stream.containers[0],
        context: period,
        depth: "B",
        onDepth: () => {},
      }),
    );
    expect(html).toContain(t("p6Lab.meet"));
    expect(html.indexOf("08:30")).toBeLessThan(html.indexOf("09:00"));
    expect(html).not.toContain(t("p6.showTicket"));
  }
});

it("keeps Future Booking-only and unresolved planned time truthful", () => {
  const browse = render("FUTURE", "B");
  expect(browse.indexOf("08:30")).toBeLessThan(browse.indexOf("09:00"));
  expect(browse).not.toContain(t("p6.showTicket"));
  const bookingOnly = render("FUTURE", "F", { ...facts, tickets: [] });
  expect(bookingOnly).toContain(t("p6.booking"));
  expect(bookingOnly).not.toContain(t("p6.showTicket"));
  const unresolved = render("TNS", "B", {
    ...facts,
    requiredArrival: undefined,
    start: { date: "2027-01-15", time: "09:00", plannedUnresolved: true },
  });
  expect(unresolved).toContain("09:00");
  expect(unresolved).not.toContain(t("p6.plannedUnresolved"));
  expect(unresolved).not.toContain("Time Not Set");
  expect(
    activityPlannedClock({
      comparable: false,
      localTime: "09:00:00",
      precision: -1,
      quality: "ESTIMATED",
    }),
  ).toEqual({ time: "09:00", plannedUnresolved: true });
  const immersive = render("FUTURE", "I", {
    ...facts,
    documents: [{ id: "instructions", title: "Original instructions", onOpen: () => {} }],
  });
  expect(immersive).toContain(t("p6.documents"));
  expect(immersive).toContain("Shared Ticket");
  const noArrival = render("TODAY", "B", { ...facts, requiredArrival: undefined });
  expect(noArrival).toContain("09:00");
  expect(noArrival).not.toContain(`${t("p6.arrive")} ·`);
});

it("keeps Past scheduled, compact and photo-first without inferring attendance", () => {
  const browse = render("PAST", "B");
  expect(browse.indexOf("09:00")).toBeLessThan(browse.indexOf("08:30"));
  expect(browse).not.toContain(t("p6.photoCount", { count: 4 }));
  expect(browse).not.toContain("data:image/png");
  expect(browse).not.toMatch(/attended|completed/i);
  const entryOnly = render("PAST", "B", {
    ...facts,
    start: { date: "2027-01-15" },
  });
  expect(entryOnly).toContain("08:30");
  expect(entryOnly).toContain("08:30");
  expect(entryOnly).not.toContain(`${t("p6.start")} ·`);
  const focus = render("PAST", "F");
  expect(focus).toContain(t("p6.moreParticipants", { count: 1 }));
  expect(focus).toContain(t("p6.expenseCount", { count: 2 }));
  expect(focus).not.toContain("22000 NZD");
  const immersive = render("PAST", "I");
  expect(immersive.match(/data:image\/png/g)).toHaveLength(3);
  expect(immersive.indexOf("Museum visit")).toBeLessThan(
    immersive.indexOf("data:image/png"),
  );
  expect(immersive).toContain("15000 USD");
  expect(immersive).toContain(t("p6.addAttachment"));
});

it("hides absent original, private, photo and Ledger capabilities", () => {
  const sparse: TicketedActivityFacts = {
    family: "P6",
    title: "Free visit",
    start: { date: "2027-01-15" },
    venue: { qualification: "TEXT_ONLY", authoredLabel: "Museum" },
  };
  const focus = render("TODAY", "F", sparse);
  expect(focus).not.toContain(t("p6.showTicket"));
  expect(focus).not.toContain(t("p6.seat", { value: "12" }));
  expect(focus).not.toContain(t("p6.directions"));
  const immersive = render("PAST", "I", sparse);
  expect(immersive).not.toContain(t("p6.total"));
  expect(immersive).not.toContain(t("p6.viewAllPhotos"));
});
