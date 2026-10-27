import { expect, it } from "vitest";
import { localStayMoveItem, localStayPresentation } from "./localStayPresentation";
const item = {
  itemId: "stay",
  family: "P3",
  itemRevision: 1,
  tripId: "trip",
  title: "Hotel",
  status: "planned",
  hidden: false,
  schedule: {
    start: { localDate: "2026-10-25", localTime: "16:00", comparable: false },
    end: { localDate: "2026-10-28", localTime: "10:00", comparable: false },
  },
  details: {},
  participation: { mode: "WHOLE_GROUP", personIds: [] },
  documentSummaries: [],
  localState: "PENDING",
} as any;
it("retains actual civil clocks and pending status without creating a zone or instant", () => {
  expect(localStayPresentation(item)).toMatchObject({
    checkinTime: "16:00",
    checkoutTime: "10:00",
    pending: true,
  });
  expect(localStayMoveItem(item, "CHECKIN")).toMatchObject({
    dateScope: "SAME_DAY",
    date: "2026-10-25",
    time: "16:00",
  });
  expect(localStayMoveItem(item, "BASE")).toBeUndefined();
  expect(localStayMoveItem({ ...item, family: "P2" }, "CHECKIN")).toBeUndefined();
});
it.each(["start", "end"])(
  "refuses named-zone, resolved instant or qualified %s boundaries instead of dropping DST authority",
  (side) => {
    for (const qualification of [
      { zoneId: "America/New_York" },
      { instant: "2026-11-01T05:30:00Z" },
      { comparable: true },
      { quality: "EXACT" },
    ]) {
      const qualified = {
        ...item,
        schedule: {
          ...item.schedule,
          [side]: { ...item.schedule[side], ...qualification },
        },
      };
      expect(localStayMoveItem(qualified, "CHECKIN")).toBeUndefined();
      expect(localStayMoveItem(qualified, "CHECKOUT")).toBeUndefined();
    }
  },
);
it("uses visible booking references without inventing guests from participants", () => {
  expect(
    localStayPresentation({
      ...item,
      bookingSummaries: [
        { id: "visible", revision: 2, title: "Reservation", confirmation_code: "REF" },
        { id: "invalid", revision: 0, confirmation_code: "HIDDEN" },
      ],
    })?.bookings,
  ).toEqual([{ id: "visible", title: "Reservation", reference: "REF" }]);
});
it("shows an address once while retaining a distinct place name", () => {
  const place = { authoredLabel: "90 Federal St ", acceptedAddress: "90 Federal St" };
  expect(localStayPresentation({ ...item, place })).toMatchObject({
    address: "90 Federal St",
    placeName: undefined,
  });
  expect(
    localStayPresentation({ ...item, place: { ...place, authoredLabel: "The Grand" } }),
  ).toMatchObject({ placeName: "The Grand", address: "90 Federal St" });
});
