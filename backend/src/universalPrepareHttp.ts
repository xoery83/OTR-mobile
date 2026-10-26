import { ZodError } from "zod";
import {
  universalBatchPrepareSchema,
  universalBatchPreparedSchema,
} from "../../src/data/api/universalImportContracts";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { parseEventJson } from "../../src/domain/trip/eventIntentJson";
// Explicit authenticated preparation; owning Source/Task qualifies pins. HTTP never awaits Provider.
export async function universalPrepareBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  prepare?: (trip: string, input: unknown) => Promise<unknown>,
) {
  const reply = (status: number, body: unknown) =>
      Response.json(body, {
        status,
        headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
      }),
    failure = (status: number, code: string) =>
      reply(status, { error: { code, message: code } }),
    url = new URL(request.url);
  if (request.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");
  const boundary = createRequestBoundary(30000, request.signal);
  try {
    let parsed: unknown;
    try {
      parsed = await readBoundedJson(
        new Response(request.body),
        65536,
        boundary,
        (text) => parseEventJson(text, 65536),
      );
    } catch (error) {
      if (error instanceof RequestBoundaryError) throw error;
      return failure(400, "INVALID_REQUEST");
    }
    const input = universalBatchPrepareSchema.parse(parsed);
    if (
      url.pathname !== `/v2/import-batches/${input.batchId}/interpretations/prepare` ||
      url.search ||
      request.headers.get("Idempotency-Key") !== input.batchId
    )
      return failure(400, "INVALID_REQUEST");
    if (!(await canReadTrip(actor, input.tripId)))
      return failure(404, "TRIP_READ_FORBIDDEN");
    if (!prepare) return failure(503, "UNIVERSAL_IMPORT_CLOSED");
    const result = universalBatchPreparedSchema.parse(await prepare(input.tripId, input));
    if (
      result.context.accountId !== actor ||
      result.context.actorId !== actor ||
      result.context.tripId !== input.tripId ||
      result.context.batchId !== input.batchId
    )
      return failure(503, "UNIVERSAL_CONTEXT_MISMATCH");
    return reply(202, result);
  } catch (error) {
    if (error instanceof RequestBoundaryError)
      return failure(error.code === "BODY_LIMIT" ? 413 : 400, error.code);
    if (error instanceof ZodError) return failure(400, "INVALID_REQUEST");
    return failure(503, "UNIVERSAL_PREPARATION_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
