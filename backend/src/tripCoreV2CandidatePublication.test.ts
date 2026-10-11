import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { flightCommandLeaves } from "../../src/domain/trip/flightAdmission";
import { UNKNOWN_FLIGHT_TIME } from "../../src/domain/trip/referenceFlightExtractor";
import {
  extractCoreFlightPublication,
  fieldRef,
  type CoreCandidatePublicationV2,
  type CorePublicationMaterial,
  type CoreAirportBinding,
} from "./tripCoreV2CandidatePublication";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const publicationTestHash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const publicationTestAirport = async (
  code: string,
): Promise<CoreAirportBinding> => ({
  namespace: "IATA_AIRPORT",
  issuer: "IATA",
  code,
  identityId: "IATA_AIRPORT:" + code,
  registryVersion: "synthetic/1",
  registrySha256: "d".repeat(64),
  validFrom: "2020-01-01",
  validUntil: "2030-12-31",
});
export async function publicationFixture() {
  const lines = [
      "NZ1 AKL→CHC 2026-12-17 depInstant=2026-12-16T20:00:00Z",
      "NZ2 CHC→AKL 2026-12-20 depInstant=2026-12-19T20:00:00Z",
    ],
    text = lines.join("\n");
  const material: CorePublicationMaterial = {
    pin: {
      id: id(4),
      source_id: id(3),
      material_revision: 1,
      representation_id: id(5),
      payload_sha256: await publicationTestHash(new TextEncoder().encode(text)),
      byte_count: new TextEncoder().encode(text).length,
      observed_source_row_revision: 1,
      historical_selection: false,
    },
    media_type: "text/plain",
    form: "TEXT",
    text,
  };
  const evidence: CoreCandidatePublicationV2["evidence"] = [];
  const candidates: CoreCandidatePublicationV2["candidates"] = lines.map((line, i) => {
    const [literal, route, day, instant] = line.split(" "),
      [origin, destination] = route.split("→"),
      candidateId = id(10 + i);
    const service = {
      service_key: "service",
      transport_subtype: "FLIGHT" as const,
      attribution: "UNSPECIFIED" as const,
      operator_namespace: "IATA_AIRLINE" as const,
      operator_issuer: "IATA",
      operator_value: "NZ",
      operator_literal: "NZ",
      service_number: String(i + 1),
      service_literal: literal,
      codeshare_operating_key: null,
    };
    const facts = {
      flightNumberLiteral: literal,
      departureDate: day,
      origin: {
        time: {
          ...UNKNOWN_FLIGHT_TIME,
          local_date: day,
          quality: "EXACT" as const,
          basis: "SOURCE_INSTANT" as const,
          supplied_offset_seconds: 0,
          source_instant: instant.split("=")[1],
          source_instant_precision: 0,
        },
        location: {
          authored_label: origin,
          authored_text: null,
          accepted_place_id: null,
        },
      },
      destination: {
        time: UNKNOWN_FLIGHT_TIME,
        location: {
          authored_label: destination,
          authored_text: null,
          accepted_place_id: null,
        },
      },
      services: [service],
    };
    const leaves = {
      flightNumberLiteral: literal,
      departureDate: day,
      ...flightCommandLeaves(facts),
    };
    for (const key of Object.keys(leaves)) {
      const raw =
        key.startsWith("SERVICE.") || key === "flightNumberLiteral"
          ? literal
          : key === "departureDate" || key === "ORIGIN.local_date"
            ? day
            : key.endsWith("authored_label")
              ? route
              : instant;
      const start = text.indexOf(line) + line.indexOf(raw);
      evidence.push({
        candidateId,
        fieldKey: key,
        inputId: material.pin.id,
        locator: {
          input_id: material.pin.id,
          kind: "TEXT_SPAN",
          page: null,
          region: null,
          start: new TextEncoder().encode(text.slice(0, start)).length,
          end: new TextEncoder().encode(text.slice(0, start + raw.length)).length,
        },
      });
    }
    return {
      schemaId: "otr.trip.capture.candidate/2",
      candidateId,
      accountId: id(1),
      tripId: id(2),
      sourceId: id(3),
      sourceRevision: 1,
      runId: id(6),
      inputRepresentationIds: [id(5)],
      kind: "P2",
      facts,
      fieldKnowledge: Object.fromEntries(
        Object.keys(leaves).map((k) => [k, "PRESENT" as const]),
      ),
      fieldEvidence: Object.fromEntries(
        Object.keys(leaves).map((k) => [k, [fieldRef(candidateId, k)]]),
      ),
      existingTargetHint: null,
      unmappedObservations: [],
    };
  });
  const request: CoreCandidatePublicationV2 = {
    publicationVersion: 2,
    publicationId: id(7),
    sourceId: id(3),
    sourceRevision: 1,
    runId: id(6),
    inputCatalogSha256: "a".repeat(64),
    candidates,
    evidence,
  };
  return { request, materials: [material] };
}
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
