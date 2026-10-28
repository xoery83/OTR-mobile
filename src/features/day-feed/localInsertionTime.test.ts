import { expect, it } from "vitest";
import { localInsertionTime } from "./localInsertionTime";
const date = "2027-01-16";
function read() {
  return {
    items: [
      {
        itemId: "plan",
        family: "P1",
        schedule: {
          start: { localDate: date, localTime: "09:00" },
          end: { localDate: date, localTime: "09:30" },
        },
      },
    ],
    rows: () => [
      {
        itemRef: "plan",
        family: "P1",
        position: "TNS",
        rowKey: { projectionRole: "START" },
        displayTime: { localDate: date, localTime: "09:00" },
      },
      {
        itemRef: "stay",
        family: "P3",
        position: "TNS",
        rowKey: { projectionRole: "CHECKIN" },
        displayTime: { localDate: date, localTime: "10:00" },
      },
      {
        itemRef: "stay",
        family: "P3",
        position: "TNS",
        rowKey: { projectionRole: "CHECKOUT" },
        displayTime: { localDate: date, localTime: "13:00" },
      },
      {
        itemRef: "base",
        family: "P3",
        position: "BASE",
        rowKey: { projectionRole: "TONIGHT" },
      },
    ],
  } as any;
}
it("uses the selected Stay role clock and the existing 70-minute advisory defaults", () => {
  expect(localInsertionTime(read(), "stay", "CHECKIN", date, "BEFORE").startTime).toBe(
    "09:45",
  );
  expect(localInsertionTime(read(), "stay", "CHECKIN", date, "AFTER").startTime).toBe(
    "10:50",
  );
  expect(localInsertionTime(read(), "stay", "CHECKOUT", date, "BEFORE").startTime).toBe(
    "12:00",
  );
  expect(
    localInsertionTime(read(), "base", "TONIGHT", date, "AFTER").startTime,
  ).toBeNull();
});
