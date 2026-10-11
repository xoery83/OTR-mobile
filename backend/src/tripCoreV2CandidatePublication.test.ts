import { expect, it } from "vitest";
import { extractCoreFlightPublication } from "./tripCoreV2CandidatePublication";
import {
  publicationFixture,
  publicationTestHash,
  publicationTestAirport,
} from "./__fixtures__/tripCoreV2CandidatePublication";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const publish = async (
  f: Awaited<ReturnType<typeof publicationFixture>>,
  resolver = publicationTestAirport,
) =>
  extractCoreFlightPublication(
    f.request,
    f.materials,
    id(1),
    id(2),
    publicationTestHash,
    resolver,
  );
it("independently verifies two return Flights with exact bytes, locators and date-bound registry", async () => {
  const result = await publish(await publicationFixture());
  expect(result.sealed.map((c) => c.status)).toEqual(["QUALIFIED", "QUALIFIED"]);
  expect(result.sealed[0].identityFacts).toMatchObject({
    originAirportId: "IATA_AIRPORT:AKL",
    destinationAirportId: "IATA_AIRPORT:CHC",
    originDate: "2026-12-17",
  });
  expect(result.verification.complete).toBe(true);
  expect(result.sealed[0].candidate.facts.origin?.location.accepted_place_id).toBeNull();
});
it("does not qualify syntax without owning airport authority", async () => {
  const f = await publicationFixture();
  const r = await extractCoreFlightPublication(
    f.request,
    f.materials,
    id(1),
    id(2),
    publicationTestHash,
    async () => null,
  );
  expect(
    r.sealed.every((c) => c.status === "REVIEW" && c.errorCode === "UNRESOLVED_IDENTITY"),
  ).toBe(true);
});
it("rejects expired or transplanted registry assignments", async () => {
  const r = await publish(await publicationFixture(), async (code) => ({
    ...(await publicationTestAirport(code)),
    validUntil: "2026-01-01",
  }));
  expect(r.sealed.every((c) => c.status === "REVIEW")).toBe(true);
});
it("preserves an independent qualified sibling when the other has edited or transplanted evidence", async () => {
  const f = await publicationFixture();
  f.request.evidence.find(
    (e) => e.candidateId === id(10) && e.fieldKey === "ORIGIN.authored_label",
  )!.locator.start!++;
  const r = await publish(f);
  expect(r.sealed.map((c) => c.status)).toEqual(["REVIEW", "QUALIFIED"]);
});
it("rejects user edits instead of reclassifying them SOURCE", async () => {
  const f = await publicationFixture();
  f.request.candidates[0].facts.origin!.time.local_date = "2026-12-18";
  const r = await publish(f);
  expect(r.sealed[0].errorCode).toBe("INVALID_PROVENANCE");
  expect(r.sealed[1].status).toBe("QUALIFIED");
});
it("fences omitted observations and change notices from the complete Source", async () => {
  const f = await publicationFixture();
  f.materials[0].text += "\nChange: NZ1 moved to another date";
  f.materials[0].pin.byte_count = new TextEncoder().encode(f.materials[0].text).length;
  f.materials[0].pin.payload_sha256 = await publicationTestHash(
    new TextEncoder().encode(f.materials[0].text),
  );
  const r = await publish(f);
  expect(r.sealed.every((c) => c.status === "REVIEW")).toBe(true);
});
it("cannot drop a leg from publication", async () => {
  const f = await publicationFixture();
  f.request.candidates.pop();
  f.request.evidence = f.request.evidence.filter((e) => e.candidateId === id(10));
  const r = await publish(f);
  expect(r.sealed[0].errorCode).toBe("INCOMPLETE_SOURCE_EVIDENCE");
});
it("fences Account/Trip and exact byte integrity", async () => {
  const f = await publicationFixture();
  await expect(
    extractCoreFlightPublication(
      f.request,
      f.materials,
      id(9),
      id(2),
      publicationTestHash,
      publicationTestAirport,
    ),
  ).rejects.toThrow("IMPORT_SCOPE_MISMATCH");
  f.materials[0].text += "x";
  await expect(publish(f)).rejects.toThrow("SOURCE_INTEGRITY_FAILURE");
});
it("does not turn storage failures into ordinary REVIEW", async () => {
  await expect(
    publish(await publicationFixture(), async () => {
      throw new Error("SQL_CONNECTION_LOST");
    }),
  ).rejects.toThrow("SQL_CONNECTION_LOST");
});
