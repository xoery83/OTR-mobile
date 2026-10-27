import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import {
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
  type PersonCloudCreate,
  type PersonCloudCreateReceipt,
} from "../../src/domain/trip/tripPersonCloudCreate";

export type TripPersonCloudCreatePort = {
  create(actor: string, request: PersonCloudCreate): Promise<PersonCloudCreateReceipt>;
  receipt(
    actor: string,
    trip: string,
    operation: string,
  ): Promise<PersonCloudCreateReceipt | null>;
};
export class PersonCloudCreateError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 503,
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

// Auth is resolved by the existing host; every operation still needs current owning SQL permission.
export async function tripPersonCloudCreateBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  port?: TripPersonCloudCreatePort,
) {
  try {
    const url = new URL(request.url);
    const target =
      /^\/v2\/trips\/([^/]+)\/(people|person-create-operations\/([^/]+))$/.exec(
        url.pathname,
      );
    const trip = coreUuid.safeParse(target?.[1]);
    if (!target || !trip.success || !coreUuid.safeParse(actor).success || url.search)
      return failure(400, "PERSON_CREATE_INVALID");
    if (!(await canReadTrip(actor, trip.data)))
      return failure(403, "PERSON_CREATE_FORBIDDEN");
    if (!port) return failure(503, "PERSON_CREATE_CLOSED");
    if (target[2] === "people" && request.method === "POST") {
      const boundary = createRequestBoundary(15000, request.signal);
      let raw: unknown;
      try {
        raw = await readBoundedJson(new Response(request.body), 8192, boundary);
      } catch {
        return failure(400, "PERSON_CREATE_INVALID");
      } finally {
        boundary.close();
      }
      const parsed = personCloudCreateSchema.safeParse(raw);
      if (
        !parsed.success ||
        parsed.data.tripId !== trip.data ||
        request.headers.get("Idempotency-Key") !== parsed.data.operationId
      )
        return failure(400, "PERSON_CREATE_INVALID");
      const result = personCloudCreateReceiptSchema.parse(
        await port.create(actor, parsed.data),
      );
      if (
        result.actorAccountId !== actor ||
        canonicalCoreJson(result.request as unknown as Json) !==
          canonicalCoreJson(parsed.data as unknown as Json)
      )
        return failure(503, "PERSON_CREATE_RESULT_MISMATCH");
      if (!(await canReadTrip(actor, trip.data)))
        return failure(403, "PERSON_CREATE_FORBIDDEN");
      return reply(201, result);
    }
    if (target[3] && request.method === "GET") {
      const operation = coreUuid.safeParse(target[3]);
      if (!operation.success || request.body !== null)
        return failure(400, "PERSON_CREATE_INVALID");
      const found = await port.receipt(actor, trip.data, operation.data);
      if (!(await canReadTrip(actor, trip.data)))
        return failure(403, "PERSON_CREATE_FORBIDDEN");
      if (!found) return failure(404, "PERSON_CREATE_NOT_FOUND");
      const result = personCloudCreateReceiptSchema.parse(found);
      if (
        result.actorAccountId !== actor ||
        result.request.tripId !== trip.data ||
        result.request.operationId !== operation.data
      )
        return failure(503, "PERSON_CREATE_RESULT_MISMATCH");
      return reply(200, result);
    }
    return failure(405, "METHOD_NOT_ALLOWED");
  } catch (error) {
    return error instanceof PersonCloudCreateError
      ? failure(error.status, error.code)
      : failure(503, "PERSON_CREATE_UNAVAILABLE");
  }
}
