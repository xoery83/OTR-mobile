import { createHash } from "node:crypto";
import { z } from "zod";
import {
  sourcePngPreparationCommandSchema,
  sourcePngPendingReplySchema,
} from "../../src/domain/trip/sourcePngPreparationCommands";
import { sourceBinaryOriginalReceiptSchema } from "../../src/domain/trip/sourceBinaryOriginalCommands";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { parseCoreJson } from "../../src/domain/trip/tripCoreV2Json";

type Command = z.infer<typeof sourcePngPreparationCommandSchema>;
type Scope = { actorId: string; tripId: string; signal: AbortSignal };
export type SourcePngPreparationPort = {
  lookup(scope: Scope, command: Command): Promise<unknown | null>;
  execute(scope: Scope, command: Command, bytes?: Uint8Array): Promise<unknown>;
  reconcile(scope: Scope, command: Command): Promise<unknown>;
};
export type SourcePngPreparationForRequest = (
  request: Request,
  actor: string,
) => Promise<
  | {
      port: SourcePngPreparationPort;
      close(): void;
    }
  | undefined
>;
const inputSchema = z.strictObject({
  command: sourcePngPreparationCommandSchema,
  originalBase64: z
    .string()
    .min(4)
    .max(1398104)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .optional(),
});
const finalReply = sourceBinaryOriginalReceiptSchema.extend({
  command: z.enum(["PREPARE_REPRESENTATION", "UPLOAD_ORIGINAL", "VERIFY_REPRESENTATION"]),
});

// Parent authenticates the bearer; only the owning Source port can issue a receipt.
export async function sourcePngPreparationBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  prepareForRequest?: SourcePngPreparationForRequest,
) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const route =
    /^\/v2\/trips\/([^/]+)\/universal-source-originals\/png\/(result|execute|reconcile)$/.exec(
      url.pathname,
    );
  if (!route || url.search || !z.uuid().safeParse(route[1]).success)
    return fail(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  const boundary = createRequestBoundary(90000, request.signal);
  let scoped: Awaited<ReturnType<SourcePngPreparationForRequest>>;
  try {
    const authorize = async () => {
      boundary.assertCurrent();
      if (!z.uuid().safeParse(actor).success || !(await canReadTrip(actor, route[1])))
        throw Error("SOURCE_ACCESS_DENIED");
      boundary.assertCurrent();
    };
    await authorize();
    scoped = await boundary.run(async () => {
      const current = await prepareForRequest?.(request, actor);
      try {
        boundary.assertCurrent();
      } catch (error) {
        current?.close();
        throw error;
      }
      return current;
    });
    if (!scoped) return fail(503, "SOURCE_CAPABILITY_CLOSED");
    if (
      request.headers.get("content-type") !== "application/json" ||
      request.headers.has("content-encoding")
    )
      return fail(422, "INVALID_SOURCE_COMMAND");
    const input = inputSchema.parse(
      await readBoundedJson(new Response(request.body), 1500000, boundary, (text) =>
        parseCoreJson(text, 1500000),
      ),
    );
    const q = input.command;
    if (q.actor_account_id !== actor || q.trip_id !== route[1])
      return fail(403, "SOURCE_ACCESS_DENIED");
    let bytes: Uint8Array | undefined;
    if (input.originalBase64 !== undefined) {
      if (route[2] !== "execute" || q.command !== "UPLOAD_ORIGINAL")
        return fail(422, "INVALID_SOURCE_COMMAND");
      bytes = Uint8Array.from(Buffer.from(input.originalBase64, "base64"));
      if (
        !bytes.length ||
        bytes.length > 1048576 ||
        Buffer.from(bytes).toString("base64") !== input.originalBase64 ||
        bytes.length !== q.payload.byte_count ||
        createHash("sha256").update(bytes).digest("hex") !== q.payload.payload_sha256
      )
        return fail(422, "SOURCE_INTEGRITY_FAILURE");
    } else if (route[2] === "execute" && q.command === "UPLOAD_ORIGINAL")
      return fail(422, "PNG_ORIGINAL_REQUIRED");
    await authorize();
    const scope = { actorId: actor, tripId: route[1], signal: boundary.signal };
    const port = scoped.port;
    const raw = await boundary.run(() =>
      route[2] === "result"
        ? port.lookup(scope, q)
        : route[2] === "execute"
          ? port.execute(scope, q, bytes)
          : port.reconcile(scope, q),
    );
    await authorize();
    if (raw === null)
      return route[2] === "result"
        ? reply(200, null)
        : fail(503, "SOURCE_IO_UNAVAILABLE");
    const result = sourcePngPendingReplySchema.or(finalReply).parse(raw);
    if (
      result.operation_id !== q.operation_id ||
      result.operation_key !== q.operation_key ||
      result.operation_sha256 !== q.operation_sha256 ||
      ("source_id" in result &&
        (result.source_id !== q.source_id ||
          result.representation_id !== q.payload.representation_id ||
          result.command !== q.command))
    )
      throw Error("SOURCE_IO_UNAVAILABLE");
    return reply(200, result);
  } catch (error) {
    if (error instanceof RequestBoundaryError)
      return fail(error.code === "BODY_LIMIT" ? 413 : 503, "SOURCE_REQUEST_UNCONFIRMED");
    if (error instanceof z.ZodError) return fail(422, "INVALID_SOURCE_COMMAND");
    const code = error instanceof Error ? error.message : "";
    if (code === "SOURCE_ACCESS_DENIED") return fail(403, code);
    if (code === "SOURCE_CAPABILITY_CLOSED") return fail(503, code);
    // Static diagnostics only: never log a PG message, command, image, token or actor.
    try {
      const sqlState =
        error && typeof error === "object" && "code" in error ? error.code : "";
      console.info(
        JSON.stringify({
          event: "source_png_preparation_failed",
          action: route[2],
          reason: [
            "CORE_CONNECTION_BUSY",
            "CORE_CONNECTION_TIMEOUT",
            "CORE_CONNECTION_RETIRED",
            "SOURCE_PRINCIPAL_UNAVAILABLE",
            "PNG_SCOPE_DENIED",
            "PNG_SCOPE_CLOSED",
            "PNG_OPERATION_DENIED",
            "PNG_SOURCE_BINDING_MISMATCH",
            "PNG_SOURCE_RECEIPT_MISMATCH",
            "PNG_SOURCE_PERMIT_INVALID",
            "PNG_SOURCE_OPERATION_UNAVAILABLE",
            "SOURCE_IO_UNAVAILABLE",
            "SOURCE_ATTEMPT_CONFLICT",
            "SOURCE_OPERATION_IMMUTABLE",
            "SOURCE_PHASE_CONFLICT",
            "SOURCE_RESULT_INTEGRITY",
            "TRIP_SOURCE_COMMANDS_DISABLED",
            "UNIVERSAL_SOURCE_COMMAND_DENIED",
            "INVALID_SOURCE_COMMAND",
            "OPERATION_ID_REUSED",
            "OPERATION_KEY_REUSED",
            "PRIOR_STATE_CONFLICT",
            "REPRESENTATION_CAS_CONFLICT",
            "SOURCE_CAS_CONFLICT",
            "SOURCE_NOT_AVAILABLE",
            "PNG_OPERATION_SCOPE_MISMATCH",
            "PDF_RECEIPT_READ_ONLY",
            "PNG_RECEIPT_READ_ONLY",
          ].includes(code)
            ? code
            : "UNCLASSIFIED",
          errorKind:
            error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
              ? error.name
              : "OTHER",
          sqlState: [
            "42501",
            "P0001",
            "25P03",
            "57014",
            "53300",
            "42703",
            "42883",
            "42P01",
            "23505",
          ].includes(String(sqlState))
            ? String(sqlState)
            : undefined,
        }),
      );
    } catch {
      // Diagnostics cannot change the existing error response or cleanup.
    }
    return fail(503, "SOURCE_IO_UNAVAILABLE");
  } finally {
    scoped?.close();
    boundary.close();
  }
}
