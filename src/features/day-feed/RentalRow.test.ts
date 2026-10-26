import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { composeDayStream } from "./composition";
import { rentalContribution } from "../day-feed-lab/rentalContribution";
import { RentalRow, rentalMapUrl, type RentalFacts } from "./RentalRow";
import { knownRentalClock } from "./coreRentalRenderer";
import { t } from "@/ui/locale";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
vi.mock("./DayFeedShell", () => ({
  formatDayFeedVisibleDates: (r: { first: string; last: string }) =>
    `${r.first}–${r.last}`,
}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
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

const row = (
  temporalCase: "FUTURE" | "TODAY" | "TODAY_RETURN" | "PAST",
  date = "2027-01-15",
) => {
  const fixture = rentalContribution(temporalCase);
  const query = fixture.query!(date, fixture.zone);
  return composeDayStream(query, fixture.instant).rows[0];
};
const facts: RentalFacts = {
  family: "P4",
  pickup: {
    date: "2027-01-15",
    time: "09:00",
    place: { qualification: "TEXT_ONLY", authoredLabel: "Pickup depot" },
  },
  return: {
    date: "2027-01-18",
    time: "11:00",
    place: { qualification: "TEXT_ONLY", authoredLabel: "Return depot" },
  },
  bookedClass: "Booked SUV class",
  actualModel: "Actual model",
  plate: "PLATE-1",
  holder: "Authorized holder",
  reference: "REF-1",
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
    total: { minor: 20000, currency: "NZD", scale: 2 },
    billingDays: 4,
    perDay: { minor: 5000, currency: "NZD", scale: 2 },
    originals: [{ minor: 12000, currency: "USD", scale: 2 }],
    myShare: { minor: 10000, currency: "NZD", scale: 2 },
    myPerDay: { minor: 2500, currency: "NZD", scale: 2 },
  },
};
const render = (
  temporalCase: "FUTURE" | "TODAY" | "TODAY_RETURN" | "PAST",
  depth: "B" | "F" | "I",
  date?: string,
  value: RentalFacts = facts,
) =>
  renderToStaticMarkup(
    createElement(RentalRow, {
      row: row(temporalCase, date),
      container: undefined,
      context: temporalCase === "TODAY_RETURN" ? "TODAY" : temporalCase,
      depth,
      onDepth: () => {},
      facts: value,
    }),
  );

it("uses final Future Browse: actual identity, independent role and current endpoint only", () => {
  const future = render("FUTURE", "B");
  expect(future).toContain("Actual model · PLATE-1");
  expect(future).toContain("Pickup depot");
  expect(future).not.toContain("Booked SUV class");
  expect(future).not.toContain("Authorized holder");
  expect(future).not.toContain("Return depot");
  expect(render("FUTURE", "F")).toContain("Pickup depot");
  expect(rentalContribution("FUTURE").query!("2027-01-16", "UTC").coreRows).toEqual([]);
  expect(row("FUTURE", "2027-01-18").coreRowKeys[0].projectionRole).toBe("RETURN");
});

it("preserves authored estimated clocks while rejecting unknown clocks", () => {
  expect(
    knownRentalClock({
      comparable: false,
      quality: "ESTIMATED",
      precision: -1,
      localTime: "09:00:00",
    }),
  ).toBe("09:00");
  expect(
    knownRentalClock({
      comparable: false,
      quality: "UNKNOWN",
      precision: 0,
      localTime: "09:00:00",
    }),
  ).toBeUndefined();
  expect(
    knownRentalClock({
      comparable: true,
      quality: "EXACT",
      precision: 0,
      localTime: "09:00:00",
    }),
  ).toBe("09:00");
});

it("shows only supplied operational facts and exact-location Directions on Today", () => {
  const today = render("TODAY", "F", "2027-01-18");
  expect(today).toContain(t("p4.holder", { name: "Authorized holder" }));
  expect(today).toContain("PLATE-1");
  expect(today).toContain(t("p4.reference", { value: "REF-1" }));
  expect(rentalMapUrl(facts.return!, true)).toBeNull();
  expect(
    rentalMapUrl(
      {
        date: "2027-01-18",
        place: { qualification: "TEXT_ONLY", acceptedAddress: "2 Real Road, Auckland" },
      },
      true,
    ),
  ).toContain("daddr=2%20Real%20Road%2C%20Auckland");
  const unknown = render("TODAY", "F", "2027-01-18", {
    family: "P4",
    pickup: facts.pickup,
    return: facts.return,
  });
  expect(unknown).not.toContain("PLATE-1");
  expect(unknown).not.toContain("REF-1");
});

it("keeps the dated Today return distinct from pickup", () => {
  const fixture = rentalContribution("TODAY_RETURN");
  const stream = composeDayStream(
    fixture.query!(fixture.selectedDate, fixture.zone),
    fixture.instant,
  );
  expect(stream.context).toBe("TODAY");
  expect(stream.rows).toHaveLength(2);
  expect(
    stream.rows.every((item) => item.coreRowKeys[0].projectionRole === "RETURN"),
  ).toBe(true);
  const withAddresses: RentalFacts = {
    ...facts,
    pickup: {
      ...facts.pickup,
      place: { qualification: "TEXT_ONLY", acceptedAddress: "Pickup address" },
    },
    return: {
      ...facts.return!,
      place: { qualification: "TEXT_ONLY", acceptedAddress: "Return address" },
    },
  };
  const focus = render("TODAY_RETURN", "F", "2027-01-18", withAddresses);
  expect(focus).toContain("Return address");
  expect(focus).not.toContain("Pickup address");
});

it("keeps Past Browse sparse and reveals only supplied linked content deeper", () => {
  const browse = render("PAST", "B");
  expect(browse).not.toContain(t("p4.photoCount", { count: 4 }));
  expect(browse).not.toContain("Pickup depot");
  expect(browse).not.toContain("Return depot");
  expect(browse).not.toContain("Authorized holder");
  expect(browse).not.toContain("Booked SUV class");
  expect(browse).not.toContain(t("p4.expenseCount", { count: 2 }));
  expect(browse).not.toContain("20000 NZD");
  const focus = render("PAST", "F");
  expect(focus).toContain(t("fidelity.expenses", { count: 2 }));
  expect(focus).not.toContain("20000 NZD");
  const immersive = render("PAST", "I");
  expect(immersive).toContain("20000 NZD");
  expect(immersive).toContain("10000 NZD");
  expect(immersive).toContain("5000 NZD");
  expect(immersive).toContain(t("p4.viewAllPhotos"));
  expect(immersive.match(/data:image\/png/g)).toHaveLength(3);
});

it("hides per-day amounts without owning billing-day evidence", () => {
  const expenseSummary = { ...facts.expenseSummary!, billingDays: undefined };
  const immersive = render("PAST", "I", undefined, { ...facts, expenseSummary });
  expect(immersive).toContain("20000 NZD");
  expect(immersive).not.toContain("5000 NZD");
  expect(immersive).not.toContain("2500 NZD");
});

it("does not show an unpaired My Share per-day amount", () => {
  const expenseSummary = { ...facts.expenseSummary!, myShare: undefined };
  const immersive = render("PAST", "I", undefined, { ...facts, expenseSummary });
  expect(immersive).toContain("20000 NZD");
  expect(immersive).not.toContain("2500 NZD");
});

it("preserves authored floating minutes without a timezone warning", () => {
  const value = {
    ...facts,
    pickup: { ...facts.pickup, time: "09:15", plannedUnresolved: true },
  };
  const html = render("FUTURE", "B", undefined, value);
  expect(html).toContain("09:15");
  expect(html).not.toContain(t("p6.plannedUnresolved"));
});

it("preserves authored Return minutes without inventing temporal qualification", () => {
  const value = { ...facts, return: { ...facts.return!, plannedUnresolved: true } };
  const html = render("FUTURE", "I", undefined, value);
  expect(html).toContain("11:00");
  expect(html).not.toContain(t("p6.plannedUnresolved"));
});

it.each(["FUTURE", "TODAY", "PAST"] as const)(
  "renders all three %s depths without inventing missing modules",
  (context) => {
    for (const depth of ["B", "F", "I"] as const) {
      const html = render(context, depth, undefined, {
        family: "P4",
        pickup: facts.pickup,
      });
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("20000 NZD");
      expect(html).not.toContain("Authorized holder");
    }
  },
);
it("keeps Link existing ahead of Add expense in Immersive", () => {
  const html = render("TODAY", "I");
  expect(html.indexOf(t("fidelity.linkExpense"))).toBeLessThan(
    html.indexOf(t("fidelity.addExpense")),
  );
});

it("retains endpoint name and address in active Browse and supplied contact text in its own Immersive group", () => {
  const value: RentalFacts = {
    ...facts,
    contactText: "Synthetic rental desk +64 00 000",
    call: vi.fn(),
    pickup: {
      ...facts.pickup,
      place: {
        qualification: "TEXT_ONLY",
        authoredLabel: "Pickup depot",
        authoredAddress: "18 Synthetic Road",
      },
    },
  };
  const browse = render("FUTURE", "B", undefined, value);
  expect(browse).toContain("Pickup depot · 18 Synthetic Road");
  const detail = render("TODAY", "I", undefined, value);
  expect(detail).toContain(value.contactText);
  expect(detail).toContain(t("p4.bookedClass", { value: value.bookedClass }));
  expect(render("PAST", "I", undefined, value)).not.toContain(value.contactText);
});
