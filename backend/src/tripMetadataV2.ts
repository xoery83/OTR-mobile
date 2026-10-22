import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  tripMetadataV2UpdateSchema,
  tripMetadataV2ReceiptSchema,
  tripMetadataV2SnapshotSchema,
  type TripMetadataV2Update,
  type TripMetadataV2Receipt,
  type TripMetadataV2Snapshot,
} from "../../src/domain/trip/tripMetadataV2Contract";
import { TripMetadataError } from "./tripMetadata";
export type TripMetadataV2Port = {
  update(actor: string, request: TripMetadataV2Update): Promise<TripMetadataV2Receipt>;
  receipt(actor: string, operation: string): Promise<TripMetadataV2Receipt | null>;
  snapshot(
    actor: string,
    trip: string,
    operation: string,
  ): Promise<TripMetadataV2Snapshot>;
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Authorization, OTR-Trip-Metadata-Version",
    },
  });
const failure = (status: number, code: string) =>
  reply(status, { error: { code, message: code } });
// Opt-in only. Existing V1 boundary and application startup remain unchanged.
export async function tripMetadataV2Boundary(
  request: Request,
  actor: string,
  port?: TripMetadataV2Port,
) {
  if (!port) return failure(503, "TRIP_METADATA_CLOSED");
  if (request.headers.get("OTR-Trip-Metadata-Version") !== "2")
    return failure(400, "TRIP_METADATA_VERSION_REQUIRED");
  const url = new URL(request.url);
  if (url.search) return failure(400, "TRIP_METADATA_INVALID");
  try {
    const target = /^\/v2\/trips\/([^/]+)\/metadata$/.exec(url.pathname);
    if (target && request.method === "POST") {
      const boundary = createRequestBoundary(15000, request.signal);
      let body: unknown;
      try {
        body = await readBoundedJson(new Response(request.body), 8192, boundary);
      } catch {
        return failure(400, "TRIP_METADATA_INVALID");
      } finally {
        boundary.close();
      }
      const parsed = tripMetadataV2UpdateSchema.safeParse(body);
      if (
        !parsed.success ||
        parsed.data.tripId !== target[1] ||
        request.headers.get("Idempotency-Key") !== parsed.data.operationId
      )
        return failure(400, "TRIP_METADATA_INVALID");
      const result = tripMetadataV2ReceiptSchema.parse(
        await port.update(actor, parsed.data),
      );
      const { actorAccountId, resultMetadataRevision: _revision, ...input } = result;
      if (
        actorAccountId !== actor ||
        canonicalCoreJson(input as Json) !== canonicalCoreJson(parsed.data as Json)
      )
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return reply(200, result);
    }
    if (target && request.method === "GET") {
      const trip = coreUuid.safeParse(target[1]);
      const operation = coreUuid.safeParse(
        request.headers.get("OTR-Metadata-Operation-Id"),
      );
      if (!trip.success || !operation.success || request.body !== null)
        return failure(400, "TRIP_METADATA_INVALID");
      const result = tripMetadataV2SnapshotSchema.parse(
        await port.snapshot(actor, trip.data, operation.data),
      );
      if (result.actorAccountId !== actor || result.tripId !== trip.data)
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return reply(200, result);
    }
    const operation = /^\/v2\/trip-metadata-operations\/([^/]+)$/.exec(url.pathname);
    if (operation && request.method === "GET") {
      const id = coreUuid.safeParse(operation[1]);
      if (!id.success || request.body !== null)
        return failure(400, "TRIP_METADATA_INVALID");
      const found = await port.receipt(actor, id.data);
      if (!found) return failure(404, "TRIP_METADATA_RECEIPT_NOT_FOUND");
      const result = tripMetadataV2ReceiptSchema.parse(found);
      if (result.actorAccountId !== actor || result.operationId !== id.data)
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return reply(200, result);
    }
    return failure(405, "METHOD_NOT_ALLOWED");
  } catch (e) {
    if (e instanceof TripMetadataError) return failure(e.status, e.code);
    return failure(
      503,
      e instanceof z.ZodError
        ? "TRIP_METADATA_RESULT_INVALID"
        : "TRIP_METADATA_UNAVAILABLE",
    );
  }
}
