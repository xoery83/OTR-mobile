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

it("keeps pickup and return date-specific and shows known Future return context", () => {
  const future = render("FUTURE", "B");
  expect(future).toContain("Booked SUV class");
  expect(future).toContain(
    t("p4.returnSummaryTimePlace", {
      date: "Jan 18, 2027",
      time: "11:00",
      place: "Return depot",
    }),
  );
  expect(future).not.toContain("PLATE-1");
  expect(render("FUTURE", "F")).toContain(t("p4.viewMap"));
  expect(rentalContribution("FUTURE").query!("2027-01-16", "UTC").coreRows).toEqual([]);
  expect(row("FUTURE", "2027-01-18").coreRowKeys[0].projectionRole).toBe("RETURN");
});

it("does not present estimated or unresolved Core clocks as firm rental times", () => {
  expect(
    knownRentalClock({
      comparable: false,
      quality: "ESTIMATED",
      precision: 0,
      localTime: "09:00:00",
    }),
  ).toBeUndefined();
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
  expect(today).toContain(t("p4.plate", { value: "PLATE-1" }));
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
  expect(focus.match(/Directions/g)).toHaveLength(1);
});

it("keeps Past Browse sparse and reveals only supplied linked content deeper", () => {
  const browse = render("PAST", "B");
  expect(browse).toContain(t("p4.photoCount", { count: 4 }));
  expect(browse).not.toContain(t("p4.expenseCount", { count: 2 }));
  expect(browse).not.toContain("20000 NZD");
  const focus = render("PAST", "F");
  expect(focus).toContain(t("p4.expenseCount", { count: 2 }));
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
