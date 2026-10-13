import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  tripCreateRequestSchema,
  tripCreateResultSchema,
  type TripCreateRequest,
  type TripCreateResult,
} from "../../src/domain/trip/tripCreateContract";

export type TripCreatePort = {
  create(actorAccountId: string, request: TripCreateRequest): Promise<TripCreateResult>;
  receipt(actorAccountId: string, operationId: string): Promise<TripCreateResult | null>;
};
export class TripCreateError extends Error {
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

export async function tripCreateBoundary(
  request: Request,
  actorAccountId: string,
  port?: TripCreatePort,
) {
  const url = new URL(request.url);
  if (url.search) return failure(400, "TRIP_CREATE_INVALID");
  if (!port) return failure(503, "TRIP_CREATE_CLOSED");
  try {
    if (url.pathname === "/v2/trips" && request.method === "POST") {
      const boundary = createRequestBoundary(15000, request.signal);
      let body: unknown;
      try {
        body = await readBoundedJson(new Response(request.body), 2048, boundary);
      } catch {
        return failure(400, "TRIP_CREATE_INVALID");
      } finally {
        boundary.close();
      }
      const parsed = tripCreateRequestSchema.safeParse(body);
      if (
        !parsed.success ||
        request.headers.get("Idempotency-Key") !== parsed.data.operationId
      )
        return failure(400, "TRIP_CREATE_INVALID");
      const result = tripCreateResultSchema.parse(
        await port.create(actorAccountId, parsed.data),
      );
      if (
        result.actorAccountId !== actorAccountId ||
        result.operationId !== parsed.data.operationId ||
        result.tripId !== parsed.data.tripId ||
        result.name !== parsed.data.name ||
        result.destination !== parsed.data.destination ||
        result.startDate !== parsed.data.startDate ||
        result.endDate !== parsed.data.endDate
      )
        throw new TripCreateError(503, "TRIP_CREATE_RESULT_MISMATCH");
      return reply(201, result);
    }
    const match = /^\/v2\/trip-create-operations\/([^/]+)$/.exec(url.pathname);
    if (match && request.method === "GET") {
      const parsed = coreUuid.safeParse(match[1]);
      if (!parsed.success || request.body !== null)
        return failure(400, "TRIP_CREATE_INVALID");
      const result = await port.receipt(actorAccountId, parsed.data);
      if (!result) return failure(404, "TRIP_CREATE_RECEIPT_NOT_FOUND");
      const checked = tripCreateResultSchema.parse(result);
      if (
        checked.actorAccountId !== actorAccountId ||
        checked.operationId !== parsed.data
      )
        throw new TripCreateError(503, "TRIP_CREATE_RESULT_MISMATCH");
      return reply(200, checked);
    }
    return failure(405, "METHOD_NOT_ALLOWED");
  } catch (error) {
    if (error instanceof TripCreateError) return failure(error.status, error.code);
    if (error instanceof z.ZodError) return failure(503, "TRIP_CREATE_RESULT_INVALID");
    return failure(503, "TRIP_CREATE_UNAVAILABLE");
  }
}
