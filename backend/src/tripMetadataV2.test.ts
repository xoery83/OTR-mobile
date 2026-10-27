import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripMetadataV2Boundary, type TripMetadataV2Port } from "./tripMetadataV2";
import { tripMetadataUpdateSchema } from "../../src/domain/trip/tripMetadataContract";
import { tripMetadataV2UpdateSchema } from "../../src/domain/trip/tripMetadataV2Contract";
const actor = randomUUID(),
  tripId = randomUUID(),
  operationId = randomUUID();
const before = { name: "Before", destination: null, startDate: null, endDate: null };
const input = {
  formatVersion: 2 as const,
  operationId,
  tripId,
  before,
  after: { ...before, name: "After" },
  expectedMetadataRevision: 7,
};
const result = { ...input, actorAccountId: actor, resultMetadataRevision: 8 };
const snapshot = {
  formatVersion: 2 as const,
  actorAccountId: actor,
  tripId,
  metadataRevision: 7,
  metadata: before,
};
function port(): TripMetadataV2Port {
  return {
    update: vi.fn(async () => result),
    receipt: vi.fn(async () => result),
    snapshot: vi.fn(async () => snapshot),
  };
}
function request(
  body: unknown = input,
  headers = { "OTR-Trip-Metadata-Version": "2", "Idempotency-Key": operationId },
) {
  return new Request(`http://unit/v2/trips/${tripId}/metadata`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}
it("V1 stays strict; V2 requires an actual safe revision and does not upgrade old payloads", () => {
  const { formatVersion: _v, expectedMetadataRevision: _r, ...old } = input;
  expect(tripMetadataUpdateSchema.safeParse(old).success).toBe(true);
  expect(tripMetadataUpdateSchema.safeParse(input).success).toBe(false);
  expect(tripMetadataV2UpdateSchema.safeParse(old).success).toBe(false);
  expect(
    tripMetadataV2UpdateSchema.safeParse({
      ...input,
      expectedMetadataRevision: Number.MAX_SAFE_INTEGER + 1,
    }).success,
  ).toBe(false);
});
it("default CLOSED and wrong explicit version cannot dispatch", async () => {
  expect((await tripMetadataV2Boundary(request(), actor)).status).toBe(503);
  const p = port();
  expect(
    (
      await tripMetadataV2Boundary(
        request(input, { "Idempotency-Key": operationId } as never),
        actor,
        p,
      )
    ).status,
  ).toBe(400);
  expect(p.update).not.toHaveBeenCalled();
});
it("qualifies exact V2 update and immutable result reader through existing routes", async () => {
  const p = port();
  const response = await tripMetadataV2Boundary(request(), actor, p);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(p.update).toHaveBeenCalledWith(actor, input);
  const read = await tripMetadataV2Boundary(
    new Request(`http://unit/v2/trip-metadata-operations/${operationId}`, {
      headers: { "OTR-Trip-Metadata-Version": "2" },
    }),
    actor,
    p,
  );
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual(result);
});
it("reads only the bound trip and operation snapshot; missing scope cannot read", async () => {
  const p = port(),
    url = `http://unit/v2/trips/${tripId}/metadata`;
  expect(
    (
      await tripMetadataV2Boundary(
        new Request(url, { headers: { "OTR-Trip-Metadata-Version": "2" } }),
        actor,
        p,
      )
    ).status,
  ).toBe(400);
  const res = await tripMetadataV2Boundary(
    new Request(url, {
      headers: {
        "OTR-Trip-Metadata-Version": "2",
        "OTR-Metadata-Operation-Id": operationId,
      },
    }),
    actor,
    p,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(snapshot);
});
it.each([
  { ...input, extra: "booking" },
  { ...input, tripId: randomUUID() },
  { ...input, expectedMetadataRevision: -1 },
])("rejects malformed body without a mutation", async (body) => {
  const p = port();
  expect((await tripMetadataV2Boundary(request(body), actor, p)).status).toBe(400);
  expect(p.update).not.toHaveBeenCalled();
});
it("does not accept a changed server receipt or forged revision", async () => {
  const p = port();
  vi.mocked(p.update).mockResolvedValueOnce({
    ...result,
    after: { ...input.after, name: "Different" },
  });
  expect((await tripMetadataV2Boundary(request(), actor, p)).status).toBe(503);
  vi.mocked(p.update).mockResolvedValueOnce({ ...result, resultMetadataRevision: 10 });
  expect((await tripMetadataV2Boundary(request(), actor, p)).status).toBe(503);
});

it("V3 keeps ordered destination fields and requires the matching explicit header", async () => {
  const d = {
    destinationId: randomUUID(),
    displayLabel: "Auckland",
    source: "MANUAL" as const,
  };
  const before3 = { ...before, destinations: [d] };
  const input3 = {
    ...input,
    formatVersion: 3 as const,
    before: before3,
    after: { ...before3, destinations: [] },
  };
  const result3 = { ...input3, actorAccountId: actor, resultMetadataRevision: 8 };
  const p: TripMetadataV2Port = {
    update: vi.fn(async () => result3),
    receipt: vi.fn(async () => result3),
    snapshot: vi.fn(async () => ({
      ...snapshot,
      formatVersion: 3 as const,
      metadata: before3,
    })),
  };
  const headers = { "OTR-Trip-Metadata-Version": "3", "Idempotency-Key": operationId };
  expect((await tripMetadataV2Boundary(request(input3, headers), actor, p)).status).toBe(
    200,
  );
  expect((await tripMetadataV2Boundary(request(input3), actor, p)).status).toBe(400);
  const read = await tripMetadataV2Boundary(
    new Request(`http://unit/v2/trips/${tripId}/metadata`, {
      headers: {
        "OTR-Trip-Metadata-Version": "3",
        "OTR-Metadata-Operation-Id": operationId,
      },
    }),
    actor,
    p,
  );
  expect(read.status).toBe(200);
  expect((await read.json()).metadata.destinations).toEqual([d]);
});
