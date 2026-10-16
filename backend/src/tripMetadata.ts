import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  tripMetadataUpdateSchema,
  tripMetadataReceiptSchema,
  type TripMetadataUpdate,
  type TripMetadataReceipt,
} from "../../src/domain/trip/tripMetadataContract";

// Owning implementation must atomically recheck organizer rights, CAS and durable idempotent receipt.
export type TripMetadataPort = {
  update(
    actorAccountId: string,
    request: TripMetadataUpdate,
  ): Promise<TripMetadataReceipt>;
  receipt(
    actorAccountId: string,
    operationId: string,
  ): Promise<TripMetadataReceipt | null>;
};
export class TripMetadataError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
const failure = (status: number, code: string) =>
  reply(status, { error: { code, message: code } });
export async function tripMetadataBoundary(
  request: Request,
  actorAccountId: string,
  port?: TripMetadataPort,
) {
  const url = new URL(request.url);
  if (url.search) return failure(400, "TRIP_METADATA_INVALID");
  if (!port) return failure(503, "TRIP_METADATA_CLOSED");
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
      const parsed = tripMetadataUpdateSchema.safeParse(body);
      if (
        !parsed.success ||
        parsed.data.tripId !== target[1] ||
        request.headers.get("Idempotency-Key") !== parsed.data.operationId
      )
        return failure(400, "TRIP_METADATA_INVALID");
      const result = tripMetadataReceiptSchema.parse(
        await port.update(actorAccountId, parsed.data),
      );
      const { actorAccountId: actor, ...requestPart } = result;
      if (
        actor !== actorAccountId ||
        canonicalCoreJson(requestPart as Json) !== canonicalCoreJson(parsed.data as Json)
      )
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return reply(200, result);
    }
    const match = /^\/v2\/trip-metadata-operations\/([^/]+)$/.exec(url.pathname);
    if (match && request.method === "GET") {
      const id = coreUuid.safeParse(match[1]);
      if (!id.success || request.body !== null)
        return failure(400, "TRIP_METADATA_INVALID");
      const receipt = await port.receipt(actorAccountId, id.data);
      if (!receipt) return failure(404, "TRIP_METADATA_RECEIPT_NOT_FOUND");
      const result = tripMetadataReceiptSchema.parse(receipt);
      if (result.actorAccountId !== actorAccountId || result.operationId !== id.data)
        throw new TripMetadataError(503, "TRIP_METADATA_RESULT_MISMATCH");
      return reply(200, result);
    }
    return failure(405, "METHOD_NOT_ALLOWED");
  } catch (error) {
    if (error instanceof TripMetadataError) return failure(error.status, error.code);
    if (error instanceof z.ZodError) return failure(503, "TRIP_METADATA_RESULT_INVALID");
    return failure(503, "TRIP_METADATA_UNAVAILABLE");
  }
}
