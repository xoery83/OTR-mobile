import { expect, it, vi } from "vitest";
import {
  flightFidelityFixture,
  flightSamples,
  flightFidelityFocusKey,
} from "./flightFidelityFixture";
import {
  flightConnectionMinutes,
  readableDocuments,
  stayInsertionTime,
  stayNights,
} from "@/features/day-feed/bookingReadPresentation";
vi.mock("@/features/day-feed/FlightJourneyView", () => ({ FlightLegRow: () => null }));
const fixture = (id: string) =>
  flightFidelityFixture(id, "today", vi.fn(), vi.fn(), vi.fn());
it("keeps all explicit Journey members in order without merging Booking or adding arrival Items", () => {
  const f = fixture("syn-p2-multi");
  expect(f.journey.legs.map((l) => l.id)).toEqual(
    flightSamples.find((s) => s.id === "syn-p2-multi")!.grouping!.orderedLegIds,
  );
  expect(f.projection.events).toHaveLength(3);
  expect(flightConnectionMinutes(f.journey.legs[0], f.journey.legs[1])).toBe(180);
  expect(f.journey.legs[0].bookingRefs).toEqual(["SYN-M1"]);
  expect(new Set(f.journey.expenseIds).size).toBe(2);
});
it("retains sparse and Floating literals without deriving clocks or instants", () => {
  const sparse = fixture("syn-p2-minimal").journey.legs[0];
  expect(sparse.flight.numberLiteral).toBe("ZZ901");
  expect(sparse.flight.canonical.boundaries[0].local_time).toBeNull();
  const float = fixture("syn-p2-floating").journey.legs[0];
  expect(float.flight.canonical.boundaries[0].local_time).toBe("09:00:00");
  expect(float.flight.canonical.boundaries[0].instant).toBeNull();
  expect(flightConnectionMinutes(float, float)).toBeNull();
});
it("uses only visible leg facts and never treats tickets or parent PNR as leg metadata", () => {
  const f = fixture("syn-p2-access");
  expect(f.journey.legs[0].bookingRefs).toBeUndefined();
  expect(JSON.stringify(f.journey)).not.toContain("PRIVATE");
  expect(f.journey.documents).toEqual([]);
});
it("deduplicates identical Document identities and rejects version or content collisions", () => {
  const a = { id: "a", version: "1", title: "File", contentKey: "one" };
  expect(readableDocuments([[a], [a]])).toEqual([a]);
  expect(readableDocuments([[a], [{ ...a, version: "2" }], [a]])).toEqual([]);
  expect(readableDocuments([[a], [{ ...a, contentKey: "different" }]])).toEqual([]);
  expect(readableDocuments([[{ ...a, onOpen: vi.fn() }], [a]])[0].onOpen).toBeUndefined();
});
it("resolves a later Journey leg to its owning occurrence rather than its item ID", () => {
  const f = fixture("syn-p2-multi"),
    leg = f.journey.legs.at(-1)!;
  const key = flightFidelityFocusKey(f, leg.id);
  expect(key).toBeDefined();
  expect(key).not.toBe(leg.id);
  expect(key).toContain(leg.id);
});
it("applies cross-group document conflicts to Focus as well as Immersive", () => {
  const sample = flightSamples.find((s) => s.id === "syn-p2-full")!;
  const doc = sample.legs[0].documentSummaries![0];
  const original = sample.documentSummaries;
  try {
    sample.documentSummaries = [{ ...doc, contentVersion: 999 }];
    const f = fixture(sample.id);
    expect(f.journey.documents?.some((d) => d.id === doc.id)).toBe(false);
    expect(f.journey.legs[0].documents?.some((d) => d.id === doc.id)).toBe(false);
  } finally {
    sample.documentSummaries = original;
  }
});
it("all frozen P2 scenarios construct a read-only projection", () => {
  for (const sample of flightSamples) {
    const f = fixture(sample.id);
    expect(f.synthetic).toBe(true);
    expect(f.journey.id).toBe(sample.id);
    expect(f.journey.legs.length).toBeGreaterThan(0);
  }
});
it("Stay insertion uses explicit role clocks including midnight, never policy times or Base", () => {
  const stay = {
    id: "stay",
    title: "Stay",
    start: "2027-01-16",
    end: "2027-01-16",
    checkinTime: "00:00",
    checkoutTime: null,
    checkoutBy: "11:00",
  };
  expect(stayNights(stay)).toBe(0);
  expect(stayInsertionTime(stay, "CHECKIN", "TODAY")).toBe("00:00");
  expect(stayInsertionTime(stay, "CHECKOUT", "TODAY")).toBeNull();
  expect(stayInsertionTime(stay, "BASE", "FUTURE")).toBeNull();
  expect(stayInsertionTime(stay, "CHECKIN", "PAST")).toBeNull();
});
