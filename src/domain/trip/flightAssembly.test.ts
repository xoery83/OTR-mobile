import { expect, it } from "vitest";
import { assembleFlightDocuments } from "./flightAssembly";
import { parseReferenceFlightText } from "./referenceFlightExtractor";
const doc = (inputId: string, text: string, pinned = false) => ({
  inputId,
  text,
  parsed: parseReferenceFlightText(inputId, text),
  ...(pinned ? { originalSha256: "a".repeat(64), originalByteCount: 100 } : {}),
});
const table = (
  from: string,
  to: string,
  date: string,
  dep = "9:00 AM",
  arr = "10:35 AM",
) =>
  `${from} to ${to}\nDeparture\n${dep}\n${date}\n${from}\n${from === "Auckland" ? "AKL" : "NSN"}\nArrival\n${arr}\n${date}\n${to}\n${to === "Auckland" ? "AKL" : "NSN"}`;
const booking = `Air New Zealand\nYou're all booked to fly AB 123 on Mon\n14 Dec 2030, reference AB12CD\nYour flights\n${table("Auckland", "Nelson", "14 Dec 2030")}\n${table("Nelson", "Auckland", "22 Dec 2030")}`;
it("assembles three real-shape observations into two proposed legs under one evidenced booking relation", () => {
  const a = assembleFlightDocuments([doc("one", booking)]);
  expect(a.contentBlocks).toHaveLength(3);
  expect(a.segments).toHaveLength(2);
  expect(a.bookingGroups).toHaveLength(1);
  expect(a.bookingGroups[0].segmentIds).toHaveLength(2);
  expect(a.segments[0].fields.find((f) => f.path === "service")?.raw).toBe("AB 123");
  expect(a.segments[0].associationPending).toBe(true);
  expect(a.segments[1].readiness.decision).toBe("NEEDS_REVIEW");
  expect(a.segments[1].readiness.missingFields).toContain("service");
  expect(a.grantsAdmission).toBe(false);
  expect(a.bookingGroups[0].canonicalId).toBeNull();
});
it("never borrows a service when two same-date table legs match the header", () => {
  const a = assembleFlightDocuments([
    doc(
      "one",
      booking.replace("22 Dec 2030", "14 Dec 2030").replace("22 Dec 2030", "14 Dec 2030"),
    ),
  ]);
  expect(a.segments).toHaveLength(3);
  expect(a.links).toHaveLength(0);
});
it("keeps two explicit booking references separate within one input", () => {
  const a = assembleFlightDocuments([
    doc(
      "one",
      booking +
        "\n" +
        booking
          .replaceAll("AB12CD", "CD34EF")
          .replaceAll("14 Dec 2030", "15 Dec 2030")
          .replaceAll("22 Dec 2030", "23 Dec 2030"),
    ),
  ]);
  expect(a.bookingGroups).toHaveLength(2);
  expect(
    a.bookingGroups[0].segmentIds.every(
      (id) => !a.bookingGroups[1].segmentIds.includes(id),
    ),
  ).toBe(true);
});
it("supports a proposed shared booking reference across inputs without merging return legs", () => {
  const a = assembleFlightDocuments([
    doc(
      "one",
      `Air New Zealand\nBooking reference: AB12CD\nAB123 route=AKL -> NSN date=2030-12-14`,
    ),
    doc(
      "two",
      `Air New Zealand\nBooking reference: AB12CD\nAB124 route=NSN -> AKL date=2030-12-22`,
    ),
  ]);
  expect(a.bookingGroups).toHaveLength(1);
  expect(a.bookingGroups[0].segmentIds).toHaveLength(2);
  expect(a.segments).toHaveLength(2);
});
it("does not require a reference or infer a booking from a shared file", () => {
  const a = assembleFlightDocuments([
    doc(
      "one",
      "AB123 route=AKL -> NSN date=2030-12-14\nAB124 route=NSN -> AKL date=2030-12-22",
    ),
  ]);
  expect(a.segments).toHaveLength(2);
  expect(a.bookingGroups).toHaveLength(0);
});
it("deduplicates only exact pinned repeated original observations and retains both inputs' evidence", () => {
  const text = "AB123 route=AKL -> NSN date=2030-12-14";
  const a = assembleFlightDocuments([doc("one", text, true), doc("two", text, true)]);
  expect(a.segments).toHaveLength(1);
  expect(a.segments[0].inputIds).toEqual(["one", "two"]);
  expect(
    assembleFlightDocuments([doc("one", text), doc("two", text)]).segments,
  ).toHaveLength(2);
});
it("retains missing dates and airport conflicts as actionable partial structures", () => {
  const a = assembleFlightDocuments([
    doc("one", "AB123 route=AKL -> NSN route=AKL -> CHC"),
  ]);
  expect(a.segments[0].readiness.decision).toBe("CONFLICT");
  expect(a.segments[0].readiness.conflictingFields).toContain("destination.airport");
});
it.each(["", "Hotel confirmation\nNo flights"])(
  "does not fabricate flight structure for %s",
  (text) => {
    const a = assembleFlightDocuments([doc("one", text)]);
    expect(a.segments).toHaveLength(0);
    expect(a.bookingGroups).toHaveLength(0);
    expect(a.emptyDecision?.decision).toBe("NO_FLIGHT_INFORMATION");
  },
);
it("rejects forged evidence spans without a model or canonical writer", () => {
  const d = doc("one", "AB123");
  d.parsed.items[0].fields[1].raw = "AB999";
  expect(() => assembleFlightDocuments([d])).toThrow("ASSEMBLY_EVIDENCE_INVALID");
});
