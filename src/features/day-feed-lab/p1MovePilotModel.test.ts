import { expect, it } from "vitest";
import { durationMinutes, moveProposal } from "./p1MovePilotModel";
const item = {
  availability: "AVAILABLE",
  date: "2027-01-16",
  time: "10:30",
  zone: "Pacific/Auckland",
  instant: "2027-01-16T10:30:00+13:00",
  endInstant: "2027-01-16T12:00:00+13:00",
};
it("keeps DST gaps and folds unresolved rather than manufacturing an instant", () => {
  expect(moveProposal(item, "2027-09-26", 150, false, 90, true).status).toBe(
    "UNQUALIFIED_TIME",
  );
  expect(moveProposal(item, "2027-04-04", 150, false, 90, true).status).toBe(
    "UNQUALIFIED_TIME",
  );
  expect(
    moveProposal({ ...item, zone: null }, "2027-01-17", 600, false, 90, true).status,
  ).toBe("UNQUALIFIED_TIME");
});
it("preserves elapsed duration across a DST transition and does not invent an end", () => {
  const result = moveProposal(item, "2027-09-26", 90, false, durationMinutes(item), true);
  expect(result).toMatchObject({
    status: "READY",
    time: "01:30",
    endTime: "04:00",
    durationMinutes: 90,
  });
  const point = moveProposal(
    { ...item, endInstant: null },
    "2027-01-17",
    600,
    false,
    null,
    true,
  );
  expect(point).toMatchObject({ status: "READY", endTime: null, endInstant: null });
});
it("hides clocks for date-only placement while retaining a known duration", () => {
  expect(moveProposal(item, "2027-01-17", 600, true, 90, true)).toMatchObject({
    status: "READY",
    time: null,
    endTime: null,
    durationMinutes: 90,
  });
});
