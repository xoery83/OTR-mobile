import { expect, it } from "vitest";
import { place, boundary } from "@/features/day-feed-lab/fixtureFacts";
import {
  currentP1Facts,
  distinctP1Count,
  p1ReadClocks,
  p1NoteExcerpt,
  p1InsertionEligible,
  p1FreshEntryFocus,
} from "./p1ReadPresentation";
it("shows the authored floating clock without manufacturing an instant", () => {
  const event = place("p1", "Floating", "2027-01-16");
  event.boundaries = [
    {
      ...boundary("START", "2027-01-16"),
      local_time: "15:00:00",
      clock_precision: 0,
      quality: "EXACT",
    },
  ];
  expect(p1ReadClocks(event).primary).toBe("15:00");
  expect(event.boundaries[0].local_time).toBe("15:00:00");
});
it("retains one cross-day Item, an independent END rail and a display-only day offset", () => {
  const event = place("one", "Overnight", "2027-01-16", "18:00");
  event.boundaries = [event.boundaries[0], boundary("END", "2027-01-17", "08:00")];
  expect(p1ReadClocks(event)).toMatchObject({
    primary: "18:00",
    secondary: "08:00",
    dayOffset: 1,
  });
  expect(p1ReadClocks(event, "END")).toMatchObject({ primary: "08:00", secondary: null });
  expect(event.id).toBe("one");
});
it("rejects stale supplemental facts and counts distinct authorized read IDs only", () => {
  const event = place("one", "Activity", "2027-01-16");
  expect(
    currentP1Facts(event, { itemId: "another", semanticRevision: 1, note: "private" }),
  ).toBeUndefined();
  expect(
    currentP1Facts(event, { itemId: "one", semanticRevision: 2, note: "stale" }),
  ).toBeUndefined();
  expect(distinctP1Count(undefined)).toBe(null);
  expect(distinctP1Count([])).toBe(0);
  expect(distinctP1Count(["a", "a", "b"])).toBe(2);
});
it("bounds Note by Unicode code points, not UTF-16 code units", () => {
  expect(p1NoteExcerpt("🌿".repeat(57))).toBe("🌿".repeat(56) + "…");
  expect(p1NoteExcerpt("Original note")).toBe("Original note");
});
it("insertion is dated START only, allows local civil clocks, never Past or demonstrably-ended Today", () => {
  const event = place("one", "Activity", "2027-01-16", "10:30", "12:00");
  const at = "2027-01-16T12:00:00Z";
  expect(p1InsertionEligible(event, "START", "TODAY", at)).toBe(false);
  expect(p1InsertionEligible(event, "START", "FUTURE", at)).toBe(true);
  expect(p1InsertionEligible(event, "END", "FUTURE", at)).toBe(false);
  expect(p1InsertionEligible(event, "START", "PAST", at)).toBe(false);
  event.status = "cancelled";
  expect(p1InsertionEligible(event, "START", "FUTURE", at)).toBe(false);
  event.status = "planned";
  event.boundaries[0].instant = null;
  event.boundaries[0].source_instant = null;
  expect(p1InsertionEligible(event, "START", "FUTURE", at)).toBe(true);
});

it("fresh direct entry selects a covering interval or next qualified item, excluding pending and floating", () => {
  const ended = place("ended", "Visit", "2027-01-16", "10:30", "12:00");
  const next = place("next", "Studio", "2027-01-16", "13:00");
  expect(p1FreshEntryFocus([ended, next], "2027-01-16T12:00:00Z", new Set())).toBe(
    "next",
  );
  expect(p1FreshEntryFocus([ended, next], "2027-01-16T11:00:00Z", new Set())).toBe(
    "ended",
  );
  expect(
    p1FreshEntryFocus([ended, next], "2027-01-16T12:00:00Z", new Set(["next"])),
  ).toBe(null);
});
