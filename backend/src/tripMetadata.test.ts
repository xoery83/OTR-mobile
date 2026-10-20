import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { TripMetadataReceipt } from "../../src/domain/trip/tripMetadataContract";
import { tripMetadataBoundary, TripMetadataError } from "./tripMetadata";
const actor = randomUUID();
const request = {
  operationId: randomUUID(),
  tripId: randomUUID(),
  before: { name: "Old", destination: null, startDate: null, endDate: null },
  after: { name: "New", destination: "Nelson", startDate: "2026-10-16", endDate: null },
};
const post = (body: unknown = request, id = request.operationId) =>
  new Request(`http://localhost/v2/trips/${request.tripId}/metadata`, {
    method: "POST",
    headers: { "Idempotency-Key": id },
    body: JSON.stringify(body),
  });
it("defaults CLOSED, validates exact path/key/schema and returns only actor-bound receipts", async () => {
  expect((await tripMetadataBoundary(post(), actor)).status).toBe(503);
  const result: TripMetadataReceipt = { ...request, actorAccountId: actor };
  const port = { update: vi.fn(async () => result), receipt: vi.fn(async () => result) };
  expect((await tripMetadataBoundary(post(), actor, port)).status).toBe(200);
  expect(port.update).toHaveBeenCalledExactlyOnceWith(actor, request);
  expect(
    (await tripMetadataBoundary(post(request, randomUUID()), actor, port)).status,
  ).toBe(400);
  expect(
    (
      await tripMetadataBoundary(
        post({ ...request, after: { ...request.after, startDate: "2026-02-30" } }),
        actor,
        port,
      )
    ).status,
  ).toBe(400);
  const get = () =>
    new Request(`http://localhost/v2/trip-metadata-operations/${request.operationId}`);
  expect((await tripMetadataBoundary(get(), actor, port)).status).toBe(200);
  port.receipt.mockResolvedValueOnce({ ...result, actorAccountId: randomUUID() });
  expect((await tripMetadataBoundary(get(), actor, port)).status).toBe(503);
  port.update.mockRejectedValueOnce(
    new TripMetadataError(403, "TRIP_METADATA_FORBIDDEN"),
  );
  expect((await tripMetadataBoundary(post(), actor, port)).status).toBe(403);
  port.update.mockRejectedValueOnce(new TripMetadataError(409, "TRIP_METADATA_CONFLICT"));
  expect((await tripMetadataBoundary(post(), actor, port)).status).toBe(409);
  port.update.mockResolvedValueOnce({ ...result, after: request.before });
  expect((await tripMetadataBoundary(post(), actor, port)).status).toBe(503);
});
