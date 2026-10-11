import { createHash } from "node:crypto";
import { flightCommandLeaves } from "../../../src/domain/trip/flightAdmission";
import { UNKNOWN_FLIGHT_TIME } from "../../../src/domain/trip/referenceFlightExtractor";
import {
  fieldRef,
  type CoreCandidatePublicationV2,
  type CorePublicationMaterial,
  type CoreAirportBinding,
} from "../tripCoreV2CandidatePublication";
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
export async function publicationFixture(fraction = false) {
  const lines = [
      "NZ1 AKL→CHC 2026-12-17 depInstant=2026-12-16T20:00:00Z",
      "NZ2 CHC→AKL 2026-12-20 depInstant=2026-12-19T20:00:00Z",
    ].map((line) => (fraction ? line.replace(/Z$/, ".120000Z") : line)),
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
          source_instant_precision: fraction ? 6 : 0,
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
