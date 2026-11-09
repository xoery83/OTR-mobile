import { z, ZodError } from "zod";
import { OriginalBytesRequired, universalRetainedOriginalPrepareSchema } from "./universalRetainedOriginalPreparation";
import {
  universalBatchPrepareSchema,
  UNIVERSAL_PREPARE_MAX_BODY_BYTES,
  universalTaskResumeSchema,
  universalBatchPreparedSchema,
} from "../../src/data/api/universalImportContracts";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { parseEventJson } from "../../src/domain/trip/eventIntentJson";
// The existing continuous server path. Only a verified owning context can schedule a wake.
export async function prepareUniversalQueuedRuntime(
  actor: string,
  trip: string,
  input: unknown,
  ports: {
    resume(trip: string, batch: string, task: string): Promise<unknown>;
    prepare(trip: string, input: unknown): Promise<unknown>;
    drainTargeted(batch: string, task: string): Promise<unknown>;
  },
) {
  const resume = universalTaskResumeSchema.safeParse(input);
  const result = universalBatchPreparedSchema.parse(
    resume.success
      ? {
          status: "EXISTING",
          context: await ports.resume(trip, resume.data.batchId, resume.data.taskId),
        }
      : await ports.prepare(trip, input),
  );
  if (
    (resume.success &&
      (result.context.taskId !== resume.data.taskId ||
        result.context.batchId !== resume.data.batchId)) ||
    result.context.actorId !== actor ||
    result.context.accountId !== actor ||
    result.context.tripId !== trip
  )
    throw Error("UNIVERSAL_CONTEXT_MISMATCH");
  setImmediate(() => {
    void ports
      .drainTargeted(result.context.batchId, result.context.taskId)
      .catch(() => console.info("UNIVERSAL_TARGETED_WAKE_FAILED"));
  });
  return result;
}

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
        UNIVERSAL_PREPARE_MAX_BODY_BYTES,
        boundary,
        (text) => parseEventJson(text, UNIVERSAL_PREPARE_MAX_BODY_BYTES),
      );
    } catch (error) {
      if (error instanceof RequestBoundaryError) throw error;
      return failure(400, "INVALID_REQUEST");
    }
    const input = z
      .union([
        universalBatchPrepareSchema,
        universalRetainedOriginalPrepareSchema,
        universalTaskResumeSchema,
      ])
      .parse(parsed);
    const resume = "version" in input;
    if (
      url.pathname !== `/v2/import-batches/${input.batchId}/interpretations/prepare` ||
      url.search ||
      request.headers.get("Idempotency-Key") !== (resume ? input.taskId : input.batchId)
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
      result.context.batchId !== input.batchId ||
      (resume && (result.context.taskId !== input.taskId || result.status !== "EXISTING"))
    )
      return failure(503, "UNIVERSAL_CONTEXT_MISMATCH");
    return reply(202, result);
  } catch (error) {
    if (error instanceof RequestBoundaryError)
      return failure(error.code === "BODY_LIMIT" ? 413 : 400, error.code);
    if (error instanceof OriginalBytesRequired)
      return reply(409, { error: {
        code: error.message,
        message: error.message,
        details: { inputId: error.inputId },
      } });
    if (error instanceof ZodError) return failure(400, "INVALID_REQUEST");
    return failure(503, "UNIVERSAL_PREPARATION_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
