import { moveDayLineY } from "./p1MoveCursor";
import { expect, it } from "vitest";
import { stayMoveItem, stayMoveProposal } from "./bookingReadPresentation";
import { moveProposalInScope } from "./p1MoveTypes";
const stay = {
  id: "stay",
  title: "Hotel",
  start: "2027-01-16",
  end: "2027-01-19",
  checkinTime: "16:00",
  checkoutTime: "10:00",
};
it("moves each planned Stay boundary independently within its own date", () => {
  const checkin = stayMoveItem(stay, "CHECKIN")!;
  const checkout = stayMoveItem(stay, "CHECKOUT")!;
  expect(checkin.dateScope).toBe("SAME_DAY");
  expect(checkout.date).toBe(stay.end);
  expect(stayMoveProposal(checkin, stay.start, 0)).toEqual({
    status: "READY",
    date: stay.start,
    time: "00:00",
  });
  expect(stayMoveProposal(checkout, stay.end, 1439).time).toBe("23:59");
  expect(stayMoveProposal(checkin, stay.end, 600).status).toBe("UNAVAILABLE");
  expect(
    moveProposalInScope(checkin, { status: "READY", date: stay.end, time: "10:00" }),
  ).toBe(false);
  expect(
    moveProposalInScope(checkin, {
      status: "READY",
      date: stay.start,
      endDate: stay.end,
    }),
  ).toBe(false);
});
it("never arms Daily Base, policy-only or invalid clock boundaries", () => {
  expect(stayMoveItem(stay, "BASE")).toBeUndefined();
  expect(
    stayMoveItem(
      { ...stay, checkinTime: null, permittedCheckin: "15:00–21:00" },
      "CHECKIN",
    ),
  ).toBeUndefined();
  expect(stayMoveItem({ ...stay, checkoutTime: "25:00" }, "CHECKOUT")).toBeUndefined();
  expect(stayMoveProposal(stayMoveItem(stay, "CHECKIN")!, stay.start, 1440).status).toBe(
    "UNAVAILABLE",
  );
});
it("preserves existing P1 cross-date proposals", () => {
  expect(
    moveProposalInScope(
      { availability: "READY", date: stay.start },
      { status: "READY", date: stay.end },
    ),
  ).toBe(true);
});
it("day-use clock suggestions cannot invert the stay interval, and equal endpoints remain legal", () => {
  const dayUse = {
    ...stay,
    end: stay.start,
    checkinTime: "10:00",
    checkoutTime: "12:00",
  };
  const checkin = stayMoveItem(dayUse, "CHECKIN")!,
    checkout = stayMoveItem(dayUse, "CHECKOUT")!;
  expect(stayMoveProposal(checkin, dayUse.start, 13 * 60).status).toBe("UNAVAILABLE");
  expect(stayMoveProposal(checkout, dayUse.end, 9 * 60).status).toBe("UNAVAILABLE");
  expect(stayMoveProposal(checkin, dayUse.start, 12 * 60).status).toBe("READY");
  expect(stayMoveProposal(checkout, dayUse.end, 10 * 60).status).toBe("READY");
});

it("same-day insertion line stays inside its visible day instead of pointing at a different date", () => {
  const regions = [
    { key: "day:2027-01-16", date: "2027-01-16", top: 100, bottom: 200 },
    { key: "row", date: "2027-01-16", top: 200, bottom: 400 },
    { key: "day:2027-01-17", date: "2027-01-17", top: 400, bottom: 500 },
  ];
  expect(moveDayLineY(regions, "2027-01-16", 50)).toBe(200);
  expect(moveDayLineY(regions, "2027-01-16", 300)).toBe(300);
  expect(moveDayLineY(regions, "2027-01-16", 600)).toBe(399);
  expect(moveDayLineY([], "2027-01-16", 300)).toBe(300);
});
