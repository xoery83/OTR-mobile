import { expect, it } from "vitest";
import { applyFlightLookup, flightLookupKnownFields } from "./flightEnrichmentDraft";
import { emptyFlightSegment } from "./manualFlightFormFields";
import {
  requestSchema,
  type FlightEnrichmentResponse,
} from "@/domain/intelligence/flightEnrichmentContracts";
const request = requestSchema.parse({
  version: "otr-flight-enrichment/1",
  requestId: "r",
  idempotencyKey: "r",
  mode: "CREATE",
  draft: { id: "segment", revision: 1 },
  flightNumber: "NZ501",
  departureLocalDate: "2026-10-27",
});
const value = () => ({
  ...emptyFlightSegment("segment", "2026-10-27"),
  flightNumberLiteral: "NZ501",
});
function response(changes = {}) {
  return {
    version: request.version,
    requestId: request.requestId,
    mode: request.mode,
    draft: request.draft,
    query: {
      flightNumber: request.flightNumber,
      departureLocalDate: request.departureLocalDate,
    },
    status: "PARTIAL",
    candidates: [],
    references: [],
    suggestions: [
      {
        field: "departureAirport",
        value: "AKL",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
    ],
    ...changes,
  } as unknown as FlightEnrichmentResponse;
}
it("adopts only supported empty fields into the draft with pinned airport timezone", () => {
  expect(applyFlightLookup(response(), request, value())).toMatchObject({
    originCode: "AKL",
    originName: "Auckland International Airport",
    departureZone: "Pacific/Auckland",
    departureTime: "12:00",
  });
  expect(value().originCode).toBe("");
});
it("preserves entered values and ignores stale, ambiguous and conflicting evidence", () => {
  expect(
    applyFlightLookup(response(), request, {
      ...value(),
      departureTime: "14:00",
      originCode: "CHC",
    }),
  ).toEqual({});
  expect(
    applyFlightLookup(
      response({ draft: { id: "segment", revision: 0 } }),
      request,
      value(),
    ),
  ).toBeNull();
  expect(
    applyFlightLookup(response({ candidates: [{}, {}] }), request, value()),
  ).toBeNull();
  expect(
    applyFlightLookup(
      response({ references: [{ reason: "IDENTITY_CONFLICT" }] }),
      request,
      value(),
    ),
  ).toBeNull();
});
it("sends existing endpoint facts so the server can identify material conflicts", () => {
  expect(
    flightLookupKnownFields({
      ...value(),
      originCode: "CHC",
      departureTime: "12:00",
      departureZone: "Pacific/Auckland",
    }),
  ).toMatchObject({
    departureAirport: "CHC",
    departureLocalTime: "12:00",
    departureTimezone: "Pacific/Auckland",
  });
});
it("never overwrites an entered zone while adopting an airport", () => {
  expect(
    applyFlightLookup(response(), request, { ...value(), departureZone: "Asia/Tokyo" }),
  ).toBeNull();
  expect(
    applyFlightLookup(response(), request, {
      ...value(),
      departureZone: "Pacific/Auckland",
    }),
  ).not.toHaveProperty("departureZone");
});
