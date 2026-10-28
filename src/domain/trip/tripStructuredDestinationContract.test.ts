import { expect, it } from "vitest";
import {
  structuredTripCreateRequestSchema,
  structuredTripMetadataUpdateSchema,
} from "./tripStructuredDestinationContract";
import { tripCreateWireRequestSchema } from "./tripCreateWireContract";
import { tripCreateRequestSchema } from "./tripCreateContract";
import { tripMetadataUpdateSchema } from "./tripMetadataContract";
const id = "10000000-0000-4000-8000-000000000001",
  op = "10000000-0000-4000-8000-000000000002";
const d = {
  destinationId: "10000000-0000-4000-8000-000000000003",
  displayLabel: "Auckland",
  source: "MANUAL" as const,
};
const meta = { name: "New", destination: null, startDate: null, endDate: null };
it("explicit new versions keep structured ordered identities and never upgrade scalar pending", () => {
  const legacy = { operationId: op, tripId: id, ...meta };
  expect(tripCreateWireRequestSchema.parse(legacy)).toEqual(legacy);
  const request = { ...legacy, formatVersion: 2, destinations: [d] };
  expect(structuredTripCreateRequestSchema.parse(request)).toEqual(request);
  expect(tripCreateRequestSchema.safeParse(request).success).toBe(false);
  const update = {
    formatVersion: 3,
    operationId: op,
    tripId: id,
    expectedMetadataRevision: 0,
    before: { ...meta, destinations: [d] },
    after: { ...meta, destinations: [] },
  };
  expect(structuredTripMetadataUpdateSchema.parse(update)).toEqual(update);
  expect(tripMetadataUpdateSchema.safeParse(update).success).toBe(false);
});
it("refuses scalar flattening duplicate claims/IDs and private/provider extras", () => {
  for (const destinations of [
    [d, d],
    [d, { ...d, destinationId: op, displayLabel: "ＡＵＣＫＬＡＮＤ" }],
    [{ ...d, rawProviderJSON: "private" }],
  ])
    expect(
      structuredTripCreateRequestSchema.safeParse({
        ...meta,
        operationId: op,
        tripId: id,
        formatVersion: 2,
        destinations,
      }).success,
    ).toBe(false);
  expect(
    structuredTripCreateRequestSchema.safeParse({
      ...meta,
      destination: "flattened",
      operationId: op,
      tripId: id,
      formatVersion: 2,
      destinations: [d],
    }).success,
  ).toBe(false);
});
